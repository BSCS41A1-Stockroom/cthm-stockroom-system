"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

/*
 * ============================================================
 * GENERATE BORROWER'S FORM
 * ============================================================
 *
 * IMPORTANT:
 *
 * This function NEVER creates a new form.
 *
 * It loads the official:
 *
 *     LOA-Borrowers-Form.docx
 *
 * and modifies ONLY the existing document.xml.
 *
 * The Word header, footer, logos, borders, tables, signatures,
 * spacing, and document structure are preserved.
 * ============================================================
 */

function generateBorrowerForm(data = {}) {
  const templatePath = path.join(
    __dirname,
    "templates",
    "LOA-Borrowers-Form.docx"
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const templateBuffer = fs.readFileSync(templatePath);

  const zip = new PizZip(templateBuffer);

  /*
   * ----------------------------------------------------------
   * ONLY MODIFY document.xml
   * ----------------------------------------------------------
   *
   * We intentionally DO NOT modify:
   *
   * word/header1.xml
   * word/footer*.xml
   * images
   * styles
   * relationships
   */

  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error(
      "word/document.xml not found in DOCX template."
    );
  }

  let documentXml = documentFile.asText();

  /*
   * ==========================================================
   * DATA
   * ==========================================================
   */

  const laboratory = clean(data.laboratory);
  const dateTime = clean(data.dateTime);
  const controlNo = clean(data.controlNo);

  const department = clean(data.department);
  const returnDate = clean(data.returnDate);

  const items = Array.isArray(data.items)
    ? data.items.slice(0, 30)
    : [];

  /*
   * ==========================================================
   * 1. EXISTING TEMPLATE PLACEHOLDERS
   * ==========================================================
   *
   * The official template contains:
   *
   * {{laboratory}}
   * {{dateTime}}
   * {{controlNo}}
   *
   * Replace ONLY those placeholders.
   *
   * No new paragraphs.
   * No new runs.
   * No new tables.
   * No new header.
   */

  documentXml = replacePlaceholder(
    documentXml,
    "{{laboratory}}",
    laboratory
  );

  documentXml = replacePlaceholder(
    documentXml,
    "{{dateTime}}",
    dateTime
  );

  documentXml = replacePlaceholder(
    documentXml,
    "{{controlNo}}",
    controlNo
  );

  /*
   * ==========================================================
   * 2. DEPARTMENT / PROGRAM
   * ==========================================================
   *
   * Existing template:
   *
   * Department/Program: _____________________________
   *
   * Replace ONLY the underline.
   */

  documentXml = replaceUnderlineField(
    documentXml,
    "Department/Program:",
    department
  );

  /*
   * ==========================================================
   * 3. INTENDED DATE OF RETURN
   * ==========================================================
   *
   * Existing template:
   *
   * Intended Date of Return: _____________________________
   *
   * Replace ONLY the underline.
   */

  documentXml = replaceUnderlineField(
    documentXml,
    "Intended Date of Return:",
    returnDate
  );

  /*
   * ==========================================================
   * 4. EXISTING ITEM TABLE
   * ==========================================================
   *
   * The template already contains rows 1-30.
   *
   * We only fill the existing rows.
   *
   * We NEVER create additional rows.
   */

  documentXml = fillExistingItemRows(
    documentXml,
    items
  );

  if (data.professorSignature && data.professorName) {
    documentXml = fillProfessorAuthorization(documentXml, zip, data);
  }
  if (data.verifiedSignature && data.verifiedName) {
    documentXml = fillCustodianAuthorization(documentXml, zip, {
      kind: "verified", name: data.verifiedName, signedAt: data.verifiedAt,
      signature: data.verifiedSignature, mimeType: data.verifiedSignatureMime,
      caption: /Custodian Signature Over Printed Name/i, documentId: 9002,
    });
  }
  if (data.approvedSignature && data.approvedName) {
    documentXml = fillCustodianAuthorization(documentXml, zip, {
      kind: "approved", name: data.approvedName, signedAt: data.approvedAt,
      signature: data.approvedSignature, mimeType: data.approvedSignatureMime,
      caption: /Custodian Department Head/i, documentId: 9003,
    });
  }
  if (data.releasedSignature && data.releasedName) {
    documentXml = fillCustodianAuthorization(documentXml, zip, {
      kind:"released",name:data.releasedName,signedAt:data.releasedAt,
      signature:data.releasedSignature,mimeType:data.releasedSignatureMime,
      caption:/Custodian Signature Over Printed Name/i,rowOccurrence:1,cellOccurrence:0,documentId:9004,
    });
  }
  if (data.returnedSignature && data.returnedName) {
    documentXml = fillCustodianAuthorization(documentXml, zip, {
      kind:"returned",name:data.returnedName,signedAt:data.returnedAt,
      signature:data.returnedSignature,mimeType:data.returnedSignatureMime,
      caption:/Custodian Signature Over Printed Name/i,rowOccurrence:1,cellOccurrence:1,documentId:9005,
    });
  }

  zip.file(
    "word/document.xml",
    documentXml
  );

  /*
   * ==========================================================
   * RETURN ORIGINAL TEMPLATE WITH ONLY DATA CHANGES
   * ==========================================================
   */

  return zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

/*
 * ============================================================
 * CLEAN
 * ============================================================
 */

function clean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/*
 * ============================================================
 * REPLACE PLACEHOLDER
 * ============================================================
 *
 * Example:
 *
 * {{laboratory}}
 *
 * becomes:
 *
 * CTHM
 *
 * We replace the placeholder inside the existing XML.
 *
 * We do NOT create a new Word run.
 * ============================================================
 */

function replacePlaceholder(
  documentXml,
  placeholder,
  value
) {
  const safeValue = escapeXml(value);

  /*
   * First try the normal case where the entire
   * placeholder exists inside one <w:t>.
   */

  const textNodeRegex =
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g;

  let changed = false;

  documentXml = documentXml.replace(
    textNodeRegex,
    (textNode) => {
      const text =
        getTextFromNode(textNode);

      if (!text.includes(placeholder)) {
        return textNode;
      }

      changed = true;

      const newText =
        text.replace(
          placeholder,
          safeValue
        );

      return (
        getTextOpeningTag(textNode) +
        newText +
        "</w:t>"
      );
    }
  );

  if (changed) {
    return documentXml;
  }

  return documentXml;
}

function fillProfessorAuthorization(documentXml, zip, data) {
  const relationshipId = "rIdProfessorAuthorizationSignature";
  const extension = data.professorSignatureMime === "image/jpeg" ? "jpg" : "png";
  const mediaName = `professor-authorization-signature.${extension}`;
  zip.file(`word/media/${mediaName}`, data.professorSignature);
  const relationshipsPath = "word/_rels/document.xml.rels";
  const relationships = zip.file(relationshipsPath)?.asText();
  if (!relationships) throw new Error("DOCX relationships file is missing.");
  zip.file(relationshipsPath, relationships.replace("</Relationships>",
    `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/></Relationships>`));
  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = zip.file(contentTypesPath)?.asText();
  if (!contentTypes) throw new Error("DOCX content types file is missing.");
  if (!new RegExp(`Extension="${extension}"`, "i").test(contentTypes)) {
    contentTypes = contentTypes.replace("</Types>", `<Default Extension="${extension}" ContentType="${extension === "jpg" ? "image/jpeg" : "image/png"}"/></Types>`);
    zip.file(contentTypesPath, contentTypes);
  }

  const signedLine = `${data.professorName} | ${data.authorizedAt || ""}`;
  const drawing = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1428750" cy="476250"/><wp:docPr id="9001" name="Professor Signature"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Professor Signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1428750" cy="476250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>${escapeXml(signedLine)}</w:t></w:r></w:p>`;

  // The template puts the signature line in the row immediately above the
  // Instructor/Department Head caption. Insert into that bordered cell so the
  // image and printed name sit on the line instead of below the caption.
  const rows = documentXml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
  const captionIndex = rows.findIndex((row) => /Instructor\/?\s*Department Head Signature/i.test(extractText(row)));
  if (captionIndex < 1) return documentXml;
  const signatureRow = rows[captionIndex - 1];
  const cells = signatureRow.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
  if (cells.length < 2) return documentXml;
  const targetCell = cells[cells.length - 1];
  const signedCell = targetCell.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, "").replace(/<\/w:tc>$/, `${drawing}</w:tc>`);
  const signedRow = signatureRow.replace(targetCell, signedCell);
  return documentXml.replace(signatureRow, signedRow);
}

function replaceUnderlineField(documentXml, label, value) {
  if (!value) return documentXml;
  const paragraphs = documentXml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
  const paragraph = paragraphs.find((entry) => extractText(entry).includes(label));
  if (!paragraph) return documentXml;
  let replaced = false;
  const updated = paragraph.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, (node) => {
    if (replaced) return node;
    const text = getTextFromNode(node);
    if (!/_{3,}/.test(text)) return node;
    replaced = true;
    return `${getTextOpeningTag(node)}${escapeXml(text.replace(/_{3,}/, value))}</w:t>`;
  });
  return replaced ? documentXml.replace(paragraph, updated) : documentXml;
}

function fillCustodianAuthorization(documentXml, zip, authorization) {
  const relationshipId = `rIdCustodian${authorization.kind}Signature`;
  const extension = authorization.mimeType === "image/jpeg" ? "jpg" : "png";
  const mediaName = `custodian-${authorization.kind}-signature.${extension}`;
  zip.file(`word/media/${mediaName}`, authorization.signature);
  const relationshipsPath = "word/_rels/document.xml.rels";
  const relationships = zip.file(relationshipsPath)?.asText();
  if (!relationships) throw new Error("DOCX relationships file is missing.");
  zip.file(relationshipsPath, relationships.replace("</Relationships>",
    `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/></Relationships>`));
  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = zip.file(contentTypesPath)?.asText();
  if (!contentTypes) throw new Error("DOCX content types file is missing.");
  if (!new RegExp(`Extension="${extension}"`, "i").test(contentTypes)) {
    contentTypes = contentTypes.replace("</Types>", `<Default Extension="${extension}" ContentType="${extension === "jpg" ? "image/jpeg" : "image/png"}"/></Types>`);
    zip.file(contentTypesPath, contentTypes);
  }
  const signedLine = `${authorization.name} | ${authorization.signedAt || ""}`;
  const drawing = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1428750" cy="476250"/><wp:docPr id="${authorization.documentId}" name="Custodian ${authorization.kind} Signature"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Custodian Signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1428750" cy="476250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>${escapeXml(signedLine)}</w:t></w:r></w:p>`;
  const rows = documentXml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
  const matches = rows.map((row,index) => authorization.caption.test(extractText(row)) ? index : -1).filter((index) => index >= 0);
  const captionIndex = matches[authorization.rowOccurrence ?? 0] ?? -1;
  if (captionIndex < 1) return documentXml;
  const captionCells = rows[captionIndex].match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
  const matchingCellIndexes = captionCells.map((cell,index) => authorization.caption.test(extractText(cell)) ? index : -1).filter((index) => index >= 0);
  const targetIndex = matchingCellIndexes[authorization.cellOccurrence ?? 0] ?? -1;
  const signatureRow = rows[captionIndex - 1];
  const signatureCells = signatureRow.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
  if (targetIndex < 0 || !signatureCells[targetIndex]) return documentXml;
  const targetCell = signatureCells[targetIndex];
  const signedCell = targetCell.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, "").replace(/<\/w:tc>$/, `${drawing}</w:tc>`);
  return documentXml.replace(signatureRow, signatureRow.replace(targetCell, signedCell));
}


// ============================================================
// FILL ITEM ROWS
// ============================================================

function fillExistingItemRows(
  documentXml,
  items
) {
  if (!items.length) {
    return documentXml;
  }

  const rowRegex =
    /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;

  return documentXml.replace(
    rowRegex,
    (rowXml) => {
      const cells =
        rowXml.match(
          /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g
        );

      /*
       * The official table has:
       *
       * NO.
       * DESCRIPTION
       * QTY
       * RELEASED
       * RETURNED
       * UNRETURNED
       * REMARKS
       *
       * = 7 cells
       */

      if (
        !cells ||
        cells.length !== 7
      ) {
        return rowXml;
      }

      /*
       * First cell contains row number.
       */

      const rowNumberText =
        extractText(
          cells[0]
        ).trim();

      const rowNumber =
        Number(rowNumberText);

      /*
       * Ignore:
       *
       * header row
       * terms and conditions
       * signature rows
       * footer
       * anything else
       */

      if (
        !Number.isInteger(
          rowNumber
        ) ||
        rowNumber < 1 ||
        rowNumber > 30
      ) {
        return rowXml;
      }

      /*
       * Only fill a row when there is
       * an item for that row.
       */

      const item =
        items[rowNumber - 1];

      if (!item) {
        return rowXml;
      }

      const values = [
        null,

        clean(
          item.description
        ),

        clean(
          item.quantity
        ),

        clean(
          item.released
        ),

        clean(
          item.returned
        ),

        clean(
          item.unreturned
        ),

        clean(
          item.remarks
        ),
      ];

      /*
       * Replace text in the existing cells.
       */

      for (
        let i = 1;
        i <= 6;
        i++
      ) {
        cells[i] =
          replaceFirstExistingText(
            cells[i],
            values[i]
          );
      }

      /*
       * Put the modified cells back into
       * the existing row.
       */

      let cellIndex = 0;

      return rowXml.replace(
        /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g,
        () => {
          return cells[
            cellIndex++
          ];
        }
      );
    }
  );
}

/*
 * ============================================================
 * REPLACE FIRST EXISTING TEXT
 * ============================================================
 *
 * IMPORTANT:
 *
 * No new <w:r>
 * No new <w:p>
 * No new <w:tc>
 *
 * We reuse the existing text node.
 * ============================================================
 */

function replaceFirstExistingText(
  cellXml,
  value
) {
  const safeValue =
    escapeXml(value);

  const textRegex =
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/;

  if (
    !textRegex.test(cellXml)
  ) {
    return cellXml;
  }

  return cellXml.replace(
    textRegex,
    (textNode) => {
      return (
        getTextOpeningTag(
          textNode
        ) +
        safeValue +
        "</w:t>"
      );
    }
  );
}

/*
 * ============================================================
 * GET TEXT NODES
 * ============================================================
 */

function getTextNodes(xml) {
  return (
    xml.match(
      /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g
    ) || []
  );
}

/*
 * ============================================================
 * GET TEXT FROM NODE
 * ============================================================
 */

function getTextFromNode(
  textNode
) {
  return textNode
    .replace(
      /^<w:t(?:\s[^>]*)?>/,
      ""
    )
    .replace(
      /<\/w:t>$/,
      ""
    );
}

/*
 * ============================================================
 * GET OPENING TEXT TAG
 * ============================================================
 */

function getTextOpeningTag(
  textNode
) {
  const match =
    textNode.match(
      /^<w:t(?:\s[^>]*)?>/
    );

  return match
    ? match[0]
    : "<w:t>";
}

/*
 * ============================================================
 * EXTRACT TEXT
 * ============================================================
 */

function extractText(xml) {
  return getTextNodes(xml)
    .map(
      getTextFromNode
    )
    .join("");
}

/*
 * ============================================================
 * ESCAPE XML
 * ============================================================
 */

function escapeXml(value) {
  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&apos;"
    );
}

module.exports =
  generateBorrowerForm;
