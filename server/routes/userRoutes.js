"use strict";
const express = require("express"); const { authenticate, requireRoles } = require("../middleware/auth");
const { inviteUser, listUsers, updateUser } = require("../controllers/userController");
const router = express.Router(); router.use(authenticate, requireRoles("admin"));
router.get("/", listUsers); router.post("/invite", inviteUser); router.patch("/:id", updateUser);
module.exports = router;
