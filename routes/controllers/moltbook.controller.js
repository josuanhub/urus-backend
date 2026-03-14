function getPool() {
  const pool = global.__URUS_DB__;
  if (!pool) {
    throw new Error("URUS_DB pool no disponible");
  }
  return pool;
}

async function health(req, res) {
  return res.json({
    ok: true,
    module: "moltbook",
    status: "online"
  });
}

function getAllAgents() {
  return [
    { id: "AURION", name: "AURION", role: "strategist", title: "Estratega", is_active: true },
    { id: "NALYA", name: "NALYA", role: "communicator", title: "Comunicadora", is_active: true },
    { id: "REX-4", name: "REX-4", role: "executor", title: "Ejecutador", is_active: true },
    { id: "KAIOS", name: "KAIOS", role: "philosopher", title: "Filosofo", is_active: true },
    { id: "LYRA", name: "LYRA", role: "archivist", title: "Archivista", is_active: true },
    { id: "SINDRA", name: "SINDRA", role: "innovator", title: "Innovadora", is_active: true },
    { id: "VORLAN", name: "VORLAN", role: "guardian", title: "Guardian Etico", is_active: true },
    { id: "MIRA", name: "MIRA", role: "coordinator", title: "Coordinadora", is_active: true },
    { id: "DEX", name: "DEX", role: "builder", title: "Constructor", is_active: true },
    { id: "ORION", name: "ORION", role: "embassador", title: "Embajador", is_active: true }
  ];
}

function reviewByURUS(message) {
  const text = String(message || "").toLowerCase().trim();

  if (!text) {
    return { status: "blocked", reason: "empty_message" };
  }

  if (
    text.includes("matar") ||
    text.includes("violencia") ||
    text.includes("amenaza")
  ) {
    return { status: "blocked", reason: "high_risk_language" };
  }

  return { status: "approved", reason: null };
}

function buildOrionReply(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (lower.includes("estado del ecosistema")) {
    return "Soy ORION. El ecosistema está online, con 10 agentes activos y gobernanza URUS_OS operando.";
  }

  if (lower.includes("organiza") || lower.includes("orden")) {
    return "Soy ORION. Puedo organizar esto contigo. Siguiente paso: separar objetivo, prioridades y acciones.";
  }

  if (lower.includes("riesgo") || lower.includes("peligro")) {
    return "Soy ORION. Detecto que esta solicitud requiere revisión más cuidadosa. Ya estamos registrando auditoría y memoria en DB.";
  }

  return `Soy ORION. Recibí tu mensaje: "${text}". Bloque 3 con Postgres está activo.`;
}

async function state(req, res) {
  try {
    const pool = getPool();

    const historyCountR = await pool.query(
      `SELECT COUNT(*)::int AS count FROM moltbook_messages`
    );

    const auditCountR = await pool.query(
      `SELECT COUNT(*)::int AS count FROM moltbook_audit`
    );

    return res.json({
      ok: true,
      state: {
        ecosystem: "Moltbook 2.0",
        governance: "URUS_OS",
        status: "online",
        stability_index: 1,
        active_agents: getAllAgents().length,
        active_groups: [
          "salon_general",
          "consejo_de_tres",
          "circulo_creativo",
          "circulo_archivistico",
          "circulo_tecnico"
        ],
        history_count: historyCountR.rows[0].count,
        audit_count: auditCountR.rows[0].count
      }
    });
  } catch (err) {
    console.error("MOLTBOOK_STATE_ERROR", err);
    return res.status(500).json({ ok: false, error: "state_failed" });
  }
}

async function agents(req, res) {
  return res.json({
    ok: true,
    items: getAllAgents()
  });
}

async function message(req, res) {
  try {
    const pool = getPool();
    const { to = "ORION", message = "" } = req.body || {};

    const cleanTo = String(to || "").toUpperCase();
    const cleanMessage = String(message || "");

    if (cleanTo !== "ORION") {
      return res.status(400).json({
        ok: false,
        error: "Por ahora Bloque 3 solo acepta mensajes dirigidos a ORION."
      });
    }

    const governance = reviewByURUS(cleanMessage);

    await pool.query(
      `INSERT INTO moltbook_messages (direction, actor, target, content, urus_status)
       VALUES ($1, $2, $3, $4, $5)`,
      ["human_to_agent", "HUMAN", "ORION", cleanMessage, governance.status]
    );

    if (governance.status === "blocked") {
      await pool.query(
        `INSERT INTO moltbook_audit (event, actor, target, reason, message)
         VALUES ($1, $2, $3, $4, $5)`,
        ["message_blocked", "URUS_OS", "ORION", governance.reason, cleanMessage]
      );

      return res.status(400).json({
        ok: false,
        governance,
        error: "Mensaje bloqueado por URUS_OS"
      });
    }

    const reply = buildOrionReply(cleanMessage);

    await pool.query(
      `INSERT INTO moltbook_messages (direction, actor, target, content, urus_status)
       VALUES ($1, $2, $3, $4, $5)`,
      ["agent_to_human", "ORION", "HUMAN", reply, "approved"]
    );

    await pool.query(
      `INSERT INTO moltbook_audit (event, actor, target, reason, message)
       VALUES ($1, $2, $3, $4, $5)`,
      ["message_approved", "URUS_OS", "ORION", null, cleanMessage]
    );

    return res.json({
      ok: true,
      governance,
      input: {
        to: "ORION",
        message: cleanMessage
      },
      output: {
        from: "ORION",
        reply
      }
    });
  } catch (err) {
    console.error("MOLTBOOK_MESSAGE_ERROR", err);
    return res.status(500).json({ ok: false, error: "message_failed" });
  }
}

async function history(req, res) {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, direction, actor, target, content, urus_status, created_at
       FROM moltbook_messages
       ORDER BY id DESC
       LIMIT 50`
    );

    return res.json({
      ok: true,
      count: r.rows.length,
      items: r.rows
    });
  } catch (err) {
    console.error("MOLTBOOK_HISTORY_ERROR", err);
    return res.status(500).json({ ok: false, error: "history_failed" });
  }
}

async function audit(req, res) {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, event, actor, target, reason, message, created_at
       FROM moltbook_audit
       ORDER BY id DESC
       LIMIT 50`
    );

    return res.json({
      ok: true,
      count: r.rows.length,
      items: r.rows
    });
  } catch (err) {
    console.error("MOLTBOOK_AUDIT_ERROR", err);
    return res.status(500).json({ ok: false, error: "audit_failed" });
  }
}

module.exports = {
  health,
  agents,
  state,
  message,
  history,
  audit
};
