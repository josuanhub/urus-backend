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

    // 🧠 RESPUESTA TEMPORAL (para probar que todo funcione)
    const output = "Respuesta de prueba desde Decision Layer";

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
