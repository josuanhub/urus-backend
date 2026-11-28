(function () {
  'use strict';
  var API = '/v1/os-brain';
  var DEFAULTS = [
    { slug: 'youtube', name: 'YouTube' },
    { slug: 'el-arbol', name: 'El Árbol' },
    { slug: 'scraping', name: 'Scraping' },
    { slug: 'narrativa', name: 'Narrativa' }
  ];
  var $ = function (id) { return document.getElementById(id); };
  var pw = sessionStorage.getItem('brain_pw') || '';
  var tab = 'run', current = null, polling = null, lastText = '';

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-studio-password': pw, 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401 || r.status === 503) { var e = new Error('auth'); e.auth = true; throw e; }
      return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: false, error: 'el servidor no reconoce esta acción todavía (HTTP ' + r.status + ')' }; } });
    });
  }

  function showApp() {
    $('login').classList.add('hide');
    $('app').classList.remove('hide');
    loadProjects();
  }
  function showLogin(msg) {
    sessionStorage.removeItem('brain_pw'); pw = '';
    $('app').classList.add('hide');
    $('login').classList.remove('hide');
    $('err').textContent = msg || '';
  }

  $('loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    pw = $('pw').value;
    $('err').textContent = 'Comprobando…';
    api('/status').then(function (d) {
      if (d && d.ok) { sessionStorage.setItem('brain_pw', pw); $('pw').value = ''; $('err').textContent = ''; showApp(); }
      else showLogin('El servidor respondió, pero no aceptó el acceso.');
    }).catch(function (e) {
      showLogin(e.auth ? 'Contraseña incorrecta.' : 'No pude conectar con el servidor.');
    });
  });
  $('logout').addEventListener('click', function () { stop(); showLogin(''); });

  function loadProjects() {
    var list = DEFAULTS.slice();
    api('/projects').then(function (d) {
      var arr = d && (d.projects || d.items);
      if (Array.isArray(arr) && arr.length) {
        list = arr.filter(function (p) { return p && p.slug; }).map(function (p) { return { slug: p.slug, name: p.name || p.slug, description: p.description || '', instructions: p.instructions || '' }; });
      }
    }).catch(function () {}).then(function () {
      var nav = $('projects'); nav.textContent = '';
      list.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'proj'; b.textContent = p.name; b.dataset.slug = p.slug;
        b.addEventListener('click', function () { select(p, list); });
        nav.appendChild(b);
      });
      select(current && list.filter(function (p) { return p.slug === current.slug; })[0] || list[0], list);
    });
  }
  function select(p, list) {
    current = p;
    $('title').textContent = p.name;
    Array.prototype.forEach.call($('projects').children, function (b) { b.classList.toggle('on', b.dataset.slug === p.slug); });
    stop(); $('log').classList.add('hide'); $('result').classList.add('hide'); $('tools').classList.add('hide'); setState('');
    if (tab === 'hist') loadHist(); if (tab === 'mem') loadMem(); if (tab === 'set') fillSet();
  }

  function stop() { if (polling) { clearInterval(polling); polling = null; } }
  function setState(t, ms) { $('state').textContent = t || ''; if (ms) setTimeout(function () { if ($('state').textContent === t) $('state').textContent = ''; }, ms); }

  function labelFor(ev) {
    switch (ev.type) {
      case 'plan_ready': return 'Plan listo: ' + ev.steps + (ev.steps === 1 ? ' paso' : ' pasos');
      case 'step_start': return 'Empieza: ' + (ev.title || ev.step);
      case 'tool_call': return 'Usa herramienta: ' + ev.tool;
      case 'step_done': return 'Terminó: ' + ev.step;
      case 'synthesis': return 'Armando el informe final';
      case 'qa_start': return 'Revisando calidad';
      case 'qa_done': return ev.passed ? 'Calidad aprobada' : 'Calidad: se corrigió algo';
      case 'done': return 'Listo';
      case 'failed': return 'Falló: ' + (ev.error || '');
      default: return null;
    }
  }

  function startRun(intent) {
    $('planBox').classList.add('hide');
    stop();
    $('run').disabled = true;
    $('result').classList.add('hide'); $('tools').classList.add('hide');
    $('log').textContent = ''; $('log').classList.remove('hide');
    setState('Enviando…');
    api('/intent', { method: 'POST', body: JSON.stringify({ intent: intent, project: current.slug }) })
      .then(function (d) {
        if (!d || !d.run_id) throw new Error((d && d.error) || 'El servidor no devolvió un número de pedido.');
        setState('Trabajando… suele tardar 1 a 3 minutos.');
        poll(d.run_id);
      }).catch(fail);
  }

  $('run').addEventListener('click', function () {
    var intent = $('intent').value.trim();
    if (!intent) { setState('Escribe primero qué quieres hacer.'); return; }
    if (!$('review').checked) { startRun(intent); return; }
    $('planBox').classList.add('hide'); $('run').disabled = true; setState('Armando el plan…');
    api('/plan', { method: 'POST', body: JSON.stringify({ intent: intent, project: current.slug }) }).then(function (d) {
      $('run').disabled = false; setState('');
      if (!d || !d.ok) throw new Error((d && d.error) || 'no pude armar el plan');
      showPlan(d.plan, intent);
    }).catch(fail);
  });

  function showPlan(plan, intent) {
    var box = $('planBox'); box.textContent = '';
    function para(label, text) { var q = document.createElement('p'); var b = document.createElement('strong'); b.textContent = label + ' '; q.appendChild(b); q.appendChild(document.createTextNode(text || '')); box.appendChild(q); }
    para('Entendí:', plan.intent_understood); para('Entregaré:', plan.final_deliverable);
    var ol = document.createElement('ol');
    (plan.steps || []).forEach(function (st) { var li = document.createElement('li'); li.textContent = st.title + ' (' + st.agent + ')'; ol.appendChild(li); });
    box.appendChild(ol);
    if (plan.requires_approval) para('Ojo:', 'este plan pide tu aprobación explícita antes de ejecutarse.');
    var tools = document.createElement('div'); tools.className = 'tools';
    if (plan.needs_clarification) { para('Antes necesito saber:', plan.clarifying_question); }
    else {
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn'; ok.textContent = 'Aprobar y ejecutar';
      ok.addEventListener('click', function () { startRun(intent); }); tools.appendChild(ok);
    }
    var no = document.createElement('button'); no.type = 'button'; no.className = 'btn ghost'; no.textContent = plan.needs_clarification ? 'Corregir mi encargo' : 'Cancelar';
    no.addEventListener('click', function () { box.classList.add('hide'); $('intent').focus(); }); tools.appendChild(no);
    box.appendChild(tools); box.classList.remove('hide');
  }

  /* ---- ajustes del proyecto ---- */
  function fillSet() {
    $('setName').value = current.name || ''; $('setDesc').value = current.description || ''; $('setIns').value = current.instructions || ''; $('setState').textContent = '';
  }
  $('setSave').addEventListener('click', function () {
    var name = $('setName').value.trim(); if (!name) { $('setState').textContent = 'El nombre no puede quedar vacío.'; return; }
    $('setState').textContent = 'Guardando…';
    api('/projects/' + encodeURIComponent(current.slug), { method: 'PATCH', body: JSON.stringify({ name: name, description: $('setDesc').value, instructions: $('setIns').value }) })
      .then(function (d) { if (d && d.ok) { $('setState').textContent = 'Guardado.'; loadProjects(); } else $('setState').textContent = 'No se pudo: ' + ((d && d.error) || ''); }).catch(fail);
  });
  $('setDel').addEventListener('click', function () {
    if (!window.confirm('¿Eliminar “' + current.name + '”? Sus encargos quedan guardados, pero el proyecto desaparece de la lista.')) return;
    api('/projects/' + encodeURIComponent(current.slug), { method: 'DELETE' }).then(function (d) {
      if (d && d.ok) { current = null; tab = 'run'; Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x.dataset.tab === 'run'); }); ['run', 'hist', 'mem', 'set'].forEach(function (t) { $('sec-' + t).classList.toggle('hide', t !== 'run'); }); loadProjects(); }
      else $('setState').textContent = 'No se pudo: ' + ((d && d.error) || '');
    }).catch(fail);
  });

  function fail(e) {
    stop(); $('run').disabled = false;
    if (e && e.auth) return showLogin('La sesión venció. Entra de nuevo.');
    setState('Error: ' + (e && e.message ? e.message : e));
  }

  function poll(id) {
    var seen = 0;
    function tick() {
      api('/run/' + id).then(function (d) {
        var run = d && d.run; if (!run) return;
        var evs = run.events || [];
        for (; seen < evs.length; seen++) {
          var t = labelFor(evs[seen]); if (!t) continue;
          var li = document.createElement('li');
          li.textContent = t; if (evs[seen].type === 'done') li.className = 'done';
          $('log').appendChild(li);
        }
        if (run.status === 'completed') { stop(); $('run').disabled = false; setState('Completado.'); show(run); }
        else if (run.status === 'needs_input') { stop(); $('run').disabled = false; setState('Necesita más datos: ' + ((run.result && run.result.question) || 'aclara tu encargo')); }
        else if (run.status === 'failed') { stop(); $('run').disabled = false; setState('Falló: ' + (run.error || 'sin detalle')); }
      }).catch(fail);
    }
    tick(); polling = setInterval(tick, 4000);
  }

  function show(run) {
    var r = run.result || {};
    lastText = r.deliverable || '';
    if (!lastText) { setState('Terminó, pero sin resultado visible.'); return; }
    $('result').innerHTML = md(lastText);
    $('result').classList.remove('hide'); $('tools').classList.remove('hide');
  }
  $('copy').addEventListener('click', function () {
    navigator.clipboard.writeText(lastText).then(function () { setState('Copiado.', 2000); }, function () { setState('No pude copiar; selecciona el texto a mano.'); });
  });


  /* ---- pestañas ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
    b.addEventListener('click', function () {
      tab = b.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x === b); });
      ['run', 'hist', 'mem', 'set'].forEach(function (t) { $('sec-' + t).classList.toggle('hide', t !== tab); });
      if (tab === 'hist') loadHist(); if (tab === 'mem') loadMem(); if (tab === 'set') fillSet();
    });
  });
  function item(tag, main, small, cls) {
    var el = document.createElement(tag); el.className = 'item';
    var d = document.createElement('div'); d.textContent = main; el.appendChild(d);
    if (small) { var sm = document.createElement('small'); sm.textContent = small; if (cls) sm.className = cls; el.appendChild(sm); }
    return el;
  }
  var fmt = function (d) { try { return new Date(d).toLocaleString('es'); } catch (e) { return ''; } };

  /* ---- historial ---- */
  var STATUS = { completed: 'completado', failed: 'falló', running: 'en curso', planning: 'planificando', needs_input: 'necesita datos' };
  function loadHist() {
    var box = $('histList'); box.textContent = 'Cargando…';
    api('/runs?limit=30&project=' + encodeURIComponent(current.slug)).then(function (d) {
      box.textContent = '';
      var runs = (d && d.runs) || [];
      if (!runs.length) { box.textContent = 'Todavía no hay encargos en este proyecto.'; return; }
      runs.forEach(function (r) {
        var b = item('button', r.intent, (STATUS[r.status] || r.status) + ' · ' + fmt(r.created_at), r.status === 'failed' ? 'bad' : '');
        b.type = 'button'; b.classList.add('btn-item');
        b.addEventListener('click', function () { openRun(r.id, r.intent); });
        box.appendChild(b);
      });
    }).catch(fail);
  }
  function openRun(id, intent) {
    tab = 'run';
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x.dataset.tab === 'run'); });
    ['run', 'hist', 'mem', 'set'].forEach(function (t) { $('sec-' + t).classList.toggle('hide', t !== 'run'); });
    $('intent').value = intent || ''; $('result').classList.add('hide'); $('tools').classList.add('hide');
    $('log').textContent = ''; $('log').classList.remove('hide'); $('run').disabled = true; setState('Cargando…');
    poll(id);
  }

  /* ---- memoria del proyecto ---- */
  function loadMem() {
    var box = $('memList'); box.textContent = 'Cargando…';
    api('/projects/' + encodeURIComponent(current.slug) + '/memory?limit=30').then(function (d) {
      box.textContent = '';
      var m = (d && d.memories) || [];
      if (!m.length) { box.textContent = 'Este proyecto todavía no tiene memoria.'; return; }
      m.forEach(function (x) { box.appendChild(item('div', (x.content || '').slice(0, 600), x.type + ' · ' + fmt(x.created_at))); });
    }).catch(fail);
  }
  function saveMem(content, type, stateEl, done) {
    stateEl.textContent = 'Guardando…';
    api('/projects/' + encodeURIComponent(current.slug) + '/memory', { method: 'POST', body: JSON.stringify({ content: content, type: type }) })
      .then(function (d) { stateEl.textContent = d && d.ok ? 'Guardado.' : 'No se pudo guardar: ' + ((d && d.error) || ''); if (d && d.ok && done) done(); })
      .catch(fail);
  }
  $('memSave').addEventListener('click', function () {
    var t = $('memText').value.trim(); if (!t) { $('memState').textContent = 'Escribe algo primero.'; return; }
    saveMem(t, $('memType').value, $('memState'), function () { $('memText').value = ''; loadMem(); });
  });
  $('savemem').addEventListener('click', function () {
    if (!lastText) return;
    saveMem('Resultado del encargo: ' + $('intent').value.trim() + '\n\n' + lastText, 'note', $('state'), null);
    setTimeout(function () { if ($('state').textContent === 'Guardado.') $('state').textContent = ''; }, 2500);
  });

  /* ---- nuevo proyecto ---- */
  $('newProj').addEventListener('click', function () {
    var name = (window.prompt('Nombre del proyecto:') || '').trim(); if (!name) return;
    var desc = (window.prompt('¿De qué trata? (opcional)') || '').trim();
    api('/projects', { method: 'POST', body: JSON.stringify({ name: name, description: desc }) }).then(function (d) {
      if (d && d.ok) { current = { slug: d.project.slug, name: d.project.name }; loadProjects(); }
      else setState('No se pudo crear: ' + ((d && d.error) || ''));
    }).catch(fail);
  });

  /* Markdown mínimo y seguro: todo se escapa primero, nada se ejecuta. */
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function inline(s) {
    return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  }
  function md(src) {
    var lines = esc(src).split('\n'), out = [], list = null, code = false, buf = [];
    function close() { if (list) { out.push('</' + list + '>'); list = null; } }
    lines.forEach(function (l) {
      if (/^```/.test(l)) { if (code) { out.push('<pre>' + buf.join('\n') + '</pre>'); buf = []; code = false; } else { close(); code = true; } return; }
      if (code) { buf.push(l); return; }
      var m;
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); var n = Math.min(m[1].length + 1, 5); out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>'); }
      else if (/^---+\s*$/.test(l)) { close(); out.push('<hr>'); }
      else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if (/^\|/.test(l)) { close(); out.push('<pre>' + l + '</pre>'); }
      else if (!l.trim()) { close(); }
      else { close(); out.push('<p>' + inline(l.replace(/^&gt;\s?/, '')) + '</p>'); }
    });
    close(); if (code) out.push('<pre>' + buf.join('\n') + '</pre>');
    return out.join('\n');
  }

  if (pw) { api('/status').then(function (d) { if (d && d.ok) showApp(); }).catch(function () { showLogin(''); }); }
})();
