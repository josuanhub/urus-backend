const API_BASE = window.location.origin;

const appState = {
  whatsappConnected: false,
  businessName: "",
  phoneNumber: ""
};

// 🚀 INIT
window.addEventListener("DOMContentLoaded", async () => {
  await loadBlueprintStatus();
  bindGlobalEvents();
  render();
});

// 🔍 STATUS
async function loadBlueprintStatus() {
  try {
    const res = await fetch(`${API_BASE}/v1/blueprint/status`);
    const data = await res.json();

    if (data.ok && data.connected && data.connection) {
      appState.whatsappConnected = true;
      appState.businessName = data.connection.business_name || "";
      appState.phoneNumber = data.connection.phone_number || "";
    } else {
      appState.whatsappConnected = false;
    }
  } catch (err) {
    console.error("STATUS ERROR", err);
    appState.whatsappConnected = false;
  }
}

// 🎯 RENDER ROOT (NO rompe tu HTML)
function render() {
  if (appState.whatsappConnected) {
    showDashboard();
  } else {
    showConnect();
  }
}

// 🔌 ESTADO: CONECTAR
function showConnect() {
  const stats = document.querySelector(".stats-grid");
  const dashboard = document.querySelector(".dashboard-grid");

  if (stats) stats.style.display = "none";
  if (dashboard) dashboard.style.display = "none";

  // asegura que la card de conectar esté visible
  const connect = document.querySelector(".connect-wrapper");
  if (connect) connect.style.display = "flex";
}

// 📊 ESTADO: DASHBOARD
function showDashboard() {
  const stats = document.querySelector(".stats-grid");
  const dashboard = document.querySelector(".dashboard-grid");

  if (stats) stats.style.display = "grid";
  if (dashboard) dashboard.style.display = "grid";

  const connect = document.querySelector(".connect-wrapper");
  if (connect) connect.style.display = "none";

  // opcional: setear datos si existen
  const nameEl = document.getElementById("businessName");
  const phoneEl = document.getElementById("phoneNumber");

  if (nameEl) nameEl.innerText = appState.businessName;
  if (phoneEl) phoneEl.innerText = appState.phoneNumber;
}

// 🧠 EVENTOS GLOBALES (CLAVE — NO FALLA)
function bindGlobalEvents() {

  document.addEventListener("click", (e) => {

    // 🟢 ABRIR MODAL
    if (e.target.id === "openModalBtn") {
      const modal = document.getElementById("modalOverlay");
      if (modal) modal.classList.remove("hidden");
    }

    // 🔴 CERRAR MODAL
    if (e.target.id === "cancelBtn") {
      const modal = document.getElementById("modalOverlay");
      if (modal) modal.classList.add("hidden");
    }

    // 🚀 CONTINUAR → META
    if (e.target.id === "continueBtn") {

      const phone = document.getElementById("phoneInput")?.value?.trim();
      const business = document.getElementById("businessInput")?.value?.trim();

      if (!phone || !business) {
        alert("Completa el número y nombre del negocio");
        return;
      }

      appState.phoneNumber = phone;
      appState.businessName = business;

      window.location.href = `${API_BASE}/v1/blueprint/connect/meta`;
    }

  });

}
