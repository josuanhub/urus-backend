function routeEvent(event) {

  switch (event.event_type) {

    // FUNDING
    case "FUNDING_OPPORTUNITY":
      return {
        agents: ["AURION", "REX-4"],
        workflow: "funding_analysis",
        notify: true
      };

    // POWER
    case "POWER_OUTAGE":
      return {
        agents: ["DEX", "VORLAN"],
        workflow: "infrastructure_response",
        notify: true
      };

    // FLOOD
    case "FLOOD_RISK":
      return {
        agents: ["DEX", "AURION"],
        workflow: "risk_assessment",
        notify: true
      };

    // INFRASTRUCTURE
    case "INFRASTRUCTURE_DAMAGE":
      return {
        agents: ["DEX"],
        workflow: "infrastructure_assessment",
        notify: true
      };

    // CITIZEN
    case "CITIZEN_COMPLAINT":
      return {
        agents: ["VORLAN"],
        workflow: "citizen_response",
        notify: false
      };

    // DEFAULT
    default:
      return {
        agents: ["ORION"],
        workflow: "general_analysis",
        notify: false
      };
  }
}

module.exports = {
  routeEvent
};
