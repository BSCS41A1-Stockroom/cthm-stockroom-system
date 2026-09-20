"use strict";

const express = require("express");

const router = express.Router();

const generateBorrowerForm =
  require("../generateBorrowerForm");

router.post("/", async (req, res) => {
  try {
    const {
      laboratory,
      dateTime,
      controlNo,

      department,
      departmentCode,
      section,
      assignedProfessor,

      studentName,
      studentId,

      borrowDate,
      returnDate,
      purpose,

      items,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message:
          "At least one borrowing item is required.",
      });
    }

    const limitedItems =
      items.slice(0, 30);

    const docxBuffer =
      generateBorrowerForm({
        laboratory:
          laboratory || "CTHM",

        dateTime:
          dateTime || "",

        controlNo:
          controlNo || "",

        department:
          department || "",

        departmentCode:
          departmentCode || "",

        section:
          section || "",

        assignedProfessor:
          assignedProfessor || "",

        studentName:
          studentName || "",

        studentId:
          studentId || "",

        borrowDate:
          borrowDate || "",

        returnDate:
          returnDate || "",

        purpose:
          purpose || "",

        items:
          limitedItems,
      });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Borrowers-Form-${
        controlNo || "Form"
      }.docx"`
    );

    res.send(docxBuffer);
  } catch (error) {
    console.error(
      "Borrower's Form generation error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to generate Borrower's Form.",
      error:
        error.message,
    });
  }
});

module.exports = router;