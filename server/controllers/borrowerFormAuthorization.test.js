"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const PizZip = require("pizzip");
const generateBorrowerForm = require("../generateBorrowerForm");

test("embeds the professor signature and printed authorization in the official form", () => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const form = generateBorrowerForm({
    laboratory: "Food Laboratory",
    dateTime: "September 19, 2026",
    controlNo: "BR-001",
    items: [{ description: "Saucer", quantity: 2, released: 2 }],
    professorName: "Prof. Maria Santos",
    authorizedAt: "September 19, 2026, 10:30 AM",
    professorSignature: signature,
    professorSignatureMime: "image/png",
  });

  const zip = new PizZip(form);
  const documentXml = zip.file("word/document.xml").asText();
  const relationships = zip.file("word/_rels/document.xml.rels").asText();

  assert.equal(zip.file("word/media/professor-authorization-signature.png").asNodeBuffer().equals(signature), true);
  assert.match(documentXml, /Prof\. Maria Santos/);
  assert.match(documentXml, /September 19, 2026, 10:30 AM/);
  assert.match(documentXml, /r:embed="rIdProfessorAuthorizationSignature"/);
  assert.ok(documentXml.indexOf('r:embed="rIdProfessorAuthorizationSignature"') < documentXml.indexOf("<w:t>Instructor</w:t>"));
  assert.match(relationships, /Target="media\/professor-authorization-signature\.png"/);
});

test("places verified staff and approved administrator signature snapshots on their form lines", () => {
  const signature = Buffer.from([137,80,78,71,13,10,26,10,0]);
  const form = generateBorrowerForm({ items: [{ description:"Pan",quantity:1 }],
    verifiedName:"Staff One",verifiedAt:"September 20, 2026",verifiedSignature:signature,verifiedSignatureMime:"image/png",
    approvedName:"General Administrator",approvedAt:"September 20, 2026",approvedSignature:signature,approvedSignatureMime:"image/png" });
  const zip = new PizZip(form);
  const xml = zip.file("word/document.xml").asText();
  assert.match(xml,/r:embed="rIdCustodianverifiedSignature"/);
  assert.match(xml,/r:embed="rIdCustodianapprovedSignature"/);
  assert.match(xml,/Staff One/);
  assert.match(xml,/General Administrator/);
  assert.ok(zip.file("word/media/custodian-verified-signature.png"));
  assert.ok(zip.file("word/media/custodian-approved-signature.png"));
});

test("places releasing and receiving staff signature snapshots on their transaction lines", () => {
  const signature=Buffer.from([137,80,78,71,13,10,26,10,0]);
  const form=generateBorrowerForm({items:[{description:"Knife",quantity:1,released:1,returned:1}],
    releasedName:"Release Staff",releasedAt:"September 20, 2026",releasedSignature:signature,releasedSignatureMime:"image/png",
    returnedName:"Return Staff",returnedAt:"September 21, 2026",returnedSignature:signature,returnedSignatureMime:"image/png"});
  const zip=new PizZip(form); const xml=zip.file("word/document.xml").asText();
  assert.match(xml,/r:embed="rIdCustodianreleasedSignature"/);
  assert.match(xml,/r:embed="rIdCustodianreturnedSignature"/);
  assert.match(xml,/Release Staff/); assert.match(xml,/Return Staff/);
  assert.ok(zip.file("word/media/custodian-released-signature.png"));
  assert.ok(zip.file("word/media/custodian-returned-signature.png"));
});
