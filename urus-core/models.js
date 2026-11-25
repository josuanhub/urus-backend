/**
 * URUS OS v2 — MODELS
 * Router de modelos. REUTILIZA tu urus-gateway.js para openai y anthropic,
 * y agrega deepseek / groq / gemini / xai (todos hablan el formato OpenAI).
 *
 * Idea clave: cada "ruta" (planning, writing, research...) es una CADENA de modelos.
 * Si un modelo falla o no tiene API key, se prueba el siguiente. Nada se cae por un modelo.
 */
'use strict';

const gateway = require('../urus-gateway');
const OpenAIPkg = require('openai');
const OpenAI = OpenAIPkg.default || OpenAIPkg.OpenAI || OpenAIPkg;

// Proveedores compatibles con la API de OpenAI (solo cambia baseURL y key)
const COMPAT = {
  deepseek: { baseURL: 'https://api.deepseek.com', keyEnv: ['DEEPSEEK_API_KEY'] },
  groq:     { baseURL: 'https://api.groq.com/openai/v1', keyEnv: ['STUDIO_GROQ_KEY', 'GROQ_API_KEY'] },
  gemini:   { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', keyEnv: ['GEMINI_API_KEY'] },
  xai:      { baseURL: 'https://api.x.ai/v1', keyEnv: ['XAI_API_KEY'] },
};
// Proveedores que ya maneja tu urus-gateway.js
const NATIVE = {
  openai:    ['OPENAI_API_KEY'],
  anthropic: ['STUDIO_ANTHROPIC_KEY', 'ANTHROPIC_API_KEY'],
};

function envKey(list) {
  for (const k of list) if (process.env[k]) return process.env[k];
  return '';
}

function providerAvailable(provider) {
  if (COMPAT[provider]) return !!envKey(COMPAT[provider].keyEnv);
  if (NATIVE[provider]) return !!envKey(NATIVE[provider]);
  if (provider === 'self_hosted') return !!process.env.URUS_MODEL_BASE_URL;
  return false;
}

function status() {
  const out = {};
  for (const p of [...Object.keys(NATIVE), ...Object.keys(COMPAT)]) out[p] = providerAvailable(p);
  out.self_hosted = providerAvailable('self_hosted');
  return out;
}

const _clients = {};
function compatClient(provider) {
  if (_clients[provider]) return _clients[provider];
  const cfg = COMPAT[provider];
  _clients[provider] = new OpenAI({
    apiKey: envKey(cfg.keyEnv),
    baseURL: cfg.baseURL,
    timeout: 90000,
    maxRetries: 1,
  });
  return _clients[provider];
}

function withTimeout(promise, ms, label) {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`timeout ${Math.round(ms / 1000)}s en ${label}`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

async function callOnce({ provider, model, messages, temperature = 0.4, max_tokens = 3000, thinking = false }) {
  // openai / anthropic / self_hosted → tu gateway, tal cual
  if (provider === 'openai' || provider === 'anthropic' || provider === 'self_hosted') {
    return gateway.callModel({ provider, model, messages, temperature, max_tokens });
  }

  if (!COMPAT[provider]) throw new Error(`proveedor desconocido: ${provider}`);
  const client = compatClient(provider);
  const body = { model, messages, temperature, max_tokens };

  // DeepSeek V4: el modo "thinking" se declara explícito (apagado para tareas normales)
  const isV4 = provider === 'deepseek' && /^deepseek-v4/.test(model);
  if (isV4) body.thinking = { type: thinking ? 'enabled' : 'disabled' };

  try {
    const res = await client.chat.completions.create(body);
    return String(res?.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    // Si la API rechaza el parámetro thinking, reintenta sin él
    if (isV4 && (e.status === 400 || e.status === 422)) {
      delete body.thinking;
      const res = await client.chat.completions.create(body);
      return String(res?.choices?.[0]?.message?.content || '').trim();
    }
    throw e;
  }
}

/**
 * Prueba la cadena en orden. Devuelve { text, provider, model, attempts }.
 */
async function call({ chain, messages, temperature, max_tokens, thinking }) {
  const attempts = [];
  for (const c of chain) {
    if (!providerAvailable(c.provider)) {
      attempts.push({ provider: c.provider, model: c.model, skipped: 'sin API key' });
      continue;
    }
    try {
      const text = await withTimeout(
        callOnce({ provider: c.provider, model: c.model, messages, temperature, max_tokens, thinking }),
        100000,
        `${c.provider}/${c.model}`
      );
      if (!text) throw new Error('respuesta vacía');
      return { text, provider: c.provider, model: c.model, attempts };
    } catch (e) {
      attempts.push({ provider: c.provider, model: c.model, error: String(e.message || e).slice(0, 200) });
      console.warn(`[OS models] ${c.provider}/${c.model} falló: ${String(e.message || e).slice(0, 160)}`);
    }
  }
  const err = new Error('Ningún modelo de la cadena respondió: ' + JSON.stringify(attempts));
  err.attempts = attempts;
  throw err;
}

function callRoute(route, opts) {
  const Registry = require('./registry'); // carga diferida: evita dependencia circular
  return call({ chain: Registry.chainFor(route), ...opts });
}

/**
 * Extrae el primer JSON válido de un texto (con o sin ```json ... ```).
 */
function extractJSON(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* sigue */ }

  const start = s.search(/[\{\[]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Igual que callRoute pero exige JSON. Reintenta una vez si el modelo respondió mal.
 * Devuelve { json, text, provider, model }.
 */
async function callJSON({ route, chain, messages, ...rest }) {
  const run = (msgs) => (chain ? call({ chain, messages: msgs, ...rest }) : callRoute(route, { messages: msgs, ...rest }));
  const first = await run(messages);
  let json = extractJSON(first.text);
  if (json) return { json, text: first.text, provider: first.provider, model: first.model };

  const retry = await run([
    ...messages,
    { role: 'assistant', content: first.text.slice(0, 4000) },
    { role: 'user', content: 'Tu respuesta no fue JSON válido. Responde SOLO con el objeto JSON, sin texto adicional ni bloques de código.' },
  ]);
  json = extractJSON(retry.text);
  if (!json) throw new Error('El modelo no devolvió JSON válido (2 intentos)');
  return { json, text: retry.text, provider: retry.provider, model: retry.model };
}

module.exports = { call, callRoute, callJSON, extractJSON, providerAvailable, status, withTimeout };
