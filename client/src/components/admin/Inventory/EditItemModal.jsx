import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { DEFAULT_LOW_STOCK_THRESHOLD, inventoryTotals } from "../../../utils/inventoryAvailability";

export default function EditItemModal({
    open,
    onClose,
    item,
    onUpdated
}) {

    const [form, setForm] = useState(() => ({
        item_name: item.item_name,
        purchase_date: item.purchase_date,
        quantity: item.quantity,
        additional_qty: item.additional_qty,
        replaces: item.replaces,
        missing: item.missing,
        breakage: item.breakage,
        defective: item.defective,
        total_loss: item.total_loss,
        low_stock_threshold: item.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
        remarks: item.remarks ?? ""
    }));

    if (!open) return null;

    function handleChange(e) {

        const { name, value, type } = e.target;

        setForm(prev => ({
            ...prev,
            [name]: type === "number"
                ? Number(value)
                : value
        }));

    }

    const { total: totalInventory, usable: endInventory } = inventoryTotals(form);

    async function handleUpdate() {

        const { error } = await supabase
            .from("inventory")
            .update(form)
            .eq("id", item.id);

        if (error) {
            alert(error.message);
            return;
        }

        if (onUpdated) {
            onUpdated();
        }

        onClose();

    }

    return (

        <div className="modal-overlay">

            <div className="modal">

                <div className="modal-header">

                    <h2>Edit Inventory Item</h2>

                    <button onClick={onClose}>
                        ✕
                    </button>

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
                            <label>Additional Items Qty</label>

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
                                rows={3}
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
                        onClick={handleUpdate}
                    >
                        Update Item
                    </button>

                </div>

            </div>

        </div>

    );

}
