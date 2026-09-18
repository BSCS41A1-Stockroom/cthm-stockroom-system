import { inventoryStockStatus, inventoryTotals } from "../../../utils/inventoryAvailability";
import { FaTimes, FaEdit } from "react-icons/fa";

export default function InventoryDetailsModal({ item, onClose, onEdit }) {
  const { total: totalInventory, available, threshold } = inventoryTotals(item);
  const stockStatus = inventoryStockStatus(item);

  const getStatusBadge = (status) => {
    return status === "out-of-stock" 
      ? "danger" 
      : status === "low-stock" 
      ? "warning" 
      : "available";
  };

  const detailRows = [
    { label: "Item Name", value: item.item_name },
    { label: "Date of Purchase", value: item.purchase_date },
    { label: "Qty", value: item.quantity },
    { label: "Tracking Type", value: item.tracking_type === "serialized" ? "Serialized" : "Bulk" },
    { label: "Additional Items Qty", value: item.additional_qty },
    { label: "Replaces", value: item.replaces },
    { label: "Total Inventory", value: totalInventory, emphasis: true },
    { label: "Available", value: available, emphasis: true },
    { label: "Missing", value: item.missing },
    { label: "Breakage", value: item.breakage },
    { label: "Defective", value: item.defective },
    { label: "Total Loss", value: item.total_loss },
    { label: "Reserved", value: item.reserved_quantity ?? 0 },
    { label: "Borrowed", value: item.borrowed_quantity ?? 0 },
    { label: "Low Stock At", value: threshold },
    { 
      label: "Stock Level", 
      value: (
        <span className={`remark remark--${getStatusBadge(stockStatus)}`}>
          {stockStatus === "out-of-stock" 
            ? "Out of Stock" 
            : stockStatus === "low-stock" 
            ? "Low Stock" 
            : "In Stock"}
        </span>
      )
    },
    { 
      label: "Remarks", 
      value: (
        <span className={`remark remark--${
          item.remarks === "Available"
            ? "available"
            : item.remarks === "Good Condition"
            ? "good"
            : "warning"
        }`}>
          {item.remarks}
        </span>
      )
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--details" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Inventory Details</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          <div className="details-grid">
            {detailRows.map((row, index) => (
              <div key={index} className={`detail-row ${row.emphasis ? "detail-row--emphasis" : ""}`}>
                <dt className="detail-label">{row.label}</dt>
                <dd className="detail-value">
                  {typeof row.value === "string" ? (
                    <span>{row.value}</span>
                  ) : typeof row.value === "number" ? (
                    <strong>{row.value}</strong>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="btn btn-primary"
            onClick={() => onEdit(item)}
          >
            <FaEdit /> Edit Item
          </button>
          <button 
            className="btn btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}