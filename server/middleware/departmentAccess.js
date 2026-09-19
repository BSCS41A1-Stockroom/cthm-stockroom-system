"use strict";
const pool = require("../config/db");

async function requireInventoryDepartment(req, res, next) {
  if (req.user?.role === "admin") return next();
  const inventoryId = req.params.inventoryId;
  if (!/^[1-9]\d*$/.test(String(inventoryId ?? ""))) return res.status(400).json({ error: "INVALID_INVENTORY_ID", message: "Inventory ID is invalid." });
  try {
    const result = await pool.query(
      `SELECT inventory.id FROM public.inventory inventory JOIN public.laboratory_rooms room ON room.id=inventory.room_id
       WHERE inventory.id=$1 AND room.department_id=$2`, [inventoryId, req.user.department_id]);
    if (!result.rowCount) return res.status(404).json({ error: "INVENTORY_NOT_FOUND", message: "Inventory item was not found in your department." });
    return next();
  } catch (error) { return next(error); }
}
module.exports = { requireInventoryDepartment };
