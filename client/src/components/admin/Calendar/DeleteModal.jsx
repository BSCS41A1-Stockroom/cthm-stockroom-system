export default function DeleteModal({
  open,
  event,
  events,
  setEvents,
  onClose,
}) {

  if (!open || !event) return null;

  const handleDelete = () => {

    setEvents(

      events.filter(item => item.id !== event.id)

    );

    onClose();

  };

  return (

    <div className="modal-overlay">

      <div className="delete-modal">

        <div className="delete-icon">

          🗑️

        </div>

        <h2>

          Delete Activity?

        </h2>

        <p>

          Are you sure you want to delete

          <br />

          <strong>{event.title}</strong>

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