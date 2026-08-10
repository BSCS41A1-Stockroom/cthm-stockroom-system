"use strict";

const express = require("express");
const {
  deleteEvent,
  listEvents,
  listRooms,
  saveEvent,
} = require("../controllers/calendarController");

const router = express.Router();

router.get("/events", listEvents);
router.post("/events", saveEvent);
router.put("/events/:id", saveEvent);
router.delete("/events/:id", deleteEvent);
router.get("/rooms", listRooms);

module.exports = router;
