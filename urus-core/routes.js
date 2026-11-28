/**
 * URUS OS v2 — ROUTES
 * Montaje en server.js (una línea):
 *   app.use("/v1/os-brain", require("./urus-core/routes")({ pool, openai }));
 *
 * Auth: header x-studio-password (el mismo que Studio y /urus). También acepta x-os-brain-key.
 *
 * POST /intent NO te hace esperar: responde al instante con un run_id y trabaja en segundo plano.
 * Tú consultas GET /run/:id y ves el progreso (events) y el resultado cuando termina.
 *
 * v2.1 — PATCH /projects/:ref (editar) y DELETE /projects/:ref (eliminar), para la pantalla /brain.
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const Registry = require('./registry');
const Models = require('./models');
const Memory = require('./memory');
const Tools = require('./tools');
const Master = require('./master');
const Loop = require('./loop');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACTIVE_RUNS = 3;
const RUN_DEADLINE_MS = 8 * 60 * 1000;

const SEED_PROJECTS = [
  { name: 'YouTube', slug: 'youtube', default_agent: 'youtube',
    description: 'Canal de YouTube: nicho, ideas de videos, guiones, SEO y métricas.',
    instructions: 'Usa datos reales de YouTube cuando haya API key. Entrega ideas priorizadas y guiones listos para grabar.' },
  { name: 'El Árbol', slug: 'el-arbol', default_agent: 'arbol',
    description: 'Libro / sistema de vida personal: capturar aprendizajes y estructurar los capítulos.',
    instructions: 'Respeta la voz del Operador. No inventes recuerdos ni hechos de su vida. Captura primero, estructura después.' },
  { name: 'Scraping', slug: 'scraping', default_agent: 'scraping',
    description: 'Sistema de scraping: extraer datos estructurados de sitios y fuentes.',
    instructions: 'Antes de extraer, inspecciona la estructura real de la página. Entrega datos limpios e indica qué campos son confiables.' },
  { name: 'Narrativa', slug: 'narrativa', default_agent: 'narrativa',
    description: 'Escritura narrativa: historias, personajes y estructura.',
    instructions: 'Mantén coherencia de voz y de personajes con lo ya escrito en la memoria del proyecto.' },
];

const slugify = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'proyecto';

module.exports = function osRouter({ pool, openai }) {
  Memory.init({ pool, openai });
  Tools.init({ pool, openai });
  Master.init({ pool });

  const router = express.Router();
  let active = 0;
  let cleaned = false;

  // ── Auth ──  (falla cerrado: sin STUDIO_PASSWORD en Railway, este router no responde)
  router.use((req, res, next) => {
    const secret = process.env.STUDIO_PASSWORD;
    if (!secret) return res.status(503).json({ ok: false, error: 'STUDIO_PASSWORD no está definida en el servidor' });
    const given = crypto.createHash('sha256').update(String(req.headers['x-studio-password'] || req.headers['x-os-brain-key'] || '')).digest();
    const want = crypto.createHash('sha256').update(secret).digest();
    if (crypto.timingSafeEqual(given, want)) return next();
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  });

  // ── Runs que quedaron colgados por un redeploy: se marcan como fallidos (una vez por arranque).
  //    Un proceso recién arrancado no tiene runs propios, así que todo 'planning'/'running' es huérfano.
  //    (Si algún día corres 2 instancias a la vez, hay que cambiar esto.)
  router.use(async (req, res, next) => {
    if (!cleaned) {
      cleaned = true;
      try {
        await pool.query(
          `UPDATE os_runs SET status = 'failed', error = 'interrumpido por reinicio del servidor', updated_at = now()
           WHERE status IN ('planning', 'running')`
        );
      } catch (e) { cleaned = false; } // la tabla puede no existir aún en el primer arranque
    }
    next();
  });

  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error('[OS routes]', e);
    res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 300) });
  });

  // ── Helpers de runs ──
  const makeEmitter = (runId) => async (type, data = {}) => {
    try {
      await pool.query(
        `UPDATE os_runs SET events = events || $2::jsonb, updated_at = now() WHERE id = $1`,
        [runId, JSON.stringify([{ t: new Date().toISOString(), type, ...data }])]
      );
    } catch (e) { console.warn('[OS] no se pudo registrar evento:', e.message); }
  };
  const setStatus = (runId, status) =>
    pool.query(`UPDATE os_runs SET status = $2, updated_at = now() WHERE id = $1`, [runId, status]);
  const finish = (runId, status, result) =>
    pool.query(`UPDATE os_runs SET status = $2, result = $3::jsonb, updated_at = now() WHERE id = $1`,
      [runId, status, JSON.stringify(result)]);
  const getRun = async (runId) => (await pool.query(`SELECT * FROM os_runs WHERE id = $1`, [runId])).rows[0] || null;

  async function executeRun(runId, intent, project) {
    const emit = makeEmitter(runId);
    let timer;
    try {
      const work = (async () => {
        const understood = await Master.understand({ intent, project });
        await pool.query(`UPDATE os_runs SET plan = $2::jsonb, updated_at = now() WHERE id = $1`,
          [runId, JSON.stringify({ ...understood.plan, warnings: understood.warnings, planner: understood.planner })]);
        await emit('plan_ready', {
          steps: understood.plan.steps.length,
          confidence: understood.plan.confidence,
          planner: understood.planner.fallback ? 'respaldo' : understood.planner.model,
        });
        if (understood.plan.needs_clarification) {
          await finish(runId, 'needs_input', { question: understood.plan.clarifying_question });
          return;
        }
        await setStatus(runId, 'running');
        const result = await Loop.runPlan({
          runId, intent, plan: understood.plan, context: understood.context,
          projectId: project ? project.id : null, emit,
        });
        await finish(runId, result.status, result);
        await emit('done', { status: result.status, elapsed_s: result.elapsed_s });
      })();
      const deadline = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('el run superó el límite de 8 minutos')), RUN_DEADLINE_MS); });
      await Promise.race([work, deadline]);
    } catch (e) {
      const msg = String(e.message || e).slice(0, 1000);
      console.error('[OS] run', runId, 'falló:', msg);
      await pool.query(`UPDATE os_runs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [runId, msg]).catch(() => {});
      await emit('failed', { error: msg.slice(0, 300) });
    } finally {
      clearTimeout(timer);
      active = Math.max(0, active - 1);
    }
  }

  async function resolveProject(ref, res) {
    if (!ref) return { project: null };
    const project = await Master.loadProject(String(ref));
    if (!project) { res.status(404).json({ ok: false, error: 'proyecto no encontrado: ' + ref }); return { stop: true }; }
    return { project };
  }

  // ═════════ ENDPOINTS ═════════

  // Estado general: qué proveedores y herramientas están vivos
  router.get('/status', wrap(async (req, res) => {
    const chains = {};
    for (const route of Object.keys(Registry.CHAINS)) {
      chains[route] = Registry.chainFor(route).map((c) => ({ ...c, disponible: Models.providerAvailable(c.provider) }));
    }
    let counts = null;
    try {
      const r = await pool.query(`SELECT status, COUNT(*)::int AS n FROM os_runs GROUP BY status`);
      const p = await pool.query(`SELECT COUNT(*)::int AS n FROM os_projects`);
      counts = { projects: p.rows[0].n, runs: Object.fromEntries(r.rows.map((x) => [x.status, x.n])) };
    } catch (e) { counts = { error: 'tablas os_* no existen todavía (¿corrió ensureSchema?)' }; }
    res.json({ ok: true, version: '2.0', active_runs: active, providers: Models.status(), tools: Registry.toolsStatus(), chains, counts, planned: Registry.PLANNED_TOOLS });
  }));

  router.get('/registry', (req, res) => res.json({ ok: true, registry: Registry.fullSnapshot() }));

  // Crea los 4 proyectos iniciales (idempotente)
  router.post('/seed', wrap(async (req, res) => {
    const created = [];
    for (const p of SEED_PROJECTS) {
      const r = await pool.query(
        `INSERT INTO os_projects (name, slug, description, instructions, default_agent)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slug) DO NOTHING RETURNING slug`,
        [p.name, p.slug, p.description, p.instructions, p.default_agent]
      );
      if (r.rowCount) created.push(p.slug);
    }
    res.json({ ok: true, created, already_existed: SEED_PROJECTS.length - created.length });
  }));

  router.post('/projects', wrap(async (req, res) => {
    const name = String(req.body && req.body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ ok: false, error: 'name requerido' });
    const agent = req.body.default_agent ? String(req.body.default_agent).toLowerCase() : null;
    if (agent && !Registry.getAgent(agent)) return res.status(400).json({ ok: false, error: 'default_agent no existe en el registry' });
    let slug = slugify(req.body.slug || name);
    const exists = await pool.query(`SELECT 1 FROM os_projects WHERE slug = $1`, [slug]);
    if (exists.rowCount) slug = slug + '-' + crypto.randomBytes(2).toString('hex');
    const r = await pool.query(
      `INSERT INTO os_projects (name, slug, description, instructions, default_agent) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, slug, String(req.body.description || '').slice(0, 500), String(req.body.instructions || '').slice(0, 2000), agent]
    );
    res.json({ ok: true, project: r.rows[0] });
  }));

  router.get('/projects', wrap(async (req, res) => {
    const r = await pool.query(
      `SELECT p.*, (SELECT COUNT(*)::int FROM os_runs r WHERE r.project_id = p.id) AS runs
       FROM os_projects p ORDER BY p.created_at ASC`
    );
    res.json({ ok: true, projects: r.rows });
  }));

  // Editar un proyecto (nombre, descripción, instrucciones permanentes)
  router.patch('/projects/:ref', wrap(async (req, res) => {
    const { project, stop } = await resolveProject(req.params.ref, res);
    if (stop) return;
    const b = req.body || {};
    const name = b.name !== undefined ? String(b.name).trim().slice(0, 80) : project.name;
    if (!name) return res.status(400).json({ ok: false, error: 'name no puede quedar vacío' });
    const description = b.description !== undefined ? String(b.description).slice(0, 500) : (project.description || '');
    const instructions = b.instructions !== undefined ? String(b.instructions).slice(0, 2000) : (project.instructions || '');
    const r = await pool.query(
      `UPDATE os_projects SET name = $2, description = $3, instructions = $4, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [project.id, name, description, instructions]
    );
    res.json({ ok: true, project: r.rows[0] });
  }));

  // Eliminar un proyecto (sus runs quedan guardados, sin proyecto)
  router.delete('/projects/:ref', wrap(async (req, res) => {
    const { project, stop } = await resolveProject(req.params.ref, res);
    if (stop) return;
    await pool.query(`DELETE FROM os_projects WHERE id = $1`, [project.id]);
    res.json({ ok: true, deleted: project.slug });
  }));

  // Solo planifica (no ejecuta nada): sirve para ver qué haría el OS antes de gastar tokens
  router.post('/plan', wrap(async (req, res) => {
    const intent = String(req.body && req.body.intent || '').trim();
    if (!intent || intent.length > 4000) return res.status(400).json({ ok: false, error: 'intent requerido (máx 4000 caracteres)' });
    const { project, stop } = await resolveProject(req.body.project || req.body.project_id, res);
    if (stop) return;
    const u = await Master.understand({ intent, project });
    res.json({ ok: true, plan: u.plan, warnings: u.warnings, planner: u.planner,
      context_used: { personal: u.context.personal.length, project_memory: u.context.project_memory.length } });
  }));

  // EL PRINCIPAL: intención → plan → ejecución → verificación → memoria
  router.post('/intent', wrap(async (req, res) => {
    const intent = String(req.body && req.body.intent || '').trim();
    if (!intent || intent.length > 4000) return res.status(400).json({ ok: false, error: 'intent requerido (máx 4000 caracteres)' });
    if (active >= MAX_ACTIVE_RUNS) return res.status(429).json({ ok: false, error: 'hay ' + active + ' runs activos; espera a que termine uno' });
    active++; // el cupo se reserva EN EL MISMO INSTANTE en que se revisa (si no, pedidos simultáneos se cuelan)
    let started = false;
    try {
      const { project, stop } = await resolveProject(req.body.project || req.body.project_id, res);
      if (stop) return;

      const ins = await pool.query(
        `INSERT INTO os_runs (project_id, intent, status) VALUES ($1, $2, 'planning') RETURNING id`,
        [project ? project.id : null, intent]
      );
      const runId = ins.rows[0].id;
      started = true; // desde aquí executeRun libera el cupo cuando termine

      if (req.body.sync === true) {
        await executeRun(runId, intent, project);
        return res.json({ ok: true, run: await getRun(runId) });
      }
      executeRun(runId, intent, project); // segundo plano
      return res.status(202).json({ ok: true, run_id: runId, status: 'planning', poll: '/v1/os-brain/run/' + runId });
    } finally {
      if (!started) active = Math.max(0, active - 1);
    }
  }));

  router.get('/run/:id', wrap(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ ok: false, error: 'id inválido' });
    const run = await getRun(req.params.id);
    if (!run) return res.status(404).json({ ok: false, error: 'run no encontrado' });
    res.json({ ok: true, run });
  }));

  router.get('/runs', wrap(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    let projectId = null;
    if (req.query.project) {
      const { project, stop } = await resolveProject(req.query.project, res);
      if (stop) return;
      projectId = project.id;
    }
    const r = await pool.query(
      `SELECT id, project_id, intent, status, created_at, updated_at FROM os_runs
       WHERE ($1::uuid IS NULL OR project_id = $1::uuid) ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    res.json({ ok: true, runs: r.rows });
  }));

  router.get('/projects/:ref/memory', wrap(async (req, res) => {
    const { project, stop } = await resolveProject(req.params.ref, res);
    if (stop) return;
    const rows = await Memory.recent({ projectId: project.id, limit: Math.min(parseInt(req.query.limit, 10) || 30, 100) });
    res.json({ ok: true, project: project.slug, memories: rows.map((m) => ({ id: m.id, type: m.type, content: m.content, created_at: m.created_at })) });
  }));

  router.post('/projects/:ref/memory', wrap(async (req, res) => {
    const { project, stop } = await resolveProject(req.params.ref, res);
    if (stop) return;
    const allowed = ['note', 'journal', 'decision', 'idea', 'insight'];
    const type = allowed.includes(req.body && req.body.type) ? req.body.type : 'note';
    const id = await Memory.save({ content: req.body && req.body.content, type, projectId: project.id, agent: 'operador' });
    if (!id) return res.status(400).json({ ok: false, error: 'content requerido' });
    res.json({ ok: true, id, project: project.slug, type });
  }));

  return router;
};
