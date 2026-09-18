import {
    FaBarcode,
    FaCalendarTimes,
    FaEdit,
    FaEye,
    FaSort,
    FaSortUp,
    FaSortDown,
} from "react-icons/fa";

import { inventoryTotals } from "../../../utils/inventoryAvailability";

import { useMemo, useState } from "react";


/* =========================================================
   HELPERS
   ========================================================= */

const getTotals = (item) => inventoryTotals(item);

const getTotalInventory = (item) =>
    getTotals(item)?.total ?? 0;

const getAvailable = (item) =>
    getTotals(item)?.available ?? 0;

const getStatus = (item) =>
    getAvailable(item) > 0
        ? "available"
        : "unavailable";

const getStatusLabel = (item) =>
    getStatus(item) === "available"
        ? "Available"
        : "Unavailable";

const getImage = (item) =>
    item.image_url ||
    item.image ||
    item.image_path ||
    null;


/* =========================================================
   COMPONENT
   ========================================================= */

export default function InventoryTable({
    inventory,
    selectedIds = [],
    onToggleSelection,
    onToggleSelectAll,
    onDetails,
    onEdit,
    onAvailability,
    onAssets,
}) {
    const [sortConfig, setSortConfig] = useState({
        key: null,
        direction: "asc",
    });


    /* =====================================================
       SORTING
       ===================================================== */

    const handleSort = (key) => {
        setSortConfig((current) => {
            if (current.key === key) {
                return {
                    key,
                    direction:
                        current.direction === "asc"
                            ? "desc"
                            : "asc",
                };
            }

            return {
                key,
                direction: "asc",
            };
        });
    };


    const sortedInventory = useMemo(() => {
        const items = [...(inventory || [])];

        if (!sortConfig.key) {
            return items;
        }

        return items.sort((a, b) => {
            let aValue;
            let bValue;

            switch (sortConfig.key) {
                case "item_name":
                    aValue = (a.item_name || "").toLowerCase();
                    bValue = (b.item_name || "").toLowerCase();
                    break;

                case "quantity":
                    aValue = getTotalInventory(a);
                    bValue = getTotalInventory(b);
                    break;

                case "available":
                    aValue = getAvailable(a);
                    bValue = getAvailable(b);
                    break;

                case "status": {
                    const statusOrder = {
                        available: 1,
                        unavailable: 3,
                    };

                    aValue =
                        statusOrder[getStatus(a)] ?? 99;

                    bValue =
                        statusOrder[getStatus(b)] ?? 99;

                    break;
                }

                default:
                    return 0;
            }

            let result;

            if (
                typeof aValue === "number" &&
                typeof bValue === "number"
            ) {
                result = aValue - bValue;
            } else {
                result = String(aValue).localeCompare(
                    String(bValue)
                );
            }

            return sortConfig.direction === "asc"
                ? result
                : -result;
        });
    }, [inventory, sortConfig]);


    /* =====================================================
       EMPTY STATE
       ===================================================== */

    if (!inventory || inventory.length === 0) {
        return (
            <div className="inventory-empty">
                <div className="inventory-empty-icon">
                    <FaBarcode />
                </div>

                <h3>No inventory found</h3>

                <p>
                    There are no inventory items matching
                    your current search.
                </p>
            </div>
        );
    }


    /* =====================================================
       SELECTION
       ===================================================== */

    const visibleIds = sortedInventory.map(
        (item) => item.id
    );

    const allSelected =
        visibleIds.length > 0 &&
        visibleIds.every((id) =>
            selectedIds.includes(id)
        );

    const someSelected =
        visibleIds.some((id) =>
            selectedIds.includes(id)
        );


    /* =====================================================
       SORT ICON
       ===================================================== */

    const renderSortIcon = (key) => {
        if (sortConfig.key !== key) {
            return (
                <FaSort className="sort-icon sort-icon--inactive" />
            );
        }

        if (sortConfig.direction === "asc") {
            return (
                <FaSortUp className="sort-icon" />
            );
        }

        return (
            <FaSortDown className="sort-icon" />
        );
    };


    /* =====================================================
       TABLE
       ===================================================== */

    return (
        <table className="inventory-table">

            <colgroup>
                <col className="col-checkbox" />
                <col className="col-image" />
                <col className="col-item" />
                <col className="col-number" />
                <col className="col-available" />
                <col className="col-status" />
                <col className="col-actions" />
            </colgroup>


            {/* =================================================
                HEADER
                ================================================= */}

            <thead>
                <tr>

                    {/* CHECKBOX */}

                    <th className="col-checkbox">
                        <input
                            className="inventory-checkbox"
                            type="checkbox"
                            checked={allSelected}
                            ref={(input) => {
                                if (input) {
                                    input.indeterminate =
                                        !allSelected &&
                                        someSelected;
                                }
                            }}
                            onChange={onToggleSelectAll}
                            aria-label="Select all inventory items"
                        />
                    </th>


                    {/* IMAGE */}

                    <th className="col-image">
                        Image
                    </th>


                    {/* ITEM */}

                    <th
                        className="col-item sortable"
                        onClick={() =>
                            handleSort("item_name")
                        }
                    >
                        <span>
                            Tools / Item
                            {renderSortIcon("item_name")}
                        </span>
                    </th>


                    {/* QTY */}

                    <th
                        className="col-number sortable"
                        onClick={() =>
                            handleSort("quantity")
                        }
                    >
                        <span>
                            Qty
                            {renderSortIcon("quantity")}
                        </span>
                    </th>


                    {/* AVAILABLE */}

                    <th
                        className="col-available sortable"
                        onClick={() =>
                            handleSort("available")
                        }
                    >
                        <span>
                            Available
                            {renderSortIcon("available")}
                        </span>
                    </th>


                    {/* STATUS */}

                    <th
                        className="col-status sortable"
                        onClick={() =>
                            handleSort("status")
                        }
                    >
                        <span>
                            Status
                            {renderSortIcon("status")}
                        </span>
                    </th>


                    {/* ACTIONS */}

                    <th className="col-actions">
                        Actions
                    </th>

                </tr>
            </thead>


            {/* =================================================
                BODY
                ================================================= */}

            <tbody>

                {sortedInventory.map((item) => {
                    const totalInventory =
                        getTotalInventory(item);

                    const available =
                        getAvailable(item);

                    const status =
                        getStatus(item);

                    const image =
                        getImage(item);

                    return (
                        <tr key={item.id}>

                            {/* =====================================
                                CHECKBOX
                                ===================================== */}

                            <td className="col-checkbox">
                                <input
                                    className="inventory-checkbox"
                                    type="checkbox"
                                    checked={selectedIds.includes(
                                        item.id
                                    )}
                                    onChange={() =>
                                        onToggleSelection(
                                            item.id
                                        )
                                    }
                                    aria-label={`Select ${item.item_name}`}
                                />
                            </td>


                            {/* =====================================
                                IMAGE
                                ===================================== */}

                            <td className="col-image">
                                <div className="inventory-item-image">
                                    {image ? (
                                        <img
                                            src={image}
                                            alt={
                                                item.item_name ||
                                                "Inventory item"
                                            }
                                            loading="lazy"
                                            onError={(e) => {
                                                e.currentTarget.style.display =
                                                    "none";
                                            }}
                                        />
                                    ) : (
                                        <FaBarcode />
                                    )}
                                </div>
                            </td>


                            {/* =====================================
                                ITEM
                                ===================================== */}

                            <td className="col-item">
                                <span className="item-name">
                                    {item.item_name ||
                                        "Unnamed Item"}
                                </span>
                            </td>


                            {/* =====================================
                                TOTAL QTY
                                ===================================== */}

                            <td className="col-number">
                                <span className="inventory-number">
                                    {totalInventory}
                                </span>
                            </td>


                            {/* =====================================
                                AVAILABLE
                                ===================================== */}

                            <td className="col-available">
                                <span
                                    className={
                                        available > 0
                                            ? "inventory-number"
                                            : "inventory-number unavailable"
                                    }
                                >
                                    {available}
                                </span>
                            </td>


                            {/* =====================================
                                STATUS
                                ===================================== */}

                            <td className="col-status">
                                <span
                                    className={`inventory-status ${
                                        status === "available"
                                            ? "available"
                                            : "danger"
                                    }`}
                                >
                                    {getStatusLabel(item)}
                                </span>
                            </td>


                            {/* =====================================
                                ACTIONS
                                ===================================== */}

                            <td className="col-actions">
                                <div className="inventory-actions">

                                    {/* VIEW */}

                                    <button
                                        type="button"
                                        className="action-btn view"
                                        onClick={() =>
                                            onDetails(item)
                                        }
                                        title="View inventory details"
                                        aria-label={`View details for ${item.item_name}`}
                                    >
                                        <FaEye />
                                        <span>View</span>
                                    </button>


                                    {/* ASSETS */}

                                    {item.tracking_type ===
                                        "serialized" && (
                                        <button
                                            type="button"
                                            className="action-btn assets"
                                            onClick={() =>
                                                onAssets(item)
                                            }
                                            title="Manage serialized assets"
                                            aria-label={`Manage assets for ${item.item_name}`}
                                        >
                                            <FaBarcode />
                                            <span>Assets</span>
                                        </button>
                                    )}


                                    {/* AVAILABILITY */}

                                    <button
                                        type="button"
                                        className="action-btn availability"
                                        onClick={() =>
                                            onAvailability(item)
                                        }
                                        title="Manage unavailable dates"
                                        aria-label={`Manage availability for ${item.item_name}`}
                                    >
                                        <FaCalendarTimes />
                                        <span>
                                            Availability
                                        </span>
                                    </button>


                                    {/* EDIT */}

                                    <button
                                        type="button"
                                        className="action-btn edit"
                                        onClick={() =>
                                            onEdit(item)
                                        }
                                        title="Edit inventory item"
                                        aria-label={`Edit ${item.item_name}`}
                                    >
                                        <FaEdit />
                                        <span>Edit</span>
                                    </button>

                                </div>
                            </td>

                        </tr>
                    );
                })}

            </tbody>

        </table>
    );
}