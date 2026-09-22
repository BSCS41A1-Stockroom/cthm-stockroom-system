import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/api";
import { useFeedback } from "../../common/feedbackContext";
import "../../../styles/closureManager.css";

const EMPTY = { title: "", startDate: "", endDate: "", departmentId: "", sourceUrl: "", sourceKind: "official_holiday" };

export default function ClosureManager({ onChange }) {
  const { confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [caption, setCaption] = useState("");
  const [draftSourceUrl, setDraftSourceUrl] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [closures, setClosures] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [closureResponse, optionResponse, reviewResponse] = await Promise.all([
        authenticatedFetch("/api/calendar-closures"),
        authenticatedFetch("/api/borrowings/assignment-options"),
        authenticatedFetch("/api/calendar-closures/announcements"),
      ]);
      const [closureBody, optionBody, reviewBody] = await Promise.all([closureResponse.json(), optionResponse.json(), reviewResponse.json()]);
      if (!closureResponse.ok || !optionResponse.ok || !reviewResponse.ok) throw new Error(closureBody.message || optionBody.message || reviewBody.message || "Unable to load closure settings.");
      setClosures(closureBody.closures || []);
      setDepartments(optionBody.departments || []);
      setReviews(reviewBody.reviews || []);
    } catch (reason) { setError(reason.message); }
  }, []);

  useEffect(() => { if (open) { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); } return undefined; }, [open, load]);

  const suggest = async () => {
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch("/api/calendar-closures/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: caption }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to review announcement.");
      setSuggestion(body);
      if (selectedReviewId && body.dates.length) setForm((current) => ({ ...current, startDate: body.dates[0], endDate: body.dates.at(-1) }));
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const saveDraft = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch("/api/calendar-closures/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, sourceUrl: draftSourceUrl }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to save announcement for review.");
      setCaption(""); setDraftSourceUrl(""); setSuggestion(null); setSelectedReviewId(null); setForm(EMPTY);
      setNotice("Announcement saved for review. No dates have been blocked.");
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const selectReview = (review) => {
    setSelectedReviewId(review.id); setCaption(review.caption);
    setSuggestion({ possibleSuspension: review.possible_suspension,
      dates: review.suggested_start_date ? [review.suggested_start_date, review.suggested_end_date] : [],
      warnings: review.warnings || [] });
    setForm({ ...EMPTY, sourceKind: "school_announcement", title: "Class suspension", startDate: review.suggested_start_date || "",
      endDate: review.suggested_end_date || "", sourceUrl: review.source_url || "" });
    setError(""); setNotice("");
  };

  const dismissReview = async (review) => {
    const accepted = await confirm(`Dismiss this announcement without blocking any dates?`, { title: "Dismiss announcement?", confirmLabel: "Dismiss" });
    if (!accepted) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/calendar-closures/announcements/${review.id}/dismiss`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to dismiss announcement.");
      if (selectedReviewId === review.id) { setSelectedReviewId(null); setForm(EMPTY); setCaption(""); setSuggestion(null); }
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const save = async (event) => {
    event.preventDefault();
    const accepted = await confirm(`Block ${form.startDate}${form.endDate !== form.startDate ? ` through ${form.endDate}` : ""} for ${form.departmentId ? "the selected department" : "all departments"}? Existing requests will be flagged.`, { title: "Confirm calendar closure?", confirmLabel: "Block dates" });
    if (!accepted) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch("/api/calendar-closures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, reviewId: form.sourceKind === "school_announcement" ? selectedReviewId : null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to confirm closure.");
      setNotice(`Dates blocked. ${body.affectedRequests} existing request(s) were flagged and notified.`);
      setForm(EMPTY); setCaption(""); setSuggestion(null); setSelectedReviewId(null);
      await Promise.all([load(), onChange()]);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const deactivate = async (closure) => {
    const accepted = await confirm(`Remove the closure for ${closure.title}? New schedules could then be submitted.`, { title: "Reopen these dates?", confirmLabel: "Reopen dates" });
    if (!accepted) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/calendar-closures/${closure.id}/deactivate`, { method: "PATCH" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to reopen dates.");
      await Promise.all([load(), onChange()]);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  return <section className="closure-manager">
    <button type="button" className="closure-manager-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      {open ? "Hide closure controls" : "Manage holidays & class suspensions"}
    </button>
    {open && <div className="closure-manager-panel">
      <h3>Announcement review queue</h3>
      <p>Paste an official announcement and save it for review. Suggestions never block dates until you confirm them.</p>
      {selectedReviewId && <button type="button" onClick={() => { setSelectedReviewId(null); setCaption(""); setSuggestion(null); setForm(EMPTY); }}>New announcement</button>}
      <label>Announcement caption<textarea readOnly={Boolean(selectedReviewId)} value={caption} maxLength={10000} onChange={(event) => setCaption(event.target.value)} rows={3} /></label>
      {!selectedReviewId && <label>Official post link (optional)<input type="url" value={draftSourceUrl} onChange={(event) => setDraftSourceUrl(event.target.value)} placeholder="https://facebook.com/..." /></label>}
      <button type="button" onClick={suggest} disabled={busy || !caption.trim()}>Suggest dates from caption</button>
      {!selectedReviewId && <button type="button" onClick={saveDraft} disabled={busy || caption.trim().length < 10}>Save for review</button>}
      <h4>Pending announcements</h4>
      <ul className="closure-manager-list">{reviews.filter((review) => review.status === "pending").map((review) => <li key={review.id}>
        <span><strong>{review.possible_suspension ? "Possible suspension" : "Needs manual review"}</strong> · {review.caption.slice(0, 110)}{review.caption.length > 110 ? "…" : ""}<br />{review.source_url && <a href={review.source_url} target="_blank" rel="noopener noreferrer">Open source post</a>}</span>
        <button type="button" disabled={busy} onClick={() => selectReview(review)}>Review</button>
        <button type="button" disabled={busy} onClick={() => dismissReview(review)}>Dismiss</button>
      </li>)}</ul>
      {!reviews.some((review) => review.status === "pending") && <p>No announcements awaiting review.</p>}
      <h3>{selectedReviewId ? "Confirm selected announcement" : "Confirm a holiday"}</h3>
      {selectedReviewId && <p>Check the original source, school, dates, and affected department before confirming.</p>}
      {suggestion && <div className="closure-suggestion" role="status">
        <strong>{suggestion.possibleSuspension ? "Possible class suspension" : "Not clearly a class suspension"}</strong>
        <p>{suggestion.dates.length ? `Detected: ${suggestion.dates[0]}${suggestion.dates.length > 1 ? ` to ${suggestion.dates.at(-1)}` : ""}` : "No reliable date detected."}</p>
        {suggestion.warnings.map((warning) => <small key={warning}>{warning}</small>)}
      </div>}
      <form onSubmit={save} className="closure-form">
        <label>Closure type<select value={form.sourceKind} onChange={(event) => setForm({ ...form, sourceKind: event.target.value })}><option value="school_announcement" disabled={!selectedReviewId}>School announcement</option><option value="official_holiday">Official holiday</option></select></label>
        <label>Reason<input required minLength={3} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>First closed date<input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
        <label>Last closed date<input required type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
        <label>Department<select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
          <option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select></label>
        <label>Official post link (optional)<input type="url" value={form.sourceUrl} readOnly={Boolean(selectedReviewId)} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://facebook.com/..." /></label>
        <button type="submit" disabled={busy || (form.sourceKind === "school_announcement" && !selectedReviewId)}>Confirm and block dates</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <h3>Confirmed closures</h3>
      <ul className="closure-manager-list">{closures.filter((closure) => !closure.source_key).map((closure) => <li key={closure.id}>
        <span><strong>{closure.title}</strong> · {closure.start_date}{closure.end_date !== closure.start_date ? `–${closure.end_date}` : ""}{closure.department_name ? ` · ${closure.department_name}` : ""}</span>
        <button type="button" disabled={busy} onClick={() => deactivate(closure)}>Reopen</button>
      </li>)}</ul>
    </div>}
  </section>;
}
