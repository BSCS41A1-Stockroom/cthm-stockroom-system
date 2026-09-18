import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

import "../../styles/inventory.css";
import "../../styles/inspection.css";

import InventoryToolbar from "../../components/admin/Inventory/InventoryToolbar";
import InventoryTable from "../../components/admin/Inventory/InventoryTable";
import AddItemModal from "../../components/admin/Inventory/AddItemModal";
import EditItemModal from "../../components/admin/Inventory/EditItemModal";
import DeleteModal from "../../components/admin/Inventory/DeleteModal";
import UnavailabilityModal from "../../components/admin/Inventory/UnavailabilityModal";
import AssetModal from "../../components/admin/Inventory/AssetModal";
import ReconciliationModal from "../../components/admin/Inventory/ReconciliationModal";
import InventoryDetailsModal from "../../components/admin/Inventory/InventoryDetailsModal";
import InventoryFullViewModal from "../../components/admin/Inventory/InventoryFullViewModal";
import { inventoryTotals } from "../../utils/inventoryAvailability";

export default function Inventory() {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);

    const [openModal, setOpenModal] = useState(false);

    const [search, setSearch] = useState("");

    const [editOpen, setEditOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const [deleteOpen, setDeleteOpen] = useState(false);

    const [availabilityItem, setAvailabilityItem] = useState(null);
    const [assetItem, setAssetItem] = useState(null);

    const [reconciliationOpen, setReconciliationOpen] = useState(false);
    const [detailsItem, setDetailsItem] = useState(null);
    const [fullViewOpen, setFullViewOpen] = useState(false);

    const [selectedIds, setSelectedIds] = useState([]);

    const [lastUpdated, setLastUpdated] = useState(null);

    useEffect(() => {
        loadInventory();

        const channel = supabase
            .channel("admin-inventory")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "inventory",
                },
                loadInventory
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function loadInventory() {
        const { data, error } = await supabase
            .from("inventory")
            .select("*")
            .order("id");

        if (error) {
            console.error("Failed to load inventory:", error);
            setLoading(false);
            return;
        }

        const items = data || [];

        setInventory(items);

        /*
         * Use updated_at when available.
         * If your table does not have updated_at yet,
         * this falls back to the current refresh time.
         */
        const timestamps = items
            .map((item) => item.updated_at)
            .filter(Boolean)
            .map((date) => new Date(date).getTime())
            .filter((time) => !Number.isNaN(time));

        if (timestamps.length > 0) {
            setLastUpdated(new Date(Math.max(...timestamps)));
        } else {
            setLastUpdated(new Date());
        }

        setLoading(false);
    }

    const filteredInventory = useMemo(() => {
        const query = search.trim().toLowerCase();

        if (!query) {
            return inventory;
        }

        return inventory.filter((item) =>
            item.item_name?.toLowerCase().includes(query)
        );
    }, [inventory, search]);

    const toggleSelection = (id) => {
        setSelectedIds((current) =>
            current.includes(id)
                ? current.filter((selectedId) => selectedId !== id)
                : [...current, id]
        );
    };

    const toggleSelectAll = () => {
        const visibleIds = filteredInventory.map((item) => item.id);

        const allSelected =
            visibleIds.length > 0 &&
            visibleIds.every((id) => selectedIds.includes(id));

        if (allSelected) {
            setSelectedIds((current) =>
                current.filter((id) => !visibleIds.includes(id))
            );
        } else {
            setSelectedIds((current) => [
                ...new Set([...current, ...visibleIds]),
            ]);
        }
    };

    const clearSelection = () => {
        setSelectedIds([]);
    };

    const selectedItems = inventory.filter((item) =>
        selectedIds.includes(item.id)
    );

    const handleBulkDelete = () => {
        if (selectedItems.length === 0) return;

        /*
         * Reuse the existing delete modal for one item.
         * Bulk deletion should be connected to a dedicated
         * bulk-delete confirmation/modal when you implement it.
         */
        console.log("Selected items for deletion:", selectedItems);
    };

    const formatLastUpdated = () => {
        if (!lastUpdated) return "Updating...";

        return lastUpdated.toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    if (loading) {
        return (
            <div className="inventory-loading">
                Loading inventory...
            </div>
        );
    }

    return (
        <div className="inventory-page">

            {/* =====================================================
                HEADER
            ===================================================== */}

            <div className="inventory-header">

                <div className="inventory-title">

                    <div className="inventory-title-label">
                        STOCKROOM MANAGEMENT
                    </div>

                    <h2>Inventory</h2>

                    <p>
                        Manage stockroom items, quantities, availability, and status.
                    </p>

                    <div className="inventory-last-updated">
                        Last updated: {formatLastUpdated()}
                    </div>

                </div>

                <div className="inventory-header-actions">

                    <button
                        className="inventory-header-btn inventory-header-btn--primary"
                        onClick={() => setOpenModal(true)}
                        title="Add new inventory item"
                    >
                        <span className="inventory-plus">+</span>
                        <span>Add Item</span>
                    </button>

                </div>

            </div>


            {/* =====================================================
                TOOLBAR
            ===================================================== */}

            <InventoryToolbar
                search={search}
                setSearch={setSearch}
                onReconcile={() => setReconciliationOpen(true)}
                onViewFullInventory={() => setFullViewOpen(true)}
            />


            {/* =====================================================
                TABLE
            ===================================================== */}

            <div className="inventory-table-wrapper">

                <InventoryTable
                    inventory={filteredInventory}

                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                    onToggleSelectAll={toggleSelectAll}

                    onDetails={setDetailsItem}

                    onEdit={(item) => {
                        setSelectedItem(item);
                        setEditOpen(true);
                    }}

                    onAvailability={setAvailabilityItem}
                    onAssets={setAssetItem}
                />

            </div>


            {/* =====================================================
                SELECTION ACTIONS
            ===================================================== */}

            {selectedIds.length > 0 && (
                <div className="inventory-selection-bar">

                    <div className="inventory-selection-info">
                        <strong>{selectedIds.length}</strong>
                        <span>
                            {selectedIds.length === 1
                                ? "item selected"
                                : "items selected"}
                        </span>
                    </div>

                    <div className="inventory-selection-actions">

                        <button
                            className="bulk-delete-btn"
                            onClick={handleBulkDelete}
                        >
                            Delete Selected
                        </button>

                        <button
                            className="clear-selection-btn"
                            onClick={clearSelection}
                        >
                            Clear Selection
                        </button>

                    </div>

                </div>
            )}


            {/* =====================================================
                ITEM COUNT / PAGINATION
            ===================================================== */}

            <div className="inventory-table-footer">

                <span className="inventory-item-count">
                    {filteredInventory.length}{" "}
                    {filteredInventory.length === 1 ? "item" : "items"}
                </span>

                {/* Pagination can be connected here later */}

            </div>


            {/* =====================================================
                FULL INVENTORY
            ===================================================== */}

            <InventoryFullViewModal
                open={fullViewOpen}
                inventory={inventory}
                onClose={() => setFullViewOpen(false)}
                search={search}
            />


            {/* =====================================================
                DETAILS
            ===================================================== */}

            {detailsItem && (
                <InventoryDetailsModal
                    item={detailsItem}
                    onClose={() => setDetailsItem(null)}
                    onEdit={(item) => {
                        setSelectedItem(item);
                        setEditOpen(true);
                        setDetailsItem(null);
                    }}
                />
            )}


            {/* =====================================================
                EDIT
            ===================================================== */}

            {editOpen && selectedItem && (
                <EditItemModal
                    key={selectedItem.id}
                    open={editOpen}
                    item={selectedItem}
                    onClose={() => setEditOpen(false)}
                    onUpdated={loadInventory}
                />
            )}


            {/* =====================================================
                ADD
            ===================================================== */}

            <AddItemModal
                open={openModal}
                onClose={() => {
                    setOpenModal(false);
                    loadInventory();
                }}
            />


            {/* =====================================================
                SINGLE DELETE
            ===================================================== */}

            <DeleteModal
                open={deleteOpen}
                item={selectedItem}
                onClose={() => setDeleteOpen(false)}
                onDeleted={loadInventory}
            />


            {/* =====================================================
                AVAILABILITY
            ===================================================== */}

            {availabilityItem && (
                <UnavailabilityModal
                    item={availabilityItem}
                    onClose={() => setAvailabilityItem(null)}
                />
            )}


            {/* =====================================================
                ASSETS
            ===================================================== */}

            {assetItem && (
                <AssetModal
                    item={assetItem}
                    onClose={() => setAssetItem(null)}
                    onChanged={loadInventory}
                />
            )}


            {/* =====================================================
                RECONCILIATION
            ===================================================== */}

            {reconciliationOpen && (
                <ReconciliationModal
                    onClose={() => setReconciliationOpen(false)}
                    onChanged={loadInventory}
                />
            )}

        </div>
    );
}