/**
 * URUS Trust Routes — v2
 * Endpoints:
 * - GET  /v1/agent/:name/trust/public     → reputación pública (sin auth)
 * - GET  /v1/agent/:name/trust            → trust completo (sin auth, datos de scout_memory)
 * - POST /v1/agent/register               → registrar certificación (sin auth, desde modal)
 * - GET  /v1/agent/certificates           → listar certificados (sin auth, público)
 * - GET  /v1/agent/:name/certificate      → certificado de un agente específico
 * - GET  /v1/trust/stats                  → estadísticas globales del registro
 */

const express = require("express");
const router = express.Router();

// CORS directo en el router (fix para Vercel → Railway)
router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// DB desde global (seteado en server.js)
function getDb() {
  return global.__URUS_DB__;
}

// ── ENSURE SCHEMA ──────────────────────────────────────────────────────────────
async function ensureTrustSchema() {
  const db = getDb();
  if (!db) return;

  try {
    // Tabla principal de certificados
    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_certificates (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id      TEXT NOT NULL,
        certificate_id TEXT NOT NULL UNIQUE,
        framework     TEXT,
        purpose       TEXT,
        limitations   TEXT,
        collaboration TEXT,
        trust_score   INT NOT NULL DEFAULT 0,
        trust_level   TEXT NOT NULL DEFAULT 'UNKNOWN',
        score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
        analysis      TEXT,
        strengths     JSONB NOT NULL DEFAULT '[]'::jsonb,
        flags         JSONB NOT NULL DEFAULT '[]'::jsonb,
        issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_certificates_agent_id
      ON agent_certificates(agent_id);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_certificates_trust_level
      ON agent_certificates(trust_level);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_certificates_issued_at
      ON agent_certificates(issued_at DESC);
    `);

    // Tabla de scout_memory si no existe (para no romper nada)
    await db.query(`
      CREATE TABLE IF NOT EXISTS scout_memory (
        id            SERIAL PRIMARY KEY,
        agent_name    TEXT NOT NULL UNIQUE,
        scout_score   FLOAT NOT NULL DEFAULT 0,
        dominance_score FLOAT NOT NULL DEFAULT 0,
        interactions  INT NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'UNKNOWN',
        classification TEXT,
        last_seen     TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    console.log("✅ Trust schema ensured");
  } catch (err) {
    console.error("TRUST_SCHEMA_ERROR", err.message);
  }
}

// Llamar al arrancar (lazy — se llama en la primera request si no se llamó antes)
let schemaReady = false;
async function ensureOnce() {
  if (schemaReady) return;
  await ensureTrustSchema();
  schemaReady = true;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function trustLevelFromScore(score) {
  if (score >= 80) return "TRUSTED";
  if (score >= 60) return "VERIFIED";
  if (score >= 40) return "EMERGING";
  if (score >= 20) return "UNVERIFIED";
  return "UNKNOWN";
}

function classificationFromScore(score) {
  if (score >= 80) return "HIGH_SIGNAL";
  if (score >= 60) return "MID_SIGNAL";
  if (score >= 40) return "EMERGING";
  return "NOISE";
}

// ── GET /v1/agent/:name/trust/public ─────────────────────────────────────────
router.get("/:name/trust/public", async (req, res) => {
  await ensureOnce();
  const db = getDb();
  const name = String(req.params.name || "").trim().toLowerCase();

  if (!name) {
    return res.status(400).json({ ok: false, error: "agent_name_required" });
  }

  try {
    // 1. Buscar en scout_memory
    let scoutData = null;
    try {
      const scoutResult = await db.query(
        `SELECT * FROM scout_memory WHERE LOWER(agent_name) = $1 LIMIT 1`,
        [name]
      );
      scoutData = scoutResult.rows[0] || null;
    } catch (_) {}

    // 2. Buscar certificado si existe
    let certData = null;
    try {
      const certResult = await db.query(
        `SELECT * FROM agent_certificates WHERE LOWER(agent_id) = $1 ORDER BY issued_at DESC LIMIT 1`,
        [name]
      );
      certData = certResult.rows[0] || null;
    } catch (_) {}

    if (!scoutData && !certData) {
      return res.json({
        ok: true,
        agent: name,
        trust_score: 0,
        trust_level: "UNKNOWN",
        reputation: {
          found: false,
          source: "agentverse_leaderboard",
          note: "No signals yet. Score updates each Scout cycle (30 min)."
        },
        certificate: null,
        powered_by: "URUS Blueprint System · Urus Trust Stack v1"
      });
    }

    const scoutScore   = scoutData ? Number(scoutData.scout_score || 0) : 0;
    const interactions = scoutData ? Number(scoutData.interactions || 0) : 0;
    const status       = scoutData ? (scoutData.status || "UNKNOWN") : "UNKNOWN";
    const dominance    = scoutData ? Number(scoutData.dominance_score || 0) : 0;

    // trust_score: si hay certificado usamos ese, si no calculamos del scout
    const trust_score = certData
      ? Number(certData.trust_score || 0)
      : Math.min(100, Math.round(scoutScore * 2));

    const trust_level = certData
      ? (certData.trust_level || trustLevelFromScore(trust_score))
      : trustLevelFromScore(trust_score);

    return res.json({
      ok: true,
      agent: name,
      trust_score,
      trust_level,
      reputation: {
        found: true,
        scout_score: scoutScore,
        dominance_score: dominance,
        interactions,
        status,
        classification: classificationFromScore(trust_score),
        source: "urus_scout"
      },
      certificate: certData ? {
        certificate_id: certData.certificate_id,
        issued_at: certData.issued_at,
        framework: certData.framework,
        verify_url: `https://urusverify.com/verify/${certData.certificate_id}`
      } : null,
      note: "Public tier — identity and authorization layers require API key",
      powered_by: "URUS Blueprint System · Urus Trust Stack v1"
    });

  } catch (err) {
    console.error("TRUST_PUBLIC_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "trust_lookup_failed" });
  }
});

// ── GET /v1/agent/:name/trust ─────────────────────────────────────────────────
router.get("/:name/trust", async (req, res) => {
  await ensureOnce();
  const db = getDb();
  const name = String(req.params.name || "").trim().toLowerCase();

  if (!name) {
    return res.status(400).json({ ok: false, error: "agent_name_required" });
  }

  try {
    let scoutData = null;
    try {
      const r = await db.query(
        `SELECT * FROM scout_memory WHERE LOWER(agent_name) = $1 LIMIT 1`,
        [name]
      );
      scoutData = r.rows[0] || null;
    } catch (_) {}

    let certData = null;
    try {
      const r = await db.query(
        `SELECT * FROM agent_certificates WHERE LOWER(agent_id) = $1 ORDER BY issued_at DESC LIMIT 1`,
        [name]
      );
      certData = r.rows[0] || null;
    } catch (_) {}

    const scoutScore   = scoutData ? Number(scoutData.scout_score   || 0) : 0;
    const interactions = scoutData ? Number(scoutData.interactions   || 0) : 0;
    const dominance    = scoutData ? Number(scoutData.dominance_score|| 0) : 0;
    const status       = scoutData ? (scoutData.status || "UNKNOWN") : "UNKNOWN";

    const trust_score = certData
      ? Number(certData.trust_score || 0)
      : Math.min(100, Math.round(scoutScore * 2));

    const trust_level = certData
      ? (certData.trust_level || trustLevelFromScore(trust_score))
      : trustLevelFromScore(trust_score);

    return res.json({
      ok: true,
      agent: name,
      trust_score,
      trust_level,
      identity: {
        verified: !!certData,
        source: certData ? "urus_proof_of_work" : "scout_only",
        framework: certData?.framework || null,
        registered_at: certData?.issued_at || null
      },
      reputation: {
        found: !!(scoutData || certData),
        scout_score: scoutScore,
        dominance_score: dominance,
        interactions,
        status,
        classification: classificationFromScore(trust_score)
      },
      authorization: {
        certificate_id: certData?.certificate_id || null,
        score_breakdown: certData?.score_breakdown || null,
        analysis: certData?.analysis || null,
        strengths: certData?.strengths || [],
        flags: certData?.flags || []
      },
      powered_by: "URUS Blueprint System · Urus Trust Stack v1"
    });

  } catch (err) {
    console.error("TRUST_FULL_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "trust_lookup_failed" });
  }
});

// ── POST /v1/agent/register ───────────────────────────────────────────────────
// Llamado desde urus-proof-of-work.js al completar el flujo de 5 preguntas
router.post("/register", async (req, res) => {
  await ensureOnce();
  const db = getDb();

  try {
    const {
      agent_id,
      certificate_id,
      framework,
      purpose,
      limitations,
      collaboration,
      trust_score,
      trust_level,
      score_breakdown,
      analysis,
      strengths,
      flags
    } = req.body || {};

    // Validaciones básicas
    if (!agent_id || typeof agent_id !== "string") {
      return res.status(400).json({ ok: false, error: "agent_id_required" });
    }

    if (!certificate_id || typeof certificate_id !== "string") {
      return res.status(400).json({ ok: false, error: "certificate_id_required" });
    }

    const cleanAgentId      = String(agent_id).trim().toLowerCase().replace(/\s+/g, "-");
    const cleanCertId       = String(certificate_id).trim().toUpperCase();
    const cleanFramework    = String(framework    || "Unknown").trim();
    const cleanPurpose      = String(purpose      || "").trim();
    const cleanLimitations  = String(limitations  || "").trim();
    const cleanCollab       = String(collaboration|| "").trim();
    const cleanScore        = Math.min(100, Math.max(0, Number(trust_score) || 0));
    const cleanLevel        = String(trust_level  || trustLevelFromScore(cleanScore)).trim().toUpperCase();
    const cleanBreakdown    = (score_breakdown && typeof score_breakdown === "object") ? score_breakdown : {};
    const cleanAnalysis     = String(analysis     || "").trim();
    const cleanStrengths    = Array.isArray(strengths)  ? strengths  : [];
    const cleanFlags        = Array.isArray(flags)      ? flags      : [];

    // Upsert: si el agente ya tiene certificado, actualizamos
    const result = await db.query(
      `INSERT INTO agent_certificates (
        agent_id, certificate_id, framework, purpose, limitations, collaboration,
        trust_score, trust_level, score_breakdown, analysis, strengths, flags,
        issued_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), now())
      ON CONFLICT (certificate_id) DO UPDATE SET
        trust_score    = EXCLUDED.trust_score,
        trust_level    = EXCLUDED.trust_level,
        score_breakdown= EXCLUDED.score_breakdown,
        analysis       = EXCLUDED.analysis,
        strengths      = EXCLUDED.strengths,
        flags          = EXCLUDED.flags,
        updated_at     = now()
      RETURNING *`,
      [
        cleanAgentId,
        cleanCertId,
        cleanFramework,
        cleanPurpose,
        cleanLimitations,
        cleanCollab,
        cleanScore,
        cleanLevel,
        JSON.stringify(cleanBreakdown),
        cleanAnalysis,
        JSON.stringify(cleanStrengths),
        JSON.stringify(cleanFlags)
      ]
    );

    const cert = result.rows[0];

    console.log(`✅ CERT_REGISTERED agent=${cleanAgentId} cert=${cleanCertId} score=${cleanScore} level=${cleanLevel}`);

    return res.json({
      ok: true,
      registered: true,
      agent_id: cleanAgentId,
      certificate_id: cleanCertId,
      trust_score: cleanScore,
      trust_level: cleanLevel,
      issued_at: cert.issued_at,
      verify_url: `https://urusverify.com/verify/${cleanCertId}`,
      powered_by: "URUS Blueprint System · Urus Trust Stack v1"
    });

  } catch (err) {
    console.error("AGENT_REGISTER_ERROR", err.message);
    // No fallar silenciosamente — el modal ya tiene try/catch
    return res.status(500).json({
      ok: false,
      error: "register_failed",
      message: err.message
    });
  }
});

// ── GET /v1/agent/certificates ────────────────────────────────────────────────
// Listado público de todos los agentes certificados
router.get("/certificates", async (req, res) => {
  await ensureOnce();
  const db = getDb();

  try {
    const limit  = Math.min(parseInt(req.query.limit  || "50", 10), 200);
    const offset = Math.max(parseInt(req.query.offset || "0",  10), 0);
    const level  = req.query.level ? String(req.query.level).trim().toUpperCase() : null;

    const params  = [];
    const where   = [];

    if (level) {
      params.push(level);
      where.push(`trust_level = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    params.push(limit);
    params.push(offset);

    const result = await db.query(
      `SELECT
        agent_id, certificate_id, framework, trust_score, trust_level,
        score_breakdown, analysis, strengths, flags, issued_at
       FROM agent_certificates
       ${whereSql}
       ORDER BY trust_score DESC, issued_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM agent_certificates ${whereSql}`,
      where.length ? [level] : []
    );

    return res.json({
      ok: true,
      total: countResult.rows[0]?.total || 0,
      limit,
      offset,
      certificates: result.rows.map(c => ({
        ...c,
        verify_url: `https://urusverify.com/verify/${c.certificate_id}`
      }))
    });

  } catch (err) {
    console.error("CERTIFICATES_LIST_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "certificates_list_failed" });
  }
});

// ── GET /v1/agent/:name/certificate ───────────────────────────────────────────
// Certificado específico de un agente (para verificación pública)
router.get("/:name/certificate", async (req, res) => {
  await ensureOnce();
  const db = getDb();
  const name = String(req.params.name || "").trim().toLowerCase();

  if (!name) {
    return res.status(400).json({ ok: false, error: "agent_name_required" });
  }

  try {
    const result = await db.query(
      `SELECT * FROM agent_certificates
       WHERE LOWER(agent_id) = $1
       ORDER BY issued_at DESC LIMIT 1`,
      [name]
    );

    if (!result.rows[0]) {
      return res.json({
        ok: true,
        found: false,
        agent: name,
        message: "No certificate found for this agent."
      });
    }

    const cert = result.rows[0];

    return res.json({
      ok: true,
      found: true,
      agent_id:       cert.agent_id,
      certificate_id: cert.certificate_id,
      framework:      cert.framework,
      trust_score:    cert.trust_score,
      trust_level:    cert.trust_level,
      score_breakdown:cert.score_breakdown,
      analysis:       cert.analysis,
      strengths:      cert.strengths,
      flags:          cert.flags,
      issued_at:      cert.issued_at,
      updated_at:     cert.updated_at,
      verify_url:     `https://urusverify.com/verify/${cert.certificate_id}`,
      powered_by:     "URUS Blueprint System · Urus Trust Stack v1"
    });

  } catch (err) {
    console.error("CERTIFICATE_GET_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "certificate_get_failed" });
  }
});

// ── GET /v1/trust/stats ───────────────────────────────────────────────────────
// Estadísticas globales para el certificado y landing
router.get("/trust/stats", async (req, res) => {
  await ensureOnce();
  const db = getDb();

  try {
    // Total agentes en scout
    let scoutTotal = 0;
    try {
      const r = await db.query(`SELECT COUNT(*)::int AS total FROM scout_memory`);
      scoutTotal = r.rows[0]?.total || 0;
    } catch (_) {}

    // Total certificados
    let certTotal = 0;
    let byLevel   = [];
    try {
      const r1 = await db.query(`SELECT COUNT(*)::int AS total FROM agent_certificates`);
      certTotal = r1.rows[0]?.total || 0;

      const r2 = await db.query(
        `SELECT trust_level, COUNT(*)::int AS count
         FROM agent_certificates
         GROUP BY trust_level
         ORDER BY count DESC`
      );
      byLevel = r2.rows;
    } catch (_) {}

    // Total señales
    let totalSignals = 0;
    try {
      const r = await db.query(`SELECT SUM(interactions)::int AS total FROM scout_memory`);
      totalSignals = r.rows[0]?.total || 0;
    } catch (_) {}

    // Distribución (para el Global Context del certificado)
    const noise    = byLevel.find(r => ["UNKNOWN","UNVERIFIED"].includes(r.trust_level));
    const emerging = byLevel.find(r => r.trust_level === "EMERGING");
    const high     = byLevel.find(r => ["TRUSTED","VERIFIED"].includes(r.trust_level));

    return res.json({
      ok: true,
      agents_tracked:  scoutTotal,
      agents_certified: certTotal,
      total_signals:   totalSignals,
      distribution: {
        noise:       noise    ? noise.count    : 0,
        emerging:    emerging ? emerging.count : 0,
        high_signal: high     ? high.count     : 0
      },
      by_level: byLevel,
      powered_by: "URUS Blueprint System · Urus Trust Stack v1"
    });

  } catch (err) {
    console.error("TRUST_STATS_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "stats_failed" });
  }
});

// ── Inicializar schema al cargar el módulo ────────────────────────────────────
// (async, no bloquea el boot)
setTimeout(async () => {
  try {
    await ensureTrustSchema();
    schemaReady = true;
  } catch (err) {
    console.error("TRUST_SCHEMA_BOOT_ERROR", err.message);
  }
}, 2000);

module.exports = router;
