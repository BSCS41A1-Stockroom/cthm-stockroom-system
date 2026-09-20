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

  const departmentLine = [data.department, data.section].filter(Boolean).join(" / ");
  if (departmentLine) {
    documentXml = documentXml.replace(/Department\/Program:\s*_{5,}/,
      `Department/Program: ${escapeXml(departmentLine)}`);
  }
  if (data.returnDate) {
    documentXml = documentXml.replace(/Intended Date of Return:\s*_{5,}/,
      `Intended Date of Return: ${escapeXml(data.returnDate)}`);
  }

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

  return zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
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
    const mime = extension === "jpg" ? "image/jpeg" : "image/png";
    contentTypes = contentTypes.replace("</Types>", `<Default Extension="${extension}" ContentType="${mime}"/></Types>`);
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
