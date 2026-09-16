"use strict";
const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { listCases, updateCase } = require("../controllers/accountabilityController");
const router = express.Router();
router.use(authenticate);
router.get("/", listCases);
router.patch("/:id", requireRoles("admin"), updateCase);
module.exports = router;
