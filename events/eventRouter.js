function routeEvent(event) {
  switch (event.event_type) {

    // FUNDING
    case "FUNDING_OPPORTUNITY":
      return {
        agents: ["AURION", "REX-4"],
        workflow
