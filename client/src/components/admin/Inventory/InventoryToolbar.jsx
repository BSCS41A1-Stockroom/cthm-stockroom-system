import {
    FaClipboardCheck,
    FaSearch,
    FaExpand,
} from "react-icons/fa";

export default function InventoryToolbar({
    search,
    setSearch,
    onReconcile,
    onViewFullInventory,
    canReconcile = true,
}) {
    return (
        <div className="inventory-toolbar">

            {/* SEARCH */}
            <div className="inventory-toolbar-search">

                <div className="inventory-search">

                    <FaSearch className="inventory-search-icon" />

                    <input
                        type="text"
                        placeholder="Search items, tools, or inventory..."
                        value={search}
                        onChange={(e) =>
                            setSearch(e.target.value)
                        }
                    />

                    {search && (
                        <button
                            className="inventory-search-clear"
                            onClick={() => setSearch("")}
                            aria-label="Clear search"
                        >
                            ×
                        </button>
                    )}

                </div>

            </div>


            {/* ACTIONS */}
            <div className="inventory-toolbar-actions">

                {canReconcile && <button
                    className="inventory-toolbar-btn"
                    onClick={onViewFullInventory}
                    title="View complete inventory"
                >
                    <FaExpand />
                    <span>Full Inventory</span>
                </button>}


                {canReconcile && <button
                    className="inventory-toolbar-btn"
                    onClick={onReconcile}
                    title="Perform physical inventory count"
                >
                    <FaClipboardCheck />
                    <span>Physical Count</span>
                </button>}

            </div>

        </div>
    );
}
