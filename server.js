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
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
const JWT_SECRET = (process.env.JWT_SECRET || "").trim();

const URUS_CORE_MODE = process.env.URUS_CORE_MODE || "production";
const URUS_CORE_VERSION = process.env.URUS_CORE_VERSION || "A33";
const URUS_DEFAULT_MODEL = process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini";

// Debug seguro (NO imprime secrets completos)
console.log("OPENAI_KEY_PRESENT", !!process.env.OPENAI_API_KEY);
console.log("OPENAI_KEY_LEN", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
console.log("OPENAI_KEY_PREFIX", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 7) : "none");

console.log("DATABASE_URL_PRESENT", !!process.env.DATABASE_URL);
console.log("JWT_SECRET_PRESENT", !!process.env.JWT_SECRET);
console.log("URUS_CORE", { mode: URUS_CORE_MODE, version: URUS_CORE_VERSION, default_model: URUS_DEFAULT_MODEL });

if (!OPENAI_API_KEY) console.error("Missing OPENAI_API_KEY (Railway Variables).");
if (!DATABASE_URL) console.error("Missing DATABASE_URL (Railway Variables).");
if (!JWT_SECRET) console.error("Missing JWT_SECRET (Railway Variables).");

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// Pool Postgres (Railway suele funcionar sin ssl en private network)
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
});

// ---------- MIGRATIONS (crea tablas si no existen) ----------
async function ensureSchema() {
  const sql = `
  create extension if not exists "uuid-ossp";

  create table if not exists users (
    id uuid primary key default uuid_generate_v4(),
    email text unique not null,
    password_hash text not null,
    created_at timestamptz not null default now()
  );

  create table if not exists sessions (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references users(id) on delete set null,
    mode text,
    input text,
    meta jsonb,
    model_used text,
    output jsonb,
    created_at timestamptz not null default now()
  );

  create index if not exists idx_sessions_user_id on sessions(user_id);
  create index if not exists idx_sessions_created_at on sessions(created_at);
  `;
  await pool.query(sql);
  console.log("DB_SCHEMA_OK");
}

// ---------- AUTH HELPERS ----------
function signToken(user) {
  // payload mínimo
  return jwt.sign(
    { sub: user.id, email: user.email, v: URUS_CORE_VERSION },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");
    if (type !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- HEALTH ----------
app.get("/health", async (req, res) => {
  let db_ok = false;
  try {
    if (DATABASE_URL) {
      await pool.query("select 1 as ok");
      db_ok = true;
    }
  } catch {
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

// ---------- AUTH (REAL) ----------
app.post("/v1/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET not set" });
    if (!DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL not set" });

    const normEmail = String(email).trim().toLowerCase();
    const hash = await bcrypt.hash(String(password), 10);

    const q = `
      insert into users (email, password_hash)
      values ($1, $2)
      returning id, email, created_at
    `;
    const r = await pool.query(q, [normEmail, hash]);
    const user = r.rows[0];

    const token = signToken(user);
    res.json({ user_id: user.id, email: user.email, token });
  } catch (err) {
    // unique violation (email)
    if (String(err?.message || "").toLowerCase().includes("duplicate")) {
      return res.status(409).json({ error: "email already exists" });
    }
    console.error("SIGNUP_ERROR", err?.message || err);
    res.status(500).json({ error: "signup failed", details: err?.message || String(err) });
  }
});

app.post("/v1/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET not set" });
    if (!DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL not set" });

    const normEmail = String(email).trim().toLowerCase();

    const q = `select id, email, password_hash from users where email = $1 limit 1`;
    const r = await pool.query(q, [normEmail]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = signToken(user);
    res.json({ user_id: user.id, email: user.email, token });
  } catch (err) {
    console.error("LOGIN_ERROR", err?.message || err);
    res.status(500).json({ error: "login failed", details: err?.message || String(err) });
  }
});

// ---------- URUS CORE (PROTEGIDO CON JWT) ----------
app.post("/v1/urus/ingest_session", requireAuth, async (req, res) => {
  try {
    const { input = "", mode = "URUS_CORE", meta = {}, model } = req.body || {};
    const selectedModel = model || URUS_DEFAULT_MODEL;

    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not set" });
    if (!DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL not set" });

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

    const userMsg = `USER_ID:\n${req.user.id}\n\nINPUT:\n${input}\n\nMETA:\n${JSON.stringify(meta)}\n\nMODE:\n${mode}`;

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

    // Guarda session en DB
    const insert = `
      insert into sessions (user_id, mode, input, meta, model_used, output)
      values ($1, $2, $3, $4, $5, $6)
      returning id, created_at
    `;
    const dbRes = await pool.query(insert, [
      req.user.id,
      mode,
      String(input || ""),
      meta || {},
      selectedModel,
      parsed,
    ]);

    console.log("URUS_CALL", {
      route: "/v1/urus/ingest_session",
      selectedModel,
      core_version: URUS_CORE_VERSION,
      user_id: req.user.id,
      session_id: dbRes.rows[0]?.id,
    });

    res.json({
      ...parsed,
      model_used: selectedModel,
      session_id: dbRes.rows[0]?.id,
      created_at: dbRes.rows[0]?.created_at,
    });
  } catch (err) {
    console.error("URUS_ERROR", err?.message || err);
    res.status(500).json({
      error: "URUS Core call failed",
      details: err?.message || String(err),
    });
  }
});

// ---------- SESSIONS (LISTAR) ----------
app.get("/v1/sessions", requireAuth, async (req, res) => {
  try {
    const q = `
      select id, mode, model_used, created_at, output
      from sessions
      where user_id = $1
      order by created_at desc
      limit 50
    `;
    const r = await pool.query(q, [req.user.id]);
    res.json({ user_id: req.user.id, items: r.rows });
  } catch (err) {
    console.error("SESSIONS_ERROR", err?.message || err);
    res.status(500).json({ error: "failed to list sessions", details: err?.message || String(err) });
  }
});

// ---------- BILLING (placeholder) ----------
app.post("/v1/billing/checkout", requireAuth, (req, res) => {
  res.json({ url: "https://stripe.com/test" });
});

// ---------- START ----------
(async () => {
  try {
    if (DATABASE_URL) {
      await ensureSchema(); // <-- AQUI se “corre el SQL” automáticamente
    }
    app.listen(PORT, () => console.log("URUS Backend running on", PORT));
  } catch (err) {
    console.error("BOOT_ERROR", err?.message || err);
    process.exit(1);
  }
})();


