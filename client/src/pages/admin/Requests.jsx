import { useMemo, useState } from "react";
import {
  FaSearch,
  FaEye,
  FaCheck,
  FaTimes,
  FaUndo,
} from "react-icons/fa";

import "../../styles/requests.css";

const initialRequests = [
  {
    id: "BR-001",
    student: "Juan Dela Cruz",
    studentId: "2023-0001",
    item: "Chef Knife",
    quantity: 2,
    borrowDate: "Jul 28, 2026",
    returnDate: "Jul 30, 2026",
    purpose: "Cooking Laboratory",
    status: "Pending",
  },
  {
    id: "BR-002",
    student: "Maria Santos",
    studentId: "2023-0002",
    item: "Mixing Bowl",
    quantity: 5,
    borrowDate: "Jul 27, 2026",
    returnDate: "Jul 29, 2026",
    purpose: "Baking Activity",
    status: "Approved",
  },
  {
    id: "BR-003",
    student: "Jose Cruz",
    studentId: "2023-0003",
    item: "Measuring Cup",
    quantity: 3,
    borrowDate: "Jul 25, 2026",
    returnDate: "Jul 26, 2026",
    purpose: "Assessment",
    status: "Returned",
  },
  {
    id: "BR-004",
    student: "Ana Reyes",
    studentId: "2023-0004",
    item: "Sauce Pan",
    quantity: 1,
    borrowDate: "Jul 26, 2026",
    returnDate: "Jul 27, 2026",
    purpose: "Laboratory",
    status: "Rejected",
  },
];

export default function Requests() {
  const [requests, setRequests] = useState(initialRequests);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const ITEMS_PER_PAGE = 8;

  const [page,setPage] = useState(1);

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

  const updateStatus = (id, status) => {
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
        
      <div className="requests-table-wrapper">

      <table className="requests-table">

        <table>

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
                            "Returned"
                          )
                        }
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
        disabled={page===totalPages}
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