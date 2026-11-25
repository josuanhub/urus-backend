/**
 * URUS OS v2 — MASTER
 * Recibe la intención, carga contexto (tu memoria personal + la del proyecto),
 * y produce un PLAN. El plan se VALIDA contra el Registry: si el modelo inventa un
 * agente o una skill que no existe, se corrige. Si el planificador falla, hay plan de respaldo.
 */
'use strict';

const Registry = require('./registry');
const Models = require('./models');
const Memory = require('./memory');

let _pool = null;
function init({ pool }) { _pool = pool; }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadProject(ref) {
  if (!ref || !_pool) return null;
  const isUuid = UUID_RE.test(ref);
  const r = await _pool.query(
    isUuid ? 'SELECT * FROM os_projects WHERE id = $1' : 'SELECT * FROM os_projects WHERE slug = $1',
    [ref]
  );
  return r.rows[0] || null;
}

async function buildContext(intent, project) {
  const vec = await Memory.embed(intent);
  const projectId = project ? project.id : null;
  const [personal, found, recent] = await Promise.all([
    Memory.personalContext({ query: intent, vec, limit: 6 }),
    Memory.search({ query: intent, vec, projectId, limit: 5 }),
    project ? Memory.recent({ projectId, limit: 4 }) : Promise.resolve([]),
  ]);
  const seen = new Set();
  const project_memory = [];
  for (const m of [...found, ...recent]) {
    if (m.id && seen.has(m.id)) continue;
    if (m.id) seen.add(m.id);
    project_memory.push(m);
  }
  return { project, personal, project_memory };
}

const PLANNER_SYSTEM = [
  'Eres URUS MASTER, el jefe de operaciones de URUS Intelligence OS. Recibes una intención del Operador y produces un PLAN de trabajo ejecutable.',
  '',
  'REGLAS',
  '- Responde SOLO con un objeto JSON válido. Nada de texto fuera del JSON.',
  '- Usa SOLO agentes y skills que aparecen en el REGISTRY. No inventes ninguno.',
  '- Cada paso: un agente, una skill de ESE agente, y una instrucción concreta (goal) que se entienda sin contexto adicional.',
  '- Usa el mínimo de pasos necesarios: pedido simple = 1 paso; trabajo complejo = hasta 6. Nunca más de 6.',
  '- depends_on solo con ids de pasos anteriores. Los pasos sin dependencias se ejecutan en paralelo.',
  '- NO incluyas un paso de QA ni de resumen final: el sistema los hace solo.',
  '- Si el pedido es demasiado ambiguo para actuar, pon needs_clarification=true, escribe UNA pregunta concreta en clarifying_question y deja steps vacío. No preguntes si puedes asumir algo razonable.',
  '- Si el Operador está explorando ("no sé qué quiero hacer", "tengo 3 ideas"), planifica pasos de exploración con el agente strategy o council.',
  '- Si hay un proyecto activo, trabaja dentro de él y prefiere su agente por defecto cuando encaje.',
  '- Si el pedido implica acciones externas (enviar mensajes, publicar, gastar dinero), NO las ejecutes: planifica el borrador y pon requires_approval=true.',
  '- El agente council acepta opcionalmente "analysts" (lista de nombres del registry) para usar solo algunos analistas.',
  '',
  'FORMATO EXACTO',
  '{',
  '  "intent_understood": "una línea",',
  '  "needs_clarification": false,',
  '  "clarifying_question": null,',
  '  "final_deliverable": "qué recibirá el Operador al final",',
  '  "requires_approval": false,',
  '  "confidence": 0-10,',
  '  "project_suggestion": null,',
  '  "steps": [',
  '    { "id": "s1", "title": "corto", "agent": "research", "skill": "web_research", "goal": "instrucción concreta", "depends_on": [] }',
  '  ]',
  '}',
  'Si NO hay proyecto activo y la intención claramente merece uno propio, project_suggestion = {"name":"...","description":"..."}; si no, null.',
].join('\n');

function ctxLines(arr, n = 280) {
  return arr.map((x) => '- ' + String(x.content).replace(/\s+/g, ' ').slice(0, n)).join('\n');
}

function heuristicAgent(intent, project) {
  const t = String(intent).toLowerCase();
  if (/youtube|canal|video|vídeo|guion|guión|miniatura/.test(t)) return 'youtube';
  if (/scrap|raspar|extraer datos|extraer los datos/.test(t)) return 'scraping';
  if (/libro|árbol|arbol|cap[ií]tulo|diario|lo que aprend/.test(t)) return 'arbol';
  if (/cuento|novela|narrativ|personaje|historia/.test(t)) return 'narrativa';
  if (/c[oó]digo|programa|funci[oó]n|endpoint|\bbug\b/.test(t)) return 'coding';
  if (/investiga|busca|fondos|informaci[oó]n sobre|research/.test(t)) return 'research';
  return (project && project.default_agent && Registry.getAgent(project.default_agent)) ? project.default_agent : 'strategy';
}

function fallbackPlan(intent, project, reason) {
  const agent = Registry.getAgent(heuristicAgent(intent, project));
  return {
    intent_understood: String(intent).slice(0, 200),
    needs_clarification: false,
    clarifying_question: null,
    final_deliverable: 'Respuesta directa a la intención',
    requires_approval: false,
    confidence: 4,
    project_suggestion: null,
    steps: [{
      id: 's1', title: 'Resolver la intención', agent: agent.name, skill: agent.skills[0],
      goal: String(intent).slice(0, 1200), depends_on: [],
    }],
    _fallback_reason: reason,
  };
}

function clampNum(v, lo, hi, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : def;
}

function validatePlan(raw, intent, project) {
  const warnings = [];
  const obj = raw && typeof raw === 'object' ? raw : {};
  const out = {
    intent_understood: String(obj.intent_understood || intent).slice(0, 300),
    needs_clarification: false,
    clarifying_question: null,
    final_deliverable: String(obj.final_deliverable || '').slice(0, 300),
    requires_approval: !!obj.requires_approval,
    confidence: clampNum(obj.confidence, 0, 10, 5),
    project_suggestion: null,
    steps: [],
  };

  if (obj.project_suggestion && typeof obj.project_suggestion === 'object' && obj.project_suggestion.name) {
    out.project_suggestion = {
      name: String(obj.project_suggestion.name).slice(0, 80),
      description: String(obj.project_suggestion.description || '').slice(0, 300),
    };
  }

  if (obj.needs_clarification === true && obj.clarifying_question) {
    out.needs_clarification = true;
    out.clarifying_question = String(obj.clarifying_question).slice(0, 400);
    return { plan: out, warnings };
  }

  const rawSteps = Array.isArray(obj.steps) ? obj.steps.slice(0, 6) : [];
  const ids = new Set();
  rawSteps.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    let id = String(s.id || ('s' + (i + 1))).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || ('s' + (i + 1));
    if (ids.has(id)) id = 's' + (i + 1) + '_' + ids.size;

    let agent = Registry.getAgent(s.agent);
    if (!agent) {
      const alt = Registry.findAgentForSkill(s.skill);
      warnings.push(`paso ${id}: agente '${s.agent}' no existe → ${alt ? alt.name : 'strategy'}`);
      agent = alt || Registry.getAgent((project && project.default_agent) || 'strategy') || Registry.getAgent('strategy');
    }
    let skill = Registry.getSkill(s.skill);
    if (!skill || !agent.skills.includes(skill.name)) {
      if (s.skill) warnings.push(`paso ${id}: skill '${s.skill}' no es de ${agent.name} → ${agent.skills[0]}`);
      skill = Registry.getSkill(agent.skills[0]);
    }
    const depends = (Array.isArray(s.depends_on) ? s.depends_on : []).map(String).filter((d) => ids.has(d));
    const step = {
      id,
      title: String(s.title || s.task || 'Paso ' + (i + 1)).slice(0, 100),
      agent: agent.name,
      skill: skill ? skill.name : null,
      goal: String(s.goal || s.task || out.intent_understood).slice(0, 1200),
      depends_on: depends,
    };
    if (agent.type === 'panel' && Array.isArray(s.analysts)) {
      const names = s.analysts.map((a) => String(a).toUpperCase()).filter((a) => Registry.COUNCIL[a]);
      if (names.length) step.analysts = names;
    }
    ids.add(id);
    out.steps.push(step);
  });

  if (!out.steps.length) {
    warnings.push('el plan no tenía pasos válidos → plan de respaldo');
    const fb = fallbackPlan(intent, project, 'plan sin pasos');
    out.steps = fb.steps;
    out.confidence = Math.min(out.confidence, 4);
  }
  return { plan: out, warnings };
}

/**
 * understand({ intent, project }) → { plan, warnings, context, planner }
 */
async function understand({ intent, project = null }) {
  const context = await buildContext(intent, project);

  const parts = [
    'REGISTRY:\n' + JSON.stringify(Registry.plannerSnapshot()),
    project
      ? 'PROYECTO ACTIVO: ' + project.name + '\n' + (project.description || '') + '\n' + (project.instructions || '') +
        (project.default_agent ? '\nAgente por defecto: ' + project.default_agent : '')
      : 'PROYECTO ACTIVO: ninguno',
    context.personal.length ? 'LO QUE SE SABE DEL OPERADOR:\n' + ctxLines(context.personal) : '',
    context.project_memory.length ? 'MEMORIA RELEVANTE:\n' + ctxLines(context.project_memory) : '',
    'INTENCIÓN DEL OPERADOR:\n"' + intent + '"',
  ].filter(Boolean);

  let planner = { model: null, fallback: false };
  let raw;
  try {
    const r = await Models.callJSON({
      route: 'planning',
      messages: [{ role: 'system', content: PLANNER_SYSTEM }, { role: 'user', content: parts.join('\n\n') }],
      max_tokens: 1800,
      temperature: 0.2,
    });
    raw = r.json;
    planner.model = r.provider + '/' + r.model;
  } catch (e) {
    console.warn('[OS master] planificador falló, uso plan de respaldo:', e.message);
    const fb = fallbackPlan(intent, project, e.message);
    return { plan: fb, warnings: ['planificador no disponible: ' + String(e.message).slice(0, 160)], context, planner: { model: null, fallback: true } };
  }

  const { plan, warnings } = validatePlan(raw, intent, project);
  return { plan, warnings, context, planner };
}

module.exports = { init, understand, loadProject, validatePlan, fallbackPlan, heuristicAgent };
