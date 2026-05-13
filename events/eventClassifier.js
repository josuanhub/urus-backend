const EVENT_TYPES = require("./eventTypes");
const { calculatePriority } = require("./eventPriority");

function detectEventType(text = "") {
  const lower = text.toLowerCase();

  // POWER OUTAGE
  if (
    lower.includes("apagón") ||
    lower.includes("sin luz") ||
    lower.includes("power outage")
  ) {
    return EVENT_TYPES.POWER_OUTAGE;
  }

  // FLOOD
  if (
    lower.includes("inundación") ||
    lower.includes("flood") ||
    lower.includes("lluvia fuerte")
  ) {
    return EVENT_TYPES.FLOOD_RISK;
  }

  // FUNDING
  if (
    lower.includes("fema") ||
    lower.includes("cdbg") ||
    lower.includes("grant") ||
    lower.includes("fondo federal")
  ) {
    return EVENT_TYPES.FUNDING_OPPORTUNITY;
  }

  // INFRASTRUCTURE
  if (
    lower.includes("carretera") ||
    lower.includes("puente") ||
    lower.includes("infraestructura")
  ) {
    return EVENT_TYPES.INFRASTRUCTURE_DAMAGE;
  }

  // CITIZEN
  if (
    lower.includes("queja") ||
    lower.includes("complaint") ||
    lower.includes("ciudadano")
  ) {
    return EVENT_TYPES.CITIZEN_COMPLAINT;
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
