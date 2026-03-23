async function runHunterBrain({ pool, sendWhatsAppText, sources }) {

  const rawLeads = await sources.getLeads(); // tu fuente (maps/ig/etc)

  for (let raw of rawLeads) {

    // -------- SCAN (normaliza)
    const business = normalize(raw);

    // -------- DETECT
    const pain = detectPain(business);

    // -------- SCORE
    const scoreData = calculateScore(business, pain);

    if (scoreData.score < 6) continue;

    // -------- DECIDE
    const decision = decideAction(scoreData, pain);

    if (decision.decision !== "CONTACTAR") continue;

    // -------- ACT (mensaje)
    const message = buildMessage(business, pain, decision);

    try {
      await sendWhatsAppText({
        to: business.phone,
        text: message
      });
    } catch (e) {
      console.error("WA send error:", e.message);
      continue;
    }

    // -------- GUARDAR
    await pool.query(`
      INSERT INTO hunter_leads
      (business_name, phone, tipo_negocio, canal_principal, nivel_actividad,
       dolores, nivel_dolor, tipo_dolor, score, prioridad, status,
       last_contact_at, next_follow_up_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CONTACTED', now(), now() + interval '1 day')
      ON CONFLICT (phone) DO NOTHING
    `, [
      business.name,
      business.phone,
      business.tipo_negocio,
      business.canal_principal,
      business.nivel_actividad,
      pain.dolores_detectados,
      pain.nivel_dolor,
      pain.tipo_dolor,
      scoreData.score,
      scoreData.prioridad
    ]);

  }
}

/* ================= HELPERS ================= */

function normalize(raw) {
  return {
    name: raw.name,
    phone: raw.phone,
    tipo_negocio: raw.tipo_negocio || "general",
    canal_principal: raw.canal_principal || "whatsapp",
    nivel_actividad: raw.nivel_actividad || "medio",
    has_whatsapp: !!raw.phone,
    responds_fast: raw.responds_fast ?? false,
    reviews_unanswered: raw.reviews_unanswered ?? false,
    bad_reviews: raw.bad_reviews ?? false
  };
}

function detectPain(b) {
  let dolores = [];

  if (!b.responds_fast) dolores.push("respuesta_lenta");
  if (b.reviews_unanswered) dolores.push("mal_engagement");
  if (b.has_whatsapp) dolores.push("sin_sistema");
  if (b.bad_reviews) dolores.push("friccion_cliente");

  return {
    dolores_detectados: dolores,
    nivel_dolor: Math.min(10, dolores.length * 2),
    tipo_dolor: "perdida_leads"
  };
}

function calculateScore(b, pain) {
  let score = 0;

  if (b.tipo_negocio === "clinic") score += 3;
  if (b.tipo_negocio === "real_estate") score += 3;

  if (pain.nivel_dolor >= 6) score += 3;
  if (b.nivel_actividad === "alto") score += 2;
  if (b.has_whatsapp) score += 1;

  return {
    score,
    razon: "volumen + dolor + canal",
    prioridad: score >= 8 ? "alta" : score >= 6 ? "media" : "baja"
  };
}

function decideAction(scoreData, pain) {
  if (scoreData.score >= 8 && pain.nivel_dolor >= 6) {
    return { decision: "CONTACTAR", estrategia: "directo" };
  }
  if (scoreData.score >= 6) {
    return { decision: "CONTACTAR", estrategia: "suave" };
  }
  return { decision: "IGNORAR" };
}

function buildMessage(b, pain, decision) {
  if (decision.estrategia === "directo") {
    return `Vi algo rápido en tu negocio—

¿se les están escapando clientes por mensajes no respondidos?`;
  }

  return `Hola ${b.name},

¿cómo están manejando los mensajes de clientes ahora mismo?`;
}

module.exports = { runHunterBrain };
