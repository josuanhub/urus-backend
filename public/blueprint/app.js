// ==============================
// URUS BLUEPRINT OS — FINAL SAAS VERSION
// ==============================

document.addEventListener("DOMContentLoaded", () => {

  const API = window.location.origin;

  // ==============================
  // STATE
  // ==============================
  const state = {
    view: "dashboard",
    leads: [],
    messages: [],
    selectedLead: null,
    loading: false,
    sending: false,
    refresh: null,
  };

  init();

  // ==============================
  // INIT
  // ==============================
  function init() {
    bindSidebar();
    loadLeads();
    startRealtime();
    render();
  }

  // ==============================
  // NAVIGATION
  // ==============================
  function bindSidebar() {
    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.onclick = () => {
        state.view = btn.dataset.view;
        render();
      };
    });
  }

  // ==============================
  // DATA
  // ==============================
  async function loadLeads() {
    try {
      const res = await fetch(`${API}/v1/wa/leads`);
      const data = await res.json();
      state.leads = data || [];
      render();
    } catch (e) {
      console.error("LOAD LEADS ERROR", e);
    }
  }

  async function loadMessages(id) {
    try {
      const res = await fetch(`${API}/v1/wa-leads/${id}/messages`);
      const data = await res.json();
      state.messages = data || [];
      renderMessages();
      scrollBottom();
    } catch (e) {
      console.error(e);
    }
  }

  // ==============================
  // RENDER ROOT
  // ==============================
  function render() {
    highlightSidebar();

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "leads") renderLeads();
    if (state.view === "chat") renderChat();
  }

  // ==============================
  // DASHBOARD
  // ==============================
  function renderDashboard() {
    root().innerHTML = `
      <div class="ub-wrap">
        <h1 class="ub-title">URUS Blueprint</h1>
        <p class="ub-subtitle">Sistema operativo de ventas por WhatsApp</p>
      </div>
    `;
  }

  // ==============================
  // LEADS
  // ==============================
  function renderLeads() {
    root().innerHTML = `
      <div class="ub-wrap">
        <h2>Leads</h2>
        <div class="leads-list">
          ${state.leads.map(l => `
            <div class="lead-card" onclick="window.openLead('${l.id}')">
              <div>${l.name || l.phone}</div>
              <small>${l.status}</small>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    window.openLead = openLead;
  }

  function openLead(id) {
    state.selectedLead = state.leads.find(l => l.id == id);
    state.view = "chat";
    loadMessages(id);
    render();
  }

  // ==============================
  // CHAT
  // ==============================
  function renderChat() {
    if (!state.selectedLead) {
      root().innerHTML = `<div class="ub-wrap">Selecciona un lead</div>`;
      return;
    }

    root().innerHTML = `
      <div class="chat-container">
        
        <div class="chat-header">
          ${state.selectedLead.name || state.selectedLead.phone}
        </div>

        <div id="chatMessages" class="chat-messages"></div>

        <div class="chat-input">
          <input id="chatInput" placeholder="Escribe..." />
          <button id="sendBtn">Enviar</button>
        </div>

      </div>
    `;

    document.getElementById("sendBtn").onclick = sendMessage;

    renderMessages();
  }

  function renderMessages() {
    const el = document.getElementById("chatMessages");
    if (!el) return;

    el.innerHTML = state.messages.map(m => `
      <div class="msg ${m.direction}">
        ${m.body}
      </div>
    `).join("");
  }

  // ==============================
  // SEND MESSAGE
  // ==============================
  async function sendMessage() {
    if (state.sending) return;

    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    state.messages.push({
      direction: "outbound",
      body: text,
    });

    renderMessages();
    scrollBottom();

    state.sending = true;

    try {
      await fetch(`${API}/v1/wa-leads/${state.selectedLead.id}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ body: text })
      });
    } catch (e) {
      console.error(e);
    }

    state.sending = false;
  }

  // ==============================
  // REALTIME
  // ==============================
  function startRealtime() {
    if (state.refresh) return;

    state.refresh = setInterval(() => {
      if (state.view === "chat" && state.selectedLead) {
        loadMessages(state.selectedLead.id);
      }
      if (state.view === "leads") {
        loadLeads();
      }
    }, 3000);
  }

  // ==============================
  // HELPERS
  // ==============================
  function root() {
    return document.querySelector(".main-content");
  }

  function scrollBottom() {
    const el = document.getElementById("chatMessages");
    if (el) el.scrollTop = el.scrollHeight;
  }

  function highlightSidebar() {
    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.classList.remove("active");
      if (btn.dataset.view === state.view) {
        btn.classList.add("active");
      }
    });
  }

});
