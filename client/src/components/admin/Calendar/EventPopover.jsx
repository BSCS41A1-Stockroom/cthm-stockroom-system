import { FaEdit, FaTrash } from "react-icons/fa";

export default function EventPopover({
  event,
  position,
  onEdit,
  onDelete,
  onClose,
}) {

  if (!event) return null;

  return (

    <div
      className="event-popover"
      style={{
        top: position.y,
        left: position.x,
      }}
    >

      <div className={`popover-header ${event.type}`}>

        <h4>{event.title}</h4>

        <small>{event.date}</small>

      </div>

      <div className="popover-body">

        {event.start && (

          <p>

            <strong>Time</strong>

            <br />

            {event.start} - {event.end}

          </p>

        )}

        {event.description && (

          <p>

            <strong>Description</strong>

            <br />

            {event.description}

          </p>

        )}

      </div>

      <div className="popover-actions">

        <button
          className="popover-edit"
          onClick={() => {
            onEdit(event);
            onClose();
          }}
        >
          <FaEdit />
          Edit
        </button>

        <button
          className="popover-delete"
          onClick={() => {
            onDelete(event);
            onClose();
          }}
        >
          <FaTrash />
          Delete
        </button>

      </div>

    </div>

  );

}