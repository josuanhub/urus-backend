document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;

  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  // Estado simple MVP
  let appState = {
    whatsappConnected: false,
    businessName: "URUS Elite Motors",
    phoneNumber: "+1 305 592 3928",
  };

  const API_BASE = window.location.origin;

  async function loadBlueprintStatus() {
    try {
      const res = await fetch(`${API_BASE}/v1/blueprint/status`);
      const data = await res.json();

      if (data.ok && data.connected && data.connection) {
        appState.whatsappConnected = true;
        appState.businessName = data.connection.business_name || appState.businessName;
        appState.phoneNumber = data.connection.phone_number || appState.phoneNumber;
      } else {
        appState.whatsappConnected = false;
      }
    } catch (error) {
      console.error("BLUEPRINT_STATUS_LOAD_ERROR", error);
      appState.whatsappConnected = false;
    }
  }
  
  // --------- Render principal ----------
  function render() {
    if (!appState.whatsappConnected) {
      renderConnectScreen();
    } else {
      renderDashboardScreen();
    }
    bindEvents();
  }

  // --------- Pantalla 1: conectar ----------
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
              <span class="dot" style="background:#f6b300; box-shadow:0 0 12px rgba(246,179,0,0.55)"></span>
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
              <div class="connect-point">
                <span class="connect-check">✓</span>
                <span>Recibe mensajes, leads y seguimientos de tu WhatsApp en este sistema CRM.</span>
              </div>
              <div class="connect-point">
                <span class="connect-check">✓</span>
                <span>Envía mensajes y da seguimiento a tus clientes desde esta plataforma.</span>
              </div>
            </div>

            <button class="connect-btn" id="openMetaConnect">
              Conectar mi WhatsApp
            </button>

            <div class="connect-meta">
              Requiere WhatsApp Business · Servicio conectado a la API oficial
            </div>
          </div>
        </section>
      </div>

      <div class="meta-modal-backdrop" id="metaModal">
        <div class="meta-modal">
          <div class="meta-modal-header">Meta</div>
          <div class="meta-modal-body">
            <h3>Conecta tu cuenta de WhatsApp Business</h3>
            <p>
              Permite que URUS Blueprint envíe y reciba mensajes desde tu cuenta de WhatsApp Business.
            </p>

            <div class="meta-field">
              <label>Número de WhatsApp</label>
              <input class="meta-input" id="metaPhoneInput" value="${appState.phoneNumber}" />
            </div>

            <div class="meta-field">
              <label>Cuenta de empresa</label>
              <input class="meta-input" id="metaBusinessInput" value="${appState.businessName}" />
            </div>

            <div class="meta-actions">
              <button class="meta-btn secondary" id="closeMetaModal">Cancelar</button>
              <button class="meta-btn primary" id="confirmMetaConnect">Continuar con Meta</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --------- Pantalla 2: dashboard ----------
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
              WhatsApp Conectado
            </div>
            <button class="icon-btn">🔔</button>
            <div class="account-pill">${appState.businessName}</div>
          </div>
        </header>

        <section class="stats-grid">
          <div class="stat-card yellow">
            <div class="stat-top">
              <span>Leads Hoy</span>
              <span class="trend">+12%</span>
            </div>
            <h3>18</h3>
            <p>+4 más que ayer</p>
          </div>

          <div class="stat-card blue">
            <div class="stat-top">
              <span>Mensajes Enviados</span>
              <span class="trend">+23%</span>
            </div>
            <h3>147</h3>
            <p>Alta conversión hoy</p>
          </div>

          <div class="stat-card green">
            <div class="stat-top">
              <span>Citas Generadas</span>
              <span class="trend">+2</span>
            </div>
            <h3>5</h3>
            <p>27% tasa de éxito</p>
          </div>

          <div class="stat-card purple">
            <div class="stat-top">
              <span>Ingresos Est.</span>
              <span class="trend">+18%</span>
            </div>
            <h3>$45,000</h3>
            <p>En negociaciones</p>
          </div>
        </section>

        <section class="dashboard-grid">
          <div class="panel panel-large">
            <div class="panel-header">
              <h3>Rendimiento de la semana</h3>
              <select>
                <option>Últimos 7 días</option>
              </select>
            </div>

            <div class="chart-mock">
              <div class="chart-line"></div>
              <div class="chart-glow"></div>
              <div class="chart-label">Hoy · 18 leads</div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <h3>Actividad reciente</h3>
            </div>

            <div class="activity-list">
              <div class="activity-item">
                <div class="activity-icon whatsapp">🟢</div>
                <div>
                  <strong>Nuevo lead: Carlos Mendoza</strong>
                  <p>BMW X6 2020</p>
                </div>
                <span>2 min</span>
              </div>

              <div class="activity-item">
                <div class="activity-icon telegram">🔵</div>
                <div>
                  <strong>Mensaje enviado</strong>
                  <p>Audi R8 · Follow-up</p>
                </div>
                <span>5 min</span>
              </div>

              <div class="activity-item">
                <div class="activity-icon green">🟩</div>
                <div>
                  <strong>Cita confirmada</strong>
                  <p>María González · Urus 2023</p>
                </div>
                <span>12 min</span>
              </div>

              <div class="activity-item">
                <div class="activity-icon yellow">🟨</div>
                <div>
                  <strong>Lead vio catálogo</strong>
                  <p>Porsche Cayenne Turbo</p>
                </div>
                <span>18 min</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <h3>Fuentes de Leads</h3>
              <select>
                <option>Este mes</option>
              </select>
            </div>

            <div class="sources">
              <div class="source-row">
                <span>Instagram Ads</span>
                <div class="bar"><div class="fill fill-45"></div></div>
                <strong>45%</strong>
              </div>
              <div class="source-row">
                <span>Facebook</span>
                <div class="bar"><div class="fill fill-30"></div></div>
                <strong>30%</strong>
              </div>
              <div class="source-row">
                <span>Referidos</span>
                <div class="bar"><div class="fill fill-15"></div></div>
                <strong>15%</strong>
              </div>
              <div class="source-row">
                <span>Web / Landing</span>
                <div class="bar"><div class="fill fill-10"></div></div>
                <strong>10%</strong>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <h3>Top Leads Clientes</h3>
            </div>

            <div class="lead-list">
              <div class="lead-row">
                <div class="lead-avatar">CM</div>
                <div>
                  <strong>Carlos Mendoza</strong>
                  <p>BMW X6 2020 · $1.2M</p>
                </div>
                <span class="lead-score">95</span>
              </div>

              <div class="lead-row">
                <div class="lead-avatar">MG</div>
                <div>
                  <strong>María González</strong>
                  <p>Lamborghini Urus · $4.5M</p>
                </div>
                <span class="lead-score">89</span>
              </div>

              <div class="lead-row">
                <div class="lead-avatar">RA</div>
                <div>
                  <strong>Roberto Alves</strong>
                  <p>Porsche 911 · $2.1M</p>
                </div>
                <span class="lead-score">87</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  // --------- Eventos ----------
  function bindEvents() {
    const openMetaBtn = document.getElementById("openMetaConnect");
    const closeMetaBtn = document.getElementById("closeMetaModal");
    const confirmMetaBtn = document.getElementById("confirmMetaConnect");
    const metaModal = document.getElementById("metaModal");

    if (openMetaBtn && metaModal) {
      openMetaBtn.addEventListener("click", () => {
        metaModal.classList.add("show");
      });
    }

    if (closeMetaBtn && metaModal) {
      closeMetaBtn.addEventListener("click", () => {
        metaModal.classList.remove("show");
      });
    }

      if (confirmMetaBtn) {
      confirmMetaBtn.addEventListener("click", async () => {
        const phoneInput = document.getElementById("metaPhoneInput");
        const businessInput = document.getElementById("metaBusinessInput");

        const phoneNumber = phoneInput?.value?.trim() || appState.phoneNumber;
        const businessName = businessInput?.value?.trim() || appState.businessName;

        confirmMetaBtn.disabled = true;
        confirmMetaBtn.textContent = "Conectando...";

        try {
  window.location.href = `${API_BASE}/v1/blueprint/connect/meta`;
  return;
} catch (error) {
  console.error("BLUEPRINT_CONNECT_META_ERROR", error);
  alert("No se pudo iniciar conexión con Meta.");
} finally {
  confirmMetaBtn.disabled = false;
  confirmMetaBtn.textContent = "Continuar con Meta";
}

      });
    }

    loadBlueprintStatus().then(render);
});
