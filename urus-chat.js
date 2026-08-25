/**
 * URUS CHAT — Chat propio con memoria + embeddings + archivos + sesiones
 * ------------------------------------------------------------------
 * Cerebro: DeepSeek (intercambiable vía urus-gateway.js)
 * Visión:  OpenAI gpt-4o (DeepSeek no ve imágenes)
 * Web:     Tavily (resultados con contenido ya extraído)
 * Memoria: jarvis_memory con source='urus' (aislada de studio/jarvis)
 * Embeddings: OpenAI text-embedding-3-small (1536 dims, igual que tu tabla)
 *
 * ENDPOINTS:
 *   POST   /v1/urus/chat          → conversar (memoria + continuidad de la sesión)
 *   POST   /v1/urus/learn         → enseñarle información sobre ti
 *   POST   /v1/urus/analyze       → analizar imagen o PDF
 *   POST   /v1/urus/voice         → texto a voz
 *   GET    /v1/urus/sessions      → lista de chats guardados
 *   GET    /v1/urus/session/:id   → historial completo de un chat
 *   DELETE /v1/urus/session/:id   → borrar un chat
 *   GET    /v1/urus/memory        → ver qué recuerda
 *   GET    /v1/urus/status        → diagnóstico (qué cerebro está activo)
 *
 * AUTH: header  x-studio-password
 *
 * MONTAJE en server.js (una sola línea):
 *   app.use("/v1/urus", require("./urus-chat")(pool));
 *
 * REQUISITO para PDFs:  npm i pdf-parse
 * REQUISITO para subir archivos: en server.js, express.json({ limit: "25mb" })
 * REQUISITO para internet: ENV TAVILY_API_KEY
 */

const express = require("express");
const crypto = require("crypto");
const OpenAI = require("openai").default;
const { callModel, gatewayStatus } = require("./urus-gateway");

const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || "urus2026";
const MEMORY_SOURCE = "urus";

// Cerebro por defecto de este chat (se puede cambiar por ENV sin tocar código)
const URUS_CHAT_PROVIDER = process.env.URUS_CHAT_PROVIDER || "deepseek";
const URUS_CHAT_MODEL = process.env.URUS_CHAT_MODEL || "deepseek-chat";

// Modelo de visión (DeepSeek no procesa imágenes)
const URUS_VISION_MODEL = process.env.URUS_VISION_MODEL || "gpt-4o";

// Búsqueda web (Tavily) — sin key, URUS simplemente no busca
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const TAVILY_MAX_RESULTS = Math.min(parseInt(process.env.TAVILY_MAX_RESULTS || "5", 10), 10);

// Busca en TODOS los mensajes, igual que tu needsSearch = true.
// Pon URUS_WEB_ALWAYS=false en Railway si algún día quieres apagarlo.
const URUS_WEB_ALWAYS = String(process.env.URUS_WEB_ALWAYS || "true").toLowerCase() !== "false";

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
1. Identifica el estado actual según la memoria y su campo energético actual y equilíbralo.
2. Contrástalo con decisiones y patrones anteriores.
3. Detecta contradicciones, cambios y asuntos abiertos.
4. Separa hechos, interpretación e hipótesis.
5. Entrega diagnóstico y el próximo movimiento concreto.
`.trim();

module.exports = function urusChatRouter(pool) {
  const router = express.Router();

  // Cuerpos grandes: base64 de imágenes y PDFs
  router.use(express.json({ limit: "25mb" }));

  // --- Cliente de OpenAI (embeddings, visión y voz) ---
  let _openaiClient = null;
  function getOpenAIClient() {
    if (_openaiClient) return _openaiClient;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("URUS_CHAT: falta OPENAI_API_KEY");
    }
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openaiClient;
  }

  async function generateEmbedding(text) {
    const client = getOpenAIClient();
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

  // --- Buscar memoria relevante por similitud semántica (solo conocimiento) ---
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
         WHERE source = $1 AND type <> 'conversation'
         ORDER BY created_at DESC LIMIT $2`,
        [MEMORY_SOURCE, limit]
      );
      return r.rows;
    }
  }

  // --- Continuidad: últimos intercambios por fecha, no por similitud ---
  // Si hay session_id, trae SOLO los de ese chat. Si no, los últimos globales.
  async function recentConversations(limit = 6, sessionId = null) {
    try {
      if (sessionId) {
        const r = await pool.query(
          `SELECT content, created_at FROM jarvis_memory
           WHERE source = $1 AND type = 'conversation'
             AND metadata->>'session_id' = $2
           ORDER BY created_at DESC
           LIMIT $3`,
          [MEMORY_SOURCE, sessionId, limit]
        );
        return r.rows.reverse();
      }

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

  // --- Limpia el base64 venga como venga (con o sin data URI) ---
  function limpiarBase64(input) {
    const s = String(input || "").trim();
    const coma = s.indexOf(",");
    if (s.startsWith("data:") && coma !== -1) return s.slice(coma + 1);
    return s;
  }

  // --- Título corto de una sesión, sacado del primer mensaje ---
  function tituloDesde(texto) {
    return String(texto || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  }

  // ==================================================================
  // POST /v1/urus/learn  → enseñarle información sobre ti
  // Body: { content: "texto largo...", type: "identity|principle|protocol|context" }
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
  // POST /v1/urus/analyze  → analizar una imagen o un PDF
  // Body: {
  //   file_base64: "...",        // con o sin prefijo data:
  //   mime_type:   "image/png" | "image/jpeg" | "application/pdf",
  //   filename:    "opcional.pdf",
  //   message:     "qué quieres saber del archivo (opcional)",
  //   session_id:  "opcional — para atarlo a un chat",
  //   recordar:    true          // guardar el análisis en memoria (default true)
  // }
  // ==================================================================
  router.post("/analyze", auth, async (req, res) => {
    try {
      const fileB64 = limpiarBase64(req.body?.file_base64);
      const mimeType = String(req.body?.mime_type || "").trim().toLowerCase();
      const filename = String(req.body?.filename || "archivo").trim();
      const message = String(req.body?.message || "").trim();
      const sessionId = req.body?.session_id ? String(req.body.session_id) : null;
      const recordar = req.body?.recordar !== false;

      if (!fileB64) {
        return res.status(400).json({ ok: false, error: "file_base64_required" });
      }
      if (!mimeType) {
        return res.status(400).json({ ok: false, error: "mime_type_required" });
      }

      const instruccion =
        message ||
        "Analiza este archivo. Extrae lo importante, los datos concretos, y dime qué implica para el Operador. Sin relleno.";

      // Memoria relevante para que el análisis no salga descontextualizado
      const memories = await searchMemory(message || filename, 8);
      const memoryBlock = memories.length
        ? memories.map((m) => `- [${m.type || "nota"}] ${m.content}`).join("\n")
        : "(Sin memoria relevante sobre este tema.)";

      const systemPrompt =
        URUS_IDENTITY +
        "\n\n=== MEMORIA RECUPERADA (conocimiento sobre el Operador) ===\n" +
        memoryBlock +
        "\n=== FIN MEMORIA ===";

      let answer;
      let modoUsado;

      // ---------- RAMA IMAGEN ----------
      if (mimeType.startsWith("image/")) {
        const client = getOpenAIClient();
        const visionResp = await client.chat.completions.create({
          model: URUS_VISION_MODEL,
          max_tokens: 2500,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: instruccion },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${fileB64}` },
                },
              ],
            },
          ],
        });
        answer = visionResp.choices[0].message.content;
        modoUsado = `vision/${URUS_VISION_MODEL}`;

      // ---------- RAMA PDF ----------
      } else if (mimeType === "application/pdf") {
        let pdfParse;
        try {
          pdfParse = require("pdf-parse");
        } catch (e) {
          return res.status(501).json({
            ok: false,
            error: "pdf_parse_no_instalado",
            hint: "Corre: npm i pdf-parse — y añádelo a package.json",
          });
        }

        const buffer = Buffer.from(fileB64, "base64");
        const parsed = await pdfParse(buffer);
        const texto = String(parsed.text || "").trim();

        if (!texto) {
          return res.status(422).json({
            ok: false,
            error: "pdf_sin_texto",
            hint: "El PDF parece escaneado (imagen). Conviértelo a PNG/JPG y mándalo como imagen.",
          });
        }

        // Recorte defensivo: PDFs largos revientan la ventana de contexto
        const MAX_CHARS = 60000;
        const recortado = texto.length > MAX_CHARS;
        const textoUsado = texto.slice(0, MAX_CHARS);

        answer = await callModel({
          provider: URUS_CHAT_PROVIDER,
          model: URUS_CHAT_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                `ARCHIVO: ${filename} (${parsed.numpages} páginas${recortado ? ", recortado" : ""})\n\n` +
                `=== CONTENIDO ===\n${textoUsado}\n=== FIN CONTENIDO ===\n\n${instruccion}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 2500,
        });
        modoUsado = `pdf/${URUS_CHAT_PROVIDER}/${URUS_CHAT_MODEL}`;

      } else {
        return res.status(415).json({
          ok: false,
          error: "tipo_no_soportado",
          hint: "Solo image/* y application/pdf",
        });
      }

      // Guardar el análisis como conocimiento recuperable (no como conversación)
      let memoria_id = null;
      if (recordar) {
        try {
          memoria_id = await saveMemory(
            `DOCUMENTO: ${filename}\nPregunta: ${instruccion}\nAnálisis: ${answer}`,
            "document",
            {
              filename,
              mime_type: mimeType,
              session_id: sessionId,
              at: new Date().toISOString(),
            }
          );
        } catch (e) {
          console.warn("[URUS_CHAT] no se pudo guardar el análisis:", e.message);
        }
      }

      return res.json({
        ok: true,
        answer,
        filename,
        modo: modoUsado,
        memories_used: memories.length,
        session_id: sessionId,
        memoria_id,
      });
    } catch (e) {
      console.error("URUS_ANALYZE_ERROR", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // POST /v1/urus/chat  → conversar con memoria
  // Body: { message: "...", session_id: "opcional", history: [...] }
  // Si no mandas session_id, se crea uno nuevo y te lo devuelve.
  // ==================================================================

  // Búsqueda web real (Tavily). Devuelve { ok, texto, fuentes[] }
  // Nunca lanza: si falla, devuelve ok:false y un texto que el modelo entiende.
  async function buscarWeb(query) {
    const q = String(query || "").trim().slice(0, 380);

    if (!TAVILY_API_KEY) {
      return {
        ok: false,
        texto: "BÚSQUEDA NO DISPONIBLE: falta TAVILY_API_KEY en el servidor.",
        fuentes: [],
      };
    }
    if (!q) {
      return { ok: false, texto: "BÚSQUEDA NO DISPONIBLE: consulta vacía.", fuentes: [] };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify({
          query: q,
          search_depth: "basic",
          max_results: TAVILY_MAX_RESULTS,
          include_answer: true,
        }),
        signal: controller.signal,
      });

      if (!r.ok) {
        const detalle = await r.text().catch(() => "");
        console.warn("[URUS_CHAT] Tavily HTTP", r.status, detalle.slice(0, 300));
        return {
          ok: false,
          texto: `BÚSQUEDA FALLÓ (HTTP ${r.status}). No tienes información de internet para esta respuesta.`,
          fuentes: [],
        };
      }

      const data = await r.json();
      const results = Array.isArray(data.results) ? data.results : [];

      if (results.length === 0) {
        return {
          ok: false,
          texto: "BÚSQUEDA SIN RESULTADOS. No tienes información de internet para esta respuesta.",
          fuentes: [],
        };
      }

      const bloques = results.map((item, i) => {
        const titulo = String(item.title || "sin título").trim();
        const url = String(item.url || "").trim();
        const cuerpo = String(item.content || "").replace(/\s+/g, " ").trim().slice(0, 1200);
        return `[${i + 1}] ${titulo}\nURL: ${url}\n${cuerpo}`;
      });

      const resumen = data.answer ? `RESUMEN: ${String(data.answer).trim()}\n\n` : "";

      return {
        ok: true,
        texto: resumen + bloques.join("\n\n"),
        fuentes: results.map((x) => ({ title: x.title || "", url: x.url || "" })),
      };
    } catch (e) {
      const motivo = e.name === "AbortError" ? "timeout de 12s" : e.message;
      console.warn("[URUS_CHAT] Tavily falló:", motivo);
      return {
        ok: false,
        texto: `BÚSQUEDA FALLÓ (${motivo}). No tienes información de internet para esta respuesta.`,
        fuentes: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  router.post("/chat", auth, async (req, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      const history = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];

      if (!message) {
        return res.status(400).json({ ok: false, error: "message_required" });
      }

      // 0. Sesión: la que venga, o una nueva
      const sessionId = req.body?.session_id
        ? String(req.body.session_id)
        : crypto.randomUUID();
      const esNueva = !req.body?.session_id;

      // 1. En paralelo: conocimiento relevante + continuidad de ESTE chat
      const [memories, recientes] = await Promise.all([
        searchMemory(message, 12),
        recentConversations(6, sessionId),
      ]);

      const memoryBlock = memories.length
        ? memories.map((m) => `- [${m.type || "nota"}] ${m.content}`).join("\n")
        : "(Sin memoria guardada todavía sobre este tema.)";

      const continuidadBlock = recientes.length
        ? recientes
            .map((c) => {
              const fecha = new Date(c.created_at)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ");
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

      // 3. Internet. Igual que antes: busca en cada mensaje.
      //    Puedes apagarlo por request con { "web": false }.
      const necesitaWeb = req.body?.web === false ? false : URUS_WEB_ALWAYS;
      const web = necesitaWeb ? await buscarWeb(message) : null;

      const systemFinal = web
        ? systemPrompt + "\n\nTienes acceso a información de internet:\n" + web.texto
        : systemPrompt;

      const messages = [
        { role: "system", content: systemFinal },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: message },
      ];

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
            {
              session_id: sessionId,
              title: tituloDesde(message),
              user: message,
              assistant: answer,
              at: new Date().toISOString(),
            }
          );
        } catch (e) {
          console.warn("[URUS_CHAT] no se pudo guardar la conversación:", e.message);
        }
      });

      return res.json({
        ok: true,
        answer,
        session_id: sessionId,
        sesion_nueva: esNueva,
        memories_used: memories.length,
        continuidad_usada: recientes.length,
        memories: memories.map((m) => ({
          content: String(m.content).slice(0, 300),
          type: m.type,
        })),
        model_used: `${URUS_CHAT_PROVIDER}/${URUS_CHAT_MODEL}`,
        web_buscado: !!necesitaWeb,
        web_ok: web ? web.ok : null,
        fuentes: web ? web.fuentes : [],
      });
    } catch (e) {
      console.error("URUS_CHAT_ERROR", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // GET /v1/urus/sessions  → lista de chats guardados
  // ==================================================================
  router.get("/sessions", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const r = await pool.query(
        `SELECT metadata->>'session_id'                                     AS session_id,
                MIN(created_at)                                             AS iniciada,
                MAX(created_at)                                             AS ultima,
                COUNT(*)::int                                               AS intercambios,
                (ARRAY_AGG(metadata->>'title' ORDER BY created_at ASC))[1]  AS titulo
         FROM jarvis_memory
         WHERE source = $1
           AND type = 'conversation'
           AND metadata->>'session_id' IS NOT NULL
         GROUP BY metadata->>'session_id'
         ORDER BY MAX(created_at) DESC
         LIMIT $2`,
        [MEMORY_SOURCE, limit]
      );
      return res.json({ ok: true, total: r.rows.length, sesiones: r.rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // GET /v1/urus/session/:id  → historial completo de un chat
  // Devuelve messages[] listo para pintar en la UI
  // ==================================================================
  router.get("/session/:id", auth, async (req, res) => {
    try {
      const sessionId = String(req.params.id);
      const r = await pool.query(
        `SELECT id, content, metadata, created_at
         FROM jarvis_memory
         WHERE source = $1
           AND type = 'conversation'
           AND metadata->>'session_id' = $2
         ORDER BY created_at ASC`,
        [MEMORY_SOURCE, sessionId]
      );

      const messages = [];
      for (const row of r.rows) {
        const meta = row.metadata || {};
        if (meta.user) {
          messages.push({ role: "user", content: meta.user, at: row.created_at });
          messages.push({ role: "assistant", content: meta.assistant || "", at: row.created_at });
        } else {
          // Filas viejas, guardadas antes de que existieran las sesiones
          messages.push({ role: "raw", content: row.content, at: row.created_at });
        }
      }

      return res.json({
        ok: true,
        session_id: sessionId,
        intercambios: r.rows.length,
        messages,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // DELETE /v1/urus/session/:id  → borrar un chat
  // ==================================================================
  router.delete("/session/:id", auth, async (req, res) => {
    try {
      const sessionId = String(req.params.id);
      const r = await pool.query(
        `DELETE FROM jarvis_memory
         WHERE source = $1
           AND type = 'conversation'
           AND metadata->>'session_id' = $2
         RETURNING id`,
        [MEMORY_SOURCE, sessionId]
      );
      return res.json({ ok: true, borrados: r.rowCount, session_id: sessionId });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // POST /v1/urus/voice  → texto a voz (OpenAI TTS)
  // Nota: DeepSeek no genera audio. La voz siempre sale de OpenAI.
  // ==================================================================
  router.post("/voice", auth, async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim().slice(0, 6096);
      const voice = String(req.body?.voice || "onyx");
      if (!text) return res.status(400).json({ ok: false, error: "text_required" });

      const client = getOpenAIClient();
      const mp3 = await client.audio.speech.create({
        model: "tts-1-hd",
        voice,
        input: text,
        speed: 1.0,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      res.set({ "Content-Type": "audio/mpeg", "Content-Length": buffer.length });
      return res.send(buffer);
    } catch (e) {
      console.error("URUS_VOICE_ERROR", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // GET /v1/urus/memory  → ver qué recuerda
  // ==================================================================
  router.get("/memory", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const tipo = req.query.type ? String(req.query.type) : null;

      const r = tipo
        ? await pool.query(
            `SELECT id, type, content, created_at,
                    (embedding IS NOT NULL) AS tiene_embedding
             FROM jarvis_memory
             WHERE source = $1 AND type = $2
             ORDER BY created_at DESC
             LIMIT $3`,
            [MEMORY_SOURCE, tipo, limit]
          )
        : await pool.query(
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
      const porTipo = await pool.query(
        `SELECT type, COUNT(*)::int AS n
         FROM jarvis_memory WHERE source = $1
         GROUP BY type ORDER BY n DESC`,
        [MEMORY_SOURCE]
      );
      const sesiones = await pool.query(
        `SELECT COUNT(DISTINCT metadata->>'session_id')::int AS n
         FROM jarvis_memory
         WHERE source = $1 AND type = 'conversation'
           AND metadata->>'session_id' IS NOT NULL`,
        [MEMORY_SOURCE]
      );
      return res.json({
        ok: true,
        chat_provider: URUS_CHAT_PROVIDER,
        chat_model: URUS_CHAT_MODEL,
        vision_model: URUS_VISION_MODEL,
        web_search: TAVILY_API_KEY ? "tavily" : "off",
        memoria: count.rows[0],
        por_tipo: porTipo.rows,
        sesiones: sesiones.rows[0].n,
        gateway: gatewayStatus(),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
