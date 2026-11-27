/**
 * URUS GATEWAY — Capa de abstracción de modelo (model-agnostic)
 * ------------------------------------------------------------------
 * Objetivo: que el resto de URUS (Studio, JARVIS, Core) deje de llamar
 * directamente a OpenAI/Anthropic y llame a UNA sola función: callModel().
 *
 * Cambiar de "cerebro" = cambiar variables de entorno, NO reescribir código.
 *
 * Providers soportados hoy:
 *   - openai      (default — compatible con tu gpt-4o-mini actual)
 *   - anthropic   (Claude Sonnet, para Studio/Factory)
 *   - deepseek    (API compatible OpenAI — puente rápido)
 *   - self_hosted (Qwen/Mistral vía vLLM — API compatible OpenAI)
 *
 * ENV (todas opcionales; si faltan, el default replica tu comportamiento actual):
 *   URUS_MODEL_PROVIDER   default "openai"
 *   URUS_MODEL            default "gpt-4o-mini"
 *   OPENAI_API_KEY        (ya la tienes)
 *   ANTHROPIC_API_KEY / STUDIO_ANTHROPIC_KEY  (ya las tienes)
 *   DEEPSEEK_API_KEY
 *   URUS_MODEL_BASE_URL   (para self_hosted vLLM, ej: https://model.urus.system/v1)
 *   URUS_SELF_HOSTED_KEY  (opcional, si tu vLLM pide token)
 *   URUS_FALLBACK_CHAIN   respaldo si el modelo principal falla, ej: "openai:gpt-4o-mini,anthropic:claude-haiku-5-5"
 *
 * Uso:
 *   const { callModel } = require("./urus-gateway");
 *   const text = await callModel({
 *     messages: [{ role: "system", content: "..." }, { role: "user", content: "..." }],
 *     temperature: 0.7,
 *   });
 */

const OpenAI = require("openai").default;

// ------------------------------------------------------------------
// Config leída una sola vez al arrancar
// ------------------------------------------------------------------
const DEFAULT_PROVIDER = process.env.URUS_MODEL_PROVIDER || "openai";
const DEFAULT_MODEL = process.env.URUS_MODEL || "gpt-4o-mini";

// Clientes se crean perezosamente (solo si se usan) para no exigir claves
// de providers que no vas a tocar todavía.
let _openaiClient = null;
let _deepseekClient = null;
let _selfHostedClient = null;
let _anthropicClient = null;

function getOpenAIClient() {
  if (_openaiClient) return _openaiClient;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("URUS_GATEWAY: falta OPENAI_API_KEY para provider 'openai'");
  }
  _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openaiClient;
}

function getDeepSeekClient() {
  if (_deepseekClient) return _deepseekClient;
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("URUS_GATEWAY: falta DEEPSEEK_API_KEY para provider 'deepseek'");
  }
  // DeepSeek expone una API compatible con OpenAI: reusamos el SDK.
  _deepseekClient = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  return _deepseekClient;
}

function getSelfHostedClient() {
  if (_selfHostedClient) return _selfHostedClient;
  if (!process.env.URUS_MODEL_BASE_URL) {
    throw new Error("URUS_GATEWAY: falta URUS_MODEL_BASE_URL para provider 'self_hosted'");
  }
  // vLLM expone API compatible con OpenAI. La key puede ser un placeholder.
  _selfHostedClient = new OpenAI({
    apiKey: process.env.URUS_SELF_HOSTED_KEY || "not-needed",
    baseURL: process.env.URUS_MODEL_BASE_URL,
  });
  return _selfHostedClient;
}

function getAnthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  const key = process.env.STUDIO_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("URUS_GATEWAY: falta ANTHROPIC_API_KEY/STUDIO_ANTHROPIC_KEY para provider 'anthropic'");
  }
  const Anthropic = require("@anthropic-ai/sdk");
  _anthropicClient = new Anthropic({ apiKey: key });
  return _anthropicClient;
}

// ------------------------------------------------------------------
// Normalización de mensajes
// Anthropic separa el system prompt del array de messages; OpenAI no.
// Esta función convierte el formato OpenAI (uniforme) al de Anthropic.
// ------------------------------------------------------------------
function splitSystemForAnthropic(messages) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  return { system, messages: rest };
}

// ------------------------------------------------------------------
// callModel — la única función que el resto de URUS debe usar
// ------------------------------------------------------------------
/**
 * @param {Object}   opts
 * @param {Array}    opts.messages       [{ role, content }, ...] (formato OpenAI)
 * @param {string}  [opts.provider]      override del provider por llamada
 * @param {string}  [opts.model]         override del modelo por llamada
 * @param {number}  [opts.temperature]   default 0.7
 * @param {number}  [opts.top_p]         default 1
 * @param {number}  [opts.max_tokens]    default 4000 (usado por Anthropic; OpenAI lo ignora si no aplica)
 * @param {boolean} [opts.raw]           si true, devuelve el objeto completo del SDK en vez del texto
 * @returns {Promise<string|object>}     texto de la respuesta (o el objeto crudo si raw=true)
 */
async function callModel({
  messages,
  provider = DEFAULT_PROVIDER,
  model = DEFAULT_MODEL,
  temperature = 0.7,
  top_p = 1,
  max_tokens = 4000,
  raw = false,
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("URUS_GATEWAY: 'messages' es requerido y debe ser un array no vacío");
  }

  switch (provider) {
    // --- Familia compatible con OpenAI (openai / deepseek / self_hosted) ---
    case "openai":
    case "deepseek":
    case "self_hosted": {
      const client =
        provider === "openai"
          ? getOpenAIClient()
          : provider === "deepseek"
          ? getDeepSeekClient()
          : getSelfHostedClient();

      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature,
        top_p,
      });

      if (raw) return completion;
      return String(completion?.choices?.[0]?.message?.content || "").trim();
    }

    // --- Anthropic (formato distinto) ---
    case "anthropic": {
      const client = getAnthropicClient();
      const { system, messages: anthMessages } = splitSystemForAnthropic(messages);

      const resp = await client.messages.create({
        model,
        max_tokens,
        system: system || undefined,
        messages: anthMessages,
        temperature,
      });

      if (raw) return resp;
      // Anthropic devuelve content como array de bloques
      const text = (resp.content || [])
        .map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("\n");
      return String(text).trim();
    }

    default:
      throw new Error(`URUS_GATEWAY: provider desconocido "${provider}"`);
  }
}

// ------------------------------------------------------------------
// callModelChain — igual que callModel, pero NUNCA deja al chat sin cerebro:
// prueba el modelo principal y, si falla (modelo retirado, sin saldo, caído, lento),
// prueba los de respaldo en orden. Cada intento tiene límite de tiempo.
// Respaldo por defecto: OpenAI gpt-4o-mini, luego Claude Haiku (solo si hay key).
// Se cambia sin tocar código con URUS_FALLBACK_CHAIN="proveedor:modelo,proveedor:modelo"
// Devuelve { text, provider, model, fallback, attempts }
// ------------------------------------------------------------------
function fallbackChain() {
  const raw = process.env.URUS_FALLBACK_CHAIN;
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const i = s.indexOf(":");
        return i > 0 ? { provider: s.slice(0, i), model: s.slice(i + 1) } : null;
      })
      .filter(Boolean);
  }
  return [
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "anthropic", model: "claude-haiku-5-5" },
  ];
}

async function callModelChain({
  provider = DEFAULT_PROVIDER,
  model = DEFAULT_MODEL,
  timeoutMs = 60000,
  raw, // se ignora: la cadena siempre devuelve texto
  ...rest
} = {}) {
  const seen = new Set();
  const chain = [{ provider, model }, ...fallbackChain()].filter((c) => {
    const k = c.provider + "/" + c.model;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const configured = gatewayStatus().providers_configured;
  const attempts = [];

  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    if (!configured[c.provider]) {
      attempts.push({ ...c, skipped: "sin API key o proveedor desconocido" });
      continue;
    }
    let timer;
    try {
      const text = await Promise.race([
        callModel({ ...rest, provider: c.provider, model: c.model }),
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(new Error("timeout de " + Math.round(timeoutMs / 1000) + "s")), timeoutMs);
        }),
      ]);
      if (!text) throw new Error("respuesta vacía");
      return { text, provider: c.provider, model: c.model, fallback: i > 0, attempts };
    } catch (e) {
      attempts.push({ ...c, error: String((e && e.message) || e).slice(0, 200) });
      console.warn(`[URUS_GATEWAY] ${c.provider}/${c.model} falló: ${String((e && e.message) || e).slice(0, 160)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const err = new Error("URUS_GATEWAY: ningún modelo respondió → " + JSON.stringify(attempts));
  err.attempts = attempts;
  throw err;
}

// ------------------------------------------------------------------
// Diagnóstico: qué cerebro está activo (útil para logs y /health)
// ------------------------------------------------------------------
function gatewayStatus() {
  return {
    default_provider: DEFAULT_PROVIDER,
    default_model: DEFAULT_MODEL,
    self_hosted_base_url: process.env.URUS_MODEL_BASE_URL || null,
    providers_configured: {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!(process.env.STUDIO_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY),
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      self_hosted: !!process.env.URUS_MODEL_BASE_URL,
    },
  };
}

module.exports = { callModel, callModelChain, gatewayStatus };
