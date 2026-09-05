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

    if (borrowDate < today) {
      return "Borrow date cannot be in the past.";
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

<<<<<<< HEAD
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

  const currentDate =
    now.toLocaleDateString(
      "en-PH",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );

  const borrowDateText =
    formatDate(borrowDate);

  const returnDateText =
    formatDate(returnDate);

  const rows = Array.from(
    { length: 30 },
    (_, index) => {
      const item = selectedList[index];

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${item ? escapeHtml(item.item_name) : ""}</td>
          <td>${item ? item.borrowQty : ""}</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      `;
    }
  ).join("");

  const printWindow =
    window.open(
      "",
      "_blank",
      "width=1000,height=800"
    );

  if (!printWindow) {
    setFormError(
      "Print window was blocked by the browser. Please allow pop-ups for this site."
    );

    return;
  }

  printWindow.document.open();

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>

        <meta charset="UTF-8" />

        <title>
          Laboratory Borrowing Form
        </title>

        <style>

          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
          }

          body {
            color: #000000;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
            font-size: 10px;
          }

          .print-document {
            width: 100%;
            color: #000000;
          }

          /* =========================================
             HEADER
          ========================================= */

          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;

            gap: 20px;

            padding-bottom: 10px;

            border-bottom: 2px solid #000000;
          }

          .print-header h1 {
            margin: 0;

            font-size: 18px;
            font-weight: 700;
          }

          .print-header p {
            margin: 4px 0 0;

            font-size: 9px;
          }

          .print-control {
            min-width: 145px;

            border: 1px solid #000000;

            text-align: center;
          }

          .print-control div {
            padding: 4px;

            border-bottom: 1px solid #000000;

            font-size: 8px;
            font-weight: 700;
          }

          .print-control strong {
            display: block;

            padding: 6px 4px;

            font-size: 10px;
          }

          /* =========================================
             SIMPLE INFORMATION
             NO TABLE / NO GRID
          ========================================= */

          .print-info {
            display: flex;

            flex-wrap: wrap;

            gap: 14px 28px;

            margin-top: 12px;

            padding-bottom: 10px;

            border-bottom: 1px solid #000000;
          }

          .print-info-item {
            display: flex;

            align-items: baseline;

            gap: 5px;

            white-space: nowrap;
          }

          .print-info-item span {
            font-size: 8px;

            font-weight: 700;
          }

          .print-info-item strong {
            font-size: 9px;

            font-weight: 400;
          }

          /* =========================================
             BORROW DATE / RETURN DATE
          ========================================= */

          .print-dates {
            display: flex;

            gap: 28px;

            margin-top: 8px;

            padding-bottom: 8px;
          }

          .print-date-item {
            display: flex;

            gap: 5px;

            align-items: baseline;
          }

          .print-date-item span {
            font-size: 8px;

            font-weight: 700;
          }

          .print-date-item strong {
            font-size: 9px;

            font-weight: 400;
          }

          /* =========================================
             BORROWING TABLE
          ========================================= */

          .print-borrow-table {
            width: 100%;

            margin-top: 12px;

            border-collapse: collapse;

            table-layout: fixed;

            font-size: 9px;
          }

          .print-borrow-table th,
          .print-borrow-table td {
            border: 1px solid #000000;

            padding: 3px 4px;

            height: 17px;
          }

          .print-borrow-table th {
            height: 25px;

            background: #eeeeee;

            text-align: center;

            font-weight: 700;
          }

          .print-borrow-table th:nth-child(1),
          .print-borrow-table td:nth-child(1) {
            width: 6%;

            text-align: center;
          }

          .print-borrow-table th:nth-child(2),
          .print-borrow-table td:nth-child(2) {
            width: 34%;

            text-align: left;
          }

          .print-borrow-table th:nth-child(3),
          .print-borrow-table td:nth-child(3) {
            width: 9%;

            text-align: center;
          }

          .print-borrow-table th:nth-child(4),
          .print-borrow-table td:nth-child(4) {
            width: 15%;

            text-align: center;
          }

          .print-borrow-table th:nth-child(5),
          .print-borrow-table td:nth-child(5) {
            width: 15%;

            text-align: center;
          }

          .print-borrow-table th:nth-child(6),
          .print-borrow-table td:nth-child(6) {
            width: 21%;

            text-align: left;
          }

          /* =========================================
             SIGNATURES
          ========================================= */

          .print-signatures {
            display: grid;

            grid-template-columns:
              repeat(3, 1fr);

            gap: 20px;

            margin-top: 25px;
          }

          .print-signatures > div {
            display: flex;

            flex-direction: column;

            gap: 4px;
          }

          .print-signatures span {
            font-size: 8px;

            font-weight: 700;
          }

          .print-signatures strong {
            margin-top: 20px;

            min-height: 15px;

            border-bottom: 1px solid #000000;

            font-size: 9px;

            font-weight: 400;

            text-align: center;
          }

          .print-signatures small {
            font-size: 7px;

            text-align: center;
          }

        </style>

      </head>

      <body>

        <div class="print-document">

          <div class="print-header">

            <div>

              <h1>
                LABORATORY BORROWING FORM
              </h1>

              <p>
                Laboratory Equipment / Supplies Borrowing
              </p>

            </div>

            <div class="print-control">

              <div>
                Control No.
              </div>

              <strong>
                ${escapeHtml(controlNo)}
              </strong>

            </div>

          </div>


          <!-- SIMPLE INFO -->

          <div class="print-info">

            <div class="print-info-item">
              <span>Name:</span>

              <strong>
                ${escapeHtml(studentName)}
              </strong>
            </div>

            <div class="print-info-item">
              <span>Student ID:</span>

              <strong>
                ${escapeHtml(studentId)}
              </strong>
            </div>

            <div class="print-info-item">
              <span>Date:</span>

              <strong>
                ${escapeHtml(currentDate)}
              </strong>
            </div>

            <div class="print-info-item">
              <span>Laboratory No.:</span>

              <strong>
                ____________________
              </strong>
            </div>

          </div>


          <div class="print-dates">

            <div class="print-date-item">

              <span>
                Borrow Date:
              </span>

              <strong>
                ${escapeHtml(borrowDateText)}
              </strong>

            </div>

            <div class="print-date-item">

              <span>
                Return Date:
              </span>

              <strong>
                ${escapeHtml(returnDateText)}
              </strong>

            </div>

          </div>


          <!-- INVENTORY TABLE -->

          <table class="print-borrow-table">

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

              ${rows}

            </tbody>

          </table>


          <!-- SIGNATURES -->

          <div class="print-signatures">

            <div>

              <span>
                Requested by:
              </span>

              <strong>
                ${escapeHtml(studentName)}
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

      </body>
    </html>
  `);

  printWindow.document.close();

  printWindow.focus();

  setTimeout(() => {
    printWindow.print();

    setTimeout(() => {
      printWindow.close();
    }, 500);
  }, 250);
}

  /*
   * ============================================================
   * ESCAPE HTML
   * ============================================================
   */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const today =
    new Date()
      .toISOString()
      .split("T")[0];
=======
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
>>>>>>> 1d658fe5273e990e98ecd8d900e19e08113dd72d

  /*
   * ============================================================
   * TABLE
   * ============================================================
   */

  function renderInventoryTable() {
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

          {renderInventoryTable()}

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

              {renderInventoryTable()}

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
    </div>
  );
}
