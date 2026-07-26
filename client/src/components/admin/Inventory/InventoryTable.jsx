import { FaEdit, FaTrash } from "react-icons/fa";

const inventory = [
  {
    no: 1,
    item: "Chef Knife",
    purchaseDate: "2025-01-15",
    qty: 20,
    additionalQty: 5,
    replaces: 1,
    missing: 1,
    breakage: 0,
    defective: 0,
    totalLoss: 0,
    remarks: "Good Condition",
  },
  {
    no: 2,
    item: "Mixing Bowl",
    purchaseDate: "2025-02-10",
    qty: 15,
    additionalQty: 2,
    replaces: 0,
    missing: 0,
    breakage: 1,
    defective: 1,
    totalLoss: 0,
    remarks: "Needs Inspection",
  },
  {
    no: 3,
    item: "Frying Pan",
    purchaseDate: "2025-03-05",
    qty: 10,
    additionalQty: 4,
    replaces: 2,
    missing: 1,
    breakage: 0,
    defective: 0,
    totalLoss: 0,
    remarks: "Available",
  },
];

export default function InventoryTable() {
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
            <th>End Inventory</th>
            <th>Remarks</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {inventory.map((item) => {
            const totalInventory =
              item.qty +
              item.additionalQty -
              item.replaces;

            const endInventory =
              totalInventory -
              item.missing -
              item.breakage -
              item.defective -
              item.totalLoss;

            return (
              <tr key={item.no}>
                <td>{item.no}</td>

                <td>{item.item}</td>

                <td>{item.purchaseDate}</td>

                <td>{item.qty}</td>

                <td>{item.additionalQty}</td>

                <td>{item.replaces}</td>

                <td>{totalInventory}</td>

                <td>{item.missing}</td>

                <td>{item.breakage}</td>

                <td>{item.defective}</td>

                <td>{item.totalLoss}</td>

                <td>
                  <strong>{endInventory}</strong>
                </td>

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
                  <button className="edit-btn">
                    <FaEdit />
                  </button>

                  <button className="delete-btn">
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