document.addEventListener("DOMContentLoaded", () => {

  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  // =========================
  // STATE
  // =========================
  let appState = {
    whatsappConnected: false,
    businessName: "URUS Elite Motors",
    phoneNumber: "+1 305 592 3928",
  };

  // detectar si ya conectó
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("connected") === "1") {
    appState.whatsappConnected = true;
    window.history.replaceState({}, document.title, "/blueprint/index.html");
  }

  // =========================
  // RENDER
  // =========================
  function render() {
    if (!appState.whatsappConnected) {
      renderConnectScreen();
    } else {
      renderDashboardScreen();

      // cargar leads al entrar
      setTimeout(() => {
        loadLeads();
      }, 300);
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

          <div class="topbar-actions">
            <div class="status-pill">
              <span class="dot" style="background:#f6b300;"></span>
              No conectado
            </div>
          </div>
        </header>

        <section class="hero-connect">
          <div class="connect-card">

            <div class="connect-icon">🟢</div>

            <h2>Conecta tu WhatsApp Business</h2>

            <p>Activa tu sistema de leads automático en minutos.</p>

            <button class="connect-btn" id="openMetaConnect">
              Conectar WhatsApp
            </button>

          </div>
        </section>

      </div>

      <div class="meta-modal-backdrop" id="metaModal">
        <div class="meta-modal">

          <h3>Conectar WhatsApp</h3>

          <input id="metaPhoneInput" placeholder="+1 305..." value="${appState.phoneNumber}" />
          <input id="metaBusinessInput" placeholder="Nombre negocio" value="${appState.businessName}" />

          <div class="meta-actions">
            <button id="closeMetaModal">Cancelar</button>
            <button id="confirmMetaConnect">Conectar</button>
          </div>

        </div>
      </div>
    `;
  }

  // =========================
  // DASHBOARD
  // =========================
  function renderDashboardScreen() {
    appRoot.innerHTML = `
      <div class="main-inner">

        <header class="topbar">
          <div>
            <h2>Dashboard</h2>
            <p>Sistema activo</p>
          </div>

          <div class="status-pill online">
            <span class="dot"></span>
            Conectado
          </div>
        </header>

        <section class="stats-grid">
          <div class="stat-card yellow"><h3 id="stat-leads">0</h3><p>Leads</p></div>
          <div class="stat-card blue"><h3 id="stat-messages">0</h3><p>Mensajes</p></div>
          <div class="stat-card green"><h3 id="stat-status">-</h3><p>Status</p></div>
          <div class="stat-card purple"><h3 id="stat-last">-</h3><p>Último</p></div>
        </section>

        <section class="panel">
          <h3>Leads en tiempo real</h3>
          <div id="leadsContainer">Cargando...</div>
        </section>

      </div>
    `;
  }

  // =========================
  // EVENTS
  // =========================
  function bindEvents() {

    const modal = document.getElementById("metaModal");
    const openBtn = document.getElementById("openMetaConnect");
    const closeBtn = document.getElementById("closeMetaModal");
    const confirmBtn = document.getElementById("confirmMetaConnect");

    if (openBtn && modal) {
      openBtn.onclick = () => modal.classList.add("show");
    }

    if (closeBtn && modal) {
      closeBtn.onclick = () => modal.classList.remove("show");
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {

        const phone = document.getElementById("metaPhoneInput").value;
        const business = document.getElementById("metaBusinessInput").value;

        if (!phone || !business) {
          alert("Completa los datos");
          return;
        }

        try {
          const res = await fetch("/v1/wa/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, business })
          });

          const data = await res.json();

          if (data.success) {
            window.location.href = "/blueprint/index.html?connected=1";
          } else {
            alert("Error conectando");
          }

        } catch (err) {
          console.error(err);
          alert("Error de conexión");
        }

      };
    }
  }

  // =========================
  // LOAD LEADS REAL
  // =========================
  async function loadLeads() {
    try {
      const res = await fetch("/v1/wa/leads");
      const data = await res.json();

      if (!data.success) return;

      const leads = data.leads || [];

      // stats
      document.getElementById("stat-leads").innerText = leads.length;
      document.getElementById("stat-messages").innerText = leads.length;

      if (leads[0]) {
        document.getElementById("stat-status").innerText = leads[0].status;
        document.getElementById("stat-last").innerText = leads[0].name || "Lead";
      }

      const container = document.getElementById("leadsContainer");

      if (!container) return;

      if (leads.length === 0) {
        container.innerHTML = "<p>No hay leads todavía</p>";
        return;
      }

      container.innerHTML = leads.map(lead => `
        <div class="lead-row">
          <strong>${lead.name || "Sin nombre"}</strong>
          <p>${lead.last_message || "Sin mensaje"}</p>
          <span>${lead.status}</span>
        </div>
      `).join("");

    } catch (err) {
      console.error("LOAD LEADS ERROR", err);
    }
  }

  // =========================
  // INIT
  // =========================
  render();

  setInterval(() => {
    if (appState.whatsappConnected) {
      loadLeads();
    }
  }, 5000);

});
