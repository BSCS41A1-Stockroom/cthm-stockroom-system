"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const {
  deleteEvent,
  listEvents,
  listRooms,
  saveEvent,
} = require("../controllers/calendarController");

const router = express.Router();

router.use(authenticate);

router.get("/events", listEvents);
router.post("/events", requireRoles("professor", "admin"), saveEvent);
router.put("/events/:id", requireRoles("professor", "admin"), saveEvent);
router.delete("/events/:id", requireRoles("professor", "admin"), deleteEvent);
router.get("/rooms", listRooms);

module.exports = router;
