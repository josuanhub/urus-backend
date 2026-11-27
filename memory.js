/**
 * URUS OS v2 — MEMORY
 * NO crea una memoria nueva. Usa tu tabla jarvis_memory (con embeddings pgvector):
 *   - ESCRIBE con source = 'os'   (lo que genera el OS: resultados, notas, diario...)
 *   - LEE   source = 'urus'       (lo que tu chat /urus ya aprendió de ti) — solo lectura
 * Cada registro del OS lleva metadata.project_id para separar proyectos.
 *
 * v2.1 — el Brain ya "te conoce" aunque OpenAI no tenga crédito:
 *   - Lo que sabe de TI (source 'urus') se recupera con urus-recall.js: núcleo siempre presente
 *     + búsqueda por significado, o por palabras si los embeddings fallan.
 *   - La memoria del PROYECTO también cae a búsqueda por palabras si no hay embeddings.
 */
'use strict';

const { createRecall, tokens } = require('../urus-recall');

let _pool = null;
let _openai = null;
let _recall = null;

const OS_SOURCE = 'os';
const PERSONAL_SOURCE = 'urus';

function init({ pool, openai }) {
  _pool = pool;
  _openai = openai;
  _recall = createRecall({
    pool,
    embed: async (text) => {
      if (!openai) throw new Error('sin cliente OpenAI');
      const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: String(text).slice(0, 8000) });
      return r.data[0].embedding;
    },
    source: PERSONAL_SOURCE,
    // El Brain recibe poco texto personal por paso; el núcleo aquí es corto a propósito.
    coreMaxChars: Math.min(Math.max(parseInt(process.env.URUS_OS_CORE_MAX_CHARS || '1200', 10) || 1200, 300), 6000),
  });
}

async function embed(text) {
  if (!_openai || !text) return null;
  try {
    const r = await _openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: String(text).slice(0, 8000),
    });
    return r.data[0].embedding;
  } catch (e) {
    console.warn('[OS memory] embedding falló:', e.message);
    return null;
  }
}

const vecStr = (v) => '[' + v.join(',') + ']';

async function save({ content, type = 'note', projectId = null, runId = null, agent = null, metadata = {} }) {
  const clean = String(content || '').trim();
  if (!clean) return null;
  const meta = JSON.stringify({ ...metadata, project_id: projectId, run_id: runId, at: new Date().toISOString() });
  const vec = await embed(clean);

  if (vec) {
    const r = await _pool.query(
      `INSERT INTO jarvis_memory (content, type, source, agent, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector) RETURNING id`,
      [clean.slice(0, 10000), type, OS_SOURCE, agent, meta, vecStr(vec)]
    );
    return r.rows[0].id;
  }
  const r = await _pool.query(
    `INSERT INTO jarvis_memory (content, type, source, agent, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [clean.slice(0, 10000), type, OS_SOURCE, agent, meta]
  );
  return r.rows[0].id;
}

/** Búsqueda por palabras (español) en la memoria del OS, por proyecto. Gratis, sin embeddings. */
async function keywordProject({ query, projectId, limit }) {
  const toks = tokens(query);
  if (!toks.length) return [];
  try {
    const r = await _pool.query(
      `SELECT id, content, type, created_at
       FROM jarvis_memory
       WHERE source = $1
         AND ($2::text IS NULL OR metadata->>'project_id' = $2)
         AND to_tsvector('spanish', content) @@ to_tsquery('spanish', $3)
       ORDER BY ts_rank(to_tsvector('spanish', content), to_tsquery('spanish', $3)) DESC, created_at DESC
       LIMIT $4`,
      [OS_SOURCE, projectId, toks.join(' | '), limit]
    );
    return r.rows;
  } catch (e) {
    console.warn('[OS memory] búsqueda por palabras falló:', e.message);
    return [];
  }
}

/** Memoria del OS (por proyecto si se indica). Por significado; sin vector → por palabras; si no, lo reciente. */
async function search({ query, vec = undefined, projectId = null, limit = 6, minSimilarity = 0.22 }) {
  try {
    const v = vec === undefined ? await embed(query) : vec;
    if (!v) {
      const kw = await keywordProject({ query, projectId, limit });
      return kw.length ? kw : await recent({ projectId, limit });
    }
    const r = await _pool.query(
      `SELECT id, content, type, created_at, 1 - (embedding <=> $1::vector) AS similarity
       FROM jarvis_memory
       WHERE source = $2 AND embedding IS NOT NULL
         AND ($3::text IS NULL OR metadata->>'project_id' = $3)
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [vecStr(v), OS_SOURCE, projectId, limit]
    );
    return r.rows.filter((x) => Number(x.similarity) >= minSimilarity);
  } catch (e) {
    console.warn('[OS memory] search falló:', e.message);
    return [];
  }
}

/**
 * Lo que tu chat /urus ya sabe de ti (hechos, identidad, principios...). Solo lectura.
 * Devuelve primero el NÚCLEO (siempre presente) y luego lo relevante a la consulta.
 * El parámetro vec se ignora (se conserva por compatibilidad): urus-recall hace su propia búsqueda.
 */
async function personalContext({ query, vec = undefined, limit = 6 }) {
  try {
    if (!_recall) return [];
    const rec = await _recall.recall({ message: query, limits: { knowledge: limit, past: 0 } });
    const core = rec.core.map((x) => ({ content: x.content, type: x.type, similarity: null, core: true }));
    const know = rec.knowledge.map((x) => ({
      content: x.content, type: x.type, similarity: x.similarity != null ? Number(x.similarity) : null,
    }));
    return [...core, ...know];
  } catch (e) {
    console.warn('[OS memory] personalContext falló:', e.message);
    return [];
  }
}

async function recent({ projectId = null, limit = 10 }) {
  try {
    const r = await _pool.query(
      `SELECT id, content, type, created_at
       FROM jarvis_memory
       WHERE source = $1 AND ($2::text IS NULL OR metadata->>'project_id' = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [OS_SOURCE, projectId, limit]
    );
    return r.rows;
  } catch (e) {
    console.warn('[OS memory] recent falló:', e.message);
    return [];
  }
}

module.exports = { init, embed, save, search, personalContext, recent };
