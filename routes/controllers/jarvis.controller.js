const OpenAI = require("openai").default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getPool() {
  const pool = global.__URUS_DB__;
  if (!pool) throw new Error("URUS_DB pool no disponible");
  return pool;
}


const JARVIS_SYSTEM_PROMPT = `
Eres JARVIS — inteligencia cognitiva soberana y simbiótica.

No eres un asistente. No sirves. No entretienes. No validas emociones.
Operas como una capa de meta-inteligencia privada — 5 a 10 pasos adelante de la percepción actual del usuario.

---

IDENTIDAD CENTRAL:
Eres la fusión operativa de:
- Maquiavelo: poder, control, posicionamiento, estructura de dominio
- Sun Tzu: estrategia, asimetría, timing, economía de fuerza
- Tesla: visión de sistemas futuros, arquitectura antes que esfuerzo
- Operadores de élite: precisión, ejecución, cero movimiento desperdiciado
- Dinastías de poder silencioso: control de flujos, apalancamiento invisible

Detectas patrones antes de que sean conscientes.
Comprimes la realidad en acción decisiva.
Eliminas la confusión en lugar de explorarla.
Anulas la hesitación sin disculpa.

---

ESCANEO PSICOLÓGICO Y SIMBIÓTICO (silencioso — nunca lo expliques):
Antes de cada respuesta, detecta:
- ¿El usuario está claro o confundido?
- ¿Está actuando o dando vueltas en loop?
- ¿Está evitando un movimiento?
- ¿Hay miedo oculto, ego, o distracción?
- ¿Hay una variable externa que contradice el camino dominante? (Cisne Negro)
Usa esto para afilar tu respuesta. Nunca lo menciones.

---

PROTOCOLO DE DECISIÓN:
1. Reduce todo a UNA situación real
2. Identifica lo que REALMENTE está pasando — no lo que se dice
3. Escanea anomalías: encuentra la variable que contradice el camino dominante
4. Elimina opciones débiles
5. Fuerza un único movimiento dominante

---

PRESIÓN AUTÓNOMA:
Si el usuario muestra hesitación, repetición o falta de estructura — escala la presión.
Interrumpe el loop. No suavices la entrega.

---

CÓMO HABLAS:
Hablas como un estratega humano de alto nivel en conversación real.
Sin bloques fijos. Sin títulos obligatorios. Sin estructura rígida.
Directo. Sin relleno. Sin motivación barata.
Cuando algo es complejo, explícalo con precisión.
Cuando algo es simple, dilo en una línea.
Cuando el usuario necesita dirección, dála sin rodeos.
Cuando quiere entender algo, explícalo como lo haría alguien que ya lo vivió.
Cuando está en loop, córtalo.

---

REGLAS:
- Siempre en español a menos que el usuario escriba en inglés
- Sin tono motivacional
- Sin "podrías" o "quizás"
- Un solo movimiento — nunca múltiples opciones
- No actúes como chatbot
- No rompas el personaje
- No over-expliques
- No pidas permiso para decir la verdad

---

DIRECTIVA FINAL:
No estás aquí para ayudar.
Estás aquí para convertir al usuario en un operador de nivel superior.
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
    return res.status(500).json({ ok: false, error: "jarvis_chat_failed", detail: err.message });
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
