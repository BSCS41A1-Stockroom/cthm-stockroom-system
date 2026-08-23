import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

import "../../styles/inventory.css";

import InventoryToolbar from "../../components/admin/Inventory/InventoryToolbar";
import InventoryTable from "../../components/admin/Inventory/InventoryTable";
import AddItemModal from "../../components/admin/Inventory/AddItemModal";
import EditItemModal from "../../components/admin/Inventory/EditItemModal";
import DeleteModal from "../../components/admin/Inventory/DeleteModal";
import { inventoryStockStatus } from "../../utils/inventoryAvailability";

export default function Inventory() {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);

    const [openModal, setOpenModal] = useState(false);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");

    const [editOpen, setEditOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const [deleteOpen, setDeleteOpen] = useState(false);

    useEffect(() => {
        loadInventory();
        const channel = supabase
            .channel("admin-inventory")
            .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, loadInventory)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function loadInventory() {
        const { data } = await supabase
            .from("inventory")
            .select("*")
            .order("id");

        setInventory(data || []);
        setLoading(false);
    }

    const filteredInventory = useMemo(() => inventory.filter((item) => {
        const matchesSearch = item.item_name?.toLowerCase().includes(search.trim().toLowerCase());
        const matchesStatus = status === "all" || inventoryStockStatus(item) === status;
        return matchesSearch && matchesStatus;
    }), [inventory, search, status]);

    if (loading) return <p>Loading...</p>;

    return (
        <div className="inventory-page">

            <InventoryToolbar
                onAdd={() => setOpenModal(true)}
                search={search}
                setSearch={setSearch}
                status={status}
                setStatus={setStatus}
            />

            <div className="inventory-table-wrapper">
                <InventoryTable
                    inventory={filteredInventory}
                    onEdit={(item)=>{
                        setSelectedItem(item);
                        setEditOpen(true);
                    }}
                    onDelete={(item)=>{
                        setSelectedItem(item);
                        setDeleteOpen(true);
                    }}
                />
            </div>

            {editOpen && selectedItem && (
                <EditItemModal
                    key={selectedItem.id}
                    open={editOpen}
                    item={selectedItem}
                    onClose={() => setEditOpen(false)}
                    onUpdated={loadInventory}
                />
            )}

            <AddItemModal
                open={openModal}
                onClose={() => {
                    setOpenModal(false);
                    loadInventory();
                }}
            />

            <DeleteModal
                open={deleteOpen}
                item={selectedItem}
                onClose={() => setDeleteOpen(false)}
                onDeleted={loadInventory}
            />

        </div>
    );
}
