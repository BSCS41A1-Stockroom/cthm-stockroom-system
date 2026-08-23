import { FaEdit, FaTrash } from "react-icons/fa";
import { inventoryStockStatus, inventoryTotals } from "../../../utils/inventoryAvailability";

export default function InventoryTable({
    inventory,
    onEdit,
    onDelete
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
      <table className="inventory-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Tools / Particular Item</th>
            <th>Date of Purchase</th>
            <th>Qty</th>
            <th>Additional Items Qty</th>
            <th>Replaces</th>
            <th>Total Inventory</th>
            <th>Missing</th>
            <th>Breakage</th>
            <th>Defective</th>
            <th>Total Loss</th>
            <th>Reserved</th>
            <th>Borrowed</th>
            <th>Available</th>
            <th>Low Stock At</th>
            <th>Stock Level</th>
            <th>Remarks</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {inventory.map((item, index) => {
            const { total: totalInventory, available, threshold } = inventoryTotals(item);
            const stockStatus = inventoryStockStatus(item);

            return (
              <tr key={item.id}>
                <td>{index + 1}</td>

                <td>{item.item_name}</td>

                <td>{item.purchase_date}</td>

                <td>{item.quantity}</td>

                <td>{item.additional_qty}</td>

                <td>{item.replaces}</td>

                <td>{totalInventory}</td>

                <td>{item.missing}</td>

                <td>{item.breakage}</td>

                <td>{item.defective}</td>

                <td>{item.total_loss}</td>

                <td>{item.reserved_quantity ?? 0}</td>

                <td>{item.borrowed_quantity ?? 0}</td>

                <td>
                  <strong>{available}</strong>
                </td>

                <td>{threshold}</td>

                <td><span className={`remark ${stockStatus === "in-stock" ? "available" : stockStatus === "out-of-stock" ? "danger" : "warning"}`}>
                  {stockStatus === "out-of-stock" ? "Out of Stock" : stockStatus === "low-stock" ? "Low Stock" : "In Stock"}
                </span></td>

                <td>
                  <span
                    className={`remark ${
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

                <td className="actions">
                  <button
                      className="edit-btn"
                      onClick={() => onEdit(item)}
                  >
                      <FaEdit/>
                  </button>

                  <button
                      className="delete-btn"
                      onClick={() => onDelete(item)}
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
