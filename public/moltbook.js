const API_URL = "https://urus-backend-production.up.railway.app/v1/moltbook/message";

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const chat = document.getElementById("chat");

  const text = input.value.trim();
  if (!text) return;

  addMessage("user", text);
  input.value = "";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: "ORION",
        message: text
      })
    });

    const data = await res.json();

    if (!data.ok) {
      addMessage("orion", "Error: " + JSON.stringify(data));
      return;
    }

    const reply =
      data.output && data.output.reply
        ? data.output.reply
        : "Sin respuesta";

    addMessage("orion", reply);
  } catch (err) {
    addMessage("orion", "Error de conexión: " + err.message);
  }
}

function addMessage(role, text) {
  const chat = document.getElementById("chat");

  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerText = text;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
