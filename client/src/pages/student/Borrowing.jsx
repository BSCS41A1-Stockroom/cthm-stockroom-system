
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Borrowing.css";
import { authenticatedFetch } from "../../lib/api";
import { useAuth } from "../../auth/useAuth";
import { inventoryTotals } from "../../utils/inventoryAvailability";

const DEFAULT_BORROWING_POLICY = Object.freeze({
  maxItemsPerRequest: 10,
  maxQuantityPerRequest: 10,
  leadTimeDays: 2,
});

function dateInManila() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = Object.fromEntries(
    parts.map(({ type, value: part }) => [type, part])
  );

  return `${value.year}-${value.month}-${value.day}`;
}

export default function BorrowingInterface() {
  const { profile } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState({});

  const [borrowDate, setBorrowDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [purpose, setPurpose] = useState("");

  const [assignmentOptions, setAssignmentOptions] = useState({
    departments: [],
    sections: [],
    professors: [],
  });

  const [departmentId, setDepartmentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [assignedProfessorId, setAssignedProfessorId] = useState("");
  const [professorQuery, setProfessorQuery] = useState("");
  const [professorSuggestionsOpen, setProfessorSuggestionsOpen] =
    useState(false);
  const [professorHighlight, setProfessorHighlight] = useState(0);
  const [assignmentLoading, setAssignmentLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [expandedTable, setExpandedTable] = useState(false);

  const [inventoryView, setInventoryView] = useState("table");

  const [selectedItemDetails, setSelectedItemDetails] = useState(null);

  const [borrowingPolicy, setBorrowingPolicy] = useState(
    DEFAULT_BORROWING_POLICY
  );

  const studentName = profile?.full_name || "";
  const studentId = profile?.student_id || "";

  /*
   * ============================================================
   * LOAD INVENTORY
   * ============================================================
   */

  useEffect(() => {
    loadInventory();
    loadBorrowingPolicy();
    loadAssignmentOptions();

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

  async function loadBorrowingPolicy() {
    try {
      const response = await authenticatedFetch(
        "/api/borrowings/policy"
      );

      if (!response.ok) return;

      const policy = await response.json();

      setBorrowingPolicy({
        maxItemsPerRequest:
          Number(policy.maxItemsPerRequest) ||
          DEFAULT_BORROWING_POLICY.maxItemsPerRequest,

        maxQuantityPerRequest:
          Number(policy.maxQuantityPerRequest) ||
          DEFAULT_BORROWING_POLICY.maxQuantityPerRequest,

        leadTimeDays:
          Number(policy.leadTimeDays) ||
          DEFAULT_BORROWING_POLICY.leadTimeDays,
      });
    } catch {
      // Safe defaults mirror the server policy.
    }
  }

  async function loadAssignmentOptions() {
    setAssignmentLoading(true);

    try {
      const response = await authenticatedFetch(
        "/api/borrowings/assignment-options"
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.message ||
            "Unable to load departments, sections, and professors."
        );
      }

      setAssignmentOptions({
        departments: body.departments || [],
        sections: body.sections || [],
        professors: body.professors || [],
      });
    } catch (error) {
      setFormError(error.message);
    } finally {
      setAssignmentLoading(false);
    }
  }

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

  const availableSections = useMemo(
    () =>
      assignmentOptions.sections.filter(
        (section) =>
          String(section.departmentId) === String(departmentId)
      ),
    [assignmentOptions.sections, departmentId]
  );

  const professorSuggestions = useMemo(() => {
    const query = professorQuery.trim().toLowerCase();

    return assignmentOptions.professors
      .filter(
        (professor) =>
          String(professor.departmentId) === String(departmentId) &&
          (!query ||
            professor.fullName
              .toLowerCase()
              .includes(query))
      )
      .slice(0, 8);
  }, [
    assignmentOptions.professors,
    departmentId,
    professorQuery,
  ]);

  function selectProfessor(professor) {
    setAssignedProfessorId(professor.id);
    setProfessorQuery(professor.fullName);
    setProfessorSuggestionsOpen(false);
    setProfessorHighlight(0);
  }

  /*
   * ============================================================
   * INVENTORY IMAGE
   * ============================================================
   */

  function getItemImage(item) {
    return (
      item.image_url ||
      item.image ||
      item.image_path ||
      item.photo_url ||
      item.photo ||
      ""
    );
  }

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

    if (!departmentId) {
      return "Please select your department.";
    }

    if (!sectionId) {
      return "Please select your section.";
    }

    if (!assignedProfessorId) {
      return "Select an assigned professor from the official suggestions.";
    }

    if (totalItems === 0) {
      return "Please select at least one item.";
    }

    if (totalItems > borrowingPolicy.maxItemsPerRequest) {
      return `Each request may contain at most ${borrowingPolicy.maxItemsPerRequest} different items. You selected ${totalItems}.`;
    }

    if (totalUnits > borrowingPolicy.maxQuantityPerRequest) {
      return `Each request may contain at most ${borrowingPolicy.maxQuantityPerRequest} total units. You selected ${totalUnits}. This is a per-request quantity limit, not an active-request limit.`;
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
            departmentId,
            sectionId,
            assignedProfessorId,

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
      setDepartmentId("");
      setSectionId("");
      setAssignedProfessorId("");
      setProfessorQuery("");
      setSelectedItemDetails(null);

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
   * PRINT OFFICIAL BORROWER'S FORM
   * ============================================================
   */

  async function handlePrint() {
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

    try {
      const now = new Date();

      const controlNo =
        generateControlNumber(now);

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

      console.log(
        "Generating official Borrower's Form:",
        formData
      );

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

      const blob =
        await response.blob();

      const blobUrl =
        window.URL.createObjectURL(
          blob
        );

      const link =
        document.createElement("a");

      link.href = blobUrl;

      link.download =
        `Borrowers-Form-${controlNo}.docx`;

      document.body.appendChild(link);

      link.click();

      link.remove();

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

  function renderInventoryTable() {
    return (
      <table className="inventory-table">

        <colgroup>
          <col className="col-check" />
          <col className="col-image" />
          <col className="col-item" />
          <col className="col-available" />
          <col className="col-qty" />
        </colgroup>

        <thead>
          <tr>
            <th>Select</th>
            <th>Picture</th>
            <th>Item</th>
            <th>Available</th>
            <th>Qty</th>
          </tr>
        </thead>

        <tbody>

          {filteredItems.length === 0 && (
            <tr>
              <td
                colSpan={5}
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

            const imageUrl =
              getItemImage(item);

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

                <td className="image-cell">

                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={
                        item.item_name ||
                        "Inventory item"
                      }
                      className="inventory-item-image"
                      onError={(e) => {
                        e.currentTarget.style.display =
                          "none";

                        e.currentTarget.parentElement
                          ?.classList.add(
                            "image-failed"
                          );
                      }}
                    />
                  ) : (
                    <div className="inventory-image-placeholder">
                      —
                    </div>
                  )}

                </td>

                <td className="item-cell">

                  <span
                    className="item-name"
                    title={item.item_name || ""}
                  >
                    {item.item_name}
                  </span>

                </td>

                <td className="available-cell">

                  <span
                    className={
                      available <= 0
                        ? "availability-zero"
                        : "availability-number"
                    }
                  >
                    {available}
                  </span>

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
   * CARD VIEW
   * ============================================================
   */

  function renderInventoryCards() {
    if (filteredItems.length === 0) {
      return (
        <div className="inventory-card-empty">

          <div className="inventory-card-empty-icon">
            ☐
          </div>

          <h3>
            No Inventory Found
          </h3>

          <p>
            Try searching for another inventory item.
          </p>

        </div>
      );
    }

    return (
      <div className="inventory-card-grid">

        {filteredItems.map((item) => {

          const { available } =
            inventoryTotals(item);

          const checked =
            selected[item.id] !== undefined;

          const imageUrl =
            getItemImage(item);

          const totalQuantity =
            item.quantity ??
            item.total_quantity ??
            item.totalQuantity ??
            item.stock_quantity ??
            item.stock ??
            null;

          const category =
            item.category ||
            item.item_category ||
            "";

          const unit =
            item.unit ||
            item.unit_type ||
            "";

          const itemCode =
            item.item_code ||
            item.code ||
            item.itemCode ||
            "";

          return (
            <article
              key={item.id}
              className={`inventory-card ${
                checked
                  ? "inventory-card-selected"
                  : ""
              }`}
            >

              {/* IMAGE */}

              <button
                type="button"
                className="inventory-card-image-wrap"
                onClick={() =>
                  setSelectedItemDetails(item)
                }
              >

                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={
                      item.item_name ||
                      "Inventory item"
                    }
                    className="inventory-card-image"
                    onError={(e) => {
                      e.currentTarget.style.display =
                        "none";

                      e.currentTarget.parentElement
                        ?.classList.add(
                          "image-failed"
                        );
                    }}
                  />
                ) : (
                  <div className="inventory-card-image-placeholder">
                    <span>
                      No Image
                    </span>
                  </div>
                )}

                <span className="inventory-card-image-overlay">
                  View Details
                </span>

              </button>


              {/* CARD CONTENT */}

              <div className="inventory-card-content">

                <div className="inventory-card-title-row">

                  <div className="inventory-card-title">

                    <h3
                      title={
                        item.item_name || ""
                      }
                    >
                      {item.item_name ||
                        "Unnamed Item"}
                    </h3>

                  </div>

                  <span
                    className={`inventory-stock-badge ${
                      available <= 0
                        ? "out-of-stock"
                        : available <= 3
                        ? "low-stock"
                        : ""
                    }`}
                  >
                    {available <= 0
                      ? "Unavailable"
                      : `${available} Available`}
                  </span>

                </div>


                {/* CARD DETAILS */}

                <div className="inventory-card-details">

                  {category && (
                    <div className="inventory-card-detail">
                      <span>
                        Category
                      </span>

                      <strong>
                        {category}
                      </strong>
                    </div>
                  )}

                  {itemCode && (
                    <div className="inventory-card-detail">
                      <span>
                        Item Code
                      </span>

                      <strong>
                        {itemCode}
                      </strong>
                    </div>
                  )}

                  {unit && (
                    <div className="inventory-card-detail">
                      <span>
                        Unit
                      </span>

                      <strong>
                        {unit}
                      </strong>
                    </div>
                  )}

                  {totalQuantity !== null && (
                    <div className="inventory-card-detail">
                      <span>
                        Total Stock
                      </span>

                      <strong>
                        {totalQuantity}
                      </strong>
                    </div>
                  )}

                </div>


                {/* SELECTION */}

                <div className="inventory-card-actions">

                  <label className="inventory-card-select">

                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={
                        available <= 0
                      }
                      onChange={(e) =>
                        toggleItem(
                          item,
                          e.target.checked
                        )
                      }
                    />

                    <span>
                      Select item
                    </span>

                  </label>


                  <div className="inventory-card-quantity">

                    <span>
                      Quantity
                    </span>

                    <input
                      type="number"
                      min="1"
                      max={available}
                      className="qty-input"
                      disabled={!checked}
                      value={
                        selected[item.id] ??
                        ""
                      }
                      onChange={(e) =>
                        updateQuantity(
                          item.id,
                          e.target.value,
                          available
                        )
                      }
                    />

                  </div>

                </div>


                {/* DETAILS BUTTON */}

                <button
                  type="button"
                  className="inventory-card-details-btn"
                  onClick={() =>
                    setSelectedItemDetails(item)
                  }
                >
                  View Item Details

                  <span>
                    →
                  </span>

                </button>

              </div>

            </article>
          );
        })}

      </div>
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

        <div className="borrow-loading">
          Loading inventory...
        </div>

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

      {/* HEADER */}

      <header className="borrow-header">

        <h1>
          Borrow Items
        </h1>

        <p className="borrow-subtitle">
          Select inventory items to borrow.
        </p>

      </header>


      {/* SUCCESS */}

      {successMsg && (
        <div className="top-success">
          {successMsg}
        </div>
      )}


      {/* MAIN PANEL */}

      <section className="borrow-panel">

        {/* BORROWING INFORMATION */}

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
              Department

              <select
                value={departmentId}
                disabled={assignmentLoading}
                onChange={(event) => {

                  setDepartmentId(
                    event.target.value
                  );

                  setSectionId("");
                  setAssignedProfessorId("");
                  setProfessorQuery("");

                }}
              >

                <option value="">
                  {assignmentLoading
                    ? "Loading departments..."
                    : "Select department"}
                </option>

                {assignmentOptions.departments.map(
                  (department) => (

                    <option
                      key={department.id}
                      value={department.id}
                    >
                      {department.code} —{" "}
                      {department.name}
                    </option>

                  )
                )}

              </select>

            </label>


            <label>
              Section

              <select
                value={sectionId}
                disabled={
                  !departmentId ||
                  assignmentLoading
                }
                onChange={(event) =>
                  setSectionId(
                    event.target.value
                  )
                }
              >

                <option value="">
                  {departmentId
                    ? "Select section"
                    : "Select a department first"}
                </option>

                {availableSections.map(
                  (section) => (

                    <option
                      key={section.id}
                      value={section.id}
                    >
                      {section.name}
                    </option>

                  )
                )}

              </select>

            </label>


            {/* PROFESSOR */}

            <label className="professor-combobox-field">

              Assigned Professor

              <div className="professor-combobox">

                <input
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={
                    professorSuggestionsOpen
                  }
                  aria-controls="professor-suggestions"
                  disabled={
                    !departmentId ||
                    assignmentLoading
                  }
                  value={professorQuery}
                  placeholder={
                    departmentId
                      ? "Type the professor's name..."
                      : "Select a department first"
                  }
                  onFocus={() =>
                    setProfessorSuggestionsOpen(
                      true
                    )
                  }
                  onBlur={() =>
                    setProfessorSuggestionsOpen(
                      false
                    )
                  }
                  onChange={(event) => {

                    setProfessorQuery(
                      event.target.value
                    );

                    setAssignedProfessorId("");

                    setProfessorHighlight(0);

                    setProfessorSuggestionsOpen(
                      true
                    );

                  }}
                  onKeyDown={(event) => {

                    if (
                      event.key ===
                      "Escape"
                    ) {
                      setProfessorSuggestionsOpen(
                        false
                      );
                    }

                    if (
                      event.key ===
                        "ArrowDown" &&
                      professorSuggestions.length
                    ) {

                      event.preventDefault();

                      setProfessorSuggestionsOpen(
                        true
                      );

                      setProfessorHighlight(
                        (index) =>
                          (index + 1) %
                          professorSuggestions.length
                      );

                    }

                    if (
                      event.key ===
                        "ArrowUp" &&
                      professorSuggestions.length
                    ) {

                      event.preventDefault();

                      setProfessorSuggestionsOpen(
                        true
                      );

                      setProfessorHighlight(
                        (index) =>
                          (index -
                            1 +
                            professorSuggestions.length) %
                          professorSuggestions.length
                      );

                    }

                    if (
                      event.key ===
                        "Enter" &&
                      professorSuggestionsOpen &&
                      professorSuggestions[
                        professorHighlight
                      ]
                    ) {

                      event.preventDefault();

                      selectProfessor(
                        professorSuggestions[
                          professorHighlight
                        ]
                      );

                    }

                  }}
                />


                {professorSuggestionsOpen &&
                  departmentId && (

                    <div
                      id="professor-suggestions"
                      className="professor-suggestions"
                      role="listbox"
                    >

                      {professorSuggestions.length ? (

                        professorSuggestions.map(
                          (
                            professor,
                            index
                          ) => (

                            <button
                              type="button"
                              role="option"
                              aria-selected={
                                assignedProfessorId ===
                                  professor.id ||
                                professorHighlight ===
                                  index
                              }
                              key={
                                professor.id
                              }
                              onMouseDown={(
                                event
                              ) =>
                                event.preventDefault()
                              }
                              onClick={() =>
                                selectProfessor(
                                  professor
                                )
                              }
                            >

                              <strong>
                                {
                                  professor.fullName
                                }
                              </strong>

                              <span>
                                {
                                  assignmentOptions.departments.find(
                                    (
                                      department
                                    ) =>
                                      String(
                                        department.id
                                      ) ===
                                      String(
                                        professor.departmentId
                                      )
                                  )?.name
                                }
                              </span>

                            </button>

                          )
                        )

                      ) : (

                        <div className="professor-no-results">
                          No active professor matches that name.
                        </div>

                      )}

                    </div>

                  )}

              </div>


              {assignedProfessorId && (
                <small className="professor-selected-hint">
                  Official professor account selected
                </small>
              )}

            </label>


            {/* BORROW DATE */}

            <label>
              Borrow Date

              <input
                type="date"
                min={dateInManila()}
                value={borrowDate}
                onChange={(e) =>
                  setBorrowDate(
                    e.target.value
                  )
                }
              />

            </label>


            {/* RETURN DATE */}

            <label>
              Return Date

              <input
                type="date"
                min={
                  borrowDate ||
                  dateInManila()
                }
                value={returnDate}
                onChange={(e) =>
                  setReturnDate(
                    e.target.value
                  )
                }
              />

            </label>


            {/* PURPOSE */}

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


        {/* ERROR */}

        {formError && (
          <p className="form-error top-error">
            {formError}
          </p>
        )}


        {/* SEARCH */}

        <div className="filter-bar">

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


        {/* INVENTORY HEADER */}

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


          <div className="inventory-view-controls">

            <button
              type="button"
              className={`inventory-view-btn ${
                inventoryView === "table"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setInventoryView(
                  "table"
                )
              }
            >
              Table View
            </button>


            <button
              type="button"
              className={`inventory-view-btn ${
                inventoryView === "cards"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setInventoryView(
                  "cards"
                )
              }
            >
              Card View
            </button>


            {inventoryView ===
              "table" && (

              <button
                type="button"
                className="expand-table-btn"
                onClick={() =>
                  setExpandedTable(
                    true
                  )
                }
              >
                Expand Table
              </button>

            )}

          </div>

        </div>


        {/* INVENTORY */}

        {inventoryView === "table" ? (

          <div className="table-wrap">
            {renderInventoryTable()}
          </div>

        ) : (

          <div className="inventory-cards-wrap">
            {renderInventoryCards()}
          </div>

        )}


        {/* FOOTER */}

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

            <span
              className={`request-limit ${
                totalUnits >
                borrowingPolicy.maxQuantityPerRequest
                  ? "exceeded"
                  : ""
              }`}
            >
              /{" "}
              {
                borrowingPolicy.maxQuantityPerRequest
              }{" "}
              unit limit
            </span>

          </div>


          <div className="borrow-footer-actions">

            <button
              type="button"
              className="borrow-action-btn borrow-print-btn"
              onClick={handlePrint}
            >
              Print
            </button>


            <button
              type="button"
              className="borrow-action-btn submit-btn-main"
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


      {/* ========================================================
          ITEM DETAILS MODAL
          ======================================================== */}

      {selectedItemDetails && (

        <div
          className="item-details-overlay"
          onMouseDown={(e) => {

            if (
              e.target ===
              e.currentTarget
            ) {
              setSelectedItemDetails(
                null
              );
            }

          }}
        >

          <div className="item-details-modal">

            {/* HEADER */}

            <div className="item-details-header">

              <div>

                <h2>
                  {
                    selectedItemDetails.item_name ||
                    "Unnamed Item"
                  }
                </h2>

              </div>


              <button
                type="button"
                className="item-details-close"
                aria-label="Close item details"
                onClick={() =>
                  setSelectedItemDetails(
                    null
                  )
                }
              >
                ×
              </button>

            </div>


            {/* BODY */}

            <div className="item-details-body">

              {/* IMAGE */}

              <div className="item-details-image-section">

                {getItemImage(
                  selectedItemDetails
                ) ? (

                  <img
                    src={getItemImage(
                      selectedItemDetails
                    )}
                    alt={
                      selectedItemDetails.item_name ||
                      "Inventory item"
                    }
                    className="item-details-image"
                    onError={(e) => {
                      e.currentTarget.style.display =
                        "none";

                      e.currentTarget.parentElement
                        ?.classList.add(
                          "image-failed"
                        );
                    }}
                  />

                ) : (

                  <div className="item-details-image-placeholder">
                    <span>
                      No Image Available
                    </span>
                  </div>

                )}

              </div>


              {/* INFORMATION */}

              <div className="item-details-information">

                <div className="item-details-stock">

                  <div>

                    <span>
                      Available Quantity
                    </span>

                    <strong>
                      {
                        inventoryTotals(
                          selectedItemDetails
                        ).available
                      }
                    </strong>

                  </div>

                  <span
                    className={`item-details-status ${
                      inventoryTotals(
                        selectedItemDetails
                      ).available <= 0
                        ? "unavailable"
                        : "available"
                    }`}
                  >
                    {
                      inventoryTotals(
                        selectedItemDetails
                      ).available > 0
                        ? "Available"
                        : "Unavailable"
                    }
                  </span>

                </div>


                <div className="item-details-grid">

                  <div>
                    <span>
                      Item Name
                    </span>

                    <strong>
                      {
                        selectedItemDetails.item_name ||
                        "—"
                      }
                    </strong>
                  </div>


                  <div>
                    <span>
                      Item Code
                    </span>

                    <strong>
                      {
                        selectedItemDetails.item_code ||
                        selectedItemDetails.code ||
                        "—"
                      }
                    </strong>
                  </div>


                  <div>
                    <span>
                      Category
                    </span>

                    <strong>
                      {
                        selectedItemDetails.category ||
                        selectedItemDetails.item_category ||
                        "—"
                      }
                    </strong>
                  </div>


                  <div>
                    <span>
                      Unit
                    </span>

                    <strong>
                      {
                        selectedItemDetails.unit ||
                        selectedItemDetails.unit_type ||
                        "—"
                      }
                    </strong>
                  </div>


                  <div>
                    <span>
                      Total Quantity
                    </span>

                    <strong>
                      {
                        selectedItemDetails.quantity ??
                        selectedItemDetails.total_quantity ??
                        selectedItemDetails.totalQuantity ??
                        selectedItemDetails.stock_quantity ??
                        selectedItemDetails.stock ??
                        "—"
                      }
                    </strong>
                  </div>


                  <div>
                    <span>
                      Available
                    </span>

                    <strong>
                      {
                        inventoryTotals(
                          selectedItemDetails
                        ).available
                      }
                    </strong>
                  </div>

                </div>


                <div className="item-details-selection">

                  <label className="item-details-checkbox">

                    <input
                      type="checkbox"
                      checked={
                        selected[
                          selectedItemDetails.id
                        ] !== undefined
                      }
                      disabled={
                        inventoryTotals(
                          selectedItemDetails
                        ).available <= 0
                      }
                      onChange={(e) =>
                        toggleItem(
                          selectedItemDetails,
                          e.target.checked
                        )
                      }
                    />

                    <span>
                      Select this item for borrowing
                    </span>

                  </label>


                  {selected[
                    selectedItemDetails.id
                  ] !== undefined && (

                    <div className="item-details-quantity">

                      <label>
                        Quantity
                      </label>

                      <input
                        type="number"
                        min="1"
                        max={
                          inventoryTotals(
                            selectedItemDetails
                          ).available
                        }
                        value={
                          selected[
                            selectedItemDetails.id
                          ] ?? 1
                        }
                        onChange={(e) =>
                          updateQuantity(
                            selectedItemDetails.id,
                            e.target.value,
                            inventoryTotals(
                              selectedItemDetails
                            ).available
                          )
                        }
                      />

                    </div>

                  )}

                </div>

              </div>

            </div>


            {/* FOOTER */}

            <div className="item-details-footer">

              <button
                type="button"
                className="action-btn secondary-btn"
                onClick={() =>
                  setSelectedItemDetails(
                    null
                  )
                }
              >
                Close
              </button>

            </div>

          </div>

        </div>

      )}


      {/* ========================================================
          EXPANDED TABLE MODAL
          ======================================================== */}

      {expandedTable && (

        <div
          className="table-modal-overlay"
          onMouseDown={(e) => {

            if (
              e.target ===
              e.currentTarget
            ) {
              setExpandedTable(
                false
              );
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
                  setExpandedTable(
                    false
                  )
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
                  setExpandedTable(
                    false
                  )
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
