import { useState, useEffect, useMemo } from "react";
import "./Borrowing.css";

// Adjust this if your server runs elsewhere.
const API_BASE = "http://localhost:5000";

/**
 * Assumptions (adjust to match your actual backend):
 * - GET  ${API_BASE}/api/inventory
 *     -> [{ id, name, category, available, unit }]
 * - POST ${API_BASE}/api/borrow
 *     body: { items: [{ itemId, quantity }], borrowDate, returnDate, purpose }
 */

export default function BorrowingInterface() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  // selected[id] = quantity (only present when checked)
  const [selected, setSelected] = useState({});
  const [borrowDate, setBorrowDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [purpose, setPurpose] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${API_BASE}/api/inventory`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      setLoadError(
        "Couldn't load inventory. Check that the server is running and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name
        ?.toLowerCase()
        .includes(search.trim().toLowerCase());
      const matchesCategory =
        category === "all" || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, category]);

  const selectedList = useMemo(() => {
    return Object.entries(selected)
      .map(([id, qty]) => {
        const item = items.find((i) => String(i.id) === String(id));
        return item ? { ...item, quantity: qty } : null;
      })
      .filter(Boolean);
  }, [selected, items]);

  const totalItems = selectedList.length;
  const totalUnits = selectedList.reduce((sum, i) => sum + (i.quantity || 0), 0);

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

  function updateQuantity(itemId, rawValue, max) {
    let value = parseInt(rawValue, 10);
    if (Number.isNaN(value)) value = 1;
    if (value < 1) value = 1;
    if (max != null && value > max) value = max;
    setSelected((prev) => ({ ...prev, [itemId]: value }));
  }

  function validate() {
    if (totalItems === 0) return "Select at least one item to borrow.";
    if (!borrowDate) return "Choose a borrow date.";
    if (!returnDate) return "Choose a return date.";
    if (new Date(returnDate) < new Date(borrowDate))
      return "Return date can't be before the borrow date.";
    if (!purpose.trim()) return "Tell us the purpose of this request.";
    for (const item of selectedList) {
      if (item.available != null && item.quantity > item.available) {
        return `${item.name}: only ${item.available} ${item.unit || "pcs"} available.`;
      }
    }
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSuccessMsg("");
    const error = validate();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/borrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedList.map((i) => ({
            itemId: i.id,
            quantity: i.quantity,
          })),
          borrowDate,
          returnDate,
          purpose: purpose.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setSuccessMsg("Request submitted. You'll be notified once it's reviewed.");
      setSelected({});
      setBorrowDate("");
      setReturnDate("");
      setPurpose("");
      fetchInventory();
    } catch (err) {
      setFormError("Couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const todayISO = new Date().toISOString().split("T")[0];

  return (
    <div className="borrow-page">
      <header className="borrow-header">
        <p className="borrow-eyebrow">Stockroom</p>
        <h1>Borrow items</h1>
        <p className="borrow-subtitle">
          Pick what you need, set your dates, and send a request for approval.
        </p>
      </header>

      <div className="borrow-layout">
        {/* LEFT: browse + select */}
        <section className="borrow-panel browse-panel">
          <div className="filter-bar">
            <div className="search-field">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search inventory"
              />
            </div>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All categories" : c}
                </option>
              ))}
            </select>
          </div>

          {loading && <p className="state-msg">Loading inventory…</p>}
          {loadError && (
            <div className="state-msg error">
              {loadError}{" "}
              <button type="button" className="retry-btn" onClick={fetchInventory}>
                Retry
              </button>
            </div>
          )}

          {!loading && !loadError && (
            <div className="table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th className="col-check" aria-label="Select" />
                    <th>Item</th>
                    <th>Category</th>
                    <th>Available</th>
                    <th className="col-qty">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-cell">
                        No items match your search.
                      </td>
                    </tr>
                  )}
                  {filteredItems.map((item) => {
                    const isChecked = selected[item.id] !== undefined;
                    const isOut = item.available === 0;
                    return (
                      <tr
                        key={item.id}
                        className={isChecked ? "row-selected" : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isOut}
                            onChange={(e) => toggleItem(item, e.target.checked)}
                            aria-label={`Select ${item.name}`}
                          />
                        </td>
                        <td>
                          <span className="item-name">{item.name}</span>
                          {isOut && <span className="badge-out">Out of stock</span>}
                        </td>
                        <td className="muted">{item.category || "—"}</td>
                        <td className="muted">
                          {item.available ?? "—"} {item.unit || ""}
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={item.available ?? undefined}
                            value={selected[item.id] ?? ""}
                            disabled={!isChecked}
                            onChange={(e) =>
                              updateQuantity(item.id, e.target.value, item.available)
                            }
                            className="qty-input"
                            aria-label={`Quantity for ${item.name}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* RIGHT: sticky request summary, loan-calculator style */}
        <aside className="borrow-panel summary-panel">
          <h2>Request summary</h2>

          {totalItems === 0 ? (
            <p className="summary-empty">
              Nothing selected yet. Check items on the left to add them here.
            </p>
          ) : (
            <ul className="summary-list">
              {selectedList.map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <span className="summary-qty">
                    ×{item.quantity} {item.unit || ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="summary-totals">
            <div>
              <span className="total-label">Items</span>
              <span className="total-value">{totalItems}</span>
            </div>
            <div>
              <span className="total-label">Units</span>
              <span className="total-value">{totalUnits}</span>
            </div>
          </div>

          <form className="summary-form" onSubmit={handleSubmit}>
            <label>
              Borrow date
              <input
                type="date"
                min={todayISO}
                value={borrowDate}
                onChange={(e) => setBorrowDate(e.target.value)}
              />
            </label>

            <label>
              Return date
              <input
                type="date"
                min={borrowDate || todayISO}
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </label>

            <label>
              Purpose
              <textarea
                placeholder="What is this for?"
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </label>

            {formError && <p className="form-error">{formError}</p>}
            {successMsg && <p className="form-success">{successMsg}</p>}

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
