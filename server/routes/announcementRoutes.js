"use strict";
const express = require("express");
const { authenticate } = require("../middleware/auth");
const { listAnnouncements } = require("../controllers/announcementController");
const router = express.Router();
router.use(authenticate);
router.get("/", listAnnouncements);
module.exports = router;
