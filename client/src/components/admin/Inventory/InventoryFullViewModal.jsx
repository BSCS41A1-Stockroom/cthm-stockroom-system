import { FaTimes, FaDownload } from "react-icons/fa";

import {
  inventoryStockStatus,
  inventoryTotals,
} from "../../../utils/inventoryAvailability";

export default function InventoryFullViewModal({
  open,
  inventory,
  onClose,
  search,
  status,
}) {
  if (!open) return null;

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = item.item_name
      ?.toLowerCase()
      .includes(search.trim().toLowerCase());

    const matchesStatus =
      status === "all" ||
      inventoryStockStatus(item) === status;

    return matchesSearch && matchesStatus;
  });

  const getStockLabel = (stockStatus) => {
    if (stockStatus === "out-of-stock") return "Out of Stock";
    if (stockStatus === "low-stock") return "Low Stock";
    return "In Stock";
  };

  const getStockClass = (stockStatus) => {
    if (stockStatus === "out-of-stock") return "danger";
    if (stockStatus === "low-stock") return "warning";
    return "available";
  };

  const getRemarkClass = (remark) => {
    if (remark === "Available") return "available";
    if (remark === "Good Condition") return "good";
    return "warning";
  };

  const handleExport = () => {
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
      const {
        total: totalInventory,
        available,
        threshold,
      } = inventoryTotals(item);

      const stockStatus = inventoryStockStatus(item);

      return [
        index + 1,
        item.item_name ?? "",
        item.purchase_date ?? "",
        item.quantity ?? 0,
        item.tracking_type === "serialized"
          ? "Serialized"
          : "Bulk",
        item.additional_qty ?? 0,
        item.replaces ?? 0,
        totalInventory,
        item.missing ?? 0,
        item.breakage ?? 0,
        item.defective ?? 0,
        item.total_loss ?? 0,
        item.reserved_quantity ?? 0,
        item.borrowed_quantity ?? 0,
        available,
        threshold,
        getStockLabel(stockStatus),
        item.remarks ?? "",
      ];
    });

    const csvContent = [
      headers.map((header) => `"${header}"`).join(","),
      ...rows.map((row) =>
        row
          .map((cell) =>
            `"${String(cell).replace(/"/g, '""')}"`
          )
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `inventory-${
      new Date().toISOString().split("T")[0]
    }.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fullview-overlay" onClick={onClose}>
      <div
        className="fullview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fullview-header">
          <div className="fullview-title-area">
            <h2>Full Inventory</h2>

            <p>
              Complete inventory information
              {filteredInventory.length > 0 &&
                ` • ${filteredInventory.length} item${
                  filteredInventory.length !== 1 ? "s" : ""
                }`}
            </p>
          </div>

          <div className="fullview-header-actions">
            <button
              className="fullview-export"
              onClick={handleExport}
              title="Export inventory to CSV"
            >
              <FaDownload />
              <span>Export CSV</span>
            </button>

            <button
              className="fullview-close"
              onClick={onClose}
              title="Close"
              aria-label="Close full inventory"
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
                  <th>Additional Qty</th>
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
                    <td
                      colSpan={18}
                      className="fullview-empty"
                    >
                      No inventory items found.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item, index) => {
                    const {
                      total: totalInventory,
                      available,
                      threshold,
                    } = inventoryTotals(item);

                    const stockStatus =
                      inventoryStockStatus(item);

                    return (
                      <tr key={item.id}>
                        <td className="col-number">
                          {index + 1}
                        </td>

                        <td className="col-item-name">
                          {item.item_name || "—"}
                        </td>

                        <td>
                          {item.purchase_date || "—"}
                        </td>

                        <td className="col-number">
                          {item.quantity ?? 0}
                        </td>

                        <td>
                          {item.tracking_type === "serialized"
                            ? "Serialized"
                            : "Bulk"}
                        </td>

                        <td className="col-number">
                          {item.additional_qty ?? 0}
                        </td>

                        <td className="col-number">
                          {item.replaces ?? 0}
                        </td>

                        <td className="col-number">
                          <strong>{totalInventory}</strong>
                        </td>

                        <td className="col-number">
                          {item.missing ?? 0}
                        </td>

                        <td className="col-number">
                          {item.breakage ?? 0}
                        </td>

                        <td className="col-number">
                          {item.defective ?? 0}
                        </td>

                        <td className="col-number">
                          {item.total_loss ?? 0}
                        </td>

                        <td className="col-number">
                          {item.reserved_quantity ?? 0}
                        </td>

                        <td className="col-number">
                          {item.borrowed_quantity ?? 0}
                        </td>

                        <td className="col-number col-available">
                          {available}
                        </td>

                        <td className="col-number">
                          {threshold}
                        </td>

                        <td>
                          <span
                            className={`remark remark--${getStockClass(
                              stockStatus
                            )}`}
                          >
                            {getStockLabel(stockStatus)}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`remark remark--${getRemarkClass(
                              item.remarks
                            )}`}
                          >
                            {item.remarks || "—"}
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
                Showing{" "}
                <strong>{filteredInventory.length}</strong>{" "}
                of{" "}
                <strong>{inventory.length}</strong>{" "}
                inventory items
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}