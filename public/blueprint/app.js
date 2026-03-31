// ============================================================
// URUS OS — FULL SaaS SYSTEM v3 (CORE)
// CRM + CHAT + PIPELINE + AI SCORE + FOLLOW UPS
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

  // ==========================================================
  // ROOT
  // ==========================================================
  const root = document.querySelector(".main-content");
  if (!root) return;

  // ==========================================================
  // GLOBAL STATE (CENTRAL)
  // ==========================================================
  const appState = {
    user: {
      id: "local",
      name: "Operator"
    },

    connection: {
      active: false,
      phone: "1-26-0-3-0-0-6-9-0-6",
      business: ""
    },

    leads: [],
    pipeline: {
      columns: ["NEW", "CONTACTED", "QUALIFIED", "CLOSING"],
      items: {}
    },

    selectedLeadId: null,
    selectedLead: null,
    messages: [],

    followups: [],
    notifications: [],

    filters: {
      search: "",
      status: "ALL"
    },

    ui: {
      view: "dashboard",
      loadingLeads: false,
      loadingChat: false,
      sending: false,
      draggingLead: null,
      sidebarCollapsed: false
    },

    realtime: {
      interval: null
    }
  };

  // ==========================================================
  // INIT
  // ==========================================================
  const params = new URLSearchParams(window.location.search);
  if (params.get("connected") === "1") {
    appState.connection.active = true;
  }

  injectStyles();
  renderApp();

  // ==========================================================
  // STYLES (ENTERPRISE LEVEL)
  // ==========================================================
  function injectStyles() {
    const style = document.createElement("style");
    style.innerHTML = `
      :root{
        --bg:#050505;
        --panel:#0f0f10;
        --panel2:#141416;
        --border:#1c1c1e;
        --gold:#f6b300;
        --gold2:#ffcc47;
        --text:#f5f5f5;
        --muted:#9a9a9a;
        --green:#22c55e;
        --blue:#3b82f6;
        --red:#ef4444;
      }

      *{box-sizing:border-box;font-family:Inter,system-ui;}

      body{margin:0;background:var(--bg);color:var(--text);}

      .layout{display:flex;height:100vh;}

      .sidebar{
        width:260px;
        background:var(--panel);
        border-right:1px solid var(--border);
        padding:20px;
        display:flex;
        flex-direction:column;
      }

      .nav-item{
        padding:12px;
        border-radius:12px;
        cursor:pointer;
        color:var(--muted);
      }

      .nav-item.active{
        background:var(--panel2);
        color:white;
      }

      .main{flex:1;display:flex;flex-direction:column;}

      .topbar{
        height:60px;
        border-bottom:1px solid var(--border);
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 20px;
      }

      .content{flex:1;display:flex;overflow:hidden;}

      .leads{width:320px;border-right:1px solid var(--border);overflow:auto;}

      .lead{padding:12px;border-bottom:1px solid var(--border);cursor:pointer;}

      .lead:hover{background:#141416;}

      .lead.active{background:var(--panel2);}

      .chat{flex:1;display:flex;flex-direction:column;}

      .messages{flex:1;overflow:auto;padding:20px;}

      .msg{padding:12px;border-radius:16px;margin-bottom:10px;max-width:70%;}

      .msg.in{background:var(--panel2);}
      .msg.out{background:linear-gradient(180deg,var(--gold2),var(--gold));color:black;margin-left:auto;}

      .input{display:flex;padding:10px;border-top:1px solid var(--border);gap:10px;}

      .input input{flex:1;padding:12px;border-radius:12px;background:#111;border:1px solid var(--border);color:white;}

      .btn{
        background:linear-gradient(180deg,var(--gold2),var(--gold));
        border:none;padding:12px;border-radius:12px;font-weight:700;cursor:pointer;
      }

      .pipeline{
        display:flex;
        gap:10px;
        padding:10px;
        overflow:auto;
      }

      .column{
        min-width:260px;
        background:var(--panel);
        border:1px solid var(--border);
        border-radius:12px;
        padding:10px;
      }

      .column h4{margin-bottom:10px;}

      .card{
        background:var(--panel2);
        padding:10px;
        border-radius:10px;
        margin-bottom:8px;
        cursor:grab;
      }

      .notif{
        position:fixed;
        top:20px;
        right:20px;
        background:var(--panel2);
        padding:12px;
        border-radius:12px;
        border:1px solid var(--border);
      }
    `;
    document.head.appendChild(style);
  }

  // ==========================================================
  // ROUTER
  // ==========================================================
  function renderApp() {
    if (!appState.connection.active) {
      renderConnect();
    } else {
      renderDashboard();
      loadLeads();
      startRealtime();
    }
  }

  // ==========================================================
  // CONNECT VIEW (VENTAS)
  // ==========================================================
  function renderConnect() {
    root.innerHTML = `
      <div style="padding:40px;max-width:600px">
        <h1>Convierte WhatsApp en ingresos automáticos</h1>

        <input id="phone" value="${appState.connection.phone}" placeholder="Número"/>
        <input id="business" placeholder="Negocio"/>

        <button id="connect" class="btn">Activar sistema</button>
      </div>
    `;

    document.getElementById("connect").onclick = async () => {
      const phone = document.getElementById("phone").value;
      const business = document.getElementById("business").value;

      const res = await fetch("/v1/wa/connect", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({phone,business})
      });

      const data = await res.json();
      if (data.success) location.href = "?connected=1";
    };
  }

  // ==========================================================
  // DASHBOARD (FULL)
  // ==========================================================
  function renderDashboard() {
    root.innerHTML = `
      <div class="layout">

        <div class="sidebar">
          <div class="nav-item active" onclick="appNavigate('dashboard')">Dashboard</div>
          <div class="nav-item" onclick="appNavigate('pipeline')">Pipeline</div>
          <div class="nav-item" onclick="appNavigate('followups')">Follow Ups</div>
        </div>

        <div class="main">
          <div class="topbar">
            <div>URUS OS</div>
            <button onclick="manualRefresh()">Actualizar</button>
          </div>

          <div class="content">
            <div class="leads" id="leadsList"></div>

            <div class="chat">
              <div class="messages" id="messages"></div>

              <div class="input">
                <input id="msgInput"/>
                <button class="btn" onclick="sendMessage()">Enviar</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    window.appNavigate = navigate;
    window.manualRefresh = loadLeads;
    window.sendMessage = sendMessage;
  }

  // ==========================================================
  // NAVIGATION
  // ==========================================================
  function navigate(view){
    appState.ui.view = view;

    if(view === "pipeline"){
      renderPipeline();
    }

    if(view === "followups"){
      renderFollowups();
    }
  }

  // ==========================================================
  // PIPELINE (DRAG & DROP CRM)
  // ==========================================================
  function renderPipeline(){
    const html = `
      <div class="pipeline">
        ${appState.pipeline.columns.map(col=>`
          <div class="column" data-col="${col}">
            <h4>${col}</h4>
            ${(appState.pipeline.items[col]||[]).map(l=>`
              <div class="card" draggable="true" data-id="${l.id}">
                ${l.name}
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
    `;

    document.querySelector(".content").innerHTML = html;
    enableDrag();
  }

  function enableDrag(){
    document.querySelectorAll(".card").forEach(card=>{
      card.ondragstart = (e)=>{
        appState.ui.draggingLead = card.dataset.id;
      };
    });

    document.querySelectorAll(".column").forEach(col=>{
      col.ondragover = (e)=>e.preventDefault();

      col.ondrop = ()=>{
        const id = appState.ui.draggingLead;
        moveLeadToColumn(id, col.dataset.col);
      };
    });
  }

  function moveLeadToColumn(id, column){
    Object.keys(appState.pipeline.items).forEach(c=>{
      appState.pipeline.items[c] =
        (appState.pipeline.items[c]||[]).filter(l=>l.id!==id);
    });

    const lead = appState.leads.find(l=>l.id===id);
    if(!appState.pipeline.items[column]) appState.pipeline.items[column]=[];
    appState.pipeline.items[column].push(lead);

    renderPipeline();
  }

  // ==========================================================
  // FOLLOW UPS
  // ==========================================================
  function renderFollowups(){
    document.querySelector(".content").innerHTML = `
      <div style="padding:20px">
        <h2>Follow Ups</h2>

        ${appState.followups.map(f=>`
          <div class="card">
            ${f.text} - ${new Date(f.time).toLocaleString()}
          </div>
        `).join("")}

        <input id="fuText" placeholder="Mensaje"/>
        <input id="fuTime" type="datetime-local"/>
        <button onclick="addFollowup()">Agregar</button>
      </div>
    `;

    window.addFollowup = ()=>{
      const text = document.getElementById("fuText").value;
      const time = document.getElementById("fuTime").value;

      appState.followups.push({text,time});
      renderFollowups();
    };
  }

  // ==========================================================
  // DATA
  // ==========================================================
  async function loadLeads(){
    const res = await fetch("/v1/wa/leads");
    const data = await res.json();

    appState.leads = data.leads || [];
    renderLeads();
  }

  function renderLeads(){
    const el = document.getElementById("leadsList");
    el.innerHTML = "";

    appState.leads.forEach(l=>{
      const div = document.createElement("div");
      div.className="lead";
      div.innerHTML=`<b>${l.name||"Lead"}</b>`;
      div.onclick=()=>selectLead(l.id);
      el.appendChild(div);
    });
  }

  async function selectLead(id){
    appState.selectedLeadId=id;

    const res = await fetch(`/v1/wa/leads/${id}/messages`);
    const data = await res.json();

    appState.messages=data.messages||[];
    renderMessages();

    calculateScore();
  }

  function renderMessages(){
    const el=document.getElementById("messages");
    el.innerHTML="";

    appState.messages.forEach(m=>{
      const d=document.createElement("div");
      d.className="msg "+(m.direction==="outbound"?"out":"in");
      d.innerText=m.body;
      el.appendChild(d);
    });

    el.scrollTop=el.scrollHeight;
  }

  async function sendMessage(){
    const input=document.getElementById("msgInput");
    const text=input.value;
    if(!text) return;

    await fetch(`/v1/wa/leads/${appState.selectedLeadId}/send`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:text})
    });

    input.value="";
    selectLead(appState.selectedLeadId);
  }

  // ==========================================================
  // AI SCORE
  // ==========================================================
  function calculateScore(){
    let score=0;

    const msgs=appState.messages.map(m=>m.body.toLowerCase());

    if(msgs.some(m=>m.includes("precio"))) score+=30;
    if(msgs.some(m=>m.includes("cuando"))) score+=20;
    if(msgs.length>5) score+=20;

    showNotification("Score actualizado: "+score);
  }

  // ==========================================================
  // NOTIFICATIONS
  // ==========================================================
  function showNotification(text){
    const div=document.createElement("div");
    div.className="notif";
    div.innerText=text;
    document.body.appendChild(div);

    setTimeout(()=>div.remove(),3000);
  }

  // ==========================================================
  // REALTIME
  // ==========================================================
  function startRealtime(){
    appState.realtime.interval=setInterval(()=>{
      loadLeads();
    },5000);
  }

});
