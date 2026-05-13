function calculatePriority(eventType) {
  switch (eventType) {
    case "POWER_OUTAGE":
      return "critical";

    case "FLOOD_RISK":
      return "critical";

    case "FUNDING_OPPORTUNITY":
      return "high";

    case "INFRASTRUCTURE_DAMAGE":
      return "high";

    case "BUDGET_RISK":
      return "medium";

    case "CITIZEN_COMPLAINT":
      return "medium";

    default:
      return "low";
  }
}

module.exports = {
  calculatePriority
};
