import { FaBarcode, FaCalendarTimes, FaEdit, FaTrash, FaEye } from "react-icons/fa";
import { inventoryStockStatus, inventoryTotals } from "../../../utils/inventoryAvailability";

export default function InventoryTable({
    inventory,
    onDetails,
    onEdit,
    onDelete,
    onAvailability,
    onAssets,
}) {

  if (!inventory || inventory.length === 0) {
      return (
          <div style={{ padding: "30px", textAlign: "center" }}>
              No inventory found.
          </div>
      );
  }

  return (
    <>
      <table className="inventory-table inventory-table--compact">
        <thead>
          <tr>
            <th className="col-sticky">Tools / Item</th>
            <th>Date of Purchase</th>
            <th>Qty</th>
            <th>Total Inventory</th>
            <th>Available</th>
            <th>Stock Level</th>
            <th>Remarks</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>

        <tbody>
          {inventory.map((item) => {
            const { total: totalInventory, available, threshold } = inventoryTotals(item);
            const stockStatus = inventoryStockStatus(item);

            return (
              <tr key={item.id}>
                <td className="col-sticky col-item-name">
                  <span className="item-name">{item.item_name}</span>
                </td>

                <td>{item.purchase_date}</td>

                <td className="col-number">{item.quantity}</td>

                <td className="col-number">{totalInventory}</td>

                <td className="col-number col-available">
                  <strong>{available}</strong>
                </td>

                <td>
                  <span 
                    className={`remark remark--${
                      stockStatus === "in-stock" 
                        ? "available" 
                        : stockStatus === "out-of-stock" 
                        ? "danger" 
                        : "warning"
                    }`}
                  >
                    {stockStatus === "out-of-stock" 
                      ? "Out of Stock" 
                      : stockStatus === "low-stock" 
                      ? "Low Stock" 
                      : "In Stock"}
                  </span>
                </td>

                <td>
                  <span
                    className={`remark remark--${
                      item.remarks === "Available"
                        ? "available"
                        : item.remarks === "Good Condition"
                        ? "good"
                        : "warning"
                    }`}
                  >
                    {item.remarks}
                  </span>
                </td>

                <td className="col-actions">
                  <button
                    className="details-btn"
                    onClick={() => onDetails(item)}
                    title="View all details"
                    aria-label={`View details for ${item.item_name}`}
                  >
                    <FaEye />
                  </button>
                  {item.tracking_type === "serialized" && (
                    <button 
                      className="asset-btn" 
                      onClick={() => onAssets(item)} 
                      title="Manage serialized assets" 
                      aria-label={`Manage assets for ${item.item_name}`}
                    >
                      <FaBarcode />
                    </button>
                  )}
                  <button
                    className="availability-btn"
                    onClick={() => onAvailability(item)}
                    title="Manage unavailable dates"
                    aria-label={`Manage unavailable dates for ${item.item_name}`}
                  >
                    <FaCalendarTimes />
                  </button>
                  <button
                    className="edit-btn"
                    onClick={() => onEdit(item)}
                    title="Edit item"
                    aria-label={`Edit ${item.item_name}`}
                  >
                    <FaEdit />
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => onDelete(item)}
                    title="Delete item"
                    aria-label={`Delete ${item.item_name}`}
                  >
                    <FaTrash />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}