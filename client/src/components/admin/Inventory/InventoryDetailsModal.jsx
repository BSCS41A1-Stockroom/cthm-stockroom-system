import {
    inventoryStockStatus,
    inventoryTotals
} from "../../../utils/inventoryAvailability";

import {
    FaTimes,
    FaEdit,
    FaBarcode
} from "react-icons/fa";

export default function InventoryDetailsModal({
    item,
    onClose,
    onEdit
}) {
    const {
        total: totalInventory,
        available,
        threshold
    } = inventoryTotals(item);

    const stockStatus =
        inventoryStockStatus(item);

    const getStatusBadge = (status) => {
        if (status === "out-of-stock") {
            return "danger";
        }

        if (status === "low-stock") {
            return "warning";
        }

        return "available";
    };

    const statusClass =
        getStatusBadge(stockStatus);

    const statusLabel =
        stockStatus === "out-of-stock"
            ? "Out of Stock"
            : stockStatus === "low-stock"
                ? "Low Stock"
                : "In Stock";

    const detailRows = [
        {
            label: "Item Name",
            value: item.item_name
        },
        {
            label: "Date of Purchase",
            value: item.purchase_date || "—"
        },
        {
            label: "Qty",
            value: totalInventory,
            emphasis: true
        },
        {
            label: "Tracking Type",
            value:
                item.tracking_type === "serialized"
                    ? "Serialized"
                    : "Bulk"
        },
        {
            label: "Additional Items Qty",
            value: item.additional_qty ?? 0
        },
        {
            label: "Replaces",
            value: item.replaces ?? 0
        },
        {
            label: "Available",
            value: available,
            emphasis: true
        },
        {
            label: "Missing",
            value: item.missing ?? 0
        },
        {
            label: "Breakage",
            value: item.breakage ?? 0
        },
        {
            label: "Defective",
            value: item.defective ?? 0
        },
        {
            label: "Total Loss",
            value: item.total_loss ?? 0
        },
        {
            label: "Reserved",
            value: item.reserved_quantity ?? 0
        },
        {
            label: "Borrowed",
            value: item.borrowed_quantity ?? 0
        },
        {
            label: "Low Stock At",
            value: threshold
        }
    ];

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
        >
            <div
                className="modal-content modal-content--details"
                onClick={(e) =>
                    e.stopPropagation()
                }
            >

                <div className="modal-header">

                    <h2>Inventory Details</h2>

                    <button
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        <FaTimes />
                    </button>

                </div>

                <div className="modal-body">

                    {/* IMAGE / SUMMARY */}

                    <div className="inventory-details-hero">

                        <div className="inventory-details-image">

                            {item.image_url ? (
                                <img
                                    src={item.image_url}
                                    alt={item.item_name}
                                />
                            ) : (
                                <FaBarcode />
                            )}

                        </div>

                        <div className="inventory-details-summary">

                            <span className="inventory-details-eyebrow">
                                STOCKROOM ITEM
                            </span>

                            <h3>
                                {item.item_name ||
                                    "Unnamed Item"}
                            </h3>

                            <span
                                className={`inventory-status ${statusClass}`}
                            >
                                <span className="status-dot" />
                                {statusLabel}
                            </span>

                        </div>

                    </div>

                    {/* DETAILS */}

                    <div className="details-grid">

                        {detailRows.map(
                            (row, index) => (
                                <div
                                    key={index}
                                    className={`detail-row ${
                                        row.emphasis
                                            ? "detail-row--emphasis"
                                            : ""
                                    }`}
                                >

                                    <dt className="detail-label">
                                        {row.label}
                                    </dt>

                                    <dd className="detail-value">

                                        {typeof row.value ===
                                        "number" ? (
                                            <strong>
                                                {row.value}
                                            </strong>
                                        ) : (
                                            <span>
                                                {row.value}
                                            </span>
                                        )}

                                    </dd>

                                </div>
                            )
                        )}

                        {/* STOCK LEVEL */}

                        <div className="detail-row">

                            <dt className="detail-label">
                                Stock Level
                            </dt>

                            <dd className="detail-value">

                                <span
                                    className={`remark remark--${statusClass}`}
                                >
                                    {statusLabel}
                                </span>

                            </dd>

                        </div>

                        {/* REMARKS */}

                        <div className="detail-row">

                            <dt className="detail-label">
                                Remarks
                            </dt>

                            <dd className="detail-value">
                                <span>
                                    {item.remarks || "—"}
                                </span>
                            </dd>

                        </div>

                    </div>

                </div>

                <div className="modal-footer">

                    <button
                        className="btn btn-primary"
                        onClick={() => onEdit(item)}
                    >
                        <FaEdit />
                        Edit Item
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