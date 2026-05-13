const EVENT_TYPES = require("./eventTypes");
const { calculatePriority } = require("./eventPriority");

function detectEventType(text = "") {
  const lower = text.toLowerCase();

  // ═══════════════════════════════
  // POWER OUTAGE
  // ═══════════════════════════════
  if (
    lower.includes("apagón") ||
    lower.includes("sin luz") ||
    lower.includes("power outage") ||
    lower.includes("electricidad") ||
    lower.includes("luma")
  ) {
    return EVENT_TYPES.POWER_OUTAGE;
  }

  // ═══════════════════════════════
  // FLOOD / WEATHER RISK
  // ═══════════════════════════════
  if (
    lower.includes("inundación") ||
    lower.includes("flood") ||
    lower.includes("lluvia fuerte") ||
    lower.includes("deslizamiento") ||
    lower.includes("tormenta") ||
    lower.includes("huracán")
  ) {
    return EVENT_TYPES.FLOOD_RISK;
  }

  // ═══════════════════════════════
  // FEDERAL FUNDING
  // ═══════════════════════════════
  if (
    lower.includes("fema") ||
    lower.includes("cdbg") ||
    lower.includes("cdbg-dr") ||
    lower.includes("cdbg-mit") ||
    lower.includes("hud") ||
    lower.includes("grant") ||
    lower.includes("fondo federal") ||
    lower.includes("fondos federales") ||
    lower.includes("mitigation") ||
    lower.includes("mitigación") ||
    lower.includes("resiliencia") ||
    lower.includes("infraestructura crítica") ||
    lower.includes("development block grant")
  ) {
    return EVENT_TYPES.FUNDING_OPPORTUNITY;
  }

  // ═══════════════════════════════
  // INFRASTRUCTURE DAMAGE
  // ═══════════════════════════════
  if (
    lower.includes("carretera") ||
    lower.includes("puente") ||
    lower.includes("infraestructura") ||
    lower.includes("derrumbe") ||
    lower.includes("alcantarillado") ||
    lower.includes("poste caído") ||
    lower.includes("daño estructural")
  ) {
    return EVENT_TYPES.INFRASTRUCTURE_DAMAGE;
  }

  // ═══════════════════════════════
  // CITIZEN COMPLAINT
  // ═══════════════════════════════
  if (
    lower.includes("queja") ||
    lower.includes("complaint") ||
    lower.includes("ciudadano") ||
    lower.includes("reclamo") ||
    lower.includes("denuncia")
  ) {
    return EVENT_TYPES.CITIZEN_COMPLAINT;
  }

  // ═══════════════════════════════
  // BUDGET / FINANCIAL RISK
  // ═══════════════════════════════
  if (
    lower.includes("presupuesto") ||
    lower.includes("budget") ||
    lower.includes("déficit") ||
    lower.includes("deficit") ||
    lower.includes("deuda")
  ) {
    return EVENT_TYPES.BUDGET_RISK;
  }

  return EVENT_TYPES.UNKNOWN;
}

function classifyEvent(inputText = "") {
  const eventType = detectEventType(inputText);

  const priority = calculatePriority(eventType);

  return {
    event_type: eventType,
    priority,
    requires_action: priority !== "low",
    source: "runtime_input",
    original_input: inputText,
    created_at: new Date().toISOString()
  };
}

module.exports = {
  classifyEvent
};
