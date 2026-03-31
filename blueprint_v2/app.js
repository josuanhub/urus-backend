/**
 * URUS OS - Core Application Logic
 */

const appState = {
    user: null,
    leads: [],
    selectedLead: null,
    waNumber: "12603006906",
    refreshInterval: null
};

// Selectores de Pantalla
const screens = {
    login: document.getElementById('login-screen'),
    connect: document.getElementById('connect-screen'),
    dashboard: document.getElementById('dashboard-screen')
};

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

// 1. Manejo de Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Simulación de validación (Integrar con tu endpoint /v1/auth/login)
    console.log("Iniciando secuencia de autenticación...");
    
    // Aquí podrías llamar a fetch('/v1/auth/login', {method: 'POST', ...})
    // Por ahora saltamos a la conexión por flujo comercial
    showScreen('connect');
    startQRSimulation();
});

// 2. Simulación de Conexión de WhatsApp (Frontend Real)
function startQRSimulation() {
    const qrContainer = document.getElementById('qr-container');
    // En producción, aquí pides el QR a tu servidor
    setTimeout(() => {
        qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=URUS_CONNECT_${appState.waNumber}" alt="QR">`;
        
        // Simular que el usuario escanea después de 3 segundos
        setTimeout(() => {
            showScreen('dashboard');
            initDashboard();
        }, 3000);
    }, 1500);
}

// 3. Inicialización del Dashboard
async function initDashboard() {
    await fetchLeads();
    // Refresh automático cada 10 segundos
    appState.refreshInterval = setInterval(fetchLeads, 10000);
}

async function fetchLeads() {
    try {
        // Conexión a tu API real
        const response = await fetch('/v1/wa/leads');
        const data = await response.json();
        
        if (data.success) {
            appState.leads = data.leads;
            renderLeads();
        }
    } catch (err) {
        console.error("Error cargando leads:", err);
    }
}

function renderLeads() {
    const container = document.getElementById('leads-container');
    const countBadge = document.getElementById('leads-count');
    countBadge.innerText = appState.leads.length;

    container.innerHTML = appState.leads.map(lead => `
        <div class="lead-item ${appState.selectedLead?.id === lead.id ? 'active' : ''}" onclick="selectLead('${lead.id}')">
            <h4>${lead.name || lead.phone}</h4>
            <p>${lead.last_message || 'Sin mensajes'}</p>
            <small style="color: ${lead.status === 'hot' ? '#ff4b2b' : '#00e5ff'}">${lead.status.toUpperCase()}</small>
        </div>
    `).join('');
}

window.selectLead = function(id) {
    const lead = appState.leads.find(l => l.id == id);
    if (!lead) return;

    appState.selectedLead = lead;
    document.getElementById('no-selection').classList.add('hidden');
    document.getElementById('active-chat').classList.remove('hidden');
    document.getElementById('active-lead-name').innerText = lead.name || lead.phone;
    
    renderMessages(lead.id);
    renderLeads(); // Actualizar clase active
};

async function renderMessages(leadId) {
    const chatContainer = document.getElementById('chat-messages');
    // En producción: fetch(`/v1/wa/messages/${leadId}`)
    // Simulación:
    const mockMessages = [
        { type: 'in', text: 'Hola, me interesa el sistema URUS.' },
        { type: 'out', text: 'Excelente. ¿Qué volumen de leads manejas actualmente?' }
    ];

    chatContainer.innerHTML = mockMessages.map(m => `
        <div class="msg ${m.type}">${m.text}</div>
    `).join('');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 4. Envío de Mensajes
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !appState.selectedLead) return;

    // UI Optimista
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML += `<div class="msg out">${text}</div>`;
    input.value = '';
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        await fetch('/v1/wa/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: appState.selectedLead.phone,
                message: text
            })
        });
    } catch (err) {
        console.error("Error al enviar:", err);
    }
}
