import { FaTimes, FaDownload } from "react-icons/fa";
import { inventoryStockStatus, inventoryTotals } from "../../../utils/inventoryAvailability";

export default function InventoryFullViewModal({ 
  open, 
  inventory, 
  onClose,
  search,
  status,
}) {
  if (!open) return null;

  // Filter inventory based on search and status
  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = item.item_name?.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = status === "all" || inventoryStockStatus(item) === status;
    return matchesSearch && matchesStatus;
  });

  const handleExport = () => {
    // Create CSV data
    const headers = [
      "No.",
      "Tools / Particular Item",
      "Date of Purchase",
      "Qty",
      "Tracking",
      "Additional Items Qty",
      "Replaces",
      "Total Inventory",
      "Missing",
      "Breakage",
      "Defective",
      "Total Loss",
      "Reserved",
      "Borrowed",
      "Available",
      "Low Stock At",
      "Stock Level",
      "Remarks",
    ];

    const rows = filteredInventory.map((item, index) => {
      const { total: totalInventory, available, threshold } = inventoryTotals(item);
      const stockStatus = inventoryStockStatus(item);
      const statusText = 
        stockStatus === "out-of-stock" 
          ? "Out of Stock" 
          : stockStatus === "low-stock" 
          ? "Low Stock" 
          : "In Stock";

      return [
        index + 1,
        item.item_name,
        item.purchase_date,
        item.quantity,
        item.tracking_type === "serialized" ? "Serialized" : "Bulk",
        item.additional_qty,
        item.replaces,
        totalInventory,
        item.missing,
        item.breakage,
        item.defective,
        item.total_loss,
        item.reserved_quantity ?? 0,
        item.borrowed_quantity ?? 0,
        available,
        threshold,
        statusText,
        item.remarks,
      ];
    });

    // Create CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fullview-overlay" onClick={onClose}>
      <div 
        className="fullview-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fullview-header">
          <h2>Full Inventory View</h2>
          <div className="fullview-header-actions">
            <button
              className="fullview-export"
              onClick={handleExport}
              title="Export to CSV"
              aria-label="Export inventory to CSV"
            >
              <FaDownload /> Export
            </button>
            <button 
              className="fullview-close" 
              onClick={onClose}
              title="Close modal"
              aria-label="Close full inventory view"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <div className="fullview-body">
          <div className="fullview-table-wrapper">
            <table className="fullview-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Tools / Particular Item</th>
                  <th>Date of Purchase</th>
                  <th>Qty</th>
                  <th>Tracking</th>
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
                </tr>
              </thead>

              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan="18" className="fullview-empty">
                      No inventory items found.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item, index) => {
                    const { total: totalInventory, available, threshold } = inventoryTotals(item);
                    const stockStatus = inventoryStockStatus(item);

                    return (
                      <tr key={item.id}>
                        <td className="col-number">{index + 1}</td>
                        <td className="col-item-name">{item.item_name}</td>
                        <td>{item.purchase_date}</td>
                        <td className="col-number">{item.quantity}</td>
                        <td>{item.tracking_type === "serialized" ? "Serialized" : "Bulk"}</td>
                        <td className="col-number">{item.additional_qty}</td>
                        <td className="col-number">{item.replaces}</td>
                        <td className="col-number">{totalInventory}</td>
                        <td className="col-number">{item.missing}</td>
                        <td className="col-number">{item.breakage}</td>
                        <td className="col-number">{item.defective}</td>
                        <td className="col-number">{item.total_loss}</td>
                        <td className="col-number">{item.reserved_quantity ?? 0}</td>
                        <td className="col-number">{item.borrowed_quantity ?? 0}</td>
                        <td className="col-number col-available">
                          <strong>{available}</strong>
                        </td>
                        <td className="col-number">{threshold}</td>
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
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredInventory.length > 0 && (
            <div className="fullview-footer">
              <p className="fullview-info">
                Showing <strong>{filteredInventory.length}</strong> of{" "}
                <strong>{inventory.length}</strong> items
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}