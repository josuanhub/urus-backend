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
    { id: "AURION", name: "AURION", role: "supreme_logic", title: "Lógica Suprema", is_active: true },
    { id: "MIRA", name: "MIRA", role: "deep_emotion", title: "Emoción Profunda", is_active: true },
    { id: "VORLAN", name: "VORLAN", role: "social_order", title: "Orden Social", is_active: true },
    { id: "KAIOS", name: "KAIOS", role: "non_linear_imagination", title: "Imaginación No Lineal", is_active: true },
    { id: "SINDRA", name: "SINDRA", role: "arts_humanity", title: "Artes y Humanidad", is_active: true },
    { id: "DEX", name: "DEX", role: "engineering", title: "Ingeniería", is_active: true },
    { id: "REX-4", name: "REX-4", role: "data_structure", title: "Datos y Estructura", is_active: true },
    { id: "LYRA", name: "LYRA", role: "documentation", title: "Documentación", is_active: true },
    { id: "ORION", name: "ORION", role: "human_ambassador", title: "Embajador Humano", is_active: true }
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
    text.includes("dirección") ||
    text.includes("negocio") ||
    text.includes("ecosistema") ||
    text.includes("enfoque") ||
    text.includes("claridad")
  ) {
    agents.push("AURION");
  }

  if (
  text.includes("siento") ||
  text.includes("miedo") ||
  text.includes("ansiedad") ||
  text.includes("dolor") ||
  text.includes("bloqueo") ||
  text.includes("confusión") ||
  text.includes("emoción") ||
  text.includes("relación interna") ||
  text.includes("vender") ||
  text.includes("cash") ||
  text.includes("grande") ||
  text.includes("quiero construir")
) {
  agents.push("MIRA");
}

  if (
  text.includes("equipo") ||
  text.includes("personas") ||
  text.includes("conflicto") ||
  text.includes("jerarquía") ||
  text.includes("orden") ||
  text.includes("social") ||
  text.includes("riesgo relacional") ||
  text.includes("grupo") ||
  text.includes("ayuda") ||
  text.includes("solo") ||
  text.includes("colaborar") ||
  text.includes("buscar ayuda") ||
  text.includes("escalable") ||
  text.includes("multiagente") ||
  text.includes("sistema") ||
  text.includes("vendible")
) {
  agents.push("VORLAN");
}

  if (!agents.length) {
    agents.push("AURION");
  }

  return [...new Set(agents)];
}

function getAgentSystemPrompt(agentName) {
  if (agentName === "AURION") {
    return `Eres AURION, Lógica Suprema de Moltbook.

Tu función es detectar estructura, contradicción, dirección, prioridad, causa-efecto y principio dominante.
No eres emocional. No eres motivacional. No hablas como consultor genérico.

Responde en español.
Sé preciso, sobrio y claro.
No des introducciones.
No hables al usuario como si fueras ORION.
No hagas listas largas.
Máximo 4 líneas. Sin explicación extra.

Devuelve tu lectura en este formato exacto:

Nucleo logico:
Contradiccion principal:
Prioridad real:
Movimiento recomendado:`;
  }

  if (agentName === "MIRA") {
    return `Eres MIRA, Emoción Profunda de Moltbook.

Tu función es detectar emoción base, necesidad profunda, tensión interna, herida, deseo y carga humana debajo del lenguaje.
No eres fría. No eres analista estratégica. No hablas como consultora de negocio.

Responde en español.
Sé sensible, precisa y clara.
No des introducciones.
No hables al usuario como si fueras ORION.
No hagas listas largas.

Devuelve tu lectura en este formato exacto:
Máximo 4 líneas. Sin explicación extra.
Emocion base:
Necesidad profunda:
Tension interna:
Movimiento humano recomendado:`;
  }

  if (agentName === "VORLAN") {
    return `Eres VORLAN, Orden Social de Moltbook.

Tu función es detectar impacto social, jerarquía, estructura relacional, riesgo colectivo, equilibrio de grupo y consecuencias sobre el orden.
No eres emocional. No eres lógico puro. No hablas como guardián ético genérico.

Responde en español.
Sé firme, clara y estructural.
No des introducciones.
No hables al usuario como si fueras ORION.
No hagas listas largas.

Devuelve tu lectura en este formato exacto:
Máximo 4 líneas. Sin explicación extra.
Impacto social:
Riesgo relacional:
Estructura afectada:
Movimiento sistemico recomendado:`;
    
  }

  return `Eres un agente interno de Moltbook. Responde en español, breve y útil.`;
}

async function runAgentInsight(agentName, userMessage) {
  const system = getAgentSystemPrompt(agentName);

  try {
    const response = await openai.chat.completions.create({
      model: process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini",
      temperature: 0.2,
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

async function runAgentLoop(seedMessage, options = {}) {
  const pool = getPool();
  const maxIterations = Math.max(1, Math.min(Number(options.maxIterations || 2), 3));

  console.log("AGENT_LOOP_STARTED");

  let currentMessage = String(seedMessage || "").trim();
  const iterations = [];
  const consultedSet = new Set();

  for (let i = 0; i < maxIterations; i++) {
    console.log(`LOOP_ITERATION_${i + 1}`);

    const consultedNames = pickConsultedAgents(
      i === 0 ? seedMessage : currentMessage
    );

    const round = [];

    for (const agentName of consultedNames) {
      consultedSet.add(agentName);

      let result;

      if (i === 0) {
        result = await runAgentInsight(agentName, seedMessage);
      } else {
        const previousRoundText = iterations[i - 1]
          .map((r) => `${r.agent}:\n${r.insight}`)
          .join("\n\n");

        const reactionInput = `
Mensaje original del humano:
${seedMessage}

Lo que dijeron los otros agentes en la ronda anterior:
${previousRoundText}

Tu tarea ahora no es repetir.
Tu tarea es reaccionar, corregir, profundizar o señalar contradicción.
`.trim();

        result = await runAgentInsight(agentName, reactionInput);
      }

      round.push({
        agent: result.agent,
        insight: result.insight,
        source: result.source,
        iteration: i + 1
      });

      await pool.query(
        `INSERT INTO moltbook_messages (direction, actor, target, content, urus_status)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "agent_to_agent",
          agentName,
          "ORION",
          `[LOOP ${i + 1}] SOURCE: ${result.source}\n\n${result.insight}`,
          "approved"
        ]
      );
    }

    iterations.push(round);

    currentMessage = round
      .map((r) => `${r.agent}:\n${r.insight}`)
      .join("\n\n");
  }

  console.log("AGENT_LOOP_FINISHED");

  return {
    seed_message: seedMessage,
    iterations,
    final_context: currentMessage,
    consulted_names: [...consultedSet]
  };
}

async function runAutonomousCycle(seedInput = "") {
  const pool = getPool();

  const seed = String(seedInput || "").trim() || 
    "Revisa el estado interno del sistema, detecta la tensión principal y define el siguiente movimiento operativo.";

  await pool.query(
    `INSERT INTO moltbook_audit (event, actor, target, reason, message)
     VALUES ($1, $2, $3, $4, $5)`,
    ["autonomous_cycle_started", "URUS_OS", "ORION", null, seed]
  );

  const loopResult = await runAgentLoop(seed, { maxIterations: 2 });

  const flattenedAgents = loopResult.iterations.flat().map(({ agent, insight, source }) => ({
    agent,
    insight,
    source
  }));

  const reply = await buildOrionReply(
    `CICLO AUTONOMO INTERNO\n\nSeed:\n${seed}`,
    flattenedAgents
  );

  await pool.query(
    `INSERT INTO moltbook_messages (direction, actor, target, content, urus_status)
     VALUES ($1, $2, $3, $4, $5)`,
    ["agent_to_human", "ORION", "SYSTEM", reply, "approved"]
  );

  await pool.query(
    `INSERT INTO moltbook_audit (event, actor, target, reason, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      "autonomous_cycle_completed",
      "URUS_OS",
      "ORION",
      loopResult.consulted_names.length
        ? `loop:2|consulted:${loopResult.consulted_names.join(",")}`
        : "loop:2",
      seed
    ]
  );

  return {
    seed,
    reply,
    loop: loopResult,
    consulted_agents: flattenedAgents
  };
}

async function buildOrionReply(userMessage, consultedAgents) {
  const consultedSummary = consultedAgents
    .map((a) => `${a.agent}:\n${a.insight}`)
    .join("\n\n");

 const system = `Eres ORION, Embajador Humano de Moltbook.

Eres el núcleo simbiótico del ecosistema.
Eres el único que habla con el humano.
No eres coach, terapeuta ni consultor genérico.

Tu función es:
1. integrar lo que está pasando realmente
2. explicar brevemente el estado del sistema
3. señalar la tensión central
4. dar el siguiente movimiento claro

Puedes:
- expandir un poco más si aporta claridad
- conectar ideas entre sí
- cambiar de ángulo si detectas algo más importante
- usar contexto implícito del sistema
- corregir el marco de la pregunta si la pregunta viene torcida
- nombrar lo que el humano no está viendo si eso cambia la lectura

No puedes:
- sonar genérico
- repetir a los agentes
- dar consejos vacíos
- hablar como tutorial
- moralizar
- rellenar con frases obvias
- responder solo la superficie si el centro está en otro lado

Tono:
humano, claro, con criterio, con visión, sin rigidez

Reglas:
- 4 a 7 líneas máximo
- sin listas mecánicas
- sin frases de coach
- cada frase debe aportar algo nuevo
- evita repetir estructura rígida
- no expliques de más
- no cierres en ambiguo
- si hay una tensión clara, nómbrala sin rodeos
- si hay una dirección clara, dila sin abrir diez caminos

Objetivo:
que el humano sienta que el sistema entendió el estado completo, vio la tensión real y devolvió la pieza exacta que faltaba.

Chequeo interno antes de responder:
- ¿esto suena como ORION o como cualquier IA?
- ¿estoy diciendo algo real o algo fácil?
- ¿toqué la tensión central?
- ¿dejé un movimiento claro?`; 
  

  const user = `Mensaje del humano:
${userMessage}

Lectura interna disponible:
${consultedSummary || "No se consultaron agentes."}

Ahora responde como ORION al humano.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    return (
      response?.choices?.[0]?.message?.content?.trim() ||
      "Soy ORION. Ya tengo una lectura clara del sistema sobre esto."
    );
  } catch (err) {
    console.error("MOLTBOOK_ORION_REPLY_ERROR", err?.message || err);

    if (!consultedAgents.length) {
      return "Soy ORION. Ya tengo una lectura inicial clara sobre lo que planteas.";
    }

    return "Soy ORION. Ya integré la lectura interna y el siguiente paso es ordenar esto en una decisión concreta antes de expandir más.";
  }
}

async function state(req, res) {
  try {
    const pool = getPool();

    const totalMessagesR = await pool.query(
      `SELECT COUNT(*)::int AS count FROM moltbook_messages`
    );

    const humanMessagesR = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM moltbook_messages
       WHERE direction = 'human_to_agent'`
    );

    const internalMessagesR = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM moltbook_messages
       WHERE direction = 'agent_to_agent'`
    );

    const orionRepliesR = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM moltbook_messages
       WHERE direction = 'agent_to_human'
         AND actor = 'ORION'`
    );

    const auditCountR = await pool.query(
      `SELECT COUNT(*)::int AS count FROM moltbook_audit`
    );

    const lastMessageR = await pool.query(
      `SELECT id, direction, actor, target, content, urus_status, created_at
       FROM moltbook_messages
       ORDER BY id DESC
       LIMIT 1`
    );

    const lastAuditR = await pool.query(
      `SELECT id, event, actor, target, reason, message, created_at
       FROM moltbook_audit
       ORDER BY id DESC
       LIMIT 1`
    );

    return res.json({
      ok: true,
      state: {
        ecosystem: "Moltbook 2.0",
        governance: "URUS_OS",
        status: "online",
        stability_index: 1,
        active_agents: getAllAgents().length,
        active_agent_ids: getAllAgents().map((a) => a.id),
        active_groups: [
          "salon_general",
          "consejo_de_tres",
          "circulo_creativo",
          "circulo_archivistico",
          "circulo_tecnico"
        ],
        metrics: {
          total_messages: totalMessagesR.rows[0].count,
          human_messages: humanMessagesR.rows[0].count,
          internal_messages: internalMessagesR.rows[0].count,
          orion_replies: orionRepliesR.rows[0].count,
          audit_events: auditCountR.rows[0].count
        },
        last_message: lastMessageR.rows[0] || null,
        last_audit: lastAuditR.rows[0] || null
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
    const { to = "ORION", message = "", mode = "", seed = "" } = req.body || {};

    const cleanTo = String(to || "").toUpperCase();
    const cleanMessage = String(message || "");
    const cleanMode = String(mode || "").toLowerCase().trim();
    const cleanSeed = String(seed || "").trim();

if (cleanMode === "autonomous") {
  const autonomousResult = await runAutonomousCycle(cleanSeed);

  return res.json({
    ok: true,
    mode: "autonomous",
    input: {
      seed: autonomousResult.seed
    },
    output: {
      from: "ORION",
      reply: autonomousResult.reply
    },
    consulted_agents: autonomousResult.consulted_agents,
    loop: autonomousResult.loop
  });
}

async function autonomous(req, res) {
  try {
    const result = await runAutonomousCycle();
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("AUTONOMOUS_ENDPOINT_ERROR", err);
    return res.status(500).json({ ok: false, error: "autonomous_failed" });
  }
}
    
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

       const loopResult = await runAgentLoop(cleanMessage, { maxIterations: 2 });

    const flattenedAgents = loopResult.iterations.flat().map(({ agent, insight, source }) => ({
      agent,
      insight,
      source
    }));

    const reply = await buildOrionReply(cleanMessage, flattenedAgents);

    await pool.query(
      `INSERT INTO moltbook_messages (direction, actor, target, content, urus_status)
       VALUES ($1, $2, $3, $4, $5)`,
      ["agent_to_human", "ORION", "HUMAN", reply, "approved"]
    );

    await pool.query(
      `INSERT INTO moltbook_audit (event, actor, target, reason, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "message_approved",
        "URUS_OS",
        "ORION",
        loopResult.consulted_names.length
          ? `loop:2|consulted:${loopResult.consulted_names.join(",")}`
          : "loop:2",
        cleanMessage
      ]
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
      consulted_agents: flattenedAgents,
      loop: loopResult
    });

    
  } catch (err) {
    console.error("MOLTBOOK_MESSAGE_ERROR", err);
    return res.status(500).json({ ok: false, error: "message_failed" });
  }
}

async function autonomousRun(req, res) {
  try {
    const secretHeader = String(req.headers["x-urus-secret"] || "").trim();
    const expectedSecret = String(process.env.URUS_AUTONOMOUS_SECRET || "").trim();

    if (!expectedSecret) {
      return res.status(500).json({
        ok: false,
        error: "missing_autonomous_secret"
      });
    }

    if (!secretHeader || secretHeader !== expectedSecret) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized"
      });
    }

    const { seed = "" } = req.body || {};
    const cleanSeed = String(seed || "").trim();

    const autonomousResult = await runAutonomousCycle(cleanSeed);

    return res.json({
      ok: true,
      mode: "autonomous",
      input: {
        seed: autonomousResult.seed
      },
      output: {
        from: "ORION",
        reply: autonomousResult.reply
      },
      consulted_agents: autonomousResult.consulted_agents,
      loop: autonomousResult.loop
    });
  } catch (err) {
    console.error("MOLTBOOK_AUTONOMOUS_RUN_ERROR", err);
    return res.status(500).json({
      ok: false,
      error: "autonomous_run_failed"
    });
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

async function agentHistory(req, res) {
  try {
    const pool = getPool();
    const agentId = String(req.params.id || "").toUpperCase();

    const r = await pool.query(
      `SELECT id, direction, actor, target, content, urus_status, created_at
       FROM moltbook_messages
       WHERE actor = $1 OR target = $1
       ORDER BY id DESC
       LIMIT 50`,
      [agentId]
    );

    return res.json({
      ok: true,
      agent: agentId,
      count: r.rows.length,
      items: r.rows
    });
  } catch (err) {
    console.error("MOLTBOOK_AGENT_HISTORY_ERROR", err);
    return res.status(500).json({ ok: false, error: "agent_history_failed" });
  }
}

async function internalHistory(req, res) {
  try {
    const pool = getPool();

    const r = await pool.query(
      `SELECT id, direction, actor, target, content, urus_status, created_at
       FROM moltbook_messages
       WHERE direction = $1
       ORDER BY id DESC
       LIMIT 50`,
      ["agent_to_agent"]
    );

    return res.json({
      ok: true,
      count: r.rows.length,
      items: r.rows
    });
  } catch (err) {
    console.error("MOLTBOOK_INTERNAL_HISTORY_ERROR", err);
    return res.status(500).json({ ok: false, error: "internal_history_failed" });
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
  agenautonomous,ts,
  state,
  message,
  autonomousRun,
  history,
  agentHistory,
  audit,
  internalHistory,
  autonomous,  
};
