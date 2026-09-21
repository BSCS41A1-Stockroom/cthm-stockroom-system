"use strict";
const express=require("express");
const {authenticate,requireRoles}=require("../middleware/auth");
const {downloadDocument,listDocuments,verifyDocument}=require("../controllers/documentArchiveController");
const router=express.Router(); router.use(authenticate);
router.post("/verify",requireRoles("admin"),verifyDocument);
router.get("/request/:id",requireRoles("student","professor","staff","admin"),listDocuments);
router.get("/:documentId/download",requireRoles("student","professor","staff","admin"),downloadDocument);
module.exports=router;
