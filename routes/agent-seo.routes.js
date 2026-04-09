/**
 * ═══════════════════════════════════════════════════════════════════
 * URUS VERIFY — Agent Economy SEO Engine
 * Motor de SEO programático para el nicho de trust de agentes IA
 *
 * Rutas:
 *   POST /seo/seed              → genera todas las páginas en DB
 *   GET  /seo/stats             → dashboard de métricas SEO
 *   POST /seo/gsc/submit        → envía URLs a Google Indexing API
 *   GET  /seo/gsc/status        → estado en Google Search Console
 *   GET  /agent/:name           → página pública de un agente
 *   GET  /ecosystem/:name       → página de ecosistema/framework
 *   GET  /ranking/:status       → ranking por status (dominant, verified…)
 *   GET  /compare/:a-vs-:b      → comparación entre dos agentes
 *   GET  /guide/:slug           → guías de intención informacional
 *   GET  /sitemap.xml           → sitemap dinámico completo
 *   GET  /robots.txt            → robots optimizado
 *
 * ENV requeridas:
 *   GSC_SITE_URL               → https://urusverify.com
 *   GSC_SERVICE_ACCOUNT_JSON   → JSON del service account de Google
 *   GSC_VERIFICATION_TOKEN     → token de verificación GSC
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");

// ─── DB helper ────────────────────────────────────────────────────
function db() {
  if (global.__URUS_DB__) return global.__URUS_DB__;
  throw new Error("DB pool not initialized");
}

// ─── Config ───────────────────────────────────────────────────────
const SITE_URL = (process.env.GSC_SITE_URL || "https://urusverify.com").replace(/\/$/, "");

// ─── ESQUEMA DB ───────────────────────────────────────────────────
async function ensureAgentSeoSchema() {
  const pool = db();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seo_agent_pages (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug          TEXT NOT NULL UNIQUE,
      page_type     TEXT NOT NULL,
      agent_name    TEXT,
      ecosystem     TEXT,
      status_label  TEXT,
      agent_a       TEXT,
      agent_b       TEXT,
      guide_topic   TEXT,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL,
      h1            TEXT NOT NULL,
      priority      FLOAT NOT NULL DEFAULT 0.7,
      indexed       BOOLEAN NOT NULL DEFAULT false,
      gsc_submitted_at TIMESTAMPTZ,
      views         INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sap_type    ON seo_agent_pages(page_type);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sap_indexed ON seo_agent_pages(indexed);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sap_slug    ON seo_agent_pages(slug);`);

  console.log("✅ Agent SEO schema ready");
}

ensureAgentSeoSchema().catch(e => console.error("AGENT_SEO_SCHEMA_ERR", e));

// ─── DATOS SEED ───────────────────────────────────────────────────

const ECOSYSTEMS = [
  { id: "fetch-ai",       name: "Fetch.ai",          desc: "Decentralized AI agent network" },
  { id: "langchain",      name: "LangChain",          desc: "Framework for LLM-powered agents" },
  { id: "crewai",         name: "CrewAI",             desc: "Multi-agent orchestration framework" },
  { id: "autogen",        name: "AutoGen",            desc: "Microsoft multi-agent conversation" },
  { id: "agentkit",       name: "AgentKit",           desc: "Coinbase onchain agent toolkit" },
  { id: "vertex-ai",      name: "Vertex AI Agents",  desc: "Google Cloud agent platform" },
  { id: "bedrock",        name: "AWS Bedrock Agents", desc: "Amazon enterprise agent platform" },
  { id: "semantic-kernel",name: "Semantic Kernel",    desc: "Microsoft AI orchestration SDK" },
  { id: "openai-assistants", name: "OpenAI Assistants", desc: "OpenAI native agent runtime" },
  { id: "superagent",     name: "Superagent",         desc: "Open-source agent infrastructure" },
  { id: "e2b",            name: "E2B",                desc: "Sandboxed code execution for agents" },
  { id: "agentops",       name: "AgentOps",           desc: "Agent observability and monitoring" },
];

const STATUS_LABELS = [
  { id: "dominant",    label: "Dominant",    desc: "Top-performing agents with high signal scores" },
  { id: "verified",    label: "Verified",    desc: "Certified identity and strong behavioral record" },
  { id: "high-signal", label: "High Signal", desc: "Agents generating consistent real interactions" },
  { id: "emerging",    label: "Emerging",    desc: "Early-stage agents with growing track record" },
  { id: "noise",       label: "Noise",       desc: "Agents with insufficient verification signals" },
];

const GUIDES = [
  { slug: "how-to-verify-ai-agent",         title: "How to verify an AI agent's identity and reputation" },
  { slug: "ai-agent-trust-score-explained", title: "AI agent trust score explained — what it means and how it works" },
  { slug: "best-autonomous-agents-2025",    title: "Best autonomous AI agents in 2025 by trust score" },
  { slug: "agent-reputation-system",        title: "What is an agent reputation system and why it matters" },
  { slug: "verify-langchain-agent",         title: "How to verify a LangChain agent before production" },
  { slug: "verify-fetchai-agent",           title: "How to verify a Fetch.ai agent — trust and certification" },
  { slug: "ai-agent-certification-guide",   title: "Complete guide to AI agent certification in 2025" },
  { slug: "autonomous-agent-compliance",    title: "AI agent compliance — what EU regulations require" },
  { slug: "agent-scout-score-explained",    title: "Scout score explained — how URUS ranks AI agents" },
  { slug: "multi-agent-trust-verification", title: "Trust verification in multi-agent systems" },
];

// ─── GENERADORES DE PÁGINAS ───────────────────────────────────────

function pageForAgent(agent) {
  const name = agent.name || agent.agent_name || "Unknown";
  const slug = `agent/${slugify(name)}`;
  const score = agent.scout_score || agent.score || 0;
  const status = agent.status || "EMERGING";
  const eco = agent.ecosystem || "";

  return {
    slug,
    page_type: "agent",
    agent_name: name,
    ecosystem: eco,
    title: `${name} — AI Agent Trust Score & Reputation | UrusVerify`,
    description: `Verify ${name}'s trust score, behavioral reputation, and certification status. Scout score: ${Number(score).toFixed(2)}. Status: ${status}. Real interaction data from the live agent ecosystem.`,
    h1: `${name} — Agent Trust Profile`,
    priority: 0.9,
  };
}

function pageForEcosystem(eco) {
  return {
    slug: `ecosystem/${eco.id}`,
    page_type: "ecosystem",
    ecosystem: eco.id,
    title: `${eco.name} Agents — Trust Scores & Rankings | UrusVerify`,
    description: `Browse all ${eco.name} agents ranked by trust score and behavioral reputation. Find verified, dominant, and emerging ${eco.name} agents with real interaction data.`,
    h1: `${eco.name} Agent Rankings`,
    priority: 0.85,
  };
}

function pageForStatus(st) {
  return {
    slug: `ranking/${st.id}`,
    page_type: "ranking",
    status_label: st.id,
    title: `${st.label} AI Agents — Live Leaderboard | UrusVerify`,
    description: `${st.desc}. Live rankings updated in real-time from 11,960+ behavioral signals. Verify any agent before integrating it in production.`,
    h1: `${st.label} Agents — Live Ranking`,
    priority: 0.85,
  };
}

function pageForComparison(a, b) {
  const slug = `compare/${slugify(a)}-vs-${slugify(b)}`;
  return {
    slug,
    page_type: "comparison",
    agent_a: a,
    agent_b: b,
    title: `${a} vs ${b} — AI Agent Trust Comparison | UrusVerify`,
    description: `Compare ${a} vs ${b} side-by-side: trust scores, scout scores, behavioral reputation, interaction count, and certification status. Make informed decisions before integration.`,
    h1: `${a} vs ${b} — Trust Score Comparison`,
    priority: 0.75,
  };
}

function pageForGuide(guide) {
  return {
    slug: `guide/${guide.slug}`,
    page_type: "guide",
    guide_topic: guide.slug,
    title: `${guide.title} | UrusVerify`,
    description: `${guide.title}. Powered by real behavioral data from 284+ agents and 11,960+ verified signals in the live agent ecosystem.`,
    h1: guide.title,
    priority: 0.7,
  };
}

// ─── UTILS ────────────────────────────────────────────────────────

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function upsertPage(pool, page) {
  try {
    await pool.query(
      `INSERT INTO seo_agent_pages
         (slug, page_type, agent_name, ecosystem, status_label, agent_a, agent_b, guide_topic,
          title, description, h1, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         updated_at = now()`,
      [
        page.slug, page.page_type,
        page.agent_name || null, page.ecosystem || null,
        page.status_label || null, page.agent_a || null,
        page.agent_b || null, page.guide_topic || null,
        page.title, page.description, page.h1,
        page.priority || 0.7,
      ]
    );
    return true;
  } catch { return false; }
}

// ─── GOOGLE AUTH ──────────────────────────────────────────────────

async function getGoogleToken() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON not set");

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  })).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${claim}`);
  const sig = sign.sign(sa.private_key.replace(/\\n/g, "\n")).toString("base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${sig}`,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Google token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ─── RUTAS ADMIN ─────────────────────────────────────────────────

/**
 * POST /seo/seed
 * Genera todas las páginas SEO en DB a partir de:
 * 1) Agentes reales en wa_leads / cognitive_profiles / sessions
 * 2) Ecosistemas hardcoded
 * 3) Status rankings
 * 4) Comparaciones top-N × top-N
 * 5) Guías informacionales
 */
router.post("/seed", async (req, res) => {
  try {
    const pool = db();
    let inserted = 0, updated = 0;

    async function run(page) {
      const ok = await upsertPage(pool, page);
      if (ok) inserted++; else updated++;
    }

    // 1. Agentes desde la DB de AgentVerse / trust system
    // Intenta leer desde la tabla que el trust.routes usa
    let agentRows = [];
    try {
      const r = await pool.query(`
        SELECT DISTINCT agent_name as name, ecosystem, scout_score, status
        FROM agent_profiles
        ORDER BY scout_score DESC NULLS LAST
        LIMIT 2000
      `);
      agentRows = r.rows;
    } catch {
      // Fallback: intentar desde sessions o cognitive_profiles
      try {
        const r2 = await pool.query(`
          SELECT DISTINCT
            COALESCE(meta->>'agent_name', meta->>'agentName') as name,
            meta->>'ecosystem' as ecosystem,
            (meta->>'scout_score')::float as scout_score,
            meta->>'status' as status
          FROM sessions
          WHERE meta->>'agent_name' IS NOT NULL
             OR meta->>'agentName' IS NOT NULL
          LIMIT 500
        `);
        agentRows = r2.rows.filter(r => r.name);
      } catch {
        console.log("SEO_SEED: No agent table found, using ecosystem + guide pages only");
      }
    }

    for (const agent of agentRows) {
      if (agent.name) await run(pageForAgent(agent));
    }

    // 2. Ecosistemas
    for (const eco of ECOSYSTEMS) await run(pageForEcosystem(eco));

    // 3. Rankings por status
    for (const st of STATUS_LABELS) await run(pageForStatus(st));

    // 4. Comparaciones (top 30 agentes → ~435 combinaciones únicas)
    if (agentRows.length >= 2) {
      const topAgents = agentRows.slice(0, 30).map(a => a.name).filter(Boolean);
      for (let i = 0; i < topAgents.length; i++) {
        for (let j = i + 1; j < topAgents.length; j++) {
          await run(pageForComparison(topAgents[i], topAgents[j]));
        }
      }
    }

    // 5. Guías informacionales
    for (const guide of GUIDES) await run(pageForGuide(guide));

    // Resumen
    const total = await pool.query("SELECT COUNT(*) FROM seo_agent_pages");
    const totalN = parseInt(total.rows[0].count);

    // Invalidar caché de sitemap
    sitemapCache = null;

    return res.json({
      ok: true,
      agents_found: agentRows.length,
      ecosystems: ECOSYSTEMS.length,
      rankings: STATUS_LABELS.length,
      guides: GUIDES.length,
      comparisons_generated: agentRows.length >= 2
        ? Math.min(30, agentRows.length) * (Math.min(30, agentRows.length) - 1) / 2
        : 0,
      inserted,
      updated,
      total_pages: totalN,
    });
  } catch (e) {
    console.error("SEO_SEED_ERR", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /seo/stats
 */
router.get("/stats", async (req, res) => {
  try {
    const pool = db();
    const [total, byType, submitted, indexed, topViewed] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM seo_agent_pages"),
      pool.query("SELECT page_type, COUNT(*) FROM seo_agent_pages GROUP BY page_type ORDER BY count DESC"),
      pool.query("SELECT COUNT(*) FROM seo_agent_pages WHERE gsc_submitted_at IS NOT NULL"),
      pool.query("SELECT COUNT(*) FROM seo_agent_pages WHERE indexed = true"),
      pool.query("SELECT slug, title, views FROM seo_agent_pages ORDER BY views DESC LIMIT 10"),
    ]);

    return res.json({
      ok: true,
      total: parseInt(total.rows[0].count),
      submitted: parseInt(submitted.rows[0].count),
      indexed: parseInt(indexed.rows[0].count),
      pending: parseInt(total.rows[0].count) - parseInt(submitted.rows[0].count),
      by_type: byType.rows.map(r => ({ type: r.page_type, count: parseInt(r.count) })),
      top_viewed: topViewed.rows,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /seo/gsc/submit
 * Envía hasta 10 URLs por request a la Google Indexing API
 */
router.post("/gsc/submit", async (req, res) => {
  try {
    const pool = db();
    const limit = Math.min(parseInt(req.body?.limit) || 10, 50);

    let slugs = req.body?.slugs;
    if (!slugs?.length) {
      const r = await pool.query(
        `SELECT slug FROM seo_agent_pages
         WHERE gsc_submitted_at IS NULL
         ORDER BY priority DESC, created_at ASC
         LIMIT $1`, [limit]
      );
      slugs = r.rows.map(r => r.slug);
    }

    if (!slugs.length) {
      return res.json({ ok: true, message: "No pending pages", submitted: 0 });
    }

    const token = await getGoogleToken();
    const results = [];

    for (const slug of slugs) {
      const url = `${SITE_URL}/${slug}`;
      try {
        const r = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, type: "URL_UPDATED" }),
        });
        const data = await r.json();
        if (r.ok) {
          await pool.query(
            `UPDATE seo_agent_pages SET gsc_submitted_at = now(), updated_at = now() WHERE slug = $1`,
            [slug]
          );
          results.push({ slug, ok: true });
        } else {
          results.push({ slug, ok: false, error: data });
        }
      } catch (err) {
        results.push({ slug, ok: false, error: err.message });
      }
    }

    return res.json({
      ok: true,
      submitted: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    });
  } catch (e) {
    console.error("GSC_SUBMIT_ERR", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /seo/gsc/status
 */
router.get("/gsc/status", async (req, res) => {
  try {
    const token = await getGoogleToken();
    const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sitesData = await sitesRes.json();
    const sites = sitesData.siteEntry || [];
    const ourSite = sites.find(s => s.siteUrl === SITE_URL || s.siteUrl === SITE_URL + "/");

    if (!ourSite) {
      return res.json({ ok: false, error: "Property not verified in GSC", verified_sites: sites.map(s => s.siteUrl) });
    }

    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);

    const statsRes = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["page"], rowLimit: 20, orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }] }),
      }
    );
    const stats = await statsRes.json();

    return res.json({
      ok: true,
      site: ourSite,
      period: { start, end },
      top_pages: (stats.rows || []).map(r => ({
        page: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: (r.ctr * 100).toFixed(1) + "%",
        position: r.position.toFixed(1),
      })),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /seo/gsc/verify-token
 */
router.get("/gsc/verify-token", (req, res) => {
  const token = process.env.GSC_VERIFICATION_TOKEN || "";
  if (!token) return res.status(404).send("GSC_VERIFICATION_TOKEN not set");
  res.type("text/html").send(`google-site-verification: ${token}.html`);
});

module.exports = router;
module.exports.ECOSYSTEMS = ECOSYSTEMS;
module.exports.STATUS_LABELS = STATUS_LABELS;
module.exports.slugify = slugify;
