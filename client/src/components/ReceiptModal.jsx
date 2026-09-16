import { useEffect, useState } from "react";
import { FaPrint, FaReceipt, FaTimes } from "react-icons/fa";
import { authenticatedFetch } from "../lib/api";
import "../styles/receipts.css";

const dateTime = (value) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default function ReceiptModal({ requestId, onClose }) {
  const [receipts, setReceipts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/receipts/request/${requestId}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message || "Unable to load receipts."); if (active) { setReceipts(body.receipts); setSelected(body.receipts.at(-1) || null); } }).catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId]);
  const details = selected?.snapshot || {};
  return <div className="modal-overlay receipt-overlay" onClick={onClose}><section className="receipt-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Transaction receipts">
    <header><div><span><FaReceipt /> Official transaction record</span><h2>Borrowing Receipts</h2></div><button onClick={onClose} aria-label="Close"><FaTimes /></button></header>
    {loading && <p className="receipt-state">Loading receipts...</p>}{error && <p className="receipt-state error">{error}</p>}
    {!loading && !error && receipts.length === 0 && <p className="receipt-state">No claim or return receipt has been generated for this request yet.</p>}
    {receipts.length > 0 && <><nav className="receipt-tabs">{receipts.map((receipt) => <button className={selected?.id === receipt.id ? "active" : ""} onClick={() => setSelected(receipt)} key={receipt.id}>{receipt.receipt_type === "claim" ? "Claim" : "Return"}<small>{receipt.receipt_number}</small></button>)}</nav>
      {selected && <article className="official-receipt">
        <div className="receipt-brand"><div><strong>CTHM Stockroom</strong><span>Official {selected.receipt_type === "claim" ? "Borrowing Claim" : "Return"} Receipt</span></div><b>{selected.receipt_number}</b></div>
        <dl><div><dt>Borrower</dt><dd>{details.studentName}</dd></div><div><dt>Student ID</dt><dd>{details.studentId}</dd></div><div><dt>Request</dt><dd>BR-{String(details.requestId).padStart(3,"0")}</dd></div><div><dt>Processed</dt><dd>{dateTime(selected.created_at)}</dd></div><div><dt>Processed by</dt><dd>{details.processedBy || "Former staff account"}</dd></div><div><dt>Borrowing period</dt><dd>{details.borrowDate} to {details.returnDate}</dd></div></dl>
        <div className="receipt-purpose"><span>Purpose</span><p>{details.purpose || "—"}</p></div>
        <table><thead><tr><th>Item</th><th>Details</th></tr></thead><tbody>{(details.items || []).map((item) => <tr key={item.inventoryId}><td><strong>{item.name}</strong></td><td>{selected.receipt_type === "claim" ? `${item.quantity} unit(s)` : `${item.goodQuantity} good · ${item.damagedQuantity} damaged · ${item.missingQuantity} missing`}{item.conditionNote && <small>{item.conditionNote}</small>}{(item.assets || []).map((asset) => <small key={asset.assetNumber}>{asset.assetNumber}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}{asset.condition ? ` · ${asset.condition}` : ""}</small>)}</td></tr>)}</tbody></table>
        {details.remarks && <div className="receipt-purpose"><span>Remarks</span><p>{details.remarks}</p></div>}
        <footer><div><span>Verification code</span><code>{selected.verification_code}</code><small>Verify at /api/receipts/verify/{selected.verification_code}</small></div><p>This system-generated record is immutable.</p></footer>
      </article>}
      <div className="receipt-actions"><button onClick={() => window.print()}><FaPrint /> Print Receipt</button></div></>}
  </section></div>;
}
