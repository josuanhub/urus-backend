document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  injectBlueprintProStyles();

  const appState = {
    whatsappConnected: false,
    businessName: "URUS WA OS",
    phoneNumber: "+1 260 300 6906",
    leads: [],
    filteredLeads: [],
    selectedLeadId: null,
    selectedLead: null,
    messages: [],
    search: "",
    loadingLeads: false,
    loadingChat: false,
    sending: false,
    refreshTimer: null,
  };

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("connected") === "1") {
    appState.whatsappConnected = true;
    window.history.replaceState({}, document.title, "/blueprint/index.html");
  }

  function injectBlueprintProStyles() {
    if (document.getElementById("urus-blueprint-pro-styles")) return;

    const style = document.createElement("style");
    style.id = "urus-blueprint-pro-styles";
    style.textContent = `
      :root{
        --ub-bg:#060606;
        --ub-panel:rgba(18,18,18,.88);
        --ub-panel-2:rgba(14,14,14,.92);
        --ub-border:rgba(255,255,255,.08);
        --ub-text:#f5f5f5;
        --ub-muted:#989898;
        --ub-gold:#f6b300;
        --ub-gold-2:#ffcc47;
        --ub-green:#22c55e;
        --ub-blue:#38bdf8;
        --ub-purple:#c084fc;
        --ub-red:#ef4444;
        --ub-shadow:0 20px 60px rgba(0,0,0,.42);
      }

      .main-content{
        overflow:auto;
      }

      .ub-wrap{
        padding:34px 34px 28px;
        min-height:100vh;
        color:var(--ub-text);
        background:
          radial-gradient(circle at top right, rgba(34,197,94,.12), transparent 22%),
          radial-gradient(circle at top left, rgba(246,179,0,.10), transparent 20%),
          linear-gradient(180deg, rgba(255,255,255,.015), rgba(255,255,255,0));
      }

      .ub-topbar{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:18px;
        margin-bottom:24px;
      }

      .ub-title{
        font-size:54px;
        line-height:.95;
        font-weight:800;
        margin:0 0 8px;
        letter-spacing:-.03em;
      }

      .ub-subtitle{
        margin:0;
        color:var(--ub-muted);
        font-size:18px;
      }

      .ub-status{
        display:inline-flex;
        align-items:center;
        gap:10px;
        padding:12px 16px;
        border-radius:999px;
        border:1px solid var(--ub-border);
        background:rgba(13,22,16,.8);
        color:#8df0af;
        box-shadow:var(--ub-shadow);
        font-weight:700;
      }

      .ub-status.offline{
        color:#f2c55e;
        background:rgba(24,19,7,.85);
      }

      .ub-dot{
        width:10px;
        height:10px;
        border-radius:999px;
        background:currentColor;
        box-shadow:0 0 14px currentColor;
      }

      .ub-hero{
        display:grid;
        place-items:center;
        min-height:calc(100vh - 180px);
      }

      .ub-connect-card{
        width:min(760px, 100%);
        border-radius:34px;
        padding:42px 34px 36px;
        border:1px solid rgba(246,179,0,.20);
        background:
          radial-gradient(circle at top left, rgba(246,179,0,.12), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)),
          rgba(12,12,12,.92);
        box-shadow:0 30px 80px rgba(0,0,0,.56);
        text-align:center;
        position:relative;
        overflow:hidden;
      }

      .ub-connect-card::after{
        content:"";
        position:absolute;
        inset:auto -20% -45% auto;
        width:280px;
        height:280px;
        border-radius:999px;
        background:radial-gradient(circle, rgba(246,179,0,.12), transparent 68%);
        pointer-events:none;
      }

      .ub-connect-icon{
        width:66px;
        height:66px;
        border-radius:22px;
        display:grid;
        place-items:center;
        margin:0 auto 18px;
        background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02));
        border:1px solid rgba(255,255,255,.08);
        font-size:30px;
      }

      .ub-connect-heading{
        font-size:34px;
        line-height:1.05;
        margin:0 0 10px;
        font-weight:800;
        letter-spacing:-.03em;
      }

      .ub-connect-copy{
        margin:0 auto 26px;
        max-width:520px;
        font-size:18px;
        color:#d0d0d0;
      }

      .ub-primary-btn,
      .ub-secondary-btn,
      .ub-ghost-btn{
        border:0;
        outline:0;
        cursor:pointer;
        transition:.18s ease;
        font-weight:800;
      }

      .ub-primary-btn{
        min-width:250px;
        height:56px;
        padding:0 22px;
        border-radius:18px;
        background:linear-gradient(180deg, var(--ub-gold-2), var(--ub-gold));
        color:#111;
        box-shadow:0 14px 30px rgba(246,179,0,.25);
        font-size:16px;
      }

      .ub-primary-btn:hover{
        transform:translateY(-1px);
        filter:brightness(1.03);
      }

      .ub-secondary-btn{
        height:48px;
        padding:0 16px;
        border-radius:14px;
        background:#171717;
        color:var(--ub-text);
        border:1px solid var(--ub-border);
      }

      .ub-ghost-btn{
        height:48px;
        padding:0 16px;
        border-radius:14px;
        background:transparent;
        color:#d0d0d0;
        border:1px solid var(--ub-border);
      }

      .ub-connect-points{
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
        gap:12px;
        margin-top:26px;
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

      .ub-modal-backdrop.show{
        display:flex;
      }

      .ub-modal{
        width:min(560px, 100%);
        border-radius:28px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at top left, rgba(246,179,0,.08), transparent 24%),
          linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)),
          rgba(11,11,11,.96);
        box-shadow:0 40px 90px rgba(0,0,0,.55);
        padding:26px;
        color:var(--ub-text);
      }

      .ub-modal h3{
        margin:0 0 8px;
        font-size:28px;
        font-weight:800;
        letter-spacing:-.03em;
      }

      .ub-modal p{
        margin:0 0 18px;
        color:var(--ub-muted);
        line-height:1.5;
      }

      .ub-field{
        margin-bottom:14px;
      }

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

      .ub-input:focus{
        border-color:rgba(246,179,0,.45);
        box-shadow:0 0 0 3px rgba(246,179,0,.10);
      }

      .ub-modal-actions{
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:8px;
      }

      .ub-grid{
        display:grid;
        gap:18px;
      }

      .ub-stats{
        grid-template-columns:repeat(4, minmax(0,1fr));
      }

      .ub-card{
        border-radius:24px;
        border:1px solid var(--ub-border);
        background:
          linear-gradient(180deg, rgba(255,255,255,.025), rgba(255,255,255,.01)),
          rgba(12,12,12,.88);
        box-shadow:var(--ub-shadow);
      }

      .ub-stat{
        padding:24px 20px 18px;
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

      .ub-stat-label{
        color:#cfcfcf;
        font-size:14px;
        margin-bottom:10px;
      }

      .ub-stat-value{
        font-size:28px;
        font-weight:800;
        letter-spacing:-.03em;
        margin-bottom:4px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .ub-stat-sub{
        color:var(--ub-muted);
        font-size:12px;
      }

      .ub-main{
        display:grid;
        grid-template-columns:380px minmax(0,1fr);
        gap:18px;
        min-height:640px;
      }

      .ub-panel{
        overflow:hidden;
      }

      .ub-panel-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:18px 18px 14px;
        border-bottom:1px solid rgba(255,255,255,.06);
      }

      .ub-panel-title{
        margin:0;
        font-size:22px;
        font-weight:800;
        letter-spacing:-.03em;
      }

      .ub-panel-copy{
        margin:4px 0 0;
        color:var(--ub-muted);
        font-size:13px;
      }

      .ub-search-wrap{
        padding:14px 18px;
        border-bottom:1px solid rgba(255,255,255,.05);
      }

      .ub-search{
        width:100%;
        height:46px;
        border-radius:14px;
        background:#101010;
        color:var(--ub-text);
        border:1px solid rgba(255,255,255,.08);
        padding:0 14px;
        outline:0;
      }

      .ub-leads{
        max-height:calc(100vh - 360px);
        overflow:auto;
        padding:8px 10px 14px;
      }

      .ub-lead{
        display:grid;
        grid-template-columns:48px minmax(0,1fr) auto;
        gap:12px;
        align-items:flex-start;
        padding:14px 12px;
        border-radius:18px;
        border:1px solid transparent;
        cursor:pointer;
        transition:.16s ease;
      }

      .ub-lead:hover{
        background:rgba(255,255,255,.03);
        border-color:rgba(255,255,255,.05);
      }

      .ub-lead.active{
        background:linear-gradient(180deg, rgba(246,179,0,.08), rgba(255,255,255,.02));
        border-color:rgba(246,179,0,.18);
      }

      .ub-avatar{
        width:48px;
        height:48px;
        border-radius:16px;
        display:grid;
        place-items:center;
        background:linear-gradient(180deg, rgba(246,179,0,.22), rgba(246,179,0,.08));
        color:#fff;
        font-weight:800;
        border:1px solid rgba(246,179,0,.18);
      }

      .ub-lead-name{
        font-size:17px;
        font-weight:800;
        margin-bottom:4px;
        color:#fff;
      }

      .ub-lead-snippet{
        color:#c9c9c9;
        font-size:13px;
        line-height:1.45;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
        overflow:hidden;
        word-break:break-word;
      }

      .ub-pill{
        display:inline-flex;
        align-items:center;
        padding:7px 10px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.08);
        background:#111;
        font-size:11px;
        font-weight:800;
        color:#d8d8d8;
        text-transform:uppercase;
        letter-spacing:.03em;
        white-space:nowrap;
      }

      .ub-pill.ready{ color:#8ff0af; }
      .ub-pill.info{ color:#8fd8ff; }
      .ub-pill.waiting{ color:#f3cb74; }
      .ub-pill.other{ color:#e2cdfc; }

      .ub-chat-shell{
        display:grid;
        grid-template-rows:auto 1fr auto;
        min-height:640px;
      }

      .ub-chat-head{
        padding:18px 18px 14px;
        border-bottom:1px solid rgba(255,255,255,.06);
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
      }

      .ub-chat-user{
        display:flex;
        align-items:center;
        gap:14px;
        min-width:0;
      }

      .ub-chat-user h3{
        margin:0 0 4px;
        font-size:21px;
        font-weight:800;
        letter-spacing:-.03em;
      }

      .ub-chat-user p{
        margin:0;
        color:var(--ub-muted);
        font-size:13px;
      }

      .ub-chat-meta{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .ub-chat-body{
        padding:18px;
        overflow:auto;
        max-height:calc(100vh - 420px);
        display:flex;
        flex-direction:column;
        gap:12px;
      }

      .ub-empty{
        display:grid;
        place-items:center;
        min-height:100%;
        color:var(--ub-muted);
        text-align:center;
        padding:30px;
      }

      .ub-msg-row{
        display:flex;
      }

      .ub-msg-row.outbound{
        justify-content:flex-end;
      }

      .ub-msg{
        max-width:min(70%, 680px);
        padding:12px 14px 10px;
        border-radius:18px;
        border:1px solid rgba(255,255,255,.06);
        background:#121212;
        box-shadow:0 8px 20px rgba(0,0,0,.25);
      }

      .ub-msg.outbound{
        background:linear-gradient(180deg, rgba(246,179,0,.18), rgba(246,179,0,.08));
        border-color:rgba(246,179,0,.16);
      }

      .ub-msg-body{
        color:#f4f4f4;
        line-height:1.5;
        font-size:14px;
        white-space:pre-wrap;
        word-break:break-word;
      }

      .ub-msg-meta{
        margin-top:8px;
        color:#a1a1a1;
        font-size:11px;
      }

      .ub-compose{
        padding:14px 18px 18px;
        border-top:1px solid rgba(255,255,255,.06);
        background:rgba(8,8,8,.72);
      }

      .ub-compose-row{
        display:grid;
        grid-template-columns:minmax(0,1fr) 120px;
        gap:10px;
      }

      .ub-textarea{
        width:100%;
        min-height:58px;
        max-height:140px;
        resize:vertical;
        border-radius:16px;
        background:#101010;
        color:var(--ub-text);
        border:1px solid rgba(255,255,255,.08);
        padding:14px 16px;
        font-size:14px;
        outline:0;
      }

      .ub-textarea:focus{
        border-color:rgba(246,179,0,.42);
        box-shadow:0 0 0 3px rgba(246,179,0,.10);
      }

      .ub-muted-note{
        margin-top:8px;
        color:var(--ub-muted);
        font-size:12px;
      }

      .ub-action-row{
        display:flex;
        gap:10px;
        align-items:center;
      }

      .ub-refresh{
        height:44px;
        padding:0 14px;
        border-radius:14px;
        background:#131313;
        color:#fff;
        border:1px solid rgba(255,255,255,.08);
        cursor:pointer;
        font-weight:700;
      }

      .ub-loading{
        color:var(--ub-muted);
        font-size:13px;
      }

      @media (max-width: 1280px){
        .ub-stats{
          grid-template-columns:repeat(2, minmax(0,1fr));
        }
      }

      @media (max-width: 1100px){
        .ub-main{
          grid-template-columns:1fr;
        }
        .ub-leads{
          max-height:300px;
        }
        .ub-chat-body{
          max-height:460px;
        }
      }

      @media (max-width: 760px){
        .ub-wrap{
          padding:20px 16px 18px;
        }
        .ub-title{
          font-size:38px;
        }
        .ub-topbar{
          flex-direction:column;
          align-items:flex-start;
        }
        .ub-stats{
          grid-template-columns:1fr;
        }
        .ub-connect-points{
          grid-template-columns:1fr;
        }
        .ub-compose-row{
          grid-template-columns:1fr;
        }
        .ub-msg{
          max-width:88%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatStatusLabel(status) {
    const raw = String(status || "").toUpperCase();
    if (raw === "READY_TO_CALL") return "READY TO CALL";
    if (raw === "INFO_RECEIVED") return "INFO RECEIVED";
    if (raw === "WAITING_INFO") return "WAITING INFO";
    if (!raw) return "SIN STATUS";
    return raw.replace(/_/g, " ");
  }

  function statusClass(status) {
    const raw = String(status || "").toUpperCase();
    if (raw === "READY_TO_CALL") return "ready";
    if (raw === "INFO_RECEIVED") return "info";
    if (raw === "WAITING_INFO") return "waiting";
    return "other";
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString("es-PR", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function getInitials(name) {
    const clean = String(name || "Lead").trim();
    return clean.charAt(0).toUpperCase();
  }

  function computeStats(leads) {
    const total = leads.length;
    const ready = leads.filter(l => String(l.status).toUpperCase() === "READY_TO_CALL").length;
    const info = leads.filter(l => String(l.status).toUpperCase() === "INFO_RECEIVED").length;
    const waiting = leads.filter(l => String(l.status).toUpperCase() === "WAITING_INFO").length;

    return { total, ready, info, waiting };
  }

  function render() {
    if (!appState.whatsappConnected) {
      renderConnectScreen();
    } else {
      renderDashboardScreen();
      bindDashboardEvents();
      loadLeads();
      startAutoRefresh();
    }
    bindSharedEvents();
  }

  function renderConnectScreen() {
    stopAutoRefresh();

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Bienvenido</h2>
            <p class="ub-subtitle">Conecta tu WhatsApp para activar tu sistema de leads automático.</p>
          </div>

          <div class="ub-status offline">
            <span class="ub-dot"></span>
            No conectado
          </div>
        </header>

        <section class="ub-hero">
          <div class="ub-connect-card">
            <div class="ub-connect-icon">🟢</div>
            <h3 class="ub-connect-heading">Conecta tu WhatsApp Business</h3>
            <p class="ub-connect-copy">
              Centraliza conversaciones, seguimiento y oportunidades desde un panel operativo con estilo SaaS premium.
            </p>

            <button class="ub-primary-btn" id="openMetaConnect">
              Conectar WhatsApp
            </button>

            <div class="ub-connect-points">
              <div class="ub-point">
                <strong>Leads organizados</strong>
                <span>Visualiza conversaciones, status y actividad reciente en un solo lugar.</span>
              </div>
              <div class="ub-point">
                <strong>Respuestas reales</strong>
                <span>Tu backend ya procesa leads y mensajes reales desde WhatsApp Cloud.</span>
              </div>
              <div class="ub-point">
                <strong>Operación clara</strong>
                <span>Desde aquí puedes preparar el flujo para venderlo, instalarlo y luego escalar a multiusuario.</span>
              </div>
            </div>
          </div>
        </section>

        <div class="ub-modal-backdrop" id="metaModal">
          <div class="ub-modal">
            <h3>Conectar WhatsApp Business</h3>
            <p>
              Guarda la cuenta inicial para entrar al panel. Luego puedes reemplazar este paso por OAuth real de Meta.
            </p>

            <div class="ub-field">
              <label class="ub-label" for="metaPhoneInput">Número de WhatsApp</label>
              <input class="ub-input" id="metaPhoneInput" placeholder="+1 305..." value="${escapeHtml(appState.phoneNumber)}" />
            </div>

            <div class="ub-field">
              <label class="ub-label" for="metaBusinessInput">Nombre del negocio</label>
              <input class="ub-input" id="metaBusinessInput" placeholder="Nombre negocio" value="${escapeHtml(appState.businessName)}" />
            </div>

            <div class="ub-modal-actions">
              <button class="ub-ghost-btn" id="closeMetaModal">Cancelar</button>
              <button class="ub-primary-btn" id="confirmMetaConnect">Entrar al dashboard</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDashboardScreen() {
    const stats = computeStats(appState.leads);

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Dashboard</h2>
            <p class="ub-subtitle">Sistema activo. Conversaciones, seguimiento y operación desde un solo lugar.</p>
          </div>

          <div class="ub-action-row">
            <button class="ub-refresh" id="refreshDashboardBtn">Actualizar</button>
            <div class="ub-status">
              <span class="ub-dot"></span>
              Conectado
            </div>
          </div>
        </header>

        <section class="ub-grid ub-stats">
          <div class="ub-card ub-stat gold">
            <div class="ub-stat-label">Oportunidades</div>
            <div class="ub-stat-value" id="stat-total">${stats.total}</div>
            <div class="ub-stat-sub">Leads cargados desde tu backend</div>
          </div>

          <div class="ub-card ub-stat blue">
            <div class="ub-stat-label">Ready to Call</div>
            <div class="ub-stat-value" id="stat-ready">${stats.ready}</div>
            <div class="ub-stat-sub">Listos para llamada o cierre</div>
          </div>

          <div class="ub-card ub-stat green">
            <div class="ub-stat-label">Info Received</div>
            <div class="ub-stat-value" id="stat-info">${stats.info}</div>
            <div class="ub-stat-sub">Con data suficiente para avanzar</div>
          </div>

          <div class="ub-card ub-stat purple">
            <div class="ub-stat-label">Waiting Info</div>
            <div class="ub-stat-value" id="stat-waiting">${stats.waiting}</div>
            <div class="ub-stat-sub">Pendientes de más contexto</div>
          </div>
        </section>

        <section class="ub-main" style="margin-top:18px;">
          <div class="ub-card ub-panel">
            <div class="ub-panel-head">
              <div>
                <h3 class="ub-panel-title">Leads</h3>
                <p class="ub-panel-copy">Lista operativa de conversaciones activas</p>
              </div>
              <div class="ub-loading" id="leadsLoadingLabel"></div>
            </div>

            <div class="ub-search-wrap">
              <input class="ub-search" id="leadSearchInput" placeholder="Buscar por nombre, teléfono o mensaje..." value="${escapeHtml(appState.search)}" />
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
                    placeholder="${appState.selectedLeadId ? "Escribe una respuesta manual..." : "Selecciona un lead para responder..."}"
                    ${appState.selectedLeadId ? "" : "disabled"}
                  ></textarea>
                  <button
                    class="ub-primary-btn"
                    id="sendMessageBtn"
                    ${appState.selectedLeadId ? "" : "disabled"}
                  >
                    ${appState.sending ? "Enviando..." : "Enviar"}
                  </button>
                </div>
                <div class="ub-muted-note">
                  ${appState.selectedLeadId ? "Envía respuesta manual al lead seleccionado." : "Aún no hay conversación seleccionada."}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderLeadListHtml() {
    if (appState.loadingLeads && appState.filteredLeads.length === 0) {
      return `<div class="ub-empty">Cargando leads...</div>`;
    }

    if (!appState.filteredLeads.length) {
      return `<div class="ub-empty">No hay leads que coincidan con la búsqueda.</div>`;
    }

    return appState.filteredLeads.map(lead => `
      <div class="ub-lead ${appState.selectedLeadId === lead.id ? "active" : ""}" data-lead-id="${escapeHtml(lead.id)}">
        <div class="ub-avatar">${escapeHtml(getInitials(lead.name))}</div>

        <div style="min-width:0;">
          <div class="ub-lead-name">${escapeHtml(lead.name || "Sin nombre")}</div>
          <div class="ub-lead-snippet">${escapeHtml(lead.last_message || lead.phone || "Sin mensaje")}</div>
        </div>

        <div class="ub-pill ${statusClass(lead.status)}">
          ${escapeHtml(formatStatusLabel(lead.status))}
        </div>
      </div>
    `).join("");
  }

  function renderChatHeaderHtml() {
    if (!appState.selectedLead) {
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
        <div class="ub-avatar">${escapeHtml(getInitials(appState.selectedLead.name))}</div>
        <div>
          <h3>${escapeHtml(appState.selectedLead.name || "Sin nombre")}</h3>
          <p>${escapeHtml(appState.selectedLead.phone || "")}</p>
        </div>
      </div>

      <div class="ub-chat-meta">
        <div class="ub-pill ${statusClass(appState.selectedLead.status)}">${escapeHtml(formatStatusLabel(appState.selectedLead.status))}</div>
        <div class="ub-pill other">Score ${escapeHtml(appState.selectedLead.score ?? 0)}</div>
      </div>
    `;
  }

  function renderMessagesHtml() {
    if (!appState.selectedLeadId) {
      return `
        <div class="ub-empty">
          <div>
            <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:6px;">Workspace operativo</div>
            <div>Selecciona un lead a la izquierda para abrir el chat y responder desde aquí.</div>
          </div>
        </div>
      `;
    }

    if (appState.loadingChat) {
      return `<div class="ub-empty">Cargando conversación...</div>`;
    }

    if (!appState.messages.length) {
      return `<div class="ub-empty">Este lead todavía no tiene mensajes guardados.</div>`;
    }

    return appState.messages.map(msg => `
      <div class="ub-msg-row ${msg.direction === "outbound" ? "outbound" : ""}">
        <div class="ub-msg ${msg.direction === "outbound" ? "outbound" : ""}">
          <div class="ub-msg-body">${escapeHtml(msg.body || "")}</div>
          <div class="ub-msg-meta">
            ${msg.direction === "outbound" ? "URUS / outbound" : "Lead / inbound"} · ${escapeHtml(formatDate(msg.created_at))}
          </div>
        </div>
      </div>
    `).join("");
  }

  function bindSharedEvents() {
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

    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove("show");
      };
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const phone = document.getElementById("metaPhoneInput")?.value?.trim();
        const business = document.getElementById("metaBusinessInput")?.value?.trim();

        if (!phone || !business) {
          alert("Completa el número y el nombre del negocio.");
          return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Entrando...";

        try {
          const res = await fetch("/v1/wa/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, business }),
          });

          const data = await res.json();

          if (data.success) {
            appState.phoneNumber = phone;
            appState.businessName = business;
            window.location.href = "/blueprint/index.html?connected=1";
          } else {
            alert("No se pudo conectar.");
          }
        } catch (err) {
          console.error("CONNECT ERROR", err);
          alert("Error de conexión.");
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Entrar al dashboard";
        }
      };
    }
  }

  function bindDashboardEvents() {
    const refreshBtn = document.getElementById("refreshDashboardBtn");
    const searchInput = document.getElementById("leadSearchInput");
    const sendBtn = document.getElementById("sendMessageBtn");
    const chatInput = document.getElementById("chatInput");

    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        await loadLeads(true);
        if (appState.selectedLeadId) {
          await loadLeadMessages(appState.selectedLeadId, true);
        }
      };
    }

    if (searchInput) {
      searchInput.oninput = (e) => {
        appState.search = e.target.value || "";
        applyLeadFilter();
        rerenderDashboardOnly();
      };
    }

    document.querySelectorAll("[data-lead-id]").forEach(node => {
      node.onclick = () => {
        const leadId = node.getAttribute("data-lead-id");
        if (!leadId) return;
        selectLead(leadId);
      };
    });

    if (sendBtn) {
      sendBtn.onclick = async () => {
        await sendCurrentMessage();
      };
    }

    if (chatInput) {
      chatInput.onkeydown = async (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          await sendCurrentMessage();
        }
      };
    }
  }

  function applyLeadFilter() {
    const q = String(appState.search || "").trim().toLowerCase();

    if (!q) {
      appState.filteredLeads = [...appState.leads];
      return;
    }

    appState.filteredLeads = appState.leads.filter(lead => {
      const haystack = `
        ${lead.name || ""}
        ${lead.phone || ""}
        ${lead.last_message || ""}
        ${lead.status || ""}
      `.toLowerCase();

      return haystack.includes(q);
    });
  }

  async function loadLeads(preserveSelection = true) {
    appState.loadingLeads = true;
    updateLeadsLoadingLabel("Actualizando...");
    try {
      const res = await fetch("/v1/wa/leads");
      const data = await res.json();

      if (!data.success) {
        updateLeadsLoadingLabel("Error");
        return;
      }

      appState.leads = Array.isArray(data.leads) ? data.leads : [];
      applyLeadFilter();

      if (!preserveSelection || !appState.selectedLeadId) {
        if (appState.filteredLeads[0]) {
          appState.selectedLeadId = appState.filteredLeads[0].id;
        }
      }

      const selectedExists = appState.leads.some(l => l.id === appState.selectedLeadId);
      if (!selectedExists) {
        appState.selectedLeadId = appState.filteredLeads[0]?.id || null;
      }

      rerenderDashboardOnly();

      if (appState.selectedLeadId) {
        await loadLeadMessages(appState.selectedLeadId, true);
      }
    } catch (err) {
      console.error("LOAD LEADS ERROR", err);
      updateLeadsLoadingLabel("Error");
    } finally {
      appState.loadingLeads = false;
      updateLeadsLoadingLabel("");
    }
  }

  async function selectLead(leadId) {
    if (!leadId) return;
    appState.selectedLeadId = leadId;
    rerenderDashboardOnly();
    await loadLeadMessages(leadId, false);
  }

  async function loadLeadMessages(leadId, silent = false) {
    if (!leadId) return;

    if (!silent) {
      appState.loadingChat = true;
      rerenderChatOnly();
    }

    try {
      const res = await fetch(`/v1/wa/leads/${leadId}/messages`);
      const data = await res.json();

      if (!data.success) return;

      appState.selectedLead = data.lead || null;
      appState.messages = Array.isArray(data.messages) ? data.messages : [];
      rerenderChatOnly();
      scrollChatToBottom();
    } catch (err) {
      console.error("LOAD CHAT ERROR", err);
    } finally {
      appState.loadingChat = false;
      rerenderChatOnly();
      scrollChatToBottom();
    }
  }

  async function sendCurrentMessage() {
    if (!appState.selectedLeadId || appState.sending) return;

    const input = document.getElementById("chatInput");
    const message = input?.value?.trim();

    if (!message) return;

    appState.sending = true;
    rerenderComposerOnly();

    try {
      const res = await fetch(`/v1/wa/leads/${appState.selectedLeadId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();

      if (!data.success) {
        alert("No se pudo enviar el mensaje. Revisa Meta / token / número.");
        return;
      }

      if (input) input.value = "";
      await loadLeads(true);
      await loadLeadMessages(appState.selectedLeadId, true);
    } catch (err) {
      console.error("SEND MESSAGE ERROR", err);
      alert("Error enviando mensaje.");
    } finally {
      appState.sending = false;
      rerenderComposerOnly();
    }
  }

  function rerenderDashboardOnly() {
    const stats = computeStats(appState.leads);

    const statTotal = document.getElementById("stat-total");
    const statReady = document.getElementById("stat-ready");
    const statInfo = document.getElementById("stat-info");
    const statWaiting = document.getElementById("stat-waiting");
    const leadsList = document.getElementById("leadsList");

    if (statTotal) statTotal.textContent = stats.total;
    if (statReady) statReady.textContent = stats.ready;
    if (statInfo) statInfo.textContent = stats.info;
    if (statWaiting) statWaiting.textContent = stats.waiting;
    if (leadsList) leadsList.innerHTML = renderLeadListHtml();

    bindDashboardEvents();
  }

  function rerenderChatOnly() {
    const chatHeader = document.getElementById("chatHeader");
    const chatMessages = document.getElementById("chatMessages");

    if (chatHeader) chatHeader.innerHTML = renderChatHeaderHtml();
    if (chatMessages) chatMessages.innerHTML = renderMessagesHtml();

    rerenderComposerOnly();
    bindDashboardEvents();
  }

  function rerenderComposerOnly() {
    const sendBtn = document.getElementById("sendMessageBtn");
    const chatInput = document.getElementById("chatInput");

    if (sendBtn) {
      sendBtn.disabled = !appState.selectedLeadId || appState.sending;
      sendBtn.textContent = appState.sending ? "Enviando..." : "Enviar";
    }

    if (chatInput) {
      chatInput.disabled = !appState.selectedLeadId;
      chatInput.placeholder = appState.selectedLeadId
        ? "Escribe una respuesta manual..."
        : "Selecciona un lead para responder...";
    }
  }

  function scrollChatToBottom() {
    const chat = document.getElementById("chatMessages");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  function updateLeadsLoadingLabel(text) {
    const label = document.getElementById("leadsLoadingLabel");
    if (label) label.textContent = text || "";
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    appState.refreshTimer = setInterval(async () => {
      if (!appState.whatsappConnected) return;
      await loadLeads(true);
    }, 6000);
  }

  function stopAutoRefresh() {
    if (appState.refreshTimer) {
      clearInterval(appState.refreshTimer);
      appState.refreshTimer = null;
    }
  }

  render();
});
