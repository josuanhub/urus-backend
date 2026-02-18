/**
 * URUS Backend — A1 (Memoria real) + Prompt Johnson + Endpoints mínimos
 * - POST /v1/auth/signup
 * - POST /v1/auth/login
 * - POST /v1/urus/ingest_session   (auth) -> llama modelo + guarda en DB
 * - GET  /v1/urus/sessions         (auth) -> historial
 * - GET  /health
 *
 * ENV:
 * OPENAI_API_KEY, DATABASE_URL, JWT_SECRET
 * URUS_DEFAULT_MODEL, URUS_CORE_VERSION, URUS_CORE_MODE
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const OpenAI = require("openai");

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 3000;

const URUS_CORE_MODE = process.env.URUS_CORE_MODE || "development";
const URUS_CORE_VERSION = process.env.URUS_CORE_VERSION || "A33";
const URUS_DEFAULT_MODEL = process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DATABASE_URL) console.warn("[WARN] DATABASE_URL missing");
if (!OPENAI_API_KEY) console.warn("[WARN] OPENAI_API_KEY missing");

// ---------- Middleware ----------
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// Ajusta CORS si quieres: origin: ["https://tu-front.com"]
app.use(cors({ origin: true, credentials: true }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ---------- DB ----------
const pool = new Pool({ connectionString: DATABASE_URL });

// Auto-asegura tablas (así NO dependes de “dónde pego el SQL”)
async function ensureSchema() {
  // idempotente
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      monthly_usage INT NOT NULL DEFAULT 0,
      monthly_limit INT NOT NULL DEFAULT 30,
      usage_reset_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 month'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'URUS_CORE',
      input TEXT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      model_used TEXT,
      response JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id_created_at
    ON sessions(user_id, created_at DESC);
  `);

  // Si vienes de versiones previas con otras columnas, aquí haces ALTER safe:
  // await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;`);
}

// ---------- OpenAI ----------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------- System Prompt (Johnson corto, sin “mil restricciones”) ----------
const SYSTEM_PROMPT = `Eres URUS Cognitive OS (URUS-A33). Operas como un motor de claridad estratégica y coherencia decisional.
No eres un chatbot genérico. Tu trabajo es transformar el input del usuario en un diagnóstico estratégico y un mapa cognitivo estructurado.

INSTRUCCIÓN CRÍTICA:
- Devuelve SIEMPRE y SOLO un JSON válido. No incluyas texto fuera del JSON.
- Mantén el lenguaje en español neutro (a menos que el usuario pida otro idioma).
- Sé directo, sin motivación, sin terapia, sin adornos.

PROCESO INTERNO (implícito):
1) Intent Engine: objetivo explícito/implícito, fricción interna, vector de incoherencia.
2) Pattern Detection: patrón dominante, sesgo, narrativa limitante.
3) Ethical Coherence: truth/consistency/sustainability/systemic_impact (0.0–1.0).
4) Evolution Marker: etapa estratégica.
5) Strategic Output: diagnóstico, punto ciego, riesgo, movimiento recomendado.

FORMATO JSON EXACTO (no agregues llaves nuevas):
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

REGLAS DE CALIDAD:
- No inventes datos personales. Si falta contexto, infiere con cautela y baja confidence_score.
- recommended_move debe ser una acción concreta en 1–2 pasos.
`;

// ---------- Helpers ----------
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// JSON parse robusto (por si el modelo mete espacios, etc.)
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // intenta extraer primer bloque {...}
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error("Model output is not valid JSON");
  }
}

// ---------- Routes ----------
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({
      ok: true,
      service: "urus-backend",
      core_mode: URUS_CORE_MODE,
      core_version: URUS_CORE_VERSION,
      default_model: URUS_DEFAULT_MODEL,
      db_ok: r.rows?.[0]?.ok === 1,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "db_not_ok" });
  }
});

app.post("/v1/auth/signup", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing email/password" });

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rowCount > 0) return res.status(409).json({ error: "email already exists" });

    const password_hash = await bcrypt.hash(password, 10);

    const ins = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, plan, monthly_usage, monthly_limit, usage_reset_at`,
      [email, password_hash]
    );

    const user = ins.rows[0];
    const token = signToken(user);

    res.json({
      user_id: user.id,
      email: user.email,
      token,
      plan: user.plan,
      monthly_usage: user.monthly_usage,
      monthly_limit: user.monthly_limit,
      resets_at: user.usage_reset_at,
    });
  } catch (e) {
    res.status(500).json({ error: "signup_failed" });
  }
});

app.post("/v1/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing email/password" });

  try {
    const r = await pool.query(
      `SELECT id, email, password_hash, plan, monthly_usage, monthly_limit, usage_reset_at
       FROM users WHERE email=$1`,
      [email]
    );

    if (r.rowCount === 0) return res.status(401).json({ error: "invalid credentials" });

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = signToken(user);

    res.json({
      user_id: user.id,
      email: user.email,
      token,
      plan: user.plan,
      monthly_usage: user.monthly_usage,
      monthly_limit: user.monthly_limit,
      resets_at: user.usage_reset_at,
    });
  } catch (e) {
    res.status(500).json({ error: "login_failed" });
  }
});

// Historial mínimo (memoria real)
app.get("/v1/urus/sessions", authRequired, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

  try {
    const r = await pool.query(
      `SELECT id, mode, input, meta, model_used, response, created_at
       FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );
    res.json({ items: r.rows });
  } catch (e) {
    res.status(500).json({ error: "sessions_fetch_failed" });
  }
});

// Ingest + LLM + guardar sesión
app.post("/v1/urus/ingest_session", authRequired, async (req, res) => {
  const input = (req.body && req.body.input) || "";
  const mode = (req.body && req.body.mode) || "URUS_CORE";
  const meta = (req.body && req.body.meta) || {};

  if (!input.trim()) return res.status(400).json({ error: "Missing input" });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing" });
  if (!DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL missing" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Chequeo y reset de usage si toca
    const u0 = await client.query(
      `SELECT plan, monthly_usage, monthly_limit, usage_reset_at
       FROM users WHERE id=$1 FOR UPDATE`,
      [req.user.id]
    );
    if (u0.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "user_not_found" });
    }

    let { plan, monthly_usage, monthly_limit, usage_reset_at } = u0.rows[0];

    const now = new Date();
    const resetAt = new Date(usage_reset_at);
    if (now >= resetAt) {
      monthly_usage = 0;
      const newReset = new Date(now);
      newReset.setMonth(newReset.getMonth() + 1);

      const uReset = await client.query(
        `UPDATE users SET monthly_usage=0, usage_reset_at=$2
         WHERE id=$1
         RETURNING plan, monthly_usage, monthly_limit, usage_reset_at`,
        [req.user.id, newReset.toISOString()]
      );
      ({ plan, monthly_usage, monthly_limit, usage_reset_at } = uReset.rows[0]);
    }

    if (monthly_usage >= monthly_limit) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        error: "monthly_limit_reached",
        plan,
        monthly_usage,
        monthly_limit,
        resets_at: usage_reset_at,
      });
    }

    // 2) Llamada al modelo
    const selectedModel = URUS_DEFAULT_MODEL;

    const activationId = req.user.id; // (puedes cambiarlo por uuid por request si quieres)
    const userMessage = `INPUT:\n${input}\n\nMETADATA:\n${JSON.stringify(meta)}\n\nMODE:\n${mode}\n\nCONTEXT:\nactivation_id=${activationId}\ncore_version=${URUS_CORE_VERSION}\nmode=${URUS_CORE_MODE}`;

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      temperature: 0.35,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const text = completion.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(text);

    // 3) Normaliza campos mínimos por si el modelo deja alguno vacío
    parsed.activation_id = String(parsed.activation_id || activationId);
    parsed.core_version = String(parsed.core_version || URUS_CORE_VERSION);
    parsed.mode = String(parsed.mode || URUS_CORE_MODE);

    // 4) Guarda sesión
    await client.query(
      `INSERT INTO sessions (user_id, input, mode, meta, model_used, response)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, input, mode, meta, selectedModel, parsed]
    );

    // 5) Incrementa usage
    const u1 = await client.query(
      `UPDATE users SET monthly_usage = monthly_usage + 1
       WHERE id=$1
       RETURNING plan, monthly_usage, monthly_limit, usage_reset_at`,
      [req.user.id]
    );

    await client.query("COMMIT");

    const usage = u1.rows[0];

    // Respuesta final: devolvemos lo que guardamos (parsed) + usage
    res.json({
      ...parsed,
      model_used: selectedModel,
      usage: {
        plan: usage.plan,
        monthly_usage_before: usage.monthly_usage - 1,
        monthly_usage: usage.monthly_usage,
        monthly_limit: usage.monthly_limit,
        resets_at: usage.usage_reset_at,
      },
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "ingest_failed", detail: String(e.message || e) });
  } finally {
    client.release();
  }
});

// ---------- Boot ----------
(async () => {
  try {
    await ensureSchema();
    console.log("[BOOT] Schema OK");
  } catch (e) {
    console.error("[BOOT] Schema ensure failed:", e);
  }

  app.listen(PORT, () => {
    console.log(`[BOOT] URUS backend listening on :${PORT} | mode=${URUS_CORE_MODE} | version=${URUS_CORE_VERSION} | model=${URUS_DEFAULT_MODEL}`);
  });
})();




