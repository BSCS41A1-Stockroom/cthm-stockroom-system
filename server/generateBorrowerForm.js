"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const TEMPLATE_PATH = path.join(
  __dirname,
  "templates",
  "LOA-Borrowers-Form.docx"
);

/* ============================================================
 * BASIC XML HELPERS
 * ============================================================
 */

function clean(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function escapeXml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getTextNodes(xml) {
  return (
    xml.match(
      /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g
    ) || []
  );
}

function getTextFromNode(textNode) {
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

function getTextOpeningTag(textNode) {
  const match = textNode.match(
    /^<w:t(?:\s[^>]*)?>/
  );

  return match ? match[0] : "<w:t>";
}

function textFromParagraph(paragraphXml) {
  return getTextNodes(paragraphXml)
    .map(getTextFromNode)
    .join("");
}

function extractText(xml) {
  return getTextNodes(xml)
    .map(getTextFromNode)
    .join("");
}

/* ============================================================
 * REPLACE TEXT INSIDE EXISTING WORD PARAGRAPH
 *
 * This keeps the existing Word runs/formatting whenever possible.
 * It does NOT create a new form or rebuild the document.
 * ============================================================
 */

function replaceTokenInParagraph(
  paragraphXml,
  token,
  value
) {
  const nodeRegex =
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g;

  const nodes = [];
  let match;

  while ((match = nodeRegex.exec(paragraphXml))) {
    nodes.push({
      start: match.index,
      end: nodeRegex.lastIndex,
      xml: match[0],
      text: getTextFromNode(match[0]),
      openTag: getTextOpeningTag(match[0]),
    });
  }

  if (!nodes.length) {
    return paragraphXml;
  }

  const combinedText = nodes
    .map((node) => node.text)
    .join("");

  const tokenIndex = combinedText.indexOf(token);

  if (tokenIndex < 0) {
    return paragraphXml;
  }

  const replacement = escapeXml(value);

  let combinedCursor = 0;
  let replacementInserted = false;

  const updatedNodes = nodes.map((node) => {
    const nodeStart = combinedCursor;
    const nodeEnd =
      combinedCursor + node.text.length;

    combinedCursor = nodeEnd;

    const overlapStart = Math.max(
      tokenIndex,
      nodeStart
    );

    const overlapEnd = Math.min(
      tokenIndex + token.length,
      nodeEnd
    );

    if (overlapStart >= overlapEnd) {
      return node.xml;
    }

    const localStart =
      overlapStart - nodeStart;

    const localEnd =
      overlapEnd - nodeStart;

    let newText =
      node.text.slice(0, localStart) +
      node.text.slice(localEnd);

    /*
     * Put the replacement into the first text node
     * that overlaps the token.
     */
    if (!replacementInserted) {
      newText =
        node.text.slice(0, localStart) +
        replacement +
        node.text.slice(localEnd);

      replacementInserted = true;
    }

    return (
      node.openTag +
      newText +
      "</w:t>"
    );
  });

  let result = "";
  let lastIndex = 0;

  nodes.forEach((node, index) => {
    result += paragraphXml.slice(
      lastIndex,
      node.start
    );

    result += updatedNodes[index];

    lastIndex = node.end;
  });

  result += paragraphXml.slice(lastIndex);

  return result;
}

function replacePlaceholder(
  bodyXml,
  token,
  value
) {
  const paragraphs =
    /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

  return bodyXml.replace(
    paragraphs,
    (paragraph) =>
      replaceTokenInParagraph(
        paragraph,
        token,
        value
      )
  );
}

/* ============================================================
 * UNDERLINE FIELDS
 *
 * Existing template contains fields such as:
 *
 * Department/Program: ______________________
 * Intended Date of Return: __________________
 *
 * Only the underline text is replaced.
 * ============================================================
 */

function replaceUnderlineField(
  bodyXml,
  label,
  value
) {
  const paragraphs =
    /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

  const safeValue = escapeXml(value);

  return bodyXml.replace(
    paragraphs,
    (paragraph) => {
      const visibleText =
        textFromParagraph(paragraph);

      if (!visibleText.includes(label)) {
        return paragraph;
      }

      if (!/_{3,}/.test(visibleText)) {
        return paragraph;
      }

      return paragraph.replace(
        /_{3,}/g,
        safeValue
      );
    }
  );
}

/* ============================================================
 * TABLE CELL HELPERS
 * ============================================================
 */

function cellText(cellXml) {
  return getTextNodes(cellXml)
    .map(getTextFromNode)
    .join("")
    .trim();
}

function setCellText(cellXml, value) {
  const safeValue = escapeXml(value);

  const textNodeRegex =
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g;

  const textNodes = [
    ...cellXml.matchAll(textNodeRegex),
  ];

  if (textNodes.length) {
    let first = true;

    return cellXml.replace(
      textNodeRegex,
      (node) => {
        if (!first) {
          return "<w:t></w:t>";
        }

        first = false;

        const openEnd =
          node.indexOf(">") + 1;

        const openTag =
          node.slice(0, openEnd);

        return (
          openTag +
          safeValue +
          "</w:t>"
        );
      }
    );
  }

  const paragraphMatch =
    cellXml.match(
      /<w:p\b[^>]*>[\s\S]*?<\/w:p>/
    );

  if (!paragraphMatch) {
    return cellXml;
  }

  const paragraph =
    paragraphMatch[0];

  const run =
    '<w:r>' +
    '<w:t xml:space="preserve">' +
    safeValue +
    "</w:t>" +
    "</w:r>";

  const updatedParagraph =
    paragraph.replace(
      /<\/w:p>$/,
      run + "</w:p>"
    );

  return cellXml.replace(
    paragraph,
    updatedParagraph
  );
}

/* ============================================================
 * EXISTING ITEM ROWS
 *
 * The official template already contains item rows.
 *
 * Expected:
 *
 * Column 1 = number
 * Column 2 = description
 * Column 3 = quantity
 * Column 4 = released
 * Column 5 = returned
 * Column 6 = unreturned
 * Column 7 = remarks
 *
 * Rows 1-30 are populated.
 * No new rows are created.
 * ============================================================
 */

function fillExistingItemRows(
  bodyXml,
  items
) {
  const rows =
    /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;

  return bodyXml.replace(
    rows,
    (rowXml) => {
      const cells = [
        ...rowXml.matchAll(
          /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g
        ),
      ];

      if (cells.length !== 7) {
        return rowXml;
      }

      const rowNumber =
        cellText(cells[0][0]);

      const number =
        Number(rowNumber);

      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 30
      ) {
        return rowXml;
      }

      const item =
        items[number - 1];

      if (!item) {
        return rowXml;
      }

      const values = [
        String(number),
        item.description ?? "",
        item.quantity ?? "",
        item.released ?? "",
        item.returned ?? "",
        item.unreturned ?? "",
        item.remarks ?? "",
      ];

      let updatedRow = rowXml;

      const originalCells =
        cells.map((entry) => entry[0]);

      originalCells.forEach(
        (cell, index) => {
          updatedRow =
            updatedRow.replace(
              cell,
              setCellText(
                cell,
                values[index]
              )
            );
        }
      );

      return updatedRow;
    }
  );
}

/* ============================================================
 * PROFESSOR AUTHORIZATION SIGNATURE
 * ============================================================
 */

function fillProfessorAuthorization(
  documentXml,
  zip,
  data
) {
  const relationshipId =
    "rIdProfessorAuthorizationSignature";

  const extension =
    data.professorSignatureMime ===
    "image/jpeg"
      ? "jpg"
      : "png";

  const mediaName =
    `professor-authorization-signature.${extension}`;

  zip.file(
    `word/media/${mediaName}`,
    data.professorSignature
  );

  const relationshipsPath =
    "word/_rels/document.xml.rels";

  const relationships =
    zip.file(
      relationshipsPath
    )?.asText();

  if (!relationships) {
    throw new Error(
      "DOCX relationships file is missing."
    );
  }

  const relationshipXml =
    `<Relationship ` +
    `Id="${relationshipId}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="media/${mediaName}"/>`;

  if (
    !relationships.includes(
      `Id="${relationshipId}"`
    )
  ) {
    zip.file(
      relationshipsPath,
      relationships.replace(
        "</Relationships>",
        relationshipXml +
          "</Relationships>"
      )
    );
  }

  const contentTypesPath =
    "[Content_Types].xml";

  let contentTypes =
    zip.file(
      contentTypesPath
    )?.asText();

  if (!contentTypes) {
    throw new Error(
      "DOCX content types file is missing."
    );
  }

  const extensionPattern =
    new RegExp(
      `<Default\\s+Extension="${extension}"`,
      "i"
    );

  if (
    !extensionPattern.test(
      contentTypes
    )
  ) {
    const contentType =
      extension === "jpg"
        ? "image/jpeg"
        : "image/png";

    contentTypes =
      contentTypes.replace(
        "</Types>",
        `<Default Extension="${extension}" ContentType="${contentType}"/>` +
          "</Types>"
      );

    zip.file(
      contentTypesPath,
      contentTypes
    );
  }

  const signedLine =
    `${clean(data.professorName)} | ${clean(
      data.authorizedAt || ""
    )}`;

  const drawing =
    createSignatureDrawing({
      relationshipId,
      documentId: 9001,
      name: "Professor Signature",
      title: "Professor Signature",
      signedLine,
    });

  const rows =
    documentXml.match(
      /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g
    ) || [];

  const captionIndex =
    rows.findIndex((row) =>
      /Instructor\s*\/?\s*Department Head Signature/i.test(
        extractText(row)
      )
    );

  if (captionIndex < 1) {
    return documentXml;
  }

  const signatureRow =
    rows[captionIndex - 1];

  const cells =
    signatureRow.match(
      /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g
    ) || [];

  if (cells.length < 2) {
    return documentXml;
  }

  const targetCell =
    cells[cells.length - 1];

  const signedCell =
    targetCell
      .replace(
        /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,
        ""
      )
      .replace(
        /<\/w:tc>$/,
        drawing + "</w:tc>"
      );

  const signedRow =
    signatureRow.replace(
      targetCell,
      signedCell
    );

  return documentXml.replace(
    signatureRow,
    signedRow
  );
}

/* ============================================================
 * CUSTODIAN / TRANSACTION SIGNATURE
 * ============================================================
 */

function fillCustodianAuthorization(
  documentXml,
  zip,
  authorization
) {
  const relationshipId =
    `rIdCustodian${authorization.kind}Signature`;

  const extension =
    authorization.mimeType === "image/jpeg"
      ? "jpg"
      : "png";

  const mediaName =
    `custodian-${authorization.kind}-signature.${extension}`;

  zip.file(
    `word/media/${mediaName}`,
    authorization.signature
  );

  const relationshipsPath =
    "word/_rels/document.xml.rels";

  const relationships =
    zip.file(
      relationshipsPath
    )?.asText();

  if (!relationships) {
    throw new Error(
      "DOCX relationships file is missing."
    );
  }

  const relationshipXml =
    `<Relationship ` +
    `Id="${relationshipId}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="media/${mediaName}"/>`;

  if (
    !relationships.includes(
      `Id="${relationshipId}"`
    )
  ) {
    zip.file(
      relationshipsPath,
      relationships.replace(
        "</Relationships>",
        relationshipXml +
          "</Relationships>"
      )
    );
  }

  const contentTypesPath =
    "[Content_Types].xml";

  let contentTypes =
    zip.file(
      contentTypesPath
    )?.asText();

  if (!contentTypes) {
    throw new Error(
      "DOCX content types file is missing."
    );
  }

  const extensionPattern =
    new RegExp(
      `<Default\\s+Extension="${extension}"`,
      "i"
    );

  if (
    !extensionPattern.test(
      contentTypes
    )
  ) {
    const contentType =
      extension === "jpg"
        ? "image/jpeg"
        : "image/png";

    contentTypes =
      contentTypes.replace(
        "</Types>",
        `<Default Extension="${extension}" ContentType="${contentType}"/>` +
          "</Types>"
      );

    zip.file(
      contentTypesPath,
      contentTypes
    );
  }

  const signedLine =
    `${clean(authorization.name)} | ${clean(
      authorization.signedAt || ""
    )}`;

  const drawing =
    createSignatureDrawing({
      relationshipId,
      documentId:
        authorization.documentId,
      name:
        `Custodian ${authorization.kind} Signature`,
      title:
        `Custodian ${authorization.kind} Signature`,
      signedLine,
    });

  const rows =
    documentXml.match(
      /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g
    ) || [];

  const matchingIndexes =
    rows
      .map(
        (row, index) =>
          authorization.caption.test(
            extractText(row)
          )
            ? index
            : -1
      )
      .filter(
        (index) => index >= 0
      );

  const captionIndex =
    matchingIndexes[
      authorization.rowOccurrence ?? 0
    ] ?? -1;

  if (captionIndex < 1) {
    return documentXml;
  }

  const captionCells =
    rows[captionIndex].match(
      /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g
    ) || [];

  const matchingCellIndexes =
    captionCells
      .map(
        (cell, index) =>
          authorization.caption.test(
            extractText(cell)
          )
            ? index
            : -1
      )
      .filter(
        (index) => index >= 0
      );

  const targetIndex =
    matchingCellIndexes[
      authorization.cellOccurrence ?? 0
    ] ?? -1;

  const signatureRow =
    rows[captionIndex - 1];

  const signatureCells =
    signatureRow.match(
      /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g
    ) || [];

  if (
    targetIndex < 0 ||
    !signatureCells[targetIndex]
  ) {
    return documentXml;
  }

  const targetCell =
    signatureCells[targetIndex];

  const signedCell =
    targetCell
      .replace(
        /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,
        ""
      )
      .replace(
        /<\/w:tc>$/,
        drawing + "</w:tc>"
      );

  const updatedRow =
    signatureRow.replace(
      targetCell,
      signedCell
    );

  return documentXml.replace(
    signatureRow,
    updatedRow
  );
}

/* ============================================================
 * SIGNATURE DRAWING
 * ============================================================
 */

function createSignatureDrawing({
  relationshipId,
  documentId,
  name,
  title,
  signedLine,
}) {
  return (
    `<w:p>` +
      `<w:pPr>` +
        `<w:spacing w:before="0" w:after="0"/>` +
        `<w:jc w:val="center"/>` +
      `</w:pPr>` +

      `<w:r>` +
        `<w:drawing>` +

          `<wp:inline ` +
            `distT="0" ` +
            `distB="0" ` +
            `distL="0" ` +
            `distR="0">` +

            `<wp:extent ` +
              `cx="1428750" ` +
              `cy="476250"/>` +

            `<wp:docPr ` +
              `id="${documentId}" ` +
              `name="${escapeXml(name)}"/>` +

            `<a:graphic ` +
              `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +

              `<a:graphicData ` +
                `uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +

                `<pic:pic ` +
                  `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +

                  `<pic:nvPicPr>` +
                    `<pic:cNvPr ` +
                      `id="0" ` +
                      `name="${escapeXml(name)}"/>` +
                    `<pic:cNvPicPr/>` +
                  `</pic:nvPicPr>` +

                  `<pic:blipFill>` +
                    `<a:blip ` +
                      `r:embed="${relationshipId}"/>` +
                    `<a:stretch>` +
                      `<a:fillRect/>` +
                    `</a:stretch>` +
                  `</pic:blipFill>` +

                  `<pic:spPr>` +
                    `<a:xfrm>` +
                      `<a:off x="0" y="0"/>` +
                      `<a:ext ` +
                        `cx="1428750" ` +
                        `cy="476250"/>` +
                    `</a:xfrm>` +

                    `<a:prstGeom prst="rect">` +
                      `<a:avLst/>` +
                    `</a:prstGeom>` +
                  `</pic:spPr>` +

                `</pic:pic>` +

              `</a:graphicData>` +

            `</a:graphic>` +

          `</wp:inline>` +

        `</w:drawing>` +
      `</w:r>` +
    `</w:p>` +

    `<w:p>` +
      `<w:pPr>` +
        `<w:spacing w:before="0" w:after="0"/>` +
        `<w:jc w:val="center"/>` +
      `</w:pPr>` +

      `<w:r>` +
        `<w:rPr>` +
          `<w:sz w:val="18"/>` +
          `<w:szCs w:val="18"/>` +
        `</w:rPr>` +

        `<w:t>` +
          `${escapeXml(signedLine)}` +
        `</w:t>` +

      `</w:r>` +
    `</w:p>`
  );
}

/* ============================================================
 * MAIN GENERATOR
 *
 * IMPORTANT:
 * - Uses the existing official DOCX.
 * - Does not create a new document.
 * - Does not use LibreOffice.
 * - Only word/document.xml is changed.
 * ============================================================
 */

function generateBorrowerForm(data = {}) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(
      `Borrower's Form template not found: ${TEMPLATE_PATH}`
    );
  }

  const templateBuffer =
    fs.readFileSync(
      TEMPLATE_PATH
    );

  const zip =
    new PizZip(templateBuffer);

  const documentFile =
    zip.file(
      "word/document.xml"
    );

  if (!documentFile) {
    throw new Error(
      "Invalid Borrower's Form template: word/document.xml is missing."
    );
  }

  /*
   * Only document.xml is modified.
   *
   * Header, footer, media, styles,
   * relationships, settings, etc.
   * remain in the original DOCX.
   */
  let documentXml =
    documentFile.asText();

  const bodyStart =
    documentXml.indexOf(
      "<w:body"
    );

  const bodyOpenEnd =
    documentXml.indexOf(
      ">",
      bodyStart
    );

  const bodyEnd =
    documentXml.lastIndexOf(
      "</w:body>"
    );

  if (
    bodyStart < 0 ||
    bodyOpenEnd < 0 ||
    bodyEnd < 0
  ) {
    throw new Error(
      "Invalid Borrower's Form template: w:body was not found."
    );
  }

  const beforeBody =
    documentXml.slice(
      0,
      bodyOpenEnd + 1
    );

  const bodyXml =
    documentXml.slice(
      bodyOpenEnd + 1,
      bodyEnd
    );

  const afterBody =
    documentXml.slice(
      bodyEnd
    );

  /* ==========================================================
   * DATA
   * ==========================================================
   */

  const laboratory =
    clean(
      data.laboratory ||
        "CTHM"
    );

  const dateTime =
    clean(data.dateTime);

  const controlNo =
    clean(data.controlNo);

  const department =
    clean(data.department);

  const returnDate =
    clean(data.returnDate);

  const items =
    Array.isArray(data.items)
      ? data.items.slice(0, 30)
      : [];

  /* ==========================================================
   * EXISTING TEMPLATE FIELDS
   * ==========================================================
   */

  let updatedBody =
    bodyXml;

  updatedBody =
    replacePlaceholder(
      updatedBody,
      "{{laboratory}}",
      laboratory
    );

  updatedBody =
    replacePlaceholder(
      updatedBody,
      "{{dateTime}}",
      dateTime
    );

  updatedBody =
    replacePlaceholder(
      updatedBody,
      "{{controlNo}}",
      controlNo
    );

  updatedBody =
    replaceUnderlineField(
      updatedBody,
      "Department/Program:",
      department
    );

  updatedBody =
    replaceUnderlineField(
      updatedBody,
      "Intended Date of Return:",
      returnDate
    );

  /* ==========================================================
   * EXISTING ITEM TABLE
   * ==========================================================
   */

  updatedBody =
    fillExistingItemRows(
      updatedBody,
      items
    );

  documentXml =
    beforeBody +
    updatedBody +
    afterBody;

  /* ==========================================================
   * SIGNATURES
   * ==========================================================
   */

  if (
    data.professorSignature &&
    data.professorName
  ) {
    documentXml =
      fillProfessorAuthorization(
        documentXml,
        zip,
        data
      );
  }

  if (
    data.verifiedSignature &&
    data.verifiedName
  ) {
    documentXml =
      fillCustodianAuthorization(
        documentXml,
        zip,
        {
          kind: "verified",
          name:
            data.verifiedName,
          signedAt:
            data.verifiedAt,
          signature:
            data.verifiedSignature,
          mimeType:
            data.verifiedSignatureMime,
          caption:
            /Custodian Signature Over Printed Name/i,
          documentId: 9002,
        }
      );
  }

  if (
    data.approvedSignature &&
    data.approvedName
  ) {
    documentXml =
      fillCustodianAuthorization(
        documentXml,
        zip,
        {
          kind: "approved",
          name:
            data.approvedName,
          signedAt:
            data.approvedAt,
          signature:
            data.approvedSignature,
          mimeType:
            data.approvedSignatureMime,
          caption:
            /Custodian Department Head/i,
          documentId: 9003,
        }
      );
  }

  if (
    data.borrowerSignature &&
    data.borrowerName
  ) {
    documentXml =
      fillCustodianAuthorization(
        documentXml,
        zip,
        {
          kind: "borrower",
          name:
            data.borrowerName,
          signedAt:
            data.borrowerConsentedAt,
          signature:
            data.borrowerSignature,
          mimeType:
            data.borrowerSignatureMime,
          caption:
            /Borrowers Signature Over Printed Name/i,
          documentId: 9004,
        }
      );
  }

  if (
    data.releasedSignature &&
    data.releasedName
  ) {
    documentXml =
      fillCustodianAuthorization(
        documentXml,
        zip,
        {
          kind: "released",
          name:
            data.releasedName,
          signedAt:
            data.releasedAt,
          signature:
            data.releasedSignature,
          mimeType:
            data.releasedSignatureMime,
          caption:
            /Custodian Signature Over Printed Name/i,
          rowOccurrence: 1,
          cellOccurrence: 0,
          documentId: 9005,
        }
      );
  }

  if (
    data.returnedSignature &&
    data.returnedName
  ) {
    documentXml =
      fillCustodianAuthorization(
        documentXml,
        zip,
        {
          kind: "returned",
          name:
            data.returnedName,
          signedAt:
            data.returnedAt,
          signature:
            data.returnedSignature,
          mimeType:
            data.returnedSignatureMime,
          caption:
            /Custodian Signature Over Printed Name/i,
          rowOccurrence: 1,
          cellOccurrence: 1,
          documentId: 9006,
        }
      );
  }

  /* ==========================================================
   * PUT THE MODIFIED XML BACK INTO THE ORIGINAL DOCX
   * ==========================================================
   */

  zip.file(
    "word/document.xml",
    documentXml
  );

  /*
   * Return the original official template,
   * with only the requested data changes.
   */
  return zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

module.exports =
  generateBorrowerForm;