"use strict";
const express = require("express");
const { authenticate } = require("../middleware/auth");
const { listRequestReceipts, verifyReceipt } = require("../controllers/receiptController");
const router = express.Router();
router.get("/verify/:code", verifyReceipt);
router.get("/request/:id", authenticate, listRequestReceipts);
module.exports = router;
