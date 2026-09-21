"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {archiveBorrowingDocument}=require("./borrowingDocumentArchive");

test("creates a sequential immutable DOCX archive with a SHA-256 hash",async()=>{
  const calls=[];
  const client={async query(sql,params){calls.push({sql,params});
    if(sql.includes("SELECT request.*,department.name"))return{rows:[{id:12,status:"Approved",student_name:"Student One",student_id:"S-1",department_name:"Hospitality",items:[{description:"Pan",quantity:1,released:"",returned:"0",unreturned:"1",remarks:""}]}]};
    if(sql.includes("coalesce(max(version)"))return{rows:[{version:3}]};
    if(sql.includes("INSERT INTO public.borrowing_document_archives"))return{rows:[{id:9,version:3,document_state:"approved",filename:params[3],sha256:params[6]}]};
    return{rows:[]};
  }};
  const archived=await archiveBorrowingDocument(client,{requestId:12,state:"approved",actorId:"00000000-0000-4000-8000-000000000001"});
  assert.equal(archived.version,3);
  assert.match(archived.filename,/BR-012-v3-Approved\.docx$/);
  assert.match(archived.sha256,/^[0-9a-f]{64}$/);
  const insert=calls.find(call=>call.sql.includes("INSERT INTO public.borrowing_document_archives"));
  assert.equal(Buffer.isBuffer(insert.params[5]),true);
  assert.equal(insert.params[5].length>1000,true);
});
