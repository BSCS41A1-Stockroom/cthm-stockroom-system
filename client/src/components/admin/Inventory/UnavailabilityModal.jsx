import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/api";

const EMPTY_FORM = { startDate: "", endDate: "", reason: "" };

export default function UnavailabilityModal({ item, onClose }) {
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPeriods = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/unavailability`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load unavailable periods.");
      setPeriods(result.periods || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    const timer = window.setTimeout(loadPeriods, 0);
    return () => window.clearTimeout(timer);
  }, [loadPeriods]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function editPeriod(period) {
    setEditingId(period.id);
    setForm({
      startDate: String(period.start_date).slice(0, 10),
      endDate: String(period.end_date).slice(0, 10),
      reason: period.reason,
    });
  }

  async function savePeriod(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const path = editingId
        ? `/api/inventory/${item.id}/unavailability/${editingId}`
        : `/api/inventory/${item.id}/unavailability`;
      const response = await authenticatedFetch(path, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.reasons?.[0] || result.message || "Unable to save unavailable period.");
      resetForm();
      await loadPeriods();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removePeriod(periodId) {
    if (!window.confirm("Remove this unavailable period?")) return;
    setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/unavailability/${periodId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Unable to remove unavailable period.");
      }
      if (editingId === periodId) resetForm();
      await loadPeriods();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal availability-modal">
        <div className="modal-header">
          <div>
            <h2>Unavailable Dates</h2>
            <p>{item.item_name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body availability-body">
          <form className="availability-form" onSubmit={savePeriod}>
            <label>Start Date<input type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
            <label>End Date<input type="date" required min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
            <label className="full-width">Reason<input required maxLength="200" placeholder="Maintenance, repair, or inspection" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            <div className="availability-form-actions full-width">
              {editingId && <button type="button" className="cancel-btn" onClick={resetForm}>Cancel edit</button>}
              <button type="submit" className="save-btn" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Period" : "Add Period"}</button>
            </div>
          </form>

          {error && <p className="availability-error" role="alert">{error}</p>}
          {loading ? <p>Loading unavailable periods...</p> : periods.length === 0 ? (
            <p className="availability-empty">No unavailable dates configured. This item is available according to its inventory capacity.</p>
          ) : (
            <div className="availability-list">
              {periods.map((period) => (
                <div className="availability-period" key={period.id}>
                  <div><strong>{String(period.start_date).slice(0, 10)} – {String(period.end_date).slice(0, 10)}</strong><span>{period.reason}</span></div>
                  <div><button type="button" onClick={() => editPeriod(period)}>Edit</button><button type="button" className="danger-text" onClick={() => removePeriod(period.id)}>Remove</button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
