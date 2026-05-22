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
  size: "A4",
  bufferPages: true
});

  doc.pipe(fs.createWriteStream(filePath));

  // =====================================================
  // COLORS
  // =====================================================

  const COLORS = {
    navy: "#0F172A",
    blue: "#1D4ED8",
    gray: "#6B7280",
    lightGray: "#E5E7EB",
    dark: "#111827",
    green: "#059669",
    red: "#DC2626"
  };

  // =====================================================
  // COVER PAGE
  // =====================================================

  doc.rect(0, 0, doc.page.width, 180)
     .fill(COLORS.navy);

  doc.fillColor("#FFFFFF")
     .fontSize(30)
     .text("URUS", 60, 70);

  doc.fontSize(22)
     .text("Operational Intelligence Report", 60, 110);

  doc.fillColor(COLORS.dark)
     .fontSize(28)
     .text(
       municipality_name || "Unknown Municipality",
       60,
       260
     );

  doc.moveDown(2);

  doc.fillColor(COLORS.gray)
     .fontSize(14)
     .text(
       "Executive Operational Assessment & Strategic Intelligence Briefing",
       60,
       330,
       {
         width: 450
       }
     );

  doc.moveDown(3);

  doc.fillColor(COLORS.blue)
     .fontSize(12)
     .text("REPORT TYPE", 60, 420);

  doc.fillColor(COLORS.dark)
     .fontSize(16)
     .text("Operational Intelligence Assessment", 60, 445);

  doc.fillColor(COLORS.blue)
     .fontSize(12)
     .text("GENERATED", 60, 500);

  doc.fillColor(COLORS.dark)
     .fontSize(14)
     .text(
       new Date().toLocaleDateString(),
       60,
       525
     );

  // =====================================================
  // EXECUTIVE SUMMARY
  // =====================================================

  doc.addPage();

  doc.fillColor(COLORS.navy)
     .fontSize(24)
     .text("Executive Summary");

  doc.moveDown();

  doc.strokeColor(COLORS.lightGray)
     .lineWidth(1)
     .moveTo(60, 110)
     .lineTo(540, 110)
     .stroke();

  doc.moveDown(2);

  doc.fillColor(COLORS.dark)
     .fontSize(12)
     .text(
       executive_summary ||
       "No executive summary available.",
       {
         lineGap: 6,
         align: "justify"
       }
     );

  // =====================================================
  // OPERATIONAL FINDINGS
  // =====================================================

  doc.addPage();

  doc.fillColor(COLORS.navy)
     .fontSize(24)
     .text("Operational Findings");

  doc.moveDown();

  (findings || []).forEach((finding, index) => {

    doc.roundedRect(60, doc.y, 480, 80, 6)
       .fillAndStroke("#F9FAFB", COLORS.lightGray);

    doc.fillColor(COLORS.blue)
       .fontSize(12)
       .text(`FINDING ${index + 1}`, 80, doc.y + 15);

    doc.fillColor(COLORS.dark)
       .fontSize(11)
       .text(
         finding,
         80,
         doc.y + 35,
         {
           width: 420
         }
       );

    doc.moveDown(5);
  });

  // =====================================================
  // EVIDENCE CHAINS
  // =====================================================

  doc.addPage();

  doc.fillColor(COLORS.navy)
     .fontSize(24)
     .text("Evidence Chains");

  doc.moveDown(2);

  (evidence_chains || []).forEach((chain, index) => {

    doc.circle(70, doc.y + 6, 4)
       .fill(COLORS.blue);

    doc.fillColor(COLORS.dark)
       .fontSize(11)
       .text(
         chain,
         90,
         doc.y,
         {
           width: 430,
           lineGap: 5
         }
       );

    doc.moveDown(2);
  });

  // =====================================================
  // STRATEGIC RECOMMENDATIONS
  // =====================================================

  doc.addPage();

  doc.fillColor(COLORS.navy)
     .fontSize(24)
     .text("Strategic Recommendations");

  doc.moveDown(2);

  (strategic_recommendations || []).forEach((recommendation, index) => {

    doc.roundedRect(60, doc.y, 480, 70, 6)
       .fillAndStroke("#FFFFFF", COLORS.lightGray);

    doc.fillColor(COLORS.green)
       .fontSize(12)
       .text(`RECOMMENDATION ${index + 1}`, 80, doc.y + 15);

    doc.fillColor(COLORS.dark)
       .fontSize(11)
       .text(
         recommendation,
         80,
         doc.y + 35,
         {
           width: 420
         }
       );

    doc.moveDown(4);
  });

  // =====================================================
  // FUNDING ANALYSIS
  // =====================================================

  doc.addPage();

  doc.fillColor(COLORS.navy)
     .fontSize(24)
     .text("Funding Analysis");

  doc.moveDown();

  doc.roundedRect(60, 140, 480, 180, 8)
     .fillAndStroke("#F9FAFB", COLORS.lightGray);

  doc.fillColor(COLORS.dark)
     .fontSize(12)
     .text(
       funding_analysis ||
       "No funding analysis available.",
       85,
       175,
       {
         width: 400,
         lineGap: 6,
         align: "justify"
       }
     );

  // =====================================================
  // FOOTER
  // =====================================================

  const pages = doc.bufferedPageRange();

  for (let i = 0; i < pages.count; i++) {

    doc.switchToPage(i);

    doc.fontSize(9)
       .fillColor(COLORS.gray)
       .text(
         "URUS Operational Intelligence",
         60,
         760
       );

    doc.text(
      `Page ${i + 1}`,
      500,
      760
    );
  }

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
