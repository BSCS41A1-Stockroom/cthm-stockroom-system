"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const {
  deleteInventory,
  deleteUnavailability,
  listUnavailability,
  saveUnavailability,
  saveInventory,
} = require("../controllers/inventoryController");
const { createAsset, listAssets, resolveAssetIncident, updateAsset } = require("../controllers/assetController");
const { listAssetMaintenance, updateAssetMaintenance } = require("../controllers/maintenanceController");
const { configureInspection, listInspections, recordInspection } = require("../controllers/inspectionController");
const { requireInventoryDepartment } = require("../middleware/departmentAccess");

const router = express.Router();
router.use(authenticate, requireRoles("staff", "admin"));

router.post("/", saveInventory);
router.use("/:inventoryId", requireInventoryDepartment);
router.put("/:inventoryId", saveInventory);
router.delete("/:inventoryId", deleteInventory);
router.get("/:inventoryId/assets", listAssets);
router.post("/:inventoryId/assets", createAsset);
router.patch("/:inventoryId/assets/:assetId", updateAsset);
router.get("/:inventoryId/assets/:assetId/maintenance", listAssetMaintenance);
router.patch("/:inventoryId/assets/:assetId/maintenance/:maintenanceId", updateAssetMaintenance);
router.get("/:inventoryId/assets/:assetId/inspections", listInspections);
router.patch("/:inventoryId/assets/:assetId/inspection-settings", configureInspection);
router.post("/:inventoryId/assets/:assetId/inspections", recordInspection);
router.post("/:inventoryId/assets/:assetId/incidents/:incidentId/resolve", resolveAssetIncident);

router.get("/:inventoryId/unavailability", listUnavailability);
router.post("/:inventoryId/unavailability", saveUnavailability);
router.put("/:inventoryId/unavailability/:periodId", saveUnavailability);
router.delete("/:inventoryId/unavailability/:periodId", deleteUnavailability);

module.exports = router;
