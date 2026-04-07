/**
 * URUS Platform — app.js
 * Full SaaS logic engine: Auth, Nav, Leads, Chat, Blast, FollowUps, Settings
 * Connects to existing backend endpoints — NO framework
 */

'use strict';

// ════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════
const S = {
  token:        null,
  user:         null,
  leads:        [],
  filteredLeads:[],
  filterStatus: 'all',
  searchQuery:  '',
  selectedLead: null,
  messages:     [],
  followups:    [],
  blastLeads:   [],
  settings: {
    phone:      '+1 260 300 6906',
    business:   'URUS WhatsApp OS',
    industry:   'Automatización WhatsApp',
    price:      297,
    closeRate:  30,
  },
  refreshTimer:   null,
  chatRefresh:    null,
  isOnline:       false,
  lastBlast:      null,
  fuTab:          'pending',
  currentFuLead:  null,
};

// ════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function esc(v) {
  return String(v ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function initials(name) {
  const n = String(name || '?').trim();
  return n.charAt(0).toUpperCase();
}

function fmtDate(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000)   return 'ahora';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
    if (diff < 86400000)return `${Math.floor(diff/3600000)}h`;
    return d.toLocaleDateString('es-PR', { month:'short', day:'numeric' });
  } catch { return ''; }
}

function fmtFull(val) {
  if (!val) return '';
  try {
    return new Date(val).toLocaleString('es-PR', {
      month:'short', day:'numeric',
      hour:'numeric', minute:'2-digit'
    });
  } catch { return ''; }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function currency(n) {
  return new Intl.NumberFormat('en-US', {
    style:'currency', currency:'USD', maximumFractionDigits:0
  }).format(n || 0);
}

function scoreClass(score) {
  const s = Number(score || 0);
  if (s >= 7)  return 'score-high';
  if (s >= 4)  return 'score-med';
  return 'score-low';
}

function statusPillClass(status) {
  switch(String(status || '').toUpperCase()) {
    case 'READY_TO_CALL':  return 'pill-red';
    case 'INFO_RECEIVED':  return 'pill-green';
    case 'WAITING_INFO':   return 'pill-amber';
    default:               return 'pill-muted';
  }
}

function statusLabel(status) {
  switch(String(status || '').toUpperCase()) {
    case 'READY_TO_CALL': return 'Ready';
    case 'INFO_RECEIVED': return 'Info ✓';
    case 'WAITING_INFO':  return 'Waiting';
    case 'NEW':           return 'Nuevo';
    default:              return status || 'NEW';
  }
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (S.token && S.token !== 'demo') h['Authorization'] = `Bearer ${S.token}`;
  return h;
}

async function api(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json().catch(() => ({}));
}

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════
function toast(msg, type = 'info', duration = 3500) {
  const icons = { success:'✓', error:'✕', info:'⚡' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'⚡'}</span><span>${esc(msg)}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════
const Modal = {
  open(id) { $(id)?.classList.add('open'); },
  close(id) { $(id)?.classList.remove('open'); },
};

// ════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════
const Auth = {
  async login() {
    const email = $('loginEmail')?.value?.trim();
    const pass  = $('loginPass')?.value?.trim();
    const errEl = $('loginError');
    const btn   = $('loginBtn');

    errEl.className = 'login-error';
    errEl.textContent = '';

    if (!email || !pass) {
      errEl.textContent = 'Completa email y contraseña.';
      errEl.className = 'login-error show';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
      const data = await api('POST', '/v1/auth/login', { email, password: pass });

      if (data.token) {
        S.token = data.token;
        S.user  = data.user || { email };
        localStorage.setItem('urus_token', S.token);
        localStorage.setItem('urus_user',  JSON.stringify(S.user));
        Auth.enter(S.user);
      } else {
        // Demo fallback: accept any credentials for local testing
        if (pass.length >= 4) {
          S.token = 'demo';
          S.user  = { email };
          localStorage.setItem('urus_token', 'demo');
          localStorage.setItem('urus_user',  JSON.stringify(S.user));
          Auth.enter(S.user);
        } else {
          errEl.textContent = data.message || 'Credenciales incorrectas.';
          errEl.className = 'login-error show';
        }
      }
    } catch(e) {
      // If backend unreachable but credentials provided
      if (email && pass.length >= 4) {
        S.token = 'demo';
        S.user  = { email };
        localStorage.setItem('urus_token', 'demo');
        localStorage.setItem('urus_user',  JSON.stringify(S.user));
        Auth.enter(S.user);
      } else {
        errEl.textContent = 'Error de conexión con el servidor.';
        errEl.className = 'login-error show';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar al sistema →';
    }
  },

  enter(user) {
    $('loginScreen').classList.add('hidden');
    const app = $('app');
    app.classList.add('ready');

    // Update UI with user info
    const initial = initials(user.email || user.name || 'A');
    if ($('userAvatar')) $('userAvatar').textContent = initial;
    if ($('userName'))  $('userName').textContent = user.email?.split('@')[0] || 'Admin';

    // Load settings from localStorage
    Settings.load();

    // Start app
    App.start();
  },

  logout() {
    S.token = null; S.user = null;
    localStorage.removeItem('urus_token');
    localStorage.removeItem('urus_user');
    App.stop();
    $('loginScreen').classList.remove('hidden');
    $('app').classList.remove('ready');
    if ($('loginPass')) $('loginPass').value = '';
  },

  restore() {
    const token = localStorage.getItem('urus_token');
    const user  = localStorage.getItem('urus_user');
    if (token && user) {
      try {
        S.token = token;
        S.user  = JSON.parse(user);
        return true;
      } catch { return false; }
    }
    return false;
  }
};

// ════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════
const pageMeta = {
  dashboard: { title:'Dashboard', sub:'Resumen operativo en tiempo real' },
  leads:     { title:'Leads & Chat', sub:'Conversaciones activas con tus prospectos' },
  blast:     { title:'Blast Masivo', sub:'Envío masivo personalizado con seguimiento automático' },
  followups: { title:'Follow-ups', sub:'Secuencias de seguimiento programadas por URUS' },
  settings:  { title:'Ajustes', sub:'Configuración del sistema y del asistente' },
};

const Nav = {
  current: 'dashboard',

  go(page, btn) {
    // Hide all pages
    $$('.page').forEach(p => p.classList.remove('active'));
    $$('.nav-link').forEach(l => l.classList.remove('active'));

    // Show target page
    const target = $(`page-${page}`);
    if (target) target.classList.add('active');

    // Activate nav link
    if (btn) {
      btn.classList.add('active');
    } else {
      $$('.nav-link').forEach(l => {
        if (l.dataset.page === page) l.classList.add('active');
      });
    }

    // Update topbar
    const meta = pageMeta[page] || { title: page, sub:'' };
    if ($('pageTitle'))    $('pageTitle').textContent    = meta.title;
    if ($('pageSubtitle')) $('pageSubtitle').textContent = meta.sub;

    Nav.current = page;

    // Page-specific load
    if (page === 'dashboard') Dashboard.load();
    if (page === 'leads')     Leads.load();
    if (page === 'followups') FollowUps.load();
    if (page === 'settings')  Settings.checkBackend();
  }
};

// ════════════════════════════════════════════
// APP LIFECYCLE
// ════════════════════════════════════════════
const App = {
  start() {
    Dashboard.load();
    Leads.load();
    FollowUps.load();
    App.checkHealth();

    // Auto-refresh every 8s
    S.refreshTimer = setInterval(() => {
      App.checkHealth();
      if (Nav.current === 'dashboard') Dashboard.load(true);
      if (Nav.current === 'leads')     Leads.silentRefresh();
    }, 8000);

    // Chat auto-refresh when lead selected
    S.chatRefresh = setInterval(() => {
      if (S.selectedLead) Chat.silentRefresh();
    }, 4000);
  },

  stop() {
    clearInterval(S.refreshTimer);
    clearInterval(S.chatRefresh);
    S.refreshTimer = null;
    S.chatRefresh  = null;
  },

  async refresh() {
    toast('Actualizando...', 'info', 1500);
    if (Nav.current === 'dashboard') await Dashboard.load();
    if (Nav.current === 'leads')     await Leads.load();
    if (Nav.current === 'followups') await FollowUps.load();
    App.checkHealth();
  },

  async checkHealth() {
    try {
      const res = await fetch('/health');
      S.isOnline = res.ok;
    } catch { S.isOnline = false; }
    App.updateStatusPill();
  },

  updateStatusPill() {
    const pill = $('connectionPill');
    const text = $('connectionText');
    if (!pill || !text) return;
    if (S.isOnline) {
      pill.className = 'status-pill online';
      text.textContent = 'Sistema activo';
    } else {
      pill.className = 'status-pill offline';
      text.textContent = 'Sin conexión';
    }
  }
};

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
const Dashboard = {
  async load(silent = false) {
    try {
      const data = await api('GET', '/v1/wa/leads');
      if (!data.success) return;

      const leads = data.leads || [];
      S.leads = leads;

      // Compute stats
      const total  = leads.length;
      const ready  = leads.filter(l => l.status === 'READY_TO_CALL').length;
      const info   = leads.filter(l => l.status === 'INFO_RECEIVED').length;
      const waiting= leads.filter(l => l.status === 'WAITING_INFO').length;
      const newL   = leads.filter(l => !l.status || l.status === 'NEW').length;

      const price     = Number(S.settings.price || 297);
      const closeRate = Number(S.settings.closeRate || 30) / 100;
      const pipeline  = Math.round(total * price * closeRate);

      // Update stat cards
      if ($('stat-total'))   $('stat-total').textContent   = total;
      if ($('stat-ready'))   $('stat-ready').textContent   = ready;
      if ($('stat-pipeline'))$('stat-pipeline').textContent= currency(pipeline);
      if ($('stat-fu'))      $('stat-fu').textContent      = S.followups.filter(f => f.status === 'pending').length;
      if ($('stat-total-sub')) $('stat-total-sub').textContent = `${info} con info · ${waiting} esperando`;

      // Pipeline stages
      Dashboard.renderPipeline({ ready, info, waiting, newL, total });

      // Recent leads
      Dashboard.renderRecent(leads.slice(0, 6));

      // Activity feed
      Dashboard.renderActivity(leads.slice(0, 10));

      // Update unread badge
      const unread = leads.filter(l => l.status === 'NEW').length;
      const badge = $('unreadBadge');
      if (badge) {
        badge.textContent = unread;
        badge.style.display = unread > 0 ? 'flex' : 'none';
      }

    } catch(e) { console.error('Dashboard.load', e); }
  },

  renderPipeline({ ready, info, waiting, newL, total }) {
    const el = $('pipelineStages');
    if (!el) return;
    if (!total) {
      el.innerHTML = `<div class="empty-state" style="padding:24px;">
        <div class="empty-icon">📊</div>
        <div class="empty-title">Sin datos</div>
        <div class="empty-desc">Los leads aparecen cuando alguien escribe a tu WhatsApp.</div>
      </div>`;
      return;
    }
    const stages = [
      { name:'🔥 Ready to Call', count:ready,   color:'#ef4444', pct: Math.round((ready/total)*100) },
      { name:'✅ Info Received',  count:info,    color:'#22c55e', pct: Math.round((info/total)*100) },
      { name:'⏳ Waiting Info',  count:waiting, color:'#f59e0b', pct: Math.round((waiting/total)*100) },
      { name:'🆕 Nuevos',        count:newL,    color:'#38bdf8', pct: Math.round((newL/total)*100) },
    ];
    el.innerHTML = stages.map(s => `
      <div class="pipeline-stage">
        <div class="ps-dot" style="background:${s.color}"></div>
        <div class="ps-info">
          <div class="ps-name">${s.name}</div>
          <div class="ps-count">${s.pct}% del total</div>
        </div>
        <div class="ps-bar-wrap">
          <div class="ps-bar" style="background:${s.color};width:${s.pct}%"></div>
        </div>
        <div class="ps-value">${s.count}</div>
      </div>
    `).join('');
  },

  renderRecent(leads) {
    const el = $('recentLeads');
    if (!el) return;
    if (!leads.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Sin leads aún</div></div>`;
      return;
    }
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">` +
      leads.map(l => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;
          padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;
          transition:border-color .15s;" onclick="Nav.go('leads');setTimeout(()=>Leads.selectById('${l.id}'),400)"
          onmouseover="this.style.borderColor='var(--border2)'"
          onmouseout="this.style.borderColor='var(--border)'">
          <div style="width:34px;height:34px;border-radius:9px;background:var(--gold-dim);
            border:1px solid rgba(200,168,75,0.2);display:flex;align-items:center;
            justify-content:center;font-weight:800;color:var(--gold);font-size:13px;flex-shrink:0;">
            ${esc(initials(l.name))}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;margin-bottom:2px;">${esc(l.name || 'Sin nombre')}</div>
            <div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${esc(l.last_message || l.phone || '')}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
            <span class="pill ${statusPillClass(l.status)}">${esc(statusLabel(l.status))}</span>
            <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);">Score ${l.score ?? 0}</span>
          </div>
        </div>
      `).join('') + `</div>`;
  },

  renderActivity(leads) {
    const el = $('activityList');
    if (!el) return;
    if (!leads.length) {
      el.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-desc">Sin actividad registrada</div></div>`;
      return;
    }
    const colors = { READY_TO_CALL:'#ef4444', INFO_RECEIVED:'#22c55e', WAITING_INFO:'#f59e0b', NEW:'#38bdf8' };
    el.innerHTML = leads.map(l => `
      <div class="activity-item">
        <div class="activity-dot" style="background:${colors[l.status] || '#5a5650'}"></div>
        <div class="activity-body">
          <div class="activity-name">${esc(l.name || 'Lead')}</div>
          <div class="activity-msg">${esc(l.last_message || l.phone || '')}</div>
        </div>
        <div class="activity-time">${esc(statusLabel(l.status))}</div>
      </div>
    `).join('');
  }
};

// ════════════════════════════════════════════
// LEADS
// ════════════════════════════════════════════
const Leads = {
  async load() {
    $('leadsList').innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    try {
      const data = await api('GET', '/v1/wa/leads');
      if (!data.success) throw new Error('API error');
      S.leads = data.leads || [];
      Leads.applyFilter();
      Leads.render();
    } catch(e) {
      $('leadsList').innerHTML = `<div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Error cargando leads</div>
        <div class="empty-desc">Verifica la conexión con el backend.</div>
      </div>`;
    }
  },

  async silentRefresh() {
    try {
      const data = await api('GET', '/v1/wa/leads');
      if (!data.success) return;
      const wasCount = S.leads.length;
      S.leads = data.leads || [];
      Leads.applyFilter();

      // Only re-render list if something changed
      if (S.leads.length !== wasCount) Leads.render();
      else Leads.render(); // always re-render to update previews

      // Update count badge
      if ($('leadsCount')) $('leadsCount').textContent = `${S.leads.length} leads`;
    } catch {}
  },

  setFilter(status, btn) {
    S.filterStatus = status;
    S.searchQuery  = '';
    if ($('leadSearch')) $('leadSearch').value = '';
    $$('.filter-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    Leads.applyFilter();
    Leads.render();
  },

  filter(query) {
    S.searchQuery = query;
    Leads.applyFilter();
    Leads.render();
  },

  applyFilter() {
    let leads = [...S.leads];

    // Status filter
    if (S.filterStatus !== 'all') {
      leads = leads.filter(l => String(l.status || 'NEW').toUpperCase() === S.filterStatus);
    }

    // Search
    if (S.searchQuery) {
      const q = S.searchQuery.toLowerCase();
      leads = leads.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.last_message || '').toLowerCase().includes(q)
      );
    }

    S.filteredLeads = leads;
    if ($('leadsCount')) $('leadsCount').textContent = `${leads.length} leads`;
  },

  render() {
    const el = $('leadsList');
    if (!el) return;

    if (!S.filteredLeads.length) {
      el.innerHTML = `<div class="empty-state" style="padding:32px 16px;">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Sin resultados</div>
        <div class="empty-desc">Prueba con otro filtro o búsqueda.</div>
      </div>`;
      return;
    }

    el.innerHTML = S.filteredLeads.map(l => {
      const isActive  = S.selectedLead?.id === l.id;
      const score     = Number(l.score || 0);
      const sc        = scoreClass(score);
      return `
        <div class="lead-item ${isActive ? 'active' : ''}"
          onclick="Leads.select('${l.id}')">
          <div class="la">${esc(initials(l.name))}</div>
          <div class="li-body">
            <div class="li-top">
              <div class="li-name">${esc(l.name || 'Sin nombre')}</div>
              <div class="li-time">${fmtDate(l.updated_at)}</div>
            </div>
            <div class="li-preview">${esc(l.last_message || l.phone || '—')}</div>
          </div>
          <div class="score-ring ${sc}">${score}</div>
        </div>
      `;
    }).join('');
  },

  async select(id) {
    const lead = S.leads.find(l => String(l.id) === String(id));
    if (!lead) return;
    S.selectedLead = lead;

    // Update active state in list
    $$('.lead-item').forEach(el => {
      el.classList.toggle('active', el.onclick?.toString().includes(`'${id}'`));
    });
    Leads.render();

    // Render chat header
    Chat.renderHead(lead);

    // Enable compose
    const inp = $('composeInput');
    const btn = $('composeSend');
    if (inp) { inp.disabled = false; inp.placeholder = 'Escribe un mensaje...'; inp.focus(); }
    if (btn) btn.disabled = false;

    // Load messages
    await Chat.loadMessages(id);
  },

  selectById(id) {
    Leads.select(id);
  }
};

// ════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════
const Chat = {
  renderHead(lead) {
    const el = $('chatHead');
    if (!el) return;
    el.innerHTML = `
      <div class="chat-head-user">
        <div class="chat-head-avatar">${esc(initials(lead.name))}</div>
        <div>
          <div class="chat-head-name">${esc(lead.name || 'Sin nombre')}</div>
          <div class="chat-head-meta">
            ${esc(lead.phone || '')} ·
            <span class="pill ${statusPillClass(lead.status)}" style="font-size:10px;">
              ${esc(statusLabel(lead.status))}
            </span>
            · Score ${lead.score ?? 0}
          </div>
        </div>
      </div>
      <div class="chat-head-actions">
        <button class="btn btn-outline" style="font-size:11px;padding:5px 10px;"
          onclick="FollowUps.openModal('${lead.id}')">+ Follow-up</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;"
          onclick="Chat.loadMessages('${lead.id}')">⟳</button>
      </div>
    `;
  },

  async loadMessages(leadId) {
    if (!leadId) return;
    const el = $('chatMessages');
    if (!el) return;

    el.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;

    try {
      const data = await api('GET', `/v1/wa/leads/${leadId}/messages`);
      if (!data.success) throw new Error('No data');

      S.messages = data.messages || [];
      if (data.lead) {
        S.selectedLead = data.lead;
        Chat.renderHead(data.lead);
      }
      Chat.renderMessages();
      Chat.scrollToBottom();
    } catch(e) {
      el.innerHTML = `<div class="chat-empty-state">
        <div class="ces-icon">⚠️</div>
        <div class="ces-title">Error cargando mensajes</div>
        <div class="ces-desc">Intenta de nuevo.</div>
      </div>`;
    }
  },

  async silentRefresh() {
    if (!S.selectedLead) return;
    try {
      const data = await api('GET', `/v1/wa/leads/${S.selectedLead.id}/messages`);
      if (!data.success) return;
      const oldCount = S.messages.length;
      S.messages = data.messages || [];
      if (S.messages.length !== oldCount) {
        Chat.renderMessages();
        Chat.scrollToBottom();
      }
    } catch {}
  },

  renderMessages() {
    const el = $('chatMessages');
    if (!el) return;

    if (!S.messages.length) {
      el.innerHTML = `<div class="chat-empty-state">
        <div class="ces-icon">💬</div>
        <div class="ces-title">Sin mensajes</div>
        <div class="ces-desc">Este lead aún no tiene mensajes registrados.</div>
      </div>`;
      return;
    }

    // Group messages by date
    let html = '';
    let lastDate = '';

    S.messages.forEach((msg, i) => {
      // Date divider
      const d = msg.created_at ? new Date(msg.created_at) : null;
      const dateStr = d ? d.toLocaleDateString('es-PR', { weekday:'long', month:'long', day:'numeric' }) : '';
      if (dateStr && dateStr !== lastDate) {
        html += `<div class="date-divider"><span>${dateStr}</span></div>`;
        lastDate = dateStr;
      }

      const isOut = msg.direction === 'outbound';
      html += `
        <div class="msg-row ${isOut ? 'out' : ''}">
          <div class="msg-bubble ${isOut ? 'out' : 'in'}">
            <div class="msg-text">${esc(msg.body || '')}</div>
            <div class="msg-footer">
              <span class="msg-channel">${isOut ? 'URUS' : 'Lead'}</span>
              <span class="msg-time-label">${fmtFull(msg.created_at)}</span>
            </div>
          </div>
        </div>
      `;
    });

    // Typing indicator
    html += `
      <div class="typing-indicator" id="typingIndicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;

    el.innerHTML = html;
  },

  scrollToBottom() {
    const el = $('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  },

  async send() {
    if (!S.selectedLead) return;
    const inp = $('composeInput');
    const btn = $('composeSend');
    const msg = inp?.value?.trim();
    if (!msg) return;

    inp.value = '';
    btn.disabled = true;

    // Optimistic UI: show message immediately
    const tempMsg = {
      id: 'temp-' + Date.now(),
      direction: 'outbound',
      body: msg,
      created_at: new Date().toISOString(),
      message_type: 'text'
    };
    S.messages.push(tempMsg);
    Chat.renderMessages();
    Chat.scrollToBottom();

    try {
      const data = await api('POST', `/v1/wa/leads/${S.selectedLead.id}/send`, { message: msg });
      if (data.success) {
        toast('Mensaje enviado ✓', 'success', 2000);
        // Reload to get server-confirmed message
        await Chat.loadMessages(S.selectedLead.id);
      } else {
        // Remove optimistic message
        S.messages = S.messages.filter(m => m.id !== tempMsg.id);
        Chat.renderMessages();
        toast('Error al enviar: ' + (data.error || 'Desconocido'), 'error');
      }
    } catch(e) {
      S.messages = S.messages.filter(m => m.id !== tempMsg.id);
      Chat.renderMessages();
      toast('Error de conexión al enviar', 'error');
    } finally {
      btn.disabled = false;
      inp.focus();
    }
  }
};

// ════════════════════════════════════════════
// BLAST
// ════════════════════════════════════════════
const Blast = {
  handleDrop(e) {
    e.preventDefault();
    $('uploadZone').classList.remove('drag');
    const file = e.dataTransfer?.files?.[0];
    if (file) Blast.processFile(file);
  },

  handleFile(input) {
    const file = input?.files?.[0];
    if (file) Blast.processFile(file);
  },

  processFile(file) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv')) {
      toast('Solo se aceptan archivos CSV. Guarda tu Excel como CSV primero.', 'error', 4000);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => Blast.parseCSV(e.target.result, file.name);
    reader.readAsText(file);
  },

  parseCSV(text, filename) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) { toast('El archivo está vacío', 'error'); return; }

    const raw  = lines[0].split(',').map(h => h.trim().replace(/['"]/g,'').toLowerCase());
    const hdrs = raw;

    const findCol = (...names) => hdrs.findIndex(h => names.some(n => h.includes(n)));
    const iNombre  = findCol('nombre','name','nombres','full');
    const iTel     = findCol('telefono','tel','phone','celular','móvil','movil','numero','número','whatsapp');
    const iEmail   = findCol('email','correo','mail');

    if (iTel === -1) {
      toast('No se encontró columna de teléfono. Usa: "telefono" o "phone"', 'error', 5000);
      return;
    }

    const leads = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(',').map(v => v.trim().replace(/['"]/g,''));
      const telefono = cols[iTel] || '';
      if (!telefono) continue;
      leads.push({
        nombre:   iNombre  >= 0 ? (cols[iNombre]  || '') : `Lead ${i}`,
        telefono: telefono,
        email:    iEmail   >= 0 ? (cols[iEmail]   || '') : '',
        _row:     i
      });
    }

    if (!leads.length) { toast('No se encontraron leads válidos', 'error'); return; }

    S.blastLeads = leads;
    $('uploadTitle').textContent = `✓ ${filename} — ${leads.length} leads`;
    $('uploadZone').style.borderColor = 'var(--gold)';
    $('leadsTableWrap').style.display = 'block';
    $('tableTitle').textContent = `${leads.length} leads cargados`;
    $('blastBtn').disabled = false;
    $('blastStatusText').textContent = `${leads.length} leads listos`;

    Blast.renderTable(leads);
    toast(`${leads.length} leads cargados exitosamente`, 'success');
  },

  renderTable(leads) {
    const tb = $('leadsTableBody');
    if (!tb) return;
    const preview = leads.slice(0, 20);
    tb.innerHTML = preview.map((l, i) => `
      <tr>
        <td style="color:var(--text3);font-family:'DM Mono',monospace;font-size:11px;">${i+1}</td>
        <td class="td-name">${esc(l.nombre)}</td>
        <td class="td-phone">${esc(l.telefono)}</td>
        <td style="font-size:12px;color:var(--text3);">${esc(l.email)}</td>
        <td><span class="pill pill-muted">Pendiente</span></td>
      </tr>
    `).join('') + (leads.length > 20 ? `
      <tr>
        <td colspan="5" style="text-align:center;font-size:12px;color:var(--text3);padding:12px;">
          ... y ${leads.length - 20} leads más
        </td>
      </tr>
    ` : '');
  },

  insertToken(token) {
    const ta = $('blastMsg');
    if (!ta) return;
    const pos = ta.selectionStart;
    const val = ta.value;
    ta.value = val.slice(0, pos) + token + val.slice(pos);
    ta.selectionStart = ta.selectionEnd = pos + token.length;
    ta.focus();
  },

  clear() {
    S.blastLeads = [];
    $('leadsTableWrap').style.display = 'none';
    $('blastProgress').classList.remove('show');
    $('uploadTitle').textContent = 'Arrastra tu archivo aquí';
    $('uploadZone').style.borderColor = '';
    $('blastBtn').disabled = true;
    $('blastStatusText').textContent = 'Carga un archivo primero';
    $('fileInput').value = '';
  },

  async start() {
    if (!S.blastLeads.length) return;
    const msg = $('blastMsg')?.value?.trim();
    if (!msg) { toast('Escribe el mensaje primero', 'error'); return; }

    const delayMs  = Number($('blastDelay')?.value || 600);
    const fuHours  = Number($('blastFollowup')?.value || 24);

    if (!confirm(`¿Enviar mensaje a ${S.blastLeads.length} leads?\n\nEsta acción enviará WhatsApps reales.`)) return;

    // Show progress
    const prog = $('blastProgress');
    prog.classList.add('show');
    $('blastBtn').disabled = true;
    $('blastLog').innerHTML = '';

    let sent = 0, failed = 0;
    const results = [];

    for (let i = 0; i < S.blastLeads.length; i++) {
      const lead  = S.blastLeads[i];
      const pct   = Math.round(((i + 1) / S.blastLeads.length) * 100);
      const personal = msg
        .replace(/\{\{nombre\}\}/gi,   lead.nombre   || 'amigo')
        .replace(/\{\{name\}\}/gi,     lead.nombre   || 'friend')
        .replace(/\{\{telefono\}\}/gi, lead.telefono || '');

      $('progressLabel').textContent = `Enviando a ${lead.nombre || lead.telefono}...`;
      $('progressCount').textContent = `${i + 1}/${S.blastLeads.length}`;
      $('progressFill').style.width  = `${pct}%`;

      try {
        // Use Twilio send endpoint
        const data = await api('POST', '/v1/wa/leads/blast', {
          to:      lead.telefono,
          message: personal,
          name:    lead.nombre
        });

        // Fallback: try direct twilio webhook or a custom route you add
        const ok = data.success || data.ok;
        if (ok) {
          sent++;
          results.push({ ...lead, status:'sent' });
          Blast.addLog(`✓ ${lead.nombre || lead.telefono}`, 'ok');
          if (fuHours > 0) FollowUps.scheduleFromBlast(lead, personal, fuHours);
        } else {
          failed++;
          results.push({ ...lead, status:'failed' });
          Blast.addLog(`✗ ${lead.nombre || lead.telefono}: ${data.error || 'Error'}`, 'err');
        }
      } catch(e) {
        failed++;
        results.push({ ...lead, status:'failed' });
        Blast.addLog(`✗ ${lead.nombre || lead.telefono}: Sin respuesta`, 'err');
      }

      await delay(delayMs);
    }

    // Final
    $('progressLabel').textContent = `Blast completo — ${sent} enviados, ${failed} fallidos`;
    $('progressFill').style.width  = '100%';
    $('blastBtn').disabled = false;

    // Save stats
    S.lastBlast = { date: new Date().toISOString(), sent, failed, total: S.blastLeads.length };
    localStorage.setItem('urus_last_blast', JSON.stringify(S.lastBlast));
    Blast.renderLastStats();

    // Update table rows
    const tb = $('leadsTableBody');
    if (tb) {
      const rows = tb.querySelectorAll('tr');
      results.slice(0, rows.length).forEach((r, i) => {
        const statusCell = rows[i]?.querySelector('td:last-child');
        if (statusCell) {
          statusCell.innerHTML = r.status === 'sent'
            ? `<span class="pill pill-green">Enviado</span>`
            : `<span class="pill pill-red">Fallido</span>`;
        }
      });
    }

    toast(
      sent > 0 ? `Blast completo: ${sent}/${S.blastLeads.length} enviados` : 'Blast fallido',
      sent > 0 ? 'success' : 'error',
      5000
    );

    FollowUps.save();
  },

  addLog(text, type) {
    const el = $('blastLog');
    if (!el) return;
    const div = document.createElement('div');
    div.className = `log-line ${type}`;
    div.textContent = text;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  },

  renderLastStats() {
    const el = $('lastBlastStats');
    if (!el || !S.lastBlast) return;
    const b = S.lastBlast;
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px;">
        <div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px;">
          <div style="font-size:20px;font-weight:800;color:var(--green);">${b.sent}</div>
          <div style="font-size:11px;color:var(--text3);">Enviados</div>
        </div>
        <div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px;">
          <div style="font-size:20px;font-weight:800;color:var(--red);">${b.failed}</div>
          <div style="font-size:11px;color:var(--text3);">Fallidos</div>
        </div>
        <div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px;">
          <div style="font-size:20px;font-weight:800;color:var(--gold);">${b.total}</div>
          <div style="font-size:11px;color:var(--text3);">Total</div>
        </div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);margin-top:8px;">
        ${fmtFull(b.date)}
      </div>
    `;
  }
};

// Update char count
document.addEventListener('input', e => {
  if (e.target?.id === 'blastMsg') {
    const len = e.target.value.length;
    const el = $('charCount');
    if (el) {
      el.textContent = `${len} / 1024 caracteres`;
      el.style.color = len > 900 ? 'var(--red)' : 'var(--text3)';
    }
  }
});

// ════════════════════════════════════════════
// FOLLOW-UPS
// ════════════════════════════════════════════
const FollowUps = {
  load() {
    const saved = localStorage.getItem('urus_followups');
    S.followups = saved ? JSON.parse(saved) : [];
    FollowUps.render();

    // Update badge
    const pending = S.followups.filter(f => f.status === 'pending').length;
    const badge = $('fuBadge');
    if (badge) {
      badge.textContent = pending;
      badge.style.display = pending > 0 ? 'flex' : 'none';
    }
    if ($('stat-fu')) $('stat-fu').textContent = pending;
  },

  save() {
    localStorage.setItem('urus_followups', JSON.stringify(S.followups));
  },

  scheduleFromBlast(lead, originalMsg, hours) {
    const fu = {
      id:          'fu-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      leadName:    lead.nombre || lead.telefono,
      leadPhone:   lead.telefono,
      originalMsg: originalMsg,
      followUpMsg: `Hola ${lead.nombre || 'de nuevo'}, solo quería dar seguimiento a mi mensaje anterior. ¿Pudiste verlo?`,
      scheduledAt: new Date(Date.now() + hours * 3600000).toISOString(),
      createdAt:   new Date().toISOString(),
      status:      'pending',
      step:        1,
      source:      'blast'
    };
    S.followups.push(fu);
  },

  openModal(leadId) {
    S.currentFuLead = leadId || S.selectedLead?.id;
    if (!S.currentFuLead) { toast('Selecciona un lead primero', 'error'); return; }
    const lead = S.leads.find(l => String(l.id) === String(S.currentFuLead)) || S.selectedLead;
    if ($('fuModalMsg') && lead) {
      $('fuModalMsg').value = `Hola ${lead.name || 'de nuevo'}, te escribo para dar seguimiento a tu consulta. ¿Tienes alguna pregunta?`;
    }
    Modal.open('fuModal');
  },

  async schedule() {
    const leadId = S.currentFuLead;
    const msg    = $('fuModalMsg')?.value?.trim();
    const mins   = Number($('fuModalDelay')?.value || 1440);
    if (!msg) { toast('Escribe el mensaje de seguimiento', 'error'); return; }

    const lead = S.leads.find(l => String(l.id) === String(leadId)) || S.selectedLead;
    const fu = {
      id:          'fu-' + Date.now(),
      leadId:      leadId,
      leadName:    lead?.name || 'Lead',
      leadPhone:   lead?.phone || '',
      originalMsg: '',
      followUpMsg: msg,
      scheduledAt: new Date(Date.now() + mins * 60000).toISOString(),
      createdAt:   new Date().toISOString(),
      status:      'pending',
      step:        1,
      source:      'manual'
    };

    S.followups.push(fu);
    FollowUps.save();
    FollowUps.load();
    Modal.close('fuModal');
    toast('Follow-up programado ✓', 'success');
  },

  setTab(tab, btn) {
    S.fuTab = tab;
    $$('.fu-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const labels = { pending:'pendientes', sent:'enviados', all:'todos' };
    if ($('fuTitle')) $('fuTitle').textContent = `Follow-ups ${labels[tab] || tab}`;
    FollowUps.render();
  },

  render() {
    const el = $('fuList');
    if (!el) return;

    let items = [...S.followups];
    if (S.fuTab === 'pending') items = items.filter(f => f.status === 'pending');
    if (S.fuTab === 'sent')    items = items.filter(f => f.status === 'sent');

    // Sort by scheduledAt
    items.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

    if (!items.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🔁</div>
        <div class="empty-title">Sin follow-ups ${S.fuTab === 'pending' ? 'pendientes' : S.fuTab === 'sent' ? 'enviados' : ''}</div>
        <div class="empty-desc">Los follow-ups aparecen aquí cuando haces un blast masivo o los programas manualmente desde el chat.</div>
      </div>`;
      return;
    }

    el.innerHTML = items.map(f => `
      <div class="fu-item">
        <div class="fu-avatar">${esc(initials(f.leadName))}</div>
        <div class="fu-info">
          <div class="fu-name">${esc(f.leadName || f.leadPhone)}</div>
          <div class="fu-msg">${esc(f.followUpMsg || f.originalMsg || '—')}</div>
          <div class="fu-when">
            📅 ${fmtFull(f.scheduledAt)} · Paso ${f.step}
            ${f.source === 'blast' ? ' · Blast' : ' · Manual'}
          </div>
        </div>
        <div class="fu-actions">
          ${f.status === 'pending' ? `
            <button class="btn btn-gold" style="font-size:11px;padding:5px 10px;"
              onclick="FollowUps.sendNow('${f.id}')">Enviar</button>
            <button class="btn btn-danger" style="font-size:11px;padding:5px 10px;"
              onclick="FollowUps.cancel('${f.id}')">✕</button>
          ` : `<span class="pill ${f.status === 'sent' ? 'pill-green' : 'pill-muted'}">${f.status === 'sent' ? 'Enviado' : f.status}</span>`}
        </div>
      </div>
    `).join('');
  },

  async sendNow(fuId) {
    const fu = S.followups.find(f => f.id === fuId);
    if (!fu) return;

    try {
      let leadId = fu.leadId;

      // If no leadId, try to find by phone
      if (!leadId && fu.leadPhone) {
        const lead = S.leads.find(l => l.phone === fu.leadPhone || l.phone?.includes(fu.leadPhone));
        if (lead) leadId = lead.id;
      }

      if (leadId) {
        const data = await api('POST', `/v1/wa/leads/${leadId}/send`, { message: fu.followUpMsg });
        if (data.success) {
          fu.status = 'sent';
          fu.sentAt = new Date().toISOString();
          FollowUps.save();
          FollowUps.load();
          toast(`Follow-up enviado a ${fu.leadName} ✓`, 'success');
          return;
        }
      }

      toast('No se pudo enviar: lead no encontrado en el sistema', 'error');
    } catch(e) {
      toast('Error enviando follow-up', 'error');
    }
  },

  async runPending() {
    const pending = S.followups.filter(f => f.status === 'pending');
    if (!pending.length) { toast('No hay follow-ups pendientes', 'info'); return; }

    const now = new Date();
    const overdue = pending.filter(f => new Date(f.scheduledAt) <= now);

    if (!overdue.length) {
      toast(`${pending.length} pendientes pero ninguno vence aún`, 'info');
      return;
    }

    toast(`Enviando ${overdue.length} follow-ups vencidos...`, 'info');
    for (const fu of overdue) {
      await FollowUps.sendNow(fu.id);
      await delay(800);
    }
  },

  cancel(fuId) {
    S.followups = S.followups.filter(f => f.id !== fuId);
    FollowUps.save();
    FollowUps.load();
    toast('Follow-up cancelado', 'info');
  }
};

// ════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════
const Settings = {
  load() {
    const saved = localStorage.getItem('urus_settings');
    if (saved) {
      try { Object.assign(S.settings, JSON.parse(saved)); } catch {}
    }
    // Apply to inputs
    if ($('settingPhone'))     $('settingPhone').value     = S.settings.phone      || '';
    if ($('settingBusiness'))  $('settingBusiness').value  = S.settings.business   || '';
    if ($('settingIndustry'))  $('settingIndustry').value  = S.settings.industry   || '';
    if ($('settingPrice'))     $('settingPrice').value     = S.settings.price      || 297;
    if ($('settingCloseRate')) $('settingCloseRate').value = S.settings.closeRate  || 30;
    if ($('sidebarPhone'))     $('sidebarPhone').textContent = S.settings.phone || '+1 260 300 6906';
  },

  save() {
    S.settings.business   = $('settingBusiness')?.value?.trim()  || S.settings.business;
    S.settings.industry   = $('settingIndustry')?.value?.trim()  || S.settings.industry;
    S.settings.price      = Number($('settingPrice')?.value)     || S.settings.price;
    S.settings.closeRate  = Number($('settingCloseRate')?.value) || S.settings.closeRate;
    localStorage.setItem('urus_settings', JSON.stringify(S.settings));
    if ($('sidebarPhone')) $('sidebarPhone').textContent = S.settings.phone;
    toast('Configuración guardada ✓', 'success');
  },

  async checkBackend() {
    const el = $('backendStatus');
    if (!el) return;
    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;font-size:13px;"><div class="spinner" style="width:14px;height:14px;"></div> Verificando...</div>`;
    try {
      const res  = await fetch('/health');
      const data = await res.json().catch(() => ({}));
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <span style="color:var(--green);font-size:16px;">✓</span>
            <span>Backend activo · Railway</span>
            <span class="pill pill-green">Online</span>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);">
            Twilio: ${data.twilio ? '✓' : '—'} ·
            DB: ${data.db ? '✓' : '—'} ·
            OpenAI: ${data.openai ? '✓' : '—'}
          </div>
        </div>
      `;
    } catch {
      el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <span style="color:var(--red);">✕</span>
        <span>Backend no responde</span>
        <span class="pill pill-red">Offline</span>
      </div>`;
    }
  }
};

// ════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════
document.addEventListener('keydown', e => {
  // Enter to send in chat (not Shift+Enter)
  if (e.key === 'Enter' && !e.shiftKey && e.target?.id === 'composeInput') {
    e.preventDefault();
    Chat.send();
    return;
  }

  // ESC to close modals
  if (e.key === 'Escape') {
    $$('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    return;
  }

  // Ctrl/Cmd shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '1') { e.preventDefault(); Nav.go('dashboard'); }
    if (e.key === '2') { e.preventDefault(); Nav.go('leads'); }
    if (e.key === '3') { e.preventDefault(); Nav.go('blast'); }
    if (e.key === '4') { e.preventDefault(); Nav.go('followups'); }
  }
});

// Auto-resize compose textarea
document.addEventListener('input', e => {
  if (e.target?.classList.contains('compose-textarea')) {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }
});

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Restore last blast stats
  const lb = localStorage.getItem('urus_last_blast');
  if (lb) {
    try { S.lastBlast = JSON.parse(lb); Blast.renderLastStats(); } catch {}
  }

  // Try auto-login
  if (Auth.restore()) {
    Auth.enter(S.user);
  }

  // Login on Enter
  $$('#loginEmail,#loginPass').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') Auth.login();
    });
  });
});
