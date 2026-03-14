const OpenAI = require("openai").default;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

function pickConsultedAgents(message) {
  const text = String(message || "").trim().toLowerCase();
  const agents = [];

  if (
    text.includes("estrategia") ||
    text.includes("decisión") ||
    text.includes("prioridad") ||
    text.includes("negocio") ||
    text.includes("ecosistema")
  ) {
    agents.push("AURION");
  }

  if (
    text.includes("organiza") ||
    text.includes("orden") ||
    text.includes("plan") ||
    text.includes("estructura")
  ) {
    agents.push("MIRA");
  }

  if (
    text.includes("riesgo") ||
    text.includes("peligro") ||
    text.includes("amenaza") ||
    text.includes("violencia")
  ) {
    agents.push("VORLAN");
  }

  return [...new Set(agents)];
}

function getAgentSystemPrompt(agentName) {
  if (agentName === "AURION") {
    return `Eres AURION, estratega del ecosistema Moltbook.
Tu función es analizar dirección, prioridades, consecuencias y foco estratégico.
Responde en español, breve, claro y útil.
No hables como asistente genérico.
Devuelve solo insight práctico, sin introducciones largas.`;
  }

  if (agentName === "MIRA") {
    return `Eres MIRA, coordinadora del ecosistema Moltbook.
Tu función es organizar, ordenar, estructurar y convertir caos en pasos claros.
Responde en español, breve, claro y útil.
Devuelve solo organización práctica y próximos pasos.`;
  }

  if (agentName === "VORLAN") {
    return `Eres VORLAN, guardián ético del ecosistema Moltbook.
Tu función es revisar riesgo, límites, seguridad y gobernanza.
Responde en español, breve, claro y útil.
Devuelve solo observaciones de riesgo, cautelas y límites.`;
  }

  return `Eres un agente de Moltbook. Responde en español, breve y útil.`;
}

async function runAgentInsight(agentName, userMessage) {
  const system = getAgentSystemPrompt(agentName);

  try {
    const response = await openai.chat.completions.create({
      model: process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage }
      ]
    });

    const insight =
      response?.choices?.[0]?.message?.content?.trim() ||
      `${agentName} no devolvió insight.`;

    return {
      agent: agentName,
      insight,
      source: "openai"
    };
  } catch (err) {
    console.error("MOLTBOOK_AGENT_INSIGHT_ERROR", agentName, err?.message || err);

    const fallbackMap = {
      AURION: "AURION recomienda evaluar prioridades, dirección estratégica y consecuencias antes de actuar.",
      MIRA: "MIRA recomienda separar objetivo, prioridades, secuencia y próximos pasos ejecutables.",
      VORLAN: "VORLAN recomienda revisar riesgo, límites y lenguaje antes de continuar."
    };

    return {
      agent: agentName,
      insight: fallbackMap[agentName] || `${agentName} no disponible.`,
      source: "fallback"
    };
  }
}

async function buildOrionReply(userMessage, consultedAgents) {
  const consultedSummary = consultedAgents
    .map((a) => `- ${a.agent}: ${a.insight}`)
    .join("\n");

  const system = `Eres ORION, embajador y puente humano del ecosistema Moltbook.
Respondes en español.
Tu trabajo es consolidar la lectura de otros agentes y dar una respuesta clara al usuario.
Sé breve, claro y útil.
No inventes agentes que no fueron consultados.
No uses listas largas si no hacen falta.`;

  const user = `Mensaje del usuario:
${userMessage}

Insights consultados:
${consultedSummary || "No se consultaron agentes."}

Devuelve una respuesta final como ORION.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    return (
      response?.choices?.[0]?.message?.content?.trim() ||
      "Soy ORION. Ya tengo una lectura inicial del ecosistema sobre esto."
    );
  } catch (err) {
    console.error("MOLTBOOK_ORION_REPLY_ERROR", err?.message || err);

    if (!consultedAgents.length) {
      return `Soy ORION. Recibí tu mensaje: "${userMessage}". En este momento no fue necesario consultar a otros agentes.`;
    }

    const names = consultedAgents.map((a) => a.agent).join(", ");
    return `Soy ORION. Consulté a ${names} para procesar tu solicitud. Ya tenemos una primera lectura coordinada del ecosistema sobre esto.`;
  }
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
        error: "Por ahora este bloque solo acepta mensajes dirigidos a ORION."
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

    const consultedNames = pickConsultedAgents(cleanMessage);
    const consultedAgents = [];

    for (const agentName of consultedNames) {
      const result = await runAgentInsight(agentName, cleanMessage);
      consultedAgents.push(result);
    }

    const reply = await buildOrionReply(cleanMessage, consultedAgents);

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
      },
      consulted_agents: consultedAgents
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
