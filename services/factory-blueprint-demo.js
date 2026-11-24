const { randomUUID } = require('node:crypto');

function mountBlueprintDemo(app, { pool, studioAuth, generateFactoryText }) {
  async function prepareStorage() {
    await pool.query(`CREATE TABLE IF NOT EXISTS factory_blueprint_demos (
      id uuid PRIMARY KEY,
      example text NOT NULL,
      decision jsonb
    )`);
  }

  app.post('/v1/studio/demos/human-blueprint', studioAuth, async (req, res) => {
    try {
      const example = await generateFactoryText(
        'En español, escribe en dos frases un caso totalmente ficticio: una persona lleva semanas aplazando una decisión profesional porque sigue recopilando información. Incluye una hipótesis comprobable. Sin nombres, diagnósticos ni Markdown.',
        240
      );
      await prepareStorage();
      const id = randomUUID();
      await pool.query('INSERT INTO factory_blueprint_demos (id, example) VALUES ($1, $2)', [id, example]);
      res.status(201).json({ ok: true, path: '/studio/blueprint-demo.html#' + id });
    } catch (error) {
      console.error('[Factory Blueprint Demo]', error.status || error.code || error.name);
      res.status(500).json({ ok: false, error: 'No se pudo crear la demo. Verifica DeepSeek y Postgres de prueba.' });
    }
  });

  const route = '/v1/studio/demos/human-blueprint/:id';
  const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  app.get(route, async (req, res) => {
    if (!validId(req.params.id)) return res.sendStatus(404);
    res.set('Cache-Control', 'no-store');
    try {
      const result = await pool.query('SELECT example, decision FROM factory_blueprint_demos WHERE id = $1', [req.params.id]);
      if (!result.rows.length) return res.sendStatus(404);
      res.json(result.rows[0]);
    } catch {
      res.sendStatus(503);
    }
  });

  app.put(route, async (req, res) => {
    if (!validId(req.params.id)) return res.sendStatus(404);
    const fields = ['decision', 'hypothesis', 'action', 'outcome'];
    if (!fields.every(field => typeof req.body?.[field] === 'string' && req.body[field].length <= 2500) ||
        !req.body.decision.trim() || !req.body.action.trim()) {
      return res.status(400).json({ error: 'Escribe una decisión y una acción. Máximo 2500 caracteres por campo.' });
    }
    const decision = Object.fromEntries(fields.map(field => [field, req.body[field].trim()]));
    try {
      const result = await pool.query('UPDATE factory_blueprint_demos SET decision = $1 WHERE id = $2', [JSON.stringify(decision), req.params.id]);
      if (!result.rowCount) return res.sendStatus(404);
      res.json({ ok: true });
    } catch {
      res.sendStatus(503);
    }
  });
}

module.exports = { mountBlueprintDemo };
