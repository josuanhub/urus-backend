/**
 * URUS OS v2 — LOOP (el ejecutor)
 * PLAN → EJECUTAR → SINTETIZAR → VERIFICAR → (CORREGIR una vez) → MEMORIA
 *
 * Cada paso lo hace un agente que ELIGE sus propias herramientas (hasta 3 por paso):
 *   - para usar una herramienta responde un JSON {"tool":"...","input":{...}}
 *   - cuando termina, responde texto normal (markdown). Así el texto largo nunca rompe un JSON.
 * Los pasos sin dependencias entre sí corren en paralelo (máximo 3 a la vez).
 */
'use strict';

const Registry = require('./registry');
const Models = require('./models');
const Tools = require('./tools');
const Memory = require('./memory');

const MAX_TOOL_ROUNDS = 3;
const MAX_PARALLEL = 3;

function clip(v, n) {
  let s;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
  if (s === undefined || s === null) s = '';
  return s.length > n ? s.slice(0, n) + '…[recortado]' : s;
}

function buildContextText(context) {
  const parts = [];
  if (context.project) {
    parts.push(('PROYECTO: ' + context.project.name + '\n' + (context.project.description || '') + '\n' + (context.project.instructions || '')).trim());
  }
  if (context.personal && context.personal.length) {
    parts.push('SOBRE EL OPERADOR:\n' + context.personal.map((x) => '- ' + clip(x.content, 300)).join('\n'));
  }
  if (context.project_memory && context.project_memory.length) {
    parts.push('MEMORIA DEL PROYECTO:\n' + context.project_memory.map((x) => '- [' + x.type + '] ' + clip(x.content, 300)).join('\n'));
  }
  return clip(parts.join('\n\n'), 3500);
}

function toolProtocol(toolNames) {
  return [
    'HERRAMIENTAS DISPONIBLES (úsalas cuando necesites datos reales; máximo ' + MAX_TOOL_ROUNDS + ' llamadas):',
    Registry.describeTools(toolNames),
    '',
    'PROTOCOLO:',
    '- Para usar una herramienta responde ÚNICAMENTE con un JSON: {"tool":"nombre","input":{...}} — sin texto antes ni después.',
    '- Recibirás el resultado y podrás llamar otra herramienta o terminar.',
    '- Cuando tengas lo necesario, responde con tu resultado FINAL en texto normal (markdown), sin JSON.',
    '- Nunca inventes datos: si una herramienta falla o no hay dato, dilo en el resultado.',
  ].join('\n');
}

// Busca el primer objeto {"tool": ...} en CUALQUIER parte del texto (los modelos suelen escribir una frase antes).
function findToolObject(text) {
  const m = /\{\s*"tool"\s*:/.exec(text);
  if (!m) return null;
  const start = m.index;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return { obj: JSON.parse(text.slice(start, i + 1)), start, end: i + 1 }; } catch { return null; }
      }
    }
  }
  return null;
}

function parseToolCall(text, allowed) {
  const t = String(text || '').trim();
  const found = findToolObject(t);
  if (found && found.obj && typeof found.obj.tool === 'string') {
    const residual = (t.slice(0, found.start) + t.slice(found.end)).trim();
    // Un entregable largo que solo cita un JSON de ejemplo NO es una llamada a herramienta
    if (residual.length > 1200) return null;
    const input = found.obj.input && typeof found.obj.input === 'object' ? found.obj.input : {};
    const extra = (t.slice(found.end).match(/\{\s*"tool"\s*:/g) || []).length;
    return { tool: found.obj.tool, input, allowed: allowed.includes(found.obj.tool), extra };
  }
  // Respaldo: JSON puro con las llaves en otro orden
  if (!(t.startsWith('{') || t.startsWith('```'))) return null;
  const obj = Models.extractJSON(t);
  if (!obj || typeof obj !== 'object' || typeof obj.tool !== 'string') return null;
  const input = obj.input && typeof obj.input === 'object' ? obj.input : {};
  return { tool: obj.tool, input, allowed: allowed.includes(obj.tool), extra: 0 };
}

function priorBlock(step, rc) {
  return (step.depends_on || []).map((id) => {
    const o = rc.outputs[id];
    if (!o) return '';
    if (o.failed) return '### Resultado de ' + id + ' (' + o.title + ')\n(ese paso falló: ' + o.error + ')';
    return '### Resultado de ' + id + ' (' + o.title + ')\n' + clip(o.output, 4000);
  }).filter(Boolean).join('\n\n');
}

async function runAgentStep(step, rc) {
  const agent = Registry.getAgent(step.agent);
  const skill = Registry.getSkill(step.skill);
  const tools = (agent.tools || []).filter((t) => Registry.toolStatus(t).ok);

  const system = [
    agent.system_prompt,
    skill ? 'SKILL ACTIVA: ' + skill.name + '\n' + skill.instructions : '',
    tools.length ? toolProtocol(tools) : 'En este paso no tienes herramientas: trabaja con la información dada.',
    'Responde en español.',
  ].filter(Boolean).join('\n\n');

  const prior = priorBlock(step, rc);
  const user = [
    'OBJETIVO GENERAL DEL OPERADOR: ' + rc.intent,
    'TU PASO (' + step.id + '): ' + step.title,
    'INSTRUCCIÓN: ' + step.goal,
    rc.contextText ? 'CONTEXTO:\n' + rc.contextText : '',
    prior ? 'RESULTADOS PREVIOS:\n' + prior : '',
  ].filter(Boolean).join('\n\n');

  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const toolsUsed = [];
  const models = new Set();
  let nudges = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const r = await Models.callRoute(agent.route, {
      messages,
      max_tokens: agent.max_tokens || 3500,
      temperature: agent.temperature !== undefined ? agent.temperature : 0.4,
    });
    models.add(r.provider + '/' + r.model);

    const call = tools.length ? parseToolCall(r.text, tools) : null;
    if (!call) {
      const corto = String(r.text || '').trim().length < 300;
      if (tools.length && corto && nudges < 1 && round < MAX_TOOL_ROUNDS) {
        nudges++;
        messages.push({ role: 'assistant', content: r.text });
        messages.push({ role: 'user', content: 'Eso no es un resultado. Si necesitas datos, llama UNA herramienta con el JSON {"tool":"nombre","input":{...}}. Si no, entrega AHORA el resultado FINAL completo en texto.' });
        continue;
      }
      return { output: r.text, tools_used: toolsUsed, model: [...models].join(', ') };
    }

    if (round === MAX_TOOL_ROUNDS) {
      return { output: 'No pude completar este paso: el agente siguió pidiendo herramientas después de agotar su presupuesto.', tools_used: toolsUsed, model: [...models].join(', ') };
    }

    messages.push({ role: 'assistant', content: r.text });

    if (!call.allowed) {
      messages.push({ role: 'user', content: 'La herramienta "' + call.tool + '" no está disponible para ti. Usa solo: ' + tools.join(', ') + '. Si no necesitas ninguna, entrega el resultado FINAL en texto.' });
      continue;
    }

    await rc.emit('tool_call', { step: step.id, tool: call.tool, input: clip(call.input, 200) });
    const t0 = Date.now();
    const res = await Tools.run(call.tool, call.input, { projectId: rc.projectId, runId: rc.runId, agent: step.agent });
    toolsUsed.push(res.ok ? { tool: call.tool, ok: true, ms: Date.now() - t0 } : { tool: call.tool, ok: false, ms: Date.now() - t0, error: res.error });
    await rc.emit('tool_result', { step: step.id, tool: call.tool, ok: res.ok, ...(res.ok ? {} : { error: res.error }) });

    const budgetLeft = MAX_TOOL_ROUNDS - toolsUsed.length;
    const extraNote = call.extra > 0 ? 'NOTA: pediste varias herramientas a la vez; solo ejecuté la primera. Llama las demás de una en una.\n\n' : '';
    const tail = budgetLeft <= 0
      ? 'Ya no puedes usar más herramientas. Entrega ahora el resultado FINAL en texto.'
      : '¿Necesitas otra herramienta? Si no, entrega el resultado FINAL en texto.';
    messages.push({
      role: 'user',
      content: res.ok
        ? 'RESULTADO de ' + call.tool + ':\n' + clip(res.data, 7000) + '\n\n' + extraNote + tail
        : 'La herramienta ' + call.tool + ' falló: ' + res.error + '. Intenta otra cosa o entrega el resultado con lo que tengas, indicando la limitación.\n\n' + tail,
    });
  }
  return { output: '', tools_used: toolsUsed, model: [...models].join(', ') };
}

async function runPanel(step, rc) {
  const names = (step.analysts && step.analysts.length ? step.analysts : Object.keys(Registry.COUNCIL)).filter((n) => Registry.COUNCIL[n]);
  const prior = priorBlock(step, rc);
  const user = [
    'OBJETIVO GENERAL DEL OPERADOR: ' + rc.intent,
    'ANÁLISIS PEDIDO: ' + step.goal,
    rc.contextText ? 'CONTEXTO:\n' + rc.contextText : '',
    prior ? 'RESULTADOS PREVIOS:\n' + prior : '',
  ].filter(Boolean).join('\n\n');

  const models = new Set();
  const results = await Promise.all(names.map(async (n) => {
    try {
      const r = await Models.callRoute('fast', {
        messages: [{ role: 'system', content: Registry.COUNCIL[n] + ' Responde en español.' }, { role: 'user', content: user }],
        max_tokens: 700,
        temperature: 0.6,
      });
      models.add(r.provider + '/' + r.model);
      return { n, text: r.text };
    } catch (e) {
      return { n, error: String(e.message).slice(0, 120) };
    }
  }));

  const ok = results.filter((r) => r.text);
  if (!ok.length) throw new Error('ningún analista del consejo respondió');
  let output = ok.map((r) => '### ' + r.n + '\n' + r.text).join('\n\n');
  const failed = results.filter((r) => r.error).map((r) => r.n);
  if (failed.length) output += '\n\n_(Sin respuesta de: ' + failed.join(', ') + ')_';
  return { output, tools_used: [], model: [...models].join(', ') };
}

async function runStep(step, rc) {
  const t0 = Date.now();
  await rc.emit('step_start', { step: step.id, agent: step.agent, title: step.title });
  try {
    const agent = Registry.getAgent(step.agent);
    if (!agent) throw new Error("agente '" + step.agent + "' no existe");
    const r = agent.type === 'panel' ? await runPanel(step, rc) : await runAgentStep(step, rc);
    if (!String(r.output || '').trim()) throw new Error('el agente no entregó resultado');
    const out = { title: step.title, agent: step.agent, skill: step.skill, output: r.output, tools_used: r.tools_used || [], model: r.model, ms: Date.now() - t0 };
    await rc.emit('step_done', { step: step.id, agent: step.agent, ms: out.ms, tools: out.tools_used.length });
    return out;
  } catch (e) {
    await rc.emit('step_failed', { step: step.id, error: String(e.message).slice(0, 300) });
    return { title: step.title, agent: step.agent, skill: step.skill, failed: true, output: '', error: String(e.message).slice(0, 500), ms: Date.now() - t0 };
  }
}

async function executePlan(plan, rc) {
  const done = new Set();
  const pending = [...plan.steps];
  while (pending.length) {
    const ready = pending.filter((s) => (s.depends_on || []).every((d) => done.has(d)));
    if (!ready.length) {
      for (const s of pending) rc.outputs[s.id] = { title: s.title, agent: s.agent, failed: true, output: '', error: 'dependencias sin resolver' };
      break;
    }
    for (let i = 0; i < ready.length; i += MAX_PARALLEL) {
      const batch = ready.slice(i, i + MAX_PARALLEL);
      await Promise.all(batch.map(async (s) => { rc.outputs[s.id] = await runStep(s, rc); }));
    }
    for (const s of ready) { done.add(s.id); pending.splice(pending.indexOf(s), 1); }
  }
}

const SYNTH_SYSTEM = [
  'Eres URUS MASTER. Entregas al Operador el resultado final de un trabajo hecho por varios agentes.',
  'Escribe en español, directo, con estructura clara (markdown ligero). Sin relleno ni frases de coach.',
  'Usa SOLO lo que está en los resultados de los pasos. No agregues datos nuevos. Si un paso falló o falta información, dilo.',
  'Cierra siempre con una sección "Siguiente movimiento" con UNA acción concreta.',
].join('\n');

async function synthesize(rc, plan, issues) {
  const parts = plan.steps.map((s) => {
    const o = rc.outputs[s.id];
    const body = !o ? '(sin resultado)' : o.failed ? '(FALLÓ: ' + o.error + ')' : clip(o.output, 4500);
    return '### ' + s.id + ' · ' + s.title + ' [' + s.agent + ']\n' + body;
  }).join('\n\n');
  const user = [
    'INTENCIÓN DEL OPERADOR: ' + rc.intent,
    plan.final_deliverable ? 'ENTREGABLE ESPERADO: ' + plan.final_deliverable : '',
    rc.contextText ? 'CONTEXTO:\n' + rc.contextText : '',
    'RESULTADOS DE LOS PASOS:\n' + parts,
    issues && issues.length ? 'PROBLEMAS DETECTADOS POR QA — CORRÍGELOS:\n- ' + issues.join('\n- ') : '',
  ].filter(Boolean).join('\n\n');
  const r = await Models.callRoute('analysis', {
    messages: [{ role: 'system', content: SYNTH_SYSTEM }, { role: 'user', content: user }],
    max_tokens: 3500,
    temperature: 0.3,
  });
  return { text: r.text, model: r.provider + '/' + r.model };
}

const QA_SYSTEM = [
  'Eres el verificador de URUS. Revisas un ENTREGABLE contra la INTENCIÓN del Operador y contra los RESULTADOS DE LOS PASOS (la fuente de verdad).',
  'Marca passed=false SOLO si ocurre alguno de estos casos:',
  '(a) no responde a lo que el Operador pidió;',
  '(b) afirma hechos del mundo real (cifras, fechas, nombres, URLs) que NO aparecen en los resultados de los pasos — esto aplica a investigación y datos, NO a contenido creativo ni propuestas;',
  '(c) contradice los resultados de los pasos.',
  'No marques fallas por estilo. Responde SOLO JSON: {"passed": true|false, "issues": ["..."], "verdict": "una frase"}',
].join('\n');

async function verify(rc, plan, deliverable) {
  try {
    const steps = plan.steps.map((s) => {
      const o = rc.outputs[s.id];
      return '### ' + s.id + '\n' + (o && !o.failed ? clip(o.output, 2500) : '(sin resultado)');
    }).join('\n\n');
    const r = await Models.callJSON({
      route: 'verify',
      messages: [
        { role: 'system', content: QA_SYSTEM },
        { role: 'user', content: 'INTENCIÓN: ' + rc.intent + '\n\nRESULTADOS DE LOS PASOS:\n' + clip(steps, 7000) + '\n\nENTREGABLE A VERIFICAR:\n' + clip(deliverable, 6000) },
      ],
      max_tokens: 700,
      temperature: 0.1,
    });
    const j = r.json || {};
    return {
      passed: j.passed !== false,
      issues: Array.isArray(j.issues) ? j.issues.map(String).slice(0, 6) : [],
      verdict: String(j.verdict || '').slice(0, 400),
      model: r.provider + '/' + r.model,
    };
  } catch (e) {
    return { passed: true, issues: [], verdict: 'QA no disponible: ' + String(e.message).slice(0, 120), skipped: true };
  }
}

/**
 * runPlan({ runId, intent, plan, context, projectId, emit }) → resultado final
 */
async function runPlan({ runId, intent, plan, context, projectId, emit }) {
  const safeEmit = async (type, data) => { try { await emit(type, data || {}); } catch { /* nunca bloquea */ } };
  const rc = { runId, intent, projectId, emit: safeEmit, contextText: buildContextText(context || {}), outputs: {} };
  const t0 = Date.now();

  await executePlan(plan, rc);

  const okSteps = plan.steps.filter((s) => rc.outputs[s.id] && !rc.outputs[s.id].failed);
  if (!okSteps.length) {
    const errs = plan.steps.map((s) => s.id + ': ' + (rc.outputs[s.id] ? rc.outputs[s.id].error : 'sin resultado')).join(' | ');
    throw new Error('Todos los pasos fallaron → ' + errs);
  }

  // Un solo paso exitoso en un plan de un paso: ese resultado ES el entregable (ahorra una llamada)
  let deliverable;
  let synthModel = null;
  if (plan.steps.length === 1) {
    deliverable = rc.outputs[plan.steps[0].id].output;
  } else {
    await safeEmit('synthesis', {});
    const s = await synthesize(rc, plan, null);
    deliverable = s.text;
    synthModel = s.model;
  }

  await safeEmit('qa_start', {});
  let qa = await verify(rc, plan, deliverable);
  let revised = false;
  if (!qa.passed && qa.issues.length && plan.steps.length > 1) {
    await safeEmit('qa_revision', { issues: qa.issues.length });
    try {
      const s2 = await synthesize(rc, plan, qa.issues);
      deliverable = s2.text;
      synthModel = s2.model;
      revised = true;
      const qa2 = await verify(rc, plan, deliverable);
      qa = { ...qa2, first_issues: qa.issues };
    } catch (e) {
      console.warn('[OS loop] corrección falló:', e.message);
    }
  }
  qa.revised = revised;
  await safeEmit('qa_done', { passed: qa.passed, revised });

  const models = new Set();
  for (const s of plan.steps) {
    const o = rc.outputs[s.id];
    if (o && o.model) o.model.split(', ').forEach((m) => models.add(m));
  }
  if (synthModel) models.add(synthModel);

  try {
    await Memory.save({
      content: 'Intención: ' + intent + '\n\nResultado:\n' + clip(deliverable, 3000),
      type: 'run_result', projectId, runId, agent: 'master',
    });
  } catch (e) {
    console.warn('[OS loop] no se pudo guardar en memoria:', e.message);
  }

  return {
    deliverable,
    steps: plan.steps.map((s) => ({ id: s.id, agent: s.agent, skill: s.skill, ...rc.outputs[s.id] })),
    qa,
    models_used: [...models],
    elapsed_s: Math.round((Date.now() - t0) / 100) / 10,
    status: qa.passed ? 'completed' : 'completed_with_issues',
  };
}

module.exports = { runPlan, parseToolCall, buildContextText };
