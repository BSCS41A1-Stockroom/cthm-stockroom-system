import { useEffect, useState } from "react";

export default function ActivityModal({
  open,
  onClose,
  events,
  setEvents,
  editEvent = null,
}) {

  const emptyForm = {
    title: "",
    date: "",
    start: "",
    end: "",
    type: "activity",
    description: "",
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {

    if (editEvent) {

      setForm(editEvent);

    } else {

      setForm(emptyForm);

    }

  }, [editEvent]);

  if (!open) return null;

  const handleChange = (e) => {

    const { name, value } = e.target;

    setForm(prev => ({
      ...prev,
      [name]: value,
    }));

  };

  const handleSave = () => {

    if (!form.title || !form.date) {
      alert("Please complete required fields.");
      return;
    }

    if (editEvent) {

      setEvents(

        events.map(event =>

          event.id === editEvent.id
            ? { ...form }
            : event

        )

      );

    } else {

      setEvents([

        ...events,

        {
          ...form,
          id: Date.now(),
        },

      ]);

    }

    onClose();

    setForm(emptyForm);

  };

  return (

    <div className="modal-overlay">

      <div className="modal">

        <div className="modal-header">

          <h2>

            {editEvent
              ? "Edit Activity"
              : "Add Activity"}

          </h2>

          <button
            className="cancel-btn"
            onClick={onClose}
          >
            ✕
          </button>

        </div>

        <div className="modal-body">

          <div className="form-grid">

            <div className="form-group">

              <label>Activity Name</label>

              <input
                name="title"
                value={form.title}
                onChange={handleChange}
              />

            </div>

            <div className="form-group">

              <label>Date</label>

              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
              />

            </div>

            <div className="form-group">

              <label>Start Time</label>

              <input
                type="time"
                name="start"
                value={form.start}
                onChange={handleChange}
              />

            </div>

            <div className="form-group">

              <label>End Time</label>

              <input
                type="time"
                name="end"
                value={form.end}
                onChange={handleChange}
              />

            </div>

            <div className="form-group full-width">

              <label>Type</label>

              <select
                name="type"
                value={form.type}
                onChange={handleChange}
              >

                <option value="activity">
                  School Activity
                </option>

                <option value="holiday">
                  Holiday
                </option>

                <option value="reminder">
                  Borrowing Schedule
                </option>

              </select>

            </div>

            <div className="form-group full-width">

              <label>Description</label>

              <textarea
                rows="4"
                name="description"
                value={form.description}
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
            Save Activity
          </button>

        </div>

      </div>

    </div>

  );

}