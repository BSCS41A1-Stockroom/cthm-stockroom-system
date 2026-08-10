import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Borrowing.css";

export default function BorrowingInterface() {
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

  useEffect(() => {
    loadInventory();
  }, []);

  async function loadInventory() {
    setLoading(true);

    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("id");

    if (error) {
      console.log(error);
    } else {
      setItems(data || []);
    }

    setLoading(false);
  }

  async function fetchInventory() {

      setLoading(true);

      const { data, error } = await supabase
          .from("inventory")
          .select("*")
          .order("item_name");

      if (error) {

          console.log(error);

          setLoadError(error.message);

      } else {

          setItems(data);

      }

      setLoading(false);

  }

  const filteredItems = useMemo(() => {

      return items.filter(item =>

          item.item_name
              .toLowerCase()
              .includes(search.toLowerCase())

      );

  }, [items, search]);

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
    let qty = parseInt(value);

    if (isNaN(qty)) qty = 1;

    if (qty < 1) qty = 1;

    if (qty > max) qty = max;

    setSelected((prev) => ({
      ...prev,
      [id]: qty,
    }));
  }

  const selectedList = useMemo(() => {
    return Object.entries(selected)
      .map(([id, qty]) => {
        const item = items.find(
          (i) => i.id == id
        );

        return item
          ? {
              ...item,
              borrowQty: qty,
            }
          : null;
      })
      .filter(Boolean);
  }, [selected, items]);

  const totalItems = selectedList.length;

  const totalUnits = selectedList.reduce(
    (sum, item) => sum + item.borrowQty,
    0
  );

  function validate() {
    if (totalItems === 0)
      return "Please select at least one item.";

    if (!borrowDate)
      return "Borrow date is required.";

    if (!returnDate)
      return "Return date is required.";

    if (
      new Date(returnDate) <
      new Date(borrowDate)
    )
      return "Return date must be after borrow date.";

    if (!purpose.trim())
      return "Purpose is required.";

    for (const item of selectedList) {
      const totalInventory =
        item.quantity +
        item.additional_qty -
        item.replaces;

      const available =
        totalInventory -
        item.missing -
        item.breakage -
        item.defective -
        item.total_loss;

      if (item.borrowQty > available) {
        return `${item.item_name} only has ${available} remaining.`;
      }
    }

    return "";
  }

async function handleSubmit(e) {

    e.preventDefault();

    setFormError("");
    setSuccessMsg("");

    const validation = validate();

    if (validation) {
        setFormError(validation);
        return;
    }

    setSubmitting(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiUrl}/api/borrowings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowDate,
          returnDate,
          purpose,
          items: selectedList.map((item) => ({
            inventoryId: item.id,
            quantity: item.borrowQty,
          })),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const reason = result.validation?.reasons?.[0]?.message;
        throw new Error(reason || result.message || "Borrowing request failed validation.");
      }

      setSuccessMsg("Borrow request validated and submitted.");
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

  const today =
    new Date().toISOString().split("T")[0];

  if (loading) {
    return (
      <div className="borrow-page">
        Loading...
      </div>
    );
  }

  return (
    <div className="borrow-page">

      <header className="borrow-header">

        <p className="borrow-eyebrow">
          Stockroom
        </p>

        <h1>Borrow Items</h1>

        <p className="borrow-subtitle">
          Select inventory items to borrow.
        </p>

      </header>

      <div className="borrow-layout">

               {/* LEFT TABLE */}

        <section className="borrow-panel browse-panel">

          <div className="filter-bar">

            <div className="search-field">

              <input
                type="text"
                placeholder="Search item..."
                value={search}
                onChange={(e)=>setSearch(e.target.value)}
              />

            </div>

          </div>

          <div className="table-wrap">

            <table className="inventory-table">

              <thead>

                <tr>

                  <th></th>

                  <th>Item</th>

                  <th>Purchase Date</th>

                  <th>Available</th>

                  <th>Qty</th>

                </tr>

              </thead>

              <tbody>

                {filteredItems.length===0 && (

                  <tr>

                    <td
                      colSpan={5}
                      style={{
                        textAlign:"center",
                        padding:"30px"
                      }}
                    >
                      No Inventory Found
                    </td>

                  </tr>

                )}

                {filteredItems.map(item=>{

                  const totalInventory =
                    item.quantity +
                    item.additional_qty -
                    item.replaces;

                  const available =
                    totalInventory -
                    item.missing -
                    item.breakage -
                    item.defective -
                    item.total_loss;

                  const checked =
                    selected[item.id] !== undefined;

                  return(

                    <tr key={item.id}>

                      <td>

                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={available<=0}
                          onChange={(e)=>
                            toggleItem(
                              item,
                              e.target.checked
                            )
                          }
                        />

                      </td>

                      <td>
                        {item.item_name}
                      </td>

                      <td>
                        {item.purchase_date}
                      </td>

                      <td>
                        {available}
                      </td>

                      <td>

                        <input
                          type="number"
                          min="1"
                          max={available}
                          className="qty-input"
                          disabled={!checked}
                          value={
                            selected[item.id] ?? ""
                          }
                          onChange={(e)=>
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

          </div>

        </section>

        {/* RIGHT PANEL */}

        <aside className="borrow-panel summary-panel">

          <h2>
            Request Summary
          </h2>

          {selectedList.length===0 ? (

            <p>
              No item selected.
            </p>

          ) : (

            <ul className="summary-list">

              {selectedList.map(item=>(

                <li key={item.id}>

                  <span>
                    {item.item_name}
                  </span>

                  <span>
                    × {item.borrowQty}
                  </span>

                </li>

              ))}

            </ul>

          )}

          <div className="summary-totals">

            <div>

              <span>Items</span>

              <strong>
                {totalItems}
              </strong>

            </div>

            <div>

              <span>Units</span>

              <strong>
                {totalUnits}
              </strong>

            </div>

          </div>

          <form
            className="summary-form"
            onSubmit={handleSubmit}
          >

            <label>

              Borrow Date

              <input
                type="date"
                min={today}
                value={borrowDate}
                onChange={(e)=>
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
                onChange={(e)=>
                  setReturnDate(
                    e.target.value
                  )
                }
              />

            </label>

            <label>

              Purpose

              <textarea
                rows={3}
                value={purpose}
                onChange={(e)=>
                  setPurpose(
                    e.target.value
                  )
                }
              />

            </label>

            {formError && (

              <p className="form-error">

                {formError}

              </p>

            )}

            {successMsg && (

              <p className="form-success">

                {successMsg}

              </p>

            )}

            <button
              type="submit"
              className="submit-btn"
              disabled={submitting}
            >

              {submitting
                ? "Submitting..."
                : "Submit Request"}

            </button>

          </form>

        </aside>

      </div>

    </div>

  );

}
