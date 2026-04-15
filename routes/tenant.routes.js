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
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
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
// ══════════════════════════════════════════════════════════════════════
router.get('/leads/:id/messages', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;

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
// ══════════════════════════════════════════════════════════════════════
router.post('/leads/:id/send', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const message = String(req.body?.message || '').trim();

    if (!message) {
      return res.status(400).json({ ok: false, error: 'missing_message' });
    }

    const leadResult = await pool.query(`
      SELECT wl.id, wl.phone, NULL as twilio_sid, wc.access_token, wc.phone_number
      FROM wa_leads wl
      LEFT JOIN wa_connections wc ON wc.user_id = wl.user_id
      WHERE wl.id = $1 AND wl.user_id = $2
      LIMIT 1
    `, [id, req.user.id]);

    if (!leadResult.rows[0]) {
      return res.status(404).json({ ok: false, error: 'lead_not_found' });
    }

    const lead = leadResult.rows[0];
    const twilio = require('twilio');
    const accountSid = lead.twilio_sid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = lead.access_token || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = lead.phone_number || process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(400).json({ ok: false, error: 'whatsapp_not_configured' });
    }

    const client = twilio(accountSid, authToken);
    const clean = lead.phone.replace(/\D/g, '');

    await client.messages.create({
     from: `whatsapp:+12603006906`,
      to: `whatsapp:+${clean}`,
      body: message.slice(0, 4000),
    });

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
// ══════════════════════════════════════════════════════════════════════
router.post('/wa-config', auth, async (req, res) => {
  try {
    const pool = getPool();
    console.log("USER DEBUG:", req.user);
    const userId = req.user.sub || req.user.id;

    const { access_token, phone_number, business_name, twilio_sid, twilio_token } = req.body;

    // Soporte para ambos formatos (WA directo o Twilio)
    const finalSid = twilio_sid || null;
    const finalToken = twilio_token || access_token;

    if (!finalToken || !phone_number) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    await pool.query(`
      INSERT INTO wa_connections (user_id, access_token, phone_number, business_name, twilio_sid, status, connected_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'connected', now(), now())
      ON CONFLICT (user_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        phone_number = EXCLUDED.phone_number,
        business_name = EXCLUDED.business_name,
        twilio_sid = EXCLUDED.twilio_sid,
        status = 'connected',
        connected_at = now(),
        updated_at = now()
    `, [userId, finalToken, phone_number, business_name, finalSid]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('WA_CONFIG_ERROR', err);
    return res.status(500).json({ ok: false, error: err.message, full: err });
  }
});

// ══════════════════════════════════════════════════════════════════════
// PUT /v1/tenant/leads/:id/status
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
// ══════════════════════════════════════════════════════════════════════
router.post('/webhook/:userId', async (req, res) => {
  try {
    const pool = getPool();
    const { userId } = req.params;
    const { From, Body, To } = req.body;

    if (!From || !Body) return res.sendStatus(200);

    const phone = From.replace('whatsapp:', '').replace(/\D/g, '');
    const cleanPhone = `+${phone}`;

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

// ══════════════════════════════════════════════════════════════════════
// POST /v1/tenant/registro  — Crear nuevo cliente (público, sin auth)
// ══════════════════════════════════════════════════════════════════════
router.post('/registro', async (req, res) => {
  try {
    const pool = getPool();
    const {
      nombre, empresa, telefono, email, password,
      industria, empleados, descripcion, firma, plan
    } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (email, password_hash, nombre, empresa, telefono, industria, empleados, descripcion, firma, plan, acceso_habilitado, pago_confirmado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, false)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email
    `, [email, hash, nombre, empresa, telefono, industria, empleados, descripcion, firma, plan || 'starter']);

    if (!result.rows[0]) {
      return res.status(409).json({ ok: false, error: 'email_already_exists' });
    }

    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error('REGISTRO_ERROR', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// GET /v1/tenant/registro  — Listar clientes registrados (solo admin)
// ══════════════════════════════════════════════════════════════════════
router.get('/registro', auth, async (req, res) => {
  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        id,
        nombre,
        empresa,
        email,
        telefono,
        industria,
        empleados,
        descripcion,
        firma,
        plan,
        acceso_habilitado,
        pago_confirmado,
        created_at AS fecha_registro,
        NULL AS monto_pagado,
        true AS acepta_terminos,
        true AS acepta_privacidad
      FROM users
      WHERE email NOT IN ('josuanbayon@gmail.com', 'urusgovx@gmail.com')
      ORDER BY created_at DESC
    `);

    res.json({
      ok: true,
      registros: result.rows,
      total: result.rows.length
    });
  } catch (err) {
    console.error('GET_REGISTRO_ERROR', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// PATCH /v1/tenant/registro/:id/pago  — Confirmar pago manualmente
// ══════════════════════════════════════════════════════════════════════
router.patch('/registro/:id/pago', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    await pool.query(`
      UPDATE users SET pago_confirmado = true, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH_PAGO_ERROR', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// PATCH /v1/tenant/registro/:id/acceso  — Habilitar/revocar acceso
// ══════════════════════════════════════════════════════════════════════
router.patch('/registro/:id/acceso', auth, async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { acceso_habilitado } = req.body;

    await pool.query(`
      UPDATE users SET acceso_habilitado = $2, updated_at = NOW()
      WHERE id = $1
    `, [id, !!acceso_habilitado]);

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH_ACCESO_ERROR', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
