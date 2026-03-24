const API_BASE = window.location.origin;

const appState = {
  whatsappConnected: false,
  businessName: "",
  phoneNumber: ""
};

// 🚀 INIT
window.addEventListener("DOMContentLoaded", async () => {
  // 🔥 Detecta regreso de Meta
  const params = new URLSearchParams(window.location.search);
  if (params.get("meta") === "connected") {
    appState.whatsappConnected = true;

    // limpia URL (pro)
    window.history.replaceState({}, document.title, "/blueprint/index.html");
  }

  await loadBlueprintStatus();
  render();
});

// 🔍 STATUS
async function loadBlueprintStatus() {
  try {
    const res = await fetch(`${API_BASE}/v1/blueprint/status`);
    const data = await res.json();

    if (data.ok && data.connected === true && data.connection) {
      appState.whatsappConnected = true;
      appState.businessName = data.connection.business_name || "";
      appState.phoneNumber = data.connection.phone_number || "";
    } else {
      appState.whatsappConnected = false;
    }

  } catch (error) {
    console.error("STATUS ERROR", error);
    appState.whatsappConnected = false;
  }
}

// 🎯 RENDER ROOT
function render() {
  if (!appState.whatsappConnected) {
    renderConnect();
  } else {
    renderDashboard();
  }
}

// 🔌 PANTALLA CONECTAR (SaaS PRO)
function renderConnect() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="connect-container">
      <div class="connect-card">
        
        <div class="status-dot"></div>

        <h2>Conecta tu WhatsApp Business</h2>
        <p>
          Conecta el número de WhatsApp de tu negocio para integrar tus leads,
          mensajes y seguimientos dentro de este sistema.
        </p>

        <ul class="benefits">
          <li>✔ Recibe mensajes y leads automáticamente</li>
          <li>✔ Envía seguimientos desde la plataforma</li>
        </ul>

        <button id="connectBtn" class="btn-primary">
          Conectar mi WhatsApp
        </button>

        <span class="meta-note">
          Requiere WhatsApp Business · API oficial
        </span>

      </div>
    </div>
  `;

  document.getElementById("connectBtn").addEventListener("click", () => {
    window.location.href = `${API_BASE}/v1/blueprint/connect/meta`;
  });
}

// 📊 DASHBOARD (SaaS PRO)
function renderDashboard() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="dashboard">

      <div class="top-bar">
        <h2>Buenos días, Agent</h2>
        <div class="status-badge">🟢 WhatsApp conectado</div>
      </div>

      <div class="cards">

        <div class="card">
          <h3>Leads hoy</h3>
          <p class="big">18</p>
          <span>+12%</span>
        </div>

        <div class="card">
          <h3>Mensajes enviados</h3>
          <p class="big">147</p>
          <span>+23%</span>
        </div>

        <div class="card">
          <h3>Citas generadas</h3>
          <p class="big">5</p>
        </div>

        <div class="card">
          <h3>Ingresos</h3>
          <p class="big">$45,000</p>
        </div>

      </div>

      <div class="info">
        <p><strong>Negocio:</strong> ${appState.businessName}</p>
        <p><strong>Teléfono:</strong> ${appState.phoneNumber}</p>
      </div>

    </div>
  `;
}
