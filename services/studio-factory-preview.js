const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const root = '/v1/studio/factory/builds';

function parsePreviewSpec(raw) {
  const spec = JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, ''));
  const name = typeof spec?.system_name === 'string' && spec.system_name.trim();
  const screens = spec?.screens;
  if (!name || name.length > 100 || !Array.isArray(screens) || screens.length < 1 ||
      screens.length > 4 || screens.some(screen => typeof screen !== 'string' || !screen.trim() || screen.length > 100)) {
    throw Error('Especificación de vista previa inválida.');
  }
  return { name, screens: [...new Set(screens.map(screen => screen.trim()))] };
}

function mountStudioFactoryPreview(app, { auth, pool, planScreens, buildPreview }) {
  let setup;
  function ensureStorage() {
    setup ??= pool.query(`CREATE TABLE IF NOT EXISTS studio_factory_builds (
      id uuid PRIMARY KEY, status text NOT NULL, html text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`).catch(error => { setup = null; throw error; });
    return setup;
  }

  function handle(fn) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try { return await fn(req, res); }
      catch (error) {
        console.error('[Studio Factory]', error.code || error.name);
        return res.status(503).json({ error: 'No se pudo consultar Factory.' });
      }
    };
  }

  async function run(id, instruction, plan) {
    let stage = 'planning';
    try {
      const { name, screens } = parsePreviewSpec(await planScreens(instruction, plan));
      stage = 'building';
      await pool.query("UPDATE studio_factory_builds SET status = 'building', updated_at = now() WHERE id = $1", [id]);
      const html = await buildPreview({ id, name, screens, instruction, plan });
      await pool.query(
        "UPDATE studio_factory_builds SET status = 'ready', html = $2, updated_at = now() WHERE id = $1", [id, html]
      );
    } catch (error) {
      console.error('[Studio Factory build]', id, stage, error.code || error.name);
      await pool.query(
        "UPDATE studio_factory_builds SET status = $2, updated_at = now() WHERE id = $1",
        [id, stage === 'planning' ? 'plan_failed' : 'build_failed']
      ).catch(failure => console.error('[Studio Factory status]', failure.code || failure.name));
    }
  }

  app.post(root, auth, handle(async (req, res) => {
    const { id, instruction, plan } = req.body || {};
    if (typeof id !== 'string' || !uuid.test(id) || ![instruction, plan].every(value =>
      typeof value === 'string' && value.trim() && value.length <= 12000)) {
      return res.status(400).json({ error: 'Prepara y aprueba un plan válido antes de construir.' });
    }
    await ensureStorage();
    const inserted = await pool.query(
      "INSERT INTO studio_factory_builds (id, status) VALUES ($1, 'planning') ON CONFLICT DO NOTHING", [id]
    );
    if (inserted.rowCount) setImmediate(() => run(id, instruction, plan));
    res.status(202).json({ id });
  }));

  app.get(root + '/:id', auth, handle(async (req, res) => {
    const { id } = req.params;
    if (!uuid.test(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    await ensureStorage();
    const result = await pool.query(
      `SELECT CASE WHEN status IN ('planning', 'building') AND updated_at < now() - interval '30 minutes'
        THEN 'timed_out' ELSE status END AS status FROM studio_factory_builds WHERE id = $1`, [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No se encontró la construcción.' });
    res.json(result.rows[0]);
  }));

  app.get(root + '/:id/preview', auth, handle(async (req, res) => {
    const { id } = req.params;
    if (!uuid.test(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    await ensureStorage();
    const result = await pool.query("SELECT html FROM studio_factory_builds WHERE id = $1 AND status = 'ready'", [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'La vista previa aún no está disponible.' });
    res.json({ html: result.rows[0].html });
  }));
}

module.exports = { mountStudioFactoryPreview };
