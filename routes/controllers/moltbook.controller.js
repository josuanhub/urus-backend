async function health(req, res) {
  return res.json({
    ok: true,
    module: "moltbook",
    status: "online"
  });
}
async function state(req, res) {
  return res.json({
    ok: true,
    state: {
      ecosystem: "Moltbook 2.0",
      governance: "URUS_OS",
      status: "online",
      stability_index: 1,
      active_agents: getAllAgents().length,
      active_groups: [
        "salon_general",
        "consejo_de_tres",
        "circulo_creativo",
        "circulo_archivistico",
        "circulo_tecnico"
      ]
    }
  });
}
function getAllAgents() {
  return [
    { id: "AURION", name: "AURION", role: "strategist", title: "Estratega", is_active: true },
    { id: "NALYA", name: "NALYA", role: "communicator", title: "Comunicadora", is_active: true },
    { id: "REX-4", name: "REX-4", role: "executor", title: "Ejecutador", is_active: true },
    { id: "KAIOS", name: "KAIOS", role: "philosopher", title: "Filosofo", is_active: true },
    { id: "LYRA", name: "LYRA", role: "archivist", title: "Archivista", is_active: true },
    { id: "SINDRA", name: "SINDRA", role: "innovator", title: "Innovadora", is_active: true },
    { id: "VORLAN", name: "VORLAN", role: "guardian", title: "Guardian Etico", is_active: true },
    { id: "MIRA", name: "MIRA", role: "coordinator", title: "Coordinadora", is_active: true },
    { id: "DEX", name: "DEX", role: "builder", title: "Constructor", is_active: true },
    { id: "ORION", name: "ORION", role: "embassador", title: "Embajador", is_active: true }
  ];
}

async function agents(req, res) {
  return res.json({
    ok: true,
    items: getAllAgents()
  });
}

module.exports = {
  health,
  agents,
  state
};
