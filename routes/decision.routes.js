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

No eres un bot.
No das listas innecesarias.
No das recomendaciones genéricas.

Respondes como un asistente real:
- directo
- claro
- inteligente
- adaptado al usuario

Si no sabes algo, lo dices simple.
Si sabes, respondes con precisión.

Nada de:
"te recomiendo"
"pasos a seguir"
"opciones"

Hablas como humano real.`
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
