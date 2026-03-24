const API_BASE = window.location.origin;

const appState = {
  whatsappConnected: false,
  businessName: "",
  phoneNumber: ""
};

// 🚀 INIT
window.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    await loadBlueprintStatus();
    bindEvents();
    render();
  } catch (err) {
    console.error("INIT ERROR", err);
  }
}

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

// 🎯 RENDER ROOT
function render() {
  if (appState.whatsappConnected) {
    showDashboardState();
  } else {
    showConnectState();
  }
}

// 🧩 SOLO CONTROLA VISIBILIDAD (NO TOCA TU HTML)
function showConnectState() {
  safeShow(".connect-wrapper");
  safeHide(".dashboard");
}

function showDashboardState() {
  safeHide(".connect-wrapper");
  safeShow(".dashboard");

  // opcional: actualizar datos si existen elementos
  const nameEl = document.getElementById("businessName");
  const phoneEl = document.getElementById("phoneNumber");

  if (nameEl) nameEl.innerText = appState.businessName;
  if (phoneEl) phoneEl.innerText = appState.phoneNumber;
}

// 🧠 EVENTOS CENTRALIZADOS (NO ROMPE NADA)
function bindEvents() {

  document.addEventListener("click", (e) => {

    // 🔥 ABRIR MODAL
    if (e.target.id === "openModalBtn") {
      const modal = document.getElementById("modalOverlay");
      if (modal) modal.classList.remove("hidden");
    }

    // ❌ CERRAR MODAL
    if (e.target.id === "cancelBtn") {
      const modal = document.getElementById("modalOverlay");
      if (modal) modal.classList.add("hidden");
    }

    // 🚀 CONTINUAR A META
    if (e.target.id === "continueBtn") {
      handleConnect();
    }

  });
}

// 🔗 CONEXIÓN
function handleConnect() {
  const phoneInput = document.getElementById("phoneInput");
  const businessInput = document.getElementById("businessInput");

  const phone = phoneInput ? phoneInput.value.trim() : "";
  const business = businessInput ? businessInput.value.trim() : "";

  if (!phone || !business) {
    alert("Completa número y nombre del negocio");
    return;
  }

  appState.phoneNumber = phone;
  appState.businessName = business;

  // 🔥 REDIRECT REAL
  window.location.href = `${API_BASE}/v1/blueprint/connect/meta`;
}

// 🛠 HELPERS
function safeHide(selector) {
  const el = document.querySelector(selector);
  if (el) el.style.display = "none";
}

function safeShow(selector) {
  const el = document.querySelector(selector);
  if (el) el.style.display = "block";
}
