export default function DeleteModal({ open, onClose }) {

    if (!open) return null;

    return (

        <div className="modal-overlay">

            <div className="delete-modal">

                <div className="delete-icon">
                    🗑️
                </div>

                <h2>Delete Item?</h2>

                <p>
                    This inventory item will be permanently removed.
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
                    >
                        Delete
                    </button>

                </div>

            </div>

        </div>

    );

}