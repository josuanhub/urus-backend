const messageHistory = [];
const auditLog = [];

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

async function state(req, res) {
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
      history_count: messageHistory.length,
      audit_count: auditLog.length
    }
  });
}

async function agents(req, res) {
  return res.json({
    ok: true,
    items: getAllAgents()
  });
}

function reviewByURUS(message) {
  const text = String(message || "").toLowerCase();

  if (!text.trim()) {
    return {
      status: "blocked",
      reason: "empty_message"
    };
  }

  if (
    text.includes("matar") ||
    text.includes("violencia") ||
    text.includes("amenaza")
  ) {
    return {
      status: "blocked",
      reason: "high_risk_language"
    };
  }

  return {
    status: "approved",
    reason: null
  };
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
    return "Soy ORION. Detecto que esta solicitud requiere revisión más cuidadosa. Ya estamos registrando auditoría básica.";
  }

  return `Soy ORION. Recibí tu mensaje: "${text}". Bloque 3 está activo con memoria, auditoría y gobernanza básica.`;
}

async function message(req, res) {
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

  const inputRecord = {
    id: messageHistory.length + 1,
    type: "human_to_agent",
    to: "ORION",
    message: cleanMessage,
    urus_status: governance.status,
    created_at: new Date().toISOString()
  };

  messageHistory.unshift(inputRecord);

  if (governance.status === "blocked") {
    auditLog.unshift({
      id: auditLog.length + 1,
      event: "message_blocked",
      actor: "URUS_OS",
      target: "ORION",
      reason: governance.reason,
      message: cleanMessage,
      created_at: new Date().toISOString()
    });

    return res.status(400).json({
      ok: false,
      governance: governance,
      error: "Mensaje bloqueado por URUS_OS"
    });
  }

  const reply = buildOrionReply(cleanMessage);

  const outputRecord = {
    id: messageHistory.length + 1,
    type: "agent_to_human",
    from: "ORION",
    reply,
    urus_status: "approved",
    created_at: new Date().toISOString()
  };

  messageHistory.unshift(outputRecord);

  auditLog.unshift({
    id: auditLog.length + 1,
    event: "message_approved",
    actor: "URUS_OS",
    target: "ORION",
    reason: null,
    message: cleanMessage,
    created_at: new Date().toISOString()
  });

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
}

async function history(req, res) {
  return res.json({
    ok: true,
    count: messageHistory.length,
    items: messageHistory
  });
}

async function audit(req, res) {
  return res.json({
    ok: true,
    count: auditLog.length,
    items: auditLog
  });
}

module.exports = {
  health,
  agents,
  state,
  message,
  history,
  audit
};
