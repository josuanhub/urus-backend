const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

async function generateExecutiveReport(data) {

  const {
    municipality_name,
    executive_summary,
    findings,
    evidence_chains,
    strategic_recommendations,
    funding_analysis
  } = data;

  const reportsDir = path.join(__dirname, "../../generated_reports");

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const fileName = `report-${Date.now()}.pdf`;

  const filePath = path.join(reportsDir, fileName);

  const doc = new PDFDocument({
    margin: 50,
    size: "A4"
  });

  doc.pipe(fs.createWriteStream(filePath));

  // COVER

  doc.fontSize(24)
     .text("URUS Operational Intelligence Report", {
       align: "center"
     });

  doc.moveDown();

  doc.fontSize(18)
     .text(municipality_name || "Unknown Municipality", {
       align: "center"
     });

  doc.moveDown(2);

  // EXECUTIVE SUMMARY

  doc.fontSize(16)
     .text("Executive Summary");

  doc.moveDown();

  doc.fontSize(12)
     .text(
       executive_summary ||
       "No executive summary available."
     );

  // FINDINGS

  doc.addPage();

  doc.fontSize(16)
     .text("Operational Findings");

  (findings || []).forEach((finding, index) => {

    doc.moveDown();

    doc.fontSize(13)
       .text(`Finding #${index + 1}`);

    doc.fontSize(11)
       .text(finding);
  });

  // EVIDENCE CHAINS

  doc.addPage();

  doc.fontSize(16)
     .text("Evidence Chains");

  (evidence_chains || []).forEach((chain, index) => {

    doc.moveDown();

    doc.fontSize(12)
       .text(`Chain #${index + 1}`);

    doc.fontSize(11)
       .text(chain);
  });

  // STRATEGIC RECOMMENDATIONS

  doc.addPage();

  doc.fontSize(16)
     .text("Strategic Recommendations");

  (strategic_recommendations || []).forEach((recommendation, index) => {

    doc.moveDown();

    doc.fontSize(12)
       .text(`${index + 1}. ${recommendation}`);
  });

  // FUNDING ANALYSIS

  doc.addPage();

  doc.fontSize(16)
     .text("Funding Analysis");

  doc.moveDown();

  doc.fontSize(11)
     .text(
       funding_analysis ||
       "No funding analysis available."
     );

  doc.end();

  return {
    ok: true,
    fileName,
    filePath
  };
}

module.exports = {
  generateExecutiveReport
};
