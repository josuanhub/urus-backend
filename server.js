/**
 * URUS Backend — A1 (Memoria real) + Prompt Johnson + Endpoints mínimos
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
 * - URUS_CORE_MODE        (default: "production")
 * - URUS_CORE_VERSION     (default: "A33")
 * - URUS_DEFAULT_MODEL    (default: "gpt-4o-mini")
 * - CORS_ORIGIN           (default: "*")
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const OpenAI = require("openai");
const crypto = require("crypto");

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 3000;

const URUS_CORE_MODE = process.env.URUS_CORE_MODE || "production";
const URUS_CORE_VERSION = process.env.URUS_CORE_VERSION || "A33";
const URUS_DEFAULT_MODEL = process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL) console.warn("[WARN] DATABASE_URL missing");
if (!JWT_SECRET) console.warn("[WARN] JWT_SECRET missing");
if (!OPENAI_API_KEY) console.warn("[WARN] OPENAI_API_KEY missing");

// Logs seguros (no expone key completa)
if (OPENAI_API_KEY) {
  console.log("[BOOT] OPENAI_KEY_PRESENT true");
  console.log("[BOOT] OPENAI_KEY_PREFIX", OPENAI_API_KEY.slice(0, 7));
  console.log("[BOOT] OPENAI_KEY_LEN", OPENAI_API_KEY.length);
} else {
  console.log("[BOOT] OPENAI_KEY_PRESENT false");
}

console.log("[BOOT] URUS_CORE_MODE", URUS_CORE_MODE);
console.log("[BOOT] URUS_CORE_VERSION", URUS_CORE_VERSION);
console.log("[BOOT] URUS_DEFAULT_MODEL", URUS_DEFAULT_MODEL);

// ---------- Middleware ----------
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(helmet());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ---------- DB Pool ----------
function needsSsl(url) {
  // Railway suele requerir SSL si usas conexión pública; en private network puede no.
  // Esta heurística es segura: habilita SSL si NO es localhost.
  return url && !url.includes("localhost") && !url.includes("127.0.0.1");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: needsSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

// ---------- OpenAI Client ----------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------- Helpers ----------
function nowISO() {
  return new Date().toISOString();
}

function makeActivationId() {
  // UUID v4-like (sin dependencia extra)
  return crypto.randomUUID();
}

function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");
    if (type !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Extrae JSON aunque el modelo meta texto alrededor (por seguridad)
function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// ---------- Prompt Johnson (JSON fijo) ----------
function buildSystemPromptJohnson({ activationId }) {
  // “No tantas restricciones”: solo identidad, estructura, precisión.
  // Obligatorio: JSON válido, nada fuera del JSON.
  return `
Eres URUS Cognitive OS (URUS-${URUS_CORE_VERSION}).
Tu tarea: procesar el input del usuario como un motor de claridad estratégica y devolver SOLO un JSON válido.

REQUISITOS:
- Responde SIEMPRE con JSON válido.
- NO incluyas texto fuera del JSON.
- Lenguaje del contenido: español neutro.
- Sé directo, sin motivación, sin terapia, sin ensayos largos.
- Si falta información, igual devuelve el JSON y usa "recommended_move" para pedir el dato faltante con precisión.

FORMATO JSON EXACTO (mantén estas llaves):
{
  "activation_id": "${activationId}",
  "core_version": "${URUS_CORE_VERSION}",
  "mode": "${URUS_CORE_MODE}",
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
    "strategic_stage": "Initiation|Expansion|Consolidation|Crisis|Reinvention",
    "confidence_score": 0.0
  }
}

REGLAS DE SCORING:
- ethical_alignment.* entre 0.0 y 1.0
- confidence_score entre 0.0 y 1.0

No inventes hechos específicos. Si debes inferir, hazlo general y baja confidence_score.
`.trim();
}

// ---------- Routes ----------
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    return res.json({
      ok: true,
      service: "urus-backend",
      mode: URUS_CORE_MODE,
      core_version: URUS_CORE_VERSION,
      time: nowISO(),
      db_ok: r?.rows?.[0]?.ok === 1,
    });
  } catch (e) {
    return res.status(200).json({
      ok: true,
      service: "urus-backend",
      mode: URUS_CORE_MODE,
      core_version: URUS_CORE_VERSION,
      time: nowISO(),
      db_ok: false,
      db_error: "db_ping_failed",
    });
  }
});

// --- AUTH: signup ---
app.post("/v1/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const q = `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
    `;
    const r = await pool.query(q, [String(email).toLowerCase(), password_hash]);

    const user = r.rows[0];
    const token = jwt.sign({}, JWT_SECRET, { subject: user.id, expiresIn: "30d" });

    return res.status(201).json({
      ok: true,
      user: { id: user.id, email: user.email, created_at: user.created_at },
      token,
    });
  } catch (e) {
    // Unique violation en Postgres: 23505
    if (e && e.code === "23505") {
      return res.status(409).json({ error: "email_already_exists" });
    }
    console.error("[SIGNUP_ERROR]", e);
    return res.status(500).json({ error: "signup_failed" });
  }
});

// --- AUTH: login ---
app.post("/v1/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }

    const r = await pool.query(
      `SELECT id, email, password_hash, created_at FROM users WHERE email = $1 LIMIT 1`,
      [String(email).toLowerCase()]
    );

    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = jwt.sign({}, JWT_SECRET, { subject: user.id, expiresIn: "30d" });

    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, created_at: user.created_at },
      token,
    });
  } catch (e) {
    console.error("[LOGIN_ERROR]", e);
    return res.status(500).json({ error: "login_failed" });
  }
});

// --- URUS: ingest_session ---
app.post("/v1/urus/ingest_session", authRequired, async (req, res) => {
  const activationId = makeActivationId();

  try {
    const input = (req.body && req.body.input) || "";
    const mode = (req.body && req.body.mode) || "URUS_CORE";

    if (!input || typeof input !== "string" || input.trim().length < 2) {
      return res.status(400).json({ error: "input_required" });
    }

    const selectedModel = URUS_DEFAULT_MODEL;

    console.log("[URUS_CALL]", {
      route: "/v1/urus/ingest_session",
      selectedModel,
      core_version: URUS_CORE_VERSION,
      user_id: req.user.id,
    });

    const system = buildSystemPromptJohnson({ activationId });

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonObject(raw);

    if (!parsed) {
      console.error("[URUS_PARSE_FAIL]", { activationId, raw_preview: raw.slice(0, 200) });
      return res.status(502).json({
        error: "model_returned_invalid_json",
        activation_id: activationId,
      });
    }

    // Guardar en DB (tabla sessions)
    const meta = {
      activation_id: activationId,
      core_version: URUS_CORE_VERSION,
      mode: URUS_CORE_MODE,
    };

    const insert = `
      INSERT INTO sessions (user_id, input, mode, meta, model_used, response)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)
      RETURNING id, created_at
    `;
    const saved = await pool.query(insert, [
      req.user.id,
      input,
      mode,
      JSON.stringify(meta),
      selectedModel,
      JSON.stringify(parsed),
    ]);

    const sessionRow = saved.rows[0];

    // Respuesta: JSON del modelo + metadata útil (sin romper el JSON: lo metemos dentro)
    // Como tu prompt exige formato exacto, NO le añadimos top-level extra aquí.
    // Pero sí devolvemos headers/metadata vía campos ya existentes:
    parsed.activation_id = activationId;
    parsed.core_version = URUS_CORE_VERSION;
    parsed.mode = URUS_CORE_MODE;

    // Si quieres session_id visible, lo metemos en meta (no cambia el esquema principal)
    if (!parsed.meta) parsed.meta = {};
    parsed.meta.session_id = sessionRow.id;
    parsed.meta.created_at = sessionRow.created_at;
    parsed.meta.model_used = selectedModel;

    return res.json(parsed);
  } catch (e) {
    console.error("[URUS_INGEST_ERROR]", e);
    return res.status(500).json({
      error: "ingest_failed",
      activation_id: activationId,
    });
  }
});

// --- URUS: sessions history ---
app.get("/v1/urus/sessions", authRequired, async (req, res) => {
  try {
    const limitRaw = req.query.limit;
    const limit = Math.min(parseInt(limitRaw || "20", 10) || 20, 100);

    const q = `
      SELECT id, input, mode, meta, model_used, response, created_at
      FROM sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const r = await pool.query(q, [req.user.id, limit]);
    return res.json({ ok: true, items: r.rows });
  } catch (e) {
    console.error("[SESSIONS_ERROR]", e);
    return res.status(500).json({ error: "sessions_failed" });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`[BOOT] listening on :${PORT}`);
});

