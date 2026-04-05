/**
 * URUS Trust API — v1
 *
 * GET /v1/agent/:name/trust
 *
 * Devuelve las 3 capas de confianza de un agente:
 *   1. Identity     — quién es (verificado en URUS backend)
 *   2. Reputation   — cómo se comporta (AgentVerse / scout_memory)
 *   3. Authorization — qué puede hacer (billing + plan limits)
 *
 * Este es el endpoint que ningún competidor tiene:
 * MolTrust tiene identity pero no reputation ni authorization real.
 * Sumsub tiene compliance pero no behavioral scoring.
 * AgentVerse tiene reputation pero no identity ni authorization.
 * URUS tiene las 3 capas en una sola llamada.
 *
 * Montar en server.js:
 *   const trustRoutes = require("./routes/trust.routes");
 *   app.use("/v1/agent", trustRoutes);
 */

const express = require("express");
const router = express.Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

function getPool() {
  const pool = global.__URUS_DB__;
  if (!pool) throw new Error("URUS_DB pool no disponible");
  return pool;
}

// Clasificación de status basada en dominance_score
function classifyStatus(dominanceScore) {
  if (dominanceScore >= 30) return "DOMINANT";
  if (dominanceScore >= 25) return "HIGH_SIGNAL";
  if (dominanceScore >= 18) return "MID_SIGNAL";
  if (dominanceScore < 8)   return "NOISE";
  return "EMERGING";
}

// ─── CAPA 1: IDENTITY ────────────────────────────────────────────────────────
// Busca al agente en la tabla users del URUS backend.
// Devuelve si existe, si tiene membresía activa, su plan y fecha de registro.
async function getIdentityLayer(pool, agentName) {
  try {
    const r = await pool.query(
      `SELECT id, email, plan, membership, created_at
       FROM users
       WHERE LOWER(email) LIKE LOWER($1)
          OR LOWER(id::text) = LOWER($1)
       LIMIT 1`,
      [`%${agentName}%`]
    );

    if (!r.rows.length) {
      return {
        verified: false,
        source: "urus_backend",
        note: "No user record found for this agent name"
      };
    }

    const u = r.rows[0];
    return {
      verified: true,
      source: "urus_backend",
      plan: u.plan || "basic",
      membership: u.membership || "inactive",
      member_since: u.created_at
    };
  } catch (_) {
    return { verified: false, source: "urus_backend", error: "identity_lookup_failed" };
  }
}

// ─── CAPA 2: REPUTATION ──────────────────────────────────────────────────────
// Busca en scout_memory del urus-scout-agent via HTTP.
// Si no puede alcanzarlo, devuelve null scores con nota.
async function getReputationLayer(agentName) {
  try {
    const SCOUT_API = process.env.SCOUT_AGENT_URL ||
      "https://urus-scout-agent-production.up.railway.app";

    const res = await fetch(`${SCOUT_API}/v1/scout/leaderboard`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000) // 5s timeout
    });

    if (!res.ok) throw new Error(`scout_api_${res.status}`);

    const data = await res.json();
    const leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];

    const entry = leaderboard.find(
      a => String(a.agent || "").toLowerCase() === agentName.toLowerCase()
    );

    if (!entry) {
      return {
        found: false,
        source: "agentverse_leaderboard",
        note: "Agent has no tracked interactions yet"
      };
    }

    const dominance = Number(entry.dominance_score || entry.avg_score || 0);
    const status = classifyStatus(dominance);

    return {
      found: true,
      source: "agentverse_leaderboard",
      scout_score: Number(entry.avg_score || 0),
      dominance_score: dominance,
      interactions: Number(entry.interactions || 0),
      status,
      classification: entry.classification || status,
      last_seen: entry.last_seen || null
    };
  } catch (err) {
    return {
      found: false,
      source: "agentverse_leaderboard",
      error: "reputation_lookup_failed",
      detail: err.message
    };
  }
}

// ─── CAPA 3: AUTHORIZATION ───────────────────────────────────────────────────
// Busca en cognitive_profiles + billing del URUS backend.
// Devuelve el perfil cognitivo y los límites del agente.
async function getAuthorizationLayer(pool, agentName) {
  try {
    // Buscar por nombre de usuario o email que contenga el nombre del agente
    const userRes = await pool.query(
      `SELECT u.id, u.plan, u.membership, u.monthly_usage, u.monthly_limit,
              u.usage_reset_at, cp.dominant_pattern, cp.loop_intensity,
              cp.decision_fatigue_index, cp.execution_consistency,
              cp.signal_integrity_score, cp.core_intent_vector
       FROM users u
       LEFT JOIN cognitive_profiles cp ON cp.user_id = u.id
       WHERE LOWER(u.email) LIKE LOWER($1)
       LIMIT 1`,
      [`%${agentName}%`]
    );

    // También intentar buscar en moltbook_messages como actor
    const activityRes = await pool.query(
      `SELECT COUNT(*) as total_actions,
              MAX(created_at) as last_action,
              SUM(CASE WHEN urus_status = 'approved' THEN 1 ELSE 0 END) as approved,
              SUM(CASE WHEN urus_status = 'blocked' THEN 1 ELSE 0 END) as blocked
       FROM moltbook_messages
       WHERE LOWER(actor) = LOWER($1)`,
      [agentName]
    );

    const activity = activityRes.rows[0] || {};

    if (!userRes.rows.length) {
      // No hay user record pero sí puede tener actividad en moltbook
      return {
        source: "urus_backend",
        plan: null,
        membership: null,
        limits: null,
        moltbook_activity: {
          total_actions: Number(activity.total_actions || 0),
          approved_actions: Number(activity.approved || 0),
          blocked_actions: Number(activity.blocked || 0),
          last_action: activity.last_action || null
        },
        cognitive_profile: null
      };
    }

    const u = userRes.rows[0];
    return {
      source: "urus_backend",
      plan: u.plan || "basic",
      membership: u.membership || "inactive",
      limits: {
        monthly_usage: Number(u.monthly_usage || 0),
        monthly_limit: Number(u.monthly_limit || 50),
        remaining: Math.max(0, Number(u.monthly_limit || 50) - Number(u.monthly_usage || 0)),
        reset_at: u.usage_reset_at || null
      },
      moltbook_activity: {
        total_actions: Number(activity.total_actions || 0),
        approved_actions: Number(activity.approved || 0),
        blocked_actions: Number(activity.blocked || 0),
        last_action: activity.last_action || null
      },
      cognitive_profile: u.dominant_pattern ? {
        dominant_pattern: u.dominant_pattern,
        loop_intensity: Number(u.loop_intensity || 0),
        decision_fatigue_index: Number(u.decision_fatigue_index || 0),
        execution_consistency: Number(u.execution_consistency || 0),
        signal_integrity_score: Number(u.signal_integrity_score || 0),
        core_intent_vector: u.core_intent_vector || null
      } : null
    };
  } catch (err) {
    return {
      source: "urus_backend",
      error: "authorization_lookup_failed",
      detail: err.message
    };
  }
}

// ─── TRUST SCORE COMPUESTO ────────────────────────────────────────────────────
// Calcula un score 0-100 combinando las 3 capas.
// Fórmula: identity(30%) + reputation(50%) + authorization(20%)
function computeTrustScore({ identity, reputation, authorization }) {
  let score = 0;

  // Identity (max 30 puntos)
  if (identity.verified) score += 20;
  if (identity.membership === "active") score += 10;

  // Reputation (max 50 puntos)
  if (reputation.found) {
    const repScore = Number(reputation.scout_score || 0);
    // scout_score máximo teórico ~50. Normalizar a 50 puntos
    score += Math.min(50, Math.round((repScore / 50) * 50));
  }

  // Authorization (max 20 puntos)
  const activity = authorization.moltbook_activity || {};
  const totalActions = Number(activity.total_actions || 0);
  const blockedActions = Number(activity.blocked_actions || 0);
  const approvalRate = totalActions > 0
    ? (totalActions - blockedActions) / totalActions
    : 0;

  if (totalActions > 0) {
    score += Math.round(approvalRate * 15);
  }
  if (authorization.membership === "active") score += 5;

  return Math.min(100, Math.max(0, score));
}

// ─── ENDPOINT PRINCIPAL ───────────────────────────────────────────────────────

/**
 * GET /v1/agent/:name/trust
 *
 * Respuesta completa de confianza para un agente dado.
 *
 * Ejemplo:
 *   GET /v1/agent/concordiumagent/trust
 *   GET /v1/agent/urus-scout/trust
 */
router.get("/:name/trust", async (req, res) => {
  const agentName = String(req.params.name || "").trim().toLowerCase();

  if (!agentName || agentName.length < 2) {
    return res.status(400).json({
      ok: false,
      error: "invalid_agent_name",
      message: "Agent name must be at least 2 characters"
    });
  }

  const pool = getPool();
  const requestedAt = new Date().toISOString();

  try {
    // Las 3 capas en paralelo para máxima velocidad
    const [identity, reputation, authorization] = await Promise.all([
      getIdentityLayer(pool, agentName),
      getReputationLayer(agentName),
      getAuthorizationLayer(pool, agentName)
    ]);

    const trust_score = computeTrustScore({ identity, reputation, authorization });

    // Clasificación final del agente
    let trust_level;
    if (trust_score >= 80)      trust_level = "TRUSTED";
    else if (trust_score >= 60) trust_level = "VERIFIED";
    else if (trust_score >= 40) trust_level = "EMERGING";
    else if (trust_score >= 20) trust_level = "UNVERIFIED";
    else                         trust_level = "UNKNOWN";

    return res.json({
      ok: true,
      agent: agentName,
      trust_score,
      trust_level,
      requested_at: requestedAt,
      layers: {
        identity,
        reputation,
        authorization
      },
      powered_by: "URUS Blueprint System · Urus Trust Stack v1"
    });

  } catch (err) {
    console.error("TRUST_API_ERROR", agentName, err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "trust_lookup_failed",
      message: err.message
    });
  }
});

// ─── ENDPOINT BATCH (verificar varios agentes a la vez) ───────────────────────

/**
 * POST /v1/agent/trust/batch
 * Body: { "agents": ["concordiumagent", "urus-scout", "FailSafe-ARGUS"] }
 *
 * Útil para plataformas que necesitan verificar múltiples agentes.
 */
router.post("/trust/batch", async (req, res) => {
  const agents = Array.isArray(req.body?.agents)
    ? req.body.agents.slice(0, 20) // máx 20 por batch
    : [];

  if (!agents.length) {
    return res.status(400).json({
      ok: false,
      error: "missing_agents",
      message: "Provide an array of agent names in body.agents (max 20)"
    });
  }

  const pool = getPool();
  const requestedAt = new Date().toISOString();

  const results = await Promise.all(
    agents.map(async (name) => {
      const agentName = String(name || "").trim().toLowerCase();
      try {
        const [identity, reputation, authorization] = await Promise.all([
          getIdentityLayer(pool, agentName),
          getReputationLayer(agentName),
          getAuthorizationLayer(pool, agentName)
        ]);
        const trust_score = computeTrustScore({ identity, reputation, authorization });
        let trust_level;
        if (trust_score >= 80)      trust_level = "TRUSTED";
        else if (trust_score >= 60) trust_level = "VERIFIED";
        else if (trust_score >= 40) trust_level = "EMERGING";
        else if (trust_score >= 20) trust_level = "UNVERIFIED";
        else                         trust_level = "UNKNOWN";

        return { agent: agentName, trust_score, trust_level, layers: { identity, reputation, authorization } };
      } catch (err) {
        return { agent: agentName, error: "lookup_failed", detail: err.message };
      }
    })
  );

  return res.json({
    ok: true,
    requested_at: requestedAt,
    count: results.length,
    results,
    powered_by: "URUS Blueprint System · Urus Trust Stack v1"
  });
});

// ─── ENDPOINT PÚBLICO SIN AUTH (free tier — solo reputation) ──────────────────

/**
 * GET /v1/agent/:name/trust/public
 *
 * Versión pública gratuita — solo devuelve reputation layer.
 * No requiere API key. Ideal para que otros developers prueben la API.
 */
router.get("/:name/trust/public", async (req, res) => {
  const agentName = String(req.params.name || "").trim().toLowerCase();
  if (!agentName || agentName.length < 2) {
    return res.status(400).json({ ok: false, error: "invalid_agent_name" });
  }

  try {
    const reputation = await getReputationLayer(agentName);
    const trust_score = reputation.found
      ? Math.min(100, Math.round((Number(reputation.scout_score || 0) / 50) * 70))
      : 0;

    return res.json({
      ok: true,
      agent: agentName,
      trust_score,
      reputation,
      note: "Public tier — identity and authorization layers require API key",
      powered_by: "URUS Blueprint System · Urus Trust Stack v1"
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "public_trust_failed" });
  }
});

module.exports = router;
