import "../styles/borrowingTimeline.css";

const DOCUMENT_LABELS = {
  authorization_in_progress: "Authorization in Progress",
  approved: "Approved",
  released: "Released",
  partially_returned: "Partially Returned",
  finalized: "Finalized",
};

function displayTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function BorrowingTimeline({ request }) {
  if (!request) return null;
  const status = String(request.status || "").toLowerCase();
  const partialReturn = request.documentState === "partially_returned";
  const steps = [
    { label: "Request Submitted", actor: request.studentName || request.student, at: request.requestedAt, done: Boolean(request.requestedAt) },
    { label: "Professor Authorized", actor: request.authorizedBy, at: request.authorizedAt, done: Boolean(request.authorizedAt) },
    { label: "Staff Verified", actor: request.custodianVerifiedBy, at: request.custodianVerifiedAt, done: Boolean(request.custodianVerifiedAt) },
    { label: "Department Head Approved", actor: request.custodianApprovedBy, at: request.custodianApprovedAt, done: Boolean(request.custodianApprovedAt) },
    { label: "Items Released", actor: request.releasedBy, at: request.releasedAt, done: Boolean(request.releasedAt) },
    { label: partialReturn ? "Items Partially Returned" : "Items Returned", actor: request.returnedBy, at: request.returnedAt || request.actualReturnedAt, done: status === "returned", partial: partialReturn },
  ];
  const firstPending = steps.findIndex((step) => !step.done && !step.partial);
  const terminal = ["rejected", "expired"].includes(status);
  const summary = terminal
    ? `This request is ${status}.`
    : request.overdue
      ? "This borrowing is overdue and requires immediate return."
      : "Completed steps are permanently recorded.";

  return <section className="borrowing-timeline" aria-label="Borrowing workflow timeline">
    <div className="borrowing-timeline-header"><div><h3>Workflow Timeline</h3><p>{summary}</p></div><span className={`document-state ${request.documentState || "authorization_in_progress"}`}>{DOCUMENT_LABELS[request.documentState] || "Authorization in Progress"}</span></div>
    <ol>{steps.map((step, index) => {
      const state = step.done ? "complete" : step.partial ? "partial" : !terminal && index === firstPending ? "current" : "pending";
      return <li className={state} key={step.label}><span className="timeline-marker" aria-hidden="true">{step.done ? "\u2713" : index + 1}</span><div><strong>{step.label}</strong>{step.actor && <span>{step.actor}</span>}{step.at && <time>{displayTime(step.at)}</time>}{state === "current" && <small>Next required action</small>}</div></li>;
    })}</ol>
  </section>;
}
