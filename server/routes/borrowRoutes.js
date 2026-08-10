"use strict";

const express = require("express");
const { createBorrowRequest, validateBorrowRequest } = require("../controllers/borrowController");

const router = express.Router();

router.post("/validate", validateBorrowRequest);
router.post("/", createBorrowRequest);

module.exports = router;
