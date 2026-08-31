import { useState } from "react";
import { authenticatedFetch } from "../../../lib/api";
import { DEFAULT_LOW_STOCK_THRESHOLD, inventoryTotals } from "../../../utils/inventoryAvailability";

export default function AddItemModal({ open, onClose }) {
    const [form, setForm] = useState({
        item_name: "",
        purchase_date: "",
        quantity: 0,
        additional_qty: 0,
        replaces: 0,
        missing: 0,
        breakage: 0,
        defective: 0,
        total_loss: 0,
        low_stock_threshold: DEFAULT_LOW_STOCK_THRESHOLD,
        remarks: "",
    });

    if (!open) return null;

    function handleChange(e) {
        const { name, value } = e.target;

        setForm((prev) => ({
            ...prev,
            [name]:
                e.target.type === "number"
                    ? Number(value)
                    : value,
        }));
    }

    async function handleSave() {
        const response = await authenticatedFetch("/api/inventory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });
        const result = await response.json();

        if (!response.ok) {
            alert(result.reasons?.[0] || result.message || "Unable to create inventory item.");
            return;
        }

        setForm({
            item_name: "",
            purchase_date: "",
            quantity: 0,
            additional_qty: 0,
            replaces: 0,
            missing: 0,
            breakage: 0,
            defective: 0,
            total_loss: 0,
            low_stock_threshold: DEFAULT_LOW_STOCK_THRESHOLD,
            remarks: "",
        });

        onClose();
    }

    const { total: totalInventory, usable: endInventory } = inventoryTotals(form);

    return (
        <div className="modal-overlay">
            <div className="modal">

                <div className="modal-header">
                    <h2>Add Inventory Item</h2>
                    <button onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">

                    <div className="form-grid">

                        <div className="form-group">
                            <label>Tools / Particular Item</label>
                            <input
                                name="item_name"
                                value={form.item_name}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Date of Purchase</label>
                            <input
                                type="date"
                                name="purchase_date"
                                value={form.purchase_date}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Quantity</label>
                            <input
                                type="number"
                                name="quantity"
                                value={form.quantity}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Additional Qty</label>
                            <input
                                type="number"
                                name="additional_qty"
                                value={form.additional_qty}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Replaces</label>
                            <input
                                type="number"
                                name="replaces"
                                value={form.replaces}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Missing</label>
                            <input
                                type="number"
                                name="missing"
                                value={form.missing}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Breakage</label>
                            <input
                                type="number"
                                name="breakage"
                                value={form.breakage}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Defective</label>
                            <input
                                type="number"
                                name="defective"
                                value={form.defective}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Total Loss</label>
                            <input
                                type="number"
                                name="total_loss"
                                value={form.total_loss}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Low Stock Alert At</label>
                            <input
                                type="number"
                                min="0"
                                name="low_stock_threshold"
                                value={form.low_stock_threshold}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Total Inventory</label>
                            <input
                                disabled
                                value={totalInventory}
                            />
                        </div>

                        <div className="form-group">
                            <label>End Inventory</label>
                            <input
                                disabled
                                value={endInventory}
                            />
                        </div>

                        <div className="form-group full-width">
                            <label>Remarks</label>

                            <textarea
                                rows="3"
                                name="remarks"
                                value={form.remarks}
                                onChange={handleChange}
                            />
                        </div>

                    </div>

                </div>

                <div className="modal-footer">

                    <button
                        className="cancel-btn"
                        onClick={onClose}
                    >
                        Cancel
                    </button>

                    <button
                        className="save-btn"
                        onClick={handleSave}
                    >
                        Save Item
                    </button>

                </div>

            </div>
        </div>
    );
}
