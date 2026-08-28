"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { listAuditLogs } = require("../controllers/auditController");

const router = express.Router();
router.use(authenticate, requireRoles("admin"));
router.get("/", listAuditLogs);

module.exports = router;
