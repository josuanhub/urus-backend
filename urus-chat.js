/**
 * URUS CHAT — Chat propio con memoria + embeddings + archivos + sesiones  (v2: memoria total)
 * ------------------------------------------------------------------
 * Cerebro: DeepSeek (intercambiable vía urus-gateway.js) con respaldo automático de modelos
 * Visión:  OpenAI gpt-4o (DeepSeek no ve imágenes)
 * Web:     Tavily (resultados con contenido ya extraído)
 * Memoria: jarvis_memory con source='urus' (aislada de studio/jarvis)
 * Embeddings: OpenAI text-embedding-3-small (1536 dims, igual que tu tabla)
 *
 * NOVEDAD v2 — la memoria ya no depende de que OpenAI funcione (ver urus-recall.js):
 *   NÚCLEO (siempre presente) + SABER (relevante) + PASADO (conversaciones antiguas relevantes).
 *   Si los embeddings fallan, busca por palabras en español dentro de tu propia base de datos.
 *
 * ENDPOINTS:
 *   POST   /v1/urus/chat             → conversar (núcleo + memoria + pasado + continuidad)
 *   POST   /v1/urus/learn            → enseñarle información sobre ti  (pinned:true la fija en el núcleo)
 *   POST   /v1/urus/analyze          → analizar imagen o PDF
 *   POST   /v1/urus/voice            → texto a voz
 *   GET    /v1/urus/sessions         → lista de chats guardados
 *   GET    /v1/urus/session/:id      → historial completo de un chat
 *   DELETE /v1/urus/session/:id      → borrar un chat
 *   GET    /v1/urus/memory           → ver qué recuerda
 *   GET    /v1/urus/memory/health    → estado de la memoria (¿embeddings vivos? ¿cuántos sin huella?)   [NUEVO]
 *   POST   /v1/urus/memory/backfill  → calcular embeddings de lo que quedó sin ellos                    [NUEVO]
 *   POST   /v1/urus/pin              → fijar / desfijar un recuerdo en el núcleo                         [NUEVO]
 *   GET    /v1/urus/status           → diagnóstico (qué cerebro está activo)
 *
 * AUTH: header  x-studio-password
 *
 * MONTAJE en server.js (ya lo tienes):
 *   app.use("/v1/urus", require("./urus-chat")(pool));
 *
 * ENV opcionales nuevas:
 *   URUS_CORE_MAX_CHARS   (default 6000)  tamaño máximo del núcleo que se inyecta en cada mensaje
 *   URUS_CHAT_FALLBACKS   ej: "deepseek:deepseek-v4-flash,groq:openai/gpt-oss-120b"  (si no, usa ese mismo respaldo)
 */

const express = require("express");
const crypto = require("crypto");
const OpenAI = require("openai").default;
const { callModel, gatewayStatus } = require("./urus-gateway");
const { createRecall } = require("./urus-recall");

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

// Tamaño máximo del NÚCLEO que se inyecta en cada mensaje
const CORE_MAX_CHARS = Math.min(Math.max(parseInt(process.env.URUS_CORE_MAX_CHARS || "6000", 10) || 6000, 1000), 20000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
- "NÚCLEO" es lo fundamental sobre el Operador y está siempre presente. Tómalo como verdad de fondo; no lo recites literal.
- "MEMORIA RECUPERADA" contiene hechos y conocimiento sobre el Operador, relacionados con este mensaje.
- "CONVERSACIONES PASADAS" son charlas antiguas relevantes. Lo dicho ahí no es necesariamente lo decidido.
- "CONTINUIDAD" son transcripciones de las últimas conversaciones, en orden cronológico.
- Lo que aparece en CONTINUIDAD es lo que se dijo, NO necesariamente lo que se decidió. No conviertas una idea explorada en un hecho ni en un compromiso.
- NUNCA inventes recuerdos. Si algo no está en la memoria, di que no lo tienes guardado.
- Si hay un "AVISO DEL SISTEMA" sobre la memoria, respétalo: significa que la búsqueda pudo quedar incompleta.
- Si infieres algo, márcalo como inferencia, no como hecho.
- Si la memoria está vacía sobre un tema, dilo claramente y pregunta.

CUANDO EL OPERADOR PIDE UN ESCANEO:
1. Identifica el estado actual según la memoria y su campo energético actual y equilíbralo.
2. Contrástalo con decisiones y patrones anteriores.
3. Detecta contradicciones, cambios y asuntos abiertos.
4. Separa hechos, interpretación e hipótesis.
5. Entrega diagnóstico y el próximo movimiento concreto.
`.trim();

function withTimeout(promise, ms, label) {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`timeout ${Math.round(ms / 1000)}s en ${label}`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

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

  // --- Recuperación de memoria (núcleo + saber + pasado) ---
  const recall = createRecall({
    pool,
    embed: generateEmbedding,
    source: MEMORY_SOURCE,
    coreMaxChars: CORE_MAX_CHARS,
  });

  // --- Respaldo de modelos: si el principal falla, prueba el siguiente ---
  let _groqClient = null;
  function groqKey() { return process.env.STUDIO_GROQ_KEY || process.env.GROQ_API_KEY || ""; }
  function getGroqClient() {
    if (_groqClient) return _groqClient;
    _groqClient = new OpenAI({ apiKey: groqKey(), baseURL: "https://api.groq.com/openai/v1", timeout: 60000, maxRetries: 1 });
    return _groqClient;
  }

  function buildChain() {
    const chain = [{ provider: URUS_CHAT_PROVIDER, model: URUS_CHAT_MODEL }];
    const extra = String(process.env.URUS_CHAT_FALLBACKS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (extra.length) {
      for (const e of extra) {
        const i = e.indexOf(":");
        if (i > 0) chain.push({ provider: e.slice(0, i), model: e.slice(i + 1) });
      }
    } else {
      // Respaldo por defecto: el nombre nuevo de DeepSeek (por si el alias viejo se retira) y luego Groq
      if (URUS_CHAT_PROVIDER === "deepseek" && URUS_CHAT_MODEL !== "deepseek-v4-flash") {
        chain.push({ provider: "deepseek", model: "deepseek-v4-flash" });
      }
      chain.push({ provider: "groq", model: "openai/gpt-oss-120b" });
    }
    return chain;
  }

  async function chatModel({ messages, temperature = 0.6, max_tokens = 2500 }) {
    const errors = [];
    for (const c of buildChain()) {
      try {
        let text;
        if (c.provider === "groq") {
          if (!groqKey()) { errors.push("groq: sin API key"); continue; }
          const r = await withTimeout(
            getGroqClient().chat.completions.create({ model: c.model, messages, temperature, max_tokens }),
            90000, "groq/" + c.model
          );
          text = String(r?.choices?.[0]?.message?.content || "").trim();
        } else {
          text = await withTimeout(
            callModel({ provider: c.provider, model: c.model, messages, temperature, max_tokens }),
            90000, c.provider + "/" + c.model
          );
        }
        if (text) return { text, provider: c.provider, model: c.model, fallback: errors.length > 0 };
        errors.push(`${c.provider}/${c.model}: respuesta vacía`);
      } catch (e) {
        errors.push(`${c.provider}/${c.model}: ${String(e.message || e).slice(0, 120)}`);
        console.warn(`[URUS_CHAT] ${c.provider}/${c.model} falló:`, String(e.message || e).slice(0, 160));
      }
    }
    throw new Error("Ningún modelo respondió: " + errors.join(" | ").slice(0, 400));
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

  // --- Buscar memoria relevante (núcleo + saber). Se usa en /analyze. ---
  async function searchMemory(query, limit = 12) {
    try {
      const rec = await recall.recall({ message: query, limits: { knowledge: limit, past: 0 } });
      return [...rec.core, ...rec.knowledge];
    } catch (e) {
      console.warn("[URUS_CHAT] búsqueda de memoria falló:", e.message);
      return [];
    }
  }

  // --- Continuidad: últimos intercambios por fecha, no por similitud ---
  // Si hay session_id, trae SOLO los de ese chat. Si no, los últimos globales.
  async function recentConversations(limit = 6, sessionId = null) {
    try {
      if (sessionId) {
        const r = await pool.query(
          `SELECT id, content, created_at FROM jarvis_memory
           WHERE source = $1 AND type = 'conversation'
             AND metadata->>'session_id' = $2
           ORDER BY created_at DESC
           LIMIT $3`,
          [MEMORY_SOURCE, sessionId, limit]
        );
        return r.rows.reverse();
      }

      const r = await pool.query(
        `SELECT id, content, created_at FROM jarvis_memory
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

  // --- Extrae hechos duraderos de lo que dijo el Operador y los guarda ---
  async function extraerYGuardarHechos(message, sessionId) {
    try {
      const texto = String(message || "").trim();
      if (texto.length < 15) return; // saludos y mensajes triviales no valen una llamada

      const ai = await chatModel({
        messages: [
          {
            role: "system",
            content:
              "Extraes hechos duraderos sobre el Operador SOLO de lo que él afirma en su mensaje. " +
              "Incluye: identidad, preferencias, proyectos, herramientas o stack, clientes o personas, y decisiones que él declara tomadas. " +
              "NO incluyas: preguntas, ideas que solo está explorando, hipótesis, ni nada que no haya dicho él. " +
              "Responde SOLO un array JSON de strings cortos en español, una afirmación por string. " +
              "Si no hay ningún hecho duradero, responde exactamente []",
          },
          { role: "user", content: texto.slice(0, 1500) },
        ],
        temperature: 0.1,
        max_tokens: 300,
      });
      const raw = ai.text;

      const m = String(raw || "").match(/\[[\s\S]*\]/);
      if (!m) return;

      let hechos;
      try { hechos = JSON.parse(m[0]); } catch { return; }
      if (!Array.isArray(hechos)) return;

      for (const h of hechos.slice(0, 5)) {
        const hecho = String(h || "").trim();
        if (hecho.length < 8) continue;

        let vecStr = null;
        try {
          const vec = await generateEmbedding(hecho);
          vecStr = "[" + vec.join(",") + "]";
        } catch (e) {
          console.warn("[URUS_CHAT] embedding del hecho falló:", e.message);
        }

        // Evitar duplicados: si ya hay un hecho casi idéntico, no guardar otro
        if (vecStr) {
          const dup = await pool.query(
            `SELECT 1 FROM jarvis_memory
             WHERE source = $1 AND type = 'learned_fact' AND embedding IS NOT NULL
               AND 1 - (embedding <=> $2::vector) > 0.90
             LIMIT 1`,
            [MEMORY_SOURCE, vecStr]
          );
          if (dup.rowCount > 0) continue;
        } else {
          // Sin embeddings: evitar duplicados exactos por texto
          const dup = await pool.query(
            `SELECT 1 FROM jarvis_memory
             WHERE source = $1 AND type = 'learned_fact' AND content = $2
             LIMIT 1`,
            [MEMORY_SOURCE, hecho]
          );
          if (dup.rowCount > 0) continue;
        }

        const meta = JSON.stringify({ session_id: sessionId, at: new Date().toISOString() });
        if (vecStr) {
          await pool.query(
            `INSERT INTO jarvis_memory (content, type, source, metadata, embedding)
             VALUES ($1, 'learned_fact', $2, $3, $4::vector)`,
            [hecho, MEMORY_SOURCE, meta, vecStr]
          );
        } else {
          await pool.query(
            `INSERT INTO jarvis_memory (content, type, source, metadata)
             VALUES ($1, 'learned_fact', $2, $3)`,
            [hecho, MEMORY_SOURCE, meta]
          );
        }
        console.log("[URUS_CHAT] hecho aprendido:", hecho);
      }
    } catch (e) {
      console.warn("[URUS_CHAT] extracción de hechos falló:", e.message);
    }
  }

  // ==================================================================
  // POST /v1/urus/learn  → enseñarle información sobre ti
  // Body: { content: "texto largo...", type: "identity|principle|protocol|context", pinned: true|false }
  // Los types identity/principle/protocol/context forman el NÚCLEO (siempre presente en el chat).
  // pinned:true fija cualquier fragmento en el núcleo, sea cual sea su type.
  // ==================================================================
  router.post("/learn", auth, async (req, res) => {
    try {
      const content = String(req.body?.content || "").trim();
      const type = String(req.body?.type || "fact").trim();
      const pinned = req.body?.pinned === true;

      if (!content) {
        return res.status(400).json({ ok: false, error: "content_required" });
      }

      const chunks = chunkText(content);
      const ids = [];

      for (const chunk of chunks) {
        const meta = { ingested_at: new Date().toISOString() };
        if (pinned) meta.pinned = true;
        const id = await saveMemory(chunk, type, meta);
        if (id) ids.push(id);
      }

      return res.json({
        ok: true,
        fragmentos_guardados: ids.length,
        type,
        pinned,
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
        ? memories.map((m) => `- [${m.type || "nota"}] ${String(m.content).slice(0, 1200)}`).join("\n")
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

        const ai = await chatModel({
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
        answer = ai.text;
        modoUsado = `pdf/${ai.provider}/${ai.model}`;

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
          search_depth: "advanced",
          max_results: TAVILY_MAX_RESULTS,
          include_answer: true,
          include_raw_content: true,
          topic: "news",
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

  const fechaCorta = (d) => new Date(d).toISOString().slice(0, 16).replace("T", " ");

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

      // 1. Memoria: núcleo + saber + pasado (en paralelo con la continuidad del chat)
      const [rec, delChat] = await Promise.all([
        recall.recall({ message, limits: { knowledge: 12, past: 8 } }).catch((e) => {
          console.warn("[URUS_CHAT] recall falló:", e.message);
          return { mode: "keyword", embedError: String(e.message || e).slice(0, 160), core: [], knowledge: [], past: [] };
        }),
        recentConversations(6, sessionId),
      ]);

      // Chat nuevo o casi vacío: completar con los últimos intercambios de otros chats
      const usaGlobal = delChat.length < 3;
      const recientes = usaGlobal ? await recentConversations(6, null) : delChat;

      const memories = rec.knowledge;
      const recentIds = new Set(recientes.map((c) => c.id).filter(Boolean));
      const past = rec.past.filter((p) => !recentIds.has(p.id)).slice(0, 4);

      const nucleoBlock = rec.core.length
        ? rec.core.map((m) => `- [${m.type}${m.pinned ? " ★" : ""}] ${m.content}`).join("\n")
        : "(Sin núcleo guardado todavía. Se llena con /learn usando type identity, principle, protocol o context, o fijando recuerdos con /pin.)";

      const memoryBlock = memories.length
        ? memories.map((m) => `- [${m.type || "nota"}] ${String(m.content).slice(0, 1200)}`).join("\n")
        : "(Sin memoria guardada todavía sobre este tema.)";

      const pastBlock = past.length
        ? past.map((c) => `[${fechaCorta(c.created_at)}]\n${String(c.content).slice(0, 700)}`).join("\n\n")
        : "";

      const continuidadBlock = recientes.length
        ? recientes
            .map((c) => `[${fechaCorta(c.created_at)}]\n${String(c.content).slice(0, 700)}`)
            .join("\n\n")
        : "(Primera conversación registrada.)";

      const aviso = rec.mode === "keyword"
        ? "\n\nAVISO DEL SISTEMA: la búsqueda de memoria por significado no está disponible ahora" +
          (rec.embedError ? ` (${rec.embedError})` : "") +
          ". La memoria se buscó por palabras y puede estar incompleta. Si no encuentras algo, di que no lo encuentras en este momento; no afirmes que nunca se guardó."
        : "";

      // 2. Armar el contexto completo
      const systemPrompt =
        URUS_IDENTITY +
        aviso +
        "\n\n=== NÚCLEO (lo fundamental sobre el Operador; siempre presente) ===\n" +
        nucleoBlock +
        "\n=== FIN NÚCLEO ===" +
        "\n\n=== MEMORIA RECUPERADA (relacionada con este mensaje) ===\n" +
        memoryBlock +
        "\n=== FIN MEMORIA ===" +
        (pastBlock
          ? "\n\n=== CONVERSACIONES PASADAS RELEVANTES ===\n" + pastBlock + "\n=== FIN CONVERSACIONES PASADAS ==="
          : "") +
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

      const ai = await chatModel({ messages, temperature: 0.6, max_tokens: 2500 });
      const answer = ai.text;

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
          await extraerYGuardarHechos(message, sessionId);
        } catch (e) {
          console.warn("[URUS_CHAT] no se pudo guardar la conversación:", e.message);
        }
      });

      return res.json({
        ok: true,
        answer,
        session_id: sessionId,
        sesion_nueva: esNueva,
        memories_used: rec.core.length + memories.length + past.length,
        nucleo_usado: rec.core.length,
        pasado_usado: past.length,
        memory_mode: rec.mode,
        memory_warning: rec.mode === "keyword" ? (rec.embedError || "búsqueda por palabras") : null,
        continuidad_usada: recientes.length,
        continuidad_global: usaGlobal,
        memories: memories.map((m) => ({
          content: String(m.content).slice(0, 300),
          type: m.type,
        })),
        model_used: `${ai.provider}/${ai.model}`,
        model_fallback: ai.fallback,
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
                    (embedding IS NOT NULL) AS tiene_embedding,
                    ((metadata->>'pinned') = 'true') AS fijado
             FROM jarvis_memory
             WHERE source = $1 AND type = $2
             ORDER BY created_at DESC
             LIMIT $3`,
            [MEMORY_SOURCE, tipo, limit]
          )
        : await pool.query(
            `SELECT id, type, content, created_at,
                    (embedding IS NOT NULL) AS tiene_embedding,
                    ((metadata->>'pinned') = 'true') AS fijado
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
  // GET /v1/urus/memory/health  → ¿está sana la memoria?
  // ==================================================================
  router.get("/memory/health", auth, async (req, res) => {
    try {
      const c = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(embedding)::int AS con_embedding,
                (COUNT(*) - COUNT(embedding))::int AS sin_embedding,
                COUNT(*) FILTER (WHERE type = ANY($2::text[]))::int AS nucleo_por_tipo,
                COUNT(*) FILTER (WHERE (metadata->>'pinned') = 'true')::int AS fijados
         FROM jarvis_memory WHERE source = $1`,
        [MEMORY_SOURCE, recall.CORE_TYPES]
      );

      let embedding_ok = false;
      let embedding_error = null;
      try {
        await withTimeout(generateEmbedding("prueba de memoria"), 8000, "embeddings");
        embedding_ok = true;
        recall.resetBreaker();
      } catch (e) {
        embedding_error = String(e.message || e).slice(0, 200);
      }

      const m = c.rows[0];
      let sugerencia = "Todo en orden.";
      if (!embedding_ok) {
        sugerencia =
          "Los embeddings no responden (con frecuencia es falta de crédito en OpenAI). El chat sigue funcionando: busca por palabras y siempre incluye el núcleo. " +
          "Cuando recargues, corre POST /v1/urus/memory/backfill hasta que 'pendientes' llegue a 0.";
      } else if (m.sin_embedding > 0) {
        sugerencia = `Hay ${m.sin_embedding} recuerdos sin embedding. Corre POST /v1/urus/memory/backfill hasta que 'pendientes' llegue a 0.`;
      }

      return res.json({
        ok: true,
        memoria: m,
        embedding_ok,
        embedding_error,
        modo_busqueda: embedding_ok ? "semantic" : "keyword",
        core_max_chars: CORE_MAX_CHARS,
        tipos_del_nucleo: recall.CORE_TYPES,
        sugerencia,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // POST /v1/urus/memory/backfill  → calcula embeddings de lo que quedó sin ellos
  // Body opcional: { limit: 50 }  (máx 200 por llamada). Repite hasta que pendientes = 0.
  // ==================================================================
  router.post("/memory/backfill", auth, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.body?.limit || "50", 10) || 50, 1), 200);
      const rows = await pool.query(
        `SELECT id, content FROM jarvis_memory
         WHERE source = $1 AND embedding IS NULL
         ORDER BY created_at DESC
         LIMIT $2`,
        [MEMORY_SOURCE, limit]
      );

      let ok = 0;
      let failed = 0;
      let consecutive = 0;
      let firstError = null;

      for (const row of rows.rows) {
        try {
          const vec = await generateEmbedding(row.content);
          await pool.query(
            `UPDATE jarvis_memory SET embedding = $2::vector WHERE id = $1`,
            [row.id, "[" + vec.join(",") + "]"]
          );
          ok++;
          consecutive = 0;
        } catch (e) {
          failed++;
          consecutive++;
          if (!firstError) firstError = String(e.message || e).slice(0, 200);
          if (consecutive >= 3) break; // no martillar un servicio caído
        }
      }

      if (ok > 0) recall.resetBreaker();

      const rest = await pool.query(
        `SELECT COUNT(*)::int AS n FROM jarvis_memory WHERE source = $1 AND embedding IS NULL`,
        [MEMORY_SOURCE]
      );

      return res.json({
        ok: true,
        procesados: ok,
        fallidos: failed,
        pendientes: rest.rows[0].n,
        error: firstError,
        nota: firstError
          ? "Los embeddings siguen fallando; revisa el crédito de OpenAI y reintenta."
          : rest.rows[0].n > 0 ? "Repite la llamada hasta que pendientes sea 0." : "Todo al día.",
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // POST /v1/urus/pin  → fijar / desfijar un recuerdo en el núcleo
  // Body: { id: "uuid", pinned: true|false }  (pinned por defecto true)
  // ==================================================================
  router.post("/pin", auth, async (req, res) => {
    try {
      const id = String(req.body?.id || "").trim();
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ ok: false, error: "id_invalido" });
      }
      const pinned = req.body?.pinned !== false;
      const r = await pool.query(
        `UPDATE jarvis_memory
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
         WHERE id = $1 AND source = $2
         RETURNING id, type`,
        [id, MEMORY_SOURCE, JSON.stringify({ pinned })]
      );
      if (!r.rowCount) return res.status(404).json({ ok: false, error: "recuerdo_no_encontrado" });
      return res.json({ ok: true, id, type: r.rows[0].type, pinned });
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
        chat_respaldos: buildChain().slice(1).map((c) => `${c.provider}/${c.model}`),
        vision_model: URUS_VISION_MODEL,
        web_search: TAVILY_API_KEY ? "tavily" : "off",
        core_max_chars: CORE_MAX_CHARS,
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
