"use strict";

const express = require("express");
const {
  createBorrowRequest,
  updateBorrowRequestStatus,
  validateBorrowRequest,
} = require("../controllers/borrowController");

const router = express.Router();

router.post("/validate", validateBorrowRequest);
router.post("/", createBorrowRequest);
router.patch("/:id/status", updateBorrowRequestStatus);

module.exports = router;
