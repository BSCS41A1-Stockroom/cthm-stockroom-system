"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const {
  deleteUnavailability,
  listUnavailability,
  saveUnavailability,
} = require("../controllers/inventoryController");

const router = express.Router();
router.use(authenticate, requireRoles("admin"));

router.get("/:inventoryId/unavailability", listUnavailability);
router.post("/:inventoryId/unavailability", saveUnavailability);
router.put("/:inventoryId/unavailability/:periodId", saveUnavailability);
router.delete("/:inventoryId/unavailability/:periodId", deleteUnavailability);

module.exports = router;
