const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

async function generateExecutiveReport(data) {

  const {
    municipality_name = "Municipio",
    executive_summary = "",
    findings = [],
    evidence_chains = [],
    strategic_recommendations = [],
    funding_analysis = "",

    // Scores dinámicos — con defaults seguros
    infrastructure_stability = 72,
    funding_readiness = 84,
    operational_risk = 63,
    coordination_capacity = 41,

    // Indicadores del snapshot
    fema_alignment = "HIGH",
    infrastructure_stress = "MODERATE",
    federal_exposure = "ACTIVE",

    // Indicadores del mapa
    map_fema_exposure = "HIGH",
    map_funding_readiness = "MODERATE",
    map_infrastructure_risk = "ACTIVE",

  } = data;

  const reportsDir = path.join(__dirname, "../../generated_reports");

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const fileName = `report-${Date.now()}.pdf`;
  const filePath = path.join(reportsDir, fileName);

  // =========================================
  // HELPERS
  // =========================================

  function riskColor(score) {
    if (score >= 75) return "#16a34a";
    if (score >= 50) return "#c9a24d";
    return "#dc2626";
  }

  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // =========================================
  // HTML TEMPLATE
  // =========================================

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f3f4f6;
      color: #111827;
    }

    /* ── PAGE BASE ── */
    .page {
      width: 100%;
      min-height: 100vh;
      padding: 80px;
      page-break-after: always;
      background: white;
      position: relative;
    }

    /* ── COVER ── */
    .cover {
      background: #0b0b0b;
      color: white;
    }

    .gold-line {
      position: absolute;
      left: 60px;
      top: 60px;
      width: 6px;
      height: 85%;
      background: #c9a24d;
    }

    .cover-urus {
      font-size: 64px;
      font-weight: 700;
      margin-top: 60px;
      margin-left: 40px;
      letter-spacing: -1px;
    }

    .cover-subtitle {
      font-size: 28px;
      color: #c9a24d;
      margin-top: 20px;
      margin-left: 40px;
    }

    .cover-municipality {
      font-size: 52px;
      font-weight: 700;
      margin-top: 140px;
      margin-left: 40px;
      line-height: 1.1;
    }

    .cover-meta {
      margin-top: 80px;
      margin-left: 40px;
      color: #9ca3af;
      line-height: 1.9;
      font-size: 15px;
    }

    .cover-cta-title {
      font-size: 40px;
      font-weight: 700;
      color: white;
      margin-top: 120px;
      margin-left: 40px;
      line-height: 1.2;
    }

    .cover-cta-body {
      font-size: 22px;
      color: #d6d9df;
      margin-top: 28px;
      margin-left: 40px;
      line-height: 1.7;
      max-width: 640px;
    }

    .cover-cta-block {
      margin-top: 80px;
      margin-left: 40px;
      border-left: 4px solid #c8a96b;
      padding-left: 20px;
      color: #d6d9df;
      line-height: 1.9;
      font-size: 16px;
    }

    /* ── FOOTER ── */
    .footer {
      position: absolute;
      bottom: 50px;
      right: 80px;
      color: #9ca3af;
      font-size: 12px;
    }

    /* ── TYPOGRAPHY ── */
    h1 {
      font-size: 42px;
      margin-bottom: 40px;
      color: #111827;
    }

    h2 {
      font-size: 26px;
      margin-bottom: 16px;
    }

    .summary-text {
      font-size: 19px;
      line-height: 1.8;
      color: #374151;
    }

    /* ── METRICS GRID ── */
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
      font-size: 13px;
      color: #9ca3af;
      margin-bottom: 18px;
      text-transform: uppercase;
      letter-spacing: 1.2px;
    }

    .metric-value {
      font-size: 36px;
      font-weight: 700;
      line-height: 1;
    }

    .metric-sub {
      margin-top: 12px;
      color: #d1d5db;
      font-size: 13px;
      line-height: 1.5;
    }

    /* ── ALERT BOX ── */
    .alert-box {
      margin-top: 50px;
      border-left: 6px solid #dc2626;
      background: #fef2f2;
      padding: 28px;
      border-radius: 12px;
    }

    .alert-title {
      font-size: 18px;
      font-weight: 700;
      color: #991b1b;
      margin-bottom: 10px;
    }

    .alert-text {
      color: #7f1d1d;
      line-height: 1.7;
      font-size: 15px;
    }

    /* ── TWO COLUMN ── */
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
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 22px;
      color: #111827;
    }

    .side-stat {
      margin-bottom: 22px;
    }

    .side-stat-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .side-stat-value {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
    }

    /* ── FINDING CARD ── */
    .finding-card {
      border: 1px solid #d1d5db;
      border-radius: 16px;
      padding: 26px;
      margin-bottom: 22px;
      background: #fafafa;
    }

    .finding-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #111827;
    }

    .finding-text {
      font-size: 15px;
      color: #4b5563;
      line-height: 1.75;
    }

    /* ── SCORECARD ── */
    .score-row {
      margin-bottom: 36px;
    }

    .score-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 17px;
      font-weight: 600;
      color: #111827;
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
      border-radius: 20px;
    }

    /* ── TABLE ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 40px;
    }

    th {
      background: #111827;
      color: white;
      padding: 16px 18px;
      text-align: left;
      font-size: 14px;
      letter-spacing: 0.5px;
    }

    td {
      border-bottom: 1px solid #e5e7eb;
      padding: 16px 18px;
      font-size: 15px;
      color: #374151;
    }

    tr:last-child td {
      border-bottom: none;
    }

    /* ── RECOMMENDATION ── */
    .recommendation {
      padding: 22px 26px;
      border-left: 6px solid #c9a24d;
      background: #fafafa;
      margin-bottom: 18px;
      border-radius: 12px;
      font-size: 16px;
      color: #374151;
      line-height: 1.7;
    }

    /* ── PROGRESS BAR WIDGET ── */
    .bar-widget {
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 28px;
      background: #fafafa;
    }

    .bar-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .bar-label {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
    }

    .bar-pct {
      font-size: 22px;
      font-weight: 700;
    }

    .bar-track {
      width: 100%;
      height: 22px;
      background: #e5e7eb;
      border-radius: 30px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 30px;
    }

    /* ── PILOT CARD ── */
    .pilot-cta {
      margin-top: 50px;
      padding: 44px;
      background: #0b1020;
      border-radius: 24px;
      color: white;
    }

    .pilot-cta-title {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 18px;
    }

    .pilot-cta-body {
      font-size: 20px;
      line-height: 1.75;
      opacity: 0.9;
    }

  </style>
</head>
<body>

  <!-- ══════════════════════════════════════ -->
  <!-- COVER                                  -->
  <!-- ══════════════════════════════════════ -->
  <section class="page cover">
    <div class="gold-line"></div>
    <div class="cover-urus">URUS</div>
    <div class="cover-subtitle">Operational Intelligence Report</div>
    <div class="cover-municipality">${municipality_name}</div>
    <div class="cover-meta">
      CONFIDENTIAL EXECUTIVE BRIEFING<br/>
      Generated: ${generatedDate}<br/>
      Generated by URUS Operational Intelligence System
    </div>
    <div class="footer">URUS ∴ Strategic Intelligence Layer</div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- EXECUTIVE SUMMARY                      -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Executive Summary</h1>

    <div class="summary-text">${executive_summary}</div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Infrastructure Risk</div>
        <div class="metric-value">${infrastructure_stability}%</div>
        <div class="metric-sub">Elevated infrastructure exposure detected.</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Funding Readiness</div>
        <div class="metric-value">${funding_readiness}%</div>
        <div class="metric-sub">Active federal funding eligibility signals.</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Coordination Capacity</div>
        <div class="metric-value">${coordination_capacity}%</div>
        <div class="metric-sub">Cross-department operational fragmentation.</div>
      </div>
    </div>

    <div class="alert-box">
      <div class="alert-title">Strategic Operational Alert</div>
      <div class="alert-text">
        URUS detected operational inefficiencies connected to fragmented workflows,
        delayed funding coordination, and infrastructure resilience exposure.
      </div>
    </div>

    <div class="two-column">
      <div>
        <h2>Executive Intelligence</h2>
        <div class="summary-text">
          Current operational indicators suggest the municipality is positioned
          for federal resilience funding, but internal coordination inefficiencies
          may reduce execution velocity and grant conversion effectiveness.
        </div>
      </div>
      <div class="side-panel">
        <div class="side-panel-title">Intelligence Snapshot</div>
        <div class="side-stat">
          <div class="side-stat-label">FEMA Alignment</div>
          <div class="side-stat-value">${fema_alignment}</div>
        </div>
        <div class="side-stat">
          <div class="side-stat-label">Infrastructure Stress</div>
          <div class="side-stat-value">${infrastructure_stress}</div>
        </div>
        <div class="side-stat">
          <div class="side-stat-label">Federal Exposure</div>
          <div class="side-stat-value">${federal_exposure}</div>
        </div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- SCOPE & METHODOLOGY (una sola vez)     -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Scope &amp; Methodology</h1>

    <div class="finding-card">
      <div class="finding-title">Operational Intelligence Scope</div>
      <div class="finding-text">
        This assessment was generated through the URUS Operational Intelligence
        System using publicly available indicators, infrastructure exposure signals,
        operational coordination patterns, federal funding activity, and regional
        resilience analysis.<br><br>
        The report does not represent a formal audit, governmental certification,
        or legal determination. Findings should be interpreted as preliminary
        operational intelligence requiring institutional validation.
      </div>
    </div>

    <div class="finding-card">
      <div class="finding-title">Intelligence Inputs</div>
      <div class="finding-text">
        Inputs analyzed may include:<br><br>
        • Federal funding activity<br>
        • Public infrastructure exposure indicators<br>
        • FEMA-related resilience signals<br>
        • Grant coordination patterns<br>
        • Municipal operational fragmentation indicators<br>
        • Public strategic documentation<br>
        • Regional infrastructure conditions
      </div>
    </div>

    <div class="finding-card">
      <div class="finding-title">Analytical Positioning</div>
      <div class="finding-text">
        URUS positioning is designed to support executive awareness, operational
        prioritization, strategic planning, and funding readiness evaluation.<br><br>
        Signals identified in this report should be interpreted as strategic
        indicators rather than definitive institutional conclusions.
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- OPERATIONAL FINDINGS                   -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Operational Findings</h1>

    ${findings.map((finding, index) => `
      <div class="finding-card">
        <div class="finding-title">Finding #${index + 1}</div>
        <div class="finding-text">${finding}</div>
      </div>
    `).join("")}
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- OPERATIONAL SCORECARD                  -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Operational Scorecard</h1>

    <div class="score-row">
      <div class="score-header">
        <span>Infrastructure Stability</span>
        <span>${infrastructure_stability}%</span>
      </div>
      <div class="score-bar">
        <div class="score-fill" style="width:${infrastructure_stability}%; background:${riskColor(infrastructure_stability)};"></div>
      </div>
    </div>

    <div class="score-row">
      <div class="score-header">
        <span>Funding Readiness</span>
        <span>${funding_readiness}%</span>
      </div>
      <div class="score-bar">
        <div class="score-fill" style="width:${funding_readiness}%; background:${riskColor(funding_readiness)};"></div>
      </div>
    </div>

    <div class="score-row">
      <div class="score-header">
        <span>Operational Risk Exposure</span>
        <span>${operational_risk}%</span>
      </div>
      <div class="score-bar">
        <div class="score-fill" style="width:${operational_risk}%; background:${riskColor(operational_risk)};"></div>
      </div>
    </div>

    <div class="score-row">
      <div class="score-header">
        <span>Digital Coordination Capacity</span>
        <span>${coordination_capacity}%</span>
      </div>
      <div class="score-bar">
        <div class="score-fill" style="width:${coordination_capacity}%; background:${riskColor(coordination_capacity)};"></div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- FUNDING OPPORTUNITY MATRIX             -->
  <!-- ══════════════════════════════════════ -->
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


  <!-- ══════════════════════════════════════ -->
  <!-- MUNICIPAL INTELLIGENCE MAP             -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Municipal Intelligence Map</h1>

    <div style="margin-top:40px; background:white; border-radius:24px; padding:30px; border:1px solid #dfe4ea;">
      <img
        src="https://raw.githubusercontent.com/josuanhub/urus-backend/main/public/maps/mapa%20PR.jpeg"
        style="width:100%; border-radius:18px;"
      />
    </div>

    <div style="margin-top:30px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px;">
      <div class="metric-card">
        <div class="metric-label">FEMA Exposure</div>
        <div class="metric-value" style="font-size:28px;">${map_fema_exposure}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Funding Readiness</div>
        <div class="metric-value" style="font-size:28px;">${map_funding_readiness}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Infrastructure Risk</div>
        <div class="metric-value" style="font-size:28px;">${map_infrastructure_risk}</div>
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- OPERATIONAL INTELLIGENCE OVERVIEW      -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Operational Intelligence Overview</h1>

    <div style="margin-top:50px;">

      <div class="bar-widget">
        <div class="bar-header">
          <div class="bar-label">Infrastructure Stability</div>
          <div class="bar-pct" style="color:${riskColor(infrastructure_stability)};">${infrastructure_stability}%</div>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${infrastructure_stability}%; background:#111827;"></div>
        </div>
      </div>

      <div class="bar-widget">
        <div class="bar-header">
          <div class="bar-label">Federal Funding Readiness</div>
          <div class="bar-pct" style="color:${riskColor(funding_readiness)};">${funding_readiness}%</div>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${funding_readiness}%; background:#c9a24d;"></div>
        </div>
      </div>

      <div class="bar-widget">
        <div class="bar-header">
          <div class="bar-label">Operational Coordination Capacity</div>
          <div class="bar-pct" style="color:${riskColor(coordination_capacity)};">${coordination_capacity}%</div>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${coordination_capacity}%; background:#7c3aed;"></div>
        </div>
      </div>

    </div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- EVIDENCE CHAINS                        -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Evidence Chains</h1>

    ${evidence_chains.map((chain, index) => `
      <div class="finding-card">
        <div class="finding-title">Chain #${index + 1}</div>
        <div class="finding-text">${chain}</div>
      </div>
    `).join("")}
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- EXECUTIVE PILOT RECOMMENDATION (único) -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Executive Pilot Recommendation</h1>

    <div class="finding-card">
      <div class="finding-title">Recommended Pilot Structure</div>
      <div class="finding-text">
        Based on preliminary operational intelligence indicators, URUS recommends
        a limited executive pilot focused on operational visibility, funding
        coordination assessment, infrastructure prioritization, and municipal
        response analysis.<br><br>
        The objective of the pilot is to validate strategic indicators using real
        municipal workflows and operational conditions.
      </div>
    </div>

    <div class="finding-card">
      <div class="finding-title">Pilot Scope</div>
      <div class="finding-text">
        Suggested pilot duration:<br><br>
        • <strong>14-Day</strong> — Intelligence Validation Pilot<br>
        • <strong>30-Day</strong> — Operational Monitoring Deployment<br>
        • <strong>60-Day</strong> — Strategic Funding Intelligence Cycle<br><br>
        Pilot deployment may include executive dashboards, operational reporting,
        funding visibility systems, intelligence scoring, and strategic coordination
        layers.<br><br>
        Pilot deployment objectives may include:<br><br>
        • Grant opportunity tracking<br>
        • Executive operational dashboards<br>
        • Infrastructure signal monitoring<br>
        • Risk exposure visualization<br>
        • Interdepartmental coordination analysis
      </div>
    </div>

    <div class="finding-card">
      <div class="finding-title">Executive Outcome Objective</div>
      <div class="finding-text">
        The intended outcome is improved executive visibility across operational
        exposure, funding readiness, infrastructure coordination, and strategic
        response capacity.<br><br>
        Additional institutional validation is recommended before implementing
        long-term strategic actions.
      </div>
    </div>

    <div class="pilot-cta">
      <div class="pilot-cta-title">Recommended Next Step</div>
      <div class="pilot-cta-body">
        Schedule an executive operational intelligence review session to validate
        findings, identify municipal priorities, and determine feasibility of
        pilot deployment.
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- STRATEGIC RECOMMENDATIONS              -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Strategic Recommendations</h1>

    ${strategic_recommendations.map((r, index) => `
      <div class="recommendation">
        <strong>${index + 1}.</strong> ${r}
      </div>
    `).join("")}
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- FUNDING ANALYSIS                       -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Funding Analysis</h1>
    <div class="summary-text">${funding_analysis}</div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- DATA INPUTS                            -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Data Inputs &amp; Intelligence Sources</h1>

    <table>
      <thead>
        <tr>
          <th>Source Type</th>
          <th>Category</th>
          <th>Usage</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Federal Signals</td>
          <td>FEMA / HUD / DOE</td>
          <td>Funding opportunity monitoring</td>
        </tr>
        <tr>
          <td>Regional News Intelligence</td>
          <td>Puerto Rico Media</td>
          <td>Operational event detection</td>
        </tr>
        <tr>
          <td>Infrastructure Indicators</td>
          <td>Public Risk Signals</td>
          <td>Exposure analysis</td>
        </tr>
        <tr>
          <td>Grant Monitoring</td>
          <td>Federal Programs</td>
          <td>Readiness estimation</td>
        </tr>
        <tr>
          <td>Strategic Trend Analysis</td>
          <td>Operational Intelligence</td>
          <td>Pattern recognition</td>
        </tr>
      </tbody>
    </table>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- DISCLAIMER                             -->
  <!-- ══════════════════════════════════════ -->
  <section class="page">
    <h1>Operational Intelligence Disclaimer</h1>

    <div class="finding-card">
      <div class="finding-text">
        This document is intended exclusively for preliminary operational
        intelligence assessment and executive strategic orientation.<br><br>
        Findings contained within this report are derived from publicly
        accessible information, regional intelligence signals, funding
        indicators, and analytical estimation models.<br><br>
        Signals identified by the system do not constitute audited municipal
        conclusions, legal determinations, engineering certifications,
        financial guarantees, or official governmental findings.<br><br>
        All operational conclusions require validation through direct municipal
        review, administrative verification, technical assessment, and
        institutional confirmation procedures.
      </div>
    </div>
  </section>


  <!-- ══════════════════════════════════════ -->
  <!-- EXECUTIVE CTA (cover final)            -->
  <!-- ══════════════════════════════════════ -->
  <section class="page cover">
    <div class="gold-line"></div>

    <div class="cover-cta-title">
      Recommended Next Operational Phase
    </div>

    <div class="cover-cta-body">
      Executive review is recommended to determine whether operational
      validation, pilot deployment, or strategic monitoring expansion
      should proceed.
    </div>

    <div class="cover-cta-block">
      URUS Operational Intelligence System<br>
      Strategic Infrastructure Intelligence<br>
      Executive Decision Support Layer
    </div>

    <div class="footer">URUS ∴ Strategic Intelligence Layer</div>
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
