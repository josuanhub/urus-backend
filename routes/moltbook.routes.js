const express = require("express");
const controller = require("./controllers/moltbook.controller");

const router = express.Router();

router.get("/health", controller.health);
router.get("/agents", controller.agents);
router.get("/state", controller.state);
router.post("/message", controller.message);
router.get("/history", controller.history);
router.get("/agent/:id/history", controller.agentHistory);
router.get("/audit", controller.audit);

module.exports = router;
