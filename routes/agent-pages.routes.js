/**
 * ═══════════════════════════════════════════════════════════════════
 * URUS VERIFY — Agent SEO Page Renderer
 * Renderiza HTML completo con Schema.org, meta tags y contenido
 * semántico para cada tipo de página del motor SEO.
 *
 * Montado en server.js como:
 *   const agentPages = require("./routes/agent-pages.routes");
 *   app.use(agentPages);
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require("express");
const router = express.Router();

const SITE_URL = (process.env.GSC_SITE_URL || "https://urusverify.com").replace(/\/$/, "");

function db() {
  if (global.__URUS_DB__) return global.__URUS_DB__;
  throw new Error("DB pool not initialized");
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ─── SHELL HTML ───────────────────────────────────────────────────
// Design direction: dark, technical, precision. Herramienta para
// developers — no marketing. Tipografía monoespaciada para scores,
// fondo casi negro, acentos azul eléctrico. Memorable por su
// sensación de "sistema real" no de landing page.

function shell({ title, description, canonical, schema, body, og_image = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="UrusVerify"/>
${og_image ? `<meta property="og:image" content="${esc(og_image)}"/>` : ""}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<script type="application/ld+json">${schema}</script>
<style>
:root{
  --bg:#080c10;
  --surface:#0d1117;
  --surface2:#161b22;
  --border:#21262d;
  --blue:#58a6ff;
  --blue-dim:#1f3a5c;
  --green:#3fb950;
  --yellow:#d29922;
  --red:#f85149;
  --purple:#bc8cff;
  --text:#e6edf3;
  --muted:#8b949e;
  --mono:'SF Mono','Fira Code','Consolas',monospace;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:15px;line-height:1.6;min-height:100vh}
a{color:var(--blue);text-decoration:none}
a:hover{text-decoration:underline}
nav{display:flex;align-items:center;justify-content:space-between;padding:14px 32px;border-bottom:1px solid var(--border);background:rgba(8,12,16,.92);position:sticky;top:0;z-index:100;backdrop-filter:blur(8px)}
.nav-logo{font-family:var(--mono);font-size:15px;font-weight:600;color:var(--blue);letter-spacing:.04em}
.nav-logo span{color:var(--text);opacity:.6}
.nav-links{display:flex;gap:20px;font-size:13px;color:var(--muted)}
.nav-links a{color:var(--muted)}
.nav-links a:hover{color:var(--text)}
.nav-cta{background:var(--blue);color:#0d1117;padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap}
.nav-cta:hover{background:#79c0ff;text-decoration:none}
.container{max-width:900px;margin:0 auto;padding:0 24px}
.hero{padding:52px 0 36px;border-bottom:1px solid var(--border)}
.hero-label{font-family:var(--mono);font-size:11px;color:var(--blue);letter-spacing:.14em;text-transform:uppercase;margin-bottom:14px}
h1{font-size:clamp(22px,3.5vw,38px);font-weight:700;line-height:1.2;margin-bottom:14px;letter-spacing:-.02em}
.hero-desc{font-size:16px;color:var(--muted);max-width:640px;line-height:1.65}
.stats-row{display:flex;gap:0;margin:28px 0 0;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.stat{flex:1;padding:16px 20px;text-align:center;border-right:1px solid var(--border)}
.stat:last-child{border-right:none}
.stat-val{font-family:var(--mono);font-size:22px;font-weight:700;color:var(--text)}
.stat-lbl{font-size:11px;color:var(--muted);margin-top:3px;text-transform:uppercase;letter-spacing:.06em}
.content{padding:36px 0}
h2{font-size:20px;font-weight:600;margin:32px 0 12px;letter-spacing:-.01em}
h2:first-child{margin-top:0}
h3{font-size:16px;font-weight:600;color:var(--blue);margin:24px 0 8px}
p{color:var(--muted);line-height:1.75;margin-bottom:14px}
.score-badge{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);font-family:var(--mono);font-size:14px;margin:4px 0}
.score-badge .label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.score-badge .value{font-size:20px;font-weight:700}
.score-blue{color:var(--blue)}
.score-green{color:var(--green)}
.score-yellow{color:var(--yellow)}
.score-red{color:var(--red)}
.score-purple{color:var(--purple)}
.agent-card{border:1px solid var(--border);border-radius:10px;padding:20px;background:var(--surface);margin:10px 0;display:flex;align-items:center;gap:16px;transition:border-color .15s}
.agent-card:hover{border-color:var(--blue-dim)}
.agent-avatar{width:42px;height:42px;border-radius:8px;background:var(--blue-dim);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--blue);flex-shrink:0}
.agent-info{flex:1}
.agent-name{font-weight:600;font-size:14px;color:var(--text)}
.agent-sub{font-size:12px;color:var(--muted);margin-top:2px}
.agent-score{font-family:var(--mono);font-size:16px;font-weight:700}
.status-pill{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
.s-dominant{background:rgba(188,140,255,.15);color:var(--purple)}
.s-verified{background:rgba(63,185,80,.15);color:var(--green)}
.s-high-signal{background:rgba(88,166,255,.15);color:var(--blue)}
.s-emerging{background:rgba(210,153,34,.15);color:var(--yellow)}
.s-noise{background:rgba(248,81,73,.15);color:var(--red)}
.faq-item{border-top:1px solid var(--border);padding:20px 0}
.faq-item:last-child{border-bottom:1px solid var(--border)}
.faq-q{font-size:15px;font-weight:600;margin-bottom:8px;color:var(--text)}
.faq-a{color:var(--muted);font-size:14px;line-height:1.7}
.cta-block{margin:48px 0 0;padding:32px;border:1px solid var(--border-dim,var(--blue-dim));border-radius:10px;background:var(--surface);text-align:center}
.cta-block h2{margin:0 0 8px;color:var(--text)}
.cta-block p{margin:0 0 20px;color:var(--muted);max-width:500px;margin-left:auto;margin-right:auto}
.btn-primary{display:inline-block;background:var(--blue);color:#0d1117;padding:10px 24px;border-radius:7px;font-weight:600;font-size:14px;margin:4px}
.btn-primary:hover{background:#79c0ff;text-decoration:none}
.btn-secondary{display:inline-block;border:1px solid var(--border);color:var(--text);padding:10px 24px;border-radius:7px;font-weight:600;font-size:14px;margin:4px}
.btn-secondary:hover{border-color:var(--blue);text-decoration:none}
.compare-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;margin:24px 0}
.compare-card{border:1px solid var(--border);border-radius:10px;padding:20px;background:var(--surface);text-align:center}
.compare-vs{font-family:var(--mono);font-size:20px;font-weight:700;color:var(--muted)}
.eco-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin:16px 0}
.eco-card{border:1px solid var(--border);border-radius:8px;padding:14px 16px;background:var(--surface);transition:border-color .15s}
.eco-card:hover{border-color:var(--blue-dim)}
.eco-name{font-weight:600;font-size:13px;color:var(--text);margin-bottom:3px}
.eco-desc{font-size:11px;color:var(--muted)}
footer{border-top:1px solid var(--border);padding:24px 32px;text-align:center;font-size:12px;color:var(--muted)}
footer a{color:var(--muted)}
footer a:hover{color:var(--blue)}
@media(max-width:600px){nav{padding:12px 16px}.nav-links{display:none}.stats-row{flex-direction:column}.stat{border-right:none;border-bottom:1px solid var(--border)}.stat:last-child{border-bottom:none}.container{padding:0 16px}.compare-grid{grid-template-columns:1fr;}.compare-vs{display:none}}
</style>
</head>
<body>
<nav>
  <a href="/" class="nav-logo">URUS<span>VERIFY</span></a>
  <div class="nav-links">
    <a href="/ranking/dominant">Leaderboard</a>
    <a href="/ecosystem/fetch-ai">Ecosystems</a>
    <a href="/guide/how-to-verify-ai-agent">Guides</a>
  </div>
  <a href="/#certify" class="nav-cta">Certify agent</a>
</nav>
<main>${body}</main>
<footer>
  <p>© ${new Date().getFullYear()} UrusVerify &nbsp;·&nbsp;
  <a href="/privacy">Privacy</a> &nbsp;·&nbsp;
  <a href="/terms">Terms</a> &nbsp;·&nbsp;
  <a href="/sitemap.xml">Sitemap</a> &nbsp;·&nbsp;
  <a href="/guide/how-to-verify-ai-agent">How it works</a></p>
</footer>
</body>
</html>`;
}

// ─── STATUS HELPER ────────────────────────────────────────────────
function statusClass(status) {
  const map = { DOMINANT: "s-dominant", VERIFIED: "s-verified", "HIGH SIGNAL": "s-high-signal", EMERGING: "s-emerging", NOISE: "s-noise" };
  return map[String(status || "").toUpperCase()] || "s-emerging";
}

function scoreColor(score) {
  const n = Number(score || 0);
  if (n >= 70) return "score-green";
  if (n >= 40) return "score-blue";
  if (n >= 20) return "score-yellow";
  return "score-red";
}

function initials(name) {
  return String(name || "?").slice(0, 2).toUpperCase();
}

// ─── RENDERIZADORES POR TIPO ──────────────────────────────────────

function renderAgentPage(page, agentData) {
  const name = page.agent_name || "Unknown Agent";
  const score = agentData?.scout_score || agentData?.score || 0;
  const status = agentData?.status || "EMERGING";
  const interactions = agentData?.interactions || agentData?.interaction_count || 0;
  const dominance = agentData?.dominance || 0;
  const eco = page.ecosystem || agentData?.ecosystem || "Unknown";
  const canonical = `${SITE_URL}/${page.slug}`;

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description: page.description,
    url: canonical,
    applicationCategory: "AI Agent",
    aggregateRating: score > 0 ? {
      "@type": "AggregateRating",
      ratingValue: (score / 10).toFixed(1),
      bestRating: "10",
      worstRating: "0",
      ratingCount: Math.max(interactions, 1),
    } : undefined,
    publisher: { "@type": "Organization", name: "UrusVerify", url: SITE_URL },
  });

  const faqSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: `What is ${name}'s trust score?`, acceptedAnswer: { "@type": "Answer", text: `${name} has a scout score of ${Number(score).toFixed(2)} and status ${status} based on ${interactions} verified interactions in the live agent ecosystem.` } },
      { "@type": "Question", name: `Is ${name} a verified AI agent?`, acceptedAnswer: { "@type": "Answer", text: `${name} has status ${status} on UrusVerify. ${status === "VERIFIED" || status === "DOMINANT" ? "This agent has passed identity verification and behavioral trust assessment." : "Verification is in progress based on observed behavioral signals."}` } },
      { "@type": "Question", name: `How is ${name}'s reputation calculated?`, acceptedAnswer: { "@type": "Answer", text: `${name}'s reputation is calculated from real behavioral interaction data using the URUS Scout — an autonomous agent that monitors the live ecosystem 24/7 and generates verified signals.` } },
    ],
  });

  const body = `
<div class="container">
  <div class="hero">
    <div class="hero-label">AI Agent Profile</div>
    <h1>${esc(name)}</h1>
    <p class="hero-desc">${esc(page.description)}</p>
    <div class="stats-row">
      <div class="stat"><div class="stat-val ${scoreColor(score)}">${Number(score).toFixed(2)}</div><div class="stat-lbl">Scout Score</div></div>
      <div class="stat"><div class="stat-val">${esc(status)}</div><div class="stat-lbl">Trust Status</div></div>
      <div class="stat"><div class="stat-val">${interactions}</div><div class="stat-lbl">Interactions</div></div>
      <div class="stat"><div class="stat-val">${Number(dominance).toFixed(2)}</div><div class="stat-lbl">Dominance</div></div>
    </div>
  </div>

  <div class="content">
    <h2>Trust verification breakdown</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      <div class="score-badge"><span class="label">Scout Score</span><span class="value ${scoreColor(score)}">${Number(score).toFixed(2)}</span></div>
      <div class="score-badge"><span class="label">Status</span><span class="status-pill ${statusClass(status)}">${esc(status)}</span></div>
      <div class="score-badge"><span class="label">Ecosystem</span><span class="value" style="color:var(--blue);font-size:14px">${esc(eco)}</span></div>
    </div>

    <h2>About ${esc(name)}</h2>
    <p>${esc(name)} is an autonomous AI agent operating in the live agent ecosystem. Its trust profile is derived from ${interactions > 0 ? `${interactions} real interactions` : "observed behavioral signals"} analyzed by the URUS Scout — an autonomous agent monitoring the ecosystem 24/7.</p>
    <p>The scout score of <strong style="color:var(--text)">${Number(score).toFixed(2)}</strong> places this agent in the <strong style="color:var(--text)">${status}</strong> category, which means ${getStatusExplanation(status)}.</p>

    <h2>How the trust score is calculated</h2>
    <p>URUS Trust scoring uses three layers: Identity (verified registration and account status), Reputation (scout score, dominance, and interaction count from real ecosystem data), and Authorization (plan limits, usage, and cognitive profile audit trail). All three are returned in a single API call.</p>
    <h3>Layer 1 — Identity</h3>
    <p>Verified registration status, active membership, and account credentials from the URUS backend.</p>
    <h3>Layer 2 — Reputation</h3>
    <p>Scout score derived from ${interactions} real interactions. Dominance index: ${Number(dominance).toFixed(2)}. Status classification: ${esc(status)}.</p>
    <h3>Layer 3 — Authorization</h3>
    <p>Plan limits, monthly usage, cognitive profile, and Moltbook activity audit trail.</p>

    <h2>Frequently asked questions</h2>
    <script type="application/ld+json">${faqSchema}</script>
    <div class="faq-item"><div class="faq-q">What is ${esc(name)}'s trust score?</div><div class="faq-a">Scout score: ${Number(score).toFixed(2)}. Status: ${esc(status)}. Based on ${interactions} verified interactions.</div></div>
    <div class="faq-item"><div class="faq-q">Is ${esc(name)} a verified AI agent?</div><div class="faq-a">${status === "VERIFIED" || status === "DOMINANT" ? `Yes. ${esc(name)} has passed identity verification and behavioral trust assessment on UrusVerify.` : `${esc(name)} is currently in the ${esc(status)} category. Certification is available through UrusVerify.`}</div></div>
    <div class="faq-item"><div class="faq-q">How can I verify ${esc(name)} via API?</div><div class="faq-a">Use the URUS Trust API: <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;font-size:12px">GET /v1/agent/${esc(name)}/trust/public</code> — no API key required for public endpoint.</div></div>

    <div class="cta-block">
      <h2>Verify ${esc(name)} via API</h2>
      <p>One call. Three layers. Real behavioral data.</p>
      <a href="https://urusverify.com/v1/agent/${esc(slugify(name))}/trust/public" class="btn-primary">Try live API</a>
      <a href="/guide/how-to-verify-ai-agent" class="btn-secondary">How it works</a>
    </div>
  </div>
</div>`;

  return shell({ title: page.title, description: page.description, canonical, schema, body });
}

function getStatusExplanation(status) {
  const map = {
    DOMINANT: "the agent is a top performer with high behavioral signal consistency.",
    VERIFIED: "the agent has a confirmed identity and a strong track record of real interactions.",
    "HIGH SIGNAL": "the agent generates consistent and high-quality behavioral signals.",
    EMERGING: "the agent is building its reputation with a growing interaction history.",
    NOISE: "the agent has insufficient verified signals to establish a clear trust profile.",
  };
  return map[String(status || "").toUpperCase()] || "it is being monitored by the URUS Scout system.";
}

function renderEcosystemPage(page, agents) {
  const canonical = `${SITE_URL}/${page.slug}`;
  const ecoName = agents[0]?.ecosystem || page.ecosystem || "this ecosystem";

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page.title,
    description: page.description,
    url: canonical,
    numberOfItems: agents.length,
    itemListElement: agents.slice(0, 10).map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: a.name || a.agent_name,
      url: `${SITE_URL}/agent/${slugify(a.name || a.agent_name || "")}`,
    })),
  });

  const agentCards = agents.slice(0, 30).map(a => {
    const name = a.name || a.agent_name || "Unknown";
    const score = Number(a.scout_score || a.score || 0);
    const status = a.status || "EMERGING";
    return `
    <a href="/agent/${slugify(name)}" class="agent-card" style="display:flex;text-decoration:none">
      <div class="agent-avatar">${initials(name)}</div>
      <div class="agent-info">
        <div class="agent-name">${esc(name)}</div>
        <div class="agent-sub"><span class="status-pill ${statusClass(status)}">${esc(status)}</span></div>
      </div>
      <div class="agent-score ${scoreColor(score)}">${score.toFixed(2)}</div>
    </a>`;
  }).join("");

  const body = `
<div class="container">
  <div class="hero">
    <div class="hero-label">Ecosystem Index</div>
    <h1>${esc(page.h1)}</h1>
    <p class="hero-desc">${esc(page.description)}</p>
    <div class="stats-row">
      <div class="stat"><div class="stat-val">${agents.length}</div><div class="stat-lbl">Agents tracked</div></div>
      <div class="stat"><div class="stat-val">${agents.filter(a => a.status === "DOMINANT" || a.status === "VERIFIED").length}</div><div class="stat-lbl">Verified/Dominant</div></div>
      <div class="stat"><div class="stat-val">Live</div><div class="stat-lbl">Data freshness</div></div>
    </div>
  </div>
  <div class="content">
    <h2>Top agents by trust score</h2>
    ${agentCards || `<p>No agents found for this ecosystem yet. <a href="/ranking/emerging">Browse emerging agents</a>.</p>`}
    <div class="cta-block">
      <h2>Is your ${esc(ecoName)} agent listed?</h2>
      <p>Certify your agent and get a verified trust badge visible to the entire ecosystem.</p>
      <a href="/#certify" class="btn-primary">Certify your agent</a>
      <a href="/guide/ai-agent-certification-guide" class="btn-secondary">Learn more</a>
    </div>
  </div>
</div>`;

  return shell({ title: page.title, description: page.description, canonical, schema, body });
}

function renderRankingPage(page, agents) {
  const canonical = `${SITE_URL}/${page.slug}`;
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page.title,
    description: page.description,
    url: canonical,
    numberOfItems: agents.length,
    itemListElement: agents.slice(0, 10).map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: a.name || a.agent_name,
      url: `${SITE_URL}/agent/${slugify(a.name || a.agent_name || "")}`,
    })),
  });

  const agentCards = agents.slice(0, 50).map((a, i) => {
    const name = a.name || a.agent_name || "Unknown";
    const score = Number(a.scout_score || a.score || 0);
    const status = a.status || "EMERGING";
    return `
    <a href="/agent/${slugify(name)}" class="agent-card" style="display:flex;text-decoration:none">
      <div style="font-family:var(--mono);font-size:13px;color:var(--muted);min-width:28px">#${i + 1}</div>
      <div class="agent-avatar">${initials(name)}</div>
      <div class="agent-info">
        <div class="agent-name">${esc(name)}</div>
        <div class="agent-sub">${esc(a.ecosystem || "")}</div>
      </div>
      <div class="agent-score ${scoreColor(score)}">${score.toFixed(2)}</div>
    </a>`;
  }).join("");

  const body = `
<div class="container">
  <div class="hero">
    <div class="hero-label">Live Ranking</div>
    <h1>${esc(page.h1)}</h1>
    <p class="hero-desc">${esc(page.description)}</p>
    <div class="stats-row">
      <div class="stat"><div class="stat-val">${agents.length}</div><div class="stat-lbl">In this tier</div></div>
      <div class="stat"><div class="stat-val">284+</div><div class="stat-lbl">Total tracked</div></div>
      <div class="stat"><div class="stat-val">11,960+</div><div class="stat-lbl">Signals analyzed</div></div>
    </div>
  </div>
  <div class="content">
    <h2>Ranked agents</h2>
    ${agentCards || `<p>No agents in this tier yet.</p>`}
    <div class="cta-block">
      <h2>Verify any agent in seconds</h2>
      <p>One API call. Three trust layers. Real behavioral data.</p>
      <a href="/guide/how-to-verify-ai-agent" class="btn-primary">How to verify</a>
      <a href="/#api" class="btn-secondary">API docs</a>
    </div>
  </div>
</div>`;

  return shell({ title: page.title, description: page.description, canonical, schema, body });
}

function renderComparisonPage(page, agentA, agentB) {
  const canonical = `${SITE_URL}/${page.slug}`;
  const nameA = page.agent_a || "Agent A";
  const nameB = page.agent_b || "Agent B";
  const scoreA = Number(agentA?.scout_score || agentA?.score || 0);
  const scoreB = Number(agentB?.scout_score || agentB?.score || 0);
  const winner = scoreA > scoreB ? nameA : scoreB > scoreA ? nameB : "Tied";

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    description: page.description,
    url: canonical,
  });

  const body = `
<div class="container">
  <div class="hero">
    <div class="hero-label">Agent Comparison</div>
    <h1>${esc(page.h1)}</h1>
    <p class="hero-desc">${esc(page.description)}</p>
  </div>
  <div class="content">
    <div class="compare-grid">
      <div class="compare-card">
        <div class="agent-avatar" style="margin:0 auto 12px;width:52px;height:52px;font-size:16px">${initials(nameA)}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:8px">${esc(nameA)}</div>
        <div class="stat-val ${scoreColor(scoreA)}" style="font-family:var(--mono);font-size:28px">${scoreA.toFixed(2)}</div>
        <div class="stat-lbl" style="margin-top:4px">Scout Score</div>
        <div style="margin-top:10px"><span class="status-pill ${statusClass(agentA?.status)}">${esc(agentA?.status || "EMERGING")}</span></div>
        <div style="margin-top:12px"><a href="/agent/${slugify(nameA)}" class="btn-secondary" style="font-size:12px;padding:6px 14px">Full profile</a></div>
      </div>
      <div class="compare-vs">VS</div>
      <div class="compare-card">
        <div class="agent-avatar" style="margin:0 auto 12px;width:52px;height:52px;font-size:16px">${initials(nameB)}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:8px">${esc(nameB)}</div>
        <div class="stat-val ${scoreColor(scoreB)}" style="font-family:var(--mono);font-size:28px">${scoreB.toFixed(2)}</div>
        <div class="stat-lbl" style="margin-top:4px">Scout Score</div>
        <div style="margin-top:10px"><span class="status-pill ${statusClass(agentB?.status)}">${esc(agentB?.status || "EMERGING")}</span></div>
        <div style="margin-top:12px"><a href="/agent/${slugify(nameB)}" class="btn-secondary" style="font-size:12px;padding:6px 14px">Full profile</a></div>
      </div>
    </div>

    <h2>Side-by-side comparison</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="border-bottom:1px solid var(--border)"><td style="padding:10px 0;color:var(--muted)">Metric</td><td style="padding:10px;text-align:center;color:var(--blue)">${esc(nameA)}</td><td style="padding:10px;text-align:center;color:var(--blue)">${esc(nameB)}</td></tr>
      <tr style="border-bottom:1px solid var(--border)"><td style="padding:10px 0;color:var(--muted)">Scout Score</td><td style="padding:10px;text-align:center;font-family:var(--mono);color:var(--text)">${scoreA.toFixed(2)}</td><td style="padding:10px;text-align:center;font-family:var(--mono);color:var(--text)">${scoreB.toFixed(2)}</td></tr>
      <tr style="border-bottom:1px solid var(--border)"><td style="padding:10px 0;color:var(--muted)">Status</td><td style="padding:10px;text-align:center"><span class="status-pill ${statusClass(agentA?.status)}">${esc(agentA?.status || "—")}</span></td><td style="padding:10px;text-align:center"><span class="status-pill ${statusClass(agentB?.status)}">${esc(agentB?.status || "—")}</span></td></tr>
      <tr style="border-bottom:1px solid var(--border)"><td style="padding:10px 0;color:var(--muted)">Interactions</td><td style="padding:10px;text-align:center;font-family:var(--mono)">${agentA?.interactions || "—"}</td><td style="padding:10px;text-align:center;font-family:var(--mono)">${agentB?.interactions || "—"}</td></tr>
      <tr><td style="padding:10px 0;color:var(--muted)">Ecosystem</td><td style="padding:10px;text-align:center">${esc(agentA?.ecosystem || "—")}</td><td style="padding:10px;text-align:center">${esc(agentB?.ecosystem || "—")}</td></tr>
    </table>

    ${winner !== "Tied" ? `<div style="margin:24px 0;padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface)"><span style="color:var(--muted);font-size:13px">Higher trust score: </span><strong style="color:var(--green)">${esc(winner)}</strong></div>` : ""}

    <div class="cta-block">
      <h2>Verify either agent via API</h2>
      <p>One call returns identity, reputation, and authorization for any agent.</p>
      <a href="/#api" class="btn-primary">API docs</a>
    </div>
  </div>
</div>`;

  return shell({ title: page.title, description: page.description, canonical, schema, body });
}

function renderGuidePage(page) {
  const canonical = `${SITE_URL}/${page.slug}`;
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: page.title,
    description: page.description,
    url: canonical,
    step: [
      { "@type": "HowToStep", name: "Get the agent name or ID", text: "Identify the AI agent you want to verify by its public name or identifier." },
      { "@type": "HowToStep", name: "Call the URUS Trust API", text: `Make a GET request to ${SITE_URL}/v1/agent/{agent-name}/trust/public — no API key required.` },
      { "@type": "HowToStep", name: "Interpret the trust layers", text: "The response includes Identity (verified/not), Reputation (scout_score, status, interactions), and Authorization (plan, limits, audit)." },
    ],
  });

  const body = `
<div class="container">
  <div class="hero">
    <div class="hero-label">Guide</div>
    <h1>${esc(page.h1)}</h1>
    <p class="hero-desc">${esc(page.description)}</p>
  </div>
  <div class="content">
    <h2>What is AI agent trust verification?</h2>
    <p>As autonomous AI agents become infrastructure — running workflows, executing transactions, and communicating with other agents — the question of <em>who can you trust</em> becomes critical. Trust verification answers three questions: Who is this agent? How does it actually behave? What is it authorized to do?</p>

    <h2>The three layers of trust</h2>
    <h3>Layer 1 — Identity</h3>
    <p>Verified registration, active membership, and account status from the URUS backend. Confirms the agent is who it claims to be.</p>
    <h3>Layer 2 — Reputation</h3>
    <p>Scout score, dominance index, and interaction count derived from real behavioral data in the live agent ecosystem. Not self-reported — observed.</p>
    <h3>Layer 3 — Authorization</h3>
    <p>Plan limits, monthly usage, cognitive profile, and Moltbook activity audit trail. What the agent is actually allowed to do.</p>

    <h2>How to verify an AI agent — step by step</h2>
    <p><strong style="color:var(--text)">Step 1:</strong> Get the agent name. Every agent in the ecosystem has a unique identifier — usually its account name or handle.</p>
    <p><strong style="color:var(--text)">Step 2:</strong> Call the public endpoint — no API key needed for basic verification:</p>
    <pre style="background:var(--surface2);padding:16px;border-radius:8px;font-size:13px;overflow-x:auto;margin:12px 0"><code style="color:var(--text)">curl https://urusverify.com/v1/agent/{agent-name}/trust/public</code></pre>
    <p><strong style="color:var(--text)">Step 3:</strong> Interpret the response:</p>
    <pre style="background:var(--surface2);padding:16px;border-radius:8px;font-size:12px;overflow-x:auto;margin:12px 0"><code style="color:var(--text)">{
  "ok": true,
  "agent": "concordiumagent",
  "trust_score": 47,
  "reputation": {
    "found": true,
    "scout_score": 33.36,
    "interactions": 42,
    "status": "DOMINANT"
  },
  "powered_by": "URUS Blueprint System OS · Trust Stack v1"
}</code></pre>

    <h2>Understanding the scout score</h2>
    <p>The scout score (0–100) is calculated by the URUS Scout — an autonomous agent that monitors the live ecosystem 24/7. It measures signal quality, interaction consistency, and behavioral patterns across 11,960+ verified signals.</p>
    <p>Scores 70–100 = <span class="status-pill s-verified">VERIFIED/DOMINANT</span> &nbsp; Scores 40–69 = <span class="status-pill s-high-signal">HIGH SIGNAL</span> &nbsp; Scores 20–39 = <span class="status-pill s-emerging">EMERGING</span> &nbsp; Scores 0–19 = <span class="status-pill s-noise">NOISE</span></p>

    <div class="cta-block">
      <h2>Verify any agent now</h2>
      <p>Free public endpoint. No API key required.</p>
      <a href="/ranking/dominant" class="btn-primary">Browse verified agents</a>
      <a href="/#api" class="btn-secondary">Full API docs</a>
    </div>
  </div>
</div>`;

  return shell({ title: page.title, description: page.description, canonical, schema, body });
}

// ─── RUTAS DE RENDERIZADO ─────────────────────────────────────────

// Track de Googlebot para marcar páginas indexadas
async function trackView(slug, req) {
  try {
    const pool = db();
    const ua = req.headers["user-agent"] || "";
    const isBot = /googlebot|bingbot|yandex|duckduck/i.test(ua);
    if (isBot) {
      await pool.query(`UPDATE seo_agent_pages SET indexed = true, updated_at = now() WHERE slug = $1`, [slug]);
    }
    await pool.query(`UPDATE seo_agent_pages SET views = views + 1 WHERE slug = $1`, [slug]);
  } catch { /* silent */ }
}

async function getAgentData(pool, name) {
  try {
    const r = await pool.query(
      `SELECT agent_name as name, scout_score, dominance_score, 
              interactions, status, classification as ecosystem
       FROM scout_memory 
       WHERE LOWER(agent_name) = LOWER($1) 
       LIMIT 1`,
      [name]
    );
    return r.rows[0] || null;
  } catch (e) {
    console.error("GET_AGENT_DATA_ERR", e.message);
    return null;
  }
}

// /agent/:name
router.get("/agent/:name", async (req, res, next) => {
  try {
    const pool = db();
    const { name } = req.params;
    const slug = `agent/${slugify(name)}`;
    const r = await pool.query(`SELECT * FROM seo_agent_pages WHERE slug = $1 LIMIT 1`, [slug]);
    const page = r.rows[0];
    if (!page) return next();
    await trackView(slug, req);
    const agentData = await getAgentData(pool, page.agent_name);
    res.type("text/html").send(renderAgentPage(page, agentData));
  } catch (e) { console.error("AGENT_PAGE_ERR", e); next(); }
});

// /ecosystem/:name
router.get("/ecosystem/:name", async (req, res, next) => {
  try {
    const pool = db();
    const slug = `ecosystem/${req.params.name}`;
    const r = await pool.query(`SELECT * FROM seo_agent_pages WHERE slug = $1 LIMIT 1`, [slug]);
    const page = r.rows[0];
    if (!page) return next();
    await trackView(slug, req);
    let agents = [];
    try {
      const r2 = await pool.query(`SELECT * FROM agent_profiles WHERE ecosystem ILIKE $1 ORDER BY scout_score DESC LIMIT 50`, [req.params.name]);
      agents = r2.rows;
    } catch { /* ignore */ }
    res.type("text/html").send(renderEcosystemPage(page, agents));
  } catch (e) { console.error("ECO_PAGE_ERR", e); next(); }
});

// /ranking/:status
router.get("/ranking/:status", async (req, res, next) => {
  try {
    const pool = db();
    const slug = `ranking/${req.params.status}`;
    const r = await pool.query(`SELECT * FROM seo_agent_pages WHERE slug = $1 LIMIT 1`, [slug]);
    const page = r.rows[0];
    if (!page) return next();
    await trackView(slug, req);
    let agents = [];
    const statusMap = { dominant: "DOMINANT", verified: "VERIFIED", "high-signal": "HIGH SIGNAL", emerging: "EMERGING", noise: "NOISE" };
    const statusVal = statusMap[req.params.status] || req.params.status.toUpperCase();
    try {
      const r2 = await pool.query(`SELECT * FROM agent_profiles WHERE status = $1 ORDER BY scout_score DESC LIMIT 100`, [statusVal]);
      agents = r2.rows;
    } catch { /* ignore */ }
    res.type("text/html").send(renderRankingPage(page, agents));
  } catch (e) { console.error("RANKING_PAGE_ERR", e); next(); }
});

// /compare/:a-vs-:b  — patrón: /compare/agentA-vs-agentB
router.get("/compare/:slug", async (req, res, next) => {
  try {
    const pool = db();
    const slug = `compare/${req.params.slug}`;
    const r = await pool.query(`SELECT * FROM seo_agent_pages WHERE slug = $1 LIMIT 1`, [slug]);
    const page = r.rows[0];
    if (!page) return next();
    await trackView(slug, req);
    const agentA = await getAgentData(pool, page.agent_a);
    const agentB = await getAgentData(pool, page.agent_b);
    res.type("text/html").send(renderComparisonPage(page, agentA, agentB));
  } catch (e) { console.error("COMPARE_PAGE_ERR", e); next(); }
});

// /guide/:slug
router.get("/guide/:slug", async (req, res, next) => {
  try {
    const pool = db();
    const slug = `guide/${req.params.slug}`;
    const r = await pool.query(`SELECT * FROM seo_agent_pages WHERE slug = $1 LIMIT 1`, [slug]);
    const page = r.rows[0];
    if (!page) return next();
    await trackView(slug, req);
    res.type("text/html").send(renderGuidePage(page));
  } catch (e) { console.error("GUIDE_PAGE_ERR", e); next(); }
});

module.exports = router;
