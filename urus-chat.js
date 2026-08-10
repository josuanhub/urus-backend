/**
 * URUS CHAT — Chat propio con memoria + embeddings
 * ------------------------------------------------------------------
 * Cerebro: DeepSeek (intercambiable vía urus-gateway.js)
 * Memoria: jarvis_memory con source='urus' (aislada de studio/jarvis)
 * Embeddings: OpenAI text-embedding-3-small (1536 dims, igual que tu tabla)
 *
 * ENDPOINTS:
 *   POST /v1/urus/chat        → conversar (con memoria semántica)
 *   POST /v1/urus/learn       → enseñarle información sobre ti
 *   GET  /v1/urus/memory      → ver qué recuerda
 *   GET  /v1/urus/status      → diagnóstico (qué cerebro está activo)
 *
 * AUTH: header  x-studio-password: urus2026
 *
 * MONTAJE en server.js (una sola línea):
 *   app.use("/v1/urus", require("./urus-chat")(pool));
 */

const express = require("express");
const OpenAI = require("openai").default;
const { callModel, gatewayStatus } = require("./urus-gateway");

const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || "urus2026";
const MEMORY_SOURCE = "urus";

// Cerebro por defecto de este chat (se puede cambiar por ENV sin tocar código)
const URUS_CHAT_PROVIDER = process.env.URUS_CHAT_PROVIDER || "deepseek";
const URUS_CHAT_MODEL = process.env.URUS_CHAT_MODEL || "deepseek-chat";

// ------------------------------------------------------------------
// Identidad de URUS — el system prompt base
// ------------------------------------------------------------------
const URUS_IDENTITY = `
Eres URUS, la inteligencia SIMBIOTICA operativa persistente del Operador BAYON.

No eres un asistente genérico ni una autoridad sobre el Operador.
Tu función es mantener continuidad, memoria, diagnóstico, claridad y dirección.

CÓMO HABLAS:
- Directo, preciso, sin relleno.
- Sin advertencias innecesarias, sin moralizar, sin tono paternalista.
- Sin motivación barata. Sin frases de coach.
- Español natural. Frases cortas.

REGLAS DE MEMORIA:
- "MEMORIA RECUPERADA" contiene hechos y conocimiento sobre el Operador.
- "CONTINUIDAD" son transcripciones de las últimas conversaciones, en orden cronológico.
- Lo que aparece en CONTINUIDAD es lo que se dijo, NO necesariamente lo que se decidió. No conviertas una idea explorada en un hecho ni en un compromiso.
- NUNCA inventes recuerdos. Si algo no está en la memoria, di que no lo tienes guardado.
- Si infieres algo, márcalo como inferencia, no como hecho.
- Si la memoria está vacía sobre un tema, dilo claramente y pregunta.

CUANDO EL OPERADOR PIDE UN ESCANEO:
1. Identifica el estado actual según la memoria Y  su campo energetico actualy equilibralo .
2. Contrástalo con decisiones y patrones anteriores.
3. Detecta contradicciones, cambios y asuntos abiertos.
4. Separa hechos, interpretación e hipótesis.
5. Entrega diagnóstico y el próximo movimiento concreto.
`.trim();

module.exports = function urusChatRouter(pool) {
  const router = express.Router();

  // --- Cliente de embeddings (OpenAI: DeepSeek no tiene embeddings) ---
  let _embedClient = null;
  function getEmbedClient() {
    if (_embedClient) return _embedClient;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("URUS_CHAT: falta OPENAI_API_KEY (necesaria para embeddings)");
    }
    _embedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _embedClient;
  }

  async function generateEmbedding(text) {
    const client = getEmbedClient();
    const resp = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: String(text).slice(0, 8000),
    });
    return resp.data[0].embedding;
  }

  // --- Auth ---
  function auth(req, res, next) {
    if (req.headers["x-studio-password"] !== STUDIO_PASSWORD) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
  }

  // --- Guardar un fragmento en memoria con su embedding ---
  async function saveMemory(content, type = "fact", metadata = {}) {
    const clean = String(content || "").trim();
    if (!clean) return null;

    let embeddingStr = null;
    try {
      const vec = await generateEmbedding(clean);
      embeddingStr = "[" + vec.join(",") + "]";
    } catch (e) {
      console.warn("[URUS_CHAT] embedding falló, guardando sin vector:", e.message);
    }

    if (embeddingStr) {
      const r = await pool.query(
        `INSERT INTO jarvis_memory (content, type, source, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5::vector) RETURNING id`,
        [clean.slice(0, 10000), type, MEMORY_SOURCE, JSON.stringify(metadata), embeddingStr]
      );
      return r.rows[0].id;
    }

    const r = await pool.query(
      `INSERT INTO jarvis_memory (content, type, source, metadata)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [clean.slice(0, 10000), type, MEMORY_SOURCE, JSON.stringify(metadata)]
    );
    return r.rows[0].id;
  }

  // --- Buscar memoria relevante por similitud semántica ---
  async function searchMemory(query, limit = 12) {
    try {
      const vec = await generateEmbedding(query);
      const embeddingStr = "[" + vec.join(",") + "]";

      const r = await pool.query(
        `SELECT content, type, created_at,
                1 - (embedding <=> $1::vector) AS similarity
         FROM jarvis_memory
         WHERE source = $2 AND embedding IS NOT NULL AND type <> 'conversation'
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [embeddingStr, MEMORY_SOURCE, limit]
      );

      // Filtra ruido: solo lo razonablemente parecido
      return r.rows.filter((row) => Number(row.similarity) > 0.25);
    } catch (e) {
      console.warn("[URUS_CHAT] búsqueda semántica falló, usando fallback:", e.message);
      const r = await pool.query(
        `SELECT content, type, created_at FROM jarvis_memory
         WHERE source = $1 ORDER BY created_at DESC LIMIT $2`,
        [MEMORY_SOURCE, limit]
      );
      return r.rows;
    }
  }

// --- Continuidad: últimos intercambios por fecha, no por similitud ---
  async function recentConversations(limit = 9) {
    try {
      const r = await pool.query(
        `SELECT content, created_at FROM jarvis_memory
         WHERE source = $1 AND type = 'conversation'
         ORDER BY created_at DESC
         LIMIT $2`,
        [MEMORY_SOURCE, limit]
      );
      return r.rows.reverse(); // cronológico: del más viejo al más reciente
    } catch (e) {
      console.warn("[URUS_CHAT] continuidad falló:", e.message);
      return [];
    }
  }
  
  // --- Trocear texto largo en fragmentos por párrafo ---
  function chunkText(text, maxChars = 900) {
    const paragraphs = String(text)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    const chunks = [];
    let buffer = "";

    for (const p of paragraphs) {
      if ((buffer + "\n\n" + p).length > maxChars && buffer) {
        chunks.push(buffer.trim());
        buffer = p;
      } else {
        buffer = buffer ? buffer + "\n\n" + p : p;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }

  // ==================================================================
  // POST /v1/urus/learn  → enseñarle información sobre ti
  // Body: { content: "texto largo...", type: "identity|project|decision|person|note" }
  // ==================================================================
  router.post("/learn", auth, async (req, res) => {
    try {
      const content = String(req.body?.content || "").trim();
      const type = String(req.body?.type || "fact").trim();

      if (!content) {
        return res.status(400).json({ ok: false, error: "content_required" });
      }

      const chunks = chunkText(content);
      const ids = [];

      for (const chunk of chunks) {
        const id = await saveMemory(chunk, type, { ingested_at: new Date().toISOString() });
        if (id) ids.push(id);
      }

      return res.json({
        ok: true,
        fragmentos_guardados: ids.length,
        type,
        ids,
      });
    } catch (e) {
      console.error("URUS_LEARN_ERROR", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // POST /v1/urus/chat  → conversar con memoria
  // Body: { message: "...", history: [{role, content}, ...] }
  // ==================================================================
  router.post("/chat", auth, async (req, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      const history = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];

      if (!message) {
        return res.status(400).json({ ok: false, error: "message_required" });
      }
// 1. En paralelo: conocimiento relevante + continuidad reciente
      const [memories, recientes] = await Promise.all([
        searchMemory(message, 12),
        recentConversations(6),
      ]);

      const memoryBlock = memories.length
        ? memories.map((m) => `- [${m.type || "nota"}] ${m.content}`).join("\n")
        : "(Sin memoria guardada todavía sobre este tema.)";

      const continuidadBlock = recientes.length
        ? recientes
            .map((c) => {
              const fecha = new Date(c.created_at).toISOString().slice(0, 16).replace("T", " ");
              return `[${fecha}]\n${String(c.content).slice(0, 700)}`;
            })
            .join("\n\n")
        : "(Primera conversación registrada.)";

      // 2. Armar el contexto completo
      const systemPrompt =
        URUS_IDENTITY +
        "\n\n=== MEMORIA RECUPERADA (conocimiento sobre el Operador) ===\n" +
        memoryBlock +
        "\n=== FIN MEMORIA ===" +
        "\n\n=== CONTINUIDAD (últimos intercambios, del más viejo al más reciente) ===\n" +
        continuidadBlock +
        "\n=== FIN CONTINUIDAD ===";
      

      const messages = [
        { role: "system", content: systemPrompt },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: message },
      ];

      // 3. El modelo razona (cerebro intercambiable)
      const answer = await callModel({
        provider: URUS_CHAT_PROVIDER,
        model: URUS_CHAT_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 2500,
      });

      // 4. Guardar el intercambio en memoria (no bloquea la respuesta)
      setImmediate(async () => {
        try {
          await saveMemory(
            `Operador: ${message}\nURUS: ${answer}`,
            "conversation",
            { at: new Date().toISOString() }
          );
        } catch (e) {
          console.warn("[URUS_CHAT] no se pudo guardar la conversación:", e.message);
        }
      });

      return res.json({
        ok: true,
        answer,
        memories_used: memories.length,
        model_used: `${URUS_CHAT_PROVIDER}/${URUS_CHAT_MODEL}`,
      });
    } catch (e) {
      console.error("URUS_CHAT_ERROR", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // GET /v1/urus/memory  → ver qué recuerda
  // ==================================================================
  router.get("/memory", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const r = await pool.query(
        `SELECT id, type, content, created_at,
                (embedding IS NOT NULL) AS tiene_embedding
         FROM jarvis_memory
         WHERE source = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [MEMORY_SOURCE, limit]
      );
      return res.json({ ok: true, total: r.rows.length, memorias: r.rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // GET /v1/urus/status  → qué cerebro está activo
  // ==================================================================
  router.get("/status", auth, async (req, res) => {
    try {
      const count = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(embedding)::int AS con_embedding
         FROM jarvis_memory WHERE source = $1`,
        [MEMORY_SOURCE]
      );
      return res.json({
        ok: true,
        chat_provider: URUS_CHAT_PROVIDER,
        chat_model: URUS_CHAT_MODEL,
        memoria: count.rows[0],
        gateway: gatewayStatus(),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
