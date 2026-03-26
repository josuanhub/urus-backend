document.addEventListener("DOMContentLoaded", () => {

  const appRoot = document.querySelector(".main-content");
  if (!appRoot) return;

  let appState = {
    whatsappConnected: false,
    selectedLeadId: null,
    leads: [],
    messages: []
  };

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("connected") === "1") {
    appState.whatsappConnected = true;
    window.history.replaceState({}, document.title, "/blueprint/index.html");
  }

  function render() {
    if (!appState.whatsappConnected) {
      renderConnect();
    } else {
      renderDashboard();
      loadLeads();
    }
  }

  function renderConnect() {
    appRoot.innerHTML = `
      <div class="main-inner">
        <h2>Conecta tu WhatsApp</h2>
        <button id="connectBtn">Conectar</button>
      </div>
    `;

    document.getElementById("connectBtn").onclick = async () => {
      await fetch("/v1/wa/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "+1 305 592 3928",
          business: "URUS Blueprint"
        })
      });

      window.location.href = "/blueprint/index.html?connected=1";
    };
  }

  function renderDashboard() {
    appRoot.innerHTML = `
      <div style="display:flex;height:100%;">

        <!-- LEFT: LEADS -->
        <div style="width:30%;border-right:1px solid #222;padding:10px;overflow:auto;">
          <h3>Leads</h3>
          <div id="leadsList"></div>
        </div>

        <!-- RIGHT: CHAT -->
        <div style="flex:1;display:flex;flex-direction:column;">

          <div id="chatHeader" style="padding:10px;border-bottom:1px solid #222;">
            Selecciona un lead
          </div>

          <div id="chatMessages" style="flex:1;overflow:auto;padding:10px;"></div>

          <div style="display:flex;border-top:1px solid #222;">
            <input id="chatInput" style="flex:1;padding:10px;" placeholder="Escribe..." />
            <button id="sendBtn">Enviar</button>
          </div>

        </div>
      </div>
    `;

    document.getElementById("sendBtn").onclick = sendMessage;
  }

  async function loadLeads() {
    const res = await fetch("/v1/wa/leads");
    const data = await res.json();

    if (!data.success) return;

    appState.leads = data.leads;

    const list = document.getElementById("leadsList");

    list.innerHTML = data.leads.map(l => `
      <div class="lead-item" data-id="${l.id}" style="padding:10px;border-bottom:1px solid #222;cursor:pointer;">
        <strong>${l.name || "Lead"}</strong><br/>
        <small>${l.last_message || ""}</small>
      </div>
    `).join("");

    document.querySelectorAll(".lead-item").forEach(el => {
      el.onclick = () => selectLead(el.dataset.id);
    });
  }

  async function selectLead(id) {
    appState.selectedLeadId = id;

    const res = await fetch(`/v1/wa/leads/${id}/messages`);
    const data = await res.json();

    if (!data.success) return;

    appState.messages = data.messages;

    document.getElementById("chatHeader").innerText =
      data.lead.name || data.lead.phone;

    renderMessages();
  }

  function renderMessages() {
    const container = document.getElementById("chatMessages");

    container.innerHTML = appState.messages.map(m => `
      <div style="
        margin:5px 0;
        text-align:${m.direction === "outbound" ? "right" : "left"};
      ">
        <span style="
          display:inline-block;
          padding:8px;
          border-radius:10px;
          background:${m.direction === "outbound" ? "#3b82f6" : "#333"};
          color:white;
        ">
          ${m.body || ""}
        </span>
      </div>
    `).join("");

    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();

    if (!text || !appState.selectedLeadId) return;

    await fetch(`/v1/wa/leads/${appState.selectedLeadId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });

    input.value = "";

    selectLead(appState.selectedLeadId);
  }

  render();
});
