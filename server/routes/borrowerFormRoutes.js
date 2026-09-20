"use strict";

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const router = express.Router();
const generateBorrowerForm = require("../generateBorrowerForm");

const execFileAsync = promisify(execFile);

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PDF_CONTENT_TYPE = "application/pdf";

function cleanFilePart(value) {
  return String(value || "Form")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Form";
}

function normalizePayload(body = {}) {
  const items = Array.isArray(body.items)
    ? body.items.slice(0, 30).map((item) => ({
        description: item?.description || "",
        quantity: item?.quantity ?? "",
        released: item?.released ?? "",
        returned: item?.returned ?? "",
        unreturned: item?.unreturned ?? "",
        remarks: item?.remarks || "",
      }))
    : [];

  return {
    laboratory: body.laboratory || "CTHM",
    dateTime: body.dateTime || "",
    controlNo: body.controlNo || "",
    department: body.department || "",
    returnDate: body.returnDate || "",
    items,
  };
}

function validatePayload(data) {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    return "At least one borrowing item is required.";
  }

  if (data.items.length > 30) {
    return "A maximum of 30 items can be placed on the official form.";
  }

  return "";
}

async function convertDocxToPdf(docxBuffer, controlNo) {
  const tempRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "loa-borrower-")
  );

  const safeControlNo = cleanFilePart(controlNo);
  const docxPath = path.join(
    tempRoot,
    `Borrowers-Form-${safeControlNo}.docx`
  );

  try {
    await fs.promises.writeFile(docxPath, docxBuffer);

    await execFileAsync(
      "libreoffice",
      [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        tempRoot,
        docxPath,
      ],
      {
        timeout: 120000,
        windowsHide: true,
      }
    );

    const pdfPath = path.join(
      tempRoot,
      `Borrowers-Form-${safeControlNo}.pdf`
    );

    if (!fs.existsSync(pdfPath)) {
      throw new Error(
        "LibreOffice did not produce the Borrower's Form PDF."
      );
    }

    return await fs.promises.readFile(pdfPath);
  } finally {
    await fs.promises.rm(tempRoot, {
      recursive: true,
      force: true,
    });
  }
}

router.post("/", async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = validatePayload(payload);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    // IMPORTANT: generator is async, so it MUST be awaited.
    const docxBuffer = await generateBorrowerForm(
      payload
    );

    const filename =
      `Borrowers-Form-${cleanFilePart(
        payload.controlNo
      )}.docx`;

    res.status(200);
    res.setHeader(
      "Content-Type",
      DOCX_CONTENT_TYPE
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader(
      "Content-Length",
      String(docxBuffer.length)
    );
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.send(docxBuffer);
  } catch (error) {
    console.error(
      "Borrower's Form generation error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to generate Borrower's Form.",
      error: error.message,
    });
  }
});

/*
 * Exact visual preview:
 * DOCX -> LibreOffice -> PDF.
 * This is deliberately separate from the DOCX download route.
 * It keeps Word's floating header objects, logo placement,
 * tables, margins, and page layout instead of approximating them
 * with a browser DOCX renderer.
 */
router.post("/preview", async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = validatePayload(payload);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    const docxBuffer = await generateBorrowerForm(
      payload
    );

    const pdfBuffer =
      await convertDocxToPdf(
        docxBuffer,
        payload.controlNo ||
          crypto.randomUUID()
      );

    res.status(200);
    res.setHeader(
      "Content-Type",
      PDF_CONTENT_TYPE
    );
    res.setHeader(
      "Content-Disposition",
      "inline; filename=\"Borrowers-Form-Preview.pdf\""
    );
    res.setHeader(
      "Content-Length",
      String(pdfBuffer.length)
    );
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.send(pdfBuffer);
  } catch (error) {
    console.error(
      "Borrower's Form PDF preview error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to create the official Borrower's Form preview.",
      error: error.message,
    });
  }
});

module.exports = router;
