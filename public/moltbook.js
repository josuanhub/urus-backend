const API_URL = "https://urus-backend-production.up.railway.app/v1/moltbook/message";

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const chat = document.getElementById("chat");

  const text = input.value;
  if (!text) return;

  addMessage("user", text);
  input.value = "";

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: text
    })
  });

  const data = await res.json();

  addMessage("orion", data.reply || "Sin respuesta");
}

function addMessage(role, text) {
  const chat = document.getElementById("chat");

  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerText = text;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
