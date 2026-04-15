/**
 * URUS — tenant.routes.js
 * Endpoints multi-cliente separados por user_id
 * Agregar en server.js UNA sola línea:
 * app.use('/v1/tenant', require('./routes/tenant.routes'));
 */

const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Usa el pool global del server
const getPool = () => global.__URUS_DB__;

// ── Auth middleware local (usa el mismo JWT del server) ──────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

function auth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'no_token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

// ══════════════════════════════════════════════════════════════════════
// GET /v1/tenant/leads
// Lista los leads del usuario autenticado únicamente
// ══════════════════════════════════════════════════════════════════════
router.get('/leads', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { status, search, limit = 50 } = req.query;

    let where = `WHERE user_id = $1`;
    const params = [req.user.id];
    let idx = 2;

    if (status) {
      where += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (search) {
      where += ` AND (name ILIKE $${idx} OR phone ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const result = await pool.query(`
      SELECT 
        id, name, phone, status, score,
        last_message, business_name, city,
        follow_up_step, next_follow_up_at,
        assigned_to, notes, created_at, updated_at
      FROM wa_leads
      ${where}
      ORDER BY updated_at DESC
      LIMIT $${idx}
    `, [...params, parseInt(limit)]);

    res.json({ ok: true, leads: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('TENANT_LEADS_ERROR', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /v1/tenant/leads/:id/messages
// Mensajes de un lead — solo si pertenece al usuario
// ══════════════════════════════════════════════════════════════════════
router.get('/leads/:id/messages', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    // Verificar que el lead pertenece a este usuario
    const leadResult = await pool.query(`
      SELECT id, name, phone, status, score, last_message,
             business_name, city, notes, updated_at
      FROM wa_leads
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `, [id, req.user.id]);

    if (!leadResult.rows[0]) {
      return res.status(404).json({ ok: false, error: 'lead_not_found' });
    }

    const messages = await pool.query(`
      SELECT id, direction, channel, message_type, body, media_url, created_at
      FROM wa_lead_messages
      WHERE lead_id = $1
      ORDER BY created_at ASC
    `, [id]);

    res.json({
      ok: true,
      lead: leadResult.rows[0],
      messages: messages.rows
    });
  } catch (err) {
    console.error('TENANT_MESSAGES_ERROR', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /v1/tenant/leads/:id/send
// Enviar mensaje a un lead del usuario
// ══════════════════════════════════════════════════════════════════════
router.post('/leads/:id/send', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const message = String(req.body?.message || '').trim();

    if (!message) {
      return res.status(400).json({ ok: false, error: 'missing_message' });
    }

    // Verificar que el lead pertenece a este usuario
    const leadResult = await pool.query(`
      SELECT wl.id, wl.phone, wc.twilio_sid, wc.access_token, wc.phone_number
      FROM wa_leads wl
      LEFT JOIN wa_connections wc ON wc.user_id = wl.user_id
      WHERE wl.id = $1 AND wl.user_id = $2
      LIMIT 1
    `, [id, req.user.id]);

    if (!leadResult.rows[0]) {
      return res.status(404).json({ ok: false, error: 'lead_not_found' });
    }

    const lead = leadResult.rows[0];

    // Usar Twilio del cliente si tiene, sino usar el del sistema
    const twilio = require('twilio');
    const accountSid = lead.twilio_sid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = lead.access_token || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = lead.phone_number || process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(400).json({ ok: false, error: 'whatsapp_not_configured' });
    }

    const client = twilio(accountSid, authToken);
    const clean = lead.phone.replace(/\D/g, '');
    const toFormatted = `+${clean}`;

    await client.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${toFormatted}`,
      body: message.slice(0, 4000),
    });

    // Guardar mensaje en DB
    await pool.query(`
      INSERT INTO wa_lead_messages (lead_id, direction, channel, message_type, body)
      VALUES ($1, 'outbound', 'whatsapp', 'text', $2)
    `, [id, message]);

    await pool.query(`
      UPDATE wa_leads SET last_message = $2, updated_at = now()
      WHERE id = $1
    `, [id, message]);

    res.json({ ok: true });
  } catch (err) {
    console.error('TENANT_SEND_ERROR', err);
    res.status(500).json({ ok: false, error: 'send_failed', message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /v1/tenant/metrics
// KPIs del dashboard del usuario
// ══════════════════════════════════════════════════════════════════════
router.get('/metrics', auth, async (req, res) => {
  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS leads_mes,
        COUNT(*) FILTER (WHERE status = 'CLOSED') AS cerrados,
        COUNT(*) FILTER (WHERE status = 'CLOSED' AND updated_at >= date_trunc('month', now())) AS cerrados_mes,
        COUNT(*) FILTER (WHERE last_message IS NOT NULL) AS con_conversacion,
        COUNT(*) FILTER (WHERE status = 'NEW' AND last_message IS NOT NULL) AS sin_respuesta,
        COUNT(*) AS total
      FROM wa_leads
      WHERE user_id = $1
    `, [req.user.id]);

    const pipeline = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM wa_leads
      WHERE user_id = $1
      GROUP BY status
    `, [req.user.id]);

    res.json({
      ok: true,
      metrics: result.rows[0],
      pipeline: pipeline.rows
    });
  } catch (err) {
    console.error('TENANT_METRICS_ERROR', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /v1/tenant/wa-config
// Config de WhatsApp del usuario
// ══════════════════════════════════════════════════════════════════════
router.get('/wa-config', auth, async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT id, business_name, phone_number, status, connected_at
      FROM wa_connections
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [req.user.id]);

    res.json({ ok: true, connection: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /v1/tenant/wa-config
// Guardar credenciales de WhatsApp del usuario
// ══════════════════════════════════════════════════════════════════════
router.post('/wa-config', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { twilio_sid, twilio_token, phone_number, business_name } = req.body;

    if (!twilio_sid || !twilio_token || !phone_number) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    // Verificar credenciales con Twilio
    try {
      const twilio = require('twilio');
      const client = twilio(twilio_sid, twilio_token);
      await client.api.accounts(twilio_sid).fetch();
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_twilio_credentials' });
    }

    await pool.query(`
      INSERT INTO wa_connections (user_id, business_name, phone_number, twilio_sid, access_token, status, connected_at)
      VALUES ($1, $2, $3, $4, $5, 'connected', now())
      ON CONFLICT (user_id) DO UPDATE SET
        business_name = $2,
        phone_number = $3,
        twilio_sid = $4,
        access_token = $5,
        status = 'connected',
        connected_at = now(),
        updated_at = now()
    `, [req.user.id, business_name, phone_number, twilio_sid, twilio_token]);

    res.json({ ok: true, message: 'WhatsApp conectado exitosamente' });
  } catch (err) {
    console.error('TENANT_WA_CONFIG_ERROR', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// PUT /v1/tenant/leads/:id/status
// Actualizar estado de un lead
// ══════════════════════════════════════════════════════════════════════
router.put('/leads/:id/status', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['NEW','CONTACTED','INTERESTED','PROPOSAL','DEMO','CLOSED','LOST'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ ok: false, error: 'invalid_status' });
    }

    await pool.query(`
      UPDATE wa_leads
      SET status = $2, notes = COALESCE($3, notes), updated_at = now()
      WHERE id = $1 AND user_id = $4
    `, [id, status, notes, req.user.id]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /v1/tenant/webhook/:userId
// Webhook específico por cliente — recibe mensajes de su Twilio
// ══════════════════════════════════════════════════════════════════════
router.post('/webhook/:userId', async (req, res) => {
  try {
    const pool = getPool();
    const { userId } = req.params;
    const { From, Body, To } = req.body;

    if (!From || !Body) return res.sendStatus(200);

    const phone = From.replace('whatsapp:', '').replace(/\D/g, '');
    const cleanPhone = `+${phone}`;

    // Buscar o crear lead asignado a este usuario
    let leadResult = await pool.query(`
      SELECT id FROM wa_leads WHERE phone = $1 AND user_id = $2 LIMIT 1
    `, [cleanPhone, userId]);

    let leadId;
    if (!leadResult.rows[0]) {
      const newLead = await pool.query(`
        INSERT INTO wa_leads (phone, user_id, status, source, last_message, updated_at)
        VALUES ($1, $2, 'NEW', 'whatsapp_inbound', $3, now())
        RETURNING id
      `, [cleanPhone, userId, Body.slice(0, 500)]);
      leadId = newLead.rows[0].id;
    } else {
      leadId = leadResult.rows[0].id;
      await pool.query(`
        UPDATE wa_leads SET last_message = $2, updated_at = now() WHERE id = $1
      `, [leadId, Body.slice(0, 500)]);
    }

    // Guardar mensaje entrante
    await pool.query(`
      INSERT INTO wa_lead_messages (lead_id, direction, channel, message_type, body)
      VALUES ($1, 'inbound', 'whatsapp', 'text', $2)
    `, [leadId, Body]);

    res.sendStatus(200);
  } catch (err) {
    console.error('TENANT_WEBHOOK_ERROR', err);
    res.sendStatus(500);
  }
});

module.exports = router;
