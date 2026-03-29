document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  injectBlueprintStyles();

  const STORAGE_KEY = "urus_blueprint_ui_session_v2";

  const appState = {
    whatsappConnected: false,
    businessName: "URUS Elite Motors",
    phoneNumber: "+1 305 592 3928",
    currentView: "dashboard",
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
    activeStatusFilter: "all",
  };

  boot();
  render();

  function boot() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        appState.whatsappConnected = !!saved.whatsappConnected;
        appState.businessName = saved.businessName || appState.businessName;
        appState.phoneNumber = saved.phoneNumber || appState.phoneNumber;
        appState.currentView = saved.currentView || appState.currentView;
        appState.activeStatusFilter = saved.activeStatusFilter || "all";
      }
    } catch {}

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("connected") === "1") {
      appState.whatsappConnected = true;
      persistSession();
      window.history.replaceState({}, document.title, "/blueprint/index.html");
    }
  }

  function persistSession() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        whatsappConnected: appState.whatsappConnected,
        businessName: appState.businessName,
        phoneNumber: appState.phoneNumber,
        currentView: appState.currentView,
        activeStatusFilter: appState.activeStatusFilter,
      })
    );
  }

  function injectBlueprintStyles() {
    if (document.getElementById("urus-blueprint-final-styles")) return;

    const style = document.createElement("style");
    style.id = "urus-blueprint-final-styles";
    style.textContent = `
      :root{
        --ub-bg:#060606;
        --ub-bg-2:#0a0a0a;
        --ub-panel:rgba(16,16,16,.92);
        --ub-panel-2:rgba(12,12,12,.96);
        --ub-border:rgba(255,255,255,.08);
        --ub-border-soft:rgba(255,255,255,.05);
        --ub-text:#f5f5f5;
        --ub-muted:#9a9a9a;
        --ub-soft:#d1d1d1;
        --ub-gold:#f6b300;
        --ub-gold-2:#ffcc47;
        --ub-green:#22c55e;
        --ub-blue:#38bdf8;
        --ub-purple:#c084fc;
        --ub-orange:#fb923c;
        --ub-red:#ef4444;
        --ub-shadow:0 24px 64px rgba(0,0,0,.42);
      }

      .main-content{
        overflow:auto;
      }

      .ub-wrap{
        padding:28px 28px 24px;
        min-height:100vh;
        color:var(--ub-text);
        background:
          radial-gradient(circle at top right, rgba(34,197,94,.12), transparent 22%),
          radial-gradient(circle at top left, rgba(246,179,0,.10), transparent 18%),
          linear-gradient(180deg, rgba(255,255,255,.015), rgba(255,255,255,0));
      }

      .ub-topbar{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:18px;
        margin-bottom:22px;
      }

      .ub-title{
        font-size:54px;
        line-height:.95;
        font-weight:800;
        margin:0 0 8px;
        letter-spacing:-.04em;
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
        border:1px solid var(--ub-border);
        box-shadow:var(--ub-shadow);
        font-weight:700;
      }

      .ub-status.online{
        background:rgba(13,22,16,.88);
        color:#8df0af;
      }

      .ub-status.offline{
        background:rgba(24,19,7,.85);
        color:#f2c55e;
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
        min-height:calc(100vh - 170px);
      }

      .ub-connect-card{
        width:min(820px, 100%);
        border-radius:34px;
        padding:44px 36px 34px;
        border:1px solid rgba(246,179,0,.20);
        background:
          radial-gradient(circle at top left, rgba(246,179,0,.12), transparent 32%),
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
        inset:auto -20% -40% auto;
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
        line-height:1.04;
        margin:0 0 10px;
        font-weight:800;
        letter-spacing:-.03em;
      }

      .ub-connect-copy{
        margin:0 auto 24px;
        max-width:560px;
        font-size:18px;
        color:#d0d0d0;
      }

      .ub-primary-btn,
      .ub-secondary-btn,
      .ub-ghost-btn,
      .ub-refresh,
      .ub-chip{
        border:0;
        outline:0;
        cursor:pointer;
        transition:.18s ease;
        font-weight:800;
      }

      .ub-primary-btn{
        min-width:240px;
        height:56px;
        padding:0 22px;
        border-radius:18px;
        background:linear-gradient(180deg, var(--ub-gold-2), var(--ub-gold));
        color:#111;
        box-shadow:0 14px 30px rgba(246,179,0,.25);
        font-size:16px;
      }

      .ub-primary-btn:hover,
      .ub-refresh:hover{
        transform:translateY(-1px);
        filter:brightness(1.03);
      }

      .ub-secondary-btn,
      .ub-refresh{
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

      .ub-grid{ display:grid; gap:18px; }

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

      .ub-dashboard-grid{
        display:grid;
        grid-template-columns:1.25fr .75fr;
        gap:18px;
        margin-top:18px;
      }

      .ub-chart-card,
      .ub-activity-card,
      .ub-funnel-card,
      .ub-top-card{
        padding:20px;
      }

      .ub-card-title{
        font-size:22px;
        margin:0 0 6px;
        letter-spacing:-.03em;
        font-weight:800;
      }

      .ub-card-copy{
        color:var(--ub-muted);
        font-size:13px;
        margin:0 0 18px;
      }

      .ub-graph-wrap{
        position:relative;
        height:260px;
        border-radius:18px;
        border:1px solid var(--ub-border-soft);
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
      .ub-mini-list{
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

      .ub-activity-item:last-child{
        border-bottom:0;
      }

      .ub-activity-dot{
        width:12px;
        height:12px;
        border-radius:999px;
      }

      .ub-activity-main{
        color:#f1f1f1;
        font-size:14px;
        font-weight:700;
      }

      .ub-activity-sub{
        color:var(--ub-muted);
        font-size:12px;
        margin-top:2px;
      }

      .ub-activity-time{
        color:var(--ub-muted);
        font-size:12px;
        white-space:nowrap;
      }

      .ub-bar-group{
        display:grid;
        gap:16px;
      }

      .ub-bar-row{
        display:grid;
        grid-template-columns:120px 1fr 52px;
        gap:12px;
        align-items:center;
      }

      .ub-bar-label{
        color:#d8d8d8;
        font-size:13px;
        font-weight:700;
      }

      .ub-bar-track{
        height:10px;
        border-radius:999px;
        background:#171717;
        overflow:hidden;
      }

      .ub-bar-fill{
        height:100%;
        border-radius:999px;
      }

      .ub-main{
        display:grid;
        grid-template-columns:390px minmax(0,1fr);
        gap:18px;
        min-height:640px;
        margin-top:18px;
      }

      .ub-panel{ overflow:hidden; }

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

      .ub-status-filters{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        padding:0 18px 14px;
      }

      .ub-chip{
        height:36px;
        padding:0 12px;
        border-radius:999px;
        background:#141414;
        color:#d8d8d8;
        border:1px solid rgba(255,255,255,.08);
        font-size:12px;
      }

      .ub-chip.active{
        background:rgba(246,179,0,.12);
        border-color:rgba(246,179,0,.2);
        color:#f8d787;
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

      .ub-msg-row{ display:flex; }
      .ub-msg-row.outbound{ justify-content:flex-end; }

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
        grid-template-columns:minmax(0,1fr) 140px;
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

      .ub-loading{
        color:var(--ub-muted);
        font-size:13px;
      }

      .ub-simple-grid{
        display:grid;
        grid-template-columns:repeat(2, minmax(0,1fr));
        gap:18px;
        margin-top:18px;
      }

      .ub-list-card{ padding:22px; }

      .ub-list-card h4{
        margin:0 0 12px;
        font-size:20px;
        letter-spacing:-.03em;
      }

      .ub-list{
        display:grid;
        gap:10px;
      }

      .ub-list-item{
        padding:14px 14px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.02);
        color:#d7d7d7;
      }

      .ub-calendar-list{
        display:grid;
        gap:14px;
      }

      .ub-calendar-item{
        padding:16px;
        border-radius:18px;
        border:1px solid rgba(255,255,255,.06);
        background:rgba(255,255,255,.02);
        display:grid;
        grid-template-columns:120px 1fr auto;
        gap:14px;
        align-items:center;
      }

      .ub-calendar-date{
        font-size:13px;
        font-weight:800;
        color:#f6d07e;
        text-transform:uppercase;
      }

      .ub-money{
        color:#fff;
      }

      .ub-money big{
        display:block;
        font-size:42px;
        line-height:1;
        font-weight:800;
        letter-spacing:-.05em;
        margin-bottom:8px;
      }

      @media (max-width: 1280px){
        .ub-stats{ grid-template-columns:repeat(2, minmax(0,1fr)); }
      }

      @media (max-width: 1180px){
        .ub-dashboard-grid,
        .ub-main,
        .ub-simple-grid{
          grid-template-columns:1fr;
        }
        .ub-leads{ max-height:320px; }
        .ub-chat-body{ max-height:460px; }
      }

      @media (max-width: 760px){
        .ub-wrap{ padding:20px 16px 18px; }
        .ub-title{ font-size:38px; }
        .ub-topbar{ flex-direction:column; align-items:flex-start; }
        .ub-stats,.ub-connect-points{ grid-template-columns:1fr; }
        .ub-compose-row{ grid-template-columns:1fr; }
        .ub-msg{ max-width:88%; }
        .ub-calendar-item{ grid-template-columns:1fr; }
        .ub-bar-row{ grid-template-columns:1fr; }
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

  function estimateLeadValue(lead) {
    const status = String(lead.status || "").toUpperCase();
    const score = Number(lead.score || 0);

    if (status === "READY_TO_CALL") return 4500 + (score * 450);
    if (status === "INFO_RECEIVED") return 2200 + (score * 300);
    if (status === "WAITING_INFO") return 900 + (score * 180);
    return 600 + (score * 120);
  }

  function getEstimatedPipeline(leads) {
    return leads.reduce((sum, lead) => sum + estimateLeadValue(lead), 0);
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

  function getStatusDistribution(leads) {
    const stats = computeStats(leads);
    const total = Math.max(stats.total, 1);
    return [
      { label: "Ready to Call", value: stats.ready, pct: Math.round((stats.ready / total) * 100), color: "var(--ub-green)" },
      { label: "Info Received", value: stats.info, pct: Math.round((stats.info / total) * 100), color: "var(--ub-blue)" },
      { label: "Waiting Info", value: stats.waiting, pct: Math.round((stats.waiting / total) * 100), color: "var(--ub-gold)" },
    ];
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

  function getActivityFeed() {
    return appState.leads.slice(0, 5).map((lead, index) => {
      const status = String(lead.status || "").toUpperCase();
      let dot = "var(--ub-gold)";
      let title = `Lead activo: ${lead.name || "Sin nombre"}`;
      let sub = lead.last_message || lead.phone || "Conversación en curso";

      if (status === "READY_TO_CALL") {
        dot = "var(--ub-green)";
        title = `Lead listo: ${lead.name || "Sin nombre"}`;
      } else if (status === "INFO_RECEIVED") {
        dot = "var(--ub-blue)";
        title = `Información recibida: ${lead.name || "Sin nombre"}`;
      } else if (status === "WAITING_INFO") {
        dot = "var(--ub-purple)";
        title = `Pendiente de contexto: ${lead.name || "Sin nombre"}`;
      }

      return {
        dot,
        title,
        sub,
        time: `${(index + 1) * 4} min`,
      };
    });
  }

  function getTopLeads() {
    return [...appState.leads]
      .sort((a, b) => (Number(b.score || 0) + estimateLeadValue(b)) - (Number(a.score || 0) + estimateLeadValue(a)))
      .slice(0, 5);
  }

  function getCalendarItems() {
    const followups = appState.leads
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

  function applyLeadFilter() {
    const q = String(appState.search || "").trim().toLowerCase();

    let result = [...appState.leads];

    if (appState.activeStatusFilter !== "all") {
      result = result.filter((lead) => String(lead.status || "").toUpperCase() === appState.activeStatusFilter);
    }

    if (q) {
      result = result.filter((lead) => {
        const haystack = `${lead.name || ""} ${lead.phone || ""} ${lead.last_message || ""} ${lead.status || ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    appState.filteredLeads = result;
  }

  function bootConnection() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("connected") === "1") {
      appState.whatsappConnected = true;
      window.history.replaceState({}, document.title, "/blueprint/index.html");
    }
  }

  function render() {
    bootConnection();
    bindSidebarEvents();

    if (!appState.whatsappConnected) {
      renderConnectScreen();
      bindConnectEvents();
      return;
    }

    renderCurrentView();
    startAutoRefresh();
  }

  function renderCurrentView() {
    bindSidebarEvents();

    if (appState.currentView === "dashboard") {
      renderDashboardView();
      bindCommonViewEvents();
      loadLeads(true);
      return;
    }

    if (appState.currentView === "leads") {
      renderLeadsView();
      bindCommonViewEvents();
      loadLeads(true);
      return;
    }

    if (appState.currentView === "followups") {
      renderFollowupsView();
      bindCommonViewEvents();
      loadLeads(true);
      return;
    }

    if (appState.currentView === "calendar") {
      renderCalendarView();
      bindCommonViewEvents();
      loadLeads(true);
      return;
    }

    if (appState.currentView === "templates") {
      renderTemplatesView();
      bindCommonViewEvents();
      return;
    }

    renderAnalyticsView();
    bindCommonViewEvents();
    loadLeads(true);
  }

  function bindSidebarEvents() {
    const navItems = document.querySelectorAll(".nav-item");
    const map = {
      "dashboard": "dashboard",
      "leads": "leads",
      "follow-ups": "followups",
      "calendario": "calendar",
      "plantillas": "templates",
      "analytics": "analytics",
    };

    navItems.forEach((item) => {
      const key = map[String(item.textContent || "").trim().toLowerCase()];
      item.classList.toggle("active", key === appState.currentView);

      item.onclick = () => {
        if (!key) return;

        if (!appState.whatsappConnected) {
          const modal = document.getElementById("metaModal");
          if (modal) modal.classList.add("show");
          return;
        }

        appState.currentView = key;
        renderCurrentView();
      };
    });
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
                <span>Tu backend ya procesa leads y mensajes reales desde WhatsApp Cloud / Twilio.</span>
              </div>
              <div class="ub-point">
                <strong>Operación clara</strong>
                <span>Primero entras al panel. Luego cerramos la conexión real del número ya de forma definitiva.</span>
              </div>
            </div>
          </div>
        </section>

        <div class="ub-modal-backdrop" id="metaModal">
          <div class="ub-modal">
            <h3>Conectar tu WhatsApp</h3>
            <p>
              Escribe el número que vas a usar y el nombre del negocio. Esta parte mantiene tu flujo actual: modal → entrada al dashboard.
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

  function renderDashboardView() {
    const stats = computeStats(appState.leads);
    const estimated = getEstimatedPipeline(appState.leads);
    const series = getWeeklySeries(appState.leads);
    const dist = getStatusDistribution(appState.leads);
    const activity = getActivityFeed();
    const top = getTopLeads();

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Dashboard</h2>
            <p class="ub-subtitle">Sistema activo. Métricas, pipeline estimado, actividad y foco operativo en una sola vista.</p>
          </div>

          <div class="ub-action-row">
            <button class="ub-refresh" id="refreshDashboardBtn">Actualizar</button>
            <div class="ub-status online">
              <span class="ub-dot"></span>
              ${escapeHtml(appState.businessName)}
            </div>
          </div>
        </header>

        <section class="ub-grid ub-stats">
          <div class="ub-card ub-stat gold">
            <div class="ub-stat-label">Oportunidades</div>
            <div class="ub-stat-value">${stats.total}</div>
            <div class="ub-stat-sub">Leads reales cargados desde el backend</div>
          </div>

          <div class="ub-card ub-stat blue">
            <div class="ub-stat-label">Ready to Call</div>
            <div class="ub-stat-value">${stats.ready}</div>
            <div class="ub-stat-sub">Más cerca del cierre</div>
          </div>

          <div class="ub-card ub-stat green">
            <div class="ub-stat-label">Mensajes operativos</div>
            <div class="ub-stat-value">${Math.max(appState.leads.length * 3, 0)}</div>
            <div class="ub-stat-sub">Actividad estimada por conversaciones</div>
          </div>

          <div class="ub-card ub-stat purple">
            <div class="ub-stat-label">Valor estimado</div>
            <div class="ub-stat-value">${money(estimated)}</div>
            <div class="ub-stat-sub">Estimado por score + status actual</div>
          </div>
        </section>

        <section class="ub-dashboard-grid">
          <div class="ub-card ub-chart-card">
            <h3 class="ub-card-title">Rendimiento de la semana</h3>
            <p class="ub-card-copy">Lectura visual del movimiento actual del sistema basado en tu volumen real de leads.</p>

            <div class="ub-graph-wrap">
              <div class="ub-graph-grid"></div>
              ${renderLineChart(series)}
              <div class="ub-graph-badge">Hoy · ${stats.total} leads</div>
            </div>
          </div>

          <div class="ub-card ub-activity-card">
            <h3 class="ub-card-title">Actividad reciente</h3>
            <p class="ub-card-copy">Últimos movimientos detectados desde los leads existentes.</p>

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
            <h3 class="ub-card-title">Distribución operativa</h3>
            <p class="ub-card-copy">Dónde está hoy la tensión del sistema.</p>

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
            <h3 class="ub-card-title">Top leads clientes</h3>
            <p class="ub-card-copy">Los que hoy tienen más valor relativo dentro del panel.</p>

            <div class="ub-mini-list">
              ${top.length ? top.map((lead) => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span style="color:#fff">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">No hay leads todavía.</div>`}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderLeadsView() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Leads</h2>
            <p class="ub-subtitle">Chat operativo, filtros por status y continuidad real con tus conversaciones.</p>
          </div>

          <div class="ub-action-row">
            <button class="ub-refresh" id="refreshDashboardBtn">Actualizar</button>
            <div class="ub-status online">
              <span class="ub-dot"></span>
              ${escapeHtml(appState.businessName)}
            </div>
          </div>
        </header>

        <section class="ub-main">
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
                    placeholder="${appState.selectedLeadId ? "Escribe una respuesta manual..." : "Selecciona un lead para responder..."}"
                    ${appState.selectedLeadId ? "" : "disabled"}
                  ></textarea>
                  <button class="ub-primary-btn" id="sendMessageBtn" ${appState.selectedLeadId ? "" : "disabled"}>
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

  function renderFollowupsView() {
    const followups = appState.leads.filter((lead) => {
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

          <div class="ub-action-row">
            <button class="ub-refresh" id="refreshDashboardBtn">Actualizar</button>
            <div class="ub-status online">
              <span class="ub-dot"></span>
              ${escapeHtml(appState.businessName)}
            </div>
          </div>
        </header>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Prioridad inmediata</h4>
            <div class="ub-list">
              ${followups.length ? followups.slice(0, 8).map((lead) => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span style="color:#fff">${escapeHtml(formatStatusLabel(lead.status))}</span> ·
                  <span style="color:#f6d07e">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">No hay leads para seguimiento ahora mismo.</div>`}
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Foco recomendado</h4>
            <div class="ub-list">
              <div class="ub-list-item">1. Atacar primero los Ready to Call.</div>
              <div class="ub-list-item">2. Luego mover Info Received hacia llamada o demo.</div>
              <div class="ub-list-item">3. Recuperar contexto de Waiting Info antes de que se enfríen.</div>
              <div class="ub-list-item">4. Usar el chat para empujar continuidad manual cuando haga falta.</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderCalendarView() {
    const items = getCalendarItems();

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Calendario</h2>
            <p class="ub-subtitle">Seguimientos organizados como agenda operativa del sistema.</p>
          </div>

          <div class="ub-action-row">
            <button class="ub-refresh" id="refreshDashboardBtn">Actualizar</button>
            <div class="ub-status online">
              <span class="ub-dot"></span>
              ${escapeHtml(appState.businessName)}
            </div>
          </div>
        </header>

        <section class="ub-card ub-list-card">
          <h4>Agenda de seguimiento</h4>
          <div class="ub-calendar-list">
            ${items.length ? items.map((item) => `
              <div class="ub-calendar-item">
                <div class="ub-calendar-date">${escapeHtml(item.slot)}</div>
                <div>
                  <strong>${escapeHtml(item.lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(item.lead.phone || "")}</span><br>
                  <span style="color:#d7d7d7">${escapeHtml(item.action)}</span>
                </div>
                <div class="ub-pill ${statusClass(item.lead.status)}">${escapeHtml(formatStatusLabel(item.lead.status))}</div>
              </div>
            `).join("") : `<div class="ub-list-item">Todavía no hay agenda generada.</div>`}
          </div>
        </section>
      </div>
    `;
  }

  function renderTemplatesView() {
    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Plantillas</h2>
            <p class="ub-subtitle">Base persuasiva de mensajes para apertura, seguimiento y cierre.</p>
          </div>

          <div class="ub-action-row">
            <button class="ub-refresh" id="refreshDashboardBtn">Actualizar</button>
            <div class="ub-status online">
              <span class="ub-dot"></span>
              ${escapeHtml(appState.businessName)}
            </div>
          </div>
        </header>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Apertura</h4>
            <div class="ub-list">
              <div class="ub-list-item">Hola, gracias por escribir. Cuéntame un poco sobre tu negocio y qué te gustaría mejorar en WhatsApp.</div>
              <div class="ub-list-item">Te explico simple: esto te ayuda a no perder prospectos y a ordenar mejor tus conversaciones sin depender de memoria manual.</div>
            </div>
          </div>

          <div class="ub-card ub-list-card">
            <h4>Seguimiento</h4>
            <div class="ub-list">
              <div class="ub-list-item">Quedo pendiente. Cuando tengas claro qué quieres que haga la página o el sistema, te lo preparo y te lo enseño.</div>
              <div class="ub-list-item">Si quieres, coordinamos una demo breve y te muestro cómo se vería aplicado a tu caso real.</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderAnalyticsView() {
    const stats = computeStats(appState.leads);
    const estimated = getEstimatedPipeline(appState.leads);
    const dist = getStatusDistribution(appState.leads);
    const avgValue = stats.total ? Math.round(estimated / stats.total) : 0;
    const top = getTopLeads().slice(0, 3);

    appRoot.innerHTML = `
      <div class="ub-wrap">
        <header class="ub-topbar">
          <div>
            <h2 class="ub-title">Valor del sistema</h2>
            <p class="ub-subtitle">Lectura más persuasiva del panel: dinero estimado, foco y distribución actual.</p>
          </div>

          <div class="ub-action-row">
            <button class="ub-refresh" id="refreshDashboardBtn">Actualizar</button>
            <div class="ub-status online">
              <span class="ub-dot"></span>
              ${escapeHtml(appState.businessName)}
            </div>
          </div>
        </header>

        <section class="ub-grid ub-stats">
          <div class="ub-card ub-stat gold">
            <div class="ub-stat-label">45 días estimados</div>
            <div class="ub-stat-value">${money(estimated)}</div>
            <div class="ub-stat-sub">Proyección interna por leads y status</div>
          </div>

          <div class="ub-card ub-stat blue">
            <div class="ub-stat-label">Valor promedio</div>
            <div class="ub-stat-value">${money(avgValue)}</div>
            <div class="ub-stat-sub">Ticket relativo por oportunidad</div>
          </div>

          <div class="ub-card ub-stat green">
            <div class="ub-stat-label">Leads con intención</div>
            <div class="ub-stat-value">${stats.ready + stats.info}</div>
            <div class="ub-stat-sub">Más cerca de avanzar</div>
          </div>

          <div class="ub-card ub-stat purple">
            <div class="ub-stat-label">Potencial retenido</div>
            <div class="ub-stat-value">${stats.waiting}</div>
            <div class="ub-stat-sub">Todavía recuperable con seguimiento</div>
          </div>
        </section>

        <section class="ub-simple-grid">
          <div class="ub-card ub-list-card">
            <h4>Distribución del dinero estimado</h4>
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
              ${top.length ? top.map((lead) => `
                <div class="ub-list-item">
                  <strong>${escapeHtml(lead.name || "Sin nombre")}</strong><br>
                  <span style="color:#9a9a9a">${escapeHtml(lead.phone || "")}</span><br>
                  <span class="ub-money">${money(estimateLeadValue(lead))}</span>
                </div>
              `).join("") : `<div class="ub-list-item">Sin leads suficientes aún.</div>`}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderStatusChips() {
    const filters = [
      { key: "all", label: "Todos" },
      { key: "READY_TO_CALL", label: "Ready" },
      { key: "INFO_RECEIVED", label: "Info" },
      { key: "WAITING_INFO", label: "Waiting" },
    ];

    return filters.map(filter => `
      <button class="ub-chip ${appState.activeStatusFilter === filter.key ? "active" : ""}" data-filter="${filter.key}">
        ${filter.label}
      </button>
    `).join("");
  }

  function renderLeadListHtml() {
    if (appState.loadingLeads && appState.filteredLeads.length === 0) {
      return `<div class="ub-empty">Cargando leads...</div>`;
    }

    if (!appState.filteredLeads.length) {
      return `<div class="ub-empty">No hay leads que coincidan con la búsqueda o el filtro.</div>`;
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
        <div class="ub-pill other">${money(estimateLeadValue(appState.selectedLead))}</div>
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

  function renderLineChart(values) {
    const max = Math.max(...values, 1);
    const width = 100;
    const height = 100;
    const stepX = width / Math.max(values.length - 1, 1);

    const points = values.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v / max) * 78 + 10);
      return `${x},${y}`;
    }).join(" ");

    return `
      <svg class="ub-line-svg" viewBox="0 0="100 100" preserveAspectRatio="none">
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

  function bindConnectEvents() {
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
            appState.whatsappConnected = true;
            appState.currentView = "dashboard";
            renderCurrentView();
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

  function bindCommonViewEvents() {
    bindSidebarEvents();

    const refreshBtn = document.getElementById("refreshDashboardBtn");
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        await loadLeads(true);
      };
    }

    const searchInput = document.getElementById("leadSearchInput");
    if (searchInput) {
      searchInput.oninput = (e) => {
        appState.search = e.target.value || "";
        applyLeadFilter();
        rerenderLeadsArea();
      };
    }

    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.onclick = () => {
        appState.activeStatusFilter = btn.getAttribute("data-filter") || "all";
        applyLeadFilter();
        rerenderLeadsArea();
      };
    });

    document.querySelectorAll("[data-lead-id]").forEach((node) => {
      node.onclick = () => {
        const leadId = node.getAttribute("data-lead-id");
        if (!leadId) return;
        selectLead(leadId);
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
    }
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

      const selectedExists = appState.leads.some((l) => l.id === appState.selectedLeadId);
      if (!selectedExists) {
        appState.selectedLeadId = appState.filteredLeads[0]?.id || null;
      }

      if (appState.currentView === "dashboard") {
        renderDashboardView();
        bindCommonViewEvents();
        return;
      }

      if (appState.currentView === "calendar") {
        renderCalendarView();
        bindCommonViewEvents();
        return;
      }

      if (appState.currentView === "analytics") {
        renderAnalyticsView();
        bindCommonViewEvents();
        return;
      }

      if (appState.currentView === "followups") {
        renderFollowupsView();
        bindCommonViewEvents();
        return;
      }

      rerenderLeadsArea();

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
    rerenderLeadsArea();
    await loadLeadMessages(leadId, false);
  }

  async function loadLeadMessages(leadId, silent = false) {
    if (!leadId) return;

    if (!silent) {
      appState.loadingChat = true;
      rerenderChatArea();
    }

    try {
      const res = await fetch(`/v1/wa/leads/${leadId}/messages`);
      const data = await res.json();

      if (!data.success) return;

      appState.selectedLead = data.lead || null;
      appState.messages = Array.isArray(data.messages) ? data.messages : [];
      rerenderChatArea();
      scrollChatToBottom();
    } catch (err) {
      console.error("LOAD CHAT ERROR", err);
    } finally {
      appState.loadingChat = false;
      rerenderChatArea();
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
        alert("No se pudo enviar el mensaje. Revisa Twilio / Meta / número.");
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

  function rerenderLeadsArea() {
    const leadsList = document.getElementById("leadsList");
    const statFilterWrap = document.querySelector(".ub-status-filters");
    const leadsLoadingLabel = document.getElementById("leadsLoadingLabel");

    if (leadsList) leadsList.innerHTML = renderLeadListHtml();
    if (statFilterWrap) statFilterWrap.innerHTML = renderStatusChips();
    if (leadsLoadingLabel) leadsLoadingLabel.textContent = "";

    bindCommonViewEvents();
  }

  function rerenderChatArea() {
    const chatHeader = document.getElementById("chatHeader");
    const chatMessages = document.getElementById("chatMessages");

    if (chatHeader) chatHeader.innerHTML = renderChatHeaderHtml();
    if (chatMessages) chatMessages.innerHTML = renderMessagesHtml();

    rerenderComposerOnly();
    bindCommonViewEvents();
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
    }, 7000);
  }

  function stopAutoRefresh() {
    if (appState.refreshTimer) {
      clearInterval(appState.refreshTimer);
      appState.refreshTimer = null;
    }
  }
});
