import { useState } from "react";
import { authenticatedFetch } from "../../../lib/api";
import { useFeedback } from "../../common/feedbackContext";

export default function DeleteModal({
    open,
    onClose,
    item,
    onDeleted
}) {
    const { toast } = useFeedback();
    const [deleting, setDeleting] = useState(false);

    if (!open || !item) return null;

    async function handleDelete() {

        if (deleting) return;
        setDeleting(true);
        try {
            const response = await authenticatedFetch(`/api/inventory/${item.id}`, { method: "DELETE" });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || "Unable to delete inventory item.");
            }
            onDeleted?.();
            toast("Inventory item deleted.", "success");
            onClose();
        } catch (error) {
            toast(error.message || "Unable to delete inventory item.", "error");
        } finally {
            setDeleting(false);
        }

    }

    return (

        <div className="modal-overlay">

            <div className="delete-modal">

                <div className="delete-icon">
                    🗑️
                </div>

                <h2>Delete Item?</h2>

                <p>
                    Are you sure you want to delete
                    <br />
                    <strong>{item.item_name}</strong>?
                </p>

                <div className="delete-actions">

                    <button
                        className="cancel-btn"
                        onClick={onClose}
                        disabled={deleting}
                    >
                        Cancel
                    </button>

                    <button
                        className="delete-confirm"
                        onClick={handleDelete}
                        disabled={deleting}
                    >
                        {deleting ? "Deleting..." : "Delete"}
                    </button>

                </div>

            </div>

        </div>

    );

}
