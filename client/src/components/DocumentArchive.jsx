import { useEffect, useState } from "react";
import { FaCheckCircle, FaDownload, FaFileSignature, FaShieldAlt } from "react-icons/fa";
import { useAuth } from "../auth/useAuth";
import { authenticatedFetch } from "../lib/api";
import "../styles/documentArchive.css";

const LABELS={professor_authorized:"Professor Authorized",staff_verified:"Staff Verified",approved:"Approved",released:"Released",partially_returned:"Partially Returned",finalized:"Finalized"};
export default function DocumentArchive({requestId}){
  const {profile}=useAuth(); const [documents,setDocuments]=useState([]); const [state,setState]=useState("loading"); const [message,setMessage]=useState("");
  useEffect(()=>{let active=true; authenticatedFetch(`/api/document-archives/request/${requestId}`).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.message||"Unable to load archived forms.");if(active){setDocuments(body.documents||[]);setState("ready");}}).catch(error=>{if(active){setMessage(error.message);setState("error");}});return()=>{active=false;};},[requestId]);
  const download=async archive=>{setMessage("");try{const response=await authenticatedFetch(`/api/document-archives/${archive.id}/download`);if(!response.ok){const body=await response.json();throw new Error(body.message||"Unable to download archived form.");}const url=URL.createObjectURL(await response.blob());const link=window.document.createElement("a");link.href=url;link.download=archive.filename;link.click();URL.revokeObjectURL(url);}catch(error){setMessage(error.message);}};
  const verify=async archive=>{setMessage("");try{const response=await authenticatedFetch("/api/document-archives/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sha256:archive.sha256})});const body=await response.json();if(!response.ok)throw new Error(body.message||"Document verification failed.");setMessage(`Verified: ${body.document.filename} is an authentic archived form.`);}catch(error){setMessage(error.message);}};
  return <section className="document-archive"><header><div><FaFileSignature/><div><h3>Official Form Archive</h3><p>Immutable versions recorded by the system.</p></div></div></header>
    {state==="loading"&&<p className="archive-state">Loading archived forms...</p>}{state==="error"&&<p className="archive-state error">{message}</p>}
    {state==="ready"&&documents.length===0&&<p className="archive-state">The first signed version will appear after professor authorization.</p>}
    {documents.map(archive=><article key={archive.id}><div><strong>v{archive.version} · {LABELS[archive.document_state]||archive.document_state}</strong><span>{new Date(archive.created_at).toLocaleString()} · {archive.created_by_name||"Former account"}</span><code title={archive.sha256}>{archive.sha256.slice(0,16)}…</code></div><div><button type="button" onClick={()=>download(archive)}><FaDownload/> Download</button>{profile?.role==="admin"&&<button type="button" className="verify" onClick={()=>verify(archive)}><FaShieldAlt/> Verify</button>}</div></article>)}
    {message&&state!=="error"&&<p className="archive-message"><FaCheckCircle/> {message}</p>}
  </section>;
}
