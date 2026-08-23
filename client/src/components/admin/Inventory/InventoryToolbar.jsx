import { FaPlus, FaSearch } from "react-icons/fa";

export default function InventoryToolbar({
  onAdd,
  search,
  setSearch,
  status,
  setStatus,
}) {
  return (
    <>
      <div className="inventory-header">
        <div className="inventory-title">
          <h2>Inventory</h2>
          <p>Manage stockroom items and their availability.</p>
        </div>

        <button className="inventory-add" onClick={onAdd}>
          <FaPlus />
          <span>Add New Item</span>
        </button>
      </div>

      <div className="inventory-toolbar">
        <div className="inventory-search">
          <FaSearch />
          <input
            type="text"
            placeholder="Search inventory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by stock level"
        >
          <option value="all">All Stock Levels</option>
          <option value="in-stock">In Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="out-of-stock">Out of Stock</option>
        </select>
      </div>
    </>
  );
}
