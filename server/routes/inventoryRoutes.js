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
const { createAsset, listAssets, updateAsset } = require("../controllers/assetController");

const router = express.Router();
router.use(authenticate, requireRoles("admin"));

router.post("/", saveInventory);
router.put("/:inventoryId", saveInventory);
router.delete("/:inventoryId", deleteInventory);
router.get("/:inventoryId/assets", listAssets);
router.post("/:inventoryId/assets", createAsset);
router.patch("/:inventoryId/assets/:assetId", updateAsset);

router.get("/:inventoryId/unavailability", listUnavailability);
router.post("/:inventoryId/unavailability", saveUnavailability);
router.put("/:inventoryId/unavailability/:periodId", saveUnavailability);
router.delete("/:inventoryId/unavailability/:periodId", deleteUnavailability);

module.exports = router;
