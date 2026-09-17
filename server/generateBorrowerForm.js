const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

function generateBorrowerForm(data) {
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

  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error(
      "word/document.xml not found in DOCX template."
    );
  }

  let documentXml = documentFile.asText();

  // ============================================================
  // HEADER FIELDS
  // ============================================================

  documentXml = documentXml.replace(
    "{{laboratory}}",
    escapeXml(data.laboratory || "")
  );

  documentXml = documentXml.replace(
    "{{dateTime}}",
    escapeXml(data.dateTime || "")
  );

  documentXml = documentXml.replace(
    "{{controlNo}}",
    escapeXml(data.controlNo || "")
  );

  // ============================================================
  // ITEM TABLE
  // ============================================================

  const items = Array.isArray(data.items)
    ? data.items
    : [];

  documentXml = fillItemRows(
    documentXml,
    items
  );

  zip.file(
    "word/document.xml",
    documentXml
  );

  return zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}


// ============================================================
// FILL ITEM ROWS
// ============================================================

function fillItemRows(documentXml, items) {
  const rowRegex =
    /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;

  documentXml = documentXml.replace(
    rowRegex,
    (rowXml) => {
      const cells = rowXml.match(
        /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g
      );

      // Official table must have 7 columns:
      //
      // NO.
      // DESCRIPTION
      // QTY
      // RELEASED
      // RETURNED
      // UNRETURNED
      // REMARKS

      if (!cells || cells.length !== 7) {
        return rowXml;
      }

      // ----------------------------------------------------------
      // Detect row number
      // ----------------------------------------------------------

      const rowText =
        extractText(cells[0]).trim();

      const rowNumber =
        Number(rowText);

      if (
        !Number.isInteger(rowNumber) ||
        rowNumber < 1 ||
        rowNumber > 30
      ) {
        return rowXml;
      }

      // ----------------------------------------------------------
      // Get corresponding item
      // ----------------------------------------------------------

      const item =
        items[rowNumber - 1];

      if (!item) {
        return rowXml;
      }

      // ----------------------------------------------------------
      // Values for columns 2–7
      // ----------------------------------------------------------

      const values = [
        null,

        item.description ?? "",

        item.quantity ?? "",

        item.released ?? "",

        item.returned ?? "",

        item.unreturned ?? "",

        item.remarks ?? "",
      ];

      // ----------------------------------------------------------
      // Replace cells
      // ----------------------------------------------------------

      for (let i = 1; i <= 6; i++) {
        cells[i] =
          putTextIntoCell(
            cells[i],
            values[i],
            true
          );
      }

      // ----------------------------------------------------------
      // Rebuild row using original cells
      // ----------------------------------------------------------

      let cellIndex = 0;

      const newRowXml =
        rowXml.replace(
          /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g,
          () => {
            const cell =
              cells[cellIndex];

            cellIndex++;

            return cell;
          }
        );

      return newRowXml;
    }
  );

  return documentXml;
}


// ============================================================
// PUT TEXT INTO CELL
// ============================================================

function putTextIntoCell(
  cellXml,
  value,
  center = false
) {
  const safeValue =
    escapeXml(value);

  // ----------------------------------------------------------
  // CENTER PARAGRAPH
  // ----------------------------------------------------------

  if (center) {
    cellXml =
      centerCellParagraph(
        cellXml
      );
  }

  // ----------------------------------------------------------
  // Existing text node
  // ----------------------------------------------------------

  const textRegex =
    /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/;

  if (textRegex.test(cellXml)) {
    return cellXml.replace(
      textRegex,
      (oldText) => {
        const openingTagMatch =
          oldText.match(
            /^<w:t(?:\s[^>]*)?>/
          );

        const openingTag =
          openingTagMatch
            ? openingTagMatch[0]
            : "<w:t>";

        return (
          openingTag +
          safeValue +
          "</w:t>"
        );
      }
    );
  }

  // ----------------------------------------------------------
  // No existing text node
  // ----------------------------------------------------------

  const paragraphRegex =
    /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/;

  const paragraphMatch =
    cellXml.match(
      paragraphRegex
    );

  if (!paragraphMatch) {
    return cellXml;
  }

  const paragraph =
    paragraphMatch[0];

  let runProperties = "";

  const existingRun =
    paragraph.match(
      /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/
    );

  if (existingRun) {
    const rPrMatch =
      existingRun[0].match(
        /<w:rPr[\s\S]*?<\/w:rPr>/
      );

    if (rPrMatch) {
      runProperties =
        rPrMatch[0];
    }
  }

  const newRun =
    "<w:r>" +
    runProperties +
    "<w:t>" +
    safeValue +
    "</w:t>" +
    "</w:r>";

  const newParagraph =
    paragraph.replace(
      "</w:p>",
      newRun +
      "</w:p>"
    );

  return cellXml.replace(
    paragraph,
    newParagraph
  );
}


// ============================================================
// CENTER CELL PARAGRAPH
// ============================================================

function centerCellParagraph(cellXml) {
  const paragraphRegex =
    /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;

  return cellXml.replace(
    paragraphRegex,
    (paragraphXml) => {
      // --------------------------------------------------------
      // If paragraph properties already exist
      // --------------------------------------------------------

      if (/<w:pPr[\s\S]*?<\/w:pPr>/.test(paragraphXml)) {
        return paragraphXml.replace(
          /<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/,
          (pPrXml) => {
            // Remove existing justification
            let newPPr =
              pPrXml.replace(
                /<w:jc[^>]*\/>/g,
                ""
              );

            newPPr =
              newPPr.replace(
                /<w:jc[^>]*>[\s\S]*?<\/w:jc>/g,
                ""
              );

            // Add center alignment
            newPPr =
              newPPr.replace(
                "</w:pPr>",
                '<w:jc w:val="center"/></w:pPr>'
              );

            return newPPr;
          }
        );
      }

      // --------------------------------------------------------
      // No paragraph properties
      // --------------------------------------------------------

      return paragraphXml.replace(
        /<w:p(?:\s[^>]*)?>/,
        (openingTag) =>
          openingTag +
          '<w:pPr><w:jc w:val="center"/></w:pPr>'
      );
    }
  );
}


// ============================================================
// EXTRACT TEXT
// ============================================================

function extractText(cellXml) {
  const textMatches =
    cellXml.match(
      /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    );

  if (!textMatches) {
    return "";
  }

  return textMatches
    .map((textNode) => {
      return textNode
        .replace(
          /^<w:t(?:\s[^>]*)?>/,
          ""
        )
        .replace(
          /<\/w:t>$/,
          ""
        );
    })
    .join("");
}


// ============================================================
// XML ESCAPE
// ============================================================

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