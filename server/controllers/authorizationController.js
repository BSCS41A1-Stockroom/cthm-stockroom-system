"use strict";

const crypto = require("node:crypto");
const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { notifyRoles, notifyUser } = require("../utils/notifications");
const generateBorrowerForm = require("../generateBorrowerForm");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

function decodeSignature(value) {
  const match = IMAGE.exec(String(value ?? ""));
  if (!match) return null;
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 262144) return null;
  const png = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data.at(-2) === 0xff && data.at(-1) === 0xd9;
  if ((match[1] === "image/png" && !png) || (match[1] === "image/jpeg" && !jpeg)) return null;
  return { mimeType: match[1], data, imageHash: hash(data) };
}

async function getMySignature(req, res, next) {
  try {
    const result = await pool.query(`SELECT image_data,mime_type,updated_at FROM public.professor_signatures WHERE professor_user_id=$1`, [req.user.id]);
    const row = result.rows[0];
    return res.json({ configured: Boolean(row), updatedAt: row?.updated_at ?? null,
      image: row ? `data:${row.mime_type};base64,${row.image_data.toString("base64")}` : null });
  } catch (error) { return next(error); }
}

async function saveMySignature(req, res, next) {
  const signature = decodeSignature(req.body?.image);
  if (!signature) return res.status(422).json({ error: "INVALID_SIGNATURE", message: "Upload a valid PNG or JPEG signature no larger than 256 KB." });
  try {
    await pool.query(`INSERT INTO public.professor_signatures (professor_user_id,image_data,mime_type,image_hash,updated_at)
      VALUES ($1,$2,$3,$4,now()) ON CONFLICT (professor_user_id) DO UPDATE SET image_data=excluded.image_data,mime_type=excluded.mime_type,image_hash=excluded.image_hash,updated_at=now()`,
      [req.user.id, signature.data, signature.mimeType, signature.imageHash]);
    return res.json({ configured: true, imageHash: signature.imageHash });
  } catch (error) { return next(error); }
}

async function loadReview(token, userId) {
  return pool.query(`SELECT authorization.review_token,authorization.status AS authorization_status,authorization.authorized_at,
      authorization.professor_name,request.id,request.student_name,request.student_id,request.borrow_date,request.return_date,
      request.purpose,request.status,profile.full_name AS current_professor_name,
      EXISTS(SELECT 1 FROM public.professor_signatures signature WHERE signature.professor_user_id=$2) AS signature_configured,
      (SELECT image_data FROM public.professor_signatures signature WHERE signature.professor_user_id=$2) AS current_signature,
      (SELECT mime_type FROM public.professor_signatures signature WHERE signature.professor_user_id=$2) AS current_signature_mime,
      COALESCE(json_agg(json_build_object('inventoryId',item.inventory_id,'name',inventory.item_name,'quantity',item.quantity)
        ORDER BY item.inventory_id) FILTER (WHERE item.inventory_id IS NOT NULL),'[]'::json) AS items
    FROM public.borrow_request_authorizations authorization
    JOIN public.borrow_requests request ON request.id=authorization.request_id
    LEFT JOIN public.borrow_request_items item ON item.request_id=request.id
    LEFT JOIN public.inventory inventory ON inventory.id=item.inventory_id
    JOIN public.profiles profile ON profile.user_id=$2
    WHERE authorization.review_token=$1 GROUP BY authorization.review_token,authorization.status,authorization.authorized_at,
      authorization.professor_name,request.id,profile.full_name`, [token, userId]);
}

async function getAuthorizationReview(req, res, next) {
  if (!UUID.test(req.params.token)) return res.status(400).json({ error: "INVALID_REVIEW_LINK", message: "This authorization link is invalid." });
  try {
    const result = await loadReview(req.params.token, req.user.id);
    if (!result.rowCount) return res.status(404).json({ error: "REVIEW_NOT_FOUND", message: "This authorization request was not found." });
    const review = result.rows[0];
    review.signature_preview = review.current_signature
      ? `data:${review.current_signature_mime};base64,${review.current_signature.toString("base64")}` : null;
    delete review.current_signature;
    delete review.current_signature_mime;
    return res.json({ review });
  } catch (error) { return next(error); }
}

async function authorizeRequest(req, res, next) {
  if (!UUID.test(req.params.token)) return res.status(400).json({ error: "INVALID_REVIEW_LINK", message: "This authorization link is invalid." });
  if (req.body?.confirmed !== true) return res.status(422).json({ error: "CONFIRMATION_REQUIRED", message: "Confirm that you reviewed and authorize this request." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const record = await client.query(`SELECT authorization.*,request.status AS request_status,request.user_id,request.student_name,request.student_id,
        request.borrow_date,request.return_date,request.purpose,profile.full_name,
        signature.image_data,signature.mime_type,signature.image_hash
      FROM public.borrow_request_authorizations authorization JOIN public.borrow_requests request ON request.id=authorization.request_id
      JOIN public.profiles profile ON profile.user_id=$2 LEFT JOIN public.professor_signatures signature ON signature.professor_user_id=$2
      WHERE authorization.review_token=$1 FOR UPDATE OF authorization,request`, [req.params.token, req.user.id]);
    const row = record.rows[0];
    if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error: "REVIEW_NOT_FOUND", message: "This authorization request was not found." }); }
    if (row.status !== "awaiting" || row.request_status !== "Pending") { await client.query("ROLLBACK"); return res.status(409).json({ error: "ALREADY_REVIEWED", message: "This request is no longer awaiting professor authorization." }); }
    if (!row.image_data) { await client.query("ROLLBACK"); return res.status(409).json({ error: "SIGNATURE_REQUIRED", message: "Save your signature in Signature Settings before authorizing this request." }); }
    const items = await client.query(`SELECT item.inventory_id,inventory.item_name,item.quantity FROM public.borrow_request_items item JOIN public.inventory inventory ON inventory.id=item.inventory_id WHERE item.request_id=$1 ORDER BY item.inventory_id`, [row.request_id]);
    const snapshot = { requestId: row.request_id, studentName: row.student_name, studentId: row.student_id,
      borrowDate: row.borrow_date, returnDate: row.return_date, purpose: row.purpose, items: items.rows,
      professorName: row.full_name, authorizedAt: new Date().toISOString() };
    const documentHash = hash(Buffer.from(JSON.stringify(snapshot)));
    await client.query(`UPDATE public.borrow_request_authorizations SET status='authorized',professor_user_id=$2,professor_name=$3,
      signature_image=$4,signature_mime_type=$5,signature_hash=$6,authorized_at=now(),request_snapshot=$7::jsonb,document_hash=$8,updated_at=now() WHERE request_id=$1`,
      [row.request_id,req.user.id,row.full_name,row.image_data,row.mime_type,row.image_hash,JSON.stringify(snapshot),documentHash]);
    await client.query(`UPDATE public.borrow_requests SET status='Validated',updated_at=now() WHERE id=$1`, [row.request_id]);
    await writeAuditLog(client, req.user, { action: "borrowing_professor_authorized", entityType: "borrowing_request", entityId: row.request_id,
      newValues: { professorName: row.full_name, signatureHash: row.image_hash, documentHash } });
    await notifyRoles(client,["admin"],{ type:"professor_authorized",title:"Request ready for admin approval",message:`BR-${String(row.request_id).padStart(3,"0")} was authorized by ${row.full_name}.`,relatedPath:"/admin/requests",entityType:"borrowing_request",entityId:row.request_id });
    await notifyUser(client,row.user_id,{ type:"professor_authorized",title:"Professor authorization completed",message:`Your request BR-${String(row.request_id).padStart(3,"0")} is awaiting final admin approval.`,relatedPath:"/my-requests",entityType:"borrowing_request",entityId:row.request_id });
    await client.query("COMMIT");
    return res.json({ status: "authorized", requestStatus: "Validated", documentHash });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

async function downloadAuthorizedDocument(req, res, next) {
  if (!UUID.test(req.params.token)) return res.status(400).json({ error: "INVALID_REVIEW_LINK", message: "This authorization link is invalid." });
  try {
    const result = await pool.query(`SELECT authorization.*,request.student_name,request.student_id,request.borrow_date,request.return_date,request.purpose,
        request.created_at AS request_created_at,
        COALESCE(json_agg(json_build_object('description',inventory.item_name,'quantity',item.quantity,'released',item.quantity,'returned','','unreturned','','remarks','') ORDER BY item.inventory_id),'[]'::json) AS items
      FROM public.borrow_request_authorizations authorization JOIN public.borrow_requests request ON request.id=authorization.request_id
      JOIN public.borrow_request_items item ON item.request_id=request.id JOIN public.inventory inventory ON inventory.id=item.inventory_id
      WHERE authorization.review_token=$1 AND authorization.status='authorized' GROUP BY authorization.request_id,request.id`, [req.params.token]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "SIGNED_DOCUMENT_NOT_FOUND", message: "The signed document is not available yet." });
    const buffer = generateBorrowerForm({ laboratory: "", dateTime: new Date(row.request_created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      controlNo: `BR-${String(row.request_id).padStart(3,"0")}`, items: row.items,
      professorName: row.professor_name, authorizedAt: new Date(row.authorized_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      professorSignature: row.signature_image, professorSignatureMime: row.signature_mime_type });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="Borrowers-Form-BR-${String(row.request_id).padStart(3,"0")}-Signed.docx"`);
    return res.send(buffer);
  } catch (error) { return next(error); }
}

module.exports = { authorizeRequest, decodeSignature, downloadAuthorizedDocument, getAuthorizationReview, getMySignature, saveMySignature };
