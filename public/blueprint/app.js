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
          <div class="stat-card yellow"><h3>18</h3><p>Leads hoy</p></div>
          <div class="stat-card blue"><h3>147</h3><p>Mensajes</p></div>
          <div class="stat-card green"><h3>5</h3><p>Citas</p></div>
          <div class="stat-card purple"><h3>$45K</h3><p>Ingresos</p></div>
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

  }

  render();
});
