import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
import "../../styles/audit-logs.css";

const ACTIONS = [
  "borrowing_submitted", "borrowing_status_changed", "borrowing_return_processed", "borrowing_overdue_detected", "user_invited", "user_profile_updated", "inventory_created",
  "inventory_updated", "inventory_deleted", "calendar_event_created",
  "calendar_event_updated", "calendar_event_deleted", "unavailability_created",
  "unavailability_updated", "unavailability_deleted",
];

function label(value) {
  return value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ search: "", action: "", entityType: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const loadLogs = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page) });
      Object.entries(applied).forEach(([key, value]) => { if (value) query.set(key, value); });
      const response = await authenticatedFetch(`/api/audit-logs?${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load activity logs.");
      if (sequence === requestSequence.current) {
        setLogs(result.logs);
        setPagination(result.pagination);
      }
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.message);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    const timer = window.setTimeout(loadLogs, 0);
    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [loadLogs]);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  }

  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return (
    <div className="audit-page">
      <header><h1>Activity Logs</h1><p>Trace important changes made throughout the stockroom system.</p></header>
      <form className="audit-filters" onSubmit={applyFilters}>
        <label>Search<input value={filters.search} maxLength="100" placeholder="User or record ID" onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></label>
        <label>Action<select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}><option value="">All actions</option>{ACTIONS.map((action) => <option key={action} value={action}>{label(action)}</option>)}</select></label>
        <label>Record type<select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}><option value="">All records</option><option value="borrowing_request">Borrowing Request</option><option value="inventory">Inventory</option><option value="calendar_event">Calendar Event</option><option value="inventory_unavailability">Unavailability Period</option></select></label>
        <button type="submit">Apply Filters</button>
      </form>

      {error && <p className="audit-state error">{error} <button type="button" onClick={loadLogs}>Retry</button></p>}
      <div className="audit-table-wrap">
        <table className="audit-table"><thead><tr><th>Date and Time</th><th>User</th><th>Action</th><th>Record</th><th>Change</th></tr></thead>
          <tbody>
            {logs.map((log) => <tr key={log.id}>
              <td>{new Date(log.created_at).toLocaleString()}</td>
              <td><strong>{log.actor_name || log.actor_email || "System"}</strong><small>{log.actor_role || "system"}</small></td>
              <td><span className="audit-action">{label(log.action)}</span></td>
              <td>{label(log.entity_type)}{log.entity_id && <small>#{log.entity_id}</small>}</td>
              <td><details><summary>View details</summary><pre>{JSON.stringify({ before: log.old_values, after: log.new_values, ...log.metadata }, null, 2)}</pre></details></td>
            </tr>)}
            {!loading && logs.length === 0 && <tr><td colSpan="5" className="audit-empty">No matching activities found.</td></tr>}
          </tbody></table>
        {loading && <p className="audit-state">Loading activity logs...</p>}
      </div>
      <footer className="audit-pagination"><span>{pagination.total} activities</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>
    </div>
  );
}
