"use strict";

const crypto = require("node:crypto");
const generateBorrowerForm = require("../generateBorrowerForm");

const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const LABELS = Object.freeze({ professor_authorized:"Professor-Authorized",staff_verified:"Staff-Verified",approved:"Approved",released:"Released",partially_returned:"Partially-Returned",finalized:"Finalized" });
const displayTime = (value) => value ? new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila"}) : "";

async function archiveBorrowingDocument(client,{requestId,state,actorId}) {
  if (!LABELS[state]) throw new Error(`Unsupported borrowing document state '${state}'.`);
  await client.query("SELECT pg_advisory_xact_lock($1::bigint)",[requestId]);
  const result = await client.query(`SELECT request.*,department.name AS department_name,section.name AS section_name,
      professor.professor_name,professor.authorized_at,professor.signature_image AS professor_signature,professor.signature_mime_type AS professor_signature_mime,
      borrower.student_name AS borrower_name,borrower.consented_at AS borrower_consented_at,borrower.signature_image AS borrower_signature,borrower.signature_mime_type AS borrower_signature_mime,
      custodian.verified_name,custodian.verified_at,custodian.verified_signature_image,custodian.verified_signature_mime_type,
      custodian.approved_name,custodian.approved_at,custodian.approved_signature_image,custodian.approved_signature_mime_type,
      released.staff_name AS released_name,released.signed_at AS released_at,released.signature_image AS released_signature,released.signature_mime_type AS released_signature_mime,
      returned.staff_name AS returned_name,returned.signed_at AS returned_at,returned.signature_image AS returned_signature,returned.signature_mime_type AS returned_signature_mime,
      (SELECT coalesce(json_agg(json_build_object('description',inventory.item_name,'quantity',item.quantity,
        'released',case when request.status in ('Borrowed','Returned') then item.quantity::text else '' end,
        'returned',coalesce(summary.accounted,0)::text,'unreturned',greatest(0,item.quantity-coalesce(summary.accounted,0))::text,
        'remarks',coalesce(summary.remarks,'')) order by item.inventory_id),'[]'::json)
       FROM public.borrow_request_items item JOIN public.inventory inventory ON inventory.id=item.inventory_id
       LEFT JOIN LATERAL (SELECT sum(entry.good_quantity+entry.damaged_quantity+entry.missing_quantity)::integer accounted,
         string_agg(nullif(trim(entry.condition_note),''),'; ' order by entry.id) remarks FROM public.borrowing_return_items entry
         WHERE entry.request_id=request.id AND entry.inventory_id=item.inventory_id) summary ON true WHERE item.request_id=request.id) items
    FROM public.borrow_requests request
    LEFT JOIN public.academic_departments department ON department.id=request.department_id
    LEFT JOIN public.academic_sections section ON section.id=request.section_id
    LEFT JOIN public.borrow_request_authorizations professor ON professor.request_id=request.id
    LEFT JOIN public.borrow_request_student_signatures borrower ON borrower.request_id=request.id
    LEFT JOIN public.borrow_request_custodian_authorizations custodian ON custodian.request_id=request.id
    LEFT JOIN LATERAL (SELECT * FROM public.borrowing_transaction_signatures entry WHERE entry.request_id=request.id AND entry.transaction_type='release' ORDER BY entry.id DESC LIMIT 1) released ON true
    LEFT JOIN LATERAL (SELECT * FROM public.borrowing_transaction_signatures entry WHERE entry.request_id=request.id AND entry.transaction_type='return' ORDER BY entry.id DESC LIMIT 1) returned ON true
    WHERE request.id=$1`,[requestId]);
  const row = result.rows[0];
  if (!row) throw new Error("Borrowing request was not found while archiving its document.");
  const versionResult = await client.query(`SELECT coalesce(max(version),0)+1 AS version FROM public.borrowing_document_archives WHERE request_id=$1`,[requestId]);
  const version = Number(versionResult.rows[0].version);
  const label = LABELS[state];
  const filename = `Borrowers-Form-BR-${String(requestId).padStart(3,"0")}-v${version}-${label}.docx`;
  const content = generateBorrowerForm({ laboratory:row.department_name || "",department:row.department_name,section:row.section_name,
    returnDate:displayTime(row.return_date).split(",")[0],dateTime:displayTime(row.created_at),controlNo:`BR-${String(requestId).padStart(3,"0")} | ${label.replaceAll("-"," ")}`,items:row.items,
    professorName:row.professor_name,authorizedAt:displayTime(row.authorized_at),professorSignature:row.professor_signature,professorSignatureMime:row.professor_signature_mime,
    borrowerName:row.borrower_name,borrowerConsentedAt:displayTime(row.borrower_consented_at),borrowerSignature:row.borrower_signature,borrowerSignatureMime:row.borrower_signature_mime,
    verifiedName:row.verified_name,verifiedAt:displayTime(row.verified_at),verifiedSignature:row.verified_signature_image,verifiedSignatureMime:row.verified_signature_mime_type,
    approvedName:row.approved_name,approvedAt:displayTime(row.approved_at),approvedSignature:row.approved_signature_image,approvedSignatureMime:row.approved_signature_mime_type,
    releasedName:row.released_name,releasedAt:displayTime(row.released_at),releasedSignature:row.released_signature,releasedSignatureMime:row.released_signature_mime,
    returnedName:row.returned_name,returnedAt:displayTime(row.returned_at),returnedSignature:row.returned_signature,returnedSignatureMime:row.returned_signature_mime });
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  const inserted = await client.query(`INSERT INTO public.borrowing_document_archives
    (request_id,version,document_state,filename,mime_type,content,sha256,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,version,document_state,filename,sha256,created_at`,
    [requestId,version,state,filename,MIME,content,sha256,actorId]);
  return inserted.rows[0];
}

module.exports = { archiveBorrowingDocument, MIME };
