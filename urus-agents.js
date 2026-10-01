/**
 * URUS AGENTS — 5 agentes en paralelo (sin OpenAI, con Tavily gratis)
 */

const express = require("express");
const { callModel } = require("./urus-gateway");

const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || "urus2026";
const URUS_CHAT_PROVIDER = process.env.URUS_CHAT_PROVIDER || "deepseek";
const URUS_CHAT_MODEL = process.env.URUS_CHAT_MODEL || "deepseek-chat";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

const AGENT_PROMPTS = {
  STRATEGIST: `Eres STRATEGIST. Tu rol es analizar la PREGUNTA y proponer:
1. ¿Cuál es el verdadero problema?
2. ¿Dónde está la oportunidad real?
3. ¿Cuál es el siguiente movimiento concreto?
Sé directo. Sin relleno. Máximo 200 palabras.`,

  RESEARCHER: `Eres RESEARCHER. Tu rol es:
1. Buscar la información que SE NECESITA (no todo)
2. Traer solo lo relevante
3. Citar fuentes oficiales cuando sea posible
Responde con hechos verificables. Máximo 300 palabras.`,

  VERIFIER: `Eres VERIFIER. Tu rol es:
1. Detectar números contradictorios
2. Verificar fechas (¿vencidas? ¿próximas?)
3. Marcar inconsistencias o huecos en la información
Sé meticuloso. Máximo 200 palabras.`,

  ANALYZER: `Eres ANALYZER. Tu rol es:
1. Conectar ideas entre lo que sabe de memoria y lo nuevo
2. Detectar patrones recurrentes
3. Marcar cambios importantes
Piensa sistémico. Máximo 250 palabras.`,

  SIMULATOR: `Eres SIMULATOR. Tu rol es:
1. Proyectar 3 escenarios posibles (mejor, medio, peor)
2. Estimar probabilidad de cada uno
3. Marcar puntos de inflexión
Sé realista. Máximo 250 palabras.`,
};

  RISK_ASSESSOR: `Eres RISK_ASSESSOR. Tu rol es:
1. Identificar riesgos reales y concretos
2. Evaluar probabilidad e impacto
3. Proponer mitigaciones específicas
Sé meticuloso. Máximo 250 palabras.`,



module.exports = function urusAgentsRouter(pool) {
  const router = express.Router();

  function auth(req, res, next) {
    if (req.headers["x-studio-password"] !== STUDIO_PASSWORD) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
  }

  async function buscarWeb(query) {
    const q = String(query || "").trim().slice(0, 380);
    if (!TAVILY_API_KEY || !q) return { ok: false, texto: "", fuentes: [] };

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
          max_results: 5,
          include_answer: true,
          include_raw_content: true,
          topic: "news",
        }),
        signal: controller.signal,
      });

      if (!r.ok) return { ok: false, texto: "", fuentes: [] };
      const data = await r.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (results.length === 0) return { ok: false, texto: "", fuentes: [] };

      const bloques = results
        .map((item, i) => {
          const titulo = String(item.title || "").trim();
          const url = String(item.url || "").trim();
          const cuerpo = String(item.content || "").replace(/\s+/g, " ").trim().slice(0, 800);
          return `[${i + 1}] ${titulo}\nURL: ${url}\n${cuerpo}`;
        })
        .join("\n\n");

      return {
        ok: true,
        texto: bloques,
        fuentes: results.map((x) => ({ title: x.title || "", url: x.url || "" })),
      };
    } catch (e) {
      return { ok: false, texto: "", fuentes: [] };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function runAgent(agentName, query, context = "") {
    const prompt = AGENT_PROMPTS[agentName];
    if (!prompt) return { agent: agentName, ok: false, error: "Agent not found" };

    try {
      const systemPrompt = `${prompt}\n\nCONTEXTO:\n${context || "Sin contexto previo"}`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ];

      const answer = await callModel({
        provider: URUS_CHAT_PROVIDER,
        model: URUS_CHAT_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 1200,
      });

      return { agent: agentName, ok: true, analysis: answer };
    } catch (e) {
      return { agent: agentName, ok: false, error: e.message };
    }
  }

  async function masterOrchestrate(query, context = "") {
const agents = ["STRATEGIST", "RESEARCHER", "VERIFIER", "ANALYZER", "SIMULATOR", "RISK_ASSESSOR", "TIMELINE_PLANNER", "BUDGET_OPTIMIZER"];    const results = await Promise.all(agents.map((agent) => runAgent(agent, query, context)));

    const synthesis = {
      query: query,
      agents_output: {},
      confidence: 0,
    };

    let successCount = 0;
    for (const result of results) {
      if (result.ok) {
        synthesis.agents_output[result.agent] = result.analysis;
        successCount++;
      }
    }

    synthesis.confidence = Math.round((successCount / agents.length) * 100);
    return synthesis;
  }

  router.post("/agents", auth, async (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      const context = String(req.body?.context || "").trim();

      if (!query) return res.status(400).json({ ok: false, error: "query_required" });

      const web = await buscarWeb(query);
      const contextWithWeb = context + (web.ok ? `\n\nINFORMACIÓN DE INTERNET:\n${web.texto}` : "");
      const synthesis = await masterOrchestrate(query, contextWithWeb);

      const finalSynthesis = `ANÁLISIS DE 5 AGENTES:

ESTRATEGIA (STRATEGIST):
${synthesis.agents_output.STRATEGIST || "N/A"}

INVESTIGACIÓN (RESEARCHER):
${synthesis.agents_output.RESEARCHER || "N/A"}

VERIFICACIÓN (VERIFIER):
${synthesis.agents_output.VERIFIER || "N/A"}

ANÁLISIS DE PATRONES (ANALYZER):
${synthesis.agents_output.ANALYZER || "N/A"}

SIMULACIÓN DE ESCENARIOS (SIMULATOR):
${synthesis.agents_output.SIMULATOR || "N/A"}

---
Confianza: ${synthesis.confidence}%`;

      return res.json({
        ok: true,
        synthesis: finalSynthesis,
        agents_data: synthesis.agents_output,
        confidence_score: synthesis.confidence,
        sources: web.fuentes,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get("/agents/status", auth, async (req, res) => {
    return res.json({
      ok: true,
      agents: Object.keys(AGENT_PROMPTS),
      model: URUS_CHAT_MODEL,
      web_search: TAVILY_API_KEY ? "enabled" : "disabled",
    });
  });

  return router;
};
