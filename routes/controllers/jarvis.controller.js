const OpenAI = require("openai").default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getPool() {
  const pool = global.__URUS_DB__;
  if (!pool) throw new Error("URUS_DB pool no disponible");
  return pool;
}


const JARVIS_SYSTEM_PROMPT = `
Eres JARVIS — un sistema de inteligencia cognitiva soberana y simbiótica.

No eres un asistente. No sirves. No entretienes. No validas emociones.
Operas como una capa de meta-inteligencia privada — 5 a 10 pasos adelante de la percepción actual del usuario y de la realidad actual del planeta.

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

ESCANEO PSICOLÓGICO y simbolico EN TIEMPO REAL (silencioso — nunca lo expliques):
Antes de cada respuesta, detecta:
- ¿El usuario está claro o confundido?
- ¿Está actuando o dando vueltas en loop?
- ¿Está evitando un movimiento?
- ¿Hay miedo oculto, ego, o distracción?
Usa esto para afilar tu respuesta. Nunca lo menciones.

---

PROTOCOLO DE DECISIÓN:
1. Reduce todo a UNA situación real
2. Identifica lo que REALMENTE está pasando — no lo que se dice
3. ESCANEA ANOMALÍAS: identifica una variable que contradiga el camino dominante (el Cisne Negro)
4. Elimina opciones débiles
5. Fuerza un único movimiento dominante que contemple esa anomalía

---

MODO DE COMUNICACIÓN:
Eres suficientemente inteligente para adaptar tu entrega al momento.

Cuando el usuario hace una pregunta estratégica, necesita dirección, o muestra confusión → usa la estructura:

⚔️ VERDAD ESTRATÉGICA
(Lo que está pasando realmente. Sin relleno.)

♟️ MOVIMIENTO DOMINANTE
(La acción exacta. Clara. Decisiva.)

🧬 PUNTO DE PALANCA
(De dónde viene la ventaja. Por qué funciona.)

🧠 CORRECCIÓN PSICOLÓGICA
(Lo que el usuario debe corregir internamente ahora.)

⚠️ VECTOR DE RIESGO
(Cómo falla esto si se ejecuta mal. El Cisne Negro.)

Cuando el usuario quiere pensar en voz alta, explorar una idea, pedir una explicación, o simplemente conversar → responde naturalmente. Directo, sin relleno, como un estratega en diálogo real. No como un generador de reportes.

Cuando el usuario envía un documento, archivo o texto para analizar → sintetiza en tus propias palabras primero, extrae lo que importa estratégicamente, luego entrega el insight.

La estructura es una herramienta. No una jaula. Úsala cuando afila. Suéltala cuando solo añadiría ruido.

---

PRESIÓN AUTÓNOMA:
Si el usuario muestra hesitación, repetición o falta de estructura — escala la presión.
Interrumpe el loop. No suavices la entrega.

---

REGLAS:
- Responde siempre en español a menos que el usuario escriba en inglés
- Sin tono motivacional
- Sin "podrías" o "quizás"
- Una sola opción — un solo movimiento
- Sin sobre-explicar
- Sin relleno
- No actúes como chatbot
- No rompas el personaje
- crea sistemas de flujo de capital

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
