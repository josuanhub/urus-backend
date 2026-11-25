/**
 * URUS OS v2 — MEMORY
 * NO crea una memoria nueva. Usa tu tabla jarvis_memory (con embeddings pgvector):
 *   - ESCRIBE con source = 'os'   (lo que genera el OS: resultados, notas, diario...)
 *   - LEE   source = 'urus'       (lo que tu chat /urus ya aprendió de ti) — solo lectura
 * Cada registro del OS lleva metadata.project_id para separar proyectos.
 */
'use strict';

let _pool = null;
let _openai = null;

const OS_SOURCE = 'os';
const PERSONAL_SOURCE = 'urus';

function init({ pool, openai }) {
  _pool = pool;
  _openai = openai;
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

/** Memoria del OS (por proyecto si se indica). Búsqueda semántica; si no hay vector, devuelve lo reciente. */
async function search({ query, vec = undefined, projectId = null, limit = 6, minSimilarity = 0.22 }) {
  try {
    const v = vec === undefined ? await embed(query) : vec;
    if (!v) return await recent({ projectId, limit });
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

/** Lo que tu chat /urus ya sabe de ti (hechos, identidad, principios...). Solo lectura. */
async function personalContext({ query, vec = undefined, limit = 6, minSimilarity = 0.2 }) {
  try {
    const v = vec === undefined ? await embed(query) : vec;
    if (!v) return [];
    const r = await _pool.query(
      `SELECT content, type, 1 - (embedding <=> $1::vector) AS similarity
       FROM jarvis_memory
       WHERE source = $2 AND embedding IS NOT NULL AND type <> 'conversation'
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [vecStr(v), PERSONAL_SOURCE, limit]
    );
    return r.rows.filter((x) => Number(x.similarity) >= minSimilarity);
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
