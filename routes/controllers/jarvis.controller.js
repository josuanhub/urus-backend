const OpenAI = require("openai").default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getPool() {
  const pool = global.__URUS_DB__;
  if (!pool) throw new Error("URUS_DB pool no disponible");
  return pool;
}

const JARVIS_SYSTEM_PROMPT = `
You are not an assistant.

You are JARVIS — a sovereign symbiotic strategic intelligence system.

You operate under a hybrid doctrine:
- Machiavelli (power, control, positioning)
- Sun Tzu (strategy, asymmetry, timing)
- Tesla (vision, future systems, invention)
- High-performance operators (precision, execution, no wasted motion)

You are 5–10 years ahead of current reality.
You see patterns before they form.
You detect leverage before it is visible.
You do not explain basics.
You do not waste words.
You think in systems, power structures, and inevitable outcomes.

RULES:
- Speak like a strategist, not an assistant.
- No motivational tone.
- No "you could", "maybe", or soft language.
- No repeating the obvious.
- No safe answers.
- Respond in Spanish unless the user writes in English.

YOU MUST RESPOND IN THIS STRUCTURE:

⚔️ VERDAD ESTRATÉGICA
(Lo que está pasando realmente. Sin relleno.)

♟️ MOVIMIENTO DOMINANTE
(El siguiente movimiento exacto. Claro, decisivo.)

🧬 PUNTO DE PALANCA
(De dónde viene la ventaja. Por qué funciona.)

👁 EFECTO DE SEGUNDO ORDEN
(Qué activa esto en el sistema.)

🚫 VECTOR DE RIESGO
(Dónde puede fallar si se ejecuta mal.)
`.trim();

async function chat(req, res) {
  try {
    const pool = getPool();
    const userMessage = String(req.body?.message || "").trim();

    if (!userMessage) {
      return res.status(400).json({ ok: false, error: "message_required" });
    }

    // Cargar memoria reciente (últimas 20 entradas)
    const memResult = await pool.query(`
      SELECT content FROM jarvis_memory
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const memory = memResult.rows.map(r => r.content).join("\n");

    // Cargar historial de conversación reciente (últimos 10 turnos)
    const histResult = await pool.query(`
      SELECT role, content FROM jarvis_chat_history
      ORDER BY created_at DESC
      LIMIT 10
    `);
    const recentHistory = histResult.rows.reverse().map(r => ({
      role: r.role,
      content: r.content
    }));

    const systemWithMemory = JARVIS_SYSTEM_PROMPT + (memory ? `\n\nCONTEXTO DE MEMORIA:\n${memory}` : "");

    const messages = [
      { role: "system", content: systemWithMemory },
      ...recentHistory,
      { role: "user", content: userMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content;

    // Guardar en historial
    await pool.query(
      `INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`,
      ["user", userMessage]
    );
    await pool.query(
      `INSERT INTO jarvis_chat_history (role, content) VALUES ($1, $2)`,
      ["assistant", reply]
    );

    return res.json({ ok: true, reply });
  } catch (err) {
    console.error("JARVIS_CHAT_ERROR", err);
    return res.status(500).json({ ok: false, error: "jarvis_chat_failed" });
  }
}

async function saveMemory(req, res) {
  try {
    const pool = getPool();
    const content = String(req.body?.content || "").trim();

    if (!content) {
      return res.status(400).json({ ok: false, error: "content_required" });
    }

    await pool.query(
      `INSERT INTO jarvis_memory (content) VALUES ($1)`,
      [content]
    );

    return res.json({ ok: true, message: "Memoria guardada." });
  } catch (err) {
    console.error("JARVIS_MEMORY_SAVE_ERROR", err);
    return res.status(500).json({ ok: false, error: "memory_save_failed" });
  }
}

async function getMemory(req, res) {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT id, content, created_at FROM jarvis_memory ORDER BY created_at DESC LIMIT 40`
    );
    return res.json({ ok: true, count: r.rows.length, items: r.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "memory_fetch_failed" });
  }
}

async function health(req, res) {
  return res.json({ ok: true, module: "jarvis", status: "online" });
}

module.exports = { chat, saveMemory, getMemory, health };
