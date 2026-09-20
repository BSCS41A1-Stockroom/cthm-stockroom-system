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

  documentXml =
    beforeBody +
    updatedBody +
    afterBody;

  zip.file("word/document.xml", documentXml);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6,
    },
  });
}

module.exports = generateBorrowerForm;
