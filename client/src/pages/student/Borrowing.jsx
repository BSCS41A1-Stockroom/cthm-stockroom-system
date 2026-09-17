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

  /*
   * ============================================================
   * PRINT OFFICIAL BORROWER'S FORM
   * ============================================================
   *
   * The official DOCX is generated by the backend.
   *
   * Data source:
   * Supabase inventory
   *        ↓
   * selectedList
   *        ↓
   * this function
   *        ↓
   * /api/borrower-form
   *        ↓
   * official DOCX template
   *
   * ============================================================
   */

  async function handlePrint() {
    setFormError("");

    // ----------------------------------------------------------
    // VALIDATE
    // ----------------------------------------------------------

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

    try {
      // --------------------------------------------------------
      // GENERATE CONTROL NUMBER
      // --------------------------------------------------------

      const now = new Date();

      const controlNo =
        generateControlNumber(now);

      // --------------------------------------------------------
      // CURRENT DATE + TIME
      // --------------------------------------------------------

      const dateTime =
        now.toLocaleString(
          "en-PH",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }
        );

      // --------------------------------------------------------
      // PREPARE OFFICIAL FORM DATA
      // --------------------------------------------------------
      //
      // selectedList already contains the actual inventory
      // records retrieved from Supabase.
      //
      // borrowQty is the quantity selected by the student.
      // --------------------------------------------------------

      const formData = {
        laboratory: "",

        dateTime,

        controlNo,

        items: selectedList
          .slice(0, 30)
          .map((item) => ({
            description:
              item.item_name || "",

            quantity:
              item.borrowQty || 0,

            released:
              item.borrowQty || 0,

            returned: "",

            unreturned: "",

            remarks: "",
          })),
      };

      // --------------------------------------------------------
      // DEBUG
      // --------------------------------------------------------

      console.log(
        "Generating official Borrower's Form:",
        formData
      );

      // --------------------------------------------------------
      // SEND DATA TO BACKEND
      // --------------------------------------------------------

      const response =
        await authenticatedFetch(
          "/api/borrower-form",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              formData
            ),
          }
        );

      // --------------------------------------------------------
      // CHECK RESPONSE
      // --------------------------------------------------------

      if (!response.ok) {
        let message =
          "Failed to generate Borrower's Form.";

        try {
          const errorData =
            await response.json();

          message =
            errorData.message ||
            message;
        } catch {
          // Response was not JSON.
        }

        throw new Error(message);
      }

      // --------------------------------------------------------
      // RECEIVE DOCX
      // --------------------------------------------------------

      const blob =
        await response.blob();

      // --------------------------------------------------------
      // CREATE DOWNLOAD URL
      // --------------------------------------------------------

      const blobUrl =
        window.URL.createObjectURL(
          blob
        );

      // --------------------------------------------------------
      // CREATE DOWNLOAD LINK
      // --------------------------------------------------------

      const link =
        document.createElement("a");

      link.href = blobUrl;

      link.download =
        `Borrowers-Form-${controlNo}.docx`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      // --------------------------------------------------------
      // CLEANUP
      // --------------------------------------------------------

      window.URL.revokeObjectURL(
        blobUrl
      );

    } catch (error) {

      console.error(
        "Borrower's Form generation error:",
        error
      );

      setFormError(
        error.message ||
        "Failed to generate Borrower's Form."
      );
    }
  }

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
                min={
                  new Date()
                    .toISOString()
                    .split("T")[0]
                }
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
                  borrowDate ||
                  new Date()
                    .toISOString()
                    .split("T")[0]
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
                    setSearch(
                      e.target.value
                    )
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

    </div>
  );
}