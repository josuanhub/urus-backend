document.addEventListener("DOMContentLoaded", () => {

  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  // =========================
  // STATE (MEJORADO)
  // =========================
  let appState = {
    whatsappConnected: false,
    businessName: "URUS Elite Motors",
    phoneNumber: "+12603006906",
    leads: [],
    selectedLead: null,
    messages: [],
    loading: false,
    sending: false,
    search: "",
    filter: "ALL"
  };

  // detectar si ya conectó
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("connected") === "1") {
    appState.whatsappConnected = true;
    window.history.replaceState({}, document.title, "/blueprint/index.html");
  }

  // =========================
  // RENDER ROOT
  // =========================
  function render() {
    if (!appState.whatsappConnected) {
      renderConnectScreen();
    } else {
      renderDashboard();
      loadLeads();
    }

    bindEvents();
  }

  // =========================
  // CONNECT SCREEN
  // =========================
  function renderConnectScreen() {
    appRoot.innerHTML = `
      <div class="main-inner">

        <header class="topbar">
          <div>
            <h2>Bienvenido</h2>
            <p>Conecta tu WhatsApp para empezar</p>
          </div>
          <div class="status-pill">
            <span class="dot" style="background:#f6b300;"></span>
            No conectado
          </div>
        </header>

        <section class="hero-connect">
          <div class="connect-card">
            <div class="connect-icon">🟢</div>
            <h2>Conecta tu WhatsApp Business</h2>
            <p>Activa tu sistema de leads automático en minutos.</p>
            <button class="connect-btn" id="openMetaConnect">Conectar WhatsApp</button>
          </div>
        </section>

      </div>

      <div class="meta-modal-backdrop" id="metaModal">
        <div class="meta-modal">
          <h3>Conectar WhatsApp</h3>
          <input id="metaPhoneInput" value="${appState.phoneNumber}" />
          <input id="metaBusinessInput" value="${appState.businessName}" />
          <div class="meta-actions">
            <button id="closeMetaModal">Cancelar</button>
            <button id="confirmMetaConnect">Conectar</button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================
  // DASHBOARD COMPLETO (UPGRADE)
  // =========================
  function renderDashboard() {
    appRoot.innerHTML = `
      <div class="app-shell">

        <aside class="sidebar">
          <div class="logo">URUS</div>

          <input class="search" placeholder="Buscar..." id="searchInput"/>

          <div class="filters">
            <button data-filter="ALL">Todos</button>
            <button data-filter="NEW">Nuevos</button>
            <button data-filter="CONTACTED">Contactados</button>
          </div>

          <div class="leads" id="leadsList"></div>
        </aside>

        <main class="chat-area">

          <div class="chat-header">
            <div>
              <strong id="chatName">Selecciona un lead</strong>
              <div id="chatStatus">-</div>
            </div>
          </div>

          <div class="chat-messages" id="chatMessages"></div>

          <div class="chat-input">
            <textarea id="chatInput" placeholder="Escribe mensaje..."></textarea>
            <button id="sendBtn">Enviar</button>
          </div>

        </main>

      </div>
    `;

    renderLeads();
  }

  // =========================
  // EVENTS
  // =========================
  function bindEvents() {

    // connect modal
    const openBtn = document.getElementById("openMetaConnect");
    const modal = document.getElementById("metaModal");
    const closeBtn = document.getElementById("closeMetaModal");
    const confirmBtn = document.getElementById("confirmMetaConnect");

    if (openBtn) openBtn.onclick = () => modal.classList.add("show");
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove("show");

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const phone = document.getElementById("metaPhoneInput").value;
        const business = document.getElementById("metaBusinessInput").value;

        const res = await fetch("/v1/wa/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, business })
        });

        const data = await res.json();

        if (data.success) {
          window.location.href = "/blueprint/index.html?connected=1";
        }
      };
    }

    // search
    const search = document.getElementById("searchInput");
    if (search) {
      search.oninput = (e) => {
        appState.search = e.target.value;
        renderLeads();
      };
    }

    // send
    const sendBtn = document.getElementById("sendBtn");
    if (sendBtn) {
      sendBtn.onclick = sendMessage;
    }
  }

  // =========================
  // LOAD LEADS
  // =========================
  async function loadLeads() {
    try {
      const res = await fetch("/v1/wa/leads");
      const data = await res.json();
      if (!data.success) return;

      appState.leads = data.leads || [];

      renderLeads();

    } catch (err) {
      console.error(err);
    }
  }

  // =========================
  // RENDER LEADS
  // =========================
  function renderLeads() {
    const container = document.getElementById("leadsList");
    if (!container) return;

    let leads = appState.leads;

    if (appState.search) {
      leads = leads.filter(l =>
        (l.name || "").toLowerCase().includes(appState.search.toLowerCase())
      );
    }

    container.innerHTML = leads.map(l => `
      <div class="lead ${appState.selectedLead?.id === l.id ? "active" : ""}" data-id="${l.id}">
        <strong>${l.name || "Lead"}</strong>
        <p>${l.last_message || ""}</p>
      </div>
    `).join("");

    container.querySelectorAll(".lead").forEach(el => {
      el.onclick = () => selectLead(el.dataset.id);
    });
  }

  // =========================
  // SELECT LEAD
  // =========================
  async function selectLead(id) {
    appState.selectedLead = appState.leads.find(l => l.id == id);

    const res = await fetch(`/v1/wa/leads/${id}/messages`);
    const data = await res.json();

    appState.messages = data.messages || [];

    document.getElementById("chatName").innerText = appState.selectedLead.name || "Lead";
    document.getElementById("chatStatus").innerText = appState.selectedLead.status;

    renderMessages();
  }

  // =========================
  // RENDER MESSAGES
  // =========================
  function renderMessages() {
    const container = document.getElementById("chatMessages");

    if (!appState.messages.length) {
      container.innerHTML = "<p>No messages</p>";
      return;
    }

    container.innerHTML = appState.messages.map(m => `
      <div class="msg ${m.direction === "outbound" ? "out" : "in"}">
        ${m.body}
      </div>
    `).join("");

    container.scrollTop = container.scrollHeight;
  }

  // =========================
  // SEND MESSAGE
  // =========================
  async function sendMessage() {
    if (!appState.selectedLead) return;

    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    await fetch(`/v1/wa/leads/${appState.selectedLead.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });

    await selectLead(appState.selectedLead.id);
  }

  // =========================
  // AUTO REFRESH
  // =========================
  setInterval(() => {
    if (appState.whatsappConnected) {
      loadLeads();
      if (appState.selectedLead) {
        selectLead(appState.selectedLead.id);
      }
    }
  }, 4000);

  // =========================
  // INIT
  // =========================
  render();

});
