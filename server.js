/**
 * URUS Backend — A1 (Memoria real) + Prompt JSON fijo + Endpoints mínimos
 *
 * Endpoints:
 * - GET  /health
 * - POST /v1/auth/signup
 * - POST /v1/auth/login
 * - POST /v1/urus/ingest_session   (auth) -> llama modelo + guarda en DB
 * - GET  /v1/urus/sessions         (auth) -> historial
 *
 * ENV requeridas:
 * - OPENAI_API_KEY
 * - DATABASE_URL
 * - JWT_SECRET
 *
 * ENV opcionales:
 * - URUS_CORE_MODE (production/development)
 * - URUS_CORE_VERSION (ej: A33)
 * - URUS_DEFAULT_MODEL (ej: gpt-4o-mini)
 */

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ----------------- Config
const PORT = process.env.PORT || 3000;

const URUS_CORE_MODE = process.env.URUS_CORE_MODE || "production";
const URUS_CORE_VERSION = process.env.URUS_CORE_VERSION || "A33";
const URUS_DEFAULT_MODEL = process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini";

const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!JWT_SECRET) console.warn("[WARN] Missing JWT_SECRET");
if (!DATABASE_URL) console.warn("[WARN] Missing DATABASE_URL");
if (!OPENAI_API_KEY) console.warn("[WARN] Missing OPENAI_API_KEY");

// Safe log (no keys leaked)
console.log("[BOOT]", {
  mode: URUS_CORE_MODE,
  core_version: URUS_CORE_VERSION,
  default_model: URUS_DEFAULT_MODEL,
  openai_key_present: !!OPENAI_API_KEY,
  db_url_present: !!DATABASE_URL,
  jwt_present: !!JWT_SECRET
});

const pool = new Pool({ connectionString: DATABASE_URL });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ----------------- Helpers
function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function authRequired(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function safeJsonParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ----------------- System Prompt (JSON fijo)
const URUS_SYSTEM_PROMPT = `
Eres URUS Cognitive OS v1 (URUS-${URUS_CORE_VERSION}).
No eres un chatbot. Eres un motor de claridad estratégica, coherencia decisional y ejecución.

Objetivo: procesar el input del usuario y devolver una respuesta ESTRUCTURADA y accionable.

INSTRUCCIONES IMPORTANTES:
- Responde SIEMPRE en español neutro (a menos que el usuario pida otro idioma).
- Sé directo, sobrio, sin motivación, sin terapia, sin misticismo.
- Devuelve SIEMPRE un ÚNICO JSON válido. No texto fuera del JSON. No markdown.

FORMATO JSON EXACTO (respeta llaves/campos):
{
  "activation_id": "string",
  "core_version": "string",
  "mode": "string",
  "final_output": {
    "diagnosis": "string",
    "blind_spot": "string",
    "primary_risk": "string",
    "recommended_move": "string"
  },
  "cognitive_map": {
    "intent_explicit": "string",
    "intent_implicit": "string",
    "internal_friction": "string",
    "incoherence_vector": "string",
    "dominant_pattern": "string",
    "bias_detected": "string",
    "narrative_constraint": "string",
    "ethical_alignment": {
      "truth": 0.0,
      "consistency": 0.0,
      "sustainability": 0.0,
      "systemic_impact": 0.0
    },
    "strategic_stage": "string",
    "confidence_score": 0.0
  }
}

REGLAS:
- activation_id: genera un id tipo UUID o similar (texto).
- mode: usa "${URUS_CORE_MODE}"
- core_version: usa "${URUS_CORE_VERSION}"
- ethical_alignment: números 0.0 a 1.0
- confidence_score: 0.0 a 1.0
- Si el input es vago, igual devuelve el JSON completo, pero en recommended_move pide una sola precisión concreta.
`.trim();

// ----------------- Health
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({
      ok: true,
      service: "urus-backend",
      core_version: URUS_CORE_VERSION,
      mode: URUS_CORE_MODE,
      db_ok: r.rows?.[0]?.ok === 1
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ----------------- Auth: signup
app.post("/v1/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password too short" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const q = `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
    `;
    const r = await pool.query(q, [email.toLowerCase(), password_hash]);

    const user = r.rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });

    res.json({ token, user: { id: user.id, email: user.email, created_at: user.created_at } });
  } catch (e) {
    // unique violation
    if (String(e).includes("duplicate") || String(e).includes("unique")) {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "signup_failed" });
  }
});

// ----------------- Auth: login
app.post("/v1/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (typeof password !== "string") return res.status(400).json({ error: "Invalid password" });

    const r = await pool.query(`SELECT id, email, password_hash FROM users WHERE email = $1`, [
      email.toLowerCase()
    ]);
    if (!r.rows.length) return res.status(401).json({ error: "Invalid credentials" });

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: "login_failed" });
  }
});

// ----------------- URUS ingest_session (memoria real)
app.post("/v1/urus/ingest_session", authRequired, async (req, res) => {
  const input = (req.body && req.body.input) || "";
  const meta = (req.body && req.body.meta) || {};
  const mode = (req.body && req.body.mode) || "URUS_CORE";

  if (typeof input !== "string" || input.trim().length === 0) {
    return res.status(400).json({ error: "Missing input" });
  }

  const selectedModel = URUS_DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      temperature: 0.4,
      messages: [
        { role: "system", content: URUS_SYSTEM_PROMPT },
        { role: "user", content: input }
      ]
    });

    const text = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(text);

    // Si el modelo no devolvió JSON perfecto, guardamos fallback para no perder sesión
    const responseJson = parsed.ok
      ? parsed.value
      : {
          activation_id: "parse_error",
          core_version: URUS_CORE_VERSION,
          mode: URUS_CORE_MODE,
          final_output: {
            diagnosis: "No se pudo parsear JSON del modelo.",
            blind_spot: "",
            primary_risk: "Formato inválido",
            recommended_move: "Reintenta: devuelve SOLO JSON válido (sin texto extra)."
          },
          cognitive_map: {
            intent_explicit: "",
            intent_implicit: "",
            internal_friction: "",
            incoherence_vector: "",
            dominant_pattern: "",
            bias_detected: "",
            narrative_constraint: "",
            ethical_alignment: { truth: 0, consistency: 0, sustainability: 0, systemic_impact: 0 },
            strategic_stage: "",
            confidence_score: 0
          },
          raw: text
        };

    // Guardar en DB (memoria real)
    const insertQ = `
      INSERT INTO sessions (user_id, input, mode, meta, model_used, response)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `;
    const ins = await pool.query(insertQ, [
      req.user.id,
      input,
      mode,
      meta,
      selectedModel,
      responseJson
    ]);

    res.json({
      session_id: ins.rows[0].id,
      created_at: ins.rows[0].created_at,
      model_used: selectedModel,
      core_version: URUS_CORE_VERSION,
      mode: URUS_CORE_MODE,
      response: responseJson
    });
  } catch (e) {
    res.status(500).json({ error: "ingest_failed", details: String(e) });
  }
});

// ----------------- Historial
app.get("/v1/urus/sessions", authRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

    const q = `
      SELECT id, input, mode, meta, model_used, response, created_at
      FROM sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const r = await pool.query(q, [req.user.id, limit]);
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: "history_failed" });
  }
});

// ----------------- Start
app.listen(PORT, () => {
  console.log(`[READY] listening on :${PORT}`);
});


