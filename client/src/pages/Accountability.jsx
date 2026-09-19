import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaEye,
  FaSearch,
  FaShieldAlt,
  FaTimes,
} from "react-icons/fa";
import { useAuth } from "../auth/useAuth";
import { authenticatedFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import "../styles/accountability.css";

const STATUS_META = {
  active: {
    label: "Active",
    className: "accountability-badge-active",
  },
  under_review: {
    label: "Under Review",
    className: "accountability-badge-review",
  },
  resolved: {
    label: "Resolved",
    className: "accountability-badge-resolved",
  },
  closed: {
    label: "Closed",
    className: "accountability-badge-closed",
  },
};

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  const meta =
    STATUS_META[normalized] || {
      label: status || "Unknown",
      className: "accountability-badge-unknown",
    };

  return (
    <span className={`accountability-status ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function getStudentName(item) {
  return (
    item.student_name ||
    item.studentName ||
    item.full_name ||
    item.name ||
    "Unknown Student"
  );
}

function getStudentId(item) {
  return (
    item.student_id ||
    item.studentId ||
    item.user_student_id ||
    "—"
  );
}

function getDescription(item) {
  return (
    item.description ||
    item.reason ||
    item.issue ||
    item.details ||
    "No description provided."
  );
}

export default function Accountability() {
  const { profile } = useAuth();

  const staff = ["professor", "admin"].includes(
    profile?.role
  );

  const admin = profile?.role === "admin";

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    "active"
  );

  const [selectedCase, setSelectedCase] = useState(null);

  const [reviewStatus, setReviewStatus] =
    useState("under_review");

  const [resolution, setResolution] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadCases = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const response = await authenticatedFetch(
        "/api/accountability"
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Unable to load accountability records."
        );
      }

      const records = Array.isArray(result)
        ? result
        : result.cases ||
          result.accountability ||
          result.data ||
          [];

      setCases(records);
    } catch (error) {
      console.error("Accountability load error:", error);

      setLoadError(
        error.message ||
          "Unable to load accountability records."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();

    const channel = supabase
      .channel("accountability-cases-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "accountability_cases",
        },
        () => {
          loadCases();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCases]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();

    return cases.filter((item) => {
      const status = String(
        item.status || "active"
      ).toLowerCase();

      const matchesStatus =
        statusFilter === "all" ||
        status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        getStudentName(item),
        getStudentId(item),
        getDescription(item),
        item.item_name,
        item.itemName,
        item.request_id,
        item.requestId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [cases, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      active: cases.filter(
        (item) =>
          String(item.status || "active").toLowerCase() ===
          "active"
      ).length,

      review: cases.filter(
        (item) =>
          String(item.status || "").toLowerCase() ===
          "under_review"
      ).length,

      resolved: cases.filter(
        (item) =>
          String(item.status || "").toLowerCase() ===
          "resolved"
      ).length,

      closed: cases.filter(
        (item) =>
          String(item.status || "").toLowerCase() ===
          "closed"
      ).length,
    };
  }, [cases]);

  const openCase = (item) => {
    setSelectedCase(item);

    setReviewStatus(
      item.status === "closed"
        ? "closed"
        : item.status === "resolved"
        ? "resolved"
        : "under_review"
    );

    setResolution(
      item.resolution ||
        item.resolution_notes ||
        item.resolutionNotes ||
        ""
    );

    setSaveError("");
  };

  const closeModal = () => {
    if (saving) return;

    setSelectedCase(null);
    setSaveError("");
    setResolution("");
  };

  const handleUpdate = async () => {
    if (!selectedCase || !admin) {
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      const id =
        selectedCase.id ||
        selectedCase.case_id ||
        selectedCase.caseId;

      const response = await authenticatedFetch(
        `/api/accountability/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: reviewStatus,
            resolution: resolution.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            "Unable to update the accountability case."
        );
      }

      setSelectedCase(null);
      setResolution("");
      setSaveError("");

      await loadCases();
    } catch (error) {
      console.error(
        "Accountability update error:",
        error
      );

      setSaveError(
        error.message ||
          "Unable to update the accountability case."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="accountability-page">
      <header className="accountability-header">
        <div>
          <span className="accountability-eyebrow">
            CTHM STOCKROOM
          </span>

          <h1>
            {staff
              ? "Accountability Cases"
              : "My Accountability"}
          </h1>

          <p className="accountability-subtitle">
            {staff
              ? "Review and monitor student accountability records."
              : "Review your outstanding accountability records and their current status."}
          </p>
        </div>

        <div className="accountability-header-icon">
          <FaShieldAlt />
        </div>
      </header>

      <section className="accountability-summary">
        <div className="accountability-summary-card">
          <div className="accountability-summary-icon">
            <FaExclamationTriangle />
          </div>

          <div>
            <span>Active Cases</span>
            <strong>{counts.active}</strong>
          </div>
        </div>

        <div className="accountability-summary-card">
          <div className="accountability-summary-icon">
            <FaEye />
          </div>

          <div>
            <span>Under Review</span>
            <strong>{counts.review}</strong>
          </div>
        </div>

        <div className="accountability-summary-card">
          <div className="accountability-summary-icon">
            <FaCheckCircle />
          </div>

          <div>
            <span>Resolved</span>
            <strong>{counts.resolved}</strong>
          </div>
        </div>

        <div className="accountability-summary-card">
          <div className="accountability-summary-icon">
            <FaShieldAlt />
          </div>

          <div>
            <span>Closed</span>
            <strong>{counts.closed}</strong>
          </div>
        </div>
      </section>

      <section className="accountability-panel">
        <div className="accountability-toolbar">
          <div className="accountability-search">
            <FaSearch />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder={
                staff
                  ? "Search student, ID, or case..."
                  : "Search your accountability records..."
              }
              aria-label="Search accountability records"
            />

            {search && (
              <button
                type="button"
                className="accountability-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <FaTimes />
              </button>
            )}
          </div>

          <div className="accountability-filters">
            {[
              ["active", "Active"],
              ["under_review", "Under Review"],
              ["resolved", "Resolved"],
              ["closed", "Closed"],
              ["all", "All"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`accountability-filter ${
                  statusFilter === value
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setStatusFilter(value)
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="accountability-state">
            <div className="accountability-loading-spinner" />
            <p>Loading accountability records...</p>
          </div>
        )}

        {loadError && !loading && (
          <div className="accountability-state accountability-state-error">
            <FaExclamationTriangle />

            <p>{loadError}</p>

            <button
              type="button"
              onClick={loadCases}
              className="accountability-retry-btn"
            >
              Retry
            </button>
          </div>
        )}

        {!loading &&
          !loadError &&
          filteredCases.length === 0 && (
            <div className="accountability-empty">
              <div className="accountability-empty-icon">
                <FaCheckCircle />
              </div>

              <h3>No accountability records found</h3>

              <p>
                {search
                  ? "Try a different search term or status filter."
                  : "There are no accountability records matching the selected status."}
              </p>
            </div>
          )}

        {!loading &&
          !loadError &&
          filteredCases.length > 0 && (
            <div className="accountability-table-wrap">
              <table className="accountability-table">
                <thead>
                  <tr>
                    {staff && <th>Student</th>}
                    <th>Item / Case</th>
                    <th>Issue</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCases.map((item) => (
                    <tr
                      key={
                        item.id ||
                        item.case_id ||
                        item.caseId
                      }
                    >
                      {staff && (
                        <td>
                          <div className="accountability-student">
                            <strong>
                              {getStudentName(item)}
                            </strong>

                            <span>
                              {getStudentId(item)}
                            </span>
                          </div>
                        </td>
                      )}

                      <td>
                        <div className="accountability-item">
                          <strong>
                            {item.item_name ||
                              item.itemName ||
                              item.case_type ||
                              item.caseType ||
                              "Accountability Case"}
                          </strong>

                          {item.request_id && (
                            <span>
                              Request #{item.request_id}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span className="accountability-issue">
                          {getDescription(item)}
                        </span>
                      </td>

                      <td>
                        <span className="accountability-date">
                          {formatDate(
                            item.created_at ||
                              item.createdAt ||
                              item.date
                          )}
                        </span>
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            item.status || "active"
                          }
                        />
                      </td>

                      <td>
                        <button
                          type="button"
                          className="accountability-view-btn"
                          onClick={() =>
                            openCase(item)
                          }
                        >
                          <FaEye />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {selectedCase && (
        <div
          className="accountability-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <section
            className="accountability-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accountability-modal-title"
          >
            <header className="accountability-modal-header">
              <div>
                <span className="accountability-modal-eyebrow">
                  ACCOUNTABILITY RECORD
                </span>

                <h2 id="accountability-modal-title">
                  Case Details
                </h2>
              </div>

              <button
                type="button"
                className="accountability-modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </header>

            <div className="accountability-modal-body">
              <div className="accountability-modal-status">
                <StatusBadge
                  status={
                    selectedCase.status || "active"
                  }
                />

                <span>
                  Created{" "}
                  {formatDateTime(
                    selectedCase.created_at ||
                      selectedCase.createdAt ||
                      selectedCase.date
                  )}
                </span>
              </div>

              {staff && (
                <section className="accountability-detail-section">
                  <h3>Student Information</h3>

                  <div className="accountability-detail-grid">
                    <div>
                      <span>Student Name</span>
                      <strong>
                        {getStudentName(
                          selectedCase
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Student ID</span>
                      <strong>
                        {getStudentId(
                          selectedCase
                        )}
                      </strong>
                    </div>
                  </div>
                </section>
              )}

              <section className="accountability-detail-section">
                <h3>Case Information</h3>

                <div className="accountability-detail-grid">
                  <div>
                    <span>Item / Case</span>
                    <strong>
                      {selectedCase.item_name ||
                        selectedCase.itemName ||
                        selectedCase.case_type ||
                        selectedCase.caseType ||
                        "Accountability Case"}
                    </strong>
                  </div>

                  <div>
                    <span>Request ID</span>
                    <strong>
                      {selectedCase.request_id ||
                        selectedCase.requestId ||
                        "—"}
                    </strong>
                  </div>

                  <div className="full">
                    <span>Issue</span>
                    <strong>
                      {getDescription(
                        selectedCase
                      )}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="accountability-detail-section">
                <h3>Resolution</h3>

                <div className="accountability-resolution-box">
                  {selectedCase.resolution ||
                  selectedCase.resolution_notes ||
                  selectedCase.resolutionNotes ? (
                    <p>
                      {selectedCase.resolution ||
                        selectedCase.resolution_notes ||
                        selectedCase.resolutionNotes}
                    </p>
                  ) : (
                    <p className="muted">
                      No resolution has been recorded yet.
                    </p>
                  )}
                </div>
              </section>

              {admin && (
                <section className="accountability-admin-section">
                  <div className="accountability-admin-heading">
                    <div>
                      <span className="accountability-modal-eyebrow">
                        ADMIN REVIEW
                      </span>

                      <h3>Update Case</h3>
                    </div>
                  </div>

                  <label className="accountability-form-group">
                    <span>Status</span>

                    <select
                      value={reviewStatus}
                      onChange={(event) =>
                        setReviewStatus(
                          event.target.value
                        )
                      }
                      disabled={saving}
                    >
                      <option value="under_review">
                        Under Review
                      </option>

                      <option value="resolved">
                        Resolved
                      </option>

                      <option value="closed">
                        Closed
                      </option>
                    </select>
                  </label>

                  <label className="accountability-form-group">
                    <span>Resolution / Notes</span>

                    <textarea
                      value={resolution}
                      onChange={(event) =>
                        setResolution(
                          event.target.value
                        )
                      }
                      placeholder="Enter the resolution or review notes..."
                      rows={5}
                      disabled={saving}
                    />
                  </label>

                  {saveError && (
                    <div className="accountability-form-error">
                      <FaExclamationTriangle />
                      <span>{saveError}</span>
                    </div>
                  )}
                </section>
              )}
            </div>

            <footer className="accountability-modal-footer">
              <button
                type="button"
                className="accountability-secondary-btn"
                onClick={closeModal}
                disabled={saving}
              >
                Close
              </button>

              {admin && (
                <button
                  type="button"
                  className="accountability-primary-btn"
                  onClick={handleUpdate}
                  disabled={saving}
                >
                  <FaCheckCircle />

                  {saving
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}