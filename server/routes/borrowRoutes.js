"use strict";

const express = require("express");

const {
  createBorrowRequest,
  listBorrowRequests,
  validateBorrowRequest,
  updateBorrowRequestStatus,
} = require("../controllers/borrowController");

const router = express.Router();

router.get(
  "/",
  listBorrowRequests
);


// ============================================================
// VALIDATE BORROWING REQUEST
// ============================================================

router.post(
  "/validate",
  validateBorrowRequest
);


// ============================================================
// CREATE BORROWING REQUEST
// ============================================================

router.post(
  "/",
  createBorrowRequest
);


// ============================================================
// UPDATE BORROWING REQUEST STATUS
// ============================================================

router.patch(
  "/:id/status",
  updateBorrowRequestStatus
);


module.exports = router;
