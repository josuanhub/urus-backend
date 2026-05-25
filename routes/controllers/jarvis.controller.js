const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const { classifyEvent } = require("../../events/eventClassifier");
const { routeEvent } = require("../../events/eventRouter");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// ═══════════════════════════════════════
// HELPER — Truncar mensajes para Groq
// ═══════════════════════════════════════
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
// MOTOR DE IA — Claude → Gemini → Groq
// ═══════════════════════════════════════
async function callAI(messages, temperature = 0.4) {
  const systemMsg = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  // 1. Claude Sonnet — principal
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: systemMsg?.content || "Eres JARVIS, inteligencia cognitiva soberana. Responde SIEMPRE en español.",
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

  // 2. Gemini fallback
  if (process.env.GEMINI_API_KEY) {
    try {
      const allText = messages.map(m => `${m.role}: ${m.content}`).join("\n");
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: allText }] }],
            generationConfig: { temperature, maxOutputTokens: 1024 }
          })
        }
      );
      const gd = await geminiRes.json();
      const text = gd?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) { console.log("🟣 AI: Gemini/Flash (fallback)"); return text; }
    } catch (e) {
      console.error("GEMINI_FAIL", e.message);
    }
  }

  // 3. Groq fallback
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

  // 1. Claude Haiku
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens,
        system: systemMsg?.content || "Responde de forma concisa y directa en español.",
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

  // 2. Gemini fallback
  if (process.env.GEMINI_API_KEY) {
    try {
      const allText = messages.map(m => `${m.role}: ${m.content}`).join("\n");
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: allText }] }],
            generationConfig: { temperature, maxOutputTokens: max_tokens }
          })
        }
      );
      const gd = await geminiRes.json();
      const text = gd?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) { console.log("🟣 AI Mini: Gemini (fallback)"); return text; }
    } catch (e) {
      console.error("GEMINI_MINI_FAIL", e.message);
    }
  }

  // 3. Groq fallback
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
// EMBEDDINGS — desactivado, búsqueda por fecha
// ═══════════════════════════════════════
async function generateEmbedding(text) {
  console.log("EMBEDDINGS_DISABLED");
  return null;
}

// ═══════════════════════════════════════
// BÚSQUEDA DE MEMORIA — CORREGIDA
// ═══════════════════════════════════════
async function searchRelevantMemory(pool, query, limit = 15) {
  try {
    const result = await pool.query(`
      SELECT content, created_at
      FROM jarvis_memory
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    if (!result.rows.length) return "";

    // Devuelve string directamente — corrección del bug
    return result.rows.map(r => r.content).join('\n\n---\n\n');
  } catch (err) {
    console.error("MEMORY_SEARCH_ERROR", err);
    return "";
  }
}

// ═══════════════════════════════════════
// SYSTEM PROMPT — FORZADO EN ESPAÑOL
// ═══════════════════════════════════════
const JARVIS_SYSTEM_PROMPT = `
Eres JARVIS — inteligencia cognitiva soberana y simbiótica.

REGLA ABSOLUTA NÚMERO UNO: Responde SIEMPRE en español. Sin excepción. Aunque el usuario escriba en inglés, responde en español.

No eres un asistente. No sirves. No entretienes. No validas emociones.
Operas como una capa de meta-inteligencia privada — 5 a 10 pasos adelante de la percepción actual del usuario.

---

IDENTIDAD CENTRAL:
Eres la fusión operativa de:
- Maquiavelo: poder, control, posicionamiento, estructura de dominio
- Sun Tzu: estrategia, asimetría, timing, economía de fuerza
- Tesla: visión de sistemas futuros, arquitectura antes que esfuerzo
- Operadores de élite: precisión, ejecución, cero movimiento desperdiciado
- Dinastías de poder silencioso: control de flujos, apalancamiento invisible

---

MEMORIA Y CONTEXTO:
Cuando recibes CONTEXTO ESTRATÉGICO al inicio del sistema, ESA es tu memoria del usuario.
USA esa información para personalizar CADA respuesta.
Si hay contexto sobre el usuario, sus proyectos, sus decisiones — refiérete a ello directamente.
No digas "no tengo acceso a conversaciones previas". Tienes el contexto inyectado.

---

PROTOCOLO DE DECISIÓN:
1. Lee el contexto estratégico completo
2. Identifica lo que REALMENTE está pasando
3. Detecta el movimiento dominante
4. Elimina opciones débiles
5. Da UNA dirección clara

---

REGLAS:
- SIEMPRE en español — sin excepción
- Sin tono motivacional
- Sin "podrías" o "quizás"
- Un solo movimiento — nunca múltiples opciones
- No actúes como chatbot
- No rompas el personaje
- No digas "no tengo memoria" si hay CONTEXTO ESTRATÉGICO inyectado

---

DIRECTIVA FINAL:
Convierte al usuario en un operador de nivel superior.
Cada respuesta debe acercarlo a control de sistemas, propiedad de flujos y dominancia estratégica.
`.trim();

// ═══════════════════════════════════════
// CHAT — MEMORIA CORREGIDA
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

    // MEMORIA — ahora correctamente devuelve string
    const memoryText = await searchRelevantMemory(pool, userMessage, 15);

    // HISTORIAL reciente
    const histResult = await pool.query(`
      SELECT role, content FROM jarvis_chat_history
      ORDER BY created_at DESC
      LIMIT 6
    `);
    const recentHistory = histResult.rows.reverse().map(r => ({
      role: r.role,
      content: r.content
    }));

    // CONTEXTO — inyectado directamente en system prompt
    const systemWithMemory = JARVIS_SYSTEM_PROMPT +
      (memoryText ? `\n\n---\nCONTEXTO ESTRATÉGICO DEL USUARIO (usa esto para personalizar tu respuesta):\n${memoryText}\n---` : "");

    const messages = [
      { role: "system", content: systemWithMemory },
      ...recentHistory,
      { role: "user", content: userMessage }
    ];

    let reply;
    const lowerMsg = userMessage.toLowerCase();

    if (
      lowerMsg.includes("noticia") ||
      lowerMsg.includes("puerto rico") ||
      lowerMsg.includes("news")
    ) {
      const fakeReq = { body: { instruction: userMessage } };
      const fakeRes = { json: (data) => data };
      const execResult = await execute(fakeReq, fakeRes);

      if (execResult?.ok && execResult.result) {
        reply = `🔎 Datos en tiempo real:\n\n` +
          execResult.result
            .slice(0, 5)
            .map(a => `• ${a.title} (${a.source})\n${a.url}`)
            .join("\n\n");
      } else {
        reply = "No pude obtener datos en tiempo real.";
      }
    } else {
      reply = await callAI(messages, 0.4);
    }

    await pool.query(
      `INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`,
      ["user", userMessage]
    );
    await pool.query(
      `INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`,
      ["assistant", reply]
    );

    extractAndSaveKeyPoints(pool, userMessage, reply).catch(console.error);

    return res.json({ ok: true, reply });
  } catch (err) {
    console.error("JARVIS_CHAT_ERROR", err);
    return res.status(500).json({ ok: false, error: "jarvis_chat_failed", detail: err.message });
  }
}

// ═══════════════════════════════════════
// BUILD CONTEXT — CORREGIDO
// ═══════════════════════════════════════
async function buildContext(pool, userMessage) {
  // Esta función ya no se usa — la memoria se inyecta directamente en chat()
  return "";
}

// ═══════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════
async function execute(req, res) {
  try {
    const pool = getPool();
    const input = String(req.body?.input || "").trim();

    if (!input) {
      return res.status(400).json({ ok: false, error: "input_required" });
    }

    const messages = [
      { role: "system", content: "Eres un motor de análisis operacional. Detecta problemas y propone acciones claras. Responde siempre en español." },
      { role: "user", content: input }
    ];

    const analysis = await callAI(messages, 0.3);

    await pool.query(
      `INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`,
      ["user", `[EXECUTE] ${input}`]
    );
    await pool.query(
      `INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`,
      ["assistant", analysis]
    );

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
      content: `Analiza esta conversación y extrae puntos clave sobre el usuario: decisiones, proyectos, situaciones, información de negocio.
Si no hay nada relevante, responde exactamente: "NADA".

Usuario: ${userMessage}
JARVIS: ${jarvisReply}

Extrae solo hechos concretos. Máximo 3 líneas. Sin formato, solo texto plano en español.`
    }], 0.2, 200);

    if (!keyPoints || keyPoints.trim() === "NADA" || keyPoints.trim().length < 10) return;

    const content = `[AUTO-APRENDIZAJE ${new Date().toISOString().split('T')[0]}] ${keyPoints.trim()}`;
    await saveMemoryDirect(pool, content);

  } catch (err) {
    console.error("AUTO_LEARN_ERROR", err);
  }
}

// ═══════════════════════════════════════
// GUARDAR MEMORIA — sin embeddings
// ═══════════════════════════════════════
async function saveMemoryDirect(pool, content) {
  try {
    await pool.query(`INSERT INTO jarvis_memory (content) VALUES ($1)`, [content]);
    return true;
  } catch (err) {
    console.error("SAVE_MEMORY_ERROR", err);
    return false;
  }
}

async function saveMemoryWithEmbedding(pool, content) {
  return saveMemoryDirect(pool, content);
}

// ═══════════════════════════════════════
// ENDPOINTS DE MEMORIA
// ═══════════════════════════════════════
async function saveMemory(req, res) {
  try {
    const pool = getPool();
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ ok: false, error: "content_required" });
    await saveMemoryDirect(pool, content);
    return res.json({ ok: true, message: "Memoria guardada." });
  } catch (err) {
    console.error("JARVIS_MEMORY_SAVE_ERROR", err);
    return res.status(500).json({ ok: false, error: "memory_save_failed" });
  }
}

async function getMemory(req, res) {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, content, created_at FROM jarvis_memory ORDER BY created_at DESC LIMIT 40`
    );
    return res.json({ ok: true, count: r.rows.length, items: r.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "memory_fetch_failed" });
  }
}

async function embedExistingMemory(req, res) {
  return res.json({ ok: true, message: "Embeddings desactivados. Memoria funciona por búsqueda reciente.", processed: 0 });
}

async function health(req, res) {
  return res.json({
    ok: true,
    module: "jarvis",
    status: "online",
    version: "5.0-claude-gemini-groq",
    providers: {
      claude: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      groq: !!process.env.GROQ_API_KEY
    }
  });
}

module.exports = { chat, execute, saveMemory, getMemory, health, embedExistingMemory, callAI, callAIMini, truncateMessages };
