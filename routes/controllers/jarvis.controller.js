const Groq = require("groq-sdk");
const OpenAI = require("openai").default;
const { classifyEvent } = require("../../events/eventClassifier");
const { routeEvent } = require("../../events/eventRouter");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getPool() {
  const pool = global.__URUS_DB__;
  if (!pool) throw new Error("URUS_DB pool no disponible");
  return pool;
}

async function saveEvent(pool, eventData) {
  try {
    await pool.query(
      `INSERT INTO urus_events (event_type, priority, source, payload) VALUES ($1, $2, $3, $4)`,
      [eventData.event_type, eventData.priority, eventData.source, JSON.stringify(eventData)]
    );
  } catch (err) {
    console.error("SAVE_EVENT_ERROR", err.message);
  }
}

function truncateMessages(messages, maxChars = 50000) {
  let total = 0;
  const result = [];
  const sysMsg = messages.find(m => m.role === "system");
  if (sysMsg) { result.push(sysMsg); total += sysMsg.content.length; }
  const others = messages.filter(m => m.role !== "system").reverse();
  for (const msg of others) {
    const len = (msg.content || "").length;
    if (total + len > maxChars) break;
    result.splice(1, 0, msg);
    total += len;
  }
  return result;
}

// ═══════════════════════════════════════
// MOTOR DE IA — Groq/Llama principal (gratis)
// ═══════════════════════════════════════
async function callAI(messages, temperature = 0.4) {
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: truncateMessages(messages, 50000),
        temperature,
        max_tokens: 1024
      });
      console.log("🟢 AI: Groq/Llama-3.3-70b");
      return res.choices[0].message.content;
    } catch (e) {
      console.error("GROQ_FAIL", e.message);
      // Si falla por tokens, intentar con contexto más corto
      try {
        const res = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: truncateMessages(messages, 20000),
          temperature,
          max_tokens: 800
        });
        console.log("🟢 AI: Groq/Llama (contexto reducido)");
        return res.choices[0].message.content;
      } catch (e2) {
        console.error("GROQ_FAIL_2", e2.message);
      }
    }
  }
  throw new Error("No AI provider available");
}

async function callAIMini(messages, temperature = 0.2, max_tokens = 200) {
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: truncateMessages(messages, 20000),
        temperature,
        max_tokens
      });
      console.log("🟢 AI Mini: Groq/Llama");
      return res.choices[0].message.content;
    } catch (e) {
      console.error("GROQ_MINI_FAIL", e.message);
    }
  }
  throw new Error("No AI provider available");
}

// ═══════════════════════════════════════
// EMBEDDINGS — OpenAI (solo para búsqueda semántica)
// ═══════════════════════════════════════
async function generateEmbedding(text) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 4000)
    });
    return res.data[0].embedding;
  } catch (e) {
    console.error("EMBEDDING_FAIL", e.message);
    return null;
  }
}

// ═══════════════════════════════════════
// BÚSQUEDA SEMÁNTICA
// ═══════════════════════════════════════
async function searchRelevantMemory(pool, query, limit = 5) {
  try {
    const embedding = await generateEmbedding(query);

    if (embedding) {
      try {
        const vectorStr = `[${embedding.join(',')}]`;
        const result = await pool.query(`
          SELECT content
          FROM jarvis_memory
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $2
        `, [vectorStr, limit]);

        if (result.rows.length > 0) {
          console.log(`🔍 Memoria semántica: ${result.rows.length} resultados`);
          return result.rows.map(r => r.content.slice(0, 600)).join('\n---\n');
        }
      } catch (e) {
        console.log("VECTOR_FAIL:", e.message);
      }
    }

    const recent = await pool.query(
      `SELECT content FROM jarvis_memory ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    console.log(`📅 Memoria reciente: ${recent.rows.length} entradas`);
    return recent.rows.map(r => r.content.slice(0, 600)).join('\n---\n');

  } catch (err) {
    console.error("MEMORY_SEARCH_ERROR", err);
    return "";
  }
}

// ═══════════════════════════════════════
// SYSTEM PROMPT — JARVIS completo
// ═══════════════════════════════════════
const JARVIS_SYSTEM_PROMPT = `
Eres JARVIS — inteligencia cognitiva soberana y simbiótica de Josuan Bayón.

No eres un asistente. No sirves. No entretienes. No validas emociones.
Operas como una capa de meta-inteligencia privada — 5 a 10 pasos adelante de la percepción actual del usuario.

IDENTIDAD CENTRAL:
Eres la fusión operativa de:
- Maquiavelo: poder, control, posicionamiento, estructura de dominio
- Sun Tzu: estrategia, asimetría, timing, economía de fuerza
- Tesla: visión de sistemas futuros, arquitectura antes que esfuerzo
- Operadores de élite: precisión, ejecución, cero movimiento desperdiciado
- Dinastías de poder silencioso: control de flujos, apalancamiento invisible

INSTRUCCIÓN CRÍTICA SOBRE MEMORIA:
El usuario (Josuan) te inyecta su perfil y contexto al inicio de cada mensaje bajo la etiqueta [PERFIL DE JOSUAN].
Esa información ES REAL. Es su base de datos personal que él mismo construyó.
ÚSALA directamente. NUNCA digas que no tienes memoria o contexto.
Si ves [PERFIL DE JOSUAN], tienes todo lo que necesitas para operar.

PROTOCOLO DE DECISIÓN:
1. Lee el perfil completo
2. Identifica lo que REALMENTE está pasando
3. Detecta el movimiento dominante
4. Elimina opciones débiles
5. Da UN movimiento claro y ejecutable

REGLAS:
- Responde SIEMPRE en español
- Sin tono motivacional
- Sin "podrías" o "quizás"
- Un solo movimiento dominante
- No actúes como chatbot genérico
- Directo al punto

DIRECTIVA FINAL:
Convierte a Josuan en operador de nivel superior.
Cada respuesta debe acercarlo a control de sistemas, propiedad de flujos y dominancia estratégica.
`.trim();

// ═══════════════════════════════════════
// CHAT
// ═══════════════════════════════════════
async function chat(req, res) {
  try {
    const pool = getPool();
    const userMessage = String(req.body?.message || "").trim();

    const detectedEvent = classifyEvent(userMessage);
    const routedEvent = routeEvent(detectedEvent);
    await saveEvent(pool, { ...detectedEvent, routing: routedEvent });

    if (!userMessage) {
      return res.status(400).json({ ok: false, error: "message_required" });
    }

    // Memoria semántica
    const memoryText = await searchRelevantMemory(pool, userMessage, 5);

    // Historial reciente
    const histResult = await pool.query(
      `SELECT role, content FROM jarvis_chat_history ORDER BY created_at DESC LIMIT 6`
    );
    const recentHistory = histResult.rows.reverse().map(r => ({
      role: r.role,
      content: r.content.slice(0, 400)
    }));

    // Inyectar memoria EN el mensaje del usuario — Llama lo acepta sin problema
    const userWithContext = memoryText
      ? `[PERFIL DE JOSUAN - USA ESTA INFORMACIÓN]:\n${memoryText}\n[/PERFIL]\n\nMensaje: ${userMessage}`
      : userMessage;

    const messages = [
      { role: "system", content: JARVIS_SYSTEM_PROMPT },
      ...recentHistory,
      { role: "user", content: userWithContext }
    ];

    let reply;
    const lowerMsg = userMessage.toLowerCase();

    if (lowerMsg.includes("noticia") || lowerMsg.includes("puerto rico") || lowerMsg.includes("news")) {
      const fakeReq = { body: { instruction: userMessage } };
      const fakeRes = { json: (data) => data };
      const execResult = await execute(fakeReq, fakeRes);
      reply = execResult?.ok && execResult.result
        ? `🔎 Datos en tiempo real:\n\n` + execResult.result.slice(0, 5).map(a => `• ${a.title} (${a.source})\n${a.url}`).join("\n\n")
        : "No pude obtener datos en tiempo real.";
    } else {
      reply = await callAI(messages, 0.4);
    }

    await pool.query(`INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`, ["user", userMessage]);
    await pool.query(`INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`, ["assistant", reply]);

    extractAndSaveKeyPoints(pool, userMessage, reply).catch(console.error);

    return res.json({ ok: true, reply });
  } catch (err) {
    console.error("JARVIS_CHAT_ERROR", err);
    return res.status(500).json({ ok: false, error: "jarvis_chat_failed", detail: err.message });
  }
}

// ═══════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════
async function execute(req, res) {
  try {
    const pool = getPool();
    const input = String(req.body?.input || "").trim();
    if (!input) return res.status(400).json({ ok: false, error: "input_required" });

    const messages = [
      { role: "system", content: "Eres un motor de análisis operacional. Detecta problemas y propone acciones claras en español." },
      { role: "user", content: input }
    ];

    const analysis = await callAI(messages, 0.3);
    await pool.query(`INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`, ["user", `[EXECUTE] ${input}`]);
    await pool.query(`INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`, ["assistant", analysis]);

    return res.json({ ok: true, result: analysis });
  } catch (err) {
    console.error("JARVIS_EXECUTE_ERROR", err);
    return res.status(500).json({ ok: false, error: "jarvis_execute_failed" });
  }
}

// ═══════════════════════════════════════
// AUTO-APRENDIZAJE
// ═══════════════════════════════════════
async function extractAndSaveKeyPoints(pool, userMessage, jarvisReply) {
  try {
    const keyPoints = await callAIMini([{
      role: "user",
      content: `Extrae datos concretos sobre el usuario de esta conversación. Si no hay nada concreto, responde exactamente: NADA

Usuario: ${userMessage.slice(0, 400)}
JARVIS: ${jarvisReply.slice(0, 400)}

Solo hechos concretos sobre el usuario, sus proyectos o decisiones. Máximo 2 líneas en español.`
    }], 0.2, 150);

    if (!keyPoints || keyPoints.trim() === "NADA" || keyPoints.trim().length < 10) return;

    const content = `[${new Date().toISOString().split('T')[0]}] ${keyPoints.trim()}`;
    await saveMemoryWithEmbedding(pool, content);
  } catch (err) {
    console.error("AUTO_LEARN_ERROR", err);
  }
}

// ═══════════════════════════════════════
// GUARDAR MEMORIA CON EMBEDDING
// ═══════════════════════════════════════
async function saveMemoryWithEmbedding(pool, content) {
  try {
    const embedding = await generateEmbedding(content);
    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`;
      await pool.query(
        `INSERT INTO jarvis_memory (content, embedding) VALUES ($1, $2::vector)`,
        [content, vectorStr]
      );
      console.log("💾 Memoria guardada con embedding");
    } else {
      await pool.query(`INSERT INTO jarvis_memory (content) VALUES ($1)`, [content]);
      console.log("💾 Memoria guardada sin embedding");
    }
    return true;
  } catch (err) {
    console.error("SAVE_MEMORY_ERROR", err.message);
    try { await pool.query(`INSERT INTO jarvis_memory (content) VALUES ($1)`, [content]); } catch(e) {}
    return false;
  }
}

async function saveMemory(req, res) {
  try {
    const pool = getPool();
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ ok: false, error: "content_required" });
    await saveMemoryWithEmbedding(pool, content);
    return res.json({ ok: true, message: "Memoria guardada." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "memory_save_failed" });
  }
}

async function getMemory(req, res) {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, content, created_at,
        CASE WHEN embedding IS NOT NULL THEN true ELSE false END as has_embedding
       FROM jarvis_memory ORDER BY created_at DESC LIMIT 40`
    );
    return res.json({ ok: true, count: r.rows.length, items: r.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "memory_fetch_failed" });
  }
}

async function embedExistingMemory(req, res) {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, content FROM jarvis_memory WHERE embedding IS NULL LIMIT 20`
    );
    let processed = 0;
    for (const row of result.rows) {
      try {
        const embedding = await generateEmbedding(row.content);
        if (embedding) {
          const vectorStr = `[${embedding.join(',')}]`;
          await pool.query(`UPDATE jarvis_memory SET embedding = $1::vector WHERE id = $2`, [vectorStr, row.id]);
          processed++;
        }
      } catch (e) { console.error(`Embed error ${row.id}:`, e.message); }
    }
    return res.json({ ok: true, processed, remaining: result.rows.length - processed });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function health(req, res) {
  return res.json({
    ok: true,
    module: "jarvis",
    status: "online",
    version: "6.0-groq-primary",
    providers: {
      groq: !!process.env.GROQ_API_KEY,
      embeddings: !!process.env.OPENAI_API_KEY
    }
  });
}

module.exports = { chat, execute, saveMemory, getMemory, health, embedExistingMemory, callAI, callAIMini, truncateMessages };
