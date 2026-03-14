const express = require("express");

const router = express.Router();

router.get("/health", async (req, res) => {
  return res.json({
    ok: true,
    module: "moltbook",
    status: "online"
  });
});

module.exports = router;
