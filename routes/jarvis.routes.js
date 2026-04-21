const express = require("express");
const router = express.Router();
const controller = require("./controllers/jarvis.controller");

router.post("/chat", controller.chat);
router.post("/memory", controller.saveMemory);
router.get("/memory", controller.getMemory);
router.get("/health", controller.health);

module.exports = router;
