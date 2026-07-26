export default function AddItemModal({ open, onClose }) {
  if (!open) return null;

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
              <input type="text" />
            </div>

            <div className="form-group">
              <label>Date of Purchase</label>
              <input type="date" />
            </div>

            <div className="form-group">
              <label>Quantity</label>
              <input type="number" />
            </div>

            <div className="form-group">
              <label>Additional Items Qty</label>
              <input type="number" defaultValue="0" />
            </div>

            <div className="form-group">
              <label>Replaces</label>
              <input type="number" defaultValue="0" />
            </div>

            <div className="form-group">
              <label>Missing</label>
              <input type="number" defaultValue="0" />
            </div>

            <div className="form-group">
              <label>Breakage</label>
              <input type="number" defaultValue="0" />
            </div>

            <div className="form-group">
              <label>Defective</label>
              <input type="number" defaultValue="0" />
            </div>

            <div className="form-group">
              <label>Total Loss</label>
              <input type="number" defaultValue="0" />
            </div>

            <div className="form-group">
              <label>Total Inventory</label>
              <input
                type="number"
                disabled
                placeholder="Auto Computed"
              />
            </div>

            <div className="form-group">
              <label>End Inventory</label>
              <input
                type="number"
                disabled
                placeholder="Auto Computed"
              />
            </div>

            <div className="form-group full-width">
              <label>Remarks</label>

              <textarea
                rows="3"
              ></textarea>
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
          >
            Save Item
          </button>

        </div>

      </div>

    </div>
  );
}