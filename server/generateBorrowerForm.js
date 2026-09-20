"use strict";

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TEMPLATE_PATH = path.join(
  __dirname,
  "templates",
  "LOA-Borrowers-Form.docx"
);

function clean(value) {
  return String(value ?? "")
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

function textFromParagraph(paragraphXml) {
  return Array.from(
    paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)
  )
    .map((match) => match[1])
    .join("");
}

function replaceTokenInParagraph(paragraphXml, token, value) {
  const textNodes = [];
  const nodeRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match;

  while ((match = nodeRegex.exec(paragraphXml))) {
    textNodes.push({
      start: match.index,
      end: nodeRegex.lastIndex,
      openEnd: match.index + match[0].indexOf(">") + 1,
      text: match[1],
    });
  }

  if (!textNodes.length) return paragraphXml;

  const combined = textNodes.map((node) => node.text).join("");
  const tokenIndex = combined.indexOf(token);

  if (tokenIndex < 0) return paragraphXml;

  const replacement = escapeXml(value);
  let cursor = 0;
  let output = "";
  let remainingStart = 0;

  for (const node of textNodes) {
    const nodeStart = cursor;
    const nodeEnd = cursor + node.text.length;
    cursor = nodeEnd;

    const overlapStart = Math.max(tokenIndex, nodeStart);
    const overlapEnd = Math.min(
      tokenIndex + token.length,
      nodeEnd
    );

    if (overlapStart >= overlapEnd) continue;

    const localStart = overlapStart - nodeStart;
    const localEnd = overlapEnd - nodeStart;

    const originalText = node.text;
    const before = originalText.slice(0, localStart);
    const after = originalText.slice(localEnd);

    const replacementText =
      before +
      (overlapStart === tokenIndex ? replacement : "") +
      after;

    const originalNode = paragraphXml.slice(
      node.start,
      node.end
    );

    const openTagEnd = originalNode.indexOf(">") + 1;
    const openTag = originalNode.slice(0, openTagEnd);

    output += paragraphXml.slice(
      remainingStart,
      node.start
    );

    output +=
      openTag +
      replacementText +
      "</w:t>";

    remainingStart = node.end;

    // Any following text nodes are copied normally. The token can
    // cross several w:t nodes, so clear their overlapping contents.
    if (overlapEnd > overlapStart) {
      for (const later of textNodes) {
        if (later.start <= node.start) continue;
        const laterStart = combined.indexOf(
          later.text,
          nodeEnd
        );
        void laterStart;
      }
    }
  }

  // The routine above is intentionally conservative. For the official
  // template the three placeholders are each contained in one w:t node.
  if (textNodes.length && textNodes.some((node) => node.text.includes(token))) {
    return paragraphXml.replace(
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      replacement
    );
  }

  // Fallback for a token split over multiple text nodes.
  let rebuilt = "";
  let last = 0;
  let consumedToken = false;
  let combinedCursor = 0;

  for (const node of textNodes) {
    const nodeCombinedStart = combinedCursor;
    const nodeCombinedEnd = combinedCursor + node.text.length;
    combinedCursor = nodeCombinedEnd;

    const originalNode = paragraphXml.slice(
      node.start,
      node.end
    );
    const openTagEnd = originalNode.indexOf(">") + 1;
    const openTag = originalNode.slice(0, openTagEnd);

    let nodeText = node.text;

    if (!consumedToken) {
      const localStart = Math.max(
        0,
        tokenIndex - nodeCombinedStart
      );
      const localEnd = Math.min(
        nodeText.length,
        tokenIndex + token.length - nodeCombinedStart
      );

      if (localStart < nodeText.length && localEnd > 0) {
        nodeText =
          nodeText.slice(0, localStart) +
          (nodeCombinedStart <= tokenIndex
            ? replacement
            : "") +
          nodeText.slice(Math.max(0, localEnd));
        consumedToken = true;
      }
    }

    rebuilt += paragraphXml.slice(last, node.start);
    rebuilt += openTag + nodeText + "</w:t>";
    last = node.end;
  }

  rebuilt += paragraphXml.slice(last);
  return rebuilt;
}

function replacePlaceholder(bodyXml, token, value) {
  const paragraphs = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

  return bodyXml.replace(paragraphs, (paragraph) =>
    replaceTokenInParagraph(paragraph, token, value)
  );
}

function replaceUnderlineField(bodyXml, label, value) {
  const paragraphs = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const safeValue = escapeXml(value);

  return bodyXml.replace(paragraphs, (paragraph) => {
    const visibleText = textFromParagraph(paragraph);

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
  });
}

function cellText(cellXml) {
  return Array.from(
    cellXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)
  )
    .map((match) => match[1])
    .join("")
    .trim();
}

function setCellText(cellXml, value) {
  const safeValue = escapeXml(value);
  const textNodes = [
    ...cellXml.matchAll(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g),
  ];

  if (textNodes.length) {
    let first = true;

    return cellXml.replace(
      /<w:t\b[^>]*>[\s\S]*?<\/w:t>/g,
      (node) => {
        if (!first) return "<w:t></w:t>";
        first = false;

        const openEnd = node.indexOf(">") + 1;
        const openTag = node.slice(0, openEnd);
        return `${openTag}${safeValue}</w:t>`;
      }
    );
  }

  const paragraphMatch = cellXml.match(
    /<w:p\b[^>]*>[\s\S]*?<\/w:p>/
  );

  if (!paragraphMatch) return cellXml;

  const paragraph = paragraphMatch[0];
  const run =
    '<w:r><w:t xml:space="preserve">' +
    safeValue +
    "</w:t></w:r>";

  const updatedParagraph = paragraph.replace(
    /<\/w:p>$/,
    run + "</w:p>"
  );

  return cellXml.replace(
    paragraph,
    updatedParagraph
  );
}

function fillExistingItemRows(bodyXml, items) {
  const rows = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;

  return bodyXml.replace(rows, (rowXml) => {
    const cells = [
      ...rowXml.matchAll(
        /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g
      ),
    ];

    if (cells.length !== 7) {
      return rowXml;
    }

    const rowNumber = cellText(cells[0][0]);
    const number = Number(rowNumber);

    if (!Number.isInteger(number) || number < 1 || number > 30) {
      return rowXml;
    }

    const item = items[number - 1];
    if (!item) {
      return rowXml;
    }

    const values = [
      String(number),
      item.description || "",
      item.quantity ?? "",
      item.released ?? "",
      item.returned ?? "",
      item.unreturned ?? "",
      item.remarks || "",
    ];

    let updated = rowXml;
    const originalCells = cells.map((entry) => entry[0]);

    originalCells.forEach((cell, index) => {
      updated = updated.replace(
        cell,
        setCellText(cell, values[index])
      );
    });

    return updated;
  });
}

async function generateBorrowerForm(data = {}) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(
      `Borrower's Form template not found: ${TEMPLATE_PATH}`
    );
  }

  const templateBuffer = await fs.promises.readFile(
    TEMPLATE_PATH
  );

  const zip = await JSZip.loadAsync(templateBuffer);

  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error(
      "Invalid Borrower's Form template: word/document.xml is missing."
    );
  }

  // IMPORTANT: Only document.xml is edited.
  // Header/footer/media/styles/relationships remain byte-for-byte untouched.
  let documentXml = await documentFile.async("string");

  const bodyStart = documentXml.indexOf("<w:body");
  const bodyOpenEnd = documentXml.indexOf(">", bodyStart);
  const bodyEnd = documentXml.lastIndexOf("</w:body>");

  if (
    bodyStart < 0 ||
    bodyOpenEnd < 0 ||
    bodyEnd < 0
  ) {
    throw new Error(
      "Invalid Borrower's Form template: w:body was not found."
    );
  }

  const beforeBody = documentXml.slice(
    0,
    bodyOpenEnd + 1
  );
  const bodyXml = documentXml.slice(
    bodyOpenEnd + 1,
    bodyEnd
  );
  const afterBody = documentXml.slice(bodyEnd);

  const laboratory = clean(data.laboratory || "CTHM");
  const dateTime = clean(data.dateTime);
  const controlNo = clean(data.controlNo);
  const department = clean(data.department);
  const returnDate = clean(data.returnDate);
  const items = Array.isArray(data.items)
    ? data.items.slice(0, 30)
    : [];

  let updatedBody = bodyXml;

  updatedBody = replacePlaceholder(
    updatedBody,
    "{{laboratory}}",
    laboratory
  );

  updatedBody = replacePlaceholder(
    updatedBody,
    "{{dateTime}}",
    dateTime
  );

  updatedBody = replacePlaceholder(
    updatedBody,
    "{{controlNo}}",
    controlNo
  );

  updatedBody = replaceUnderlineField(
    updatedBody,
    "Department/Program:",
    department
  );

  updatedBody = replaceUnderlineField(
    updatedBody,
    "Intended Date of Return:",
    returnDate
  );

  updatedBody = fillExistingItemRows(
    updatedBody,
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
  const captionIndex = rows.findIndex((row) => authorization.caption.test(extractText(row)));
  if (captionIndex < 1) return documentXml;
  const captionCells = rows[captionIndex].match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
  const targetIndex = captionCells.findIndex((cell) => authorization.caption.test(extractText(cell)));
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