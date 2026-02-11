const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const URUS_CORE_MODE = process.env.URUS_CORE_MODE || "production";
const URUS_CORE_VERSION = process.env.URUS_CORE_VERSION || "A33";
const URUS_DEFAULT_MODEL = process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini";

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY (Railway Variables).");
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// Health
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "urus-backend",
    core_mode: URUS_CORE_MODE,
    core_version: URUS_CORE_VERSION,
    default_model: URUS_DEFAULT_MODEL,
  });
});

// Minimal “real” URUS Core call
app.post("/v1/urus/ingest_session", async (req, res) => {
  try {
    const {
      input = "",
      mode = "URUS_CORE",
      meta = {},
      model,
    } = req.body || {};

    const selectedModel = model || URUS_DEFAULT_MODEL;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY not set",
      });
    }

    // Prompt mínimo, pero ya “real” y estructurado
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

    const user = `INPUT:\n${input}\n\nMETA:\n${JSON.stringify(meta)}\n\nMODE:\n${mode}`;

    // Usamos Responses API
    const r = await client.responses.create({
      model: selectedModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Si luego quieres más “consistencia”, sube esto:
      temperature: 0.4,
    });

    // Extraer texto final
    const text = (r.output_text || "").trim();

    // Intentar parsear JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // fallback seguro si el modelo no devolvió JSON perfecto
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

    // Log para ver “modelo real usado” en Railway Logs
    console.log("URUS_CALL", {
      route: "/v1/urus/ingest_session",
      selectedModel,
      core_version: URUS_CORE_VERSION,
    });

    // Respuesta final
    res.json({
      ...parsed,
      // Te lo devuelvo también fuera para auditoría rápida
      model_used: selectedModel,
    });
  } catch (err) {
    console.error("URUS_ERROR", err?.message || err);
    res.status(500).json({
      error: "URUS Core call failed",
      details: err?.message || String(err),
    });
  }
});

// (Opcional) Mantén tus endpoints fake si quieres, pero ya tienes core real arriba
app.post("/v1/auth/signup", (req, res) => {
  res.json({ user_id: "usr_test", email: req.body?.email, token: "fake_token_for_now" });
});
app.post("/v1/auth/login", (req, res) => {
  res.json({ user_id: "usr_test", email: req.body?.email, token: "fake_token_for_now" });
});
app.post("/v1/billing/checkout", (req, res) => {
  res.json({ url: "https://stripe.com/test" });
});

app.listen(PORT, () => {
  console.log("URUS Backend running on", PORT);
});
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/v1/auth/signup", (req, res) => {
  res.json({
    user_id: "usr_test",
    email: req.body.email,
    token: "fake_token_for_now"
  });
});

app.post("/v1/auth/login", (req, res) => {
  res.json({
    user_id: "usr_test",
    email: req.body.email,
    token: "fake_token_for_now"
  });
});

app.post("/v1/urus/ingest_session", (req, res) => {
  res.json({
    activation_id: "act_test",
    final_output: {
      summary: "URUS conectado correctamente 🚀"
    }
  });
});

app.post("/v1/billing/checkout", (req, res) => {
  res.json({
    url: "https://stripe.com/test"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("URUS Backend running");
});
