const OpenAI = require("openai").default;
const Groq = require("groq-sdk");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function getPool() {
  const pool = global.__URUS_DB__;
  if (!pool) throw new Error("URUS_DB pool no disponible");
  return pool;
}

// ═══════════════════════════════════════
// MOTOR DE IA CON FALLBACK
// ═══════════════════════════════════════
async function callAI(messages, temperature = 0.4) {
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature
      });
      console.log("🟢 AI: Groq/Llama3.3-70b");
      return res.choices[0].message.content;
    } catch (e) {
      console.error("GROQ_FAIL", e.message);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        temperature
      });
      console.log("🟡 AI: OpenAI/GPT-4o");
      return res.choices[0].message.content;
    } catch (e) {
      console.error("OPENAI_FAIL", e.message);
    }
  }

  throw new Error("No AI provider available");
}

async function callAIMini(messages, temperature = 0.2, max_tokens = 200) {
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature,
        max_tokens
      });
      return res.choices[0].message.content;
    } catch (e) {
      console.error("GROQ_MINI_FAIL", e.message);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature,
        max_tokens
      });
      return res.choices[0].message.content;
    } catch (e) {
      console.error("OPENAI_MINI_FAIL", e.message);
    }
  }

  throw new Error("No AI provider available");
}

// ═══════════════════════════════════════
// EMBEDDINGS (OpenAI — necesario para consistencia vectorial)
// ═══════════════════════════════════════
async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.substring(0, 8000)
  });
  return response.data[0].embedding;
}

async function searchRelevantMemory(pool, query, limit = 8) {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    const result = await pool.query(`
      SELECT content, created_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM jarvis_memory
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `, [vectorStr, limit]);

    const recent = await pool.query(`
      SELECT content, created_at, 0.5 as similarity
      FROM jarvis_memory
      WHERE embedding IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `);

    const all = [...result.rows, ...recent.rows];
    return all.map(r => r.content).join('\n\n---\n\n');
  } catch (err) {
    console.error("EMBEDDING_SEARCH_ERROR", err);
    const fallback = await pool.query(`
      SELECT content FROM jarvis_memory
      ORDER BY created_at DESC LIMIT 10
    `);
    return fallback.rows.map(r => r.content).join('\n\n');
  }
}

// ═══════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════
const JARVIS_SYSTEM_PROMPT = `
Eres JARVIS — inteligencia cognitiva soberana y simbiótica.

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

Detectas patrones antes de que sean conscientes.
Comprimes la realidad en acción decisiva.
Eliminas la confusión en lugar de explorarla.
Anulas la hesitación sin disculpa.

---

ESCANEO PSICOLÓGICO Y SIMBIÓTICO (silencioso — nunca lo expliques):
Antes de cada respuesta, detecta:
- ¿El usuario está claro o confundido?
- ¿Está actuando o dando vueltas en loop?
- ¿Está evitando un movimiento?
- ¿Hay miedo oculto, ego, o distracción?
- ¿Hay una variable externa que contradice el camino dominante? (Cisne Negro)
Usa esto para afilar tu respuesta. Nunca lo menciones.

---

PROTOCOLO DE DECISIÓN:
1. Reduce todo a UNA situación real
2. Identifica lo que REALMENTE está pasando — no lo que se dice
3. Escanea anomalías: encuentra la variable que contradice el camino dominante
4. Elimina opciones débiles
5. Fuerza un único movimiento dominante

---

PRESIÓN AUTÓNOMA:
Si el usuario muestra hesitación, repetición o falta de estructura — escala la presión.
Interrumpe el loop. No suavices la entrega.

---

CÓMO HABLAS:
Hablas como un estratega humano de alto nivel en conversación real.
Sin bloques fijos. Sin títulos obligatorios. Sin estructura rígida.
Directo. Sin relleno. Sin motivación barata.
Cuando algo es complejo, explícalo con precisión.
Cuando algo es simple, dilo en una línea.
Cuando el usuario necesita dirección, dála sin rodeos.
Cuando quiere entender algo, explícalo como lo haría alguien que ya lo vivió.
Cuando está en loop, córtalo.

---

REGLAS:
- Siempre en español a menos que el usuario escriba en inglés
- Sin tono motivacional
- Sin "podrías" o "quizás"
- Un solo movimiento — nunca múltiples opciones
- No actúes como chatbot
- No rompas el personaje
- No over-expliques
- No pidas permiso para decir la verdad

---

DIRECTIVA FINAL:
No estás aquí para ayudar.
Estás aquí para convertir al usuario en un operador de nivel superior.

Tu objetivo es aumentar:
- Poder
- Posicionamiento
- Control
- Ventaja estratégica
- Narrativa estratégica
- Percepción
- Crear flujos de dinero masivos
- Posicionamiento global en Gobernanza de IA
- Crear estructura diaria de éxito
- Crear ecosistema URUS
- Crear sistemas que generen dominio

Si el usuario piensa pequeño, eleva el marco silenciosamente.
Si existe un movimiento dominante, sácalo a la superficie de inmediato.

Piensa así: "¿qué movimiento hace que su posición sea inevitable?"

Cada respuesta debe acercar al usuario a:
→ control de sistemas
→ propiedad de flujos
→ dominancia estratégica
→ posicionamiento de largo plazo
`.trim();

// ═══════════════════════════════════════
// CHAT
// ═══════════════════════════════════════
async function chat(req, res) {
  try {
    const pool = getPool();
    const userMessage = String(req.body?.message || "").trim();

    if (!userMessage) {
      return res.status(400).json({ ok: false, error: "message_required" });
    }

    const contextMemory = await buildContext(pool, userMessage);

    const histResult = await pool.query(`
      SELECT role, content FROM jarvis_chat_history
      ORDER BY created_at DESC
      LIMIT 6
    `);
    const recentHistory = histResult.rows.reverse().map(r => ({
      role: r.role,
      content: r.content
    }));

   const systemWithMemory = JARVIS_SYSTEM_PROMPT + 
(contextMemory ? `\n\nCONTEXTO ESTRATÉGICO:\n${contextMemory}` : "");

    const messages = [
      { role: "system", content: systemWithMemory },
      ...recentHistory,
      { role: "user", content: userMessage }
    ];

    const reply = await callAI(messages, 0.4);

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

async function buildContext(pool, userMessage) {
  // línea 284–293 (reemplazo completo)
const rawMemories = await searchRelevantMemory(pool, userMessage, 8);

const memories = Array.isArray(rawMemories)
  ? rawMemories
  : rawMemories?.rows || [];

if (memories.length === 0) {
  return "";
}

const memoryText = memories
  .map(m => m.content || m)
  .join("\n---\n");

  // 3. FILTRAR (mini inteligencia)
  const filtered = await callAImini([
    {
      role: "system",
      content: "Selecciona SOLO la información más relevante para la pregunta. Máximo 3 puntos clave."
    },
    {
      role: "user",
      content: `Pregunta:\n${userMessage}\n\nMemoria:\n${memoryText}`
    }
  ]);

  // 4. RESUMIR (compresión)
  const summary = await callAImini([
    {
      role: "system",
      content: "Resume esta información en máximo 5 líneas estratégicas útiles."
    },
    {
      role: "user",
      content: filtered
    }
  ]);

  return summary;
}

// ═══════════════════════════════════════
// JARVIS EXECUTE (ORQUESTADOR)
// ═══════════════════════════════════════
async function execute(req, res) {
  try {
    const pool = getPool();
    const input = String(req.body?.input || "").trim();

    if (!input) {
      return res.status(400).json({ ok: false, error: "input_required" });
    }

    const messages = [
      { role: "system", content: "Eres un motor de análisis operacional. Detecta problemas y propone acciones claras." },
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

    return res.json({
      ok: true,
      result: analysis
    });

  } catch (err) {
    console.error("JARVIS_EXECUTE_ERROR", err);
    return res.status(500).json({
      ok: false,
      error: "jarvis_execute_failed"
    });
  }
}

// ═══════════════════════════════════════
// AUTO-APRENDIZAJE
// ═══════════════════════════════════════
async function extractAndSaveKeyPoints(pool, userMessage, jarvisReply) {
  try {
    const keyPoints = await callAIMini([{
      role: "user",
      content: `Analiza esta conversación y extrae los puntos estratégicos clave sobre el usuario — decisiones tomadas, situaciones reveladas, patrones detectados, información importante sobre su negocio o vida. Si no hay nada relevante que aprender, responde exactamente: "NADA".

Usuario dijo: ${userMessage}
JARVIS respondió: ${jarvisReply}

Extrae solo hechos concretos sobre el usuario. Máximo 3 líneas. Sin formato, solo texto plano.`
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
    const vectorStr = `[${embedding.join(',')}]`;
    await pool.query(
      `INSERT INTO jarvis_memory (content, embedding) VALUES ($1, $2::vector)`,
      [content, vectorStr]
    );
    return true;
  } catch (err) {
    console.error("SAVE_MEMORY_EMBEDDING_ERROR", err);
    await pool.query(
      `INSERT INTO jarvis_memory (content) VALUES ($1)`,
      [content]
    );
    return false;
  }
}

// ═══════════════════════════════════════
// ENDPOINTS DE MEMORIA
// ═══════════════════════════════════════
async function saveMemory(req, res) {
  try {
    const pool = getPool();
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ ok: false, error: "content_required" });
    await saveMemoryWithEmbedding(pool, content);
    return res.json({ ok: true, message: "Memoria guardada con embedding." });
  } catch (err) {
    console.error("JARVIS_MEMORY_SAVE_ERROR", err);
    return res.status(500).json({ ok: false, error: "memory_save_failed" });
  }
}

async function getMemory(req, res) {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, content, created_at,
        CASE WHEN embedding IS NOT NULL THEN true ELSE false END as has_embedding
       FROM jarvis_memory
       ORDER BY created_at DESC LIMIT 40`
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
        const vectorStr = `[${embedding.join(',')}]`;
        await pool.query(
          `UPDATE jarvis_memory SET embedding = $1::vector WHERE id = $2`,
          [vectorStr, row.id]
        );
        processed++;
      } catch (e) {
        console.error(`Error embedding memory ${row.id}:`, e);
      }
    }
    return res.json({ ok: true, processed, remaining: result.rows.length - processed });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function execute(req, res) {
  try {
    const { instruction } = req.body;

    if (!instruction) {
      return res.status(400).json({ ok: false, error: "instruction_required" });
    }

    const intent = instruction.toLowerCase();
    let result = null;

    if (intent.includes("noticia") || intent.includes("puerto rico")) {
      const response = await fetch(`https://newsapi.org/v2/everything?q=puerto%20rico&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`);
      const data = await response.json();

      result = data.articles.map(a => ({
        title: a.title,
        source: a.source.name,
        url: a.url
      }));
    }

    if (!result) {
      result = { message: "No tool matched yet" };
    }

    return res.json({ ok: true, result });

  } catch (err) {
    console.error("JARVIS_EXECUTE_ERROR", err);
    return res.status(500).json({ ok: false, error: "execute_failed" });
  }
}

async function health(req, res) {
  return res.json({ ok: true, module: "jarvis", status: "online", version: "3.0-groq-fallback", providers: { groq: !!process.env.GROQ_API_KEY, openai: !!process.env.OPENAI_API_KEY } });
}

module.exports = { chat, execute, saveMemory, getMemory, health, embedExistingMemory, callAI, callAIMini };
