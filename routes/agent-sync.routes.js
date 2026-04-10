/**
 * URUS — Agent Sync Route v3
 * Lee los agentes reales del endpoint /v1/scout/leaderboard
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

const SCOUT_URL = "https://urus-scout-agent-production.up.railway.app";

// ─── Fuente 1: Leaderboard del Scout (284 agentes reales) ─────────
async function syncFromLeaderboard(pool) {
  try {
    const r = await fetch(`${SCOUT_URL}/v1/scout/leaderboard`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const agents = data.leaderboard || data.agents || data || [];

    if (!Array.isArray(agents) || agents.length === 0) {
      return { source: "leaderboard", inserted: 0, total: 0, error: "empty_response" };
    }

    let inserted = 0;
    for (const agent of agents) {
      const name = (agent.agent || agent.name || agent.agent_name || "").toLowerCase().trim();
      if (!name) continue;

      const score       = Number(agent.avg_score || agent.scout_score || 0);
      const dominance   = Number(agent.dominance_score || 0);
      const interactions= Number(agent.interactions || 0);
      const status      = classificationToStatus(agent.classification || "");
      const last_seen   = agent.last_seen || new Date().toISOString();

      try {
        await pool.query(
          `INSERT INTO scout_memory
             (agent_name, scout_score, dominance_score, interactions, status, classification, last_seen)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (agent_name) DO UPDATE SET
             scout_score     = GREATEST(scout_memory.scout_score, EXCLUDED.scout_score),
             dominance_score = EXCLUDED.dominance_score,
             interactions    = GREATEST(scout_memory.interactions, EXCLUDED.interactions),
             status          = EXCLUDED.status,
             classification  = EXCLUDED.classification,
             last_seen       = EXCLUDED.last_seen,
             updated_at      = now()`,
          [name, score, dominance, interactions, status, agent.classification || "agentverse", last_seen]
        );
        inserted++;
      } catch (e) {
        console.log("INSERT_ERR:", name, e.message);
      }
    }

    return { source: "leaderboard", inserted, total: agents.length };
  } catch (e) {
    console.error("SYNC_LEADERBOARD_ERR:", e.message);
    return { source: "leaderboard", inserted: 0, total: 0, error: e.message };
  }
}

// ─── Fuente 2: agent_certificates (ya en tu DB) ───────────────────
async function syncFromCertificates(pool) {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (agent_id)
        agent_id    AS agent_name,
        trust_score AS scout_score,
        trust_level AS status,
        framework   AS classification,
        issued_at   AS last_seen
      FROM agent_certificates
      ORDER BY agent_id, issued_at DESC
    `);

    let inserted = 0;
    for (const row of result.rows) {
      const name = String(row.agent_name || "").trim().toLowerCase();
      if (!name) continue;
      const score = Math.min(50, Number(row.scout_score || 0) / 2);
      const status = mapTrustToStatus(row.status);
      try {
        await pool.query(
          `INSERT INTO scout_memory
             (agent_name, scout_score, dominance_score, interactions, status, classification, last_seen)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (agent_name) DO UPDATE SET
             scout_score    = GREATEST(scout_memory.scout_score, EXCLUDED.scout_score),
             status         = EXCLUDED.status,
             classification = EXCLUDED.classification,
             last_seen      = EXCLUDED.last_seen,
             updated_at     = now()`,
          [name, score, 0, 0, status, row.classification || "REGISTERED", row.last_seen]
        );
        inserted++;
      } catch { /* skip */ }
    }
    return { source: "certificates", inserted, total: result.rows.length };
  } catch (e) {
    return { source: "certificates", inserted: 0, total: 0, error: e.message };
  }
}

function classificationToStatus(c) {
  if (c === "HIGH_SIGNAL") return "DOMINANT";
  if (c === "MID_SIGNAL")  return "VERIFIED";
  if (c === "EMERGING")    return "EMERGING";
  return "NOISE";
}

function mapTrustToStatus(level) {
  const map = {
    TRUSTED: "DOMINANT", VERIFIED: "VERIFIED", EMERGING: "EMERGING",
    UNVERIFIED: "NOISE", UNKNOWN: "NOISE", DOMINANT: "DOMINANT",
  };
  return map[String(level || "").toUpperCase()] || "EMERGING";
}

// ─── POST /seo/sync-agents ────────────────────────────────────────
router.post("/sync-agents", async (req, res) => {
  try {
    const pool = db();

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

    const [leaderboard, certs] = await Promise.all([
      syncFromLeaderboard(pool),
      syncFromCertificates(pool),
    ]);

    const total = await pool.query("SELECT COUNT(*) FROM scout_memory");

    return res.json({
      ok: true,
      sources: { leaderboard, certificates: certs },
      total_in_scout_memory: parseInt(total.rows[0].count),
      next_step: "POST /seo/seed-from-db  →  genera páginas SEO de todos los agentes",
    });
  } catch (e) {
    console.error("SYNC_AGENTS_ERR", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /seo/seed-from-db ───────────────────────────────────────
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
      const name  = agent.agent_name;
      const slug  = `agent/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const score = Number(agent.scout_score || 0);
      const status= agent.status || "EMERGING";

      try {
        await pool.query(
          `INSERT INTO seo_agent_pages
             (slug, page_type, agent_name, ecosystem, status_label, title, description, h1, priority)
           VALUES ($1,'agent',$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (slug) DO UPDATE SET
             title       = EXCLUDED.title,
             description = EXCLUDED.description,
             status_label= EXCLUDED.status_label,
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
      } catch { /* skip */ }
    }

    const total = await pool.query("SELECT COUNT(*) FROM seo_agent_pages");

    return res.json({
      ok: true,
      agents_seeded: inserted,
      total_seo_pages: parseInt(total.rows[0].count),
      example_url: agents.rows[0]
        ? `https://www.urusverify.com/agent/${agents.rows[0].agent_name}`
        : null,
    });
  } catch (e) {
    console.error("SEED_FROM_DB_ERR", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
