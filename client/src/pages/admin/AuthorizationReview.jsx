import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api";
import "../../styles/authorization.css";

const displayDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "—";

export default function AuthorizationReview() {
  const { token } = useParams();
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    authenticatedFetch(`/api/authorizations/${token}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setReview(body.review);
    }).catch((requestError) => setError(requestError.message));
  }, [token]);

  const authorize = async () => {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/authorizations/${token}/authorize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setDone(true);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const downloadSignedForm = async () => {
    setDownloading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/authorizations/${token}/document`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Unable to download the signed form.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `Borrowers-Form-BR-${String(review.id).padStart(3, "0")}-Signed.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) { setError(requestError.message); }
    finally { setDownloading(false); }
  };

  if (error && !review) return <main className="authorization-page"><div className="authorization-state error">{error}</div></main>;
  if (!review) return <main className="authorization-page"><div className="authorization-state">Loading authorization document...</div></main>;
  if (done) return <main className="authorization-page"><div className="authorization-state success"><h1>Request authorized</h1><p>The signed snapshot is preserved and now awaits final admin approval.</p>{error && <p className="authorization-message error">{error}</p>}<div className="authorization-complete-actions"><button type="button" className="authorize-button" disabled={downloading} onClick={downloadSignedForm}>{downloading ? "Preparing form..." : "Download signed form"}</button><Link to="/professor/requests">Return to requests</Link></div></div></main>;

  return <main className="authorization-page">
    <header><span>Official borrower’s form review</span><h1>BR-{String(review.id).padStart(3, "0")}</h1><p>Review every field before applying your saved electronic signature.</p></header>
    <article className="authorization-document">
      <div className="document-heading"><h2>BORROWER’S FORM</h2><b>{review.authorization_status}</b></div>
      <dl><div><dt>Student</dt><dd>{review.student_name}</dd></div><div><dt>Student ID</dt><dd>{review.student_id}</dd></div><div><dt>Borrow date</dt><dd>{displayDate(review.borrow_date)}</dd></div><div><dt>Return date</dt><dd>{displayDate(review.return_date)}</dd></div></dl>
      <section><h3>Requested items</h3><table><thead><tr><th>Description</th><th>Quantity</th></tr></thead><tbody>{review.items.map((item) => <tr key={item.inventoryId}><td>{item.name}</td><td>{item.quantity}</td></tr>)}</tbody></table></section>
      <section><h3>Purpose</h3><p>{review.purpose}</p></section>
      <div className="authorization-signature-line"><span>Noted By</span>{review.signature_preview && <img src={review.signature_preview} alt="Signature to be applied" style={{ maxWidth: 220, maxHeight: 80, objectFit: "contain", objectPosition: "left center" }} />}<strong>{review.current_professor_name}</strong><small>Instructor / Department Head — Signature Over Printed Name | Date</small></div>
    </article>
    {!review.signature_configured && <div className="authorization-warning">Save your signature before authorizing. <Link to="/professor/signature">Open Signature Settings</Link></div>}
    {error && <p className="authorization-message error">{error}</p>}
    <label className="authorization-consent"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed this request and authorize the system to apply my registered signature, printed name, and current timestamp.</span></label>
    <button className="authorize-button" type="button" disabled={!confirmed || !review.signature_configured || busy || review.authorization_status !== "awaiting"} onClick={authorize}>{busy ? "Authorizing..." : "Authorize and Sign"}</button>
  </main>;
}
