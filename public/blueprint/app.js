document.addEventListener("DOMContentLoaded", () => {

  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  let appState = {
    whatsappConnected: false,
    businessName: "URUS Elite Motors",
    phoneNumber: "+1 305 592 3928",
  };

  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get("connected") === "1") {
    appState.whatsappConnected = true;
    window.history.replaceState({}, document.title, "/blueprint/index.html");
  }

  // ---------- LOAD LEADS (🔥 FUERA DE TODO) ----------
  async function loadLeads() {
    try {
      const res = await fetch("/v1/wa/leads");
      const data = await res.json();

      if (!data.success) return;

      const leads = data.leads || [];

      const statLeads = document.getElementById("stat-leads");
      const statMessages = document.getElementById("stat-messages");
      const statStatus = document.getElementById("stat-status");
      const statLast = document.getElementById("stat-last");

      if (statLeads) statLeads.innerText = leads.length;
      if (statMessages) statMessages.innerText = leads.length;

      if (leads[0]) {
        if (statStatus) statStatus.innerText = leads[0].status;
        if (statLast) statLast.innerText = leads[0].name || "Sin nombre";
      }

      const container = document.getElementById("leadsContainer");
      if (!container) return;

      if (leads.length === 0) {
        container.innerHTML = "<p>No hay leads todavía</p>";
        return;
      }

      container.innerHTML = leads.map(lead => `
        <div class="lead-row">
          <div class="lead-avatar">
            ${(lead.name || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <strong>${lead.name || "Sin nombre"}</strong>
            <p>${lead.last_message || "Sin mensaje"}</p>
          </div>
          <div class="lead-score">
            ${lead.status}
          </div>
        </div>
      `).join("");

    } catch (err) {
      console.error("LOAD LEADS ERROR", err);
    }
  }

  // ---------- RENDER ----------
  function render() {
    if (!appState.whatsappConnected) {
      renderConnectScreen();
    } else {
      renderDashboardScreen();

      // 🔥 cargar leads
      setTimeout(() => {
        loadLeads();
        setInterval(loadLeads, 5000);
      }, 300);
    }

    bindEvents();
  }

  // ---------- CONNECT SCREEN ----------
  function renderConnectScreen() {
    appRoot.innerHTML = `...`; // (no cambió)
  }

  // ---------- DASHBOARD ----------
  function renderDashboardScreen() {
    appRoot.innerHTML = `
      <div class="main-inner">

        <header class="topbar">
          <div>
            <h2>Buenos días, Agent</h2>
            <p>Aquí está el rendimiento de tu sistema hoy</p>
          </div>

          <div class="topbar-actions">
            <div class="status-pill online">
              <span class="dot"></span>
              WhatsApp conectado
            </div>
            <button class="icon-btn">🔔</button>
            <div class="account-pill">${appState.businessName}</div>
          </div>
        </header>

        <section class="stats-grid">
          <div class="stat-card yellow"><h3 id="stat-leads">0</h3><p>Leads</p></div>
          <div class="stat-card blue"><h3 id="stat-messages">0</h3><p>Mensajes</p></div>
          <div class="stat-card green"><h3 id="stat-status">-</h3><p>Status</p></div>
          <div class="stat-card purple"><h3 id="stat-last">-</h3><p>Último lead</p></div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h3>Leads en tiempo real</h3>
          </div>

          <div id="leadsContainer" class="lead-list">
            <p>Cargando leads...</p>
          </div>
        </section>

      </div>
    `;
  }

  // ---------- EVENTS ----------
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

  render();
});
