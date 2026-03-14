const express = require("express");
const controller = require("./controllers/moltbook.controller");

const router = express.Router();

router.get("/health", controller.health);
router.get("/agents", controller.agents);
router.get("/state", controller.state);
router.post("/message", controller.message);

module.exports = router;
