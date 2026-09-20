"use strict";

const crypto = require("node:crypto");
const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { notifyDepartmentRole, notifyRoles, notifyUser } = require("../utils/notifications");
const generateBorrowerForm = require("../generateBorrowerForm");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

function ownershipError(record, professorUserId) {
  if (!record) return { status: 404, error: "REVIEW_NOT_FOUND", message: "This authorization request was not found." };
  if (!record.assigned_professor_user_id) return { status: 409, error: "PROFESSOR_NOT_ASSIGNED", message: "This legacy request has no assigned professor. An administrator must resolve its assignment." };
  if (String(record.assigned_professor_user_id) !== String(professorUserId)) return { status: 403, error: "NOT_ASSIGNED_PROFESSOR", message: "This request is assigned to another professor." };
  return null;
}

async function loadOwnership(client, token, lock = false) {
  return client.query(`SELECT authz.request_id,request.assigned_professor_user_id
    FROM public.borrow_request_authorizations AS authz
    JOIN public.borrow_requests AS request ON request.id=authz.request_id
    WHERE authz.review_token=$1 ${lock ? "FOR UPDATE OF authz,request" : ""}`, [token]);
}

async function auditDeniedAccess(client, user, token, record, denial) {
  await writeAuditLog(client, user, { action: "borrowing_authorization_access_denied", entityType: "borrowing_request",
    entityId: record?.request_id ?? null, metadata: { reason: denial.error, reviewTokenHash: hash(String(token)) } });
}

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
  return pool.query(`SELECT authz.review_token,authz.status AS authorization_status,authz.authorized_at,
      authz.professor_name,request.id,request.student_name,request.student_id,request.borrow_date,request.return_date,
      request.purpose,request.status,request.assigned_professor_user_id,profile.full_name AS current_professor_name,
      department.name AS department_name,department.code AS department_code,section.name AS section_name,
      assigned.full_name AS assigned_professor_name,
      EXISTS(SELECT 1 FROM public.professor_signatures signature WHERE signature.professor_user_id=$2) AS signature_configured,
      (SELECT image_data FROM public.professor_signatures signature WHERE signature.professor_user_id=$2) AS current_signature,
      (SELECT mime_type FROM public.professor_signatures signature WHERE signature.professor_user_id=$2) AS current_signature_mime,
      COALESCE(json_agg(json_build_object('inventoryId',item.inventory_id,'name',inventory.item_name,'quantity',item.quantity)
        ORDER BY item.inventory_id) FILTER (WHERE item.inventory_id IS NOT NULL),'[]'::json) AS items
    FROM public.borrow_request_authorizations AS authz
    JOIN public.borrow_requests request ON request.id=authz.request_id
    LEFT JOIN public.borrow_request_items item ON item.request_id=request.id
    LEFT JOIN public.inventory inventory ON inventory.id=item.inventory_id
    LEFT JOIN public.academic_departments department ON department.id=request.department_id
    LEFT JOIN public.academic_sections section ON section.id=request.section_id
    LEFT JOIN public.profiles assigned ON assigned.user_id=request.assigned_professor_user_id
    JOIN public.profiles profile ON profile.user_id=$2
    WHERE authz.review_token=$1 AND request.assigned_professor_user_id=$2
    GROUP BY authz.review_token,authz.status,authz.authorized_at,
      authz.professor_name,request.id,profile.full_name,department.id,section.id,assigned.user_id`, [token, userId]);
}

async function getMyCustodianSignature(req, res, next) {
  try {
    const result = await pool.query(`SELECT image_data,mime_type,updated_at FROM public.custodian_signatures WHERE custodian_user_id=$1`, [req.user.id]);
    const row = result.rows[0];
    return res.json({ configured: Boolean(row), updatedAt: row?.updated_at ?? null,
      image: row ? `data:${row.mime_type};base64,${row.image_data.toString("base64")}` : null });
  } catch (error) { return next(error); }
}

async function saveMyCustodianSignature(req, res, next) {
  const signature = decodeSignature(req.body?.image);
  if (!signature) return res.status(422).json({ error: "INVALID_SIGNATURE", message: "Upload a valid PNG or JPEG signature no larger than 256 KB." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query(`SELECT image_hash,updated_at FROM public.custodian_signatures WHERE custodian_user_id=$1 FOR UPDATE`, [req.user.id]);
    await client.query(`INSERT INTO public.custodian_signatures (custodian_user_id,image_data,mime_type,image_hash,updated_at)
      VALUES ($1,$2,$3,$4,now()) ON CONFLICT (custodian_user_id) DO UPDATE SET
      image_data=excluded.image_data,mime_type=excluded.mime_type,image_hash=excluded.image_hash,updated_at=now()`,
      [req.user.id, signature.data, signature.mimeType, signature.imageHash]);
    await writeAuditLog(client, req.user, { action: previous.rowCount ? "custodian_signature_replaced" : "custodian_signature_created",
      entityType: "custodian_signature", entityId: req.user.id,
      oldValues: previous.rowCount ? { imageHash: previous.rows[0].image_hash, updatedAt: previous.rows[0].updated_at } : null,
      newValues: { imageHash: signature.imageHash } });
    await client.query("COMMIT");
    return res.json({ configured: true, imageHash: signature.imageHash });
  } catch (error) { await client.query("ROLLBACK"); return next(error); }
  finally { client.release(); }
}

async function getMyAdminSignature(req, res, next) {
  try {
    const result = await pool.query(`SELECT image_data,mime_type,updated_at FROM public.admin_signatures WHERE admin_user_id=$1`, [req.user.id]);
    const row = result.rows[0];
    return res.json({ configured: Boolean(row), updatedAt: row?.updated_at ?? null,
      image: row ? `data:${row.mime_type};base64,${row.image_data.toString("base64")}` : null });
  } catch (error) { return next(error); }
}

async function saveMyAdminSignature(req, res, next) {
  const signature = decodeSignature(req.body?.image);
  if (!signature) return res.status(422).json({ error:"INVALID_SIGNATURE",message:"Upload a valid PNG or JPEG signature no larger than 256 KB." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query(`SELECT image_hash,updated_at FROM public.admin_signatures WHERE admin_user_id=$1 FOR UPDATE`,[req.user.id]);
    await client.query(`INSERT INTO public.admin_signatures (admin_user_id,image_data,mime_type,image_hash,updated_at)
      VALUES ($1,$2,$3,$4,now()) ON CONFLICT (admin_user_id) DO UPDATE SET image_data=excluded.image_data,
      mime_type=excluded.mime_type,image_hash=excluded.image_hash,updated_at=now()`,[req.user.id,signature.data,signature.mimeType,signature.imageHash]);
    await writeAuditLog(client,req.user,{ action:previous.rowCount?"admin_signature_replaced":"admin_signature_created",
      entityType:"admin_signature",entityId:req.user.id,oldValues:previous.rowCount?{imageHash:previous.rows[0].image_hash,updatedAt:previous.rows[0].updated_at}:null,
      newValues:{imageHash:signature.imageHash} });
    await client.query("COMMIT");
    return res.json({configured:true,imageHash:signature.imageHash});
  } catch(error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

const REQUEST_ID = /^[1-9]\d*$/;

async function loadCustodianRequest(client, requestId, staff, lock = false) {
  return client.query(`SELECT request.id,request.user_id,request.student_name,request.student_id,request.borrow_date,
      request.return_date,request.purpose,request.status,request.department_id,department.name AS department_name,
      section.name AS section_name,professor.professor_name,professor.authorized_at AS professor_authorized_at,
      custodian.verified_by,custodian.verified_name,custodian.verified_at,
      custodian.verified_signature_hash,
      custodian.approved_by,custodian.approved_name,custodian.approved_at,
      signature.image_data AS current_signature,signature.mime_type AS current_signature_mime,
      signature.image_hash AS current_signature_hash,staff_profile.full_name AS current_staff_name
    FROM public.borrow_requests request
    JOIN public.borrow_request_authorizations professor ON professor.request_id=request.id AND professor.status='authorized'
    JOIN public.profiles staff_profile ON staff_profile.user_id=$2 AND staff_profile.role='staff' AND staff_profile.is_active=true
    LEFT JOIN public.academic_departments department ON department.id=request.department_id
    LEFT JOIN public.academic_sections section ON section.id=request.section_id
    LEFT JOIN public.borrow_request_custodian_authorizations custodian ON custodian.request_id=request.id
    LEFT JOIN public.custodian_signatures signature ON signature.custodian_user_id=$2
    WHERE request.id=$1 AND request.department_id=staff_profile.department_id
    ${lock ? "FOR UPDATE OF request" : ""}`, [requestId, staff.id]);
}

function custodianReviewResponse(row) {
  return {
    requestId: row.id, studentName: row.student_name, studentId: row.student_id,
    borrowDate: row.borrow_date, returnDate: row.return_date, purpose: row.purpose,
    status: row.status, departmentName: row.department_name, sectionName: row.section_name,
    professorName: row.professor_name, professorAuthorizedAt: row.professor_authorized_at,
    signatureConfigured: Boolean(row.current_signature),
    verifiedBy: row.verified_name, verifiedAt: row.verified_at,
    approvedBy: row.approved_name, approvedAt: row.approved_at,
  };
}

async function getCustodianReview(req, res, next) {
  if (!REQUEST_ID.test(req.params.id)) return res.status(400).json({ error: "INVALID_REQUEST_ID", message: "Borrowing request ID is invalid." });
  try {
    const result = await loadCustodianRequest(pool, req.params.id, req.user);
    if (!result.rowCount) return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "An authorized request was not found in your department." });
    return res.json({ review: custodianReviewResponse(result.rows[0]) });
  } catch (error) { return next(error); }
}

async function verifyCustodianRequest(req, res, next) {
  if (!REQUEST_ID.test(req.params.id)) return res.status(400).json({ error: "INVALID_REQUEST_ID", message: "Borrowing request ID is invalid." });
  if (req.body?.confirmed !== true) return res.status(422).json({ error: "CONFIRMATION_REQUIRED", message: "Confirm that you reviewed the request and available inventory." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await loadCustodianRequest(client, req.params.id, req.user, true);
    const row = result.rows[0];
    if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "An authorized request was not found in your department." }); }
    if (row.status !== "Validated") { await client.query("ROLLBACK"); return res.status(409).json({ error: "REQUEST_NOT_VALIDATED", message: "Only professor-authorized requests can be verified." }); }
    if (row.verified_at) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ALREADY_VERIFIED", message: "This request has already been verified." }); }
    if (!row.current_signature) { await client.query("ROLLBACK"); return res.status(409).json({ error: "SIGNATURE_REQUIRED", message: "Save your Custodian Signature before verifying requests." }); }
    await client.query(`INSERT INTO public.borrow_request_custodian_authorizations
      (request_id,verified_by,verified_name,verified_signature_image,verified_signature_mime_type,verified_signature_hash,verified_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,now(),now()) ON CONFLICT (request_id) DO UPDATE SET
      verified_by=excluded.verified_by,verified_name=excluded.verified_name,
      verified_signature_image=excluded.verified_signature_image,verified_signature_mime_type=excluded.verified_signature_mime_type,
      verified_signature_hash=excluded.verified_signature_hash,verified_at=excluded.verified_at,updated_at=now()
      WHERE borrow_request_custodian_authorizations.verified_at IS NULL`,
      [row.id,req.user.id,row.current_staff_name,row.current_signature,row.current_signature_mime,row.current_signature_hash]);
    await writeAuditLog(client,req.user,{ action:"borrowing_custodian_verified",entityType:"borrowing_request",entityId:row.id,
      newValues:{ verifiedBy:row.current_staff_name,signatureHash:row.current_signature_hash } });
    await notifyUser(client,row.user_id,{ type:"custodian_verified",title:"Request verified by stockroom",message:`BR-${String(row.id).padStart(3,"0")} is awaiting final department-head approval.`,relatedPath:"/my-requests",entityType:"borrowing_request",entityId:row.id });
    await notifyRoles(client,["admin"],{ type:"department_head_approval_ready",title:"Request ready for final approval",message:`BR-${String(row.id).padStart(3,"0")} was verified by ${row.current_staff_name}.`,relatedPath:"/admin/requests",entityType:"borrowing_request",entityId:row.id });
    await client.query("COMMIT");
    return res.json({ status:"verified",verifiedBy:row.current_staff_name });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

async function approveCustodianRequest(req, res, next) {
  if (!REQUEST_ID.test(req.params.id)) return res.status(400).json({ error: "INVALID_REQUEST_ID", message: "Borrowing request ID is invalid." });
  if (req.body?.confirmed !== true) return res.status(422).json({ error: "CONFIRMATION_REQUIRED", message: "Confirm final department-head approval for this request." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT request.id,request.user_id,request.student_name,request.student_id,request.borrow_date,
        request.return_date,request.purpose,request.status,request.department_id,department.name AS department_name,
        section.name AS section_name,professor.professor_name,custodian.verified_by,custodian.verified_name,
        custodian.verified_at,custodian.verified_signature_hash,custodian.approved_at,
        signature.image_data AS current_signature,signature.mime_type AS current_signature_mime,
        signature.image_hash AS current_signature_hash,admin_profile.full_name AS current_admin_name
      FROM public.borrow_requests request
      JOIN public.borrow_request_authorizations professor ON professor.request_id=request.id AND professor.status='authorized'
      JOIN public.borrow_request_custodian_authorizations custodian ON custodian.request_id=request.id
      JOIN public.profiles admin_profile ON admin_profile.user_id=$2 AND admin_profile.role='admin' AND admin_profile.is_active=true
      LEFT JOIN public.admin_signatures signature ON signature.admin_user_id=$2
      LEFT JOIN public.academic_departments department ON department.id=request.department_id
      LEFT JOIN public.academic_sections section ON section.id=request.section_id
      WHERE request.id=$1 FOR UPDATE OF request`,[req.params.id,req.user.id]);
    const row = result.rows[0];
    if (!row) { await client.query("ROLLBACK"); return res.status(404).json({ error:"REQUEST_NOT_FOUND",message:"An authorized request awaiting final review was not found." }); }
    if (row.status !== "Validated" || !row.verified_at) { await client.query("ROLLBACK"); return res.status(409).json({ error:"VERIFICATION_REQUIRED",message:"Custodian verification must be completed before approval." }); }
    if (row.approved_at) { await client.query("ROLLBACK"); return res.status(409).json({ error:"ALREADY_APPROVED",message:"This request already has final department-head approval." }); }
    if (!row.current_signature) { await client.query("ROLLBACK"); return res.status(409).json({ error:"SIGNATURE_REQUIRED",message:"Save your Administrator Signature before approving requests." }); }
    const items = await client.query(`SELECT item.inventory_id,inventory.item_name,item.quantity FROM public.borrow_request_items item JOIN public.inventory inventory ON inventory.id=item.inventory_id WHERE item.request_id=$1 ORDER BY item.inventory_id`,[row.id]);
    const approvedAt = new Date().toISOString();
    const snapshot = { requestId:row.id,studentName:row.student_name,studentId:row.student_id,department:row.department_name,
      section:row.section_name,borrowDate:row.borrow_date,returnDate:row.return_date,purpose:row.purpose,items:items.rows,
      professorName:row.professor_name,verifiedBy:row.verified_name,verifiedAt:row.verified_at,
      verifiedSignatureHash:row.verified_signature_hash,approvedBy:row.current_admin_name,approvedAt,
      approvedSignatureHash:row.current_signature_hash };
    const documentHash = hash(Buffer.from(JSON.stringify(snapshot)));
    await client.query(`UPDATE public.borrow_request_custodian_authorizations SET approved_by=$2,approved_name=$3,
      approved_signature_image=$4,approved_signature_mime_type=$5,approved_signature_hash=$6,approved_at=$9::timestamptz,
      authorization_snapshot=$7::jsonb,document_hash=$8,updated_at=now() WHERE request_id=$1 AND approved_at IS NULL`,
      [row.id,req.user.id,row.current_admin_name,row.current_signature,row.current_signature_mime,row.current_signature_hash,JSON.stringify(snapshot),documentHash,approvedAt]);
    await client.query(`UPDATE public.borrow_requests SET status='Approved',approved_by=$2,approved_at=$3::timestamptz,updated_at=now() WHERE id=$1 AND status='Validated'`,[row.id,req.user.id,approvedAt]);
    await client.query(`INSERT INTO public.calendar_events (title,event_date,event_type,description,borrow_request_id)
      VALUES ($1,$2,'borrowing',$3,$4)
      ON CONFLICT (borrow_request_id,event_type) WHERE borrow_request_id IS NOT NULL AND event_type IN ('borrowing','return_due')
      DO UPDATE SET title=excluded.title,event_date=excluded.event_date,description=excluded.description,updated_at=now()`,
      [`Borrowing: ${row.student_name}`,row.borrow_date,`${row.purpose || "Equipment borrowing"} (Return: ${String(row.return_date).slice(0,10)})`,row.id]);
    await writeAuditLog(client,req.user,{ action:"borrowing_custodian_approved",entityType:"borrowing_request",entityId:row.id,
      newValues:{ approvedBy:row.current_admin_name,signatureHash:row.current_signature_hash,documentHash } });
    await notifyUser(client,row.user_id,{ type:"request_approved",title:"Request ready for claim",message:`BR-${String(row.id).padStart(3,"0")} received department-head approval and is ready for claim.`,relatedPath:"/my-requests",entityType:"borrowing_request",entityId:row.id });
    await client.query("COMMIT");
    return res.json({ status:"approved",requestStatus:"Approved",approvedBy:row.current_admin_name,documentHash });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

async function getAuthorizationReview(req, res, next) {
  if (!UUID.test(req.params.token)) return res.status(400).json({ error: "INVALID_REVIEW_LINK", message: "This authorization link is invalid." });
  try {
    const access = await loadOwnership(pool, req.params.token);
    const denial = ownershipError(access.rows[0], req.user.id);
    if (denial) {
      if (access.rows[0]) await auditDeniedAccess(pool, req.user, req.params.token, access.rows[0], denial);
      return res.status(denial.status).json({ error: denial.error, message: denial.message });
    }
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
    const record = await client.query(`SELECT authz.*,request.status AS request_status,request.user_id,request.student_name,request.student_id,
        request.borrow_date,request.return_date,request.purpose,request.department_id,request.assigned_professor_user_id,
        department.name AS department_name,section.name AS section_name,profile.full_name,
        signature.image_data,signature.mime_type,signature.image_hash
      FROM public.borrow_request_authorizations AS authz JOIN public.borrow_requests request ON request.id=authz.request_id
      LEFT JOIN public.academic_departments department ON department.id=request.department_id
      LEFT JOIN public.academic_sections section ON section.id=request.section_id
      JOIN public.profiles profile ON profile.user_id=$2 LEFT JOIN public.professor_signatures signature ON signature.professor_user_id=$2
      WHERE authz.review_token=$1 FOR UPDATE OF authz,request`, [req.params.token, req.user.id]);
    const row = record.rows[0];
    const denial = ownershipError(row, req.user.id);
    if (denial) {
      if (row) { await auditDeniedAccess(client, req.user, req.params.token, row, denial); await client.query("COMMIT"); }
      else await client.query("ROLLBACK");
      return res.status(denial.status).json({ error: denial.error, message: denial.message });
    }
    if (row.status !== "awaiting" || row.request_status !== "Pending") { await client.query("ROLLBACK"); return res.status(409).json({ error: "ALREADY_REVIEWED", message: "This request is no longer awaiting professor authorization." }); }
    if (!row.image_data) { await client.query("ROLLBACK"); return res.status(409).json({ error: "SIGNATURE_REQUIRED", message: "Save your signature in Signature Settings before authorizing this request." }); }
    const items = await client.query(`SELECT item.inventory_id,inventory.item_name,item.quantity FROM public.borrow_request_items item JOIN public.inventory inventory ON inventory.id=item.inventory_id WHERE item.request_id=$1 ORDER BY item.inventory_id`, [row.request_id]);
    const authorizedAt = new Date().toISOString();
    const snapshot = { requestId: row.request_id, studentName: row.student_name, studentId: row.student_id,
      borrowDate: row.borrow_date, returnDate: row.return_date, purpose: row.purpose,
      department: row.department_name, section: row.section_name, assignedProfessorUserId: row.assigned_professor_user_id, items: items.rows,
      professorName: row.full_name, authorizedAt };
    const documentHash = hash(Buffer.from(JSON.stringify(snapshot)));
    await client.query(`UPDATE public.borrow_request_authorizations SET status='authorized',professor_user_id=$2,professor_name=$3,
      signature_image=$4,signature_mime_type=$5,signature_hash=$6,authorized_at=$9::timestamptz,request_snapshot=$7::jsonb,document_hash=$8,updated_at=now() WHERE request_id=$1`,
      [row.request_id,req.user.id,row.full_name,row.image_data,row.mime_type,row.image_hash,JSON.stringify(snapshot),documentHash,authorizedAt]);
    await client.query(`UPDATE public.borrow_requests SET status='Validated',updated_at=now() WHERE id=$1`, [row.request_id]);
    await writeAuditLog(client, req.user, { action: "borrowing_professor_authorized", entityType: "borrowing_request", entityId: row.request_id,
      newValues: { professorName: row.full_name, signatureHash: row.image_hash, documentHash } });
    await notifyRoles(client,["admin"],{ type:"professor_authorized",title:"Professor authorization completed",message:`BR-${String(row.request_id).padStart(3,"0")} is awaiting department custodian review.`,relatedPath:"/admin/requests",entityType:"borrowing_request",entityId:row.request_id });
    await notifyDepartmentRole(client,row.department_id,"staff",{ type:"custodian_review_ready",title:"Request ready for custodian review",message:`BR-${String(row.request_id).padStart(3,"0")} was authorized by ${row.full_name}.`,relatedPath:"/admin/requests",entityType:"borrowing_request",entityId:row.request_id });
    await notifyUser(client,row.user_id,{ type:"professor_authorized",title:"Professor authorization completed",message:`Your request BR-${String(row.request_id).padStart(3,"0")} is awaiting custodian verification and approval.`,relatedPath:"/my-requests",entityType:"borrowing_request",entityId:row.request_id });
    await client.query("COMMIT");
    return res.json({ status: "authorized", requestStatus: "Validated", documentHash });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

async function downloadAuthorizedDocument(req, res, next) {
  if (!UUID.test(req.params.token)) return res.status(400).json({ error: "INVALID_REVIEW_LINK", message: "This authorization link is invalid." });
  try {
    const access = await loadOwnership(pool, req.params.token);
    if (req.user.role === "professor") {
      const denial = ownershipError(access.rows[0], req.user.id);
      if (denial) {
        if (access.rows[0]) await auditDeniedAccess(pool, req.user, req.params.token, access.rows[0], denial);
        return res.status(denial.status).json({ error: denial.error, message: denial.message });
      }
    } else if (!access.rowCount) {
      return res.status(404).json({ error: "SIGNED_DOCUMENT_NOT_FOUND", message: "The signed document is not available." });
    }
    const result = await pool.query(`SELECT authz.*,custodian.*,released.staff_name AS released_name,released.signed_at AS released_at,
        released.signature_image AS released_signature_image,released.signature_mime_type AS released_signature_mime_type,
        returned.staff_name AS returned_name,returned.signed_at AS returned_at,returned.signature_image AS returned_signature_image,
        returned.signature_mime_type AS returned_signature_mime_type,
        request.student_name,request.student_id,request.borrow_date,request.return_date,request.purpose,
        request.created_at AS request_created_at,department.name AS department_name,section.name AS section_name,
        COALESCE(json_agg(json_build_object('description',inventory.item_name,'quantity',item.quantity,
          'released',CASE WHEN request.status IN ('Borrowed','Returned') THEN item.quantity::text ELSE '' END,
          'returned',COALESCE((SELECT SUM(returned_item.good_quantity+returned_item.damaged_quantity+returned_item.missing_quantity)::text
            FROM public.borrowing_return_items returned_item WHERE returned_item.request_id=request.id AND returned_item.inventory_id=item.inventory_id),''),
          'unreturned',CASE WHEN request.status IN ('Borrowed','Returned') THEN GREATEST(0,item.quantity-COALESCE((SELECT SUM(returned_item.good_quantity+returned_item.damaged_quantity+returned_item.missing_quantity)
            FROM public.borrowing_return_items returned_item WHERE returned_item.request_id=request.id AND returned_item.inventory_id=item.inventory_id),0))::text ELSE '' END,
          'remarks',COALESCE((SELECT string_agg(nullif(trim(returned_item.condition_note),''),'; ' ORDER BY returned_item.id)
            FROM public.borrowing_return_items returned_item WHERE returned_item.request_id=request.id AND returned_item.inventory_id=item.inventory_id),'')
          ) ORDER BY item.inventory_id),'[]'::json) AS items
      FROM public.borrow_request_authorizations AS authz JOIN public.borrow_requests request ON request.id=authz.request_id
      LEFT JOIN public.borrow_request_custodian_authorizations custodian ON custodian.request_id=request.id
      LEFT JOIN public.borrowing_transaction_signatures released ON released.request_id=request.id AND released.transaction_type='release'
      LEFT JOIN LATERAL (SELECT latest.* FROM public.borrowing_transaction_signatures latest
        WHERE latest.request_id=request.id AND latest.transaction_type='return' ORDER BY latest.signed_at DESC,latest.id DESC LIMIT 1) returned ON true
      LEFT JOIN public.academic_departments department ON department.id=request.department_id
      LEFT JOIN public.academic_sections section ON section.id=request.section_id
      JOIN public.borrow_request_items item ON item.request_id=request.id JOIN public.inventory inventory ON inventory.id=item.inventory_id
      WHERE authz.review_token=$1 AND authz.status='authorized'
        AND ($2::boolean OR request.assigned_professor_user_id=$3::uuid OR request.user_id=$3::uuid
          OR ($4::boolean AND request.department_id=$5::bigint))
      GROUP BY authz.request_id,custodian.request_id,released.id,returned.id,returned.staff_name,returned.signed_at,
        returned.signature_image,returned.signature_mime_type,request.id,department.id,section.id`,
      [req.params.token, req.user.role === "admin", req.user.id, req.user.role === "staff", req.user.department_id]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "SIGNED_DOCUMENT_NOT_FOUND", message: "The signed document is not available yet." });
    const displayTime = (value) => value ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "";
    const buffer = generateBorrowerForm({ laboratory: row.department_name || "",department:row.department_name,section:row.section_name,
      returnDate:displayTime(row.return_date).split(",")[0],dateTime: displayTime(row.request_created_at),
      controlNo: `BR-${String(row.request_id).padStart(3,"0")}`, items: row.items,
      professorName: row.professor_name, authorizedAt: displayTime(row.authorized_at),
      professorSignature: row.signature_image, professorSignatureMime: row.signature_mime_type,
      verifiedName:row.verified_name,verifiedAt:displayTime(row.verified_at),verifiedSignature:row.verified_signature_image,verifiedSignatureMime:row.verified_signature_mime_type,
      approvedName:row.approved_name,approvedAt:displayTime(row.approved_at),approvedSignature:row.approved_signature_image,approvedSignatureMime:row.approved_signature_mime_type,
      releasedName:row.released_name,releasedAt:displayTime(row.released_at),releasedSignature:row.released_signature_image,releasedSignatureMime:row.released_signature_mime_type,
      returnedName:row.returned_name,returnedAt:displayTime(row.returned_at),returnedSignature:row.returned_signature_image,returnedSignatureMime:row.returned_signature_mime_type });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const documentState = row.approved_at ? "Approved" : "Authorization-In-Progress";
    res.setHeader("Content-Disposition", `attachment; filename="Borrowers-Form-BR-${String(row.request_id).padStart(3,"0")}-${documentState}.docx"`);
    return res.send(buffer);
  } catch (error) { return next(error); }
}

module.exports = { approveCustodianRequest, authorizeRequest, decodeSignature, downloadAuthorizedDocument, getAuthorizationReview, getCustodianReview, getMyAdminSignature, getMyCustodianSignature, getMySignature, ownershipError, saveMyAdminSignature, saveMyCustodianSignature, saveMySignature, verifyCustodianRequest };
