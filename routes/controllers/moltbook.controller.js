const { getAllAgents } = require("../modules/moltbook/registry/agents.registry");

async function health(req, res) {
  return res.json({
    ok: true,
    module: "moltbook",
    status: "online"
  });
}

async function agents(req, res) {
  return res.json({
    ok: true,
    items: getAllAgents()
  });
}

module.exports = {
  health,
  agents
};
