const API_BASE = window.location.origin;

const appState = {
  whatsappConnected: false,
  businessName: "",
  phoneNumber: ""
};

// INIT
window.addEventListener("DOMContentLoaded", async () => {

  const params = new URLSearchParams(window.location.search);
  if (params.get("meta") === "connected") {
    appState.whatsappConnected = true;
    window.history.replaceState({}, document.title, "/blueprint/index.html");
  }

  await loadBlueprintStatus();
  render();
});

// STATUS
async function loadBlueprintStatus() {
  try {
    const res = await fetch(`${API_BASE}/v1/blueprint/status`);
    const data = await res.json();

    if (data.ok && data.connected && data.connection) {
      appState.whatsappConnected = true;
      appState.businessName = data.connection.business_name || "";
      appState.phoneNumber = data.connection.phone_number || "";
    }
  } catch (e) {
    appState.whatsappConnected = false;
  }
}

// ROOT
function render() {
  if (!appState.whatsappConnected) {
    renderConnect();
  } else {
    renderDashboard();
  }
}

// CONNECT SCREEN (TU DISEÑO + MODAL)
function renderConnect() {
  // 🔥 NO TOCAMOS HTML, solo controlamos visibilidad

  const stats = document.querySelector(".stats-grid");
  const dashboard = document.querySelector(".dashboard-grid");

  if (stats) stats.style.display = "none";
  if (dashboard) dashboard.style.display = "none";

  // 👉 Creamos SOLO el bloque central (sin romper layout)
  const container = document.createElement("div");
  container.className = "connect-overlay";

  container.innerHTML = `
    <div class="connect-card">
      <div class="status-dot"></div>

      <h2>Conecta tu WhatsApp Business</h2>
      <p>
        Conecta el número de WhatsApp de tu negocio para integrar tus leads,
        mensajes y seguimientos dentro de este sistema.
      </p>

      <ul class="benefits">
        <li>✔ Recibe mensajes, leads y seguimientos</li>
        <li>✔ Envía mensajes desde la plataforma</li>
      </ul>

      <button id="openModalBtn" class="btn-gold">
        Conectar mi WhatsApp
      </button>

      <span class="meta-note">
        Requiere WhatsApp Business · API oficial
      </span>
    </div>
  `;

  document.querySelector(".main-content").appendChild(container);

  // 🔥 EVENTO ABRIR MODAL
  document.getElementById("openModalBtn").addEventListener("click", () => {
    document.getElementById("metaModal").classList.remove("hidden");
  });
}
      <!-- MODAL -->
      <div id="modalOverlay" class="modal-overlay hidden">
        <div class="modal-box">
          
          <h3>Conectar WhatsApp Business</h3>

          <input id="phoneInput" placeholder="+1 305 592 3928"/>
          <input id="businessInput" placeholder="Nombre del negocio"/>

          <div class="modal-actions">
            <button id="cancelBtn">Cancelar</button>
            <button id="continueBtn" class="btn-blue">
              Continuar con Meta
            </button>
          </div>

        </div>
      </div>

    </div>
  `;

  // BOTÓN ABRE MODAL
  document.getElementById("openModalBtn").addEventListener("click", () => {
    document.getElementById("modalOverlay").classList.remove("hidden");
  });

  // CANCELAR
  document.getElementById("cancelBtn").addEventListener("click", () => {
    document.getElementById("modalOverlay").classList.add("hidden");
  });

  // CONTINUAR → META
  document.getElementById("continueBtn").addEventListener("click", () => {
    const phone = document.getElementById("phoneInput").value;
    const business = document.getElementById("businessInput").value;

    appState.phoneNumber = phone;
    appState.businessName = business;

    window.location.href = `${API_BASE}/v1/blueprint/connect/meta`;
  });
}

// DASHBOARD
function renderDashboard() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="dashboard">
      <h2>WhatsApp conectado</h2>
      <p>${appState.businessName}</p>
      <p>${appState.phoneNumber}</p>
    </div>
  `;
}
