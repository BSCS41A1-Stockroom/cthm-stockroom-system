"use strict";

const express = require("express");
const { runOverdueMonitoring } = require("../controllers/overdueController");

const router = express.Router();
router.get("/overdue", runOverdueMonitoring);

module.exports = router;
