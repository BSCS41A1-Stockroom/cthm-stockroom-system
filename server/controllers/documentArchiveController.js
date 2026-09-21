"use strict";
const crypto = require("node:crypto");
const pool = require("../config/db");

async function accessRequest(user,id) {
  return pool.query(`SELECT request.id FROM public.borrow_requests request WHERE request.id=$1 AND
    ($2='admin' OR ($2='student' AND request.user_id=$3) OR ($2='professor' AND request.assigned_professor_user_id=$3)
      OR ($2='staff' AND request.department_id=$4))`,[id,user.role,user.id,user.department_id ?? null]);
}
async function listDocuments(req,res,next) {
  if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({error:"INVALID_REQUEST_ID",message:"Borrowing request ID is invalid."});
  try {
    if (!(await accessRequest(req.user,req.params.id)).rowCount) return res.status(404).json({error:"REQUEST_NOT_FOUND",message:"Borrowing request was not found."});
    const result=await pool.query(`SELECT archive.id,archive.request_id,archive.version,archive.document_state,archive.filename,archive.sha256,archive.created_at,
      profile.full_name AS created_by_name FROM public.borrowing_document_archives archive LEFT JOIN public.profiles profile ON profile.user_id=archive.created_by
      WHERE archive.request_id=$1 ORDER BY archive.version DESC`,[req.params.id]);
    return res.json({documents:result.rows});
  } catch(error){return next(error);}
}
async function downloadDocument(req,res,next) {
  if (!/^[1-9]\d*$/.test(req.params.documentId)) return res.status(400).json({error:"INVALID_DOCUMENT_ID",message:"Archived document ID is invalid."});
  try {
    const result=await pool.query(`SELECT archive.* FROM public.borrowing_document_archives archive JOIN public.borrow_requests request ON request.id=archive.request_id
      WHERE archive.id=$1 AND ($2='admin' OR ($2='student' AND request.user_id=$3) OR ($2='professor' AND request.assigned_professor_user_id=$3)
        OR ($2='staff' AND request.department_id=$4))`,[req.params.documentId,req.user.role,req.user.id,req.user.department_id ?? null]);
    const row=result.rows[0]; if(!row)return res.status(404).json({error:"DOCUMENT_NOT_FOUND",message:"Archived document was not found."});
    res.setHeader("Content-Type",row.mime_type); res.setHeader("Content-Disposition",`attachment; filename="${row.filename.replace(/["\r\n]/g,"")}"`);
    res.setHeader("X-Document-SHA256",row.sha256); return res.send(row.content);
  } catch(error){return next(error);}
}
async function verifyDocument(req,res,next) {
  const sha256=String(req.body?.sha256 ?? "").trim().toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(sha256))return res.status(422).json({error:"INVALID_DOCUMENT_HASH",message:"Enter a valid SHA-256 document hash."});
  try { const result=await pool.query(`SELECT id,request_id,version,document_state,filename,sha256,created_at FROM public.borrowing_document_archives WHERE sha256=$1`,[sha256]);
    const document=result.rows[0] ?? null; return res.status(document?200:404).json({valid:Boolean(document),document});
  } catch(error){return next(error);}
}
function hashDocument(buffer){return crypto.createHash("sha256").update(buffer).digest("hex");}
module.exports={downloadDocument,hashDocument,listDocuments,verifyDocument};
