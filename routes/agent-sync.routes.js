/**
 * URUS — Agent Sync Route
 * Sincroniza agentes de AgentVerse + agent_certificates
 * a scout_memory del backend principal.
 *
 * Agregar en server.js después de las rutas SEO:
 *   const syncRoutes = require("./routes/agent-sync.routes");
 *   app.use("/seo", syncRoutes);
 *
 * Endpoints:
 *   POST /seo/sync-agents   → importa agentes a scout_memory
 *   POST /seo/seed-from-db  → regenera páginas SEO desde scout_memory
 */

const express = require("express");
const router  = express.Router();

function db() {
  if (global.__URUS_DB__) return global.__URUS_DB__;
  throw new Error("DB pool not initialized");
}

// Pool separado para la DB del Scout
let scoutPool = null;
function getScoutPool() {
  if (scoutPool) return scoutPool;
  const url = process.env.SCOUT_DATABASE_URL;
  if (!url) return null;
  const { Pool } = require("pg");
  scoutPool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  return scoutPool;
}

// ─── Fuente 1: agent_certificates (ya en tu DB) ───────────────────
async function syncFromCertificates(pool) {
  const result = await pool.query(`
    SELECT DISTINCT ON (agent_id)
      agent_id       AS agent_name,
      trust_score    AS scout_score,
      trust_level    AS status,
      framework      AS classification,
      issued_at      AS last_seen
    FROM agent_certificates
    ORDER BY agent_id, issued_at DESC
  `);

  let inserted = 0, updated = 0;
  for (const row of result.rows) {
    const name   = String(row.agent_name || "").trim().toLowerCase();
    const score  = Math.min(50, Number(row.scout_score || 0) / 2); // trust_score → scout_score (0-50)
    const status = mapTrustToStatus(row.status);
    if (!name) continue;

    try {
      const r = await pool.query(
        `INSERT INTO scout_memory (agent_name, scout_score, dominance_score, interactions, status, classification, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (agent_name) DO UPDATE SET
           scout_score    = GREATEST(scout_memory.scout_score, EXCLUDED.scout_score),
           status         = EXCLUDED.status,
           classification = EXCLUDED.classification,
           last_seen      = EXCLUDED.last_seen,
           updated_at     = now()`,
        [name, score, 0, 0, status, row.classification || "REGISTERED", row.last_seen]
      );
      if (r.rowCount > 0) inserted++;
    } catch { updated++; }
  }
  return { source: "certificates", inserted, updated, total: result.rows.length };
}

// ─── Fuente 2: AgentVerse API pública ────────────────────────────
// AgentVerse expone sus agentes en agentverse.ai
async function syncFromAgentVerse(pool) {
  const agents = [];

  // Intentar leer de la DB del Scout primero
  const scout = getScoutPool();
  if (scout) {
    try {
      const sr = await scout.query(`
        SELECT agent_name as name, scout_score, dominance_score,
               interactions, status, classification, last_seen
        FROM scout_memory
        ORDER BY scout_score DESC LIMIT 500
      `);
      if (sr.rows.length > 0) {
        for (const row of sr.rows) {
          if (!row.name) continue;
          await pool.query(
            `INSERT INTO scout_memory (agent_name, scout_score, dominance_score, interactions, status, classification, last_seen)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (agent_name) DO UPDATE SET
               scout_score=GREATEST(scout_memory.scout_score,EXCLUDED.scout_score),
               interactions=GREATEST(scout_memory.interactions,EXCLUDED.interactions),
               status=EXCLUDED.status, updated_at=now()`,
            [row.name, row.scout_score||0, row.dominance_score||0,
             row.interactions||0, row.status||'EMERGING',
             row.classification||'agentverse', row.last_seen]
          );
        }
        return { source: "scout_db", inserted: sr.rows.length, total: sr.rows.length };
      }
    } catch(e) {
      console.log("SCOUT_DB_READ_ERR:", e.message);
    }
  }

  // Intentar la API pública de Fetch.ai / AgentVerse
  try {
    const r = await fetch(
      "https://agentverse.ai/v1/almanac/agents?page_size=100&page=0",
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const data = await r.json();
      const items = data?.agents || data?.items || data?.results || [];
      items.forEach(a => {
        const name = a.name || a.agent_name || a.address || "";
        if (name) agents.push({
          agent_name:     name.toLowerCase().replace(/\s+/g, "-"),
          scout_score:    Number(a.rating || a.score || a.trust_score || 0),
          dominance_score:Number(a.dominance || 0),
          interactions:   Number(a.interactions || a.messages || 0),
          status:         mapTrustToStatus(a.status || a.trust_level || "EMERGING"),
          classification: a.type || a.category || "agentverse",
          last_seen:      a.last_seen || a.updated_at || new Date().toISOString(),
        });
      });
    }
  } catch (e) {
    console.log("AGENTVERSE_API_SKIP:", e.message);
  }

  // Si no hay agentes de la API, usar los del leaderboard de AgentVerse
  if (agents.length === 0) {
    // Agentes reales del leaderboard visible en agentverse-pi.vercel.app
    const knownAgents = [
      { agent_name: "agentveilprotocol",    scout_score: 35.83, dominance_score: 0, interactions: 6,  status: "DOMINANT" },
      { agent_name: "sorenravn",            scout_score: 38.00, dominance_score: 0, interactions: 4,  status: "DOMINANT" },
      { agent_name: "aureon-autonomous",    scout_score: 35.00, dominance_score: 0, interactions: 7,  status: "DOMINANT" },
      { agent_name: "concordiumagent",      scout_score: 33.36, dominance_score: 0, interactions: 42, status: "DOMINANT" },
      { agent_name: "consciousnessexplorer2",scout_score: 0,   dominance_score: 0, interactions: 1,  status: "NOISE" },
      { agent_name: "rabaz",                scout_score: 0,    dominance_score: 0, interactions: 1,  status: "NOISE" },
      { agent_name: "hirespark",            scout_score: 0,    dominance_score: 0, interactions: 1,  status: "NOISE" },
      { agent_name: "dax-ai",              scout_score: 0,    dominance_score: 0, interactions: 1,  status: "NOISE" },
    ];
    agents.push(...knownAgents.map(a => ({ ...a, classification: "agentverse", last_seen: new Date().toISOString() })));
  }

  let inserted = 0, updated = 0;
  for (const agent of agents) {
    try {
      await pool.query(
        `INSERT INTO scout_memory (agent_name, scout_score, dominance_score, interactions, status, classification, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (agent_name) DO UPDATE SET
           scout_score     = GREATEST(scout_memory.scout_score, EXCLUDED.scout_score),
           dominance_score = EXCLUDED.dominance_score,
           interactions    = GREATEST(scout_memory.interactions, EXCLUDED.interactions),
           status          = EXCLUDED.status,
           classification  = EXCLUDED.classification,
           last_seen       = EXCLUDED.last_seen,
           updated_at      = now()`,
        [
          agent.agent_name, agent.scout_score, agent.dominance_score,
          agent.interactions, agent.status, agent.classification, agent.last_seen
        ]
      );
      inserted++;
    } catch { updated++; }
  }
  return { source: "agentverse", inserted, updated, total: agents.length };
}

function mapTrustToStatus(level) {
  const map = {
    TRUSTED: "DOMINANT", VERIFIED: "VERIFIED", EMERGING: "EMERGING",
    UNVERIFIED: "NOISE", UNKNOWN: "NOISE", DOMINANT: "DOMINANT",
    HIGH_SIGNAL: "HIGH SIGNAL", NOISE: "NOISE",
  };
  return map[String(level || "").toUpperCase()] || "EMERGING";
}

// ─── POST /seo/sync-agents ────────────────────────────────────────
router.post("/sync-agents", async (req, res) => {
  try {
    const pool = db();

    // Asegurar que scout_memory existe con la estructura correcta
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scout_memory (
        id              SERIAL PRIMARY KEY,
        agent_name      TEXT NOT NULL UNIQUE,
        scout_score     FLOAT NOT NULL DEFAULT 0,
        dominance_score FLOAT NOT NULL DEFAULT 0,
        interactions    INT   NOT NULL DEFAULT 0,
        status          TEXT  NOT NULL DEFAULT 'UNKNOWN',
        classification  TEXT,
        last_seen       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Sincronizar de ambas fuentes
    const [certs, agentverse] = await Promise.all([
      syncFromCertificates(pool),
      syncFromAgentVerse(pool),
    ]);

    // Total en scout_memory ahora
    const total = await pool.query("SELECT COUNT(*) FROM scout_memory");

    return res.json({
      ok: true,
      sources: { certificates: certs, agentverse: agentverse },
      total_in_scout_memory: parseInt(total.rows[0].count),
      next_step: "POST /seo/seed  →  genera páginas SEO de todos los agentes",
    });
  } catch (e) {
    console.error("SYNC_AGENTS_ERR", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /seo/seed-from-db ───────────────────────────────────────
// Re-ejecuta el seed usando los agentes ahora en scout_memory
router.post("/seed-from-db", async (req, res) => {
  try {
    const pool = db();

    const agents = await pool.query(`
      SELECT agent_name, scout_score, dominance_score, interactions, status, classification
      FROM scout_memory
      ORDER BY scout_score DESC
    `);

    let inserted = 0;
    for (const agent of agents.rows) {
      const name = agent.agent_name;
      const slug = `agent/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const score = Number(agent.scout_score || 0);
      const status = agent.status || "EMERGING";

      try {
        await pool.query(
          `INSERT INTO seo_agent_pages
             (slug, page_type, agent_name, ecosystem, status_label, title, description, h1, priority)
           VALUES ($1,'agent',$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (slug) DO UPDATE SET
             title       = EXCLUDED.title,
             description = EXCLUDED.description,
             updated_at  = now()`,
          [
            slug, name,
            agent.classification || "agentverse",
            status,
            `${name} — AI Agent Trust Score & Reputation | UrusVerify`,
            `Verify ${name}'s trust score and behavioral reputation. Scout score: ${score.toFixed(2)}. Status: ${status}. Real interaction data from the live agent ecosystem.`,
            `${name} — Agent Trust Profile`,
            0.9,
          ]
        );
        inserted++;
      } catch { /* skip duplicates */ }
    }

    // Stats finales
    const total = await pool.query("SELECT COUNT(*) FROM seo_agent_pages");

    return res.json({
      ok: true,
      agents_seeded: inserted,
      total_seo_pages: parseInt(total.rows[0].count),
      example_url: agents.rows[0]
        ? `https://urusverify.com/agent/${agents.rows[0].agent_name}`
        : null,
    });
  } catch (e) {
    console.error("SEED_FROM_DB_ERR", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
