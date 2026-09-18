import {
    FaBarcode,
    FaCalendarTimes,
    FaEdit,
    FaEye,
    FaSort,
    FaSortUp,
    FaSortDown,
} from "react-icons/fa";

import {
    inventoryTotals
} from "../../../utils/inventoryAvailability";

import { useMemo, useState } from "react";

const getTotals = (item) => inventoryTotals(item);
const getTotalInventory = (item) => getTotals(item)?.total ?? 0;
const getAvailable = (item) => getTotals(item)?.available ?? 0;
const getStatus = (item) => getAvailable(item) > 0 ? "available" : "unavailable";
const getStatusLabel = (item) => getStatus(item) === "available" ? "Available" : "Unavailable";
const getImage = (item) => item.image_url || item.image || item.image_path || null;

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

    /*
    |--------------------------------------------------------------------------
    | INVENTORY HELPERS
    |--------------------------------------------------------------------------
    */

    /*
    |--------------------------------------------------------------------------
    | SORTING
    |--------------------------------------------------------------------------
    */

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

        const items = [
            ...(inventory || [])
        ];

        if (!sortConfig.key) {
            return items;
        }

        return items.sort((a, b) => {

            let aValue;
            let bValue;

            switch (sortConfig.key) {

                case "item_name":
                    aValue = (
                        a.item_name || ""
                    ).toLowerCase();

                    bValue = (
                        b.item_name || ""
                    ).toLowerCase();

                    break;

                case "quantity":
                    aValue =
                        getTotalInventory(a);

                    bValue =
                        getTotalInventory(b);

                    break;

                case "available":
                    aValue =
                        getAvailable(a);

                    bValue =
                        getAvailable(b);

                    break;

                case "status": {
                    /*
                     * Explicit status order:
                     *
                     * Available
                     * Partially Available
                     * Unavailable
                     *
                     * Currently the system uses
                     * Available / Unavailable.
                     */

                    const statusOrder = {
                        available: 1,
                        unavailable: 3,
                    };

                    aValue =
                        statusOrder[getStatus(a)] ??
                        99;

                    bValue =
                        statusOrder[getStatus(b)] ??
                        99;

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
                result =
                    String(aValue).localeCompare(
                        String(bValue)
                    );
            }

            return sortConfig.direction === "asc"
                ? result
                : -result;
        });

    }, [inventory, sortConfig]);

    /*
    |--------------------------------------------------------------------------
    | EMPTY STATE
    |--------------------------------------------------------------------------
    */

    if (
        !inventory ||
        inventory.length === 0
    ) {
        return (
            <div className="inventory-empty">

                <div className="inventory-empty-icon">
                    <FaBarcode />
                </div>

                <h3>
                    No inventory found
                </h3>

                <p>
                    There are no inventory items
                    matching your current search.
                </p>

            </div>
        );
    }

    /*
    |--------------------------------------------------------------------------
    | SELECTION
    |--------------------------------------------------------------------------
    */

    const visibleIds =
        sortedInventory.map(
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

    /*
    |--------------------------------------------------------------------------
    | SORT ICON
    |--------------------------------------------------------------------------
    */

    const renderSortIcon = (key) => {

        if (sortConfig.key !== key) {
            return (
                <FaSort
                    className="sort-icon sort-icon--inactive"
                />
            );
        }

        if (
            sortConfig.direction === "asc"
        ) {
            return (
                <FaSortUp
                    className="sort-icon"
                />
            );
        }

        return (
            <FaSortDown
                className="sort-icon"
            />
        );
    };

    /*
    |--------------------------------------------------------------------------
    | TABLE
    |--------------------------------------------------------------------------
    */

    return (
        <table className="inventory-table">

            <thead>

                <tr>

                    {/* SELECT ALL */}

                    <th className="col-checkbox">

                        <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(input) => {

                                if (input) {
                                    input.indeterminate =
                                        !allSelected &&
                                        someSelected;
                                }

                            }}
                            onChange={
                                onToggleSelectAll
                            }
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
                            handleSort(
                                "item_name"
                            )
                        }
                    >

                        <span>
                            Tools / Item
                        </span>

                        {renderSortIcon(
                            "item_name"
                        )}

                    </th>


                    {/* QTY */}

                    <th
                        className="col-number sortable"
                        onClick={() =>
                            handleSort(
                                "quantity"
                            )
                        }
                    >

                        <span>
                            Qty
                        </span>

                        {renderSortIcon(
                            "quantity"
                        )}

                    </th>


                    {/* AVAILABLE */}

                    <th
                        className="col-number sortable"
                        onClick={() =>
                            handleSort(
                                "available"
                            )
                        }
                    >

                        <span>
                            Available
                        </span>

                        {renderSortIcon(
                            "available"
                        )}

                    </th>


                    {/* STATUS */}

                    <th
                        className="sortable"
                        onClick={() =>
                            handleSort(
                                "status"
                            )
                        }
                    >

                        <span>
                            Status
                        </span>

                        {renderSortIcon(
                            "status"
                        )}

                    </th>


                    {/* ACTIONS */}

                    <th className="col-actions">
                        Actions
                    </th>

                </tr>

            </thead>


            <tbody>

                {sortedInventory.map(
                    (item) => {

                        const totalInventory =
                            getTotalInventory(
                                item
                            );

                        const available =
                            getAvailable(
                                item
                            );

                        const status =
                            getStatus(
                                item
                            );

                        const image =
                            getImage(
                                item
                            );

                        return (
                            <tr
                                key={item.id}
                            >

                                {/* CHECKBOX */}

                                <td className="col-checkbox">

                                    <input
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


                                {/* IMAGE */}

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
                                                onError={(
                                                    e
                                                ) => {
                                                    e.currentTarget.style.display =
                                                        "none";
                                                }}
                                            />

                                        ) : (

                                            <FaBarcode />

                                        )}

                                    </div>

                                </td>


                                {/* ITEM */}

                                <td className="col-item">

                                    <span className="item-name">
                                        {
                                            item.item_name ||
                                            "Unnamed Item"
                                        }
                                    </span>

                                </td>


                                {/* TOTAL QTY */}

                                <td className="col-number">

                                    <strong>
                                        {
                                            totalInventory
                                        }
                                    </strong>

                                </td>


                                {/* AVAILABLE */}

                                <td className="col-number">

                                    <span
                                        className={
                                            available > 0
                                                ? "available-number"
                                                : "available-number unavailable"
                                        }
                                    >
                                        {
                                            available
                                        }
                                    </span>

                                </td>


                                {/* STATUS */}

                                <td>

                                    <span
                                        className={`inventory-status ${
                                            status ===
                                            "available"
                                                ? "available"
                                                : "danger"
                                        }`}
                                    >

                                        <span className="status-dot" />

                                        {
                                            getStatusLabel(
                                                item
                                            )
                                        }

                                    </span>

                                </td>


                                {/* ACTIONS */}

                                <td className="col-actions">

                                    <div className="inventory-actions">

                                        {/* VIEW */}

                                        <button
                                            className="action-btn action-view"
                                            onClick={() =>
                                                onDetails(
                                                    item
                                                )
                                            }
                                            title="View inventory details"
                                            aria-label={`View details for ${item.item_name}`}
                                        >
                                            <FaEye />
                                            <span>
                                                View
                                            </span>
                                        </button>


                                        {/* ASSETS */}

                                        {item.tracking_type ===
                                            "serialized" && (

                                            <button
                                                className="action-btn action-assets"
                                                onClick={() =>
                                                    onAssets(
                                                        item
                                                    )
                                                }
                                                title="Manage serialized assets"
                                                aria-label={`Manage assets for ${item.item_name}`}
                                            >
                                                <FaBarcode />

                                                <span>
                                                    Assets
                                                </span>

                                            </button>

                                        )}


                                        {/* AVAILABILITY */}

                                        <button
                                            className="action-btn action-availability"
                                            onClick={() =>
                                                onAvailability(
                                                    item
                                                )
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
                                            className="action-btn action-edit"
                                            onClick={() =>
                                                onEdit(
                                                    item
                                                )
                                            }
                                            title="Edit inventory item"
                                            aria-label={`Edit ${item.item_name}`}
                                        >
                                            <FaEdit />

                                            <span>
                                                Edit
                                            </span>

                                        </button>

                                    </div>

                                </td>

                            </tr>
                        );
                    }
                )}

            </tbody>

        </table>
    );
}
