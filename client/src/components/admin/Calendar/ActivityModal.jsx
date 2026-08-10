import { useState } from "react";

const EMPTY_FORM = {
  title: "",
  date: "",
  start: "",
  end: "",
  type: "activity",
  description: "",
  roomId: "",
};

export default function ActivityModal({ open, onClose, onSave, editEvent, rooms = [] }) {
  const [form, setForm] = useState(() => editEvent ? { ...EMPTY_FORM, ...editEvent } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) {
      setError("Activity name and date are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, roomId: form.roomId || null });
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{editEvent ? "Edit Activity" : "Add Activity"}</h2>
          <button className="cancel-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <div className="form-group">
              <label>Activity Name</label>
              <input name="title" value={form.title} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" name="date" value={form.date} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <input type="time" step="1800" name="start" value={form.start} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="time" step="1800" name="end" value={form.end} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select name="type" value={form.type} onChange={handleChange}>
                <option value="activity">School Activity</option>
                <option value="holiday">Holiday</option>
                <option value="reminder">Borrowing Schedule</option>
              </select>
            </div>
            <div className="form-group">
              <label>Laboratory Room (optional)</label>
              <select name="roomId" value={form.roomId} onChange={handleChange}>
                <option value="">General event</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group full-width">
              <label>Description</label>
              <textarea rows="4" name="description" value={form.description} onChange={handleChange} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Activity"}
          </button>
        </div>
      </div>
    </div>
  );
}
