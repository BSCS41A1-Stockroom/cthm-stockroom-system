"use strict";

const express = require("express");
const { authenticate, requireRoles } = require("../middleware/auth");
const { listClosures, suggestFromPost, createClosure, deactivateClosure,
  listAnnouncementReviews, submitAnnouncementReview, dismissAnnouncementReview } = require("../controllers/closureController");

const router = express.Router();
router.use(authenticate);
router.get("/", listClosures);
router.post("/suggest", requireRoles("admin"), suggestFromPost);
router.get("/announcements", requireRoles("admin"), listAnnouncementReviews);
router.post("/announcements", requireRoles("admin"), submitAnnouncementReview);
router.post("/announcements/:id/dismiss", requireRoles("admin"), dismissAnnouncementReview);
router.post("/", requireRoles("admin"), createClosure);
router.patch("/:id/deactivate", requireRoles("admin"), deactivateClosure);

module.exports = router;
