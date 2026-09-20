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

  /*
   * ==========================================================
   * SAVE DOCUMENT XML
   * ==========================================================
   */

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

  /*
   * ----------------------------------------------------------
   * FALLBACK
   * ----------------------------------------------------------
   *
   * Word can sometimes split a placeholder across runs.
   *
   * Example:
   *
   * {{labora
   * tory}}
   *
   * If that happens, handle the paragraph without
   * rebuilding the paragraph structure.
   */

  return replaceSplitPlaceholder(
    documentXml,
    placeholder,
    safeValue
  );
}

/*
 * ============================================================
 * SPLIT PLACEHOLDER
 * ============================================================
 */

function replaceSplitPlaceholder(
  documentXml,
  placeholder,
  safeValue
) {
  const paragraphRegex =
    /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;

  return documentXml.replace(
    paragraphRegex,
    (paragraphXml) => {
      const textNodes =
        getTextNodes(paragraphXml);

      if (!textNodes.length) {
        return paragraphXml;
      }

      const combinedText =
        textNodes
          .map(getTextFromNode)
          .join("");

      const placeholderIndex =
        combinedText.indexOf(
          placeholder
        );

      if (placeholderIndex === -1) {
        return paragraphXml;
      }

      /*
       * We rebuild ONLY the text contents of the
       * existing text nodes.
       *
       * The runs, run properties, paragraph,
       * borders, alignment, etc. remain untouched.
       */

      let position = 0;
      let replacementDone = false;

      return paragraphXml.replace(
        /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g,
        (textNode) => {
          const currentText =
            getTextFromNode(textNode);

          const nodeStart = position;
          const nodeEnd =
            position + currentText.length;

          position = nodeEnd;

          /*
           * Before placeholder.
           */

          if (
            nodeEnd <=
            placeholderIndex
          ) {
            return textNode;
          }

          /*
           * Already replaced.
           */

          if (replacementDone) {
            const placeholderEnd =
              placeholderIndex +
              placeholder.length;

            if (
              nodeStart <
              placeholderEnd
            ) {
              return (
                getTextOpeningTag(
                  textNode
                ) +
                "" +
                "</w:t>"
              );
            }

            return textNode;
          }

          const placeholderEnd =
            placeholderIndex +
            placeholder.length;

          /*
           * This text node contains the beginning
           * of the placeholder.
           */

          if (
            nodeStart <
              placeholderEnd &&
            nodeEnd >
              placeholderIndex
          ) {
            const localStart =
              Math.max(
                0,
                placeholderIndex -
                  nodeStart
              );

            const localEnd =
              Math.min(
                currentText.length,
                placeholderEnd -
                  nodeStart
              );

            const before =
              currentText.substring(
                0,
                localStart
              );

            const after =
              currentText.substring(
                localEnd
              );

            replacementDone = true;

            return (
              getTextOpeningTag(
                textNode
              ) +
              before +
              safeValue +
              after +
              "</w:t>"
            );
          }

          return textNode;
        }
      );
    }
  );
}

/*
 * ============================================================
 * REPLACE UNDERLINE FIELD
 * ============================================================
 *
 * Example:
 *
 * Department/Program:
 * _____________________________
 *
 * becomes:
 *
 * Department/Program:
 * CTHM
 *
 * Only the existing underscore text is replaced.
 * ============================================================
 */

function replaceUnderlineField(
  documentXml,
  label,
  value
) {
  /*
   * Do not modify anything when no value was supplied.
   */

  if (!value) {
    return documentXml;
  }

  const safeValue =
    escapeXml(value);

  const paragraphRegex =
    /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;

  return documentXml.replace(
    paragraphRegex,
    (paragraphXml) => {
      const paragraphText =
        extractText(paragraphXml);

      if (
        !paragraphText.includes(label)
      ) {
        return paragraphXml;
      }

      /*
       * Only replace underscores.
       */

      return paragraphXml.replace(
        /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g,
        (textNode) => {
          const text =
            getTextFromNode(
              textNode
            );

          if (!/_{3,}/.test(text)) {
            return textNode;
          }

          const newText =
            text.replace(
              /_{3,}/,
              safeValue
            );

          return (
            getTextOpeningTag(
              textNode
            ) +
            newText +
            "</w:t>"
          );
        }
      );
    }
  );
}

/*
 * ============================================================
 * EXISTING ITEM ROWS
 * ============================================================
 *
 * Template:
 *
 * 1
 * 2
 * 3
 * ...
 * 30
 *
 * We only fill existing rows.
 * ============================================================
 */

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