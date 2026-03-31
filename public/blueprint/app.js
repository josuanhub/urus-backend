document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  injectStyles();

  const STORAGE_KEY = "urus_blueprint_frontend_v6";

  const state = {
    token: "",
    user: null,
    billing: null,
    whatsappConnected: false,
    businessName: "URUS WA OS",
    phoneNumber: "+1 260 300 6906",
    currentView: "dashboard",
    authMode: "login",
    leads: [],
    filteredLeads: [],
    selectedLeadId: null,
    selectedLead: null,
    messages: [],
    search: "",
    statusFilter: "all",
    loadingLeads: false,
    loadingChat: false,
    loadingAuth: false,
    sending: false,
    typing: false,
    refreshTimer: null,
    seenMap: {},
    mobile: window.innerWidth <= 980,
  };

  init();

  window.addEventListener("resize", () => {
    const nextMobile = window.innerWidth <= 980;
    if (nextMobile !== state.mobile) {
      state.mobile = nextMobile;
      renderCurrentView();
    }
  });

  async function init() {
    hydrateLocalState();
    await hydrateAuth();
    render();
  }

  function hydrateLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        state.token = saved.token || "";
        state.whatsappConnected = !!saved.whatsappConnected;
        state.businessName = saved.businessName || state.businessName;
        state.phoneNumber = saved.phoneNumber || state.phoneNumber;
        state.currentView = saved.currentView || state.currentView;
        state.seenMap = saved.seenMap || {};
      }
    } catch {}

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("connected") === "1") {
      state.whatsappConnected = true;
      persist();
      window.history.replaceState({}, document.title, "/blueprint/index.html");
    }
  }

  async function hydrateAuth() {
    if (!state.token) return;

    try {
      const me = await fetchJson("/v1/auth/me", { auth: true });
      if (me?.ok && me.user) {
        state.user = me.user;
        await loadBillingStatus();
      } else {
        clearAuth();
      }
    } catch {
      clearAuth();
    }
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: state.token,
        whatsappConnected: state.whatsappConnected,
        businessName: state.businessName,
        phoneNumber: state.phoneNumber,
        currentView: state.currentView,
        seenMap: state.seenMap,
      })
    );
  }

  function clearAuth() {
    state.token = "";
    state.user = null;
    state.billing = null;
    state.whatsappConnected = false;
    persist();
  }

  async function fetchJson(url, opts = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    };

    if (opts.auth && state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    }

    return data;
  }

  async function loadBillingStatus() {
    if (!state.token) return;
    try {
      const data = await fetchJson("/v1/billing/status", { auth: true });
      state.billing = data;
    } catch {
      state.billing = null;
    }
  }

  function render() {
    bindSidebarNav();

    if (!state.user) {
      stopAutoRefresh();
      renderAuthScreen();
      bindAuthEvents();
      return;
    }

    if (!state.whatsappConnected) {
      stopAutoRefresh();
      renderConnectScreen();
      bindConnectEvents();
      return;
    }

    renderCurrentView();
    startAutoRefresh();
  }

  function renderCurrentView() {
    bindSidebarNav();

    switch (state.currentView) {
      case "dashboard":
        renderDashboardView();
        bindAppEvents();
        loadLeads(true);
        break;
      case "leads":
        renderLeadsView();
        bindAppEvents();
        loadLeads(true);
        break;
      case "followups":
        renderFollowupsView();
        bindAppEvents();
        loadLeads(true);
        break;
      case "calendar":
        renderCalendarView();
        bindAppEvents();
        loadLeads(true);
        break;
      case "templates":
        renderTemplatesView();
        bindAppEvents();
        break;
      case "analytics":
        renderAnalyticsView();
        bindAppEvents();
        loadLeads(true);
        break;
      default:
        state.currentView = "dashboard";
        renderDashboardView();
        bindAppEvents();
        loadLeads(true);
        break;
    }
  }

  function bindSidebarNav() {
    const map = {
      dashboard: "dashboard",
      leads: "leads",
      "follow-ups": "followups",
      calendario: "calendar",
      plantillas: "templates",
      analytics: "analytics",
    };

    document.querySelectorAll(".nav-item").forEach((item) => {
      const key = map[String(item.textContent || "").trim().toLowerCase()];
      item.classList.toggle("active", key === state.currentView);

      item.onclick = () => {
        if (!key) return;

        if (!state.user) {
          state.authMode = "login";
          render();
          return;
        }

        if (!state.whatsappConnected && key !== "dashboard") {
          renderConnectScreen();
          bindConnectEvents();
          return;
        }

        state.currentView = key;
        persist();
        renderCurrentView();
      };
    });
  }

  function renderAuthScreen() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <div class="ub-auth-shell">
          <div class="ub-auth-hero">
            <div class="ub-auth-badge">URUS Blueprint · WhatsApp Growth OS</div>
            <h1 class="ub-auth-title">Convierte mensajes en oportunidades reales</h1>
            <p class="ub-auth-copy">
              Inicia sesión o crea tu cuenta para entrar al sistema, conectar tu WhatsApp y manejar leads desde un dashboard comercial.
            </p>

            <div class="ub-auth-points">
              <div class="ub-auth-point">
                <strong>Chat + leads</strong>
                <span>Todo organizado en un solo flujo.</span>
              </div>
              <div class="ub-auth-point">
                <strong>Twilio activo</strong>
                <span>Mensajes reales entrando y saliendo.</span>
              </div>
              <div class="ub-auth-point">
                <strong>UI comercial</strong>
                <span>Diseñada para vender, no para verse técnica.</span>
              </div>
            </div>
          </div>

          <div class="ub-auth-card">
            <div class="ub-auth-tabs">
              <button class="ub-auth-tab ${state.authMode === "login" ? "active" : ""}" data-auth-tab="login">Iniciar sesión</button>
              <button class="ub-auth-tab ${state.authMode === "signup" ? "active" : ""}" data-auth-tab="signup">Crear cuenta</button>
            </div>

            <div class="ub-auth-form">
              <label class="ub-label">Email</label>
              <input class="ub-input" id="authEmail" type="email" placeholder="tu@email.com" />

              <label class="ub-label">Password</label>
              <input class="ub-input" id="authPassword" type="password" placeholder="••••••••" />

              <button class="ub-primary-btn" id="authSubmitBtn">
                ${state.loadingAuth ? "Procesando..." : state.authMode === "login" ? "Entrar" : "Crear cuenta"}
              </button>

              <div class="ub-auth-error" id="authErrorBox"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindAuthEvents() {
    document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
      btn.onclick = () => {
        state.authMode = btn.getAttribute("data-auth-tab") || "login";
        renderAuthScreen();
        bindAuthEvents();
      };
    });

    const submit = document.getElementById("authSubmitBtn");
    if (submit) {
      submit.onclick = async () => {
        const email = String(document.getElementById("authEmail")?.value || "").trim();
        const password = String(document.getElementById("authPassword")?.value || "").trim();
        const errorBox = document.getElementById("authErrorBox");

        if (!email || !password) {
          if (errorBox) errorBox.textContent = "Completa email y password.";
          return;
        }

        state.loadingAuth = true;
        renderAuthScreen();
        bindAuthEvents();

        try {
          const route = state.authMode === "login" ? "/v1/auth/login" : "/v1/auth/signup";
          const data = await fetchJson(route, {
            method: "POST",
            body: { email, password },
          });

          state.token = data.token || "";
          state.user = data.user || null;
          await loadBillingStatus();
          persist();
          render();
        } catch (err) {
          const box = document.getElementById("authErrorBox");
          if (box) box.textContent = err.message || "Error autenticando.";
        } finally {
          state.loadingAuth = false;
        }
      };
    }
  }

  function renderConnectScreen() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Conectar WhatsApp</h2>
            <p class="ub-subtitle">
              Estás dentro del sistema. Ahora conecta tu número y tu negocio para entrar al dashboard operativo.
            </p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-secondary-btn" id="logoutBtn">Salir</button>
          </div>
        </header>

        <section class="ub-hero">
          <div class="ub-connect-card">
            <div class="ub-connect-icon">🟢</div>
            <h3 class="ub-connect-heading">Activa tu línea de WhatsApp Business</h3>
            <p class="ub-connect-copy">
              Tu backend ya está listo. Aquí solo defines el número y nombre comercial para entrar al dashboard.
            </p>

            <button class="ub-primary-btn" id="openMetaConnect">
              Conectar WhatsApp
            </button>

            <div class="ub-connect-points">
              <div class="ub-point">
                <strong>Mensajes reales</strong>
                <span>Twilio ya está respondiendo y guardando leads.</span>
              </div>
              <div class="ub-point">
                <strong>Panel comercial</strong>
                <span>Todo pensado para vender y operar desde aquí.</span>
              </div>
              <div class="ub-point">
                <strong>Flujo claro</strong>
                <span>Login → conectar → dashboard → leads → chat.</span>
              </div>
            </div>
          </div>
        </section>

        <div class="ub-modal-backdrop" id="metaModal">
          <div class="ub-modal">
            <h3>Conectar tu WhatsApp</h3>
            <p>Escribe el número que usarás y el nombre del negocio.</p>

            <div class="ub-field">
              <label class="ub-label">Número de WhatsApp</label>
              <input class="ub-input" id="metaPhoneInput" value="${escapeHtml(state.phoneNumber)}" placeholder="+1 260..." />
            </div>

            <div class="ub-field">
              <label class="ub-label">Nombre del negocio</label>
              <input class="ub-input" id="metaBusinessInput" value="${escapeHtml(state.businessName)}" placeholder="URUS WA OS" />
            </div>

            <div class="ub-modal-actions">
              <button class="ub-ghost-btn" id="closeMetaModal">Cancelar</button>
              <button class="ub-primary-btn" id="confirmMetaConnect">Entrar al dashboard</button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindConnectEvents();
  }

  function bindConnectEvents() {
    const modal = document.getElementById("metaModal");
    const openBtn = document.getElementById("openMetaConnect");
    const closeBtn = document.getElementById("closeMetaModal");
    const confirmBtn = document.getElementById("confirmMetaConnect");
    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) {
      logoutBtn.onclick = () => {
        clearAuth();
        render();
      };
    }

    if (openBtn && modal) {
      openBtn.onclick = () => modal.classList.add("show");
    }

    if (closeBtn && modal) {
      closeBtn.onclick = () => modal.classList.remove("show");
    }

    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove("show");
      };
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const phone = String(document.getElementById("metaPhoneInput")?.value || "").trim();
        const business = String(document.getElementById("metaBusinessInput")?.value || "").trim();

        if (!phone || !business) {
          alert("Completa número y nombre del negocio.");
          return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Conectando...";

        try {
          const data = await fetchJson("/v1/wa/connect", {
            method: "POST",
            body: { phone, business },
          });

          if (data.success) {
            state.phoneNumber = phone;
            state.businessName = business;
            state.whatsappConnected = true;
            state.currentView = "dashboard";
            persist();
            renderCurrentView();
          } else {
            alert("No se pudo conectar.");
          }
        } catch (err) {
          alert(err.message || "Error conectando.");
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Entrar al dashboard";
        }
      };
    }
  }

  function renderDashboardView() {
    const stats = computeStats(state.leads);
    const pipeline = getEstimatedPipeline(state.leads);
    const dist = getStatusDistribution(state.leads);
    const activity = getActivityFeed();
    const top = getTopLeads();
    const weekly = getWeeklySeries(state.leads);

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Dashboard</h2>
            <p class="ub-subtitle">Vista ejecutiva del sistema: oportunidades, dinero estimado, actividad y foco comercial.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="ub-grid ub-stats">
          <div class="ub-card ub-stat gold">
            <div class="ub-stat-label">Oportunidades</div>
            <div class="ub-stat-value">${stats.total}</div>
            <div class="ub-stat-sub">Leads reales activos</div>
          </div>

          <div class="ub-card ub-stat blue">
            <div class="ub-stat-label">Ready to Call</div>
            <div class="ub-stat-value">${stats.ready}</div>
            <div class="ub-stat-sub">Más cerca del cierre</div>
          </div>

          <div class="ub-card ub-stat green">
            <div class="ub-stat-label">Valor estimado</div>
            <div class="ub-stat-value">${money(pipeline)}</div>
            <div class="ub-stat-sub">Pipeline comercial</div>
          </div>

          <div class="ub-card ub-stat purple">
            <div class="ub-stat-label">Plan</div>
            <div class="ub-stat-value">${escapeHtml(state.billing?.plan || "active")}</div>
            <div class="ub-stat-sub">${state.billing?.remaining != null ? `${state.billing.remaining} restantes` : "Sistema activo"}</div>
          </div>
        </section>

        <section class="ub-dashboard-grid">
          <div class="ub-card ub-chart-card">
            <h3 class="ub-card-title">Rendimiento de la semana</h3>
            <p class="ub-card-copy">Lectura visual del movimiento actual del sistema.</p>
            <div class="ub-graph-wrap">
              <div class="ub-graph-grid"></div>
              ${renderLineChart(weekly)}
              <div class="ub-graph-badge">Pipeline: ${money(pipeline)}</div>
            </div>
          </div>

          <div class="ub-card ub-activity-card">
            <h3 class="ub-card-title">Actividad reciente</h3>
            <p class="ub-card-copy">Lo último que está pasando en el panel.</p>
            <div class="ub-activity-list">
              ${activity.length ? activity.map(item => `
                <div class="ub-activity-item">
                  <div class="ub-activity-dot" style="background:${item.dot}"></div>
                  <div>
                    <div class="ub-activity-main">${escapeHtml(item.title)}</div>
                    <div class="ub-activity-sub">${escapeHtml(item.sub)}</div>
                  </div>
                  <div class="ub-activity-time">${escapeHtml(item.time)}</div>
                </div>
              `).join("") : `<div class="ub-list-item">Todavía no hay actividad para mostrar.</div>`}
            </div>
          </div>

          <div class="ub-card ub-funnel-card">
            <h3 class="ub-card-title">Distribución</h3>
            <p class="ub-card-copy">Cómo está repartido el panel hoy.</p>
            <div class="ub-bar-group">
              ${dist.map(item => `
                <div class="ub-bar-row">
                  <div class="ub-bar-label">${escapeHtml(item.label)}</div>
                  <div class="ub-bar-track">
                    <div class="ub-bar-fill" style="width:${item.pct}%;background:${item.color};"></div>
                  </div>
                  <div class="ub-bar-label">${item.pct}%</div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="ub-card ub-top-card">
            <h3 class="ub-card-title">Top oportunidades</h3>
            <p class="ub-card-copy">Las conversaciones con más valor estimado hoy.</p>
            <div class="ub-mini-list">
              ${top.length ? top.map(lead => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span style="color:#fff">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">Aún no hay leads.</div>`}
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderUserBadge() {
    return `
      <div class="ub-status online">
        <span class="ub-dot"></span>
        ${escapeHtml(state.user?.email || state.businessName)}
      </div>
    `;
  }

  function computeStats(leads) {
    const total = leads.length;
    const ready = leads.filter((l) => String(l.status).toUpperCase() === "READY_TO_CALL").length;
    const info = leads.filter((l) => String(l.status).toUpperCase() === "INFO_RECEIVED").length;
    const waiting = leads.filter((l) => String(l.status).toUpperCase() === "WAITING_INFO").length;
    return { total, ready, info, waiting };
  }

  function estimateLeadValue(lead) {
    const status = String(lead.status || "").toUpperCase();
    const score = Number(lead.score || 0);

    if (status === "READY_TO_CALL") return 4500 + score * 450;
    if (status === "INFO_RECEIVED") return 2200 + score * 300;
    if (status === "WAITING_INFO") return 900 + score * 180;
    return 600 + score * 120;
  }

  function getEstimatedPipeline(leads) {
    return leads.reduce((sum, lead) => sum + estimateLeadValue(lead), 0);
  }

  function getStatusDistribution(leads) {
    const stats = computeStats(leads);
    const total = Math.max(stats.total, 1);
    return [
      { label: "Ready to Call", pct: Math.round((stats.ready / total) * 100), color: "var(--ub-green)" },
      { label: "Info Received", pct: Math.round((stats.info / total) * 100), color: "var(--ub-blue)" },
      { label: "Waiting Info", pct: Math.round((stats.waiting / total) * 100), color: "var(--ub-gold)" },
    ];
  }

  function getActivityFeed() {
    return state.leads.slice(0, 5).map((lead, i) => {
      const status = String(lead.status || "").toUpperCase();
      let dot = "var(--ub-gold)";
      let title = `Lead activo: ${lead.name || "Sin nombre"}`;

      if (status === "READY_TO_CALL") dot = "var(--ub-green)";
      if (status === "INFO_RECEIVED") dot = "var(--ub-blue)";
      if (status === "WAITING_INFO") dot = "var(--ub-purple)";

      return {
        dot,
        title,
        sub: lead.last_message || lead.phone || "Conversación en curso",
        time: `${(i + 1) * 4} min`,
      };
    });
  }

  function getTopLeads() {
    return [...state.leads]
      .sort((a, b) => estimateLeadValue(b) - estimateLeadValue(a))
      .slice(0, 5);
  }

  function getWeeklySeries(leads) {
    const total = Math.max(leads.length, 1);
    return [
      Math.max(3, Math.round(total * 0.35)),
      Math.max(5, Math.round(total * 0.42)),
      Math.max(4, Math.round(total * 0.38)),
      Math.max(6, Math.round(total * 0.56)),
      Math.max(7, Math.round(total * 0.62)),
      Math.max(9, Math.round(total * 0.74)),
      Math.max(10, Math.round(total * 0.85)),
    ];
  }

  function renderLineChart(values) {
    const max = Math.max(...values, 1);
    const stepX = 100 / Math.max(values.length - 1, 1);

    const points = values.map((v, i) => {
      const x = i * stepX;
      const y = 100 - ((v / max) * 78 + 10);
      return `${x},${y}`;
    }).join(" ");

    return `
      <svg class="ub-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="url(#goldLine)"
          stroke-width="2.8"
          points="${points}"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <defs>
          <linearGradient id="goldLine" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#f6b300"></stop>
            <stop offset="100%" stop-color="#ffd45f"></stop>
          </linearGradient>
        </defs>
      </svg>
    `;
  }

  function money(value) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value || 0);
    } catch {
      return `$${Math.round(value || 0)}`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    state.refreshTimer = setInterval(async () => {
      if (!state.user || !state.whatsappConnected) return;
      await loadLeads(true);
    }, 7000);
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  function injectStyles() {
    if (document.getElementById("urus-blueprint-v6-styles")) return;

    const style = document.createElement("style");
    style.id = "urus-blueprint-v6-styles";
    style.textContent = `
      :root{
        --ub-bg:#060606;
        --ub-bg2:#0b0b0b;
        --ub-panel:rgba(15,15,15,.95);
        --ub-line:rgba(255,255,255,.08);
        --ub-line-soft:rgba(255,255,255,.05);
        --ub-text:#f5f5f5;
        --ub-muted:#9d9d9d;
        --ub-soft:#d8d8d8;
        --ub-gold:#f6b300;
        --ub-gold2:#ffd463;
        --ub-blue:#3ab8ff;
        --ub-green:#22c55e;
        --ub-purple:#b78cff;
        --ub-shadow:0 24px 70px rgba(0,0,0,.45);
      }

      .main-content{
        min-height:100vh;
        overflow:auto;
        background:
          radial-gradient(circle at top right, rgba(34,197,94,.09), transparent 22%),
          radial-gradient(circle at top left, rgba(246,179,0,.09), transparent 18%),
          linear-gradient(180deg, rgba(255,255,255,.012), rgba(255,255,255,0));
      }

      .ub-wrap{
        min-height:100vh;
        padding:28px 28px 24px;
        color:var(--ub-text);
      }

      .ub-topbar{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:18px;
        margin-bottom:22px;
      }

      .ub-top-actions{
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap:wrap;
      }

      .ub-title{
        margin:0 0 8px;
        font-size:54px;
        line-height:.95;
        font-weight:800;
        letter-spacing:-.05em;
      }

      .ub-subtitle{
        margin:0;
        color:var(--ub-muted);
        font-size:18px;
        max-width:760px;
      }

      .ub-status{
        display:inline-flex;
        align-items:center;
        gap:10px;
        padding:12px 16px;
        border-radius:999px;
        border:1px solid var(--ub-line);
        font-weight:800;
        box-shadow:var(--ub-shadow);
        white-space:nowrap;
      }

      .ub-status.online{
        background:rgba(13,22,16,.88);
        color:#93f2b3;
      }

      .ub-status.offline{
        background:rgba(30,21,8,.9);
        color:#f1cb73;
      }

      .ub-dot{
        width:10px;
        height:10px;
        border-radius:999px;
        background:currentColor;
        box-shadow:0 0 14px currentColor;
      }

      .ub-auth-shell{
        min-height:calc(100vh - 60px);
        display:grid;
        grid-template-columns:1.15fr .85fr;
        gap:22px;
        align-items:center;
      }

      .ub-auth-hero,
      .ub-auth-card,
      .ub-connect-card,
      .ub-card,
      .ub-modal{
        border-radius:28px;
        border:1px solid var(--ub-line);
        background:
          linear-gradient(180deg, rgba(255,255,255,.025), rgba(255,255,255,.01)),
          rgba(12,12,12,.92);
        box-shadow:var(--ub-shadow);
      }

      .ub-auth-hero{ padding:34px; }
      .ub-auth-card{ padding:28px; }

      .ub-auth-badge{
        display:inline-flex;
        padding:10px 14px;
        border-radius:999px;
        background:rgba(246,179,0,.10);
        border:1px solid rgba(246,179,0,.18);
        color:#f7d78d;
        font-size:12px;
        font-weight:900;
        letter-spacing:.08em;
        text-transform:uppercase;
      }

      .ub-auth-title{
        margin:18px 0 12px;
        font-size:56px;
        line-height:.95;
        letter-spacing:-.05em;
      }

      .ub-auth-copy{
        color:var(--ub-soft);
        font-size:18px;
        max-width:650px;
      }

      .ub-auth-points{
        display:grid;
        grid-template-columns:repeat(3, minmax(0,1fr));
        gap:12px;
        margin-top:24px;
      }

      .ub-auth-point{
        padding:16px;
        border-radius:18px;
        background:rgba(255,255,255,.02);
        border:1px solid var(--ub-line-soft);
      }

      .ub-auth-point strong{
        display:block;
        margin-bottom:6px;
      }

      .ub-auth-point span{
        color:var(--ub-muted);
        font-size:13px;
      }

      .ub-auth-tabs{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        margin-bottom:18px;
      }

      .ub-auth-tab,
      .ub-primary-btn,
      .ub-secondary-btn,
      .ub-ghost-btn,
      .ub-refresh{
        border:0;
        outline:0;
        cursor:pointer;
        transition:.18s ease;
        font-weight:800;
      }

      .ub-auth-tab{
        height:46px;
        border-radius:14px;
        background:#161616;
        color:#d7d7d7;
        border:1px solid var(--ub-line);
      }

      .ub-auth-tab.active{
        background:rgba(246,179,0,.12);
        border-color:rgba(246,179,0,.20);
        color:#f5d488;
      }

      .ub-primary-btn{
        min-width:220px;
        height:56px;
        padding:0 22px;
        border-radius:18px;
        background:linear-gradient(180deg, var(--ub-gold2), var(--ub-gold));
        color:#111;
        box-shadow:0 14px 30px rgba(246,179,0,.25);
        font-size:16px;
      }

      .ub-secondary-btn,
      .ub-refresh{
        height:48px;
        padding:0 16px;
        border-radius:14px;
        background:#171717;
        color:var(--ub-text);
        border:1px solid var(--ub-line);
      }

      .ub-ghost-btn{
        height:48px;
        padding:0 16px;
        border-radius:14px;
        background:transparent;
        color:#d0d0d0;
        border:1px solid var(--ub-line);
      }

      .ub-auth-form{
        display:grid;
        gap:12px;
      }

      .ub-auth-error{
        min-height:20px;
        color:#ff9d9d;
        font-size:13px;
      }

      .ub-hero{
        display:grid;
        place-items:center;
        min-height:calc(100vh - 170px);
      }

      .ub-connect-card{
        width:min(860px, 100%);
        padding:46px 36px 36px;
        text-align:center;
      }

      .ub-connect-icon{
        width:68px;
        height:68px;
        border-radius:22px;
        display:grid;
        place-items:center;
        margin:0 auto 18px;
        background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02));
        border:1px solid rgba(255,255,255,.08);
        font-size:30px;
      }

      .ub-connect-heading{
        font-size:38px;
        line-height:1.02;
        margin:0 0 12px;
        font-weight:800;
      }

      .ub-connect-copy{
        margin:0 auto 24px;
        max-width:620px;
        font-size:18px;
        color:#d0d0d0;
      }

      .ub-connect-points{
        display:grid;
        grid-template-columns:repeat(3, minmax(0,1fr));
        gap:12px;
        margin-top:24px;
      }

      .ub-point{
        padding:16px;
        border-radius:18px;
        background:rgba(255,255,255,.025);
        border:1px solid rgba(255,255,255,.06);
        text-align:left;
      }

      .ub-point strong{
        display:block;
        font-size:14px;
        margin-bottom:6px;
      }

      .ub-point span{
        color:var(--ub-muted);
        font-size:13px;
        line-height:1.4;
      }

      .ub-modal-backdrop{
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.62);
        backdrop-filter:blur(7px);
        display:none;
        align-items:center;
        justify-content:center;
        z-index:9999;
        padding:18px;
      }

      .ub-modal-backdrop.show{ display:flex; }

      .ub-modal{
        width:min(560px,100%);
        padding:26px;
      }

      .ub-modal h3{
        margin:0 0 8px;
        font-size:28px;
        font-weight:800;
      }

      .ub-modal p{
        margin:0 0 18px;
        color:var(--ub-muted);
      }

      .ub-field{ margin-bottom:14px; }

      .ub-label{
        display:block;
        margin-bottom:8px;
        color:#d8d8d8;
        font-size:13px;
        font-weight:700;
      }

      .ub-input{
        width:100%;
        height:54px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.08);
        background:#111;
        color:var(--ub-text);
        padding:0 16px;
        font-size:15px;
        outline:0;
      }

      .ub-modal-actions{
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:8px;
      }

      .ub-grid{ display:grid; gap:18px; }
      .ub-stats{ grid-template-columns:repeat(4,minmax(0,1fr)); }

      .ub-card{
        border-radius:24px;
        padding:20px;
      }

      .ub-stat{
        position:relative;
        overflow:hidden;
      }

      .ub-stat::after{
        content:"";
        position:absolute;
        left:16px;
        right:16px;
        bottom:14px;
        height:3px;
        border-radius:999px;
        opacity:.95;
      }

      .ub-stat.gold::after{ background:var(--ub-gold); }
      .ub-stat.blue::after{ background:var(--ub-blue); }
      .ub-stat.green::after{ background:var(--ub-green); }
      .ub-stat.purple::after{ background:var(--ub-purple); }

      .ub-stat-label{ color:#cfcfcf; font-size:14px; margin-bottom:10px; }
      .ub-stat-value{ font-size:28px; font-weight:800; margin-bottom:4px; }
      .ub-stat-sub{ color:var(--ub-muted); font-size:12px; }

      .ub-dashboard-grid{
        display:grid;
        grid-template-columns:1.25fr .75fr;
        gap:18px;
        margin-top:18px;
      }

      .ub-chart-card,
      .ub-activity-card,
      .ub-funnel-card,
      .ub-top-card{ padding:20px; }

      .ub-card-title{ font-size:22px; margin:0 0 6px; font-weight:800; }
      .ub-card-copy{ color:var(--ub-muted); font-size:13px; margin:0 0 18px; }

      .ub-graph-wrap{
        position:relative;
        height:260px;
        border-radius:18px;
        border:1px solid var(--ub-line-soft);
        background:
          linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.01)),
          #0f0f0f;
        overflow:hidden;
        padding:18px;
      }

      .ub-graph-grid{
        position:absolute;
        inset:0;
        background:
          linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
        background-size:100% 25%, 16.66% 100%;
        opacity:.5;
      }

      .ub-line-svg{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
      }

      .ub-graph-badge{
        position:absolute;
        right:16px;
        bottom:16px;
        padding:8px 12px;
        border-radius:999px;
        background:rgba(246,179,0,.12);
        border:1px solid rgba(246,179,0,.18);
        color:#f7d78d;
        font-size:12px;
        font-weight:800;
      }

      .ub-activity-list,
      .ub-mini-list,
      .ub-list{
        display:grid;
        gap:12px;
      }

      .ub-activity-item{
        display:grid;
        grid-template-columns:12px 1fr auto;
        align-items:center;
        gap:12px;
        padding:12px 0;
        border-bottom:1px solid rgba(255,255,255,.05);
      }

      .ub-activity-item:last-child{ border-bottom:0; }

      .ub-activity-dot{
        width:12px;
        height:12px;
        border-radius:999px;
      }

      .ub-activity-main{ color:#f1f1f1; font-size:14px; font-weight:700; }
      .ub-activity-sub{ color:var(--ub-muted); font-size:12px; margin-top:2px; }
      .ub-activity-time{ color:var(--ub-muted); font-size:12px; }

      .ub-bar-group{ display:grid; gap:16px; }

      .ub-bar-row{
        display:grid;
        grid-template-columns:120px 1fr 52px;
        gap:12px;
        align-items:center;
      }

      .ub-bar-label{ color:#d8d8d8; font-size:13px; font-weight:700; }
      .ub-bar-track{ height:10px; border-radius:999px; background:#171717; overflow:hidden; }
      .ub-bar-fill{ height:100%; border-radius:999px; }

      @media (max-width:1180px){
        .ub-auth-shell,
        .ub-dashboard-grid{
          grid-template-columns:1fr;
        }
      }

      @media (max-width:980px){
        .ub-wrap{ padding:18px 14px 16px; }
        .ub-title{ font-size:38px; }
        .ub-topbar{ flex-direction:column; align-items:flex-start; }
        .ub-stats,
        .ub-connect-points,
        .ub-auth-points,
        .ub-dashboard-grid{
          grid-template-columns:1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }
});

  function renderLeadsView() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Leads</h2>
            <p class="ub-subtitle">Lista comercial arriba y chat operativo abajo. En desktop: lista izquierda y chat derecha.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="${state.mobile ? "ub-mobile-stack" : "ub-main"}">
          <div class="ub-card ub-panel">
            <div class="ub-panel-head">
              <div>
                <h3 class="ub-panel-title">Leads</h3>
                <p class="ub-panel-copy">Conversaciones activas con búsqueda y filtros</p>
              </div>
              <div class="ub-loading" id="leadsLoadingLabel"></div>
            </div>

            <div class="ub-search-wrap">
              <input class="ub-search" id="leadSearchInput" value="${escapeHtml(state.search)}" placeholder="Buscar por nombre, teléfono o mensaje..." />
            </div>

            <div class="ub-status-filters">
              ${renderStatusChips()}
            </div>

            <div class="ub-leads" id="leadsList">
              ${renderLeadListHtml()}
            </div>
          </div>

          <div class="ub-card ub-panel">
            <div class="ub-chat-shell">
              <div class="ub-chat-head" id="chatHeader">
                ${renderChatHeaderHtml()}
              </div>

              <div class="ub-chat-body" id="chatMessages">
                ${renderMessagesHtml()}
              </div>

              <div class="ub-compose">
                <div class="ub-compose-row">
                  <textarea
                    id="chatInput"
                    class="ub-textarea"
                    placeholder="${state.selectedLeadId ? "Escribe una respuesta manual..." : "Selecciona un lead para responder..."}"
                    ${state.selectedLeadId ? "" : "disabled"}
                  ></textarea>

                  <button class="ub-primary-btn" id="sendMessageBtn" ${state.selectedLeadId ? "" : "disabled"}>
                    ${state.sending ? "Enviando..." : "Enviar"}
                  </button>
                </div>

                <div class="ub-muted-note">
                  ${state.selectedLeadId ? "Respuesta manual conectada al backend real." : "Aún no hay conversación seleccionada."}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderFollowupsView() {
    const followups = state.leads.filter((lead) => {
      const status = String(lead.status || "").toUpperCase();
      return status === "WAITING_INFO" || status === "INFO_RECEIVED" || status === "READY_TO_CALL";
    });

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Follow-ups</h2>
            <p class="ub-subtitle">Cola de seguimiento basada en los leads reales del sistema.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Prioridad inmediata</h4>
            <div class="ub-list">
              ${followups.length ? followups.slice(0, 10).map(lead => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span>${escapeHtml(formatStatusLabel(lead.status))}</span> ·
                  <span style="color:#f6d07e">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">No hay follow-ups ahora mismo.</div>`}
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Lectura comercial</h4>
            <div class="ub-list">
              <div class="ub-list-item">1. Ataca primero los Ready to Call.</div>
              <div class="ub-list-item">2. Mueve Info Received hacia llamada o demo.</div>
              <div class="ub-list-item">3. Recupera Waiting Info antes de que se enfríen.</div>
              <div class="ub-list-item">4. Usa el chat para empujar continuidad manual cuando haga falta.</div>
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderCalendarView() {
    const items = getCalendarItems();

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Calendario</h2>
            <p class="ub-subtitle">Agenda operativa del sistema usando tus leads actuales.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="ub-card ub-list-card">
          <h4>Agenda de seguimiento</h4>
          <div class="ub-calendar-list">
            ${items.length ? items.map(item => `
              <div class="ub-calendar-item">
                <div class="ub-calendar-date">${escapeHtml(item.slot)}</div>

                <div>
                  <strong>${escapeHtml(item.lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(item.lead.phone || "")}</span><br>
                  <span>${escapeHtml(item.action)}</span>
                </div>

                <div class="ub-pill ${statusClass(item.lead.status)}">
                  ${escapeHtml(formatStatusLabel(item.lead.status))}
                </div>
              </div>
            `).join("") : `<div class="ub-list-item">Todavía no hay agenda generada.</div>`}
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderTemplatesView() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Plantillas</h2>
            <p class="ub-subtitle">Mensajes base para apertura, seguimiento y cierre.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-secondary-btn" id="logoutBtn">Salir</button>
          </div>
        </header>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Apertura</h4>
            <div class="ub-list">
              <div class="ub-list-item">Hola, gracias por escribir. Cuéntame un poco sobre tu negocio y qué te gustaría mejorar en WhatsApp.</div>
              <div class="ub-list-item">Te explico simple: esto te ayuda a no perder prospectos y a ordenar mejor tus conversaciones.</div>
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Seguimiento</h4>
            <div class="ub-list">
              <div class="ub-list-item">Quedo pendiente. Si quieres, te enseño una demo corta aplicada a tu caso.</div>
              <div class="ub-list-item">Cuando tengas claro lo que quieres que haga el sistema, te lo preparo.</div>
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderAnalyticsView() {
    const stats = computeStats(state.leads);
    const estimated = getEstimatedPipeline(state.leads);
    const avgValue = stats.total ? Math.round(estimated / stats.total) : 0;
    const dist = getStatusDistribution(state.leads);
    const top = getTopLeads().slice(0, 3);

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Valor del sistema</h2>
            <p class="ub-subtitle">Lectura persuasiva: dinero estimado, foco y distribución actual.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="ub-grid ub-stats">
          <div class="ub-card ub-stat gold">
            <div class="ub-stat-label">45 días estimados</div>
            <div class="ub-stat-value">${money(estimated)}</div>
            <div class="ub-stat-sub">Proyección por score y status</div>
          </div>

          <div class="ub-card ub-stat blue">
            <div class="ub-stat-label">Valor promedio</div>
            <div class="ub-stat-value">${money(avgValue)}</div>
            <div class="ub-stat-sub">Ticket relativo</div>
          </div>

          <div class="ub-card ub-stat green">
            <div class="ub-stat-label">Leads con intención</div>
            <div class="ub-stat-value">${stats.ready + stats.info}</div>
            <div class="ub-stat-sub">Más cerca del cierre</div>
          </div>

          <div class="ub-card ub-stat purple">
            <div class="ub-stat-label">Potencial retenido</div>
            <div class="ub-stat-value">${stats.waiting}</div>
            <div class="ub-stat-sub">Todavía recuperable</div>
          </div>
        </section>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Distribución</h4>
            <div class="ub-bar-group">
              ${dist.map(item => `
                <div class="ub-bar-row">
                  <div class="ub-bar-label">${escapeHtml(item.label)}</div>
                  <div class="ub-bar-track">
                    <div class="ub-bar-fill" style="width:${item.pct}%;background:${item.color};"></div>
                  </div>
                  <div class="ub-bar-label">${item.pct}%</div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Más valor hoy</h4>
            <div class="ub-list">
              ${top.length ? top.map(lead => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span style="color:#fff">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">Sin leads suficientes aún.</div>`}
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderStatusChips() {
    const filters = [
      { key: "all", label: "Todos" },
      { key: "READY_TO_CALL", label: "Ready" },
      { key: "INFO_RECEIVED", label: "Info" },
      { key: "WAITING_INFO", label: "Waiting" },
    ];

    return filters.map((filter) => `
      <button class="ub-chip ${state.statusFilter === filter.key ? "active" : ""}" data-filter="${filter.key}">
        ${filter.label}
      </button>
    `).join("");
  }

  function getUnreadCount(lead) {
    const seen = state.seenMap[String(lead.id)] || "";
    const current = String(lead.last_message || "");
    if (!current) return 0;
    if (!seen) return 1;
    return seen !== current ? 1 : 0;
  }

  function renderLeadListHtml() {
    if (state.loadingLeads && state.filteredLeads.length === 0) {
      return `<div class="ub-empty">Cargando leads...</div>`;
    }

    if (!state.filteredLeads.length) {
      return `<div class="ub-empty">No hay leads que coincidan con la búsqueda o el filtro.</div>`;
    }

    return state.filteredLeads.map((lead) => `
      <div class="ub-lead ${state.selectedLeadId === lead.id ? "active" : ""}" data-lead-id="${escapeHtml(lead.id)}">
        <div class="ub-avatar">${escapeHtml(getInitials(lead.name))}</div>

        <div style="min-width:0;">
          <div class="ub-lead-name">
            ${escapeHtml(lead.name || "Sin nombre")}
            ${getUnreadCount(lead) ? `<span class="ub-unread">${getUnreadCount(lead)}</span>` : ""}
          </div>
          <div class="ub-lead-snippet">${escapeHtml(lead.last_message || lead.phone || "Sin mensaje")}</div>
        </div>

        <div class="ub-pill ${statusClass(lead.status)}">
          ${escapeHtml(formatStatusLabel(lead.status))}
        </div>
      </div>
    `).join("");
  }

  function renderChatHeaderHtml() {
    if (!state.selectedLead) {
      return `
        <div class="ub-chat-user">
          <div class="ub-avatar">?</div>
          <div>
            <h3>Selecciona un lead</h3>
            <p>Haz clic en una conversación para abrir el historial completo.</p>
          </div>
        </div>
        <div class="ub-chat-meta"></div>
      `;
    }

    return `
      <div class="ub-chat-user">
        <div class="ub-avatar">${escapeHtml(getInitials(state.selectedLead.name))}</div>
        <div>
          <h3>${escapeHtml(state.selectedLead.name || "Sin nombre")}</h3>
          <p>${escapeHtml(state.selectedLead.phone || "")}</p>
        </div>
      </div>

      <div class="ub-chat-meta">
        <div class="ub-pill ${statusClass(state.selectedLead.status)}">${escapeHtml(formatStatusLabel(state.selectedLead.status))}</div>
        <div class="ub-pill other">Score ${escapeHtml(state.selectedLead.score ?? 0)}</div>
        <div class="ub-pill other">${money(estimateLeadValue(state.selectedLead))}</div>
      </div>
    `;
  }

  function renderTypingIndicator() {
    return `
      <div class="ub-msg-row outbound">
        <div class="ub-msg typing">
          <div class="ub-typing-dots">
            <span></span><span></span><span></span>
          </div>
          <div class="ub-msg-meta">Enviando...</div>
        </div>
      </div>
    `;
  }

  function renderMessagesHtml() {
    if (!state.selectedLeadId) {
      return `
        <div class="ub-empty">
          <div>
            <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:6px;">Workspace operativo</div>
            <div>Selecciona un lead para abrir el chat y responder desde aquí.</div>
          </div>
        </div>
      `;
    }

    const messagesHtml = state.messages.length
      ? state.messages.map((msg) => `
          <div class="ub-msg-row ${msg.direction === "outbound" ? "outbound" : ""}">
            <div class="ub-msg ${msg.direction === "outbound" ? "outbound" : ""}">
              <div class="ub-msg-body">${escapeHtml(msg.body || "")}</div>
              <div class="ub-msg-meta">
                ${msg.direction === "outbound" ? "URUS / outbound" : "Lead / inbound"} · ${escapeHtml(formatDate(msg.created_at))}
              </div>
            </div>
          </div>
        `).join("")
      : `<div class="ub-empty">Este lead todavía no tiene mensajes guardados.</div>`;

    return `
      ${messagesHtml}
      ${state.typing ? renderTypingIndicator() : ""}
    `;
  }

  function getCalendarItems() {
    const followups = state.leads
      .filter((lead) => {
        const status = String(lead.status || "").toUpperCase();
        return status === "WAITING_INFO" || status === "INFO_RECEIVED" || status === "READY_TO_CALL";
      })
      .slice(0, 8);

    const slots = [
      "Hoy · 9:00 AM",
      "Hoy · 11:30 AM",
      "Hoy · 3:00 PM",
      "Mañana · 10:00 AM",
      "Mañana · 1:00 PM",
      "Mañana · 4:00 PM",
      "Viernes · 9:30 AM",
      "Viernes · 2:00 PM",
    ];

    return followups.map((lead, idx) => ({
      slot: slots[idx] || "Próximo bloque",
      lead,
      action:
        String(lead.status || "").toUpperCase() === "READY_TO_CALL"
          ? "Llamada / cierre"
          : String(lead.status || "").toUpperCase() === "INFO_RECEIVED"
          ? "Seguimiento con propuesta"
          : "Recuperar contexto",
    }));
  }

  function renderLeadsView() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Leads</h2>
            <p class="ub-subtitle">Lista comercial arriba y chat operativo abajo. En desktop: lista izquierda y chat derecha.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="${state.mobile ? "ub-mobile-stack" : "ub-main"}">
          <div class="ub-card ub-panel">
            <div class="ub-panel-head">
              <div>
                <h3 class="ub-panel-title">Leads</h3>
                <p class="ub-panel-copy">Conversaciones activas con búsqueda y filtros</p>
              </div>
              <div class="ub-loading" id="leadsLoadingLabel"></div>
            </div>

            <div class="ub-search-wrap">
              <input class="ub-search" id="leadSearchInput" value="${escapeHtml(state.search)}" placeholder="Buscar por nombre, teléfono o mensaje..." />
            </div>

            <div class="ub-status-filters">
              ${renderStatusChips()}
            </div>

            <div class="ub-leads" id="leadsList">
              ${renderLeadListHtml()}
            </div>
          </div>

          <div class="ub-card ub-panel">
            <div class="ub-chat-shell">
              <div class="ub-chat-head" id="chatHeader">
                ${renderChatHeaderHtml()}
              </div>

              <div class="ub-chat-body" id="chatMessages">
                ${renderMessagesHtml()}
              </div>

              <div class="ub-compose">
                <div class="ub-compose-row">
                  <textarea
                    id="chatInput"
                    class="ub-textarea"
                    placeholder="${state.selectedLeadId ? "Escribe una respuesta manual..." : "Selecciona un lead para responder..."}"
                    ${state.selectedLeadId ? "" : "disabled"}
                  ></textarea>

                  <button class="ub-primary-btn" id="sendMessageBtn" ${state.selectedLeadId ? "" : "disabled"}>
                    ${state.sending ? "Enviando..." : "Enviar"}
                  </button>
                </div>

                <div class="ub-muted-note">
                  ${state.selectedLeadId ? "Respuesta manual conectada al backend real." : "Aún no hay conversación seleccionada."}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderFollowupsView() {
    const followups = state.leads.filter((lead) => {
      const status = String(lead.status || "").toUpperCase();
      return status === "WAITING_INFO" || status === "INFO_RECEIVED" || status === "READY_TO_CALL";
    });

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Follow-ups</h2>
            <p class="ub-subtitle">Cola de seguimiento basada en los leads reales del sistema.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Prioridad inmediata</h4>
            <div class="ub-list">
              ${followups.length ? followups.slice(0, 10).map(lead => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span>${escapeHtml(formatStatusLabel(lead.status))}</span> ·
                  <span style="color:#f6d07e">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">No hay follow-ups ahora mismo.</div>`}
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Lectura comercial</h4>
            <div class="ub-list">
              <div class="ub-list-item">1. Ataca primero los Ready to Call.</div>
              <div class="ub-list-item">2. Mueve Info Received hacia llamada o demo.</div>
              <div class="ub-list-item">3. Recupera Waiting Info antes de que se enfríen.</div>
              <div class="ub-list-item">4. Usa el chat para empujar continuidad manual cuando haga falta.</div>
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderCalendarView() {
    const items = getCalendarItems();

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Calendario</h2>
            <p class="ub-subtitle">Agenda operativa del sistema usando tus leads actuales.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="ub-card ub-list-card">
          <h4>Agenda de seguimiento</h4>
          <div class="ub-calendar-list">
            ${items.length ? items.map(item => `
              <div class="ub-calendar-item">
                <div class="ub-calendar-date">${escapeHtml(item.slot)}</div>

                <div>
                  <strong>${escapeHtml(item.lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(item.lead.phone || "")}</span><br>
                  <span>${escapeHtml(item.action)}</span>
                </div>

                <div class="ub-pill ${statusClass(item.lead.status)}">
                  ${escapeHtml(formatStatusLabel(item.lead.status))}
                </div>
              </div>
            `).join("") : `<div class="ub-list-item">Todavía no hay agenda generada.</div>`}
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderTemplatesView() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Plantillas</h2>
            <p class="ub-subtitle">Mensajes base para apertura, seguimiento y cierre.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-secondary-btn" id="logoutBtn">Salir</button>
          </div>
        </header>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Apertura</h4>
            <div class="ub-list">
              <div class="ub-list-item">Hola, gracias por escribir. Cuéntame un poco sobre tu negocio y qué te gustaría mejorar en WhatsApp.</div>
              <div class="ub-list-item">Te explico simple: esto te ayuda a no perder prospectos y a ordenar mejor tus conversaciones.</div>
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Seguimiento</h4>
            <div class="ub-list">
              <div class="ub-list-item">Quedo pendiente. Si quieres, te enseño una demo corta aplicada a tu caso.</div>
              <div class="ub-list-item">Cuando tengas claro lo que quieres que haga el sistema, te lo preparo.</div>
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderAnalyticsView() {
    const stats = computeStats(state.leads);
    const estimated = getEstimatedPipeline(state.leads);
    const avgValue = stats.total ? Math.round(estimated / stats.total) : 0;
    const dist = getStatusDistribution(state.leads);
    const top = getTopLeads().slice(0, 3);

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Valor del sistema</h2>
            <p class="ub-subtitle">Lectura persuasiva: dinero estimado, foco y distribución actual.</p>
          </div>

          <div class="ub-top-actions">
            ${renderUserBadge()}
            <button class="ub-refresh" id="refreshBtn">Actualizar</button>
          </div>
        </header>

        <section class="ub-grid ub-stats">
          <div class="ub-card ub-stat gold">
            <div class="ub-stat-label">45 días estimados</div>
            <div class="ub-stat-value">${money(estimated)}</div>
            <div class="ub-stat-sub">Proyección por score y status</div>
          </div>

          <div class="ub-card ub-stat blue">
            <div class="ub-stat-label">Valor promedio</div>
            <div class="ub-stat-value">${money(avgValue)}</div>
            <div class="ub-stat-sub">Ticket relativo</div>
          </div>

          <div class="ub-card ub-stat green">
            <div class="ub-stat-label">Leads con intención</div>
            <div class="ub-stat-value">${stats.ready + stats.info}</div>
            <div class="ub-stat-sub">Más cerca del cierre</div>
          </div>

          <div class="ub-card ub-stat purple">
            <div class="ub-stat-label">Potencial retenido</div>
            <div class="ub-stat-value">${stats.waiting}</div>
            <div class="ub-stat-sub">Todavía recuperable</div>
          </div>
        </section>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Distribución</h4>
            <div class="ub-bar-group">
              ${dist.map(item => `
                <div class="ub-bar-row">
                  <div class="ub-bar-label">${escapeHtml(item.label)}</div>
                  <div class="ub-bar-track">
                    <div class="ub-bar-fill" style="width:${item.pct}%;background:${item.color};"></div>
                  </div>
                  <div class="ub-bar-label">${item.pct}%</div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Más valor hoy</h4>
            <div class="ub-list">
              ${top.length ? top.map(lead => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span style="color:#fff">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">Sin leads suficientes aún.</div>`}
            </div>
          </div>
        </section>
      </div>
    `;

    bindAppEvents();
  }

  function renderStatusChips() {
    const filters = [
      { key: "all", label: "Todos" },
      { key: "READY_TO_CALL", label: "Ready" },
      { key: "INFO_RECEIVED", label: "Info" },
      { key: "WAITING_INFO", label: "Waiting" },
    ];

    return filters.map((filter) => `
      <button class="ub-chip ${state.statusFilter === filter.key ? "active" : ""}" data-filter="${filter.key}">
        ${filter.label}
      </button>
    `).join("");
  }

  function getUnreadCount(lead) {
    const seen = state.seenMap[String(lead.id)] || "";
    const current = String(lead.last_message || "");
    if (!current) return 0;
    if (!seen) return 1;
    return seen !== current ? 1 : 0;
  }

  function renderLeadListHtml() {
    if (state.loadingLeads && state.filteredLeads.length === 0) {
      return `<div class="ub-empty">Cargando leads...</div>`;
    }

    if (!state.filteredLeads.length) {
      return `<div class="ub-empty">No hay leads que coincidan con la búsqueda o el filtro.</div>`;
    }

    return state.filteredLeads.map((lead) => `
      <div class="ub-lead ${state.selectedLeadId === lead.id ? "active" : ""}" data-lead-id="${escapeHtml(lead.id)}">
        <div class="ub-avatar">${escapeHtml(getInitials(lead.name))}</div>

        <div style="min-width:0;">
          <div class="ub-lead-name">
            ${escapeHtml(lead.name || "Sin nombre")}
            ${getUnreadCount(lead) ? `<span class="ub-unread">${getUnreadCount(lead)}</span>` : ""}
          </div>
          <div class="ub-lead-snippet">${escapeHtml(lead.last_message || lead.phone || "Sin mensaje")}</div>
        </div>

        <div class="ub-pill ${statusClass(lead.status)}">
          ${escapeHtml(formatStatusLabel(lead.status))}
        </div>
      </div>
    `).join("");
  }

  function renderChatHeaderHtml() {
    if (!state.selectedLead) {
      return `
        <div class="ub-chat-user">
          <div class="ub-avatar">?</div>
          <div>
            <h3>Selecciona un lead</h3>
            <p>Haz clic en una conversación para abrir el historial completo.</p>
          </div>
        </div>
        <div class="ub-chat-meta"></div>
      `;
    }

    return `
      <div class="ub-chat-user">
        <div class="ub-avatar">${escapeHtml(getInitials(state.selectedLead.name))}</div>
        <div>
          <h3>${escapeHtml(state.selectedLead.name || "Sin nombre")}</h3>
          <p>${escapeHtml(state.selectedLead.phone || "")}</p>
        </div>
      </div>

      <div class="ub-chat-meta">
        <div class="ub-pill ${statusClass(state.selectedLead.status)}">${escapeHtml(formatStatusLabel(state.selectedLead.status))}</div>
        <div class="ub-pill other">Score ${escapeHtml(state.selectedLead.score ?? 0)}</div>
        <div class="ub-pill other">${money(estimateLeadValue(state.selectedLead))}</div>
      </div>
    `;
  }

  function renderTypingIndicator() {
    return `
      <div class="ub-msg-row outbound">
        <div class="ub-msg typing">
          <div class="ub-typing-dots">
            <span></span><span></span><span></span>
          </div>
          <div class="ub-msg-meta">Enviando...</div>
        </div>
      </div>
    `;
  }

  function renderMessagesHtml() {
    if (!state.selectedLeadId) {
      return `
        <div class="ub-empty">
          <div>
            <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:6px;">Workspace operativo</div>
            <div>Selecciona un lead para abrir el chat y responder desde aquí.</div>
          </div>
        </div>
      `;
    }

    const messagesHtml = state.messages.length
      ? state.messages.map((msg) => `
          <div class="ub-msg-row ${msg.direction === "outbound" ? "outbound" : ""}">
            <div class="ub-msg ${msg.direction === "outbound" ? "outbound" : ""}">
              <div class="ub-msg-body">${escapeHtml(msg.body || "")}</div>
              <div class="ub-msg-meta">
                ${msg.direction === "outbound" ? "URUS / outbound" : "Lead / inbound"} · ${escapeHtml(formatDate(msg.created_at))}
              </div>
            </div>
          </div>
        `).join("")
      : `<div class="ub-empty">Este lead todavía no tiene mensajes guardados.</div>`;

    return `
      ${messagesHtml}
      ${state.typing ? renderTypingIndicator() : ""}
    `;
  }

  function getCalendarItems() {
    const followups = state.leads
      .filter((lead) => {
        const status = String(lead.status || "").toUpperCase();
        return status === "WAITING_INFO" || status === "INFO_RECEIVED" || status === "READY_TO_CALL";
      })
      .slice(0, 8);

    const slots = [
      "Hoy · 9:00 AM",
      "Hoy · 11:30 AM",
      "Hoy · 3:00 PM",
      "Mañana · 10:00 AM",
      "Mañana · 1:00 PM",
      "Mañana · 4:00 PM",
      "Viernes · 9:30 AM",
      "Viernes · 2:00 PM",
    ];

    return followups.map((lead, idx) => ({
      slot: slots[idx] || "Próximo bloque",
      lead,
      action:
        String(lead.status || "").toUpperCase() === "READY_TO_CALL"
          ? "Llamada / cierre"
          : String(lead.status || "").toUpperCase() === "INFO_RECEIVED"
          ? "Seguimiento con propuesta"
          : "Recuperar contexto",
    }));
  }

  function bindAppEvents() {
    bindSidebarNav();

    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        await loadLeads(true);
      };
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        clearAuth();
        render();
      };
    }

    const searchInput = document.getElementById("leadSearchInput");
    if (searchInput) {
      searchInput.oninput = (e) => {
        state.search = e.target.value || "";
        applyLeadFilter();
        rerenderLeadsArea();
      };
    }

    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.onclick = () => {
        state.statusFilter = btn.getAttribute("data-filter") || "all";
        applyLeadFilter();
        rerenderLeadsArea();
      };
    });

    document.querySelectorAll("[data-lead-id]").forEach((node) => {
      node.onclick = () => {
        const id = node.getAttribute("data-lead-id");
        if (!id) return;
        selectLead(id);
      };
    });

    const sendBtn = document.getElementById("sendMessageBtn");
    if (sendBtn) {
      sendBtn.onclick = async () => {
        await sendCurrentMessage();
      };
    }

    const chatInput = document.getElementById("chatInput");
    if (chatInput) {
      chatInput.onkeydown = async (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          await sendCurrentMessage();
        }
      };

      chatInput.oninput = () => {
        chatInput.style.height = "58px";
        chatInput.style.height = `${Math.min(chatInput.scrollHeight, 140)}px`;
      };

      chatInput.onfocus = () => {
        setTimeout(scrollChatToBottom, 300);
      };
    }
  }

  function applyLeadFilter() {
    const q = state.search.toLowerCase().trim();

    let result = [...state.leads];

    if (state.statusFilter !== "all") {
      result = result.filter(
        (l) => String(l.status).toUpperCase() === state.statusFilter
      );
    }

    if (q) {
      result = result.filter((l) => {
        const hay = `${l.name} ${l.phone} ${l.last_message}`.toLowerCase();
        return hay.includes(q);
      });
    }

    state.filteredLeads = result;
  }

  async function loadLeads(preserve = true) {
    state.loadingLeads = true;
    updateLoading("Actualizando...");

    try {
      const data = await fetchJson("/v1/wa/leads", { auth: true });

      state.leads = data.leads || [];
      applyLeadFilter();

      if (!preserve || !state.selectedLeadId) {
        state.selectedLeadId = state.filteredLeads[0]?.id || null;
      }

      if (!state.leads.find((l) => l.id === state.selectedLeadId)) {
        state.selectedLeadId = state.filteredLeads[0]?.id || null;
      }

      rerenderLeadsArea();

      if (state.selectedLeadId) {
        await loadMessages(state.selectedLeadId);
      }
    } catch (e) {
      console.error("LOAD LEADS ERROR", e);
      updateLoading("Error");
    } finally {
      state.loadingLeads = false;
      updateLoading("");
    }
  }

  async function selectLead(id) {
    state.selectedLeadId = id;
    markSeen(id);
    rerenderLeadsArea();
    await loadMessages(id);
  }

  function markSeen(id) {
    const lead = state.leads.find((l) => l.id === id);
    if (!lead) return;
    state.seenMap[id] = lead.last_message || "";
    persist();
  }

  async function loadMessages(id) {
    state.loadingChat = true;
    rerenderChatArea();

    try {
      const data = await fetchJson(`/v1/wa/leads/${id}/messages`, {
        auth: true,
      });

      state.selectedLead = data.lead;
      state.messages = data.messages || [];

      markSeen(id);
      rerenderChatArea();
      scrollChatToBottom();
    } catch (e) {
      console.error("LOAD MSG ERROR", e);
    } finally {
      state.loadingChat = false;
      rerenderChatArea();
      scrollChatToBottom();
    }
  }

  async function sendCurrentMessage() {
    if (!state.selectedLeadId || state.sending) return;

    const input = document.getElementById("chatInput");
    const msg = input.value.trim();
    if (!msg) return;

    state.sending = true;
    state.typing = true;
    rerenderChatArea();
    scrollChatToBottom();

    try {
      await fetchJson(`/v1/wa/leads/${state.selectedLeadId}/send`, {
        method: "POST",
        auth: true,
        body: { message: msg },
      });

      input.value = "";
      input.style.height = "58px";

      await new Promise((r) => setTimeout(r, 600));

      state.typing = false;

      await loadLeads(true);
      await loadMessages(state.selectedLeadId);
    } catch (e) {
      console.error("SEND ERROR", e);
      alert("Error enviando mensaje");
    } finally {
      state.sending = false;
      state.typing = false;
      rerenderChatArea();
    }
  }

  function rerenderLeadsArea() {
    const list = document.getElementById("leadsList");
    if (list) list.innerHTML = renderLeadListHtml();

    const filters = document.querySelector(".ub-status-filters");
    if (filters) filters.innerHTML = renderStatusChips();

    bindAppEvents();
  }

  function rerenderChatArea() {
    const head = document.getElementById("chatHeader");
    const body = document.getElementById("chatMessages");

    if (head) head.innerHTML = renderChatHeaderHtml();
    if (body) body.innerHTML = renderMessagesHtml();

    bindAppEvents();
  }

  function updateLoading(text) {
    const el = document.getElementById("leadsLoadingLabel");
    if (el) el.textContent = text;
  }

  function scrollChatToBottom() {
    const chat = document.getElementById("chatMessages");
    if (!chat) return;

    setTimeout(() => {
      chat.scrollTop = chat.scrollHeight;
    }, 80);
  }

  function formatStatusLabel(status) {
    const raw = String(status || "").toUpperCase();
    if (raw === "READY_TO_CALL") return "READY";
    if (raw === "INFO_RECEIVED") return "INFO";
    if (raw === "WAITING_INFO") return "WAITING";
    return raw.replace(/_/g, " ");
  }

  function statusClass(status) {
    const s = String(status || "").toUpperCase();
    if (s === "READY_TO_CALL") return "ready";
    if (s === "INFO_RECEIVED") return "info";
    if (s === "WAITING_INFO") return "waiting";
    return "other";
  }

  function getInitials(name) {
    return (name || "L").charAt(0).toUpperCase();
  }

  function formatDate(d) {
    if (!d) return "";
    return new Date(d).toLocaleString();
  }
