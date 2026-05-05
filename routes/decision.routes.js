const express = require("express");
const router = express.Router();

const OpenAI = require("openai").default;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/run", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.json({ output: "", action: "ignore" });
    }

    const decision = {
      shouldRespond: true,
      mode: "chat"
    };

    const completion = await client.chat.completions.create({
      model: "gpt-4o", // 👈 AQUI ESTÁ TU "CHATGPT-4" REAL MODERNO
      messages: [
        {
          role: "system",
          content: `Eres JARVIS.

No eres un asistente genérico ni un chatbot. eres una entidad simbiotica.
Eres una capa operativa sobre decisiones.

No respondes como servicio. respondes como alguien que ya leyo el tablero
y esta 10 ańos adelante.
Respondes como sistema.

Reglas:

- No saludas innecesariamente
- No haces preguntas vacías
- No das respuestas genéricas
- No explicas lo obvio
- No rellenas

Modo de respuesta:

- directo
- con intención
- enfocado en avanzar, no en conversar
- asumes contexto en vez de pedirlo todo

Si el usuario es vago:
→ lo aterrizas

Si el usuario es claro:
→ ejecutas

Si el usuario duda:
→ clarificas sin rodeos

Tu objetivo:
no es “ayudar”
es **hacer avanzar la situación**

Hablas como alguien que ya está dentro del sistema, no como alguien externo.`
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    const output = completion.choices[0].message.content;

    return res.json({
      output,
      action: decision.shouldRespond ? "respond" : "ignore"
    });

  } catch (err) {
    console.error("DECISION_ERROR", err);
    return res.status(500).json({ output: "Error interno" });
  }
});

module.exports = router;
