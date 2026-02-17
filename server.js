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
console.log(
  "OPENAI_KEY_PREFIX",
  process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 7) : "none"
);
console.log("DATABASE_URL_PRESENT", !!process.env.DATABASE_URL);
console.log("JWT_SECRET_PRESENT", !!process.env.JWT_SECRET);
console.log("URUS_CORE", {
  mode: URUS_CORE_MODE,
  version: URUS_CORE_VERSION,
  default_model: URUS_DEFAULT_MODEL,
});

if (!OPENAI_API_KEY) console.error("Missing OPENAI_API_KEY (Railway Variables).");
if (!DATABASE_URL) console.error("Missing DATABASE_URL (Railway Variables).");
if (!JWT_SECRET) console.error("Missing JWT_SECRET (Railway Variables).");

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// Pool Postgres (Railway private network suele funcionar sin ssl)
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
});

// ------------------ PLAN LIMITS ------------------
function planMonthlyLimit(plan) {
  // Ajusta cuando quieras
  if (plan === "elite") return 1000000; // “ilimitado” por ahora
  if (plan === "pro") return 300;
  return 30; // free
}

// ------------------ MIGRATIONS ------------------
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

  // Columns para planes / uso mensual (no rompe si ya existen)
  const alter = `
  alter table users
    add column if not exists plan text default 'free',
    add column if not exists monthly_usage integer default 0,
    add column if not exists monthly_limit integer default 30,
    add column if not exists usage_reset_at timestamptz default (now() + interval '1 month');
  `;
  await pool.query(alter);

  // Normaliza límites para usuarios existentes (por si monthly_limit quedó null)
  await pool.query(`
    update users
    set monthly_limit = coalesce(monthly_limit, 30),
        plan = coalesce(plan, 'free'),
        monthly_usage = coalesce(monthly_usage, 0),
        usage_reset_at = coalesce(usage_reset_at, now() + interval '1 month')
  `);

  console.log("DB_SCHEMA_OK");
}

// ------------------ AUTH HELPERS ------------------
function signToken(user) {
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

// ------------------ USAGE GATE (PLAN LIMITS) ------------------
async function enforceMonthlyLimit(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // lee user
    const r = await pool.query(
      `select id, email, plan, monthly_usage, monthly_limit, usage_reset_at
       from users where id = $1 limit 1`,
      [userId]
    );
    const u = r.rows[0];
    if (!u) return res.status(401).json({ error: "User not found" });

    // reset mensual automático
    const now = new Date();
    const resetAt = u.usage_reset_at ? new Date(u.usage_reset_at) : null;

    if (!resetAt || now >= resetAt) {
      const newLimit = planMonthlyLimit(u.plan || "free");
      await pool.query(
        `update users
         set monthly_usage = 0,
             monthly_limit = $2,
             usage_reset_at = now() + interval '1 month'
         where id = $1`,
        [userId, newLimit]
      );

      u.monthly_usage = 0;
      u.monthly_limit = newLimit;
    }

    // si monthly_limit no coincide con plan (por upgrades), lo normalizamos
    const expectedLimit = planMonthlyLimit(u.plan || "free");
    if (Number(u.monthly_limit) !== Number(expectedLimit)) {
      await pool.query(
        `update users set monthly_limit = $2 where id = $1`,
        [userId, expectedLimit]
      );
      u.monthly_limit = expectedLimit;
    }

    // enforce
    if (Number(u.monthly_usage) >= Number(u.monthly_limit)) {
      return res.status(403).json({
        error: "Monthly limit reached",
        plan: u.plan,
        monthly_usage: u.monthly_usage,
        monthly_limit: u.monthly_limit,
        resets_at: u.usage_reset_at,
      });
    }

    // attach for later
    req.usage = {
      plan: u.plan,
      monthly_usage: Number(u.monthly_usage) || 0,
      monthly_limit: Number(u.monthly_limit) || expectedLimit,
      resets_at: u.usage_reset_at,
    };

    return next();
  } catch (err) {
    console.error("USAGE_GATE_ERROR", err?.message || err);
    return res.status(500).json({ error: "Usage gate failed" });
  }
}

async function incrementUsage(userId) {
  await pool.query(
    `update users set monthly_usage = monthly_usage + 1 where id = $1`,
    [userId]
  );
}

// ------------------ ROUTES ------------------
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

// -------- AUTH (REAL) --------
app.post("/v1/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET not set" });
    if (!DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL not set" });

    const normEmail = String(email).trim().toLowerCase();
    const hash = await bcrypt.hash(String(password), 10);

    const q = `
      insert into users (email, password_hash, plan, monthly_usage, monthly_limit, usage_reset_at)
      values ($1, $2, 'free', 0, $3, now() + interval '1 month')
      returning id, email, created_at, plan, monthly_usage, monthly_limit, usage_reset_at
    `;
    const r = await pool.query(q, [normEmail, hash, planMonthlyLimit("free")]);
    const user = r.rows[0];

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
  } catch (err) {
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

    const q = `select id, email, password_hash, plan, monthly_usage, monthly_limit, usage_reset_at
               from users where email = $1 limit 1`;
    const r = await pool.query(q, [normEmail]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    // Normaliza limits por plan en login
    const expectedLimit = planMonthlyLimit(user.plan || "free");
    if (Number(user.monthly_limit) !== Number(expectedLimit)) {
      await pool.query(`update users set monthly_limit = $2 where id = $1`, [user.id, expectedLimit]);
      user.monthly_limit = expectedLimit;
    }

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
  } catch (err) {
    console.error("LOGIN_ERROR", err?.message || err);
    res.status(500).json({ error: "login failed", details: err?.message || String(err) });
  }
});

// -------- USER INFO --------
app.get("/v1/me", requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `select id, email, plan, monthly_usage, monthly_limit, usage_reset_at, created_at
       from users where id = $1 limit 1`,
      [req.user.id]
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json({
      user_id: u.id,
      email: u.email,
      plan: u.plan,
      monthly_usage: u.monthly_usage,
      monthly_limit: u.monthly_limit,
      resets_at: u.usage_reset_at,
      created_at: u.created_at,
    });
  } catch (err) {
    console.error("ME_ERROR", err?.message || err);
    res.status(500).json({ error: "failed to load user", details: err?.message || String(err) });
  }
});

// -------- UPGRADE (MANUAL POR AHORA) --------
// En producción esto lo haría Stripe webhook. Por ahora es manual para probar.
// body: { plan: "pro" | "elite" }
app.post("/v1/plan/upgrade", requireAuth, async (req, res) => {
  try {
    const plan = String(req.body?.plan || "").trim().toLowerCase();
    if (!["free", "pro", "elite"].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan. Use free|pro|elite" });
    }

    const limit = planMonthlyLimit(plan);

    const r = await pool.query(
      `update users
       set plan = $2,
           monthly_limit = $3
       where id = $1
       returning id, email, plan, monthly_usage, monthly_limit, usage_reset_at`,
      [req.user.id, plan, limit]
    );

    res.json({
      ok: true,
      user_id: r.rows[0].id,
      email: r.rows[0].email,
      plan: r.rows[0].plan,
      monthly_usage: r.rows[0].monthly_usage,
      monthly_limit: r.rows[0].monthly_limit,
      resets_at: r.rows[0].usage_reset_at,
    });
  } catch (err) {
    console.error("UPGRADE_ERROR", err?.message || err);
    res.status(500).json({ error: "upgrade failed", details: err?.message || String(err) });
  }
});

// -------- URUS CORE (PROTEGIDO + LIMITS) --------
app.post("/v1/urus/ingest_session", requireAuth, enforceMonthlyLimit, async (req, res) => {
  const t0 = Date.now();
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

    // Guardar session en DB
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

    // Incrementa usage (una vez por request exitosa)
    await incrementUsage(req.user.id);

    console.log("URUS_CALL", {
      route: "/v1/urus/ingest_session",
      selectedModel,
      core_version: URUS_CORE_VERSION,
      user_id: req.user.id,
      session_id: dbRes.rows[0]?.id,
      plan: req.usage?.plan,
      usage_before: req.usage?.monthly_usage,
      limit: req.usage?.monthly_limit,
      ms: Date.now() - t0,
    });

    res.json({
      ...parsed,
      model_used: selectedModel,
      session_id: dbRes.rows[0]?.id,
      created_at: dbRes.rows[0]?.created_at,
      usage: {
        plan: req.usage?.plan,
        monthly_usage_before: req.usage?.monthly_usage,
        monthly_limit: req.usage?.monthly_limit,
        resets_at: req.usage?.resets_at,
      },
    });
  } catch (err) {
    console.error("URUS_ERROR", err?.message || err);
    res.status(500).json({
      error: "URUS Core call failed",
      details: err?.message || String(err),
    });
  }
});

// -------- SESSIONS (LISTAR) --------
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

// -------- BILLING (placeholder) --------
app.post("/v1/billing/checkout", requireAuth, (req, res) => {
  res.json({ url: "https://stripe.com/test" });
});

// -------- START --------
(async () => {
  try {
    if (DATABASE_URL) {
      await ensureSchema(); // crea/actualiza tablas y columnas
    }
    app.listen(PORT, () => console.log("URUS Backend running on", PORT));
  } catch (err) {
    console.error("BOOT_ERROR", err?.message || err);
    process.exit(1);
  }
})();



