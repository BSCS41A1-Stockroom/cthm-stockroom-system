import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Borrowing.css";
import { authenticatedFetch } from "../../lib/api";
import { useAuth } from "../../auth/useAuth";
import { inventoryTotals } from "../../utils/inventoryAvailability";

export default function BorrowingInterface() {
  const { profile } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState({});

  const [borrowDate, setBorrowDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [purpose, setPurpose] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [expandedTable, setExpandedTable] = useState(false);

  const [printControlNo, setPrintControlNo] = useState("");

  const studentName = profile?.full_name || "";
  const studentId = profile?.student_id || "";

  /*
   * ============================================================
   * LOAD INVENTORY
   * ============================================================
   */

  useEffect(() => {
    loadInventory();

    const channel = supabase
      .channel("student-borrowing-inventory")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory",
        },
        loadInventory
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadInventory() {
    setLoading(true);

    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("id");

    if (error) {
      console.error(error);
    } else {
      setItems(data || []);
    }

    setLoading(false);
  }

  /*
   * ============================================================
   * FILTER
   * ============================================================
   */

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return items;
    }

    return items.filter((item) =>
      String(item.item_name || "")
        .toLowerCase()
        .includes(keyword)
    );
  }, [items, search]);

  /*
   * ============================================================
   * SELECTION
   * ============================================================
   */

  function toggleItem(item, checked) {
    setSelected((prev) => {
      const next = { ...prev };

      if (checked) {
        next[item.id] = 1;
      } else {
        delete next[item.id];
      }

      return next;
    });
  }

  function updateQuantity(id, value, max) {
    let qty = parseInt(value, 10);

    if (Number.isNaN(qty)) {
      qty = 1;
    }

    if (qty < 1) {
      qty = 1;
    }

    if (qty > max) {
      qty = max;
    }

    setSelected((prev) => ({
      ...prev,
      [id]: qty,
    }));
  }

  /*
   * ============================================================
   * SELECTED ITEMS
   * ============================================================
   */

  const selectedList = useMemo(() => {
    return Object.entries(selected)
      .map(([id, qty]) => {
        const item = items.find(
          (i) => String(i.id) === String(id)
        );

        if (!item) {
          return null;
        }

        return {
          ...item,
          borrowQty: qty,
        };
      })
      .filter(Boolean);
  }, [selected, items]);

  const totalItems = selectedList.length;

  const totalUnits = selectedList.reduce(
    (sum, item) => sum + item.borrowQty,
    0
  );

  /*
   * ============================================================
   * VALIDATION
   * ============================================================
   */

  function validate() {
    if (!studentName.trim()) {
      return "Student name is required.";
    }

    if (!studentId.trim()) {
      return "Student ID is required.";
    }

    if (totalItems === 0) {
      return "Please select at least one item.";
    }

    if (!borrowDate) {
      return "Borrow date is required.";
    }

    if (!returnDate) {
      return "Return date is required.";
    }

    if (new Date(returnDate) < new Date(borrowDate)) {
      return "Return date must be after borrow date.";
    }

    if (!purpose.trim()) {
      return "Purpose is required.";
    }

    for (const item of selectedList) {
      const { available } = inventoryTotals(item);

      if (item.borrowQty > available) {
        return `${item.item_name} only has ${available} remaining.`;
      }
    }

    return "";
  }

  /*
   * ============================================================
   * SUBMIT
   * ============================================================
   */

  async function handleSubmit(e) {
    if (e) {
      e.preventDefault();
    }

    setFormError("");
    setSuccessMsg("");

    const validation = validate();

    if (validation) {
      setFormError(validation);
      return;
    }

    setSubmitting(true);

    try {
      const response = await authenticatedFetch(
        "/api/borrowings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            borrowDate,
            returnDate,
            purpose,
            studentName: studentName.trim(),
            studentId: studentId.trim(),

            items: selectedList.map((item) => ({
              inventoryId: item.id,
              quantity: item.borrowQty,
            })),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        const reason =
          result.validation?.reasons?.[0]?.message;

        throw new Error(
          reason ||
            result.message ||
            "Borrowing request failed validation."
        );
      }

      setSuccessMsg(
        "Borrow request validated and submitted."
      );

      setSelected({});
      setBorrowDate("");
      setReturnDate("");
      setPurpose("");

      loadInventory();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * ============================================================
   * CONTROL NUMBER
   * ============================================================
   */

  function generateControlNumber(date) {
    const pad = (value) =>
      String(value).padStart(2, "0");

    return (
      "BR-" +
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      "-" +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  /*
   * ============================================================
   * PRINT
   * ============================================================
   */

  function handlePrint() {
    setFormError("");

    if (totalItems === 0) {
      setFormError(
        "Please select at least one item before printing."
      );

      return;
    }

    const validation = validate();

    if (validation) {
      setFormError(validation);
      return;
    }

    const now = new Date();

    const controlNo =
      generateControlNumber(now);

    setPrintControlNo(controlNo);

    setTimeout(() => {
      window.print();
    }, 100);
  }

  /*
   * ============================================================
   * DATE FORMAT
   * ============================================================
   */

  function formatDate(dateValue) {
    if (!dateValue) {
      return "—";
    }

    const date = new Date(
      `${dateValue}T00:00:00`
    );

    return date.toLocaleDateString(
      "en-PH",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );
  }

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  /*
   * ============================================================
   * TABLE
   * ============================================================
   */

  function InventoryTable() {
    return (
      <table className="inventory-table">

        <colgroup>
          <col className="col-check" />
          <col className="col-item" />
          <col className="col-available" />
          <col className="col-qty" />
        </colgroup>

        <thead>
          <tr>

            <th>
              Select
            </th>

            <th>
              Item
            </th>

            <th>
              Available
            </th>

            <th>
              Qty
            </th>

          </tr>
        </thead>

        <tbody>

          {filteredItems.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className="empty-cell"
              >
                No Inventory Found
              </td>
            </tr>
          )}

          {filteredItems.map((item) => {

            const { available } =
              inventoryTotals(item);

            const checked =
              selected[item.id] !== undefined;

            return (
              <tr
                key={item.id}
                className={
                  checked
                    ? "row-selected"
                    : ""
                }
              >

                <td className="select-cell">

                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={available <= 0}
                    onChange={(e) =>
                      toggleItem(
                        item,
                        e.target.checked
                      )
                    }
                  />

                </td>

                <td className="item-cell">
                  {item.item_name}
                </td>

                <td className="available-cell">
                  {available}
                </td>

                <td className="quantity-cell">

                  <input
                    type="number"
                    min="1"
                    max={available}
                    className="qty-input"
                    disabled={!checked}
                    value={
                      selected[item.id] ?? ""
                    }
                    onChange={(e) =>
                      updateQuantity(
                        item.id,
                        e.target.value,
                        available
                      )
                    }
                  />

                </td>

              </tr>
            );
          })}

        </tbody>

      </table>
    );
  }

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (loading) {
    return (
      <div className="borrow-page">
        Loading...
      </div>
    );
  }

  /*
   * ============================================================
   * PAGE
   * ============================================================
   */

  return (
    <div className="borrow-page">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="borrow-header">

        <h1>
          Borrow Items
        </h1>

        <p className="borrow-subtitle">
          Select inventory items to borrow.
        </p>

      </header>


      {/* ======================================================
          SUCCESS
      ====================================================== */}

      {successMsg && (
        <div className="top-success">
          {successMsg}
        </div>
      )}


      {/* ======================================================
          MAIN PANEL
      ====================================================== */}

      <section className="borrow-panel">

        {/* ====================================================
            BORROWING INFORMATION
        ==================================================== */}

        <div className="borrowing-information">

          <div className="information-heading">
            <h2>
              Borrowing Information
            </h2>

            <p>
              Complete the information before submitting your request.
            </p>
          </div>

          <div className="details-grid">

            <label>
              Student Name

              <input
                type="text"
                value={studentName}
                readOnly
              />
            </label>

            <label>
              Student ID

              <input
                type="text"
                value={studentId}
                readOnly
              />
            </label>

            <label>
              Borrow Date

              <input
                type="date"
                min={today}
                value={borrowDate}
                onChange={(e) =>
                  setBorrowDate(
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Return Date

              <input
                type="date"
                min={
                  borrowDate || today
                }
                value={returnDate}
                onChange={(e) =>
                  setReturnDate(
                    e.target.value
                  )
                }
              />
            </label>

            <label className="purpose-field">
              Purpose

              <textarea
                rows={3}
                value={purpose}
                onChange={(e) =>
                  setPurpose(
                    e.target.value
                  )
                }
                placeholder="Enter borrowing purpose..."
              />
            </label>

          </div>

        </div>


        {/* ====================================================
            ERROR
        ==================================================== */}

        {formError && (
          <p className="form-error top-error">
            {formError}
          </p>
        )}


        {/* ====================================================
            SEARCH
        ==================================================== */}

        <div className="filter-bar">

          <div className="search-field">

            <input
              type="text"
              placeholder="Search item..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

          </div>

        </div>


        {/* ====================================================
            TABLE HEADER
        ==================================================== */}

        <div className="table-heading">

          <div className="table-heading-left">

            <div>
              <h2>
                Inventory
              </h2>

              <p>
                Select the items and quantity you need.
              </p>
            </div>

          </div>

          <button
            type="button"
            className="expand-table-btn"
            onClick={() =>
              setExpandedTable(true)
            }
          >
            Expand Table
          </button>

        </div>


        {/* ====================================================
            FIXED HEIGHT TABLE
        ==================================================== */}

        <div className="table-wrap">

          <InventoryTable />

        </div>


        {/* ====================================================
            TABLE FOOTER / ACTIONS
        ==================================================== */}

        <div className="borrow-footer">

          <div className="selection-summary">

            <span>
              Selected Items
            </span>

            <strong>
              {totalItems}
            </strong>

            <span className="selection-divider">
              |
            </span>

            <span>
              Total Qty
            </span>

            <strong>
              {totalUnits}
            </strong>

          </div>


          <div className="borrow-footer-actions">

            <button
              type="button"
              className="action-btn secondary-btn"
              onClick={handlePrint}
            >
              Print
            </button>

            <button
              type="button"
              className="action-btn submit-btn-main"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? "Submitting..."
                : "Submit Request"}
            </button>

          </div>

        </div>

      </section>


      {/* ======================================================
          EXPANDED TABLE MODAL
      ====================================================== */}

      {expandedTable && (
        <div
          className="table-modal-overlay"
          onMouseDown={(e) => {

            if (
              e.target === e.currentTarget
            ) {
              setExpandedTable(false);
            }

          }}
        >

          <div className="table-modal">

            <div className="table-modal-header">

              <div>
                <h2>
                  Inventory
                </h2>

                <p>
                  Select inventory items to borrow.
                </p>
              </div>

              <button
                type="button"
                className="table-modal-close"
                onClick={() =>
                  setExpandedTable(false)
                }
              >
                ×
              </button>

            </div>


            <div className="table-modal-search">

              <div className="search-field">

                <input
                  type="text"
                  placeholder="Search item..."
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                />

              </div>

            </div>


            <div className="expanded-table-wrap">

              <InventoryTable />

            </div>


            <div className="table-modal-footer">

              <div className="selection-summary">

                <span>
                  Selected Items
                </span>

                <strong>
                  {totalItems}
                </strong>

                <span className="selection-divider">
                  |
                </span>

                <span>
                  Total Qty
                </span>

                <strong>
                  {totalUnits}
                </strong>

              </div>

              <button
                type="button"
                className="action-btn secondary-btn"
                onClick={() =>
                  setExpandedTable(false)
                }
              >
                Done
              </button>

            </div>

          </div>

        </div>
      )}


      {/* ======================================================
          PRINT VERSION
      ====================================================== */}

      <div className="print-document">

        <div className="print-header">

          <div>

            <h1>
              LABORATORY BORROWING FORM
            </h1>

            <p>
              Laboratory Equipment / Supplies Borrowing
            </p>

          </div>

          <div className="print-control">

            <div>
              Control No.
            </div>

            <strong>
              {printControlNo}
            </strong>

          </div>

        </div>


        <div className="print-info">

          <div>
            <span>
              Student Name
            </span>

            <strong>
              {studentName}
            </strong>
          </div>

          <div>
            <span>
              Student ID
            </span>

            <strong>
              {studentId}
            </strong>
          </div>

          <div>
            <span>
              Laboratory Number
            </span>

            <strong>
              ____________________
            </strong>
          </div>

          <div>
            <span>
              Date
            </span>

            <strong>
              {new Date().toLocaleDateString(
                "en-PH",
                {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }
              )}
            </strong>
          </div>

          <div>
            <span>
              Time
            </span>

            <strong>
              {new Date().toLocaleTimeString(
                "en-PH",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }
              )}
            </strong>
          </div>

          <div>
            <span>
              Borrow Date
            </span>

            <strong>
              {formatDate(borrowDate)}
            </strong>
          </div>

          <div>
            <span>
              Return Date
            </span>

            <strong>
              {formatDate(returnDate)}
            </strong>
          </div>

          <div className="print-purpose">

            <span>
              Purpose
            </span>

            <strong>
              {purpose || "—"}
            </strong>

          </div>

        </div>


        <table className="print-borrow-table">

          <thead>

            <tr>

              <th>
                No.
              </th>

              <th>
                Description
              </th>

              <th>
                Qty
              </th>

              <th>
                Returned
              </th>

              <th>
                Unreturned
              </th>

              <th>
                Remarks
              </th>

            </tr>

          </thead>

          <tbody>

            {Array.from(
              { length: 30 },
              (_, index) => {

                const item =
                  selectedList[index];

                return (
                  <tr key={index}>

                    <td>
                      {index + 1}
                    </td>

                    <td>
                      {item
                        ? item.item_name
                        : ""}
                    </td>

                    <td>
                      {item
                        ? item.borrowQty
                        : ""}
                    </td>

                    <td></td>

                    <td></td>

                    <td></td>

                  </tr>
                );
              }
            )}

          </tbody>

        </table>


        <div className="print-signatures">

          <div>

            <span>
              Requested by:
            </span>

            <strong>
              {studentName}
            </strong>

            <small>
              Student
            </small>

          </div>

          <div>

            <span>
              Laboratory Personnel:
            </span>

            <strong>
              ______________________________
            </strong>

            <small>
              Signature over Printed Name
            </small>

          </div>

          <div>

            <span>
              Approved by:
            </span>

            <strong>
              ______________________________
            </strong>

            <small>
              Instructor / Authorized Personnel
            </small>

          </div>

        </div>

      </div>

    </div>
  );
}