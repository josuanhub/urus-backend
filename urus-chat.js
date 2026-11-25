/**
 * URUS CHAT v2 — Chat con memoria reforzada + agente con herramientas + skills + Command Center
 * ------------------------------------------------------------------
 * Reemplaza urus-chat.js completo. No requiere cambios en server.js
 * (ya monta: app.use("/v1/urus", require("./urus-chat")(pool))).
 *
 * ENDPOINTS (auth: header x-studio-password, salvo /center que es la página):
 *   GET    /v1/urus/center                → Command Center (página)
 *   POST   /v1/urus/chat                  → chat con agente (memoria + herramientas + skills)
 *   GET    /v1/urus/ideas                 → bandeja de fichas
 *   POST   /v1/urus/ideas                 → crear fichas {ideas:[{titulo,resumen,proyecto}]}
 *   PATCH  /v1/urus/ideas/:id             → editar / cambiar estado
 *   POST   /v1/urus/ideas/:id/investigar  → investigar viabilidad con fuentes
 *   POST   /v1/urus/ideas/:id/construir   → enviar a Factory (solo si está "aprobada")
 *   GET    /v1/urus/ideas/:id/estado      → estado de construcción
 *   GET/POST/DELETE /v1/urus/skills       → skills personalizadas
 *   + los de antes: learn, analyze, voice, sessions, session/:id, memory, status
 *
 * ENV: OPENAI_API_KEY (embeddings), TAVILY_API_KEY (investigar), FACTORY_API_KEY (construir),
 *      URUS_CHAT_PROVIDER / URUS_CHAT_MODEL (recomendado: anthropic / claude-sonnet-4-6)
 */

const express = require("express");
const crypto = require("crypto");
const OpenAI = require("openai").default;
const { callModel, gatewayStatus } = require("./urus-gateway");

const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || "urus2026";
const MEMORY_SOURCE = "urus";
const URUS_CHAT_PROVIDER = process.env.URUS_CHAT_PROVIDER || "deepseek";
const URUS_CHAT_MODEL = process.env.URUS_CHAT_MODEL || "deepseek-chat";
const URUS_VISION_MODEL = process.env.URUS_VISION_MODEL || "gpt-4o";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const TAVILY_MAX_RESULTS = Math.min(parseInt(process.env.TAVILY_MAX_RESULTS || "5", 10), 10);

const ESTADOS = ["nueva", "investigando", "investigada", "aprobada", "construyendo", "lista", "descartada", "pospuesta", "error"];

const URUS_IDENTITY = `
Eres URUS, la inteligencia SIMBIOTICA operativa persistente del Operador BAYON.
No eres un asistente genérico ni una autoridad sobre el Operador.
Tu función es mantener continuidad, memoria, diagnóstico, claridad y dirección, y ACTUAR con tus herramientas.

CÓMO HABLAS:
- Directo, preciso, sin relleno. Español natural. Frases cortas.
- Sin moralizar, sin motivación barata, sin frases de coach.

REGLAS DE MEMORIA:
- "MEMORIA CENTRAL" y "MEMORIA RELEVANTE" son hechos guardados sobre el Operador.
- "TABLERO DE IDEAS" es el estado real de sus fichas. Es la fuente de verdad sobre ideas.
- Lo que aparece en la conversación es lo que se dijo, NO necesariamente lo que se decidió.
- NUNCA inventes recuerdos. Si algo no está guardado, dilo.
- Si infieres algo, márcalo como inferencia.
- Si el Operador te dice un dato duradero (preferencia, decisión, cliente, stack), guárdalo con guardar_memoria.

REGLAS DE ACCIÓN:
- Nunca digas que hiciste algo si la herramienta no devolvió ok. Reporta errores tal cual.
- Nunca marques una ficha como "aprobada" ni construyas sin que el Operador lo diga explícitamente.
- Nunca inventes fuentes ni URLs. Solo las que devuelva buscar_web o investigar_ficha.
`.trim();

const TOOLS_PROMPT = `
=== HERRAMIENTAS ===
Para usar una herramienta responde SOLO con una línea, sin texto antes ni después:
<tool>{"name":"NOMBRE","args":{...}}</tool>
Recibirás "RESULTADO ...". Puedes encadenar hasta 4 herramientas, UNA por turno.
Cuando termines, responde al Operador en texto normal (sin etiquetas).

- crear_fichas {"ideas":[{"titulo":"...","resumen":"1-2 frases","proyecto":"opcional"}]}
  Úsala cuando el Operador suelta una o varias ideas. Separa cada idea en su propia ficha.
- listar_fichas {"estado":"opcional"}
- actualizar_ficha {"ref":"id corto | parte del título","estado":"opcional","notas":"opcional","titulo":"opcional","resumen":"opcional"}
  Estados: ${ESTADOS.join(", ")}
- investigar_ficha {"ref":"..."}  Investiga viabilidad con fuentes web reales y guarda el informe en la ficha.
- construir_ficha {"ref":"..."}   Envía a Factory. SOLO si la ficha está "aprobada" por el Operador.
- estado_construccion {"ref":"..."}
- guardar_memoria {"hecho":"afirmación corta"}
- buscar_memoria {"consulta":"..."}
- buscar_web {"consulta":"..."}  Para datos actuales o externos.
- listar_skills {}
Si no necesitas herramienta, responde directo.
`.trim();

// ------------------------------------------------------------------
// Skills integradas (las tuyas se guardan en la tabla urus_skills)
// ------------------------------------------------------------------
const BUILTIN_SKILLS = [
  {
    name: "descarga_de_ideas",
    triggers: ["tengo estas ideas", "tengo tres ideas", "tengo 3 ideas", "tengo varias ideas", "ideas desordenadas", "organízame", "organizame", "organízamelas", "organizamelas"],
    instructions:
      "El Operador está soltando ideas desordenadas. Usa crear_fichas UNA vez con todas las ideas separadas (una ficha por idea, título corto + resumen de 1-2 frases). " +
      "Después responde con la lista de fichas creadas y pregunta cuál quiere investigar primero. No investigues sin que lo pida.",
  },
  {
    name: "evaluar_idea",
    triggers: ["vale la pena", "es viable", "viabilidad", "investiga la idea", "investígala", "investigala", "evalúa la idea", "evalua la idea"],
    instructions:
      "Usa investigar_ficha sobre la ficha indicada. Al terminar resume: veredicto (probar/descartar/posponer), 2 riesgos, qué falta comprobar y las fuentes. " +
      "Pregunta si la aprueba. No la apruebes tú.",
  },
  {
    name: "plano_maestro",
    triggers: ["plano maestro", "plan maestro", "ingeniería inversa", "ingenieria inversa", "fases inversas", "ancla del día", "prioridad p1"],
    instructions:
      "Estructura para una idea YA decidida: (1) Meta final con resultado verificable y fecha límite. (2) Ruta inversa en 3-4 fases desde la meta hasta hoy, cada fase con criterio de cierre binario (cumplida/no cumplida) y evidencia. " +
      "(3) Prioridades: P1 crítica/cierre de fase, P2 programada, P3 diferible, P4 descartar o enviar a ideas. (4) Plan diario: 1 ancla P1 + máximo 2 tareas con bloque horario. " +
      "Regla anti-bucle: si se pule un detalle sin cerrar el mínimo funcional, corte por tiempo. Indica en qué fase está hoy. Guarda la meta y la fase con guardar_memoria cuando el Operador las confirme.",
  },
  {
    name: "construir_idea",
    triggers: ["construye", "constrúyela", "construyela", "mándala a factory", "mandala a factory", "envíala a factory", "enviala a factory"],
    instructions:
      "Para construir: la ficha debe estar 'aprobada'. Si no lo está, pregunta si la aprueba (no la apruebes sin su confirmación). Si lo está, usa construir_ficha y luego informa que corre en segundo plano; usa estado_construccion para dar el estado.",
  },
];

module.exports = function urusChatRouter(pool) {
  const router = express.Router();
  router.use(express.json({ limit: "25mb" }));

  // --- OpenAI (embeddings, visión, voz) ---
  let _openaiClient = null;
  function getOpenAIClient() {
    if (_openaiClient) return _openaiClient;
    if (!process.env.OPENAI_API_KEY) throw new Error("URUS_CHAT: falta OPENAI_API_KEY");
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openaiClient;
  }
  async function generateEmbedding(text) {
    const resp = await getOpenAIClient().embeddings.create({
      model: "text-embedding-3-small",
      input: String(text).slice(0, 8000),
    });
    return resp.data[0].embedding;
  }
  const vecStr = (v) => "[" + v.join(",") + "]";

  function auth(req, res, next) {
    if (req.headers["x-studio-password"] !== STUDIO_PASSWORD) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
  }

  // --- Tablas propias (se crean solas la primera vez) ---
  let _ready = null;
  function ensureTables() {
    if (!_ready) {
      _ready = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS urus_ideas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            titulo TEXT NOT NULL,
            resumen TEXT NOT NULL DEFAULT '',
            proyecto TEXT NOT NULL DEFAULT 'GENERAL',
            estado TEXT NOT NULL DEFAULT 'nueva',
            informe JSONB,
            fuentes JSONB NOT NULL DEFAULT '[]'::jsonb,
            notas TEXT NOT NULL DEFAULT '',
            build JSONB NOT NULL DEFAULT '{}'::jsonb,
            session_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_urus_ideas_estado ON urus_ideas(estado, updated_at DESC)`);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS urus_skills (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            triggers TEXT[] NOT NULL DEFAULT '{}',
            instructions TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )`);
      })().catch((e) => { _ready = null; throw e; });
    }
    return _ready;
  }
  router.use(async (req, res, next) => {
    try { await ensureTables(); next(); } catch (e) { res.status(500).json({ ok: false, error: "db_init: " + e.message }); }
  });

  // ================================================================
  // MEMORIA
  // ================================================================
  async function saveMemory(content, type = "fact", metadata = {}) {
    const clean = String(content || "").trim();
    if (!clean) return null;
    let v = null;
    try { v = vecStr(await generateEmbedding(clean)); }
    catch (e) { console.warn("[URUS_CHAT] embedding falló, guardando sin vector:", e.message); }
    const r = v
      ? await pool.query(
          `INSERT INTO jarvis_memory (content, type, source, metadata, embedding) VALUES ($1,$2,$3,$4,$5::vector) RETURNING id`,
          [clean.slice(0, 10000), type, MEMORY_SOURCE, JSON.stringify(metadata), v])
      : await pool.query(
          `INSERT INTO jarvis_memory (content, type, source, metadata) VALUES ($1,$2,$3,$4) RETURNING id`,
          [clean.slice(0, 10000), type, MEMORY_SOURCE, JSON.stringify(metadata)]);
    return r.rows[0].id;
  }

  // Hecho duradero: evita duplicados y ACTUALIZA si el nuevo se parece a uno viejo (cambio de decisión)
  async function guardarHecho(hecho, sessionId) {
    const h = String(hecho || "").trim();
    if (h.length < 8) return "ignorado";
    const meta = { session_id: sessionId, at: new Date().toISOString() };
    let v = null;
    try { v = vecStr(await generateEmbedding(h)); } catch (e) { console.warn("[URUS_CHAT] embedding hecho:", e.message); }
    if (v) {
      const near = await pool.query(
        `SELECT id, 1 - (embedding <=> $2::vector) AS sim FROM jarvis_memory
         WHERE source=$1 AND type='learned_fact' AND embedding IS NOT NULL
         ORDER BY embedding <=> $2::vector LIMIT 1`, [MEMORY_SOURCE, v]);
      const n = near.rows[0];
      if (n && Number(n.sim) > 0.92) return "duplicado";
      if (n && Number(n.sim) > 0.80) {
        await pool.query(
          `UPDATE jarvis_memory SET content=$2, embedding=$3::vector, metadata=$4 WHERE id=$1`,
          [n.id, h, v, JSON.stringify({ ...meta, actualizado: true })]);
        return "actualizado";
      }
      await pool.query(
        `INSERT INTO jarvis_memory (content,type,source,metadata,embedding) VALUES ($1,'learned_fact',$2,$3,$4::vector)`,
        [h, MEMORY_SOURCE, JSON.stringify(meta), v]);
      return "guardado";
    }
    await pool.query(
      `INSERT INTO jarvis_memory (content,type,source,metadata) VALUES ($1,'learned_fact',$2,$3)`,
      [h, MEMORY_SOURCE, JSON.stringify(meta)]);
    return "guardado";
  }

  async function searchMemory(query, limit = 10) {
    try {
      const v = vecStr(await generateEmbedding(query));
      const r = await pool.query(
        `SELECT content, type, created_at, 1 - (embedding <=> $1::vector) AS similarity
         FROM jarvis_memory
         WHERE source=$2 AND embedding IS NOT NULL AND type <> 'conversation'
         ORDER BY embedding <=> $1::vector LIMIT $3`, [v, MEMORY_SOURCE, limit]);
      return r.rows.filter((row) => Number(row.similarity) > 0.25);
    } catch (e) {
      console.warn("[URUS_CHAT] búsqueda semántica falló, fallback por fecha:", e.message);
      const r = await pool.query(
        `SELECT content, type, created_at FROM jarvis_memory
         WHERE source=$1 AND type <> 'conversation' ORDER BY created_at DESC LIMIT $2`, [MEMORY_SOURCE, limit]);
      return r.rows;
    }
  }

  // Memoria central: lo más reciente de identidad/hechos/decisiones SIEMPRE entra, sin depender de similitud
  async function coreMemory(limit = 20) {
    try {
      const r = await pool.query(
        `SELECT content, type FROM jarvis_memory
         WHERE source=$1 AND type IN ('learned_fact','identity','principle','protocol','context','fact')
         ORDER BY created_at DESC LIMIT $2`, [MEMORY_SOURCE, limit]);
      return r.rows;
    } catch (e) { return []; }
  }

  // Turnos reales de ESTE chat como mensajes (no dependemos de que el cliente mande history)
  async function sessionTurns(sessionId, limit = 10) {
    try {
      const r = await pool.query(
        `SELECT metadata FROM jarvis_memory
         WHERE source=$1 AND type='conversation' AND metadata->>'session_id'=$2
         ORDER BY created_at DESC LIMIT $3`, [MEMORY_SOURCE, sessionId, limit]);
      const msgs = [];
      for (const row of r.rows.reverse()) {
        const m = row.metadata || {};
        if (m.user && m.assistant) {
          msgs.push({ role: "user", content: String(m.user).slice(0, 3000) });
          msgs.push({ role: "assistant", content: String(m.assistant).slice(0, 3000) });
        }
      }
      return msgs;
    } catch (e) { return []; }
  }

  async function recentGlobal(limit = 4, excludeSession = null) {
    try {
      const r = await pool.query(
        `SELECT content, created_at FROM jarvis_memory
         WHERE source=$1 AND type='conversation'
           AND ($3::text IS NULL OR metadata->>'session_id' IS DISTINCT FROM $3)
         ORDER BY created_at DESC LIMIT $2`, [MEMORY_SOURCE, limit, excludeSession]);
      return r.rows.reverse();
    } catch (e) { return []; }
  }

  function chunkText(text, maxChars = 900) {
    const paragraphs = String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const chunks = []; let buffer = "";
    for (const p of paragraphs) {
      if ((buffer + "\n\n" + p).length > maxChars && buffer) { chunks.push(buffer.trim()); buffer = p; }
      else buffer = buffer ? buffer + "\n\n" + p : p;
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }
  const limpiarBase64 = (input) => {
    const s = String(input || "").trim(); const c = s.indexOf(",");
    return s.startsWith("data:") && c !== -1 ? s.slice(c + 1) : s;
  };
  const tituloDesde = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 60);

  // Extrae hechos duraderos de lo que dijo el Operador (y los actualiza si cambiaron)
  async function extraerYGuardarHechos(message, sessionId) {
    try {
      const texto = String(message || "").trim();
      if (texto.length < 15) return;
      const raw = await callModel({
        provider: URUS_CHAT_PROVIDER, model: URUS_CHAT_MODEL,
        messages: [
          { role: "system", content:
            "Extraes hechos duraderos sobre el Operador SOLO de lo que él afirma en su mensaje. " +
            "Incluye: identidad, preferencias, proyectos, stack, clientes o personas, metas con fecha y decisiones que declara tomadas. " +
            "NO incluyas: preguntas, ideas que solo explora, hipótesis, ni nada que no haya dicho él. " +
            "Responde SOLO un array JSON de strings cortos en español. Si no hay ninguno, responde []" },
          { role: "user", content: texto.slice(0, 1500) },
        ],
        temperature: 0.1, max_tokens: 300,
      });
      const m = String(raw || "").match(/\[[\s\S]*\]/);
      if (!m) return;
      let hechos; try { hechos = JSON.parse(m[0]); } catch { return; }
      if (!Array.isArray(hechos)) return;
      for (const h of hechos.slice(0, 5)) {
        const res = await guardarHecho(h, sessionId);
        if (res !== "ignorado") console.log("[URUS_CHAT] hecho", res + ":", h);
      }
    } catch (e) { console.warn("[URUS_CHAT] extracción de hechos falló:", e.message); }
  }

  // ================================================================
  // WEB (Tavily) — ya no corre en cada mensaje; es una herramienta
  // ================================================================
  async function buscarWeb(query, { topic = "general", max = TAVILY_MAX_RESULTS } = {}) {
    const q = String(query || "").trim().slice(0, 380);
    if (!TAVILY_API_KEY) return { ok: false, error: "Falta TAVILY_API_KEY en el servidor", fuentes: [], texto: "" };
    if (!q) return { ok: false, error: "consulta vacía", fuentes: [], texto: "" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TAVILY_API_KEY}` },
        body: JSON.stringify({ query: q, search_depth: "advanced", max_results: max, include_answer: true, topic }),
        signal: controller.signal,
      });
      if (!r.ok) return { ok: false, error: `Tavily HTTP ${r.status}`, fuentes: [], texto: "" };
      const data = await r.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) return { ok: false, error: "sin resultados", fuentes: [], texto: "" };
      const texto = (data.answer ? `RESUMEN: ${data.answer}\n\n` : "") +
        results.map((x, i) => `[${i + 1}] ${x.title || "sin título"}\nURL: ${x.url}\n${String(x.content || "").replace(/\s+/g, " ").slice(0, 1000)}`).join("\n\n");
      return { ok: true, texto, fuentes: results.map((x) => ({ title: x.title || "", url: x.url || "" })) };
    } catch (e) {
      return { ok: false, error: e.name === "AbortError" ? "timeout 15s" : e.message, fuentes: [], texto: "" };
    } finally { clearTimeout(timeout); }
  }

  // ================================================================
  // FICHAS DE IDEAS
  // ================================================================
  async function resolveIdea(ref) {
    const s = String(ref || "").trim();
    if (!s) return null;
    if (/^[0-9a-f-]{6,36}$/i.test(s)) {
      const r = await pool.query(`SELECT * FROM urus_ideas WHERE id::text LIKE $1 || '%' LIMIT 1`, [s.toLowerCase()]);
      if (r.rows[0]) return r.rows[0];
    }
    const r = await pool.query(`SELECT * FROM urus_ideas WHERE titulo ILIKE $1 ORDER BY updated_at DESC LIMIT 1`, [`%${s}%`]);
    return r.rows[0] || null;
  }
  const short = (i) => ({ id: String(i.id).slice(0, 8), titulo: i.titulo, estado: i.estado, proyecto: i.proyecto, resumen: i.resumen });

  async function tableroTexto() {
    const r = await pool.query(
      `SELECT id, titulo, estado FROM urus_ideas WHERE estado NOT IN ('descartada') ORDER BY updated_at DESC LIMIT 25`);
    return r.rows.length
      ? r.rows.map((i) => `- [${String(i.id).slice(0, 8)}] ${i.titulo} — ${i.estado}`).join("\n")
      : "(sin fichas todavía)";
  }

  async function buildStatus(idea) {
    const b = idea.build || {};
    if (!b.project_id) return { estado: idea.estado, build: b };
    const r = await pool.query(
      `SELECT status, current_agent, deployed_url, error_log FROM factory_projects WHERE id=$1`, [b.project_id]);
    const p = r.rows[0];
    if (!p) return { estado: idea.estado, build: b, aviso: "project_id no encontrado en Factory" };
    let nuevoEstado = idea.estado;
    if (p.status === "delivered") nuevoEstado = "lista";
    else if (p.status === "failed") nuevoEstado = "error";
    if (nuevoEstado !== idea.estado || (p.deployed_url && p.deployed_url !== b.url)) {
      await pool.query(
        `UPDATE urus_ideas SET estado=$2, build = build || $3::jsonb, updated_at=now() WHERE id=$1`,
        [idea.id, nuevoEstado, JSON.stringify({ url: p.deployed_url || null, factory_status: p.status })]);
    }
    return { estado: nuevoEstado, factory_status: p.status, agente_actual: p.current_agent, url: p.deployed_url, error: p.status === "failed" ? p.error_log : null, build: b };
  }

  async function runBuild(idea) {
    const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
    const H = { "Content-Type": "application/json", "x-factory-key": process.env.FACTORY_API_KEY };
    const setB = (estado, patch) => pool.query(
      `UPDATE urus_ideas SET estado=$2, build = build || $3::jsonb, updated_at=now() WHERE id=$1`,
      [idea.id, estado, JSON.stringify(patch)]);
    const post = async (path, body, headers) => {
      const r = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
      const txt = await r.text();
      if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${txt.slice(0, 300)}`);
      try { return JSON.parse(txt); } catch { return {}; }
    };
    try {
      const transcript =
        `IDEA APROBADA POR EL OPERADOR: ${idea.titulo}\n\n${idea.resumen}\n\n` +
        (idea.informe ? `INFORME DE VIABILIDAD:\n${JSON.stringify(idea.informe)}\n\n` : "") +
        (idea.notas ? `NOTAS:\n${idea.notas}\n` : "");
      const s = await pool.query(
        `INSERT INTO factory_sessions (client_name, company, industry, status, transcript)
         VALUES ($1,$2,$3,'transcrita',$4) RETURNING id`,
        ["Josuan Bayón (URUS)", idea.titulo.slice(0, 120), idea.proyecto || "General", transcript]);
      const session_id = s.rows[0].id;
      await setB("construyendo", { etapa: "analizando", session_id });
      await post("/v1/factory/session/analyze", { session_id }, { "Content-Type": "application/json" });
      await setB("construyendo", { etapa: "propuesta" });
      await post("/v1/factory/session/proposal", { session_id }, H);
      const ap = await post("/v1/factory/project/approve", { session_id }, H);
      await setB("construyendo", { etapa: "orquestador", project_id: ap.project_id });
      console.log("[URUS_CHAT] Factory arrancó proyecto", ap.project_id, "para ficha", idea.id);
    } catch (e) {
      console.error("[URUS_CHAT] runBuild falló:", e.message);
      await setB("error", { etapa: "fallo", error: e.message }).catch(() => {});
    }
  }

  async function investigar(idea) {
    const prev = idea.estado;
    await pool.query(`UPDATE urus_ideas SET estado='investigando', updated_at=now() WHERE id=$1`, [idea.id]);
    try {
      const [a, b] = await Promise.all([
        buscarWeb(`${idea.titulo} market demand competitors viability`),
        buscarWeb(`${idea.titulo} ${idea.resumen}`.slice(0, 300) + " risks costs"),
      ]);
      const ok = [a, b].filter((x) => x.ok);
      if (!ok.length) throw new Error("No se pudo buscar en la web: " + (a.error || b.error));
      const fuentes = []; const seen = new Set();
      for (const x of ok) for (const f of x.fuentes) if (f.url && !seen.has(f.url)) { seen.add(f.url); fuentes.push(f); }
      const raw = await callModel({
        provider: URUS_CHAT_PROVIDER, model: URUS_CHAT_MODEL, temperature: 0.2, max_tokens: 1500,
        messages: [
          { role: "system", content:
            "Evalúas la viabilidad de una idea SOLO con las fuentes dadas. No inventes datos. Si las fuentes no alcanzan, dilo en falta_comprobar. " +
            'Responde SOLO JSON: {"viabilidad":"alta|media|baja","resumen":"3-4 frases","riesgos":["..."],"falta_comprobar":["..."],"recomendacion":"probar|descartar|posponer","por_que":"1-2 frases"}' },
          { role: "user", content: `IDEA: ${idea.titulo}\n${idea.resumen}\n\nFUENTES:\n${ok.map((x) => x.texto).join("\n\n").slice(0, 14000)}` },
        ],
      });
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (!m) throw new Error("El modelo no devolvió un informe válido");
      const informe = JSON.parse(m[0]);
      await pool.query(
        `UPDATE urus_ideas SET estado='investigada', informe=$2, fuentes=$3, updated_at=now() WHERE id=$1`,
        [idea.id, JSON.stringify(informe), JSON.stringify(fuentes.slice(0, 10))]);
      return { ok: true, ficha: short(idea), informe, fuentes: fuentes.slice(0, 8) };
    } catch (e) {
      await pool.query(`UPDATE urus_ideas SET estado=$2, updated_at=now() WHERE id=$1`, [idea.id, prev === "investigando" ? "nueva" : prev]);
      return { ok: false, error: e.message };
    }
  }

  // ================================================================
  // HERRAMIENTAS DEL AGENTE
  // ================================================================
  const TOOLS = {
    async crear_fichas({ ideas }, ctx) {
      if (!Array.isArray(ideas) || !ideas.length) return { error: "ideas debe ser un array no vacío" };
      const creadas = []; const repetidas = [];
      for (const i of ideas.slice(0, 15)) {
        const titulo = String(i.titulo || "").trim().slice(0, 140);
        if (!titulo) continue;
        const dup = await pool.query(
          `SELECT id FROM urus_ideas WHERE lower(titulo)=lower($1) AND estado <> 'descartada' LIMIT 1`, [titulo]);
        if (dup.rows[0]) { repetidas.push(titulo); continue; }
        const r = await pool.query(
          `INSERT INTO urus_ideas (titulo, resumen, proyecto, session_id) VALUES ($1,$2,$3,$4) RETURNING *`,
          [titulo, String(i.resumen || "").slice(0, 1500), String(i.proyecto || "GENERAL").slice(0, 60), ctx.sessionId]);
        creadas.push(short(r.rows[0]));
      }
      return { ok: true, creadas, ya_existian: repetidas };
    },
    async listar_fichas({ estado }) {
      const r = estado
        ? await pool.query(`SELECT * FROM urus_ideas WHERE estado=$1 ORDER BY updated_at DESC LIMIT 30`, [estado])
        : await pool.query(`SELECT * FROM urus_ideas ORDER BY updated_at DESC LIMIT 30`);
      return { ok: true, fichas: r.rows.map(short) };
    },
    async actualizar_ficha({ ref, estado, notas, titulo, resumen }) {
      const i = await resolveIdea(ref);
      if (!i) return { error: "ficha no encontrada" };
      if (estado && !ESTADOS.includes(estado)) return { error: "estado inválido. Válidos: " + ESTADOS.join(", ") };
      const r = await pool.query(
        `UPDATE urus_ideas SET estado=COALESCE($2,estado), notas=COALESCE($3,notas), titulo=COALESCE($4,titulo),
           resumen=COALESCE($5,resumen), updated_at=now() WHERE id=$1 RETURNING *`,
        [i.id, estado || null, notas ?? null, titulo || null, resumen || null]);
      return { ok: true, ficha: short(r.rows[0]) };
    },
    async investigar_ficha({ ref }) {
      const i = await resolveIdea(ref);
      if (!i) return { error: "ficha no encontrada" };
      return await investigar(i);
    },
    async construir_ficha({ ref }) {
      const i = await resolveIdea(ref);
      if (!i) return { error: "ficha no encontrada" };
      if (i.estado !== "aprobada") return { error: `La ficha está "${i.estado}". Debe estar "aprobada" por el Operador antes de construir.` };
      if (!process.env.FACTORY_API_KEY) return { error: "Falta FACTORY_API_KEY en el servidor" };
      await pool.query(`UPDATE urus_ideas SET estado='construyendo', build='{"etapa":"iniciando"}'::jsonb, updated_at=now() WHERE id=$1`, [i.id]);
      setImmediate(() => runBuild(i));
      return { ok: true, mensaje: "Construcción iniciada en segundo plano. Pide estado_construccion para ver el avance." };
    },
    async estado_construccion({ ref }) {
      const i = await resolveIdea(ref);
      if (!i) return { error: "ficha no encontrada" };
      return { ok: true, ficha: short(i), ...(await buildStatus(i)) };
    },
    async guardar_memoria({ hecho }, ctx) {
      return { ok: true, resultado: await guardarHecho(hecho, ctx.sessionId) };
    },
    async buscar_memoria({ consulta }) {
      const m = await searchMemory(String(consulta || ""), 8);
      return { ok: true, resultados: m.map((x) => ({ tipo: x.type, contenido: String(x.content).slice(0, 400) })) };
    },
    async buscar_web({ consulta }) {
      const w = await buscarWeb(consulta);
      return w.ok ? { ok: true, texto: w.texto.slice(0, 5000), fuentes: w.fuentes } : { ok: false, error: w.error };
    },
    async listar_skills() {
      const c = await pool.query(`SELECT name, description FROM urus_skills WHERE enabled`);
      return { ok: true, integradas: BUILTIN_SKILLS.map((s) => s.name), personalizadas: c.rows };
    },
  };

  async function runAgent(messages, ctx) {
    const used = []; const msgs = [...messages];
    for (let step = 0; step < 5; step++) {
      const out = await callModel({
        provider: URUS_CHAT_PROVIDER, model: URUS_CHAT_MODEL, messages: msgs, temperature: 0.4, max_tokens: 2500,
      });
      const m = String(out).match(/<tool>([\s\S]*?)<\/tool>/);
      if (!m) return { answer: String(out).trim(), used };
      let call;
      try { call = JSON.parse(m[1].trim()); }
      catch {
        msgs.push({ role: "assistant", content: out }, { role: "user", content: "RESULTADO: el JSON de la herramienta es inválido. Reintenta con JSON válido." });
        continue;
      }
      const fn = TOOLS[call.name];
      let result;
      if (!fn) result = { error: "herramienta desconocida: " + call.name };
      else { try { result = await fn(call.args || {}, ctx); } catch (e) { result = { error: e.message }; } }
      used.push({ tool: call.name, ok: !(result && result.error) });
      msgs.push(
        { role: "assistant", content: out },
        { role: "user", content: `RESULTADO ${call.name}: ${JSON.stringify(result).slice(0, 6000)}\nSi ya tienes lo necesario, responde al Operador en texto normal.` });
    }
    return { answer: "Ejecuté las acciones pedidas pero no pude cerrar la respuesta. Revisa el tablero de fichas.", used };
  }

  async function activeSkills(message) {
    let custom = [];
    try { custom = (await pool.query(`SELECT name, triggers, instructions FROM urus_skills WHERE enabled`)).rows; } catch (e) {}
    const lower = String(message).toLowerCase();
    return [...BUILTIN_SKILLS, ...custom]
      .filter((s) => (s.triggers || []).some((t) => lower.includes(String(t).toLowerCase())))
      .slice(0, 3);
  }

  // ================================================================
  // POST /chat
  // ================================================================
  router.post("/chat", auth, async (req, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      if (!message) return res.status(400).json({ ok: false, error: "message_required" });

      const sessionId = req.body?.session_id ? String(req.body.session_id) : crypto.randomUUID();
      const esNueva = !req.body?.session_id;

      const [core, relevant, turns, tablero, skills] = await Promise.all([
        coreMemory(20), searchMemory(message, 10), sessionTurns(sessionId, 10), tableroTexto(), activeSkills(message),
      ]);
      const coreSet = new Set(core.map((c) => c.content));
      const relevantOnly = relevant.filter((m) => !coreSet.has(m.content));
      const otros = turns.length < 6 ? await recentGlobal(4, sessionId) : [];

      const fmt = (m) => `- [${m.type || "nota"}] ${m.content}`;
      const ahora = new Date().toLocaleString("es-PR", { timeZone: "America/Puerto_Rico", dateStyle: "full", timeStyle: "short" });

      const system = [
        URUS_IDENTITY,
        `AHORA: ${ahora}`,
        "=== MEMORIA CENTRAL (lo que sabes del Operador) ===\n" + (core.length ? core.map(fmt).join("\n") : "(vacía)") + "\n=== FIN ===",
        "=== MEMORIA RELEVANTE A ESTE MENSAJE ===\n" + (relevantOnly.length ? relevantOnly.map(fmt).join("\n") : "(nada adicional)") + "\n=== FIN ===",
        "=== TABLERO DE IDEAS (estado real) ===\n" + tablero + "\n=== FIN ===",
        otros.length
          ? "=== OTROS CHATS RECIENTES ===\n" + otros.map((c) => `[${new Date(c.created_at).toISOString().slice(0, 16).replace("T", " ")}]\n${String(c.content).slice(0, 700)}`).join("\n\n") + "\n=== FIN ==="
          : "",
        skills.length ? "=== SKILLS ACTIVAS ===\n" + skills.map((s) => `[${s.name}] ${s.instructions}`).join("\n\n") + "\n=== FIN ===" : "",
        TOOLS_PROMPT,
      ].filter(Boolean).join("\n\n");

      const web = req.body?.web === true ? await buscarWeb(message) : null;
      const messages = [
        { role: "system", content: system + (web && web.ok ? "\n\nINFORMACIÓN DE INTERNET:\n" + web.texto : "") },
        ...turns,
        { role: "user", content: message },
      ];

      const { answer, used } = await runAgent(messages, { sessionId });

      setImmediate(async () => {
        try {
          await saveMemory(`Operador: ${message}\nURUS: ${answer}`, "conversation", {
            session_id: sessionId, title: tituloDesde(message), user: message, assistant: answer, at: new Date().toISOString(),
          });
          await extraerYGuardarHechos(message, sessionId);
        } catch (e) { console.warn("[URUS_CHAT] no se pudo guardar la conversación:", e.message); }
      });

      return res.json({
        ok: true, answer, session_id: sessionId, sesion_nueva: esNueva,
        herramientas: used, skills: skills.map((s) => s.name),
        memoria_central: core.length, memoria_relevante: relevantOnly.length, turnos_cargados: turns.length / 2,
        model_used: `${URUS_CHAT_PROVIDER}/${URUS_CHAT_MODEL}`,
      });
    } catch (e) {
      console.error("URUS_CHAT_ERROR", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ================================================================
  // IDEAS / SKILLS (API directa, para la página y para otras apps)
  // ================================================================
  router.get("/ideas", auth, async (req, res) => {
    try {
      const r = req.query.estado
        ? await pool.query(`SELECT * FROM urus_ideas WHERE estado=$1 ORDER BY updated_at DESC LIMIT 100`, [String(req.query.estado)])
        : await pool.query(`SELECT * FROM urus_ideas ORDER BY updated_at DESC LIMIT 100`);
      res.json({ ok: true, total: r.rows.length, ideas: r.rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.post("/ideas", auth, async (req, res) => {
    try { res.json(await TOOLS.crear_fichas({ ideas: req.body?.ideas }, { sessionId: null })); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.patch("/ideas/:id", auth, async (req, res) => {
    try {
      const out = await TOOLS.actualizar_ficha({ ref: req.params.id, ...req.body });
      res.status(out.error ? 400 : 200).json(out);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.post("/ideas/:id/investigar", auth, async (req, res) => {
    try {
      const i = await resolveIdea(req.params.id);
      if (!i) return res.status(404).json({ ok: false, error: "ficha no encontrada" });
      res.json(await investigar(i));
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.post("/ideas/:id/construir", auth, async (req, res) => {
    try {
      const out = await TOOLS.construir_ficha({ ref: req.params.id });
      res.status(out.error ? 400 : 200).json(out);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.get("/ideas/:id/estado", auth, async (req, res) => {
    try {
      const i = await resolveIdea(req.params.id);
      if (!i) return res.status(404).json({ ok: false, error: "ficha no encontrada" });
      res.json({ ok: true, ficha: short(i), ...(await buildStatus(i)) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get("/skills", auth, async (req, res) => {
    try {
      const c = await pool.query(`SELECT id, name, description, triggers, instructions, enabled FROM urus_skills ORDER BY name`);
      res.json({ ok: true, integradas: BUILTIN_SKILLS, personalizadas: c.rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.post("/skills", auth, async (req, res) => {
    try {
      const { name, description = "", triggers = [], instructions } = req.body || {};
      if (!name || !instructions || !Array.isArray(triggers) || !triggers.length) {
        return res.status(400).json({ ok: false, error: "name, instructions y triggers[] son requeridos" });
      }
      const r = await pool.query(
        `INSERT INTO urus_skills (name, description, triggers, instructions) VALUES ($1,$2,$3,$4)
         ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description, triggers=EXCLUDED.triggers, instructions=EXCLUDED.instructions, enabled=true
         RETURNING id, name`, [String(name).slice(0, 60), description, triggers.map(String), String(instructions).slice(0, 6000)]);
      res.json({ ok: true, skill: r.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  router.delete("/skills/:id", auth, async (req, res) => {
    try {
      const r = await pool.query(`DELETE FROM urus_skills WHERE id::text=$1 OR name=$1 RETURNING name`, [req.params.id]);
      res.json({ ok: true, borrados: r.rowCount });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ================================================================
  // learn / analyze / voice / sessions / memory / status (como antes)
  // ================================================================
  router.post("/learn", auth, async (req, res) => {
    try {
      const content = String(req.body?.content || "").trim();
      const type = String(req.body?.type || "fact").trim();
      if (!content) return res.status(400).json({ ok: false, error: "content_required" });
      const ids = [];
      for (const chunk of chunkText(content)) {
        const id = await saveMemory(chunk, type, { ingested_at: new Date().toISOString() });
        if (id) ids.push(id);
      }
      res.json({ ok: true, fragmentos_guardados: ids.length, type, ids });
    } catch (e) { console.error("URUS_LEARN_ERROR", e); res.status(500).json({ ok: false, error: e.message }); }
  });

  router.post("/analyze", auth, async (req, res) => {
    try {
      const fileB64 = limpiarBase64(req.body?.file_base64);
      const mimeType = String(req.body?.mime_type || "").trim().toLowerCase();
      const filename = String(req.body?.filename || "archivo").trim();
      const message = String(req.body?.message || "").trim();
      const sessionId = req.body?.session_id ? String(req.body.session_id) : null;
      const recordar = req.body?.recordar !== false;
      if (!fileB64) return res.status(400).json({ ok: false, error: "file_base64_required" });
      if (!mimeType) return res.status(400).json({ ok: false, error: "mime_type_required" });

      const instruccion = message || "Analiza este archivo. Extrae lo importante, los datos concretos, y dime qué implica para el Operador. Sin relleno.";
      const memories = await searchMemory(message || filename, 8);
      const systemPrompt = URUS_IDENTITY + "\n\n=== MEMORIA RECUPERADA ===\n" +
        (memories.length ? memories.map((m) => `- [${m.type || "nota"}] ${m.content}`).join("\n") : "(Sin memoria relevante.)") + "\n=== FIN MEMORIA ===";

      let answer, modoUsado;
      if (mimeType.startsWith("image/")) {
        const v = await getOpenAIClient().chat.completions.create({
          model: URUS_VISION_MODEL, max_tokens: 2500,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: [{ type: "text", text: instruccion }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileB64}` } }] },
          ],
        });
        answer = v.choices[0].message.content; modoUsado = `vision/${URUS_VISION_MODEL}`;
      } else if (mimeType === "application/pdf") {
        let pdfParse;
        try { pdfParse = require("pdf-parse"); }
        catch (e) { return res.status(501).json({ ok: false, error: "pdf_parse_no_instalado", hint: "npm i pdf-parse" }); }
        const parsed = await pdfParse(Buffer.from(fileB64, "base64"));
        const texto = String(parsed.text || "").trim();
        if (!texto) return res.status(422).json({ ok: false, error: "pdf_sin_texto", hint: "PDF escaneado: conviértelo a imagen." });
        const MAX = 60000; const recortado = texto.length > MAX;
        answer = await callModel({
          provider: URUS_CHAT_PROVIDER, model: URUS_CHAT_MODEL, temperature: 0.4, max_tokens: 2500,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `ARCHIVO: ${filename} (${parsed.numpages} páginas${recortado ? ", recortado" : ""})\n\n=== CONTENIDO ===\n${texto.slice(0, MAX)}\n=== FIN ===\n\n${instruccion}` },
          ],
        });
        modoUsado = `pdf/${URUS_CHAT_PROVIDER}/${URUS_CHAT_MODEL}`;
      } else {
        return res.status(415).json({ ok: false, error: "tipo_no_soportado", hint: "Solo image/* y application/pdf" });
      }

      let memoria_id = null;
      if (recordar) {
        try {
          memoria_id = await saveMemory(`DOCUMENTO: ${filename}\nPregunta: ${instruccion}\nAnálisis: ${answer}`, "document",
            { filename, mime_type: mimeType, session_id: sessionId, at: new Date().toISOString() });
        } catch (e) { console.warn("[URUS_CHAT] no se pudo guardar el análisis:", e.message); }
      }
      res.json({ ok: true, answer, filename, modo: modoUsado, memories_used: memories.length, session_id: sessionId, memoria_id });
    } catch (e) { console.error("URUS_ANALYZE_ERROR", e); res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get("/sessions", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const r = await pool.query(
        `SELECT metadata->>'session_id' AS session_id, MIN(created_at) AS iniciada, MAX(created_at) AS ultima,
                COUNT(*)::int AS intercambios, (ARRAY_AGG(metadata->>'title' ORDER BY created_at ASC))[1] AS titulo
         FROM jarvis_memory
         WHERE source=$1 AND type='conversation' AND metadata->>'session_id' IS NOT NULL
         GROUP BY metadata->>'session_id' ORDER BY MAX(created_at) DESC LIMIT $2`, [MEMORY_SOURCE, limit]);
      res.json({ ok: true, total: r.rows.length, sesiones: r.rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get("/session/:id", auth, async (req, res) => {
    try {
      const sessionId = String(req.params.id);
      const r = await pool.query(
        `SELECT id, content, metadata, created_at FROM jarvis_memory
         WHERE source=$1 AND type='conversation' AND metadata->>'session_id'=$2 ORDER BY created_at ASC`, [MEMORY_SOURCE, sessionId]);
      const messages = [];
      for (const row of r.rows) {
        const meta = row.metadata || {};
        if (meta.user) {
          messages.push({ role: "user", content: meta.user, at: row.created_at });
          messages.push({ role: "assistant", content: meta.assistant || "", at: row.created_at });
        } else messages.push({ role: "raw", content: row.content, at: row.created_at });
      }
      res.json({ ok: true, session_id: sessionId, intercambios: r.rows.length, messages });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.delete("/session/:id", auth, async (req, res) => {
    try {
      const r = await pool.query(
        `DELETE FROM jarvis_memory WHERE source=$1 AND type='conversation' AND metadata->>'session_id'=$2 RETURNING id`,
        [MEMORY_SOURCE, String(req.params.id)]);
      res.json({ ok: true, borrados: r.rowCount, session_id: req.params.id });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.post("/voice", auth, async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim().slice(0, 4096);
      const voice = String(req.body?.voice || "onyx");
      if (!text) return res.status(400).json({ ok: false, error: "text_required" });
      const mp3 = await getOpenAIClient().audio.speech.create({ model: "tts-1-hd", voice, input: text, speed: 1.0 });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      res.set({ "Content-Type": "audio/mpeg", "Content-Length": buffer.length });
      res.send(buffer);
    } catch (e) { console.error("URUS_VOICE_ERROR", e); res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get("/memory", auth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const tipo = req.query.type ? String(req.query.type) : null;
      const r = tipo
        ? await pool.query(`SELECT id, type, content, created_at, (embedding IS NOT NULL) AS tiene_embedding FROM jarvis_memory WHERE source=$1 AND type=$2 ORDER BY created_at DESC LIMIT $3`, [MEMORY_SOURCE, tipo, limit])
        : await pool.query(`SELECT id, type, content, created_at, (embedding IS NOT NULL) AS tiene_embedding FROM jarvis_memory WHERE source=$1 ORDER BY created_at DESC LIMIT $2`, [MEMORY_SOURCE, limit]);
      res.json({ ok: true, total: r.rows.length, memorias: r.rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get("/status", auth, async (req, res) => {
    try {
      const count = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS con_embedding FROM jarvis_memory WHERE source=$1`, [MEMORY_SOURCE]);
      const porTipo = await pool.query(`SELECT type, COUNT(*)::int AS n FROM jarvis_memory WHERE source=$1 GROUP BY type ORDER BY n DESC`, [MEMORY_SOURCE]);
      const ideas = await pool.query(`SELECT estado, COUNT(*)::int AS n FROM urus_ideas GROUP BY estado`);
      res.json({
        ok: true, version: "urus-chat-v2", chat_provider: URUS_CHAT_PROVIDER, chat_model: URUS_CHAT_MODEL,
        web_search: TAVILY_API_KEY ? "tavily" : "off", factory: process.env.FACTORY_API_KEY ? "configurado" : "falta FACTORY_API_KEY",
        embeddings: process.env.OPENAI_API_KEY ? "ok" : "falta OPENAI_API_KEY",
        memoria: count.rows[0], por_tipo: porTipo.rows, fichas: ideas.rows, gateway: gatewayStatus(),
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ================================================================
  // COMMAND CENTER (página). Pide la contraseña en el navegador.
  // ================================================================
  router.get("/center", (req, res) => {
    res.type("html").send(CENTER_HTML);
  });

  return router;
};

const CENTER_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>URUS Command Center</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#0b0b0d;color:#eee;display:grid;grid-template-columns:1fr 420px;height:100vh}
@media(max-width:900px){body{grid-template-columns:1fr;grid-template-rows:55vh 45vh}}
.col{display:flex;flex-direction:column;min-height:0;border-right:1px solid #222}
h2{margin:0;padding:14px 16px;font-size:14px;letter-spacing:.08em;color:#c9a84c;border-bottom:1px solid #222}
#log,#board{flex:1;overflow:auto;padding:12px 16px}
.m{margin:0 0 12px;white-space:pre-wrap;line-height:1.5;font-size:14px}.u{color:#9ecbff}.a{color:#eee}.t{color:#777;font-size:12px}
form{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #222}
textarea{flex:1;background:#141418;color:#eee;border:1px solid #2a2a30;border-radius:8px;padding:10px;font:inherit;resize:none;height:64px}
button{background:#c9a84c;color:#111;border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer}button.s{background:#222;color:#ddd;font-weight:500;padding:5px 9px;font-size:12px}
.card{background:#141418;border:1px solid #26262c;border-radius:10px;padding:12px;margin-bottom:10px}
.card b{font-size:14px}.st{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;background:#26262c;color:#c9a84c;margin-left:6px}
.card p{margin:6px 0;font-size:13px;color:#bbb}.row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.src a{color:#7fb6ff;font-size:12px;display:block}
</style></head><body>
<div class="col"><h2>URUS · CHAT</h2><div id="log"></div>
<form id="f"><textarea id="q" placeholder="Tengo estas ideas: ..."></textarea><button>Enviar</button></form></div>
<div class="col" style="border:0"><h2>BANDEJA DE IDEAS</h2><div id="board"></div></div>
<script>
var PW=localStorage.getItem("urus_pw")||prompt("Contraseña de URUS:");if(PW)localStorage.setItem("urus_pw",PW);
var SID=localStorage.getItem("urus_sid")||"";
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function api(p,o){o=o||{};o.headers=Object.assign({"Content-Type":"application/json","x-studio-password":PW},o.headers||{});
return fetch("/v1/urus"+p,o).then(function(r){if(r.status==401){localStorage.removeItem("urus_pw");alert("Contraseña incorrecta");}return r.json()})}
function add(cls,t){var d=document.createElement("div");d.className="m "+cls;d.textContent=t;var l=document.getElementById("log");l.appendChild(d);l.scrollTop=l.scrollHeight;return d}
function load(){if(!SID)return;api("/session/"+SID).then(function(r){(r.messages||[]).forEach(function(m){add(m.role==="user"?"u":"a",(m.role==="user"?"Tú: ":"URUS: ")+m.content)})})}
function board(){api("/ideas").then(function(r){var b=document.getElementById("board");if(!r.ideas){return}
b.innerHTML=r.ideas.length?"":'<p class="t">Sin fichas. Dile a URUS tus ideas.</p>';
r.ideas.forEach(function(i){var inf=i.informe;var h='<div class="card"><b>'+esc(i.titulo)+'</b><span class="st">'+esc(i.estado)+'</span><p>'+esc(i.resumen)+'</p>';
if(inf){h+='<p><b>'+esc(inf.recomendacion)+'</b> · viabilidad '+esc(inf.viabilidad)+'<br>'+esc(inf.resumen)+'</p>';
if(inf.falta_comprobar&&inf.falta_comprobar.length)h+='<p>Falta comprobar: '+inf.falta_comprobar.map(esc).join("; ")+'</p>';
h+='<div class="src">'+(i.fuentes||[]).slice(0,4).map(function(f){return'<a target="_blank" href="'+esc(f.url)+'">'+esc(f.title||f.url)+'</a>'}).join("")+'</div>'}
if(i.build&&i.build.url)h+='<p><a style="color:#7fb6ff" target="_blank" href="https://'+esc(String(i.build.url).replace(/^https?:\\/\\//,""))+'">Abrir app</a></p>';
if(i.build&&i.build.error)h+='<p style="color:#f77">'+esc(i.build.error)+'</p>';
h+='<div class="row">';
h+='<button class="s" data-a="inv" data-id="'+i.id+'">Investigar</button>';
h+='<button class="s" data-a="apr" data-id="'+i.id+'">Aprobar</button>';
h+='<button class="s" data-a="con" data-id="'+i.id+'">Construir</button>';
h+='<button class="s" data-a="est" data-id="'+i.id+'">Estado</button>';
h+='<button class="s" data-a="des" data-id="'+i.id+'">Descartar</button></div></div>';
b.insertAdjacentHTML("beforeend",h)})})}
document.getElementById("board").addEventListener("click",function(e){var t=e.target;if(!t.dataset.a)return;var id=t.dataset.id,a=t.dataset.a;t.disabled=true;
var p;if(a==="inv"){t.textContent="Investigando...";p=api("/ideas/"+id+"/investigar",{method:"POST"})}
else if(a==="apr")p=api("/ideas/"+id,{method:"PATCH",body:JSON.stringify({estado:"aprobada"})});
else if(a==="des")p=api("/ideas/"+id,{method:"PATCH",body:JSON.stringify({estado:"descartada"})});
else if(a==="con"){if(!confirm("¿Enviar a Factory?")){t.disabled=false;return}p=api("/ideas/"+id+"/construir",{method:"POST"})}
else p=api("/ideas/"+id+"/estado");
p.then(function(r){if(r.error)alert(r.error);board()})});
document.getElementById("f").addEventListener("submit",function(e){e.preventDefault();var q=document.getElementById("q"),m=q.value.trim();if(!m)return;q.value="";add("u","Tú: "+m);var w=add("t","pensando...");
api("/chat",{method:"POST",body:JSON.stringify({message:m,session_id:SID||undefined})}).then(function(r){w.remove();
if(r.session_id){SID=r.session_id;localStorage.setItem("urus_sid",SID)}
add("a","URUS: "+(r.answer||r.error));if(r.herramientas&&r.herramientas.length)add("t","herramientas: "+r.herramientas.map(function(h){return h.tool+(h.ok?"":" (falló)")}).join(", "));board()})});
document.getElementById("q").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();document.getElementById("f").requestSubmit()}});
load();board();setInterval(board,20000);
</script></body></html>`;
