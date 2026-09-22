"use strict";

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
import "../../styles/audit-logs.css";

const ACTIONS = [
  "borrowing_submitted",
  "borrowing_status_changed",
  "borrowing_return_processed",
  "borrowing_overdue_detected",
  "user_invited",
  "user_profile_updated",
  "inventory_created",
  "inventory_updated",
  "inventory_deleted",
  "calendar_event_created",
  "calendar_event_updated",
  "calendar_event_deleted",
  "unavailability_created",
  "unavailability_updated",
  "unavailability_deleted",
];

function label(value) {
  return String(value || "")
    .split("_")
    .map(
      (part) =>
        part[0]?.toUpperCase() + part.slice(1)
    )
    .join(" ");
}

/*
 * Converts:
 *
 * imageHash        -> Image Hash
 * transactionSource -> Transaction Source
 * asset_number     -> Asset Number
 * returnId         -> Return Id
 */
function formatFieldLabel(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const looksLikeDate =
    /^\d{4}-\d{2}-\d{2}/.test(value) ||
    /^\d{4}-\d{2}-\d{2}T/.test(value);

  if (!looksLikeDate) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString();
}

/*
 * Some audit values can arrive as JSON strings depending
 * on how the API/database driver returns the JSON column.
 *
 * This attempts to restore the original object/array
 * without changing ordinary strings.
 */
function normalizeAuditValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));

  if (!looksLikeJson) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/*
 * Renders primitive, object, and array values without
 * converting the entire audit record into raw JSON.
 *
 * Nothing is intentionally discarded.
 */
function renderAuditValue(value, depth = 0) {
  const normalizedValue = normalizeAuditValue(value);

  if (
    normalizedValue === null ||
    normalizedValue === undefined ||
    normalizedValue === ""
  ) {
    return (
      <span className="audit-value-empty">
        —
      </span>
    );
  }

  if (typeof normalizedValue === "boolean") {
    return (
      <span
        className={`audit-value-badge ${
          normalizedValue
            ? "is-true"
            : "is-false"
        }`}
      >
        <span
          className="audit-value-dot"
          aria-hidden="true"
        />

        {normalizedValue ? "Yes" : "No"}
      </span>
    );
  }

  if (
    typeof normalizedValue === "number"
  ) {
    return (
      <span className="audit-value-number">
        {String(normalizedValue)}
      </span>
    );
  }

  if (typeof normalizedValue === "string") {
    const formattedDate =
      formatDateValue(normalizedValue);

    if (formattedDate) {
      return (
        <span className="audit-value-text">
          {formattedDate}
        </span>
      );
    }

    return (
      <span className="audit-value-text">
        {normalizedValue}
      </span>
    );
  }

  /*
   * Arrays
   */
  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length === 0) {
      return (
        <span className="audit-value-empty">
          None
        </span>
      );
    }

    return (
      <div className="audit-array">
        {normalizedValue.map(
          (item, index) => (
            <div
              className="audit-array-item"
              key={index}
            >
              <div className="audit-array-index">
                #{index + 1}
              </div>

              <div className="audit-array-content">
                {renderAuditValue(
                  item,
                  depth + 1
                )}
              </div>
            </div>
          )
        )}
      </div>
    );
  }

  /*
   * Objects
   */
  if (
    typeof normalizedValue === "object"
  ) {
    const entries =
      Object.entries(normalizedValue);

    if (entries.length === 0) {
      return (
        <span className="audit-value-empty">
          No data
        </span>
      );
    }

    return (
      <div
        className={`audit-object ${
          depth > 0
            ? "audit-object-nested"
            : ""
        }`}
      >
        {entries.map(
          ([key, nestedValue]) => (
            <div
              className="audit-object-row"
              key={key}
            >
              <span className="audit-object-label">
                {formatFieldLabel(key)}
              </span>

              <div className="audit-object-value">
                {renderAuditValue(
                  nestedValue,
                  depth + 1
                )}
              </div>
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <span className="audit-value-text">
      {String(normalizedValue)}
    </span>
  );
}

/*
 * Top-level audit object renderer.
 *
 * Example:
 *
 * {
 *   status: "Borrowed",
 *   transactionSource: "qr",
 *   identityVerified: true,
 *   serializedAssets: ["AST-001"]
 * }
 *
 * becomes separate readable fields.
 */
function AuditValues({ values }) {
  const normalizedValues =
    normalizeAuditValue(values);

  if (
    normalizedValues === null ||
    normalizedValues === undefined
  ) {
    return (
      <div className="audit-no-data">
        <span>No recorded data</span>
      </div>
    );
  }

  if (
    typeof normalizedValues !== "object"
  ) {
    return (
      <div className="audit-value-single">
        {renderAuditValue(
          normalizedValues
        )}
      </div>
    );
  }

  if (Array.isArray(normalizedValues)) {
    return (
      <div className="audit-values">
        <div className="audit-value-field audit-value-field-wide">
          <span className="audit-value-field-label">
            Recorded Items
          </span>

          <div className="audit-value-field-content">
            {renderAuditValue(
              normalizedValues
            )}
          </div>
        </div>
      </div>
    );
  }

  const entries =
    Object.entries(normalizedValues);

  if (entries.length === 0) {
    return (
      <div className="audit-no-data">
        <span>No recorded data</span>
      </div>
    );
  }

  return (
    <div className="audit-values">
      {entries.map(
        ([key, value]) => (
          <div
            className={`audit-value-field ${
              value !== null &&
              typeof value === "object"
                ? "audit-value-field-wide"
                : ""
            }`}
            key={key}
          >
            <span className="audit-value-field-label">
              {formatFieldLabel(key)}
            </span>

            <div className="audit-value-field-content">
              {renderAuditValue(value)}
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    action: "",
    entityType: "",
  });

  const [applied, setApplied] =
    useState(filters);

  const [page, setPage] = useState(1);

  const [pagination, setPagination] =
    useState({
      total: 0,
      pageSize: 25,
    });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const requestSequence =
    useRef(0);

  const [selectedLog, setSelectedLog] =
    useState(null);

  const loadLogs = useCallback(
    async () => {
      const sequence =
        ++requestSequence.current;

      setLoading(true);
      setError("");

      try {
        const query =
          new URLSearchParams({
            page: String(page),
          });

        Object.entries(applied).forEach(
          ([key, value]) => {
            if (value) {
              query.set(key, value);
            }
          }
        );

        const response =
          await authenticatedFetch(
            `/api/audit-logs?${query}`
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.message ||
              "Unable to load activity logs."
          );
        }

        if (
          sequence ===
          requestSequence.current
        ) {
          setLogs(
            Array.isArray(result.logs)
              ? result.logs
              : []
          );

          setPagination(
            result.pagination || {
              total: 0,
              pageSize: 25,
            }
          );
        }
      } catch (requestError) {
        if (
          sequence ===
          requestSequence.current
        ) {
          setError(
            requestError.message ||
              "Unable to load activity logs."
          );
        }
      } finally {
        if (
          sequence ===
          requestSequence.current
        ) {
          setLoading(false);
        }
      }
    },
    [applied, page]
  );

  useEffect(() => {
    const timer =
      window.setTimeout(
        loadLogs,
        0
      );

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

  const pages = Math.max(
    1,
    Math.ceil(
      pagination.total /
        pagination.pageSize
    )
  );

  return (
    <div className="audit-page">
      <header>
        <h1>Activity Logs</h1>

        <p>
          Trace important changes made
          throughout the stockroom system.
        </p>
      </header>

      <form
        className="audit-filters"
        onSubmit={applyFilters}
      >
        <label>
          Search

          <input
            value={filters.search}
            maxLength="100"
            placeholder="User or record ID"
            onChange={(event) =>
              setFilters({
                ...filters,
                search:
                  event.target.value,
              })
            }
          />
        </label>

        <label>
          Action

          <select
            value={filters.action}
            onChange={(event) =>
              setFilters({
                ...filters,
                action:
                  event.target.value,
              })
            }
          >
            <option value="">
              All actions
            </option>

            {ACTIONS.map(
              (action) => (
                <option
                  key={action}
                  value={action}
                >
                  {label(action)}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          Record type

          <select
            value={filters.entityType}
            onChange={(event) =>
              setFilters({
                ...filters,
                entityType:
                  event.target.value,
              })
            }
          >
            <option value="">
              All records
            </option>

            <option value="borrowing_request">
              Borrowing Request
            </option>

            <option value="inventory">
              Inventory
            </option>

            <option value="calendar_event">
              Calendar Event
            </option>

            <option value="inventory_unavailability">
              Unavailability Period
            </option>
          </select>
        </label>

        <button type="submit">
          Apply Filters
        </button>
      </form>

      {error && (
        <p className="audit-state error">
          {error}

          <button
            type="button"
            onClick={loadLogs}
          >
            Retry
          </button>
        </p>
      )}

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Date and Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Record</th>
              <th>Change</th>
            </tr>
          </thead>

          <tbody>
            {logs.map(
              (log) => (
                <tr key={log.id}>
                  <td>
                    {new Date(
                      log.created_at
                    ).toLocaleString()}
                  </td>

                  <td>
                    <strong>
                      {log.actor_name ||
                        log.actor_email ||
                        "System"}
                    </strong>

                    <small>
                      {log.actor_role ||
                        "system"}
                    </small>
                  </td>

                  <td>
                    <span className="audit-action">
                      {label(log.action)}
                    </span>
                  </td>

                  <td>
                    {label(
                      log.entity_type
                    )}

                    {log.entity_id && (
                      <small>
                        #{log.entity_id}
                      </small>
                    )}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="audit-view-button"
                      onClick={() =>
                        setSelectedLog(
                          log
                        )
                      }
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              )
            )}

            {!loading &&
              logs.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="audit-empty"
                  >
                    No matching activities
                    found.
                  </td>
                </tr>
              )}
          </tbody>
        </table>

        {loading && (
          <p className="audit-state">
            Loading activity logs...
          </p>
        )}
      </div>

      <footer className="audit-pagination">
        <span>
          {pagination.total} activities
        </span>

        <div>
          <button
            type="button"
            disabled={
              page <= 1 || loading
            }
            onClick={() =>
              setPage(
                (value) =>
                  value - 1
              )
            }
          >
            Previous
          </button>

          <span>
            Page {page} of {pages}
          </span>

          <button
            type="button"
            disabled={
              page >= pages ||
              loading
            }
            onClick={() =>
              setPage(
                (value) =>
                  value + 1
              )
            }
          >
            Next
          </button>
        </div>
      </footer>

      {selectedLog && (
        <div
          className="audit-modal-overlay"
          onClick={() =>
            setSelectedLog(null)
          }
        >
          <div
            className="audit-details-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* HEADER */}

            <div className="audit-modal-header">
              <div>
                <span className="audit-modal-eyebrow">
                  Activity Log
                </span>

                <h2>
                  Activity Details
                </h2>

                <p>
                  Review the recorded
                  changes made to this
                  record.
                </p>
              </div>

              <button
                type="button"
                className="audit-modal-close"
                onClick={() =>
                  setSelectedLog(null)
                }
                aria-label="Close activity details"
              >
                ×
              </button>
            </div>

            {/* SUMMARY */}

            <div className="audit-log-summary">
              <div className="audit-summary-item">
                <span>User</span>

                <strong>
                  {selectedLog.actor_name ||
                    selectedLog.actor_email ||
                    "System"}
                </strong>

                <small>
                  {selectedLog.actor_role ||
                    "system"}
                </small>
              </div>

              <div className="audit-summary-item">
                <span>Action</span>

                <strong>
                  {label(
                    selectedLog.action
                  )}
                </strong>
              </div>

              <div className="audit-summary-item">
                <span>Record</span>

                <strong>
                  {label(
                    selectedLog.entity_type
                  )}
                </strong>

                {selectedLog.entity_id && (
                  <small>
                    Record #
                    {
                      selectedLog.entity_id
                    }
                  </small>
                )}
              </div>

              <div className="audit-summary-item">
                <span>
                  Date and Time
                </span>

                <strong>
                  {new Date(
                    selectedLog.created_at
                  ).toLocaleDateString()}
                </strong>

                <small>
                  {new Date(
                    selectedLog.created_at
                  ).toLocaleTimeString()}
                </small>
              </div>
            </div>

            {/* BEFORE / AFTER */}

            <div className="audit-details-body">
              <div className="audit-detail-card">
                <div className="audit-detail-card-header">
                  <div>
                    <span className="audit-detail-label">
                      Previous State
                    </span>

                    <h3>Before</h3>
                  </div>
                </div>

                <AuditValues
                  values={
                    selectedLog.old_values
                  }
                />
              </div>

              <div className="audit-detail-arrow">
                →
              </div>

              <div className="audit-detail-card audit-detail-card-after">
                <div className="audit-detail-card-header">
                  <div>
                    <span className="audit-detail-label">
                      Updated State
                    </span>

                    <h3>After</h3>
                  </div>
                </div>

                <AuditValues
                  values={
                    selectedLog.new_values
                  }
                />
              </div>
            </div>

            {/* METADATA */}

            {selectedLog.metadata &&
              Object.keys(
                normalizeAuditValue(
                  selectedLog.metadata
                ) || {}
              ).length > 0 && (
                <div className="audit-metadata-card">
                  <div className="audit-detail-card-header">
                    <div>
                      <span className="audit-detail-label">
                        Additional
                        Information
                      </span>

                      <h3>
                        Transaction Details
                      </h3>
                    </div>
                  </div>

                  <div className="audit-metadata-content">
                    <AuditValues
                      values={
                        selectedLog.metadata
                      }
                    />
                  </div>
                </div>
              )}

            {/* FOOTER */}

            <div className="audit-modal-footer">
              <button
                type="button"
                onClick={() =>
                  setSelectedLog(null)
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