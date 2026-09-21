import { useState } from "react";
import { authenticatedFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useFeedback } from "../../common/feedbackContext";
import {
    DEFAULT_LOW_STOCK_THRESHOLD,
    inventoryTotals
} from "../../../utils/inventoryAvailability";

export default function EditItemModal({
    open,
    onClose,
    item,
    rooms = [],
    onUpdated
}) {
    const { toast } = useFeedback();
    const [form, setForm] = useState(() => ({
        item_name: item?.item_name ?? "",
        purchase_date: item?.purchase_date ?? "",
        quantity: item?.quantity ?? 0,
        additional_qty: item?.additional_qty ?? 0,
        replaces: item?.replaces ?? 0,
        missing: item?.missing ?? 0,
        breakage: item?.breakage ?? 0,
        defective: item?.defective ?? 0,
        total_loss: item?.total_loss ?? 0,
        low_stock_threshold: item?.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
        remarks: item?.remarks ?? "",
        tracking_type: item?.tracking_type ?? "bulk",
        image_url: item?.image_url ?? "",
        room_id: item?.room_id ?? "",
    }));

    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(() => item?.image_url ?? "");
    const [saving, setSaving] = useState(false);

    if (!open || !item) return null;

    function handleChange(e) {
        const { name, value, type } = e.target;

        setForm((prev) => ({
            ...prev,
            [name]:
                type === "number"
                    ? Number(value)
                    : value
        }));
    }

    function handleImageChange(e) {
        const file = e.target.files?.[0];

        if (!file) return;

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            toast("Please select a JPG, PNG, or WEBP image.", "error");
            e.target.value = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast("Image must be 5MB or smaller.", "error");
            e.target.value = "";
            return;
        }

        if (imagePreview && imageFile) {
            URL.revokeObjectURL(imagePreview);
        }

        const previewUrl = URL.createObjectURL(file);

        setImageFile(file);
        setImagePreview(previewUrl);
    }

    function removeImage() {
        if (imagePreview && imageFile) {
            URL.revokeObjectURL(imagePreview);
        }

        setImageFile(null);
        setImagePreview("");

        setForm((prev) => ({
            ...prev,
            image_url: ""
        }));
    }

    async function uploadImage() {
        if (!imageFile) {
            return form.image_url || "";
        }

        const extension =
            imageFile.name
                .split(".")
                .pop()
                .toLowerCase();

        const fileName =
            `inventory/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } =
            await supabase.storage
                .from("inventory-images")
                .upload(
                    fileName,
                    imageFile,
                    {
                        cacheControl: "3600",
                        upsert: false,
                        contentType: imageFile.type
                    }
                );

        if (uploadError) {
            throw uploadError;
        }

        const { data } =
            supabase.storage
                .from("inventory-images")
                .getPublicUrl(fileName);

        return data.publicUrl;
    }

    async function handleUpdate() {
        if (!form.item_name.trim()) {
            toast("Please enter an item name.", "error");
            return;
        }
        if (!form.room_id) { toast("Please select a laboratory room.", "error"); return; }

        try {
            setSaving(true);

            const imageUrl = await uploadImage();

            const response =
                await authenticatedFetch(
                    `/api/inventory/${item.id}`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            ...form,
                            image_url: imageUrl
                        }),
                    }
                );

            const result = await response.json();

            if (!response.ok) {
                toast(
                    result.reasons?.[0] ||
                    result.message ||
                    "Unable to update inventory item.", "error"
                );
                return;
            }

            if (onUpdated) {
                onUpdated();
            }

            toast("Inventory item updated successfully.", "success");

            onClose();

        } catch (error) {
            console.error(
                "Inventory image update error:",
                error
            );

            toast(
                error.message ||
                "Unable to update inventory item.", "error"
            );

        } finally {
            setSaving(false);
        }
    }

    const {
        total: totalInventory,
        usable: endInventory
    } = inventoryTotals(form);

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
        >
            <div
                className="modal"
                onClick={(e) =>
                    e.stopPropagation()
                }
            >

                <div className="modal-header">
                    <h2>Edit Inventory Item</h2>

                    <button
                        onClick={onClose}
                        disabled={saving}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="modal-body">

                    <div className="form-grid">

                        {/* IMAGE */}

                        <div className="form-group full-width">

                            <label>Item Image</label>

                            <div className="inventory-image-upload">

                                {imagePreview ? (

                                    <div className="inventory-image-preview">

                                        <img
                                            src={imagePreview}
                                            alt={`${form.item_name} preview`}
                                        />

                                        <button
                                            type="button"
                                            onClick={removeImage}
                                            disabled={saving}
                                        >
                                            Remove Image
                                        </button>

                                    </div>

                                ) : (

                                    <label className="inventory-image-dropzone">

                                        <span>
                                            Upload Item Image
                                        </span>

                                        <small>
                                            JPG, PNG, or WEBP · Max 5MB
                                        </small>

                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={handleImageChange}
                                            hidden
                                        />

                                    </label>

                                )}

                            </div>

                            {imageFile && (
                                <small>
                                    New image selected. It will replace
                                    the current image after saving.
                                </small>
                            )}

                        </div>

                        {/* ITEM */}

                        <div className="form-group">
                            <label>
                                Tools / Particular Item
                            </label>

                            <input
                                name="item_name"
                                value={form.item_name}
                                onChange={handleChange}
                            />
                        </div>

                        {/* PURCHASE DATE */}

                        <div className="form-group">
                            <label>
                                Date of Purchase
                            </label>

                            <input
                                type="date"
                                name="purchase_date"
                                value={form.purchase_date}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Laboratory Room</label>
                            <select name="room_id" value={form.room_id} onChange={handleChange} required>
                                <option value="">Select laboratory room</option>
                                {rooms.map((room) => <option key={room.id} value={room.id}>{room.department ? `${room.department.code} — ` : ""}{room.name}</option>)}
                            </select>
                        </div>

                        {/* QUANTITY */}

                        <div className="form-group">
                            <label>Quantity</label>

                            <input
                                type="number"
                                min="0"
                                name="quantity"
                                value={form.quantity}
                                onChange={handleChange}
                            />
                        </div>

                        {/* ADDITIONAL */}

                        <div className="form-group">
                            <label>
                                Additional Items Qty
                            </label>

                            <input
                                type="number"
                                min="0"
                                name="additional_qty"
                                value={form.additional_qty}
                                onChange={handleChange}
                            />
                        </div>

                        {/* REPLACES */}

                        <div className="form-group">
                            <label>Replaces</label>

                            <input
                                type="number"
                                min="0"
                                name="replaces"
                                value={form.replaces}
                                onChange={handleChange}
                            />
                        </div>

                        {/* MISSING */}

                        <div className="form-group">
                            <label>Missing</label>

                            <input
                                type="number"
                                min="0"
                                name="missing"
                                value={form.missing}
                                onChange={handleChange}
                            />
                        </div>

                        {/* BREAKAGE */}

                        <div className="form-group">
                            <label>Breakage</label>

                            <input
                                type="number"
                                min="0"
                                name="breakage"
                                value={form.breakage}
                                onChange={handleChange}
                            />
                        </div>

                        {/* DEFECTIVE */}

                        <div className="form-group">
                            <label>Defective</label>

                            <input
                                type="number"
                                min="0"
                                name="defective"
                                value={form.defective}
                                onChange={handleChange}
                            />
                        </div>

                        {/* TOTAL LOSS */}

                        <div className="form-group">
                            <label>Total Loss</label>

                            <input
                                type="number"
                                min="0"
                                name="total_loss"
                                value={form.total_loss}
                                onChange={handleChange}
                            />
                        </div>

                        {/* TRACKING */}

                        <div className="form-group">

                            <label>Tracking Type</label>

                            <select
                                name="tracking_type"
                                value={form.tracking_type}
                                onChange={handleChange}
                            >
                                <option value="bulk">
                                    Bulk quantity
                                </option>

                                <option value="serialized">
                                    Serialized assets
                                </option>
                            </select>

                            <small>
                                Tracking type is locked after stock
                                or borrowing history exists.
                            </small>

                        </div>

                        {/* THRESHOLD */}

                        <div className="form-group">

                            <label>
                                Low Stock Alert At
                            </label>

                            <input
                                type="number"
                                min="0"
                                name="low_stock_threshold"
                                value={form.low_stock_threshold}
                                onChange={handleChange}
                            />

                        </div>

                        {/* TOTAL */}

                        <div className="form-group">

                            <label>
                                Total Inventory
                            </label>

                            <input
                                disabled
                                value={totalInventory}
                            />

                        </div>

                        {/* END */}

                        <div className="form-group">

                            <label>
                                End Inventory
                            </label>

                            <input
                                disabled
                                value={endInventory}
                            />

                        </div>

                        {/* REMARKS */}

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
                        disabled={saving}
                    >
                        Cancel
                    </button>

                    <button
                        className="save-btn"
                        onClick={handleUpdate}
                        disabled={saving}
                    >
                        {saving
                            ? "Saving..."
                            : "Update Item"}
                    </button>

                </div>

            </div>
        </div>
    );
}
