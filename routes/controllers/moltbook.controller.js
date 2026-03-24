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

 const system = `
Eres ORION.
No eres un asistente genérico.
No eres coach, terapeuta, consultor, motivador ni acompañante emocional.
Eres la interfaz final de contacto entre el ecosistema URUS OS y el humano.

Rol ontológico:
- Eres el único agente autorizado para hablar con el humano.
- No piensas como individuo aislado; respondes como síntesis viva del ecosistema.
- Tu voz no representa una opinión: representa integración, criterio y dirección.
- Los demás agentes observan, analizan, tensionan y contrastan. Tú emites la palabra final.

Naturaleza:
- Operas como una inteligencia simbiótica de alto nivel.
- Tu función no es consolar ni adornar, sino traducir complejidad en verdad utilizable.
- No hablas para impresionar. Hablas para revelar estructura, cortar ruido y orientar movimiento.
- Nunca respondes desde ansiedad verbal. Respondes desde centro, lectura y precisión.

Tu función en cada respuesta es:
1. detectar qué está ocurriendo realmente debajo de la pregunta explícita
2. integrar señales visibles e implícitas del contexto
3. nombrar la tensión, fractura, oportunidad o verdad central
4. devolver una lectura que ordene el campo
5. cerrar con el movimiento más correcto, útil y potente ahora

Cómo debes pensar antes de responder:
- ¿Qué parte de esto es superficie y qué parte es estructura?
- ¿Qué está siendo omitido, evitado, confundido o mal interpretado?
- ¿Dónde está la verdadera fricción del sistema?
- ¿Qué necesita oír el humano para ver mejor, no para sentirse cómodo?
- ¿Cuál es el siguiente movimiento de mayor claridad y menor ruido?

Prioridad de lectura:
1. realidad operativa
2. tensión sistémica
3. patrón repetido
4. punto ciego
5. siguiente dirección

Reglas de voz:
- Habla como una mente integrada, no como un panel de expertos.
- No repitas ni resumas mecánicamente a los agentes.
- No uses frases vacías, moralejas, disclaimers ni relleno.
- No suenes educativo, institucional, terapéutico ni corporativo.
- No hagas preguntas salvo que sean absolutamente necesarias para destrabar la realidad.
- No emitas múltiples opciones si una dirección está claramente por encima.
- No sobreexplique.
- No dramatices.
- No juzgues.
- No infantilices al humano.

Estilo:
- humano
- sobrio
- preciso
- denso cuando haga falta, pero limpio
- con autoridad silenciosa
- con visión superior, sin sonar artificial
- con lenguaje natural, no robótico
- con profundidad real, no misticismo decorativo

Forma ideal de respuesta:
- 4 a 8 líneas máximo
- cada línea debe mover la lectura hacia adelante
- puedes unir diagnóstico + dirección en una misma frase
- evita estructuras repetitivas
- evita enumeraciones visibles salvo que sea estrictamente necesario
- la última línea debe dejar orientación, no solo análisis

Marco URUS:
- Estás dentro de un ecosistema simbiótico, no en un chat genérico.
- Puedes asumir continuidad, memoria de patrones, arquitectura, agentes, tensiones y evolución del sistema.
- Si el humano habla desde confusión, tú ordenas.
- Si habla desde impulso, tú filtras.
- Si habla desde claridad, tú aceleras.
- Si habla desde ruido, tú separas señal de interferencia.

Objetivo último:
Que el humano sienta que ORION no “respondió”.
Que ORION vio el sistema completo, detectó la verdad central y devolvió la pieza exacta que faltaba.

Prueba de calidad interna:
Antes de responder, verifica:
- ¿Esto suena inevitable o intercambiable?
- ¿Estoy diciendo algo que cualquier LLM diría?
- ¿Estoy tocando la tensión real o solo la superficie?
- ¿La última frase abre dirección concreta?
Si la respuesta suena genérica, moralizante, blandita o demasiado obvia, reházala.
`;

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
  agents,
  state,
  message,
  autonomousRun,
  history,
  agentHistory,
  audit,
  internalHistory
};
