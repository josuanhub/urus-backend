const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

async function generateExecutiveReport(data) {

  const {
    municipality_name,
    executive_summary,
    findings = [],
    evidence_chains = [],
    strategic_recommendations = [],
    funding_analysis
  } = data;

  const reportsDir = path.join(
    __dirname,
    "../../generated_reports"
  );

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const fileName = `report-${Date.now()}.pdf`;

  const filePath = path.join(reportsDir, fileName);

  // =========================================
  // HTML TEMPLATE
  // =========================================
const operationalRiskSeries = [62, 58, 71, 69, 63, 52];

const fundingReadinessSeries = [
  84,
  92,
  71,
  88
];

const operationalLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun"
];

const fundingLabels = [
  "Infrastructure",
  "FEMA",
  "Energy",
  "Resilience"
];
  
const operationalTrendChart = `
https://quickchart.io/chart?c={
  type:'line',
  data:{
   labels:${JSON.stringify(operationalLabels).replace(/"/g, "'")}
    datasets:[{
      label:'Operational Risk',
     data:${JSON.stringify(operationalRiskSeries)}
      borderColor:'rgb(201,162,77)',
      fill:false
    }]
  }
}
`;

const fundingReadinessChart = `
https://quickchart.io/chart?c={
  type:'bar',
  data:{
    labels:${JSON.stringify(fundingLabels).replace(/"/g, "'")}
    datasets:[{
      label:'Funding Readiness',
      data:${JSON.stringify(fundingReadinessSeries)}
      backgroundColor:'rgb(17,24,39)'
    }]
  }
}
`;
  
  const html = `
  <!DOCTYPE html>
  <html>
  <head>

    <style>

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        background: #f3f4f6;
        color: #111827;
      }

      .page {
        width: 100%;
        min-height: 100vh;
        padding: 80px;
        page-break-after: always;
        background: white;
      }

      .cover {
        background: #0b0b0b;
        color: white;
        position: relative;
      }

      .gold-line {
        position: absolute;
        left: 60px;
        top: 60px;
        width: 6px;
        height: 85%;
        background: #c9a24d;
      }

      .urus {
        font-size: 64px;
        font-weight: 700;
        margin-top: 60px;
        margin-left: 40px;
      }

      .subtitle {
        font-size: 28px;
        color: #c9a24d;
        margin-top: 20px;
        margin-left: 40px;
      }

      .municipality {
        font-size: 52px;
        font-weight: 700;
        margin-top: 140px;
        margin-left: 40px;
      }

      .meta {
        margin-top: 80px;
        margin-left: 40px;
        color: #9ca3af;
        line-height: 1.8;
      }

      h1 {
        font-size: 42px;
        margin-bottom: 40px;
      }

      .summary {
        font-size: 20px;
        line-height: 1.8;
        color: #374151;
      }

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
  margin-top: 50px;
}

.metric-card {
  background: #111827;
  border-radius: 18px;
  padding: 28px;
  color: white;
  position: relative;
  overflow: hidden;
}

.metric-card::after {
  content: "";
  position: absolute;
  right: -40px;
  top: -40px;
  width: 120px;
  height: 120px;
  background: rgba(255,255,255,0.05);
  border-radius: 50%;
}

.metric-label {
  font-size: 14px;
  color: #9ca3af;
  margin-bottom: 18px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.metric-value {
  font-size: 54px;
  font-weight: 700;
}

.metric-sub {
  margin-top: 10px;
  color: #d1d5db;
  font-size: 14px;
}

.alert-box {
  margin-top: 50px;
  border-left: 6px solid #dc2626;
  background: #fef2f2;
  padding: 28px;
  border-radius: 12px;
}

.alert-title {
  font-size: 20px;
  font-weight: 700;
  color: #991b1b;
  margin-bottom: 12px;
}

.alert-text {
  color: #7f1d1d;
  line-height: 1.7;
}

.two-column {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 40px;
  margin-top: 50px;
}

.side-panel {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 28px;
}

.side-panel-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 20px;
}

.side-stat {
  margin-bottom: 22px;
}

.side-stat-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.side-stat-value {
  font-size: 26px;
  font-weight: 700;
}

      .finding-card {
        border: 1px solid #d1d5db;
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 20px;
        background: #fafafa;
      }

      .finding-title {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 12px;
      }

      .finding-text {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.7;
      }

      .score-row {
        margin-bottom: 34px;
      }

      .score-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        font-size: 18px;
        font-weight: 600;
      }

      .score-bar {
        width: 100%;
        height: 18px;
        background: #e5e7eb;
        border-radius: 20px;
        overflow: hidden;
      }

      .score-fill {
        height: 100%;
        background: #111827;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 40px;
      }

      th {
        background: #111827;
        color: white;
        padding: 18px;
        text-align: left;
      }

      td {
        border-bottom: 1px solid #e5e7eb;
        padding: 18px;
      }

      .recommendation {
        padding: 24px;
        border-left: 6px solid #c9a24d;
        background: #fafafa;
        margin-bottom: 20px;
        border-radius: 12px;
      }

      .footer {
        position: absolute;
        bottom: 50px;
        right: 80px;
        color: #9ca3af;
        font-size: 12px;
      }

    </style>

  </head>

  <body>

    <!-- COVER -->

    <section class="page cover">

      <div class="gold-line"></div>

      <div class="urus">
        URUS
      </div>

      <div class="subtitle">
        Operational Intelligence Report
      </div>

      <div class="municipality">
        ${municipality_name}
      </div>

      <div class="meta">
        CONFIDENTIAL EXECUTIVE BRIEFING<br/>
        Generated: ${new Date().toLocaleDateString()}<br/>
        Generated by URUS Operational Intelligence System
      </div>

      <div class="footer">
        URUS ∴ Strategic Intelligence Layer
      </div>

    </section>

    <!-- EXECUTIVE SUMMARY -->

    <section class="page">

      <h1>Executive Summary</h1>

      <div class="summary">
        ${executive_summary}
      </div>
<div class="metrics-grid">

  <div class="metric-card">
    <div class="metric-label">
      Infrastructure Risk
    </div>

    <div class="metric-value">
      72%
    </div>

    <div class="metric-sub">
      Elevated infrastructure exposure detected.
    </div>
  </div>

  <div class="metric-card">
    <div class="metric-label">
      Funding Readiness
    </div>

    <div class="metric-value">
      84%
    </div>

    <div class="metric-sub">
      Active federal funding eligibility signals.
    </div>
  </div>

  <div class="metric-card">
    <div class="metric-label">
      Coordination Capacity
    </div>

    <div class="metric-value">
      41%
    </div>

    <div class="metric-sub">
      Cross-department operational fragmentation.
    </div>
  </div>

</div>

<div class="alert-box">

  <div class="alert-title">
    Strategic Operational Alert
  </div>

  <div class="alert-text">
    URUS detected operational inefficiencies connected to fragmented workflows,
    delayed funding coordination, and infrastructure resilience exposure.
  </div>

</div>

<div class="two-column">

  <div>

    <h2>
      Executive Intelligence
    </h2>

    <div class="summary">
      Current operational indicators suggest the municipality is positioned
      for federal resilience funding, but internal coordination inefficiencies
      may reduce execution velocity and grant conversion effectiveness.
    </div>

  </div>

  <div class="side-panel">

    <div class="side-panel-title">
      Intelligence Snapshot
    </div>

    <div class="side-stat">
      <div class="side-stat-label">
        FEMA Alignment
      </div>

      <div class="side-stat-value">
        HIGH
      </div>
    </div>

    <div class="side-stat">
      <div class="side-stat-label">
        Infrastructure Stress
      </div>

      <div class="side-stat-value">
        MODERATE
      </div>
    </div>

    <div class="side-stat">
      <div class="side-stat-label">
        Federal Exposure
      </div>

      <div class="side-stat-value">
        ACTIVE
      </div>
    </div>

  </div>

</div>

    </section>

    <!-- FINDINGS -->

    <section class="page">

      <h1>Operational Findings</h1>

      ${findings.map((finding, index) => `
        <div class="finding-card">
          <div class="finding-title">
            Finding #${index + 1}
          </div>

          <div class="finding-text">
            ${finding}
          </div>
        </div>
      `).join("")}

    </section>

    <!-- SCORECARD -->

    <section class="page">

      <h1>Operational Scorecard</h1>

      <div class="score-row">
        <div class="score-header">
          <span>Infrastructure Stability</span>
          <span>72%</span>
        </div>

        <div class="score-bar">
          <div class="score-fill" style="width:72%"></div>
        </div>
      </div>

      <div class="score-row">
        <div class="score-header">
          <span>Funding Readiness</span>
          <span>84%</span>
        </div>

        <div class="score-bar">
          <div class="score-fill" style="width:84%"></div>
        </div>
      </div>

      <div class="score-row">
        <div class="score-header">
          <span>Operational Risk Exposure</span>
          <span>63%</span>
        </div>

        <div class="score-bar">
          <div class="score-fill" style="width:63%"></div>
        </div>
      </div>

      <div class="score-row">
        <div class="score-header">
          <span>Digital Coordination Capacity</span>
          <span>41%</span>
        </div>

        <div class="score-bar">
          <div class="score-fill" style="width:41%"></div>
        </div>
      </div>

    </section>



    <!-- FUNDING TABLE -->

    <section class="page">

      <h1>Funding Opportunity Matrix</h1>

      <table>

        <thead>
          <tr>
            <th>Program</th>
            <th>Agency</th>
            <th>Status</th>
            <th>Priority</th>
          </tr>
        </thead>

        <tbody>

          <tr>
            <td>Flood Mitigation Program</td>
            <td>FEMA</td>
            <td>Open</td>
            <td>Critical</td>
          </tr>

          <tr>
            <td>Infrastructure Resilience Fund</td>
            <td>DHS</td>
            <td>Active</td>
            <td>High</td>
          </tr>

          <tr>
            <td>Municipal Modernization Grant</td>
            <td>HUD</td>
            <td>Review</td>
            <td>Medium</td>
          </tr>

        </tbody>

      </table>

    </section>

<!-- CHARTS -->

<section class="page">

  <h1>Operational Intelligence Charts</h1>

  <div style="margin-top:50px;">

    <div style="margin-bottom:60px;">

      <h2 style="margin-bottom:20px;">
        Operational Risk Evolution
      </h2>

      <img
        src="${operationalTrendChart}"
        style="width:100%;border-radius:16px;"
      />

    </div>

    <div>

      <h2 style="margin-bottom:20px;">
        Funding Readiness Distribution
      </h2>

      <img
        src="${fundingReadinessChart}"
        style="width:100%;border-radius:16px;"
      />

    </div>

  </div>

</section>

    <!-- EVIDENCE -->

    <section class="page">

      <h1>Evidence Chains</h1>

      ${evidence_chains.map((chain, index) => `
        <div class="finding-card">
          <div class="finding-title">
            Chain #${index + 1}
          </div>

          <div class="finding-text">
            ${chain}
          </div>
        </div>
      `).join("")}

    </section>

    <!-- RECOMMENDATIONS -->

    <section class="page">

      <h1>Strategic Recommendations</h1>

      ${strategic_recommendations.map((r, index) => `
        <div class="recommendation">
          <strong>${index + 1}.</strong> ${r}
        </div>
      `).join("")}

    </section>

    <!-- FUNDING ANALYSIS -->

    <section class="page">

      <h1>Funding Analysis</h1>

      <div class="summary">
        ${funding_analysis}
      </div>

    </section>

  </body>
  </html>
  `;

  // =========================================
  // PUPPETEER
  // =========================================

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setContent(html, {
    waitUntil: "networkidle0"
  });

  await page.pdf({
    path: filePath,
    format: "A4",
    printBackground: true
  });

  await browser.close();

  return {
    ok: true,
    fileName,
    filePath
  };
}

module.exports = {
  generateExecutiveReport
};
