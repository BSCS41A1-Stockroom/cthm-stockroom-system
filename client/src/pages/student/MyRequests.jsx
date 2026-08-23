import { useState, useEffect, useMemo } from "react";
import "./MyRequests.css";
import { authenticatedFetch } from "../../lib/api";

const STATUS_META = {
  pending: { label: "Pending", className: "badge-pending" },
  approved: { label: "Approved", className: "badge-approved" },
  borrowed: { label: "Borrowed", className: "badge-approved" },
  rejected: { label: "Rejected", className: "badge-rejected" },
  returned: { label: "Returned", className: "badge-returned" },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || "Unknown", className: "badge-unknown" };
  return <span className={`status-badge ${meta.className}`}>{meta.label}</span>;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function MyRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeRequest, setActiveRequest] = useState(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await authenticatedFetch("/api/borrowings");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : data.requests || []);
    } catch {
      setLoadError(
        "Couldn't load your requests. Check that the server is running and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const matchesStatus = statusFilter === "all" || req.status === statusFilter;
      if (!matchesStatus) return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const itemNames = (req.items || []).map((i) => i.name?.toLowerCase() || "").join(" ");
      const purpose = req.purpose?.toLowerCase() || "";
      return itemNames.includes(q) || purpose.includes(q);
    });
  }, [requests, search, statusFilter]);

  return (
    <div className="requests-page">
      <header className="requests-header">
        <h1>My Requests</h1>
        <p className="requests-subtitle">
          Track every item you've borrowed and see where each request stands.
        </p>
      </header>

      <section className="requests-panel">
        <div className="filter-bar">
          <div className="search-field">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search by item or purpose…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search requests"
            />
          </div>

          <div className="status-tabs">
            {["all", "pending", "approved", "borrowed", "rejected", "returned"].map((s) => (
              <button
                key={s}
                type="button"
                className={`status-tab ${statusFilter === s ? "active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="state-msg">Loading your requests…</p>}
        {loadError && (
          <div className="state-msg error">
            {loadError}{" "}
            <button type="button" className="retry-btn" onClick={fetchRequests}>
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <div className="table-wrap">
            <table className="requests-table">
              <thead>
                <tr>
                  <th>Items</th>
                  <th>Borrow date</th>
                  <th>Return date</th>
                  <th>Status</th>
                  <th className="col-action" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No requests match what you're looking for.
                    </td>
                  </tr>
                )}
                {filteredRequests.map((req) => {
                  const items = req.items || [];
                  const preview = items
                    .slice(0, 2)
                    .map((i) => i.name)
                    .join(", ");
                  const extra = items.length > 2 ? ` +${items.length - 2} more` : "";
                  return (
                    <tr key={req.id}>
                      <td>
                        <span className="items-preview">{preview || "—"}{extra}</span>
                      </td>
                      <td className="muted">{formatDate(req.borrowDate)}</td>
                      <td className="muted">{formatDate(req.returnDate)}</td>
                      <td>
                        <StatusBadge status={req.status} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="view-btn"
                          onClick={() => setActiveRequest(req)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activeRequest && (
        <div className="modal-overlay" onClick={() => setActiveRequest(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Request details</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveRequest(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="modal-status-row">
              <StatusBadge status={activeRequest.status} />
              {activeRequest.requestedAt && (
                <span className="requested-at">
                  Requested {formatDate(activeRequest.requestedAt)}
                </span>
              )}
            </div>

            <div className="modal-section">
              <h3>Items</h3>
              <ul className="modal-items">
                {(activeRequest.items || []).map((item, idx) => (
                  <li key={idx}>
                    <span>{item.name}</span>
                    <span className="modal-qty">
                      ×{item.quantity} {item.unit || ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="modal-grid">
              <div>
                <h3>Borrow date</h3>
                <p>{formatDate(activeRequest.borrowDate)}</p>
              </div>
              <div>
                <h3>Return date</h3>
                <p>{formatDate(activeRequest.returnDate)}</p>
              </div>
            </div>

            <div className="modal-section">
              <h3>Purpose</h3>
              <p>{activeRequest.purpose || "—"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
