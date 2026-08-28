"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { reportSummary } = require("../controllers/reportController");

const router = express.Router();
router.use(authenticate, requireRoles("professor", "admin"));
router.get("/summary", reportSummary);

module.exports = router;
