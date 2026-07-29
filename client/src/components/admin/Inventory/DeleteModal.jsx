import { supabase } from "../../../lib/supabase";

export default function DeleteModal({
    open,
    onClose,
    item,
    onDeleted
}) {

    if (!open || !item) return null;

    async function handleDelete() {

        const { error } = await supabase
            .from("inventory")
            .delete()
            .eq("id", item.id);

        if (error) {
            alert(error.message);
            return;
        }

        if (onDeleted) {
            onDeleted();
        }

        onClose();

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
                    >
                        Cancel
                    </button>

                    <button
                        className="delete-confirm"
                        onClick={handleDelete}
                    >
                        Delete
                    </button>

                </div>

            </div>

        </div>

    );

}