const API = "/v1/wa";

// =====================
// STATE
// =====================
let state = {
  view: "dashboard",
  leads: [],
  selectedLead: null,
  messages: []
};

// =====================
// NAVIGATION
// =====================
document.querySelectorAll(".nav-item, .mobile-nav button").forEach(btn => {
  btn.onclick = () => {
    const view = btn.dataset.view;
    state.view = view;

    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.querySelector(`[data-view="${view}"]`)?.classList.add("active");

    render();
  };
});

// =====================
// RENDER
// =====================
function render() {
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "leads") renderLeads();
  if (state.view === "followups") renderFollowups();
  if (state.view === "calendar") renderCalendar();
  if (state.view === "analytics") renderAnalytics();
}

// =====================
// DASHBOARD
// =====================
function renderDashboard() {
  document.getElementById("viewTitle").innerText = "Dashboard";
  document.getElementById("viewSubtitle").innerText = "Vista general del sistema";

  document.getElementById("appContent").innerHTML = `
    <div class="cards">
      <div class="card">
        <h2>$45,000</h2>
        <p>Pipeline estimado</p>
      </div>

      <div class="card">
        <h2>${state.leads.length}</h2>
        <p>Leads activos</p>
      </div>

      <div class="card">
        <h2>5</h2>
        <p>Cierres estimados</p>
      </div>

      <div class="card">
        <h2>+12603006906</h2>
        <p>Número activo</p>
      </div>
    </div>
  `;
}

// =====================
// LOAD LEADS
// =====================
async function loadLeads() {
  const res = await fetch(`${API}/leads`);
  const data = await res.json();

  if (!data.success) return;

  state.leads = data.leads;
}

// =====================
// LEADS VIEW
// =====================
async function renderLeads() {
  document.getElementById("viewTitle").innerText = "Conversaciones";
  document.getElementById("viewSubtitle").innerText = "Mensajes en tiempo real";

  await loadLeads();

  document.getElementById("appContent").innerHTML = `
    <div class="leads-layout">

      <!-- LISTA -->
      <div class="leads-list">
        ${state.leads.map(l => `
          <div class="lead ${state.selectedLead?.id === l.id ? "active" : ""}" onclick="openChat('${l.id}')">
            <strong>${l.name || "Lead"}</strong>
            <p>${l.last_message || ""}</p>
          </div>
        `).join("")}
      </div>

      <!-- CHAT -->
      <div class="chat" id="chatArea">
        ${state.selectedLead ? renderChatHTML() : `
          <div style="padding:20px;color:#aaa">
            Selecciona un lead para ver conversación
          </div>
        `}
      </div>

    </div>
  `;
}

// =====================
// OPEN CHAT
// =====================
window.openChat = async function(id) {
  const res = await fetch(`${API}/leads/${id}/messages`);
  const data = await res.json();

  if (!data.success) return;

  state.selectedLead = data.lead;
  state.messages = data.messages;

  renderLeads();
  scrollBottom();
};

// =====================
// CHAT HTML
// =====================
function renderChatHTML() {
  return `
    <div class="chat-header">
      ${state.selectedLead.name} (${state.selectedLead.phone})
    </div>

    <div class="messages" id="messages">
      ${state.messages.map(m => `
        <div class="msg ${m.direction === "outbound" ? "me" : ""}">
          ${m.body}
        </div>
      `).join("")}
    </div>

    <div class="chat-input">
      <input id="msgInput" placeholder="Escribe..." />
      <button onclick="sendMsg()">Enviar</button>
    </div>
  `;
}

// =====================
// SEND MESSAGE
// =====================
window.sendMsg = async function() {
  const input = document.getElementById("msgInput");
  const text = input.value;

  if (!text) return;

  await fetch(`${API}/leads/${state.selectedLead.id}/send`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ message: text })
  });

  input.value = "";

  await openChat(state.selectedLead.id);
};

// =====================
// SCROLL FIX (MOBILE)
// =====================
function scrollBottom() {
  setTimeout(() => {
    const el = document.getElementById("messages");
    if (el) el.scrollTop = el.scrollHeight;
  }, 100);
}

// =====================
// FOLLOWUPS
// =====================
function renderFollowups() {
  document.getElementById("viewTitle").innerText = "Follow-ups";
  document.getElementById("viewSubtitle").innerText = "Seguimiento automático";

  document.getElementById("appContent").innerHTML = `
    <div class="card">
      Leads que necesitan respuesta o cierre
    </div>
  `;
}

// =====================
// CALENDAR
// =====================
function renderCalendar() {
  document.getElementById("viewTitle").innerText = "Agenda";
  document.getElementById("viewSubtitle").innerText = "Seguimientos";

  document.getElementById("appContent").innerHTML = `
    <div class="card">Calendario próximamente</div>
  `;
}

// =====================
// ANALYTICS
// =====================
function renderAnalytics() {
  document.getElementById("viewTitle").innerText = "Pipeline";
  document.getElementById("viewSubtitle").innerText = "Dinero estimado";

  document.getElementById("appContent").innerHTML = `
    <div class="card">$45,000 potencial</div>
  `;
}

// =====================
// INIT
// =====================
renderDashboard();
