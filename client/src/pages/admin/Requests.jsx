import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaSearch,
  FaEye,
  FaCheck,
  FaTimes,
  FaUndo,
  FaBoxOpen,
} from "react-icons/fa";

import "../../styles/requests.css";
import { supabase } from "../../lib/supabase";

function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export default function Requests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const ITEMS_PER_PAGE = 8;

  const [page,setPage] = useState(1);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const [requestsResult, itemsResult, inventoryResult] = await Promise.all([
      supabase.from("borrow_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("borrow_request_items").select("request_id, inventory_id, quantity"),
      supabase.from("inventory").select("id, item_name"),
    ]);

    const error = requestsResult.error || itemsResult.error || inventoryResult.error;
    if (error) {
      setLoadError(error.message);
      setRequests([]);
      setLoading(false);
      return;
    }

    const inventoryById = new Map(
      (inventoryResult.data || []).map((item) => [String(item.id), item.item_name])
    );
    const itemsByRequest = new Map();

    for (const item of itemsResult.data || []) {
      const requestId = String(item.request_id);
      const group = itemsByRequest.get(requestId) || [];
      group.push({
        name: inventoryById.get(String(item.inventory_id)) || `Item #${item.inventory_id}`,
        quantity: Number(item.quantity),
      });
      itemsByRequest.set(requestId, group);
    }

    setRequests((requestsResult.data || []).map((request) => {
      const requestItems = itemsByRequest.get(String(request.id)) || [];
      return {
        databaseId: request.id,
        id: `BR-${String(request.id).padStart(3, "0")}`,
        student: request.student_name,
        studentId: request.student_id,
        item: requestItems.map((item) => item.name).join(", ") || "No items",
        quantity: requestItems.reduce((sum, item) => sum + item.quantity, 0),
        items: requestItems,
        borrowDate: formatDate(request.borrow_date),
        returnDate: formatDate(request.return_date),
        purpose: request.purpose || "-",
        status: request.status,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadRequests, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-borrow-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_requests" }, loadRequests)
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_request_items" }, loadRequests)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const matchesSearch =
        r.student.toLowerCase().includes(search.toLowerCase()) ||
        r.item.toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "All" || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  const paginated = filtered.slice(
      (page-1)*ITEMS_PER_PAGE,
      page*ITEMS_PER_PAGE
  );

  const updateStatus = async (id, status) => {
    const request = requests.find((item) => item.id === id);
    if (!request) return;

    setLoadError("");
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
    const response = await fetch(`${apiUrl}/api/borrowings/${request.databaseId}/status`, {
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

  return (
    <div className="requests-page">

      <div className="requests-header">

          <div className="requests-title">
              <h2>Borrow Requests</h2>
              <p>Manage student borrowing requests.</p>
          </div>

          <button className="inventory-add">
              {filtered.length} Requests
          </button>

      </div>

      <div className="requests-toolbar">

          <div className="search-box">
              <FaSearch />
              <input
                  type="text"
                  placeholder="Search request..."
                  value={search}
                  onChange={(e)=>setSearch(e.target.value)}
              />
          </div>

          <select
              value={statusFilter}
              onChange={(e)=>setStatusFilter(e.target.value)}
          >
              <option>All</option>
              <option>Pending</option>
              <option>Approved</option>
              <option>Rejected</option>
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
                <td colSpan={8} className="requests-empty">No borrowing requests found.</td>
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
                    {r.status}
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

                    {r.status === "Pending" && (
                      <>
                        <button
                          className="approve-btn"
                          onClick={() =>
                            updateStatus(
                              r.id,
                              "Approved"
                            )
                          }
                        >
                          <FaCheck />
                        </button>

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

                    {r.status === "Approved" && (
                      <button
                        className="return-btn"
                        onClick={() =>
                          updateStatus(
                            r.id,
                            "Borrowed"
                          )
                        }
                        title="Mark as borrowed"
                      >
                        <FaBoxOpen />
                      </button>
                    )}

                    {r.status === "Borrowed" && (
                      <button
                        className="return-btn"
                        onClick={() => updateStatus(r.id, "Returned")}
                        title="Mark as returned"
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

              <p><strong>Item:</strong> {selected.item}</p>

              <p><strong>Quantity:</strong> {selected.quantity}</p>

              {selected.items.map((item, index) => (
                <p key={`${item.name}-${index}`}>
                  <strong>{item.name}:</strong> {item.quantity}
                </p>
              ))}

              <p><strong>Borrow:</strong> {selected.borrowDate}</p>

              <p><strong>Return:</strong> {selected.returnDate}</p>

              <p><strong>Purpose:</strong> {selected.purpose}</p>

              <p>
                <strong>Status:</strong>{" "}
                {selected.status}
              </p>

            </div>

            <div className="modal-actions">

              <button
                onClick={() =>
                  setSelected(null)
                }
              >
                Close
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
