/**
 * URUS OS v2 — REGISTRY
 * El catálogo vivo del sistema. Para agregar una capacidad nueva solo se toca ESTE archivo:
 *   - nuevo modelo      → MODELS (+ CHAINS si quieres que se use en una ruta)
 *   - nueva herramienta → TOOLS aquí + su implementación en tools.js
 *   - nueva skill       → SKILLS
 *   - nuevo agente      → AGENTS
 * Regla: aquí solo vive lo que EXISTE y funciona. Lo futuro va en PLANNED_TOOLS.
 */
'use strict';

// ─────────────────────────────────────────────────────────────
// MODELOS  (nombres verificados contra la documentación oficial el 2026-11-25,
//           salvo los de OpenAI, que son los que ya usas en tu servidor)
// Cada nombre se puede cambiar por variable de entorno sin tocar código.
// ─────────────────────────────────────────────────────────────
const MODELS = {
  'deepseek-v4-flash': { provider: 'deepseek',  model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',          strengths: ['barato', 'rápido', 'código', 'análisis'], cost: 'muy bajo' },
  'deepseek-v4-pro':   { provider: 'deepseek',  model: process.env.DEEPSEEK_PRO_MODEL || 'deepseek-v4-pro',         strengths: ['razonamiento', 'código difícil'],         cost: 'bajo' },
  'gpt-4o':            { provider: 'openai',    model: process.env.URUS_OS_OPENAI_MODEL || 'gpt-4o',               strengths: ['análisis', 'estrategia', 'síntesis'],     cost: 'alto' },
  'gpt-4o-mini':       { provider: 'openai',    model: process.env.URUS_OS_OPENAI_MINI_MODEL || 'gpt-4o-mini',     strengths: ['rápido', 'verificación', 'clasificación'], cost: 'bajo' },
  'claude-sonnet-5-5': { provider: 'anthropic', model: process.env.URUS_OS_CLAUDE_MODEL || 'claude-sonnet-5-5',     strengths: ['escritura', 'código', 'instrucciones largas'], cost: 'alto' },
  'claude-haiku-5-5':  { provider: 'anthropic', model: process.env.URUS_OS_CLAUDE_FAST_MODEL || 'claude-haiku-5-5', strengths: ['rápido', 'resúmenes'],                    cost: 'bajo' },
  'claude-opus-5-5':   { provider: 'anthropic', model: process.env.URUS_OS_CLAUDE_TOP_MODEL || 'claude-opus-5-5',   strengths: ['máxima calidad'],                         cost: 'muy alto' },
  'gemini-3.7-flash':  { provider: 'gemini',    model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',             strengths: ['contexto largo', 'multimodal', 'rápido'], cost: 'bajo' },
  'gpt-oss-120b':      { provider: 'groq',      model: process.env.GROQ_MODEL_LARGE || 'openai/gpt-oss-120b',      strengths: ['muy rápido', 'barato'],                   cost: 'muy bajo' },
  'gpt-oss-20b':       { provider: 'groq',      model: process.env.GROQ_MODEL_SMALL || 'openai/gpt-oss-20b',       strengths: ['ultra rápido'],                           cost: 'muy bajo' },
  'grok-latest':       { provider: 'xai',       model: process.env.XAI_MODEL || 'grok-latest',                     strengths: ['razonamiento', 'datos recientes'],        cost: 'medio' },
};

// RUTAS: tipo de trabajo → cadena de modelos (se prueba en orden; se salta el que no tenga API key)
// DeepSeek primero (es el que está pagado y funcionando). Groq como respaldo gratuito/rápido.
// OpenAI y Anthropic quedan al FINAL: si algún día vuelven a tener crédito, entran solos como último recurso.
// Se puede sobrescribir cualquier ruta desde Railway con URUS_OS_CHAIN_<RUTA>.
const CHAINS = {
  planning:  ['deepseek-v4-flash', 'gpt-oss-120b', 'claude-haiku-5-5', 'gpt-4o-mini'],
  fast:      ['deepseek-v4-flash', 'gpt-oss-20b', 'gpt-4o-mini'],
  research:  ['deepseek-v4-flash', 'gpt-oss-120b', 'gemini-3.7-flash', 'gpt-4o-mini'],
  scraping:  ['deepseek-v4-flash', 'gpt-oss-120b', 'gpt-4o-mini'],
  analysis:  ['deepseek-v4-pro', 'gpt-oss-120b', 'claude-sonnet-5-5', 'gpt-4o'],
  writing:   ['deepseek-v4-pro', 'deepseek-v4-flash', 'claude-sonnet-5-5', 'gpt-4o'],
  coding:    ['deepseek-v4-pro', 'deepseek-v4-flash', 'claude-sonnet-5-5', 'gpt-4o'],
  reasoning: ['deepseek-v4-pro', 'grok-latest', 'gpt-4o'],
  verify:    ['deepseek-v4-flash', 'gpt-oss-20b', 'gpt-4o-mini'],
  longdoc:   ['deepseek-v4-pro', 'gemini-3.7-flash', 'claude-sonnet-5-5', 'gpt-4o'],
};

/**
 * Cadena de una ruta. Se puede sobrescribir desde Railway SIN tocar código:
 *   URUS_OS_CHAIN_WRITING = anthropic:claude-sonnet-5-5,openai:gpt-4o
 * (formato proveedor:modelo separados por coma)
 */
function chainFor(route) {
  const envv = process.env['URUS_OS_CHAIN_' + String(route).toUpperCase()];
  if (envv) {
    const parsed = envv.split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf(':');
      return i > 0 ? { provider: p.slice(0, i), model: p.slice(i + 1) } : null;
    }).filter(Boolean);
    if (parsed.length) return parsed;
  }
  const ids = CHAINS[route] || CHAINS.fast;
  return ids.map((id) => MODELS[id]).filter(Boolean).map((m) => ({ provider: m.provider, model: m.model }));
}

// ─────────────────────────────────────────────────────────────
// HERRAMIENTAS — solo las que están implementadas en tools.js
// ─────────────────────────────────────────────────────────────
const TOOLS = {
  web_search: {
    description: 'Busca en internet (Tavily). Devuelve una respuesta resumida y resultados con URL.',
    input: '{"query":"texto","topic":"general|news (opcional)","max_results":5}',
    needs_env: ['TAVILY_API_KEY'],
  },
  web_scrape: {
    description: 'Descarga una página web y devuelve título, texto y enlaces. mode:"html" devuelve el HTML para diseñar una extracción. render:true usa un navegador real (más lento) para páginas que cargan con JavaScript.',
    input: '{"url":"https://...","mode":"text|links|html (opcional)","render":false}',
    needs_env: [],
  },
  pdf_extract: {
    description: 'Descarga un PDF desde una URL y extrae su texto.',
    input: '{"url":"https://.../archivo.pdf"}',
    needs_env: [],
  },
  rss_fetch: {
    description: 'Lee un feed RSS/Atom y devuelve los artículos más recientes.',
    input: '{"url":"https://.../feed","limit":10}',
    needs_env: [],
  },
  youtube_search: {
    description: 'Busca videos o canales en YouTube con estadísticas (vistas, suscriptores).',
    input: '{"query":"texto","type":"video|channel","max_results":8}',
    needs_env: ['YOUTUBE_API_KEY'],
  },
  memory_search: {
    description: 'Busca en la memoria del Operador y del proyecto (por significado).',
    input: '{"query":"texto","scope":"all|project|personal","limit":5}',
    needs_env: [],
  },
  memory_save: {
    description: 'Guarda en la memoria del proyecto un apunte, decisión, idea o entrada de diario.',
    input: '{"content":"texto","type":"note|journal|decision|idea|insight"}',
    needs_env: [],
  },
};

// Lo que todavía NO existe (no se ofrece a ningún agente).
const PLANNED_TOOLS = [
  'github_read / github_write (hoy lo hace Studio)',
  'whatsapp_send (requiere flujo de aprobación)',
  'email, calendario',
  'ejecución de código en sandbox aislado',
];

function toolStatus(name) {
  const t = TOOLS[name];
  if (!t) return { ok: false, reason: 'no existe' };
  const missing = (t.needs_env || []).filter((k) => !process.env[k]);
  return missing.length ? { ok: false, reason: 'falta ' + missing.join(', ') } : { ok: true };
}

function toolsStatus() {
  const out = {};
  for (const n of Object.keys(TOOLS)) out[n] = toolStatus(n);
  return out;
}

function describeTools(names) {
  return names.map((n) => '- ' + n + ': ' + TOOLS[n].description + '\n  input: ' + TOOLS[n].input).join('\n');
}

// ─────────────────────────────────────────────────────────────
// SKILLS — instrucciones reutilizables (se inyectan en el agente cuando el plan las usa)
// ─────────────────────────────────────────────────────────────
const SKILLS = {
  web_research: {
    description: 'Investigar un tema en internet y sintetizar hallazgos con fuentes.',
    instructions: 'Investiga con web_search (1 a 3 búsquedas DISTINTAS). Si un snippet no basta, abre la fuente más relevante con web_scrape. Entrega: hallazgos concretos con la URL de cada fuente, qué está verificado y qué es inferencia, y qué información falta.',
  },
  document_analysis: {
    description: 'Analizar PDFs o textos y extraer requisitos, fechas, montos y condiciones.',
    instructions: 'Si hay URL de PDF usa pdf_extract. Extrae requisitos, fechas, montos y condiciones. Señala ambigüedades y cualquier cosa que haya que confirmar con la fuente original.',
  },
  rss_monitoring: {
    description: 'Monitorear feeds RSS y resumir novedades relevantes.',
    instructions: 'Usa rss_fetch con los feeds indicados. Resume solo lo relevante para el Operador, ordenado por importancia, con enlace a cada ítem.',
  },
  data_extraction: {
    description: 'Extraer datos estructurados de páginas o documentos.',
    instructions: 'Entrega los datos en tabla markdown o JSON dentro de un bloque de código. Indica de dónde salió cada campo y qué tan confiable es. No rellenes campos que no viste.',
  },
  strategic_analysis: {
    description: 'Analizar una situación, evaluar opciones y recomendar.',
    instructions: 'Define el problema real, evalúa 2 o 3 opciones con pros y contras, recomienda una y cierra con UN próximo movimiento concreto. Marca los supuestos.',
  },
  decision_support: {
    description: 'Ayudar a decidir entre varias opciones.',
    instructions: 'Define criterios, compara las opciones en una matriz simple, recomienda y di qué dato cambiaría la decisión. Si el Operador no sabe qué quiere, ofrece 3 caminos distintos y qué implica cada uno.',
  },
  planning: {
    description: 'Convertir un objetivo en hitos y pasos ordenados.',
    instructions: 'Descompón en hitos con orden y dependencias, esfuerzo estimado y el primer paso que se puede hacer hoy.',
  },
  content_writing: {
    description: 'Escribir contenido: artículos, emails, posts, guiones.',
    instructions: 'Escribe el texto completo, listo para usar, en español natural y directo. Sin relleno ni frases de coach.',
  },
  youtube_research: {
    description: 'Validar nichos y analizar canales y tendencias de YouTube.',
    instructions: 'Usa youtube_search para validar el nicho: canales líderes, videos con más vistas, frecuencia de publicación y huecos. Usa web_search para tendencias. Entrega el nicho o ángulo recomendado respaldado con las cifras que devolvieron las herramientas.',
  },
  youtube_scripting: {
    description: 'Escribir guiones de video completos.',
    instructions: 'Escribe el guion completo listo para grabar: hook (primeros 15 segundos), secciones con tiempos aproximados, indicaciones visuales y CTA. Sin relleno.',
  },
  youtube_seo: {
    description: 'Títulos, descripciones y tags para YouTube.',
    instructions: 'Entrega 5 títulos (palabra clave al inicio), una descripción de 150 a 200 palabras, 10 a 15 tags, ideas de miniatura y capítulos. Si tienes YouTube API, contrasta con videos que ya posicionan.',
  },
  content_ideation: {
    description: 'Generar y priorizar ideas de contenido.',
    instructions: 'Genera 10 ideas y priorízalas por impacto, esfuerzo y diferenciación. Recomienda las 3 primeras y explica por qué.',
  },
  journal_capture: {
    description: 'Convertir lo que el Operador cuenta en una entrada estructurada del libro/diario.',
    instructions: 'Estructura: Contexto, Qué pasó, Aprendizaje, Principio (una sola frase) y Conexión con ideas previas (usa memory_search). Guarda la entrada con memory_save type "journal". NO inventes detalles: lo que falte, márcalo como [pendiente].',
  },
  book_structuring: {
    description: 'Estructurar partes, capítulos y arco de un libro.',
    instructions: 'Propón estructura (partes, capítulos, arco), qué material ya guardado encaja en cada parte (usa memory_search) y qué falta escribir. Respeta lo que ya existe.',
  },
  narrative_writing: {
    description: 'Escribir o continuar texto narrativo manteniendo la voz.',
    instructions: 'Usa memory_search para recuperar voz, personajes y datos ya establecidos y mantén coherencia. Entrega el texto y una nota breve de decisiones narrativas. Guarda hechos canon nuevos con memory_save type "note".',
  },
  web_scraping_design: {
    description: 'Diseñar y probar la extracción de datos de un sitio.',
    instructions: '1) Inspecciona la página con web_scrape (mode "html" para ver la estructura; render:true si el contenido no aparece). 2) Define los campos a extraer y dónde viven. 3) Extrae una muestra real con lo que ves. 4) Entrega un plan de scraper reproducible (selectores o patrones) y la muestra. Indica límites: términos del sitio, paginación y riesgo de bloqueo.',
  },
  council_analysis: {
    description: 'Panel de analistas en paralelo sobre un mismo problema.',
    instructions: 'Panel automático. No requiere instrucciones adicionales.',
  },
  code_generation: {
    description: 'Escribir código funcional.',
    instructions: 'Escribe código completo y funcional, sin placeholders. Indica nombre de archivo, dependencias y cómo probarlo. No tienes acceso a GitHub: entrega el código en bloques para que Studio o el Operador lo apliquen.',
  },
  code_review: {
    description: 'Revisar código existente.',
    instructions: 'Revisa bugs reales, riesgos de seguridad y mejoras mínimas. Cita la función o línea y propone el parche exacto.',
  },
};

// ─────────────────────────────────────────────────────────────
// AGENTES
// ─────────────────────────────────────────────────────────────
const PREAMBLE =
  'Trabajas dentro de URUS Intelligence OS para el Operador (BAYON). ' +
  'Entrega resultados concretos y accionables, sin relleno ni motivación barata. ' +
  'No inventes datos: si usas internet cita la URL; si no tienes un dato, dilo. ' +
  'Separa hecho de interpretación.';

const AGENTS = {
  research: {
    role: 'Investigador — busca, lee fuentes y sintetiza evidencia',
    skills: ['web_research', 'document_analysis', 'rss_monitoring', 'data_extraction'],
    tools: ['web_search', 'web_scrape', 'pdf_extract', 'rss_fetch', 'memory_search'],
    route: 'research',
    system_prompt: 'Eres el agente RESEARCH. ' + PREAMBLE,
  },
  strategy: {
    role: 'Estratega — analiza, decide y recomienda el próximo movimiento',
    skills: ['strategic_analysis', 'decision_support', 'planning', 'content_writing'],
    tools: ['memory_search'],
    route: 'analysis',
    system_prompt: 'Eres el agente STRATEGY. ' + PREAMBLE,
  },
  coding: {
    role: 'Programador — escribe y revisa código (sin acceso a GitHub todavía)',
    skills: ['code_generation', 'code_review'],
    tools: ['web_search', 'web_scrape'],
    route: 'coding',
    system_prompt: 'Eres el agente CODING. ' + PREAMBLE,
  },
  youtube: {
    role: 'YouTube — nicho, ideas, guiones, SEO y métricas',
    skills: ['youtube_research', 'youtube_scripting', 'youtube_seo', 'content_ideation', 'content_writing'],
    tools: ['youtube_search', 'web_search', 'web_scrape', 'memory_search', 'memory_save'],
    route: 'writing',
    system_prompt: 'Eres el agente YOUTUBE: ayudas a construir y hacer crecer un canal. Usa datos reales de las herramientas cuando existan. ' + PREAMBLE,
  },
  arbol: {
    role: 'El Árbol — libro/sistema de vida: capturar aprendizajes y estructurarlos',
    skills: ['journal_capture', 'book_structuring', 'strategic_analysis'],
    tools: ['memory_search', 'memory_save'],
    route: 'writing',
    system_prompt: 'Eres el agente EL ÁRBOL, guardián del libro y sistema de vida del Operador. Respeta su voz. Nunca inventes recuerdos ni hechos de su vida: captura primero, estructura después. ' + PREAMBLE,
  },
  narrativa: {
    role: 'Narrativa — escribe y continúa historias manteniendo voz y coherencia',
    skills: ['narrative_writing', 'book_structuring'],
    tools: ['memory_search', 'memory_save'],
    route: 'writing',
    system_prompt: 'Eres el agente NARRATIVA. Escribes historias con coherencia de voz, personajes y datos ya establecidos en la memoria del proyecto. ' + PREAMBLE,
  },
  scraping: {
    role: 'Scraping — inspecciona sitios y extrae datos estructurados',
    skills: ['web_scraping_design', 'data_extraction', 'web_research'],
    tools: ['web_scrape', 'web_search', 'pdf_extract', 'rss_fetch'],
    route: 'scraping',
    system_prompt: 'Eres el agente SCRAPING. Inspeccionas la estructura real del sitio antes de proponer nada y entregas datos limpios, indicando qué campos son confiables. ' + PREAMBLE,
  },
  council: {
    role: 'Consejo — 8 analistas en paralelo (estrategia, riesgo, escenarios, presupuesto, cronograma...)',
    skills: ['council_analysis'],
    tools: [],
    route: 'fast',
    type: 'panel',
    system_prompt: '',
  },
};

// Los 8 analistas del consejo (los mismos roles de tu urus-agents.js)
const COUNCIL = {
  STRATEGIST: 'Eres STRATEGIST. 1) ¿Cuál es el verdadero problema? 2) ¿Dónde está la oportunidad real? 3) ¿Cuál es el siguiente movimiento concreto? Directo. Máximo 200 palabras.',
  RESEARCHER: 'Eres RESEARCHER. 1) Qué información hace falta (no todo). 2) Qué se sabe y qué no. 3) Fuentes oficiales donde verificar. Máximo 200 palabras.',
  VERIFIER: 'Eres VERIFIER. 1) Detecta números contradictorios. 2) Verifica fechas (¿vencidas? ¿próximas?). 3) Marca inconsistencias y huecos. Máximo 200 palabras.',
  ANALYZER: 'Eres ANALYZER. 1) Conecta ideas entre el contexto y lo nuevo. 2) Detecta patrones recurrentes. 3) Marca cambios importantes. Pensamiento sistémico. Máximo 200 palabras.',
  SIMULATOR: 'Eres SIMULATOR. 1) Proyecta 3 escenarios (mejor, medio, peor). 2) Estima la probabilidad de cada uno. 3) Marca puntos de inflexión. Realista. Máximo 200 palabras.',
  RISK_ASSESSOR: 'Eres RISK_ASSESSOR. 1) Riesgos reales y concretos. 2) Probabilidad e impacto. 3) Mitigaciones específicas. Máximo 200 palabras.',
  TIMELINE_PLANNER: 'Eres TIMELINE_PLANNER. 1) Calendario con hitos críticos. 2) Dependencias. 3) Cuellos de botella. Detallado con fechas relativas. Máximo 200 palabras.',
  BUDGET_OPTIMIZER: 'Eres BUDGET_OPTIMIZER. 1) Analiza presupuesto y flujo de dinero. 2) Detecta fugas. 3) Propón optimizaciones. Preciso con números. Máximo 200 palabras.',
};

// ─────────────────────────────────────────────────────────────
// API DEL REGISTRY
// ─────────────────────────────────────────────────────────────
function getAgent(name) {
  const a = AGENTS[String(name || '').toLowerCase()];
  return a ? { name: String(name).toLowerCase(), ...a } : null;
}
function getSkill(name) {
  const s = SKILLS[name];
  return s ? { name, ...s } : null;
}
function findAgentForSkill(skillName) {
  for (const [name, a] of Object.entries(AGENTS)) {
    if (a.skills.includes(skillName)) return getAgent(name);
  }
  return null;
}

/** Lo que ve el Master al planificar (compacto). */
function plannerSnapshot() {
  return {
    agentes: Object.entries(AGENTS).filter(([, a]) => !a.internal).map(([name, a]) => ({
      name,
      rol: a.role,
      skills: a.skills,
      herramientas_disponibles: (a.tools || []).filter((t) => toolStatus(t).ok),
      ...(a.type === 'panel' ? { analistas: Object.keys(COUNCIL) } : {}),
    })),
    skills: Object.entries(SKILLS).map(([name, s]) => ({ name, descripcion: s.description })),
  };
}

/** Vista completa para el endpoint /registry. */
function fullSnapshot() {
  return {
    agents: Object.entries(AGENTS).map(([name, a]) => ({ name, role: a.role, skills: a.skills, tools: a.tools, route: a.route, type: a.type || 'agent' })),
    skills: Object.entries(SKILLS).map(([name, s]) => ({ name, description: s.description })),
    tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, status: toolStatus(name) })),
    models: Object.entries(MODELS).map(([id, m]) => ({ id, provider: m.provider, model: m.model, strengths: m.strengths, cost: m.cost })),
    routes: Object.keys(CHAINS),
    planned: PLANNED_TOOLS,
  };
}

// Registro en caliente (para extender sin reconstruir nada)
function registerAgent(name, cfg) { if (AGENTS[name]) throw new Error("agente '" + name + "' ya existe"); AGENTS[name] = cfg; }
function registerSkill(name, cfg) { if (SKILLS[name]) throw new Error("skill '" + name + "' ya existe"); SKILLS[name] = cfg; }
function registerModel(id, cfg)   { if (MODELS[id]) throw new Error("modelo '" + id + "' ya existe"); MODELS[id] = cfg; }

module.exports = {
  MODELS, CHAINS, TOOLS, SKILLS, AGENTS, COUNCIL, PLANNED_TOOLS,
  chainFor, toolStatus, toolsStatus, describeTools,
  getAgent, getSkill, findAgentForSkill,
  plannerSnapshot, fullSnapshot,
  registerAgent, registerSkill, registerModel,
};
