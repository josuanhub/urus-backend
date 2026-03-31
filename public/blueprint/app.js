//
// URUS WA OS — FULL SaaS FRONTEND
// Compatible con:
// - /v1/wa/leads
// - /v1/wa/leads/:id/messages
// - /v1/wa/leads/:id/send
// - /v1/twilio/wa/webhook (ya conectado backend)
//
// UI: Premium + Mobile-first + Real-time
//

const API = "";

// ==============================
// STATE CENTRAL
// ==============================
const appState = {
  leads: [],
  filteredLeads: [],
  activeLead: null,
  messages: [],
  search: "",
  status: "all",
  loadingLeads: false,
  loadingMessages: false,
  sending: false,
  typing: false,
  notifications: [],
};

window.currentLeadId = null;

// ==============================
// INIT
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  mountApp();
  bindEvents();
  loadLeads();
  startRealtime();
});

// ==============================
// UI ROOT
// ==============================
function mountApp() {
  const root = document.getElementById("app");

  root.innerHTML = `
  <div class="ub-wrap">

    <!-- METRICS -->
    <div class="ub-grid ub-stats">

      <div class="ub-card ub-stat gold">
        <div class="ub-stat-label">Leads</div>
        <div class="ub-stat-value" id="metricLeads">0</div>
        <div class="ub-stat-sub">Activos</div>
      </div>

      <div class="ub-card ub-stat green">
        <div class="ub-stat-label">Conversión</div>
        <div class="ub-stat-value" id="metricConversion">0%</div>
        <div class="ub-stat-sub">Cierre</div>
      </div>

      <div class="ub-card ub-stat blue">
        <div class="ub-stat-label">Revenue</div>
        <div class="ub-stat-value" id="metricRevenue">$0</div>
        <div class="ub-stat-sub">Estimado</div>
      </div>

      <div class="ub-card ub-stat purple">
        <div class="ub-stat-label">Hot Leads</div>
        <div class="ub-stat-value" id="metricHot">0</div>
        <div class="ub-stat-sub">Alta intención</div>
      </div>

    </div>

    <!-- MAIN -->
    <div class="ub-main">

      <!-- LEADS -->
      <div class="ub-panel">

        <div class="ub-panel-head">
          <h3 class="ub-panel-title">Pipeline</h3>
        </div>

        <div class="ub-search-wrap">
          <input id="searchInput" class="ub-search" placeholder="Buscar..." />
        </div>

        <div class="ub-status-filters">
          ${renderFilters()}
        </div>

        <div id="leadsList" class="ub-leads"></div>

      </div>

      <!-- CHAT -->
      <div class="ub-panel">

        <div id="chatHeader" class="ub-chat-head">
          <div class="ub-chat-user">
            <div class="ub-avatar">--</div>
            <div>
              <h3>Selecciona lead</h3>
              <p>Sin conversación</p>
            </div>
          </div>
        </div>

        <div id="messages" class="ub-chat-body"></div>

        <div id="typingIndicator" class="ub-muted-note" style="display:none;">
          escribiendo...
        </div>

        <div class="ub-compose">
          <div class="ub-compose-row">
            <textarea id="messageInput" class="ub-textarea" placeholder="Escribe mensaje..."></textarea>
            <button id="sendBtn" class="ub-primary-btn">Enviar</button>
          </div>
        </div>

      </div>

    </div>

  </div>
  `;
}

// ==============================
// FILTERS
// ==============================
function renderFilters() {
  const statuses = ["all", "NEW", "INFO_RECEIVED", "READY_TO_CALL"];

  return statuses.map(s => `
    <button class="ub-chip ${appState.status === s ? "active" : ""}" onclick="setStatusFilter('${s}')">
      ${s}
    </button>
  `).join("");
}

window.setStatusFilter = function (s) {
  appState.status = s;
  filterLeads();
  mountApp();
  bindEvents();
  renderLeads();
};

// ==============================
// EVENTS
// ==============================
function bindEvents() {
  document.getElementById("searchInput").addEventListener("input", e => {
    appState.search = e.target.value.toLowerCase();
    filterLeads();
  });

  document.getElementById("sendBtn").addEventListener("click", sendMessage);

  document.getElementById("messageInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// ==============================
// LOAD LEADS
// ==============================
async function loadLeads() {
  try {
    const res = await fetch(API + "/v1/wa/leads");
    const data = await res.json();

    const prevIds = new Set(appState.leads.map(l => l.id));

    appState.leads = data.leads || [];

    // detectar nuevos leads (notificación)
    appState.leads.forEach(l => {
      if (!prevIds.has(l.id)) {
        notify("Nuevo lead", l.name || l.phone);
      }
    });

    filterLeads();
    renderMetrics();

  } catch (e) {
    console.error(e);
  }
}

// ==============================
// FILTER
// ==============================
function filterLeads() {
  appState.filteredLeads = appState.leads.filter(l => {

    const matchSearch =
      !appState.search ||
      (l.name || "").toLowerCase().includes(appState.search) ||
      (l.phone || "").includes(appState.search);

    const matchStatus =
      appState.status === "all" || l.status === appState.status;

    return matchSearch && matchStatus;
  });

  renderLeads();
}

// ==============================
// RENDER LEADS
// ==============================
function renderLeads() {
  const el = document.getElementById("leadsList");
  if (!el) return;

  el.innerHTML = "";

  appState.filteredLeads.forEach(l => {

    const isHot = l.score >= 70;

    const div = document.createElement("div");
    div.className = "ub-lead " + (appState.activeLead?.id === l.id ? "active" : "");

    div.innerHTML = `
      <div class="ub-avatar">${(l.name || "?")[0]}</div>

      <div>
        <div class="ub-lead-name">${l.name || l.phone}</div>
        <div class="ub-lead-snippet">${l.last_message || ""}</div>
      </div>

      <div>
        <div class="ub-pill ${isHot ? "ready" : ""}">${l.status}</div>
        ${isHot ? `<div class="ub-badge">🔥</div>` : ""}
      </div>
    `;

    div.onclick = () => selectLead(l);
    el.appendChild(div);
  });
}

// ==============================
// SELECT LEAD
// ==============================
async function selectLead(l) {
  appState.activeLead = l;
  window.currentLeadId = l.id;

  updateHeader();
  renderLeads();
  await loadMessages(l.id);
}

// ==============================
// HEADER
// ==============================
function updateHeader() {
  const el = document.getElementById("chatHeader");

  if (!appState.activeLead) return;

  el.innerHTML = `
    <div class="ub-chat-user">
      <div class="ub-avatar">${(appState.activeLead.name || "?")[0]}</div>
      <div>
        <h3>${appState.activeLead.name || appState.activeLead.phone}</h3>
        <p>${appState.activeLead.status}</p>
      </div>
    </div>
  `;
}

// ==============================
// LOAD MESSAGES
// ==============================
async function loadMessages(id) {
  try {
    appState.loadingMessages = true;

    const res = await fetch(API + `/v1/wa/leads/${id}/messages`);
    const data = await res.json();

    appState.messages = data.messages || [];
    renderMessages();

  } catch (e) {
    console.error(e);
  } finally {
    appState.loadingMessages = false;
  }
}

// ==============================
// RENDER MESSAGES
// ==============================
function renderMessages() {
  const el = document.getElementById("messages");
  el.innerHTML = "";

  if (!appState.activeLead) {
    el.innerHTML = `<div class="ub-empty">Selecciona lead</div>`;
    return;
  }

  appState.messages.forEach(m => {

    const row = document.createElement("div");
    row.className = "ub-msg-row " + (m.direction === "outbound" ? "outbound" : "");

    row.innerHTML = `
      <div class="ub-msg ${m.direction === "outbound" ? "outbound" : ""}">
        <div class="ub-msg-body">${escapeHTML(m.body)}</div>
        <div class="ub-msg-meta">${formatTime(m.created_at)}</div>
      </div>
    `;

    el.appendChild(row);
  });

  el.scrollTop = el.scrollHeight;
}

// ==============================
// SEND MESSAGE
// ==============================
async function sendMessage() {
  if (!appState.activeLead || appState.sending) return;

  const input = document.getElementById("messageInput");
  const text = input.value.trim();

  if (!text) return;

  appState.sending = true;

  try {
    await fetch(API + `/v1/wa/leads/${appState.activeLead.id}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: text })
    });

    input.value = "";

    await loadMessages(appState.activeLead.id);
    await loadLeads();

  } catch (e) {
    console.error(e);
  } finally {
    appState.sending = false;
  }
}

// ==============================
// METRICS
// ==============================
function renderMetrics() {
  const total = appState.leads.length;
  const closed = appState.leads.filter(l => l.status === "READY_TO_CALL").length;
  const hot = appState.leads.filter(l => l.score >= 70).length;

  document.getElementById("metricLeads").innerText = total;
  document.getElementById("metricHot").innerText = hot;
  document.getElementById("metricRevenue").innerText = "$" + (closed * 150);
  document.getElementById("metricConversion").innerText =
    total ? Math.round((closed / total) * 100) + "%" : "0%";
}

// ==============================
// NOTIFICATIONS
// ==============================
function notify(title, body) {
  console.log("🔔", title, body);
}

// ==============================
// REALTIME LOOP
// ==============================
function startRealtime() {
  setInterval(async () => {
    await loadLeads();

    if (appState.activeLead) {
      await loadMessages(appState.activeLead.id);
    }
  }, 5000);
}

// ==============================
// HELPERS
// ==============================
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHTML(str) {
  return (str || "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}
