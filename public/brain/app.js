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
  var current = null, polling = null, lastText = '';

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-studio-password': pw, 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401 || r.status === 503) { var e = new Error('auth'); e.auth = true; throw e; }
      return r.json();
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
        list = arr.filter(function (p) { return p && p.slug; }).map(function (p) { return { slug: p.slug, name: p.name || p.slug }; });
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
  }

  function stop() { if (polling) { clearInterval(polling); polling = null; } }
  function setState(t) { $('state').textContent = t || ''; }

  function labelFor(ev) {
    switch (ev.type) {
      case 'plan_ready': return 'Plan listo: ' + ev.steps + ' pasos';
      case 'step_start': return 'Empieza: ' + (ev.title || ev.step);
      case 'tool_call': return 'Usa herramienta: ' + ev.tool;
      case 'step_done': return 'Terminó: ' + ev.step;
      case 'synthesis': return 'Armando el informe final';
      case 'qa_start': return 'Revisando calidad';
      case 'qa_done': return ev.passed ? 'Calidad aprobada' : 'Calidad: se corrigió algo';
      case 'done': return 'Listo';
      default: return null;
    }
  }

  $('run').addEventListener('click', function () {
    var intent = $('intent').value.trim();
    if (!intent) { setState('Escribe primero qué quieres hacer.'); return; }
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
    navigator.clipboard.writeText(lastText).then(function () { setState('Copiado.'); }, function () { setState('No pude copiar; selecciona el texto a mano.'); });
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
