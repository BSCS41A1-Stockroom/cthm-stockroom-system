import { useState } from "react";

import "../../styles/inventory.css";

import InventoryToolbar from "../../components/admin/Inventory/InventoryToolbar";
import InventoryTable from "../../components/admin/Inventory/InventoryTable";
import Pagination from "../../components/admin/Inventory/Pagination";
import AddItemModal from "../../components/admin/Inventory/AddItemModal";

export default function Inventory() {

    const [openModal, setOpenModal] = useState(false);

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All Categories");
    const [status, setStatus] = useState("All Remarks");

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
                <InventoryTable />
            </div>

            <Pagination />

            <AddItemModal
                open={openModal}
                onClose={() => setOpenModal(false)}
            />

        </div>

    );

}