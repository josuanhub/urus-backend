const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/v1/auth/signup", (req, res) => {
  res.json({
    user_id: "usr_test",
    email: req.body.email,
    token: "fake_token_for_now"
  });
});

app.post("/v1/auth/login", (req, res) => {
  res.json({
    user_id: "usr_test",
    email: req.body.email,
    token: "fake_token_for_now"
  });
});

app.post("/v1/urus/ingest_session", (req, res) => {
  res.json({
    activation_id: "act_test",
    final_output: {
      summary: "URUS conectado correctamente 🚀"
    }
  });
});

app.post("/v1/billing/checkout", (req, res) => {
  res.json({
    url: "https://stripe.com/test"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("URUS Backend running");
});
