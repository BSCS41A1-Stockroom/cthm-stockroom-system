"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");

const {
  createBorrowRequest,
  getBorrowingPolicy,
  getAssignmentOptions,
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

router.get(
  "/policy",
  requireRoles("student"),
  getBorrowingPolicy
);

router.get(
  "/assignment-options",
  requireRoles("student", "staff", "admin"),
  getAssignmentOptions
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
  requireRoles("professor", "staff", "admin"),
  updateBorrowRequestStatus
);

router.post(
  "/:id/returns",
  requireRoles("staff"),
  processBorrowingReturn
);


module.exports = router;
