"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");

const {
  createBorrowRequest,
  listBorrowRequests,
  validateBorrowRequest,
  updateBorrowRequestStatus,
  processBorrowingReturn,
} = require("../controllers/borrowController");

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  listBorrowRequests
);


// ============================================================
// VALIDATE BORROWING REQUEST
// ============================================================

router.post(
  "/validate",
  requireRoles("student"),
  validateBorrowRequest
);


// ============================================================
// CREATE BORROWING REQUEST
// ============================================================

router.post(
  "/",
  requireRoles("student"),
  createBorrowRequest
);


// ============================================================
// UPDATE BORROWING REQUEST STATUS
// ============================================================

router.patch(
  "/:id/status",
  requireRoles("professor", "admin"),
  updateBorrowRequestStatus
);

router.post(
  "/:id/returns",
  requireRoles("professor", "admin"),
  processBorrowingReturn
);


module.exports = router;
