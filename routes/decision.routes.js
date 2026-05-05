const express = require("express");
const router = express.Router();

router.post("/run", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.json({ output: "", action: "ignore" });
    }

    // 🔥 DECISION LAYER SIMPLE (núcleo)
    const decision = {
      shouldRespond: true,
      mode: "chat"
    };

    // 🧠 LLAMADA A TU IA (usa tu función actual)
    const output = await global.callAI({
      system: `
Eres JARVIS.

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

Hablas como humano real.
      `,
      user: message
    });

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
