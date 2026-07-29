import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

import "../../styles/inventory.css";

import InventoryToolbar from "../../components/admin/Inventory/InventoryToolbar";
import InventoryTable from "../../components/admin/Inventory/InventoryTable";
import Pagination from "../../components/admin/Inventory/Pagination";
import AddItemModal from "../../components/admin/Inventory/AddItemModal";
import EditItemModal from "../../components/admin/Inventory/EditItemModal";
import DeleteModal from "../../components/admin/Inventory/DeleteModal";

export default function Inventory() {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);

    const [openModal, setOpenModal] = useState(false);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All Categories");
    const [status, setStatus] = useState("All Remarks");

    const [editOpen, setEditOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const [deleteOpen, setDeleteOpen] = useState(false);

    useEffect(() => {
        loadInventory();
    }, []);

    async function loadInventory() {
        const { data } = await supabase
            .from("inventory")
            .select("*")
            .order("id");

        setInventory(data || []);
        setLoading(false);
    }

    async function addInventory(form) {
        const { error } = await supabase
            .from("inventory")
            .insert([form]);

        if (error) {
            console.log(error);
            return;
        }

        setOpenModal(false);
        loadInventory();
    }

    async function updateInventory(id, form) {
        const { error } = await supabase
            .from("inventory")
            .update(form)
            .eq("id", id);

        if (error) {
            alert(error.message);
            return;
        }

        setEditOpen(false);
        loadInventory();
    }

    if (loading) return <p>Loading...</p>;

    return (
        <div className="inventory-page">

            <InventoryToolbar
                onAdd={() => setOpenModal(true)}
                search={search}
                setSearch={setSearch}
                category={category}
                setCategory={setCategory}
                status={status}
                setStatus={setStatus}
            />

            <div className="inventory-table-wrapper">
                <InventoryTable
                    inventory={inventory}
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

            <EditItemModal
                open={editOpen}
                item={selectedItem}
                onClose={() => setEditOpen(false)}
                onUpdate={updateInventory}
            />

            <Pagination />

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