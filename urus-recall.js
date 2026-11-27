/**
 * URUS RECALL — recuperación de memoria de /urus (memoria total)
 * ------------------------------------------------------------------
 * Problema que resuelve: si OpenAI (embeddings) falla o no tiene crédito, la búsqueda por
 * significado se cae y el chat solo traía "lo último por fecha". Aquí hay 3 capas:
 *
 *   1. NÚCLEO   — lo fundamental sobre el Operador (types identity/principle/protocol/context
 *                 y cualquier recuerdo "fijado"). Se incluye SIEMPRE, no depende de embeddings.
 *   2. SABER    — hechos y conocimiento relevantes a este mensaje.
 *   3. PASADO   — conversaciones antiguas relevantes (no solo las últimas).
 *
 * Búsqueda: por significado (embeddings) si funcionan; si no, por palabras (Postgres full-text,
 * en español, gratis y sin salir de tu base de datos). Los recuerdos guardados sin embedding
 * (mientras estaba caído) también se encuentran por palabras.
 *
 * Nunca lanza error hacia afuera: si una consulta falla, esa capa queda vacía y el chat sigue.
 */
'use strict';

// Tipos que cuentan como "núcleo" (los que se guardan con POST /learn).
const CORE_TYPES = [
  'identity', 'principle', 'protocol', 'context', 'core', 'fundamental',
  'identidad', 'principio', 'protocolo', 'contexto',
];

const vecStr = (v) => '[' + v.join(',') + ']';
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Palabras útiles del mensaje (solo letras/números, 4+ caracteres, sin repetir). */
function tokens(text, max = 12) {
  const seen = new Set();
  const out = [];
  for (const t of String(text || '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Fracción de palabras del mensaje que aparecen en el texto (0..1). */
function kwScore(toks, content) {
  if (!toks.length) return 0;
  const c = String(content || '').toLowerCase();
  let hit = 0;
  for (const t of toks) if (c.includes(t)) hit++;
  return hit / toks.length;
}

function mergeUnique(a, b, limit) {
  const seen = new Set();
  const out = [];
  for (const r of [...a, ...b]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function createRecall({ pool, embed, source = 'urus', coreMaxChars = 6000, log = console }) {
  let downUntil = 0;
  let lastWarn = 0;

  /** Intenta sacar el embedding. Si falla, pausa 60 s para no perder tiempo en cada mensaje. */
  async function tryEmbed(text) {
    if (Date.now() < downUntil) return { vec: null, error: 'embeddings en pausa tras un fallo reciente' };
    try {
      const vec = await embed(text);
      if (!Array.isArray(vec) || !vec.length) throw new Error('vector vacío');
      return { vec, error: null };
    } catch (e) {
      downUntil = Date.now() + 60000;
      const msg = String((e && e.message) || e).slice(0, 160);
      if (Date.now() - lastWarn > 60000) {
        lastWarn = Date.now();
        log.warn('[URUS_RECALL] embeddings no disponibles, busco por palabras:', msg);
      }
      return { vec: null, error: msg };
    }
  }

  function resetBreaker() { downUntil = 0; }

  // ───────────── 1. NÚCLEO ─────────────
  async function loadCore(message, vec, maxChars) {
    let rows;
    try {
      const r = await pool.query(
        `SELECT id, type, content, created_at,
                (metadata->>'pinned') = 'true' AS pinned,
                CASE WHEN $2::vector IS NOT NULL AND embedding IS NOT NULL
                     THEN 1 - (embedding <=> $2::vector) END AS sim
         FROM jarvis_memory
         WHERE source = $1
           AND (type = ANY($3::text[]) OR (metadata->>'pinned') = 'true')
         ORDER BY created_at DESC
         LIMIT 300`,
        [source, vec ? vecStr(vec) : null, CORE_TYPES]
      );
      rows = r.rows;
    } catch (e) {
      log.warn('[URUS_RECALL] núcleo falló:', e.message);
      return [];
    }

    const toks = tokens(message);
    const scored = rows.map((r, i) => ({
      r,
      score: (r.pinned ? 1000 : 0) +
        (r.sim != null ? Number(r.sim) : kwScore(toks, r.content)) * 100 +
        (rows.length - i) / Math.max(rows.length, 1), // desempate: lo más reciente primero
    }));
    scored.sort((a, b) => b.score - a.score);

    const picked = [];
    let used = 0;
    for (const { r } of scored) {
      let text = clip(r.content, 1500);
      if (used + text.length > maxChars) {
        if (picked.length) continue;       // ya hay algo: probar con otros más cortos
        text = text.slice(0, maxChars);    // el primero es enorme: se corta, pero algo entra
      }
      picked.push({ id: r.id, type: r.type, content: text, pinned: !!r.pinned, created_at: r.created_at });
      used += text.length;
    }
    // Presentación: lo más antiguo (fundacional) primero
    picked.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return picked;
  }

  // ───────────── búsquedas ─────────────
  async function semantic({ vec, kind, excludeIds, limit, minSim }) {
    const cond = kind === 'conversation' ? "type = 'conversation'" : "type <> 'conversation'";
    try {
      const r = await pool.query(
        `SELECT id, content, type, created_at, 1 - (embedding <=> $1::vector) AS similarity
         FROM jarvis_memory
         WHERE source = $2 AND embedding IS NOT NULL AND ${cond}
           AND NOT (id = ANY($3::uuid[]))
         ORDER BY embedding <=> $1::vector
         LIMIT $4`,
        [vecStr(vec), source, excludeIds, limit]
      );
      return r.rows.filter((x) => Number(x.similarity) >= minSim);
    } catch (e) {
      log.warn('[URUS_RECALL] búsqueda semántica falló:', e.message);
      return [];
    }
  }

  async function keyword({ toks, kind, excludeIds, limit, onlyUnembedded }) {
    if (!toks.length || limit <= 0) return [];
    const cond = kind === 'conversation' ? "type = 'conversation'" : "type <> 'conversation'";
    try {
      const r = await pool.query(
        `SELECT id, content, type, created_at,
                ts_rank(to_tsvector('spanish', content), to_tsquery('spanish', $2)) AS rank
         FROM jarvis_memory
         WHERE source = $1 AND ${cond}
           AND NOT (id = ANY($3::uuid[]))
           ${onlyUnembedded ? 'AND embedding IS NULL' : ''}
           AND to_tsvector('spanish', content) @@ to_tsquery('spanish', $2)
         ORDER BY rank DESC, created_at DESC
         LIMIT $4`,
        [source, toks.join(' | '), excludeIds, limit]
      );
      return r.rows;
    } catch (e) {
      log.warn('[URUS_RECALL] búsqueda por palabras falló:', e.message);
      return [];
    }
  }

  async function recentKnowledge({ excludeIds, limit }) {
    if (limit <= 0) return [];
    try {
      const r = await pool.query(
        `SELECT id, content, type, created_at
         FROM jarvis_memory
         WHERE source = $1 AND type <> 'conversation' AND NOT (id = ANY($2::uuid[]))
         ORDER BY created_at DESC
         LIMIT $3`,
        [source, excludeIds, limit]
      );
      return r.rows;
    } catch (e) {
      log.warn('[URUS_RECALL] recientes falló:', e.message);
      return [];
    }
  }

  // ───────────── API principal ─────────────
  /**
   * recall({ message, limits }) → { mode, embedError, core, knowledge, past }
   *   mode: 'semantic' (embeddings OK) | 'keyword' (embeddings caídos → búsqueda por palabras)
   */
  async function recall({ message, limits = {} }) {
    const L = { knowledge: 12, past: 6, ...limits };
    const toks = tokens(message);
    const { vec, error } = await tryEmbed(message);
    const mode = vec ? 'semantic' : 'keyword';

    const core = await loadCore(message, vec, coreMaxChars);
    const coreIds = core.map((c) => c.id);

    let knowledge = [];
    let past = [];

    if (vec) {
      const [sk, uk, sp, up] = await Promise.all([
        semantic({ vec, kind: 'knowledge', excludeIds: coreIds, limit: L.knowledge, minSim: 0.25 }),
        // recuerdos guardados mientras los embeddings estaban caídos: solo se encuentran por palabras
        keyword({ toks, kind: 'knowledge', excludeIds: coreIds, limit: 4, onlyUnembedded: true }),
        L.past > 0 ? semantic({ vec, kind: 'conversation', excludeIds: [], limit: L.past, minSim: 0.3 }) : [],
        L.past > 0 ? keyword({ toks, kind: 'conversation', excludeIds: [], limit: 3, onlyUnembedded: true }) : [],
      ]);
      knowledge = mergeUnique(sk, uk, L.knowledge);
      past = mergeUnique(sp, up, L.past);
    } else {
      const [kk, kp] = await Promise.all([
        keyword({ toks, kind: 'knowledge', excludeIds: coreIds, limit: L.knowledge }),
        L.past > 0 ? keyword({ toks, kind: 'conversation', excludeIds: [], limit: L.past }) : [],
      ]);
      knowledge = kk;
      past = kp;
      if (knowledge.length < 4) {
        const rec = await recentKnowledge({
          excludeIds: [...coreIds, ...knowledge.map((k) => k.id)],
          limit: 6 - knowledge.length,
        });
        knowledge = knowledge.concat(rec);
      }
    }
    return { mode, embedError: error, core, knowledge, past };
  }

  return { recall, tryEmbed, resetBreaker, CORE_TYPES };
}

module.exports = { createRecall, CORE_TYPES, tokens, kwScore };
