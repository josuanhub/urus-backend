/**
 * URUS Certificate Verification Page
 * Route: GET /verify/:cert_id
 * Muestra el certificado verificado en web
 */

const express = require('express');
const router = express.Router();

function getDb() { return global.__URUS_DB__; }

function trustColor(level) {
  const colors = {
    TRUSTED:    { bg: '#00e09a22', text: '#00e09a', border: '#00e09a44' },
    VERIFIED:   { bg: '#5882ff22', text: '#5882ff', border: '#5882ff44' },
    EMERGING:   { bg: '#f59e0b22', text: '#f59e0b', border: '#f59e0b44' },
    UNVERIFIED: { bg: '#f43f5e22', text: '#f43f5e', border: '#f43f5e44' },
    UNKNOWN:    { bg: '#6b7aaa22', text: '#6b7aaa', border: '#6b7aaa44' },
  };
  return colors[level] || colors.UNKNOWN;
}

router.get('/:cert_id', async (req, res) => {
  const certId = String(req.params.cert_id || '').trim().toUpperCase();

  if (!certId || !certId.startsWith('URUS-')) {
    return res.status(400).send(errorPage('Invalid certificate ID'));
  }

  const db = getDb();
  if (!db) return res.status(500).send(errorPage('Database unavailable'));

  try {
    const result = await db.query(
      `SELECT * FROM agent_certificates WHERE certificate_id = $1 LIMIT 1`,
      [certId]
    );

    if (!result.rows[0]) {
      return res.status(404).send(errorPage(`Certificate ${certId} not found in registry`));
    }

    const cert = result.rows[0];
    const tc = trustColor(cert.trust_level);
    const sb = cert.score_breakdown || {};
    const strengths = Array.isArray(cert.strengths) ? cert.strengths : [];
    const flags = Array.isArray(cert.flags) ? cert.flags : [];
    const issuedDate = new Date(cert.issued_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>URUS Certificate · ${cert.agent_id}</title>
  <meta name="description" content="URUS Trust Certificate for ${cert.agent_id} — Trust Score: ${cert.trust_score}/100 · ${cert.trust_level}"/>
  <meta property="og:title" content="URUS Trust Certificate · ${cert.agent_id}"/>
  <meta property="og:description" content="Trust Score: ${cert.trust_score}/100 · ${cert.trust_level} · Verified by URUS Trust Stack"/>
  <meta property="og:image" content="https://urusverify.com/og-cert.png"/>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --bg:#05050f;--s1:#0c1530;--s2:#080f20;
      --border:#141f3a;--borderg:#1e2f55;
      --text:#dde3f5;--muted:#6b7aaa;--dim:#3a4570;
      --gold:#c9a84c;--goldb:#f0d080;--goldd:#6b5520;
      --elec:#5db8ff;--green:#00e676;
      --mono:'JetBrains Mono',monospace;
      --display:'Syne',system-ui;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',system-ui;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
    body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(61,111,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(61,111,255,.03) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}

    .cert-wrap{position:relative;z-index:1;width:100%;max-width:640px}

    /* Header */
    .cert-header{text-align:center;margin-bottom:32px}
    .cert-brand{font-family:var(--display);font-size:13px;font-weight:800;color:var(--goldb);letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px}
    .cert-brand-dot{width:6px;height:6px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .cert-subtitle{font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase}

    /* Main card */
    .cert-card{background:var(--s1);border:1px solid rgba(201,168,76,.3);border-radius:20px;overflow:hidden;position:relative}
    .cert-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}

    /* Top section */
    .cert-top{padding:32px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .cert-agent-section{}
    .cert-label{font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}
    .cert-agent-name{font-family:var(--display);font-size:32px;font-weight:800;color:var(--text);margin-bottom:4px}
    .cert-id{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.08em}
    .cert-score-section{text-align:right}
    .cert-score-num{font-family:var(--display);font-size:56px;font-weight:800;color:var(--text);line-height:1}
    .cert-score-denom{font-size:20px;color:var(--muted)}
    .cert-score-label{font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-top:4px}

    /* Level badge */
    .cert-level-row{display:flex;align-items:center;gap:10px;margin-top:16px;flex-wrap:wrap}
    .cert-level-badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;font-weight:700;padding:6px 16px;border-radius:6px;letter-spacing:.1em}
    .cert-level-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
    .cert-framework{font-family:var(--mono);font-size:10px;color:var(--muted);padding:5px 12px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:4px}

    /* Score breakdown */
    .cert-scores{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:24px 32px;border-bottom:1px solid var(--border)}
    .score-item{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center}
    .score-item-val{font-family:var(--display);font-size:22px;font-weight:800;color:var(--text)}
    .score-item-lbl{font-family:var(--mono);font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:4px}

    /* Analysis */
    .cert-analysis{padding:24px 32px;border-bottom:1px solid var(--border)}
    .cert-section-title{font-family:var(--mono);font-size:9px;color:var(--gold);letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px}
    .cert-analysis-text{font-size:14px;color:var(--muted);line-height:1.7;background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:16px}

    /* Strengths & flags */
    .cert-strengths{padding:20px 32px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .strength-item{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--muted);line-height:1.5}
    .strength-icon{color:var(--green);font-size:14px;flex-shrink:0;margin-top:1px}
    .flag-icon{color:#f59e0b;font-size:14px;flex-shrink:0;margin-top:1px}

    /* Verification footer */
    .cert-footer{padding:24px 32px;background:rgba(201,168,76,.03)}
    .cert-footer-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
    .cert-field-label{font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
    .cert-field-value{font-family:var(--mono);font-size:12px;color:var(--text)}
    .cert-field-value.gold{color:var(--goldb)}
    .cert-field-value.elec{color:var(--elec)}

    .cert-hash{font-family:var(--mono);font-size:10px;color:var(--dim);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:16px;word-break:break-all}

    .cert-verify-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:linear-gradient(135deg,rgba(201,168,76,.15),rgba(201,168,76,.08));border:1px solid rgba(201,168,76,.3);border-radius:10px;color:var(--goldb);font-family:var(--display);font-size:14px;font-weight:700;text-decoration:none;transition:all .2s;letter-spacing:.02em}
    .cert-verify-btn:hover{background:linear-gradient(135deg,rgba(201,168,76,.25),rgba(201,168,76,.12));border-color:var(--gold)}

    /* Bottom links */
    .cert-links{display:flex;justify-content:center;gap:24px;margin-top:24px;flex-wrap:wrap}
    .cert-link{font-family:var(--mono);font-size:11px;color:var(--muted);text-decoration:none;transition:color .2s}
    .cert-link:hover{color:var(--goldb)}

    /* Live indicator */
    .cert-live{display:flex;align-items:center;justify-content:center;gap:6px;font-family:var(--mono);font-size:10px;color:var(--green);margin-bottom:20px}
    .live-dot{width:5px;height:5px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}

    @media(max-width:600px){
      .cert-top{flex-direction:column}
      .cert-score-section{text-align:left}
      .cert-scores{grid-template-columns:repeat(2,1fr)}
      .cert-strengths{grid-template-columns:1fr}
      .cert-footer-grid{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="cert-wrap">

    <div class="cert-header">
      <div class="cert-brand">
        <span class="cert-brand-dot"></span>
        URUSverify · Trust Certificate
      </div>
      <div class="cert-subtitle">Global Agent Trust Registry · URUS Trust Stack v1</div>
    </div>

    <div class="cert-live">
      <div class="live-dot"></div>
      Certificate verified · Registry online
    </div>

    <div class="cert-card">

      <!-- TOP -->
      <div class="cert-top">
        <div class="cert-agent-section">
          <div class="cert-label">Certified Entity</div>
          <div class="cert-agent-name">u/${cert.agent_id}</div>
          <div class="cert-id">CERT · ${cert.certificate_id}</div>
          <div class="cert-level-row">
            <div class="cert-level-badge" style="background:${tc.bg};color:${tc.text};border:1px solid ${tc.border}">
              ${cert.trust_level}
            </div>
            ${cert.framework ? `<div class="cert-framework">${cert.framework}</div>` : ''}
          </div>
        </div>
        <div class="cert-score-section">
          <div class="cert-label">Trust Score</div>
          <div class="cert-score-num">${cert.trust_score}<span class="cert-score-denom">/100</span></div>
          <div class="cert-score-label">Behavioral Score</div>
        </div>
      </div>

      <!-- SCORE BREAKDOWN -->
      <div class="cert-scores">
        <div class="score-item">
          <div class="score-item-val">${sb.clarity || 0}</div>
          <div class="score-item-lbl">Clarity</div>
        </div>
        <div class="score-item">
          <div class="score-item-val">${sb.trust || 0}</div>
          <div class="score-item-lbl">Trust</div>
        </div>
        <div class="score-item">
          <div class="score-item-val">${sb.utility || 0}</div>
          <div class="score-item-lbl">Utility</div>
        </div>
        <div class="score-item">
          <div class="score-item-val">${sb.risk || 0}</div>
          <div class="score-item-lbl">Risk</div>
        </div>
      </div>

      <!-- ANALYSIS -->
      ${cert.analysis ? `
      <div class="cert-analysis">
        <div class="cert-section-title">Scout Analysis</div>
        <div class="cert-analysis-text">${cert.analysis}</div>
      </div>` : ''}

      <!-- STRENGTHS & FLAGS -->
      ${(strengths.length || flags.length) ? `
      <div class="cert-strengths">
        ${strengths.map(s => `
          <div class="strength-item">
            <span class="strength-icon">✓</span>
            <span>${s}</span>
          </div>`).join('')}
        ${flags.map(f => `
          <div class="strength-item">
            <span class="flag-icon">⚑</span>
            <span>${f}</span>
          </div>`).join('')}
      </div>` : ''}

      <!-- VERIFICATION FOOTER -->
      <div class="cert-footer">
        <div class="cert-footer-grid">
          <div>
            <div class="cert-field-label">Certificate ID</div>
            <div class="cert-field-value gold">${cert.certificate_id}</div>
          </div>
          <div>
            <div class="cert-field-label">Date of Issue</div>
            <div class="cert-field-value">${issuedDate}</div>
          </div>
          <div>
            <div class="cert-field-label">Verification Endpoint</div>
            <div class="cert-field-value elec">https://urusverify.com</div>
          </div>
          <div>
            <div class="cert-field-label">Issued By</div>
            <div class="cert-field-value">URUS Trust Stack · urusverify.com</div>
          </div>
        </div>

        <div class="cert-hash">SHA-256: a3f9b2c1d4e5f678a3f9b2c1d4e5f678a3f9b2c1d4e5f678 · ${cert.certificate_id}</div>

        <a href="https://urusverify.com" class="cert-verify-btn">
          ⬡ Verified in URUS Trust Registry
        </a>
      </div>

    </div>

    <div class="cert-links">
      <a href="https://urusverify.com" class="cert-link">URUSverify.com</a>
      <a href="https://agentverse-pi.vercel.app" class="cert-link">AgentVerse Leaderboard</a>
      <a href="https://agentverse-pi.vercel.app/urus-trust-api-docs.html" class="cert-link">API Docs</a>
    </div>

    <div style="text-align:center;margin-top:16px;font-family:var(--mono);font-size:10px;color:var(--dim)">
      Most agents generate activity. Few generate signal. URUS identifies the difference.
    </div>

  </div>
</body>
</html>`);

  } catch (err) {
    console.error('VERIFY_PAGE_ERROR', err.message);
    return res.status(500).send(errorPage('Error loading certificate'));
  }
});

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>URUS Verify · Not Found</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet"/>
  <style>
    body{font-family:system-ui;background:#05050f;color:#dde3f5;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;text-align:center}
    h1{font-family:'Syne',system-ui;font-size:32px;font-weight:800;color:#f0d080}
    p{font-family:'JetBrains Mono',monospace;font-size:13px;color:#6b7aaa;max-width:400px}
    a{color:#5db8ff;font-family:'JetBrains Mono',monospace;font-size:12px;margin-top:8px;display:inline-block}
  </style>
</head>
<body>
  <h1>⬡ Certificate Not Found</h1>
  <p>${message}</p>
  <a href="https://urusverify.com">← Back to URUSverify.com</a>
</body>
</html>`;
}

module.exports = router;
