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
 *   GET    /v1/urus/memory/health → salud de la memoria (¿se están guardando hechos? ¿qué falta?)
 *   POST   /v1/urus/memory/pin    → fijar/soltar un recuerdo en el NÚCLEO (siempre presente)
 *   POST   /v1/urus/memory/backfill-core → clasificar recuerdos viejos como NÚCLEO (repetir hasta remaining=0)
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
const { callModel, callModelChain, gatewayStatus } = require("./urus-gateway");

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

// Memoria total: cuántos caracteres del NÚCLEO viajan en CADA mensaje, y qué tan parecida
// debe ser una conversación pasada (0 a 1) para que se recuerde.
const URUS_CORE_CHARS = parseInt(process.env.URUS_CORE_CHARS || "5000", 10);
const URUS_PAST_MIN_SIM = parseFloat(process.env.URUS_PAST_MIN_SIM || "0.38");

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
- "NÚCLEO" es lo permanente y fundamental sobre el Operador (identidad, reglas, proyectos, stack). Siempre está vigente: úsalo aunque el mensaje no lo mencione.
- "CONVERSACIONES PASADAS" son fragmentos de chats anteriores que se parecen al tema actual. Son lo que se dijo en su momento, con fecha, y pueden estar desactualizados.
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
  async function searchMemory(query, limit = 12, vecIn = null) {
    try {
      const vec = vecIn || (await generateEmbedding(query));
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

  // ------------------------------------------------------------------
  // MEMORIA TOTAL — capas nuevas que se suman a la búsqueda semántica de siempre
  //   NÚCLEO : lo fundamental. Viaja en CADA mensaje (type identity/principle/protocol/context
  //            + hechos marcados core). Así recuerda quién eres aunque tu mensaje no lo mencione.
  //   PASADO : conversaciones antiguas que se parecen al tema de ahora (búsqueda por significado).
  // ------------------------------------------------------------------
  const CORE_TYPES = ["identity", "principle", "protocol", "context"];
  let _coreCache = { at: 0, rows: [] };
  function invalidateCore() { _coreCache = { at: 0, rows: [] }; }

  // Salud del extractor de hechos: si falla ya no falla en silencio (ver GET /memory/health)
  const memStats = {
    extract_ok: 0, extract_fail: 0, extract_empty: 0,
    facts_saved: 0, facts_core: 0,
    last_ok_at: null, last_error: null, last_error_at: null,
  };

  function fechaCorta(d) {
    return new Date(d).toISOString().slice(0, 16).replace("T", " ");
  }

  async function coreMemory() {
    if (Date.now() - _coreCache.at < 30000) return _coreCache.rows;
    try {
      const r = await pool.query(
        `SELECT id, content, type, created_at FROM jarvis_memory
         WHERE source = $1 AND type <> 'conversation'
           AND (type = ANY($2::text[]) OR metadata->>'core' = 'true')
         ORDER BY (type = ANY($2::text[])) DESC, created_at DESC
         LIMIT 120`,
        [MEMORY_SOURCE, CORE_TYPES]
      );
      // Lo que enseñaste con /learn va en orden de lectura; los hechos, del más nuevo al más viejo
      const fijos = r.rows
        .filter((x) => CORE_TYPES.includes(x.type))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const hechos = r.rows.filter((x) => !CORE_TYPES.includes(x.type));
      _coreCache = { at: Date.now(), rows: [...fijos, ...hechos] };
      return _coreCache.rows;
    } catch (e) {
      console.warn("[URUS_CHAT] núcleo falló:", e.message);
      return _coreCache.rows;
    }
  }

  // Arma líneas "- texto" sin pasarse del presupuesto de caracteres
  function packBlock(rows, budgetChars, clipEach) {
    const out = [];
    let used = 0;
    for (const r of rows) {
      const line = "- " + String(r.content).replace(/\s+/g, " ").trim().slice(0, clipEach);
      if (used + line.length > budgetChars) break;
      out.push(line);
      used += line.length + 1;
    }
    return out;
  }

  // Conversaciones antiguas parecidas al mensaje actual (excluye las que ya van en CONTINUIDAD)
  async function searchPastConversations(vec, skipContents, limit = 4, minSim = 0.38) {
    if (!vec) return [];
    try {
      const r = await pool.query(
        `SELECT content, created_at, 1 - (embedding <=> $1::vector) AS similarity
         FROM jarvis_memory
         WHERE source = $2 AND type = 'conversation' AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        ["[" + vec.join(",") + "]", MEMORY_SOURCE, limit + 8]
      );
      return r.rows
        .filter((x) => Number(x.similarity) >= minSim && !skipContents.has(x.content))
        .slice(0, limit);
    } catch (e) {
      console.warn("[URUS_CHAT] búsqueda de conversaciones pasadas falló:", e.message);
      return [];
    }
  }

  // Parte un mensaje largo (p. ej. un dictado) en trozos de ~1800 caracteres para no perder el final
  function splitForExtraction(text, size = 1800, maxChunks = 4) {
    const pieces = [];
    for (const p of String(text).split(/(?<=[.!?\n])\s+/)) {
      for (let i = 0; i < p.length; i += size) pieces.push(p.slice(i, i + size));
    }
    const chunks = [];
    let buf = "";
    for (const p of pieces) {
      if (buf && (buf + " " + p).length > size) { chunks.push(buf); buf = p; }
      else buf = buf ? buf + " " + p : p;
    }
    if (buf) chunks.push(buf);
    return chunks.slice(0, maxChunks);
  }

  // Devuelve [{fact, core}] o null si la respuesta del modelo no era JSON válido
  function parseFacts(raw) {
    const m = String(raw || "").match(/\[[\s\S]*\]/);
    if (!m) return null;
    let arr;
    try { arr = JSON.parse(m[0]); } catch { return null; }
    if (!Array.isArray(arr)) return null;
    return arr
      .map((x) =>
        typeof x === "string"
          ? { fact: x.trim(), core: false }
          : { fact: String((x && x.fact) || "").trim(), core: !!(x && x.core) }
      )
      .filter((x) => x.fact.length >= 8);
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
  // Mejoras: lee mensajes largos completos (por trozos), marca cuáles son NÚCLEO,
  // sube a NÚCLEO un hecho repetido que resulta fundamental, usa respaldo de modelo
  // y registra sus fallos (antes fallaba en silencio).
  const EXTRACT_SYSTEM =
    "Extraes hechos duraderos sobre el Operador SOLO de lo que él afirma en su mensaje. " +
    "Incluye: identidad, preferencias, proyectos, herramientas o stack, clientes o personas, metas y decisiones que él declara tomadas. " +
    "NO incluyas: preguntas, ideas que solo está explorando, hipótesis, ni nada que no haya dicho él. " +
    "Cada hecho debe entenderse por sí solo, sin el mensaje original (incluye nombres propios). " +
    "Marca core=true SOLO para lo estable y fundamental que conviene recordar SIEMPRE: identidad, reglas o preferencias permanentes, proyectos principales, stack, clientes clave, metas de fondo. Todo lo demás es core=false. " +
    'Responde SOLO un array JSON: [{"fact":"...","core":true}]. ' +
    "Si no hay ningún hecho duradero, responde exactamente []";

  async function extraerYGuardarHechos(message, sessionId) {
    try {
      const texto = String(message || "").trim();
      if (texto.length < 15) return; // saludos y mensajes triviales no valen una llamada

      const chunks = splitForExtraction(texto.slice(0, 7200));
      const listas = await Promise.all(
        chunks.map(async (chunk) => {
          const out = await callModelChain({
            provider: URUS_CHAT_PROVIDER,
            model: URUS_CHAT_MODEL,
            messages: [
              { role: "system", content: EXTRACT_SYSTEM },
              { role: "user", content: chunk },
            ],
            temperature: 0.1,
            max_tokens: 600,
            timeoutMs: 45000,
          });
          return parseFacts(out.text);
        })
      );

      const validas = listas.filter((l) => Array.isArray(l));
      if (!validas.length) throw new Error("el extractor no devolvió JSON válido");

      // Une los resultados de todos los trozos, sin repetidos exactos
      const vistos = new Set();
      const hechos = [];
      for (const l of validas) {
        for (const h of l) {
          const k = h.fact.toLowerCase();
          if (vistos.has(k)) continue;
          vistos.add(k);
          hechos.push(h);
        }
      }

      let guardados = 0;
      let nucleo = 0;
      for (const h of hechos.slice(0, 10)) {
        let vecStr = null;
        try {
          const vec = await generateEmbedding(h.fact);
          vecStr = "[" + vec.join(",") + "]";
        } catch (e) {
          console.warn("[URUS_CHAT] embedding del hecho falló:", e.message);
        }

        // Evitar duplicados: si ya hay un hecho casi idéntico, no guardar otro
        if (vecStr) {
          const dup = await pool.query(
            `SELECT id, metadata->>'core' AS core FROM jarvis_memory
             WHERE source = $1 AND type = 'learned_fact' AND embedding IS NOT NULL
               AND 1 - (embedding <=> $2::vector) > 0.90
             ORDER BY embedding <=> $2::vector
             LIMIT 1`,
            [MEMORY_SOURCE, vecStr]
          );
          if (dup.rowCount > 0) {
            // Ya existía: si ahora resulta ser fundamental, súbelo al núcleo
            if (h.core && dup.rows[0].core !== "true") {
              await pool.query(
                `UPDATE jarvis_memory SET metadata = jsonb_set(metadata, '{core}', 'true'::jsonb) WHERE id = $1`,
                [dup.rows[0].id]
              );
              nucleo++;
            }
            continue;
          }
        }

        const meta = JSON.stringify({ session_id: sessionId, at: new Date().toISOString(), core: !!h.core });
        if (vecStr) {
          await pool.query(
            `INSERT INTO jarvis_memory (content, type, source, metadata, embedding)
             VALUES ($1, 'learned_fact', $2, $3, $4::vector)`,
            [h.fact, MEMORY_SOURCE, meta, vecStr]
          );
        } else {
          await pool.query(
            `INSERT INTO jarvis_memory (content, type, source, metadata)
             VALUES ($1, 'learned_fact', $2, $3)`,
            [h.fact, MEMORY_SOURCE, meta]
          );
        }
        guardados++;
        if (h.core) nucleo++;
        console.log("[URUS_CHAT] hecho aprendido" + (h.core ? " (núcleo)" : "") + ":", h.fact);
      }

      memStats.extract_ok++;
      if (!hechos.length) memStats.extract_empty++;
      memStats.facts_saved += guardados;
      memStats.facts_core += nucleo;
      memStats.last_ok_at = new Date().toISOString();
      if (guardados || nucleo) invalidateCore();
    } catch (e) {
      memStats.extract_fail++;
      memStats.last_error = String((e && e.message) || e).slice(0, 300);
      memStats.last_error_at = new Date().toISOString();
      console.warn("[URUS_CHAT] extracción de hechos falló:", e.message);
    }
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

      invalidateCore(); // lo recién enseñado (identity, principle...) entra al núcleo de inmediato
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

        answer = (await callModelChain({
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
        })).text;
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

      // 1. Memoria total. El embedding del mensaje se calcula UNA vez y se reutiliza.
      let qVec = null;
      try {
        qVec = await generateEmbedding(message);
      } catch (e) {
        console.warn("[URUS_CHAT] embedding del mensaje falló:", e.message);
      }

      const [memories, delChat, nucleoRows] = await Promise.all([
        searchMemory(message, 12, qVec),
        recentConversations(6, sessionId),
        coreMemory(),
      ]);
      // Chat nuevo o casi vacío: completar con los últimos intercambios de otros chats
      const usaGlobal = delChat.length < 3;
      const recientes = usaGlobal ? await recentConversations(6, null) : delChat;

      // NÚCLEO: siempre presente. Lo que ya está en el núcleo no se repite en MEMORIA RECUPERADA.
      const nucleoLines = packBlock(nucleoRows, URUS_CORE_CHARS, 500);
      const enNucleo = new Set(nucleoRows.map((r) => r.content));
      const memoriesUnicas = memories.filter((m) => !enNucleo.has(m.content));

      // PASADO: conversaciones antiguas que se parecen a este mensaje
      const pasado = await searchPastConversations(
        qVec,
        new Set(recientes.map((c) => c.content)),
        4,
        URUS_PAST_MIN_SIM
      );

      const nucleoBlock = nucleoLines.length
        ? nucleoLines.join("\n")
        : "(Aún no hay recuerdos fundamentales guardados.)";

      const memoryBlock = memoriesUnicas.length
        ? memoriesUnicas.map((m) => `- [${m.type || "nota"}] ${String(m.content).slice(0, 900)}`).join("\n")
        : "(Sin memoria guardada todavía sobre este tema.)";

      const pasadoBlock = pasado.length
        ? pasado.map((c) => `[${fechaCorta(c.created_at)}]\n${String(c.content).slice(0, 600)}`).join("\n\n")
        : "(Sin conversaciones pasadas parecidas.)";

      const continuidadBlock = recientes.length
        ? recientes
            .map((c) => `[${fechaCorta(c.created_at)}]\n${String(c.content).slice(0, 700)}`)
            .join("\n\n")
        : "(Primera conversación registrada.)";

      // 2. Armar el contexto completo
      const systemPrompt =
        URUS_IDENTITY +
        "\n\n=== NÚCLEO (permanente sobre el Operador — siempre vigente) ===\n" +
        nucleoBlock +
        "\n=== FIN NÚCLEO ===" +
        "\n\n=== MEMORIA RECUPERADA (conocimiento sobre el Operador, relevante a este mensaje) ===\n" +
        memoryBlock +
        "\n=== FIN MEMORIA ===" +
        "\n\n=== CONVERSACIONES PASADAS PARECIDAS (lo que se dijo, no necesariamente lo que se decidió) ===\n" +
        pasadoBlock +
        "\n=== FIN PASADAS ===" +
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

      const out = await callModelChain({
        provider: URUS_CHAT_PROVIDER,
        model: URUS_CHAT_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 2500,
      });
      const answer = out.text;

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
              model: out.provider + "/" + out.model,
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
        memories_used: memories.length,
        continuidad_usada: recientes.length,
        continuidad_global: usaGlobal,
        nucleo_usado: nucleoLines.length,
        nucleo_total: nucleoRows.length,
        pasado_usado: pasado.length,
        memories: memories.map((m) => ({
          content: String(m.content).slice(0, 300),
          type: m.type,
        })),
        model_used: out.provider + "/" + out.model,
        fallback_used: out.fallback,
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
  // GET /v1/urus/memory/health  → ¿se está guardando lo que debe? ¿qué falta?
  // ==================================================================
  router.get("/memory/health", auth, async (req, res) => {
    try {
      const porTipo = await pool.query(
        `SELECT type,
                COUNT(*)::int AS n,
                COUNT(embedding)::int AS con_embedding,
                COUNT(*) FILTER (WHERE metadata->>'core' = 'true')::int AS nucleo,
                MAX(created_at) AS ultimo
         FROM jarvis_memory WHERE source = $1
         GROUP BY type ORDER BY n DESC`,
        [MEMORY_SOURCE]
      );
      const pend = await pool.query(
        `SELECT COUNT(*)::int AS n FROM jarvis_memory
         WHERE source = $1 AND type = 'learned_fact' AND metadata->>'core' IS NULL`,
        [MEMORY_SOURCE]
      );
      const core = await coreMemory();

      const filas = porTipo.rows;
      const total = (t) => (filas.find((x) => x.type === t) || { n: 0 }).n;
      const sinEmbedding = filas.reduce((a, x) => a + (x.n - x.con_embedding), 0);
      const diagnostico = [];

      if (total("conversation") >= 3 && total("learned_fact") === 0) {
        diagnostico.push("Hay conversaciones pero NINGÚN hecho aprendido: el extractor puede estar fallando (mira extractor.last_error).");
      }
      if (memStats.extract_fail > 0 && memStats.extract_fail >= memStats.extract_ok) {
        diagnostico.push("El extractor falla tanto como acierta desde el último reinicio: revisa extractor.last_error.");
      }
      if (sinEmbedding > 0) {
        diagnostico.push(`${sinEmbedding} recuerdos no tienen vector: no se pueden encontrar por significado (suele pasar si OpenAI falló al guardarlos).`);
      }
      if (pend.rows[0].n > 0) {
        diagnostico.push(`${pend.rows[0].n} hechos viejos sin clasificar: corre POST /v1/urus/memory/backfill-core (repite hasta remaining = 0) para que los fundamentales entren al núcleo.`);
      }
      if (core.length === 0) {
        diagnostico.push("El núcleo está vacío: nada viaja 'siempre'. Enseña tu identidad con POST /v1/urus/learn { type: 'identity' } o corre backfill-core.");
      }
      if (!diagnostico.length) diagnostico.push("Todo en orden.");

      return res.json({
        ok: true,
        extractor: memStats,
        nucleo_items: core.length,
        nucleo_presupuesto_chars: URUS_CORE_CHARS,
        hechos_sin_clasificar: pend.rows[0].n,
        recuerdos_sin_vector: sinEmbedding,
        por_tipo: filas,
        diagnostico,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // POST /v1/urus/memory/pin  → fijar (o soltar) un recuerdo en el NÚCLEO
  // Body: { id: "uuid", core: true | false }   (core=true por defecto)
  // ==================================================================
  router.post("/memory/pin", auth, async (req, res) => {
    try {
      const id = String(req.body?.id || "");
      const core = req.body?.core !== false;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({ ok: false, error: "id_invalido" });
      }
      const r = await pool.query(
        `UPDATE jarvis_memory
         SET metadata = jsonb_set(metadata, '{core}', to_jsonb($2::boolean))
         WHERE id = $1::uuid AND source = $3
         RETURNING id, type, left(content, 160) AS content`,
        [id, core, MEMORY_SOURCE]
      );
      if (!r.rowCount) return res.status(404).json({ ok: false, error: "no_encontrado" });
      invalidateCore();
      return res.json({ ok: true, core, memoria: r.rows[0] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ==================================================================
  // POST /v1/urus/memory/backfill-core  → clasifica hechos VIEJOS como núcleo o no
  // Procesa 40 por llamada. Repite hasta que remaining sea 0.
  // ==================================================================
  router.post("/memory/backfill-core", auth, async (req, res) => {
    try {
      const rows = (
        await pool.query(
          `SELECT id, content FROM jarvis_memory
           WHERE source = $1 AND type = 'learned_fact' AND metadata->>'core' IS NULL
           ORDER BY created_at ASC LIMIT 40`,
          [MEMORY_SOURCE]
        )
      ).rows;

      if (!rows.length) return res.json({ ok: true, processed: 0, promoted: 0, remaining: 0 });

      const lista = rows.map((r, i) => `${i + 1}. ${String(r.content).slice(0, 300)}`).join("\n");
      const out = await callModelChain({
        provider: URUS_CHAT_PROVIDER,
        model: URUS_CHAT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Clasificas hechos sobre el Operador. Devuelve SOLO un JSON {\"core\":[números]} con los números de los hechos " +
              "FUNDAMENTALES y estables que conviene recordar SIEMPRE: identidad, reglas o preferencias permanentes, proyectos principales, " +
              "stack, clientes clave, metas de fondo. Los hechos puntuales, temporales o de detalle NO van. Si ninguno lo es: {\"core\":[]}",
          },
          { role: "user", content: lista },
        ],
        temperature: 0.1,
        max_tokens: 300,
      });

      const m = String(out.text || "").match(/\{[\s\S]*\}/);
      let parsed = null;
      try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
      if (!parsed || !Array.isArray(parsed.core)) {
        // No se marca nada: se puede reintentar sin perder el lote
        return res.status(502).json({ ok: false, error: "clasificacion_invalida", hint: "El modelo no devolvió JSON válido. Vuelve a llamar este endpoint." });
      }

      const elegidos = new Set(parsed.core.map(Number));
      let promoted = 0;
      for (let i = 0; i < rows.length; i++) {
        const esCore = elegidos.has(i + 1);
        if (esCore) promoted++;
        await pool.query(
          `UPDATE jarvis_memory SET metadata = jsonb_set(metadata, '{core}', to_jsonb($2::boolean)) WHERE id = $1`,
          [rows[i].id, esCore]
        );
      }
      invalidateCore();

      const rem = await pool.query(
        `SELECT COUNT(*)::int AS n FROM jarvis_memory
         WHERE source = $1 AND type = 'learned_fact' AND metadata->>'core' IS NULL`,
        [MEMORY_SOURCE]
      );
      return res.json({ ok: true, processed: rows.length, promoted, remaining: rem.rows[0].n });
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
        memory_health: memStats,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
};
