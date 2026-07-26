import { FaPlus, FaSearch, FaFilter } from "react-icons/fa";

export default function InventoryToolbar({
  onAdd,
  search,
  setSearch,
  category,
  setCategory,
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

        <input type="date" className="inventory-date" />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>All Categories</option>
          <option>Kitchen</option>
          <option>Equipment</option>
          <option>Supplies</option>
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option>All Remarks</option>
          <option>Available</option>
          <option>Good Condition</option>
          <option>Needs Inspection</option>
        </select>

        <div
            className="filter-link"
            onClick={() => console.log("filter")}
        >
            <FaFilter />
            <span>Filter</span>
        </div>
      </div>
    </>
  );
}