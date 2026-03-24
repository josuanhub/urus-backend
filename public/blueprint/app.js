const API_BASE = window.location.origin;

const appState = {
  whatsappConnected: false,
  businessName: "",
  phoneNumber: ""
};

// 🚀 INIT
window.addEventListener("DOMContentLoaded", () => {
  loadBlueprintStatus().then(render);
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

// 🔌 PANTALLA CONECTAR
function renderConnect() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
      <h2>Conecta tu WhatsApp</h2>
      <p>Empieza a automatizar tus conversaciones</p>
      <button id="connectBtn" style="padding:12px 20px;margin-top:20px;">
        Conectar con Meta
      </button>
    </div>
  `;

  document.getElementById("connectBtn").addEventListener("click", () => {
    // 🔥 REDIRECT REAL
    window.location.href = `${API_BASE}/v1/blueprint/connect/meta`;
  });
}

// 📊 DASHBOARD
function renderDashboard() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div>
      <h2>Dashboard</h2>
      <p><strong>Negocio:</strong> ${appState.businessName || "Conectado"}</p>
      <p><strong>Teléfono:</strong> ${appState.phoneNumber || "-"}</p>

      <div style="margin-top:20px;">
        <div style="padding:20px;border:1px solid #333;margin-bottom:10px;">
          Leads hoy: 12
        </div>
        <div style="padding:20px;border:1px solid #333;margin-bottom:10px;">
          Conversaciones activas: 5
        </div>
        <div style="padding:20px;border:1px solid #333;">
          Ventas generadas: $2,450
        </div>
      </div>
    </div>
  `;
}
