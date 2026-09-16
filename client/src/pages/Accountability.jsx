import { useCallback, useEffect, useMemo, useState } from "react";
import { FaCheckCircle, FaExclamationTriangle, FaEye, FaSearch, FaShieldAlt, FaTimes } from "react-icons/fa";
import { useAuth } from "../auth/useAuth";
import { authenticatedFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import "../styles/accountability.css";

const LABELS = { open: "Open", under_review: "Under Review", resolved: "Resolved", waived: "Waived" };
const RESOLUTIONS = {
  damaged: [["repaired", "Item repaired"], ["replaced", "Item replaced"], ["payment_recorded", "Payment recorded"], ["waived", "Waived by administrator"]],
  missing: [["recovered", "Item recovered"], ["replaced", "Item replaced"], ["payment_recorded", "Payment recorded"], ["waived", "Waived by administrator"]],
  overdue: [["returned", "Outstanding items returned"], ["waived", "Waived by administrator"]],
};
const dateTime = (value) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default function Accountability() {
  const { profile } = useAuth();
  const staff = ["professor", "admin"].includes(profile?.role);
  const admin = profile?.role === "admin";
  const [cases, setCases] = useState([]);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [resolution, setResolution] = useState({ status: "resolved", resolutionType: "repaired", resolutionNote: "", amount: "", confirmPayment: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadCases = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await authenticatedFetch("/api/accountability"); const body = await response.json(); if (!response.ok) throw new Error(body.message || "Unable to load accountability cases."); setCases(body.cases || []); }
    catch (caught) { setError(caught.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(loadCases, 0); const channel = supabase.channel("accountability-cases").on("postgres_changes", { event: "*", schema: "public", table: "accountability_cases" }, loadCases).subscribe(); return () => { window.clearTimeout(timer); supabase.removeChannel(channel); }; }, [loadCases]);

  const visible = useMemo(() => cases.filter((entry) => {
    if (filter === "active" && !["open", "under_review"].includes(entry.status)) return false;
    if (filter === "closed" && !["resolved", "waived"].includes(entry.status)) return false;
    const query = search.trim().toLowerCase();
    return !query || [entry.case_number, entry.item_name, entry.student_name, entry.student_id].some((value) => String(value || "").toLowerCase().includes(query));
  }), [cases, filter, search]);
  const openCount = cases.filter((entry) => ["open", "under_review"].includes(entry.status)).length;

  async function beginReview(entry) {
    setSaving(true); setError("");
    try { const response = await authenticatedFetch(`/api/accountability/${entry.id}`, { method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"under_review"}) }); const body=await response.json(); if(!response.ok) throw new Error(body.reasons?.[0] || body.message); await loadCases(); setSelected((current) => current ? {...current,status:"under_review"} : current); }
    catch(caught){setError(caught.message);} finally{setSaving(false);}
  }
  async function closeCase(event) {
    event.preventDefault(); setSaving(true); setError("");
    const payload = { ...resolution, status: resolution.resolutionType === "waived" ? "waived" : "resolved" };
    try { const response=await authenticatedFetch(`/api/accountability/${selected.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); const body=await response.json(); if(!response.ok) throw new Error(body.reasons?.[0] || body.message); setSelected(null); await loadCases(); }
    catch(caught){setError(caught.message);} finally{setSaving(false);}
  }

  return <div className="accountability-page">
    <header><div><span className="accountability-icon"><FaShieldAlt /></span><div><h1>{staff ? "Accountability Cases" : "My Accountability"}</h1><p>{staff ? "Review damage or loss cases and record a fair, documented resolution." : "View any equipment concerns and the steps needed to restore borrowing access."}</p></div></div><div className={openCount ? "case-count attention" : "case-count"}><strong>{openCount}</strong><span>Active</span></div></header>
    {!staff && openCount > 0 && <div className="accountability-guidance"><FaExclamationTriangle /><div><strong>Borrowing is temporarily unavailable</strong><p>Contact the stockroom and reference the case number below. Access returns automatically after all active cases are resolved or waived.</p></div></div>}
    {!staff && openCount === 0 && !loading && <div className="accountability-guidance clear"><FaCheckCircle /><div><strong>No unresolved accountability cases</strong><p>Your account has no damage or loss restrictions.</p></div></div>}
    <section className="accountability-panel"><div className="accountability-tools"><div><FaSearch /><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search cases or items" /></div><select value={filter} onChange={(event)=>setFilter(event.target.value)}><option value="active">Active cases</option><option value="closed">Resolved history</option><option value="all">All cases</option></select></div>
      {error && <p className="accountability-error" role="alert">{error}</p>}{loading && <p className="accountability-empty">Loading cases…</p>}
      {!loading && visible.length===0 && <p className="accountability-empty">No cases match this view.</p>}
      {!loading && visible.length>0 && <div className="accountability-list">{visible.map((entry)=><article key={entry.id}><div className={`case-mark ${entry.incident_type}`}>{entry.incident_type === "damaged" ? "D" : entry.incident_type === "missing" ? "M" : "O"}</div><div className="case-main"><div><strong>{entry.case_number}</strong><span className={`case-status ${entry.status}`}>{LABELS[entry.status]}</span></div><h2>{entry.item_name}</h2><p>{entry.affected_quantity} {entry.incident_type} unit(s) · Request BR-{String(entry.request_id).padStart(3,"0")}</p>{staff && <small>{entry.student_name} · {entry.student_id}</small>}</div><button title="View case" onClick={()=>{setSelected(entry);setError("");setResolution({status:"resolved",resolutionType:RESOLUTIONS[entry.incident_type][0][0],resolutionNote:"",amount:"",confirmPayment:false});}}><FaEye /></button></article>)}</div>}
    </section>
    {selected && <div className="modal-overlay" onClick={()=>!saving&&setSelected(null)}><section className="accountability-dialog" onClick={(event)=>event.stopPropagation()} role="dialog" aria-modal="true"><header><div><span>{selected.case_number}</span><h2>{selected.item_name}</h2></div><button onClick={()=>setSelected(null)} aria-label="Close"><FaTimes /></button></header>{error&&<p className="accountability-error" role="alert">{error}</p>}<div className="case-details"><dl>{staff&&<div><dt>Borrower</dt><dd>{selected.student_name} ({selected.student_id})</dd></div>}<div><dt>Issue</dt><dd>{selected.affected_quantity} {selected.incident_type} unit(s)</dd></div><div><dt>Status</dt><dd>{LABELS[selected.status]}</dd></div><div><dt>Opened</dt><dd>{dateTime(selected.created_at)}</dd></div></dl><div><span>Description / evidence</span><p>{selected.description}</p></div>{selected.resolution_note&&<div><span>Resolution</span><p>{selected.resolution_note}</p></div>}</div>
      {!staff && ["open","under_review"].includes(selected.status)&&<div className="student-next-step"><strong>What should I do?</strong><p>Contact the stockroom, provide this case number, and bring the affected item or supporting information if available.</p></div>}
      {admin && selected.status==="open"&&<div className="case-quick-action"><button disabled={saving} onClick={()=>beginReview(selected)}>Mark as Under Review</button></div>}
      {admin && ["open","under_review"].includes(selected.status)&&<form onSubmit={closeCase}><h3>Close this case</h3><label>Resolution<select value={resolution.resolutionType} onChange={(event)=>setResolution({...resolution,resolutionType:event.target.value,confirmPayment:false})}>{RESOLUTIONS[selected.incident_type].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>{resolution.resolutionType==="payment_recorded"&&<><label>Confirmed amount<input type="number" min="0" step="0.01" required value={resolution.amount} onChange={(event)=>setResolution({...resolution,amount:event.target.value})}/></label><label className="confirmation-check"><input type="checkbox" required checked={resolution.confirmPayment} onChange={(event)=>setResolution({...resolution,confirmPayment:event.target.checked})}/><span>I confirm that staff verified this payment. The system does not calculate or impose this amount automatically.</span></label></>}<label>Resolution notes<textarea required minLength="5" maxLength="1000" rows="3" value={resolution.resolutionNote} onChange={(event)=>setResolution({...resolution,resolutionNote:event.target.value})} placeholder="Describe what was verified and how the case was settled." /></label><button disabled={saving}>{saving?"Saving…":"Confirm and Close Case"}</button></form>}
    </section></div>}
  </div>;
}
