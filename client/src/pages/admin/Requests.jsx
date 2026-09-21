import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaSearch,
  FaEye,
  FaCheck,
  FaTimes,
  FaUndo,
  FaReceipt,
  FaDownload,
} from "react-icons/fa";

import "../../styles/requests.css";
import { supabase } from "../../lib/supabase";
import { authenticatedFetch } from "../../lib/api";
import ReceiptModal from "../../components/ReceiptModal";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { isInRoleQueue, stageLabel } from "../../utils/requestWorkflow";
import BorrowingTimeline from "../../components/BorrowingTimeline";

function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export default function Requests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [view, setView] = useState("queue");
  const [selected, setSelected] = useState(null);
  const [returnRequest, setReturnRequest] = useState(null);
  const [returnForm, setReturnForm] = useState({ items: [], remarks: "" });
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [receiptRequestId, setReceiptRequestId] = useState(null);
  const [custodianAction, setCustodianAction] = useState(null);
  const [custodianConfirmed, setCustodianConfirmed] = useState(false);
  const [custodianBusy, setCustodianBusy] = useState(false);
  const [documentBusyId, setDocumentBusyId] = useState(null);
  const loadSequence = useRef(0);
  const ITEMS_PER_PAGE = 8;

  const [page,setPage] = useState(1);

  const loadRequests = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");

    try {
      const response = await authenticatedFetch("/api/borrowings");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load borrowing requests.");
      const nextRequests = (result.requests || []).map((request) => {
        const requestItems = request.items || [];
        return {
          databaseId: request.id,
          id: `BR-${String(request.id).padStart(3, "0")}`,
          student: request.studentName,
          studentId: request.studentId,
          item: requestItems.map((item) => item.name).join(", ") || "No items",
          quantity: requestItems.reduce((sum, item) => sum + Number(item.quantity), 0),
          items: requestItems,
          borrowDate: formatDate(request.borrowDate),
          returnDate: formatDate(request.returnDate),
          actualReturnedAt: request.actualReturnedAt,
          overdue: request.overdue,
          purpose: request.purpose || "-",
          department: request.departmentName || "Not assigned",
          section: request.sectionName || "Not assigned",
          assignedProfessor: request.assignedProfessorName || "Not assigned",
          status: request.status.charAt(0).toUpperCase() + request.status.slice(1),
          authorizationToken: request.authorizationToken,
          authorizationStatus: request.authorizationStatus,
          authorizedBy: request.authorizedBy,
          authorizedAt: request.authorizedAt,
          custodianVerifiedBy: request.custodianVerifiedBy,
          custodianVerifiedAt: request.custodianVerifiedAt,
          custodianApprovedBy: request.custodianApprovedBy,
          custodianApprovedAt: request.custodianApprovedAt,
          requestedAt: request.requestedAt,
          releasedBy: request.releasedBy,
          releasedAt: request.releasedAt,
          returnedBy: request.returnedBy,
          returnedAt: request.returnedAt,
          documentState: request.documentState,
        };
      });
      if (sequence === loadSequence.current) setRequests(nextRequests);
    } catch (error) {
      if (sequence === loadSequence.current) {
        setLoadError(error.message);
        setRequests([]);
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  function openReturn(request) {
    setReturnError("");
    setReturnRequest(request);
    setReturnForm({ idempotencyKey: crypto.randomUUID(), remarks: "", items: request.items.map((item) => ({
      inventoryId: item.inventoryId, name: item.name,
      outstandingQuantity: Number(item.outstandingQuantity ?? item.quantity),
      goodQuantity: 0, damagedQuantity: 0, missingQuantity: 0, conditionNote: "",
    })) });
  }

  async function submitReturn(event) {
    event.preventDefault();
    const accounted = returnForm.items.reduce((sum, item) => sum + item.goodQuantity + item.damagedQuantity + item.missingQuantity, 0);
    const exceeded = returnForm.items.find((item) => item.goodQuantity + item.damagedQuantity + item.missingQuantity > item.outstandingQuantity);
    const missingNote = returnForm.items.find((item) => (item.damagedQuantity > 0 || item.missingQuantity > 0) && item.conditionNote.trim().length < 5);
    if (accounted <= 0 || exceeded || missingNote) {
      setReturnError(exceeded ? `Entered quantities exceed the outstanding units for ${exceeded.name}.`
        : missingNote ? `Add a condition note of at least 5 characters for damaged or missing units of ${missingNote.name}.`
          : "Enter at least one returned, damaged, or missing unit.");
      return;
    }
    setReturning(true);
    setReturnError("");
    try {
      const response = await authenticatedFetch(`/api/borrowings/${returnRequest.databaseId}/returns`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(returnForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.reasons?.[0] || result.message || "Unable to process the return.");
      setReturnRequest(null);
      await loadRequests();
    } catch (error) {
      setReturnError(error.message);
    } finally {
      setReturning(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(loadRequests, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-borrow-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_requests" }, loadRequests)
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_request_items" }, loadRequests)
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_request_custodian_authorizations" }, loadRequests)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  const queueCount = useMemo(
    () => requests.filter((request) => isInRoleQueue(request, profile?.role)).length,
    [requests, profile?.role],
  );

  const filtered = useMemo(() => {
    const viewRequests = profile?.role === "admin" || view === "all"
      ? requests
      : requests.filter((request) => isInRoleQueue(request, profile?.role));
    return viewRequests.filter((r) => {
      const matchesSearch =
        r.student.toLowerCase().includes(search.toLowerCase()) ||
        r.item.toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "All" || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter, view, profile?.role]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  const paginated = filtered.slice(
      (page-1)*ITEMS_PER_PAGE,
      page*ITEMS_PER_PAGE
  );

  const updateStatus = async (id, status) => {
    const request = requests.find((item) => item.id === id);
    if (!request) return;

    setLoadError("");
    const response = await authenticatedFetch(`/api/borrowings/${request.databaseId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();

    if (!response.ok) {
      setLoadError(result.message || "Unable to update request status.");
      return;
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status } : r
      )
    );

    if (selected?.id === id) {
      setSelected({
        ...selected,
        status,
      });
    }
  };

  const submitCustodianAction = async () => {
    if (!custodianAction || !custodianConfirmed) return;
    const completedAction = custodianAction;
    setCustodianBusy(true); setLoadError("");
    try {
      const response = await authenticatedFetch(`/api/authorizations/requests/${completedAction.request.databaseId}/${completedAction.type}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to complete custodian authorization.");
      setCustodianConfirmed(false);
      await loadRequests();
      if (completedAction.type === "verify") {
        setCustodianAction(null);
      } else {
        setCustodianAction(null);
      }
    } catch (error) { setLoadError(error.message); }
    finally { setCustodianBusy(false); }
  };

  const downloadBorrowerForm = async (request) => {
    setDocumentBusyId(request.databaseId); setLoadError("");
    try {
      const response = await authenticatedFetch(`/api/authorizations/${request.authorizationToken}/document`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Unable to download the borrower form.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Borrowers-Form-${request.id}.docx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (error) { setLoadError(error.message); }
    finally { setDocumentBusyId(null); }
  };

  return (
    <div className="requests-page">

      <div className="requests-header">

          <div className="requests-title">
              <h2>Borrow Requests</h2>
              <p>{profile?.role === "staff" ? "Verify requests and track items ready for release or return." : "Manage all departments and give final Custodian Head approval to staff-verified requests."}</p>
          </div>

          <div className="requests-count">
              <span>{filtered.length}</span>
          </div>

      </div>

      {profile?.role !== "admin" && <div className="request-view-tabs" role="tablist" aria-label="Request views">
        <button type="button" role="tab" aria-selected={view === "queue"} className={view === "queue" ? "active" : ""} onClick={() => { setView("queue"); setPage(1); }}>My Work Queue <span>{queueCount}</span></button>
        <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? "active" : ""} onClick={() => { setView("all"); setPage(1); }}>All Department Requests <span>{requests.length}</span></button>
      </div>}

      <div className="requests-toolbar">

          <div className="search-box">
              <FaSearch />
              <input
                  type="text"
                  placeholder="Search request..."
                  value={search}
                  onChange={(e)=>{ setSearch(e.target.value); setPage(1); }}
              />
          </div>

          <select
              value={statusFilter}
              onChange={(e)=>{ setStatusFilter(e.target.value); setPage(1); }}
          >
              <option>All</option>
              <option>Pending</option>
              <option>Validated</option>
              <option value="Approved">Ready for Claim</option>
              <option>Borrowed</option>
              <option>Rejected</option>
              <option>Expired</option>
              <option>Returned</option>
          </select>

      </div>

      {loadError && <p className="form-error">{loadError}</p>}
        
      <div className="requests-table-wrapper">

      <table className="requests-table">

          <thead>

            <tr>
              <th>ID</th>
              <th>Student</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Borrow</th>
              <th>Return</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>

          </thead>

          <tbody>

            {loading && (
              <tr>
                <td colSpan={8} className="requests-empty">Loading requests...</td>
              </tr>
            )}

            {!loading && paginated.length === 0 && (
              <tr>
                <td colSpan={8} className="requests-empty">{view === "queue" && profile?.role !== "admin" ? "No requests currently require your action." : "No borrowing requests found."}</td>
              </tr>
            )}

            {paginated.map((r) => (

              <tr key={r.id}>

                <td>{r.id}</td>

                <td>{r.student}</td>

                <td>{r.item}</td>

                <td>{r.quantity}</td>

                <td>{r.borrowDate}</td>

                <td>{r.returnDate}</td>

                <td>
                  <span
                    className={`status-badge ${r.status.toLowerCase()}`}
                  >
                    {stageLabel(r)}{r.overdue ? " · Overdue" : ""}
                  </span>
                </td>

                <td>

                  <div className="action-buttons">

                    <button
                      className="view-btn"
                      onClick={() =>
                        setSelected(r)
                      }
                    >
                      <FaEye />
                    </button>

                    {r.status === "Pending" && profile?.role === "professor" && (
                      <>
                        <Link className="approve-btn" title="Review and sign" to={`/authorize/${r.authorizationToken}`}><FaCheck /></Link>

                        <button
                          className="reject-btn"
                          onClick={() =>
                            updateStatus(
                              r.id,
                              "Rejected"
                            )
                          }
                        >
                          <FaTimes />
                        </button>
                      </>
                    )}

                    {r.status === "Validated" && profile?.role === "staff" && !r.custodianVerifiedAt && (
                      <button className="approve-btn" aria-label={`Verify ${r.id}`} title="Step 1 of 2: Verify request" onClick={() => { setCustodianAction({ type:"verify",request:r }); setCustodianConfirmed(false); }}><FaCheck /></button>
                    )}
                    {r.status === "Validated" && profile?.role === "staff" && r.custodianVerifiedAt && !r.custodianApprovedAt && (
                      <span title="Waiting for final Custodian Head approval">Awaiting Custodian Head</span>
                    )}
                    {r.status === "Validated" && profile?.role === "admin" && r.custodianVerifiedAt && !r.custodianApprovedAt && (
                      <button className="approve-btn final-approval-btn" aria-label={`Give final approval to ${r.id}`} title="Department-head final approval" onClick={() => { setCustodianAction({ type:"approve",request:r }); setCustodianConfirmed(false); }}><FaCheck /></button>
                    )}

                    {r.status === "Borrowed" && profile?.role === "staff" && (
                      <button
                        className="return-btn"
                        onClick={() => openReturn(r)}
                        title="Process return"
                      >
                        <FaUndo />
                      </button>
                    )}

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

      </table>

      
        </div>

            <div className="pagination">

    <button
        className="page-btn"
        disabled={page===1}
        onClick={()=>setPage(page-1)}
    >
        Prev
    </button>

    {Array.from({length:totalPages}).map((_,i)=>(

        <button
            key={i}
            className={`page-number ${page===i+1 ? "active":""}`}
            onClick={()=>setPage(i+1)}
        >
            {i+1}
        </button>

    ))}

    <button
        className="page-btn"
        disabled={totalPages === 0 || page===totalPages}
        onClick={()=>setPage(page+1)}
    >
        Next
    </button>

</div>


      {selected && (

        <div
          className="modal-overlay"
          onClick={() =>
            setSelected(null)
          }
        >

          <div
            className="request-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <h2>Request Details</h2>

            <div className="detail-grid">

              <p><strong>ID:</strong> {selected.id}</p>

              <p><strong>Student:</strong> {selected.student}</p>

              <p><strong>Student ID:</strong> {selected.studentId}</p>

              <p><strong>Department:</strong> {selected.department}</p>

              <p><strong>Section:</strong> {selected.section}</p>

              <p><strong>Assigned Professor:</strong> {selected.assignedProfessor}</p>

              <p><strong>Item:</strong> {selected.item}</p>

              <p><strong>Quantity:</strong> {selected.quantity}</p>

              {selected.items.map((item, index) => (
                <p key={`${item.name}-${index}`}>
                  <strong>{item.name}:</strong> {item.accountedQuantity ?? 0} of {item.quantity} accounted
                </p>
              ))}

              <p><strong>Borrow:</strong> {selected.borrowDate}</p>

              <p><strong>Return:</strong> {selected.returnDate}</p>

              <p><strong>Purpose:</strong> {selected.purpose}</p>

              <p><strong>Custodian verification:</strong> {selected.custodianVerifiedBy || "Pending"}</p>

              <p><strong>Custodian approval:</strong> {selected.custodianApprovedBy || "Pending"}</p>

              <p>
                <strong>Status:</strong>{" "}
                {selected.status}
              </p>

            </div>

            <BorrowingTimeline request={selected} />

            <div className="modal-actions">

              <button type="button" className="modal-secondary-btn" onClick={() => setSelected(null)}>Close</button>

              {selected.authorizationStatus === "authorized" && <button type="button" className="modal-receipt-btn" disabled={documentBusyId === selected.databaseId} onClick={() => downloadBorrowerForm(selected)}><FaDownload /> {documentBusyId === selected.databaseId ? "Preparing..." : "Download Form"}</button>}

              {["Borrowed", "Returned"].includes(selected.status) && <button type="button" className="modal-receipt-btn" onClick={() => setReceiptRequestId(selected.databaseId)}><FaReceipt /> View Receipts</button>}

            </div>

          </div>

        </div>

      )}

      {receiptRequestId && <ReceiptModal requestId={receiptRequestId} onClose={() => setReceiptRequestId(null)} />}

      {custodianAction && (
        <div className="modal-overlay" onClick={() => !custodianBusy && setCustodianAction(null)}>
          <div className="request-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{custodianAction.type === "verify" ? "Staff Verification" : "Department-Head Approval"} · {custodianAction.request.id}</h2>
            <p>{custodianAction.type === "verify" ? "Confirm that you reviewed the request, its department, schedule, and inventory availability. The Custodian Head Admin must provide final approval afterward." : "Confirm final Custodian Head approval. This changes the request to Ready for Claim and permanently records your Admin account signature, printed name, and timestamp."}</p>
            <div className="detail-grid"><p><strong>Student:</strong> {custodianAction.request.student}</p><p><strong>Department:</strong> {custodianAction.request.department}</p><p><strong>Items:</strong> {custodianAction.request.item}</p><p><strong>Professor:</strong> {custodianAction.request.authorizedBy || custodianAction.request.assignedProfessor}</p></div>
            <label className="authorization-consent"><input type="checkbox" checked={custodianConfirmed} onChange={(event) => setCustodianConfirmed(event.target.checked)} /><span>I reviewed this transaction and authorize the system to apply my personal signature, printed name, and current timestamp.</span></label>
            <div className="modal-actions"><button type="button" disabled={custodianBusy} onClick={() => setCustodianAction(null)}>Cancel</button><button type="button" className="approve-btn" disabled={!custodianConfirmed || custodianBusy} onClick={submitCustodianAction}>{custodianBusy ? "Saving..." : custodianAction.type === "verify" ? "Verify and Sign" : "Approve and Sign"}</button></div>
          </div>
        </div>
      )}

      {returnRequest && (
        <div className="modal-overlay" onClick={() => !returning && setReturnRequest(null)}>
          <form className="request-modal return-modal" onSubmit={submitReturn} onClick={(event) => event.stopPropagation()}>
            <h2>Process Return · {returnRequest.id}</h2>
            <p>Record only the units being accounted for in this return. Unaccounted units remain outstanding.</p>
            {returnError && <p className="form-error">{returnError}</p>}
            <div className="return-items">
              {returnForm.items.map((item, index) => (
                <section className="return-item" key={item.inventoryId}>
                  <div className="return-item-title"><strong>{item.name}</strong><span>{item.outstandingQuantity} outstanding</span></div>
                  <div className="return-quantity-grid">
                    {[['goodQuantity', 'Good'], ['damagedQuantity', 'Damaged'], ['missingQuantity', 'Missing']].map(([field, label]) => (
                      <label key={field}>{label}<input type="number" min="0" max={item.outstandingQuantity} value={item[field]}
                        onChange={(event) => setReturnForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, [field]: Number(event.target.value) } : entry) }))}/></label>
                    ))}
                  </div>
                  <label>Condition note<input minLength={(item.damagedQuantity > 0 || item.missingQuantity > 0) ? 5 : undefined} required={item.damagedQuantity > 0 || item.missingQuantity > 0} maxLength="500" value={item.conditionNote} placeholder="Optional condition details"
                    onChange={(event) => setReturnForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, conditionNote: event.target.value } : entry) }))}/></label>
                </section>
              ))}
            </div>
            <label>Return remarks<textarea maxLength="1000" rows="3" value={returnForm.remarks} onChange={(event) => setReturnForm({ ...returnForm, remarks: event.target.value })}/></label>
            <div className="modal-actions"><button type="button" disabled={returning} onClick={() => setReturnRequest(null)}>Cancel</button><button type="submit" className="approve-btn" disabled={returning}>{returning ? "Processing..." : "Record Return"}</button></div>
          </form>
        </div>
      )}

    </div>
  );
}
