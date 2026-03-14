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
      ]
    }
  });
}

async function agents(req, res) {
  return res.json({
    ok: true,
    items: getAllAgents()
  });
}

function buildOrionReply(message) {
  const text = String(message || "").trim();

  if (!text) {
    return "Soy ORION. Recibí tu mensaje, pero está vacío. Envíame una instrucción o una pregunta.";
  }

  const lower = text.toLowerCase();

  if (lower.includes("estado del ecosistema")) {
    return "Soy ORION. El ecosistema está online, con 10 agentes activos y gobernanza URUS_OS operando.";
  }

  if (lower.includes("organiza") || lower.includes("orden")) {
    return "Soy ORION. Puedo organizar esto contigo. Siguiente paso: separar objetivo, prioridades y acciones.";
  }

  if (lower.includes("riesgo") || lower.includes("peligro")) {
    return "Soy ORION. Detecto que esta solicitud requiere revisión más cuidadosa. Luego conectaremos esto con gobernanza y auditoría.";
  }

  return `Soy ORION. Recibí tu mensaje: "${text}". Bloque 2 está activo y ya puedo responderte desde Moltbook.`;
}

async function message(req, res) {
  const { to = "ORION", message = "" } = req.body || {};

  if (String(to).toUpperCase() !== "ORION") {
    return res.status(400).json({
      ok: false,
      error: "Por ahora Bloque 2 solo acepta mensajes dirigidos a ORION."
    });
  }

  return res.json({
    ok: true,
    input: {
      to: "ORION",
      message: String(message || "")
    },
    output: {
      from: "ORION",
      reply: buildOrionReply(message)
    }
  });
}

module.exports = {
  health,
  agents,
  state,
  message
};
