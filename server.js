const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const URUS_CORE_MODE = process.env.URUS_CORE_MODE || "production";
const URUS_CORE_VERSION = process.env.URUS_CORE_VERSION || "A33";
const URUS_DEFAULT_MODEL = process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini";
const JWT_SECRET = (process.env.JWT_SECRET || "").trim();
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

// Debug seguro (NO imprime secrets completos)
console.log("OPENAI_KEY_PRESENT", !!process.env.OPENAI_API_KEY);
console.log("OPENAI_KEY_LEN", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
console.log("OPENAI_KEY_PREFIX", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 7) : "none");
console.log("JWT_SECRET_PRESENT", !!JWT_SECRET);
console.log("DATABASE_URL_PRESENT", !!DATABASE_URL);

if (!OPENAI_API_KEY) console.error("Missing OPENAI_API_KEY (Railway Variables).");
if (!JWT_SECRET) console.error("Missing JWT_SECRET (Railway Variables).");
if (!DATABASE_URL) console.error("Missing DATABASE_URL (Railway Variables).");

// Postgres pool (Railway)
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("railway.internal") ? false : { rejectUnauthorized: false },
});

async function dbPing() {
  const r = await pool.query("SELECT 1 as ok");
  return r.rows?.[0]?.ok === 1;
}

// Middleware auth (JWT)
function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

app.get("/health", async (req, res) => {
  let db_ok = false;
  try {
    db_ok = await dbPing();
  } catch (e) {
    db_ok = false;
  }

  res.json({
    ok: true,
    service: "urus-backend",
    core_mode: URUS_CORE_MODE,
    core_version: URUS_CORE_VERSION,
    default_model: URUS_DEFAULT_MODEL,
    db_ok,
  });
});

// -------- AUTH REAL --------

// POST /v1/auth/signup  { email, password }
app.post("/v1/auth/signup", async (req, res) => {
  try {
    const email = (req.body?.email || "").toLowerCase().trim();
    const password = req.body?.password || "";

    if (!email || !password) return res.status(400).json({ error: "email+password required" });

    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rowCount > 0) return res.status(409).json({ error: "email already exists" });

    const hash = await bcrypt.hash(password, 12);

    const r = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hash]
    );

    const user = r.rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    res.json({ user_id: user.id, email: user.email, token });
  } catch (err) {
    console.error("SIGNUP_ERROR", err?.message || err);
    res.status(500).json({ error: "signup failed", details: err?.message || String(err) });
  }
});

// POST /v1/auth/login  { email, password }
app.post("/v1/auth/login", async (req, res) => {
  try {
    const email = (req.body?.email || "").toLowerCase().trim();
    const password = req.body?.password || "";

    if (!email || !password) return res.status(400).json({ error: "email+password required" });

    const r = await pool.query("SELECT id, email, password_hash FROM users WHERE email=$1", [email]);
    if (r.rowCount === 0) return res.status(401).json({ error: "invalid credentials" });

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ user_id: user.id, email: user.email, token });
  } catch (err) {
    console.error("LOGIN_ERROR", err?.message || err);
    res.status(500).json({ error: "login failed", details: err?.message || String(err) });
  }
});

// -------- URUS CORE (PROTEGIDO) --------
app.post("/v1/urus/ingest_session", requireAuth, async (req, res) => {
  try {
    const { input = "", mode = "URUS_CORE", meta = {}, model } = req.body || {};
    const selectedModel = model || URUS_DEFAULT_MODEL;

    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not set" });

    const system = `Eres URUS Core LM Gateway (v=${URUS_CORE_VERSION}, mode=${URUS_CORE_MODE}).
Devuelve SIEMPRE JSON válido con esta forma:
{
  "activation_id": string,
  "core_version": string,
  "mode": string,
  "final_output": {
    "summary": string,
    "signals": string[],
    "next_action": string
  }
}
No incluyas texto fuera del JSON.`;

    const userMsg = `INPUT:\n${input}\n\nMETA:\n${JSON.stringify(meta)}\n\nMODE:\n${mode}`;

    const r = await client.responses.create({
      model: selectedModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
    });

    const text = (r.output_text || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        activation_id: `act_${Date.now()}`,
        core_version: URUS_CORE_VERSION,
        mode,
        final_output: {
          summary: text || "No output",
          signals: [],
          next_action: "Refine prompt for strict JSON.",
        },
      };
    }

    // Guarda sesión en DB
    const user_id = req.user?.sub || null;
    await pool.query(
      "INSERT INTO sessions (user_id, mode, input, meta, output, model_used) VALUES ($1,$2,$3,$4,$5,$6)",
      [user_id, mode, input, meta, parsed, selectedModel]
    );

    console.log("URUS_CALL", { route: "/v1/urus/ingest_session", selectedModel, core_version: URUS_CORE_VERSION });

    res.json({ ...parsed, model_used: selectedModel });
  } catch (err) {
    console.error("URUS_ERROR", err?.message || err);
    res.status(500).json({ error: "URUS Core call failed", details: err?.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log("URUS Backend running on", PORT);
});

