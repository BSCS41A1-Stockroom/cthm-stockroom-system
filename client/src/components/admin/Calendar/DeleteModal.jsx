import { useState } from "react";

export default function DeleteModal({ open, event, onDelete, onClose }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  if (!open || !event) return null;

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await onDelete(event);
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="delete-modal">
        <div className="delete-icon">🗑️</div>
        <h2>Delete Activity?</h2>
        <p>Are you sure you want to delete<br /><strong>{event.title}</strong>?</p>
        {error && <p className="form-error">{error}</p>}
        <div className="delete-actions">
          <button className="cancel-btn" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="delete-confirm" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
