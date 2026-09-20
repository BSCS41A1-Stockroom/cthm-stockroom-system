
"use strict";

const express = require("express");

const {
    authenticate,
    requireRoles,
} = require("../middleware/auth");

const {
    listSections,
    createSection,
    updateSection,
    deleteSection,
} = require("../controllers/sectionController");

const router = express.Router();

router.use(
    authenticate,
    requireRoles("admin")
);

router.get(
    "/",
    listSections
);

router.post(
    "/",
    createSection
);

router.patch(
    "/:id",
    updateSection
);

router.delete(
    "/:id",
    deleteSection
);

module.exports = router;

