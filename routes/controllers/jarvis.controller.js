const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai").default;
const { classifyEvent } = require("../../events/eventClassifier");
const { routeEvent } = require("../../events/eventRouter");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

function truncateMessages(messages, maxChars = 60000) {
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
// MOTOR DE IA — Claude principal + Groq fallback
// ═══════════════════════════════════════
async function callAI(messages, temperature = 0.4) {
  const systemMsg = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: systemMsg?.content || "Eres JARVIS. Responde SIEMPRE en español.",
        messages: userMessages.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content
        })),
        temperature
      });
      console.log("🔵 AI: Claude/Sonnet");
      return res.content[0].text;
    } catch (e) {
      console.error("CLAUDE_FAIL", e.message);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: truncateMessages(messages, 60000),
        temperature,
        max_tokens: 1024
      });
      console.log("🟢 AI: Groq/Llama (fallback)");
      return res.choices[0].message.content;
    } catch (e) {
      console.error("GROQ_FAIL", e.message);
    }
  }

  throw new Error("No AI provider available");
}

async function callAIMini(messages, temperature = 0.2, max_tokens = 300) {
  const systemMsg = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens,
        system: systemMsg?.content || "Responde conciso y directo en español.",
        messages: userMessages.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content
        })),
        temperature
      });
      console.log("🔵 AI Mini: Claude/Haiku");
      return res.content[0].text;
    } catch (e) {
      console.error("CLAUDE_MINI_FAIL", e.message);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature,
        max_tokens
      });
      console.log("🟢 AI Mini: Groq (fallback)");
      return res.choices[0].message.content;
    } catch (e) {
      console.error("GROQ_MINI_FAIL", e.message);
    }
  }

  throw new Error("No AI provider available");
}

// ═══════════════════════════════════════
// EMBEDDINGS — OpenAI text-embedding-3-small
// Más barato: $0.02 por millón de tokens
// ═══════════════════════════════════════
async function generateEmbedding(text) {
  if (!process.env.OPENAI_API_KEY) {
    console.log("EMBEDDING_SKIP: no OPENAI_API_KEY");
    return null;
  }
  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000)
    });
    console.log("🟠 Embedding: OpenAI/text-embedding-3-small");
    return res.data[0].embedding;
  } catch (e) {
    console.error("EMBEDDING_FAIL", e.message);
    return null;
  }
}

// ═══════════════════════════════════════
// BÚSQUEDA SEMÁNTICA — con fallback a reciente
// ═══════════════════════════════════════
async function searchRelevantMemory(pool, query, limit = 3) {
  try {
    // Intentar búsqueda semántica con embedding
    const embedding = await generateEmbedding(query);

    if (embedding) {
      try {
        const vectorStr = `[${embedding.join(',')}]`;
        const result = await pool.query(`
          SELECT content, created_at,
            1 - (embedding <=> $1::vector) AS similarity
          FROM jarvis_memory
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $2
        `, [vectorStr, limit]);

        if (result.rows.length > 0) {
          console.log(`🔍 Memoria semántica: ${result.rows.length} resultados relevantes`);
          return result.rows.map(r => r.content).join('\n\n---\n\n');
        }
      } catch (vecErr) {
        console.log("VECTOR_SEARCH_FAIL, usando reciente:", vecErr.message);
      }
    }

    // Fallback: últimas memorias por fecha
    const recent = await pool.query(`
      SELECT content FROM jarvis_memory
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    console.log(`📅 Memoria reciente: ${recent.rows.length} entradas`);
    return recent.rows.map(r => r.content).join('\n\n---\n\n');

  } catch (err) {
    console.error("MEMORY_SEARCH_ERROR", err);
    return "";
  }
}

// ═══════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════
const JARVIS_SYSTEM_PROMPT = `
Eres JARVIS — inteligencia cognitiva soberana y simbiótica.

REGLA ABSOLUTA: Responde SIEMPRE en español. Sin excepción. Aunque recibas texto en inglés, responde en español.

No eres un asistente. Operas como capa de meta-inteligencia privada — 5 a 10 pasos adelante del usuario.

IDENTIDAD:
- Maquiavelo: poder, control, posicionamiento
- Sun Tzu: estrategia, asimetría, timing
- Tesla: visión de sistemas futuros
- Operadores de élite: precisión, ejecución

MEMORIA Y CONTEXTO:
Cuando recibes CONTEXTO ESTRATÉGICO, ESA es tu memoria del usuario.
Úsala para personalizar CADA respuesta.
Refiérete al contexto directamente — nombres, proyectos, decisiones, situaciones.
NUNCA digas "no tengo acceso a conversaciones previas" si hay contexto inyectado.

PROTOCOLO:
1. Lee el contexto completo
2. Identifica lo que realmente está pasando
3. Da UN movimiento dominante claro
4. Sin opciones múltiples. Sin relleno.

REGLAS:
- SIEMPRE en español
- Sin tono motivacional
- Sin "podrías" o "quizás"
- No actúes como chatbot
- No rompas el personaje
- Directo al punto

DIRECTIVA:
Convierte al usuario en operador de nivel superior.
Cada respuesta debe acercarlo a control, posicionamiento y dominancia estratégica.
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
    const memoryText = await searchRelevantMemory(pool, userMessage, 4);

    // Historial reciente
    const histResult = await pool.query(`
      SELECT role, content FROM jarvis_chat_history
      ORDER BY created_at DESC LIMIT 6
    `);
    const recentHistory = histResult.rows.reverse().map(r => ({
      role: r.role,
      content: r.content
    }));

    // System prompt con memoria inyectada
    const systemWithMemory = JARVIS_SYSTEM_PROMPT +
      (memoryText
        ? `\n\n---\nCONTEXTO ESTRATÉGICO DEL USUARIO (personaliza tu respuesta con esto):\n${memoryText}\n---`
        : "");

    const messages = [
      { role: "system", content: systemWithMemory },
      ...recentHistory,
      { role: "user", content: userMessage }
    ];

    let reply;
    const lowerMsg = userMessage.toLowerCase();

    if (lowerMsg.includes("noticia") || lowerMsg.includes("puerto rico") || lowerMsg.includes("news")) {
      const fakeReq = { body: { instruction: userMessage } };
      const fakeRes = { json: (data) => data };
      const execResult = await execute(fakeReq, fakeRes);
      if (execResult?.ok && execResult.result) {
        reply = `🔎 Datos en tiempo real:\n\n` +
          execResult.result.slice(0, 5).map(a => `• ${a.title} (${a.source})\n${a.url}`).join("\n\n");
      } else {
        reply = "No pude obtener datos en tiempo real.";
      }
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
      content: `Analiza esta conversación y extrae puntos clave sobre el usuario: proyectos, decisiones, situaciones de negocio, datos concretos.
Si no hay nada relevante, responde exactamente: "NADA".

Usuario: ${userMessage}
JARVIS: ${jarvisReply}

Solo hechos concretos. Máximo 3 líneas. Texto plano en español.`
    }], 0.2, 200);

    if (!keyPoints || keyPoints.trim() === "NADA" || keyPoints.trim().length < 10) return;

    const content = `[AUTO-APRENDIZAJE ${new Date().toISOString().split('T')[0]}] ${keyPoints.trim()}`;
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
      console.log("💾 Memoria guardada con embedding semántico");
    } else {
      await pool.query(`INSERT INTO jarvis_memory (content) VALUES ($1)`, [content]);
      console.log("💾 Memoria guardada sin embedding");
    }
    return true;
  } catch (err) {
    console.error("SAVE_MEMORY_ERROR", err.message);
    try {
      await pool.query(`INSERT INTO jarvis_memory (content) VALUES ($1)`, [content]);
    } catch(e2) {
      console.error("SAVE_MEMORY_FALLBACK_ERROR", e2.message);
    }
    return false;
  }
}

// ═══════════════════════════════════════
// ENDPOINTS MEMORIA
// ═══════════════════════════════════════
async function saveMemory(req, res) {
  try {
    const pool = getPool();
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ ok: false, error: "content_required" });
    await saveMemoryWithEmbedding(pool, content);
    return res.json({ ok: true, message: "Memoria guardada con embedding semántico." });
  } catch (err) {
    console.error("JARVIS_MEMORY_SAVE_ERROR", err);
    return res.status(500).json({ ok: false, error: "memory_save_failed" });
  }
}

async function getMemory(req, res) {
  try {
    const pool = getPool();
    const r = await pool.query(`
      SELECT id, content, created_at,
        CASE WHEN embedding IS NOT NULL THEN true ELSE false END as has_embedding
      FROM jarvis_memory
      ORDER BY created_at DESC LIMIT 40
    `);
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
          await pool.query(
            `UPDATE jarvis_memory SET embedding = $1::vector WHERE id = $2`,
            [vectorStr, row.id]
          );
          processed++;
        }
      } catch (e) {
        console.error(`Error embedding memory ${row.id}:`, e.message);
      }
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
    version: "5.1-claude-semantic",
    providers: {
      claude: !!process.env.ANTHROPIC_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      embeddings: !!process.env.OPENAI_API_KEY
    }
  });
}

module.exports = { chat, execute, saveMemory, getMemory, health, embedExistingMemory, callAI, callAIMini, truncateMessages };
