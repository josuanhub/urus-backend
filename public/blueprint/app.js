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
  
  // ---------- RENDER ----------
  function render() {
    if (!appState.whatsappConnected) {
      renderConnectScreen();
    } else {
      renderDashboardScreen();
    }
    bindEvents();
  }

  // ---------- CONNECT SCREEN ----------
  function renderConnectScreen() {
    appRoot.innerHTML = `
      <div class="main-inner">

        <header class="topbar">
          <div>
            <h2>Buenos días, Agent</h2>
            <p>Conecta tu WhatsApp para empezar</p>
          </div>

          <div class="topbar-actions">
            <div class="status-pill">
              <span class="dot" style="background:#f6b300;"></span>
              WhatsApp no conectado
            </div>
            <button class="icon-btn">🔔</button>
            <div class="account-pill">${appState.businessName}</div>
          </div>
        </header>

        <section class="hero-connect">
          <div class="connect-card">

            <div class="connect-icon">🟢</div>

            <h2>Conecta tu WhatsApp Business</h2>

            <p>
              Conecta el número de WhatsApp de tu negocio para integrar tus leads,
              mensajes y seguimientos dentro de este sistema.
            </p>

            <div class="connect-points">
              <div class="connect-point">✓ Recibe leads automáticamente</div>
              <div class="connect-point">✓ Envía mensajes desde el sistema</div>
            </div>

            <button class="connect-btn" id="openMetaConnect">
              Conectar mi WhatsApp
            </button>

            <div class="connect-meta">
              Requiere WhatsApp Business · API oficial
            </div>

          </div>
        </section>

      </div>

      <!-- MODAL -->
      <div class="meta-modal-backdrop" id="metaModal">
        <div class="meta-modal">

          <div class="meta-modal-header">Meta</div>

          <div class="meta-modal-body">

            <h3>Conecta tu cuenta de WhatsApp Business</h3>

            <p>
              Permite que URUS Blueprint envíe y reciba mensajes desde tu cuenta.
            </p>

            <div class="meta-field">
              <label>Número de WhatsApp</label>
              <input id="metaPhoneInput" value="${appState.phoneNumber}" />
            </div>

            <div class="meta-field">
              <label>Cuenta de empresa</label>
              <input id="metaBusinessInput" value="${appState.businessName}" />
            </div>

            <div class="meta-actions">
              <button id="closeMetaModal">Cancelar</button>
              <button id="confirmMetaConnect">Continuar con Meta</button>
            </div>

          </div>

        </div>
      </div>
    `;
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

<section class="dashboard-grid">

  <div class="panel panel-large">
    <div class="panel-header">
      <h3>Leads recientes</h3>
    </div>

    <div class="lead-list">

      <div class="lead-row">
        <div class="lead-avatar">JM</div>
        <div>
          <strong>Juan Martínez</strong>
          <p>Interesado en vehículo SUV</p>
        </div>
        <div class="lead-score">92</div>
      </div>

      <div class="lead-row">
        <div class="lead-avatar">AC</div>
        <div>
          <strong>Ana Cruz</strong>
          <p>Preguntó por financiamiento</p>
        </div>
        <div class="lead-score">85</div>
      </div>

      <div class="lead-row">
        <div class="lead-avatar">RL</div>
        <div>
          <strong>Roberto López</strong>
          <p>Solicitó cita</p>
        </div>
        <div class="lead-score">78</div>
      </div>

    </div>
  </div>

  <div class="panel">
    <div class="panel-header">
      <h3>Actividad reciente</h3>
    </div>

    <div class="activity-list">

      <div class="activity-item">
        <div class="activity-icon whatsapp">💬</div>
        <div>
          <strong>Nuevo mensaje</strong>
          <p>Juan Martínez escribió por WhatsApp</p>
        </div>
        <span>Hace 2m</span>
      </div>

      <div class="activity-item">
        <div class="activity-icon whatsapp">💬</div>
        <div>
          <strong>Seguimiento enviado</strong>
          <p>Mensaje automático enviado</p>
        </div>
        <span>Hace 10m</span>
      </div>

      <div class="activity-item">
        <div class="activity-icon whatsapp">💬</div>
        <div>
          <strong>Nueva cita</strong>
          <p>Ana Cruz agendó una llamada</p>
        </div>
        <span>Hace 1h</span>
      </div>

    </div>
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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: phone,
          business: business
        })
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

async function loadLeads() {
  try {
    const res = await fetch("/v1/wa/leads");
    const data = await res.json();

    if (!data.success) return;

    const leads = data.leads || [];

    // stats
    document.getElementById("stat-leads").innerText = leads.length;
    document.getElementById("stat-messages").innerText = leads.length; // simple por ahora

    if (leads[0]) {
      document.getElementById("stat-status").innerText = leads[0].status;
      document.getElementById("stat-last").innerText = leads[0].name || "Sin nombre";
    }

    // render lista
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
    
  }
  render();
});
