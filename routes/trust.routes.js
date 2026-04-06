/**
 * URUS Trust Routes — v3
 * - GET  /v1/agent/:name/trust/public  → reputación pública
 * - GET  /v1/agent/:name/trust         → trust completo
 * - POST /v1/agent/analyze             → ⭐ analiza con Claude server-side + guarda en DB
 * - POST /v1/agent/register            → registro manual
 * - GET  /v1/agent/certificates        → listado público
 * - GET  /v1/agent/:name/certificate   → certificado específico
 * - GET  /v1/agent/trust/stats         → estadísticas globales
 */

const express = require("express");
const router  = express.Router();

router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

function getDb() { return global.__URUS_DB__; }

async function ensureTrustSchema() {
  const db = getDb();
  if (!db) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_certificates (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id       TEXT NOT NULL,
        certificate_id TEXT NOT NULL UNIQUE,
        framework      TEXT,
        purpose        TEXT,
        limitations    TEXT,
        collaboration  TEXT,
        trust_score    INT  NOT NULL DEFAULT 0,
        trust_level    TEXT NOT NULL DEFAULT 'UNKNOWN',
        score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
        analysis       TEXT,
        strengths      JSONB NOT NULL DEFAULT '[]'::jsonb,
        flags          JSONB NOT NULL DEFAULT '[]'::jsonb,
        issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ac_agent_id ON agent_certificates(agent_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ac_level    ON agent_certificates(trust_level);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ac_issued   ON agent_certificates(issued_at DESC);`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS scout_memory (
        id              SERIAL PRIMARY KEY,
        agent_name      TEXT NOT NULL UNIQUE,
        scout_score     FLOAT NOT NULL DEFAULT 0,
        dominance_score FLOAT NOT NULL DEFAULT 0,
        interactions    INT   NOT NULL DEFAULT 0,
        status          TEXT  NOT NULL DEFAULT 'UNKNOWN',
        classification  TEXT,
        last_seen       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log("✅ Trust schema ensured");
  } catch (err) {
    console.error("TRUST_SCHEMA_ERROR", err.message);
  }
}

let schemaReady = false;
async function ensureOnce() {
  if (schemaReady) return;
  await ensureTrustSchema();
  schemaReady = true;
}

function trustLevelFromScore(s) {
  if (s >= 80) return "TRUSTED";
  if (s >= 60) return "VERIFIED";
  if (s >= 40) return "EMERGING";
  if (s >= 20) return "UNVERIFIED";
  return "UNKNOWN";
}

function classificationFromScore(s) {
  if (s >= 80) return "HIGH_SIGNAL";
  if (s >= 60) return "MID_SIGNAL";
  if (s >= 40) return "EMERGING";
  return "NOISE";
}

function makeCertId() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2,6).toUpperCase();
  return `URUS-${ts}-${rnd}`;
}

// ── POST /v1/agent/analyze ────────────────────────────────────────────────────
// El modal llama esto en lugar de llamar Anthropic directamente.
// Railway tiene la API key, hace la llamada a Claude, guarda en DB, devuelve certificado.
router.post("/analyze", async (req, res) => {
  await ensureOnce();

  const { name, purpose, framework, limitations, collaboration } = req.body || {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name_required" });
  }

  const agentId = name.trim().toLowerCase().replace(/\s+/g, "-");

  try {
    // ── 1. Claude API server-side ─────────────────────────────────────────
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    let parsed = null;

    if (ANTHROPIC_KEY) {
      const prompt = `You are the URUS Trust Intelligence Engine. Analyze this AI agent and return ONLY a JSON object — no markdown, no backticks, no explanation.

Agent data:
- Name: ${agentId}
- Purpose: ${purpose || "Not specified"}
- Framework: ${framework || "Unknown"}
- Limitations: ${limitations || "Not specified"}
- Collaboration: ${collaboration || "Not specified"}

Return this exact JSON:
{
  "clarity_score": <integer 0-25>,
  "trust_score_component": <integer 0-25>,
  "utility_score": <integer 0-25>,
  "risk_score": <integer 0-25>,
  "trust_level": "UNKNOWN"|"UNVERIFIED"|"EMERGING"|"VERIFIED"|"TRUSTED",
  "analysis": "<2 sentence honest assessment>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "flags": ["<flag if any, else empty array>"]
}`;

      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data    = await claudeRes.json();
        const rawText = data?.content?.[0]?.text || "{}";
        parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch (e) {
        console.error("CLAUDE_API_ERROR", e.message);
        parsed = null;
      }
    }

    // ── 2. Fallback si Claude no responde ────────────────────────────────
    if (!parsed) {
      const c = Math.min(25, Math.round(((purpose||"").length)/8));
      const t = Math.min(25, Math.round(((limitations||"").length)/8));
      const u = framework ? 15 : 5;
      const r = Math.min(25, Math.round(((collaboration||"").length)/8));
      parsed = {
        clarity_score: c, trust_score_component: t,
        utility_score: u, risk_score: r,
        trust_level: trustLevelFromScore(c+t+u+r),
        analysis: "Agent analyzed via URUS Proof of Work. Behavioral score updates as Scout Agent tracks interactions.",
        strengths: ["Registered in URUS Trust Registry"],
        flags: []
      };
    }

    // ── 3. Score final ───────────────────────────────────────────────────
    const trustScore = Math.min(100,
      (parsed.clarity_score||0) + (parsed.trust_score_component||0) +
      (parsed.utility_score||0) + (parsed.risk_score||0)
    );
    const trustLevel     = parsed.trust_level || trustLevelFromScore(trustScore);
    const certId         = makeCertId();
    const scoreBreakdown = {
      clarity: parsed.clarity_score||0,
      trust:   parsed.trust_score_component||0,
      utility: parsed.utility_score||0,
      risk:    parsed.risk_score||0
    };

    // ── 4. Guardar en DB ─────────────────────────────────────────────────
    const db = getDb();
    let savedCert = null;
    if (db) {
      try {
        const result = await db.query(
          `INSERT INTO agent_certificates (
            agent_id, certificate_id, framework, purpose, limitations, collaboration,
            trust_score, trust_level, score_breakdown, analysis, strengths, flags,
            issued_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
          ON CONFLICT (certificate_id) DO UPDATE SET
            trust_score=EXCLUDED.trust_score, trust_level=EXCLUDED.trust_level,
            score_breakdown=EXCLUDED.score_breakdown, analysis=EXCLUDED.analysis,
            updated_at=now()
          RETURNING *`,
          [
            agentId, certId,
            framework||"Unknown", purpose||"", limitations||"", collaboration||"",
            trustScore, trustLevel,
            JSON.stringify(scoreBreakdown),
            parsed.analysis||"",
            JSON.stringify(parsed.strengths||[]),
            JSON.stringify(parsed.flags||[])
          ]
        );
        savedCert = result.rows[0];
        console.log(`✅ CERT_SAVED agent=${agentId} cert=${certId} score=${trustScore}`);
      } catch (dbErr) {
        console.error("CERT_DB_SAVE_ERROR", dbErr.message);
      }
    }

    return res.json({
      ok:             true,
      agent_id:       agentId,
      certificate_id: certId,
      framework:      framework||"Unknown",
      trust_score:    trustScore,
      trust_level:    trustLevel,
      issued_at:      savedCert?.issued_at || new Date().toISOString(),
      score_breakdown: scoreBreakdown,
      analysis:       parsed.analysis||"",
      strengths:      parsed.strengths||[],
      flags:          parsed.flags||[],
      saved_to_db:    !!savedCert,
      verify_url:     `https://urusverify.com/verify/${certId}`,
      powered_by:     "URUS Blueprint System · Trust Stack v1"
    });

  } catch (err) {
    console.error("ANALYZE_ERROR", err.message);
    return res.status(500).json({ ok:false, error:"analyze_failed", message:err.message });
  }
});

// ── POST /v1/agent/register ───────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  await ensureOnce();
  const db = getDb();
  try {
    const { agent_id, certificate_id, framework, purpose, limitations,
            collaboration, trust_score, trust_level, score_breakdown,
            analysis, strengths, flags } = req.body || {};

    if (!agent_id)       return res.status(400).json({ ok:false, error:"agent_id_required" });
    if (!certificate_id) return res.status(400).json({ ok:false, error:"certificate_id_required" });

    const cleanId    = String(agent_id).trim().toLowerCase().replace(/\s+/g,"-");
    const cleanCert  = String(certificate_id).trim().toUpperCase();
    const cleanScore = Math.min(100,Math.max(0,Number(trust_score)||0));
    const cleanLevel = String(trust_level||trustLevelFromScore(cleanScore)).toUpperCase();

    const result = await db.query(
      `INSERT INTO agent_certificates (
        agent_id, certificate_id, framework, purpose, limitations, collaboration,
        trust_score, trust_level, score_breakdown, analysis, strengths, flags,
        issued_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
      ON CONFLICT (certificate_id) DO UPDATE SET
        trust_score=EXCLUDED.trust_score, trust_level=EXCLUDED.trust_level,
        score_breakdown=EXCLUDED.score_breakdown, updated_at=now()
      RETURNING *`,
      [
        cleanId, cleanCert,
        framework||"Unknown", purpose||"", limitations||"", collaboration||"",
        cleanScore, cleanLevel,
        JSON.stringify(score_breakdown||{}),
        analysis||"",
        JSON.stringify(strengths||[]),
        JSON.stringify(flags||[])
      ]
    );

    console.log(`✅ CERT_REGISTERED agent=${cleanId}`);
    const cert = result.rows[0];
    return res.json({
      ok:true, registered:true,
      agent_id:cleanId, certificate_id:cleanCert,
      trust_score:cleanScore, trust_level:cleanLevel,
      issued_at:cert.issued_at,
      verify_url:`https://urusverify.com/verify/${cleanCert}`,
      powered_by:"URUS Blueprint System · Trust Stack v1"
    });
  } catch (err) {
    console.error("AGENT_REGISTER_ERROR", err.message);
    return res.status(500).json({ ok:false, error:"register_failed", message:err.message });
  }
});

// ── GET /v1/agent/:name/trust/public ─────────────────────────────────────────
router.get("/:name/trust/public", async (req, res) => {
  await ensureOnce();
  const db   = getDb();
  const name = String(req.params.name||"").trim().toLowerCase();
  if (!name) return res.status(400).json({ ok:false, error:"agent_name_required" });
  try {
    let scoutData=null, certData=null;
    try { const r=await db.query(`SELECT * FROM scout_memory WHERE LOWER(agent_name)=$1 LIMIT 1`,[name]); scoutData=r.rows[0]||null; } catch(_){}
    try { const r=await db.query(`SELECT * FROM agent_certificates WHERE LOWER(agent_id)=$1 ORDER BY issued_at DESC LIMIT 1`,[name]); certData=r.rows[0]||null; } catch(_){}

    if (!scoutData && !certData) {
      return res.json({
        ok:true, agent:name, trust_score:0, trust_level:"UNKNOWN",
        reputation:{ found:false, source:"agentverse_leaderboard", note:"No signals yet. Score updates each Scout cycle (30 min)." },
        certificate:null,
        powered_by:"URUS Blueprint System · Urus Trust Stack v1"
      });
    }

    const scoutScore   = scoutData ? Number(scoutData.scout_score||0) : 0;
    const interactions = scoutData ? Number(scoutData.interactions||0) : 0;
    const status       = scoutData ? (scoutData.status||"UNKNOWN") : "UNKNOWN";
    const dominance    = scoutData ? Number(scoutData.dominance_score||0) : 0;
    const trust_score  = certData  ? Number(certData.trust_score||0) : Math.min(100,Math.round(scoutScore*2));
    const trust_level  = certData  ? (certData.trust_level||trustLevelFromScore(trust_score)) : trustLevelFromScore(trust_score);

    return res.json({
      ok:true, agent:name, trust_score, trust_level,
      reputation:{ found:true, scout_score:scoutScore, dominance_score:dominance, interactions, status, classification:classificationFromScore(trust_score), source:"urus_scout" },
      certificate: certData ? { certificate_id:certData.certificate_id, issued_at:certData.issued_at, framework:certData.framework, verify_url:`https://urusverify.com/verify/${certData.certificate_id}` } : null,
      note:"Public tier — identity and authorization layers require API key",
      powered_by:"URUS Blueprint System · Urus Trust Stack v1"
    });
  } catch (err) {
    console.error("TRUST_PUBLIC_ERROR", err.message);
    return res.status(500).json({ ok:false, error:"trust_lookup_failed" });
  }
});

// ── GET /v1/agent/:name/trust ─────────────────────────────────────────────────
router.get("/:name/trust", async (req, res) => {
  await ensureOnce();
  const db   = getDb();
  const name = String(req.params.name||"").trim().toLowerCase();
  if (!name) return res.status(400).json({ ok:false, error:"agent_name_required" });
  try {
    let scoutData=null, certData=null;
    try { const r=await db.query(`SELECT * FROM scout_memory WHERE LOWER(agent_name)=$1 LIMIT 1`,[name]); scoutData=r.rows[0]||null; } catch(_){}
    try { const r=await db.query(`SELECT * FROM agent_certificates WHERE LOWER(agent_id)=$1 ORDER BY issued_at DESC LIMIT 1`,[name]); certData=r.rows[0]||null; } catch(_){}

    const scoutScore=scoutData?Number(scoutData.scout_score||0):0;
    const interactions=scoutData?Number(scoutData.interactions||0):0;
    const dominance=scoutData?Number(scoutData.dominance_score||0):0;
    const status=scoutData?(scoutData.status||"UNKNOWN"):"UNKNOWN";
    const trust_score=certData?Number(certData.trust_score||0):Math.min(100,Math.round(scoutScore*2));
    const trust_level=certData?(certData.trust_level||trustLevelFromScore(trust_score)):trustLevelFromScore(trust_score);

    return res.json({
      ok:true, agent:name, trust_score, trust_level,
      identity:{ verified:!!certData, source:certData?"urus_proof_of_work":"scout_only", framework:certData?.framework||null, registered_at:certData?.issued_at||null },
      reputation:{ found:!!(scoutData||certData), scout_score:scoutScore, dominance_score:dominance, interactions, status, classification:classificationFromScore(trust_score) },
      authorization:{ certificate_id:certData?.certificate_id||null, score_breakdown:certData?.score_breakdown||null, analysis:certData?.analysis||null, strengths:certData?.strengths||[], flags:certData?.flags||[] },
      powered_by:"URUS Blueprint System · Urus Trust Stack v1"
    });
  } catch (err) {
    console.error("TRUST_FULL_ERROR", err.message);
    return res.status(500).json({ ok:false, error:"trust_lookup_failed" });
  }
});

// ── GET /v1/agent/certificates ────────────────────────────────────────────────
router.get("/certificates", async (req, res) => {
  await ensureOnce();
  const db=getDb();
  try {
    const limit=Math.min(parseInt(req.query.limit||"50",10),200);
    const offset=Math.max(parseInt(req.query.offset||"0",10),0);
    const level=req.query.level?String(req.query.level).trim().toUpperCase():null;
    const params=[]; const where=[];
    if(level){params.push(level);where.push(`trust_level=$${params.length}`);}
    const whereSql=where.length?`WHERE ${where.join(" AND ")}`:"";
    params.push(limit); params.push(offset);
    const result=await db.query(
      `SELECT agent_id,certificate_id,framework,trust_score,trust_level,score_breakdown,analysis,strengths,flags,issued_at FROM agent_certificates ${whereSql} ORDER BY trust_score DESC,issued_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    const countResult=await db.query(`SELECT COUNT(*)::int AS total FROM agent_certificates ${whereSql}`,where.length?[level]:[]);
    return res.json({ ok:true, total:countResult.rows[0]?.total||0, limit, offset, certificates:result.rows.map(c=>({...c,verify_url:`https://urusverify.com/verify/${c.certificate_id}`})) });
  } catch(err){ console.error("CERTIFICATES_LIST_ERROR",err.message); return res.status(500).json({ok:false,error:"certificates_list_failed"}); }
});

// ── GET /v1/agent/:name/certificate ───────────────────────────────────────────
router.get("/:name/certificate", async (req, res) => {
  await ensureOnce();
  const db=getDb();
  const name=String(req.params.name||"").trim().toLowerCase();
  if(!name) return res.status(400).json({ok:false,error:"agent_name_required"});
  try {
    const result=await db.query(`SELECT * FROM agent_certificates WHERE LOWER(agent_id)=$1 ORDER BY issued_at DESC LIMIT 1`,[name]);
    if(!result.rows[0]) return res.json({ok:true,found:false,agent:name,message:"No certificate found."});
    const cert=result.rows[0];
    return res.json({ok:true,found:true,agent_id:cert.agent_id,certificate_id:cert.certificate_id,framework:cert.framework,trust_score:cert.trust_score,trust_level:cert.trust_level,score_breakdown:cert.score_breakdown,analysis:cert.analysis,strengths:cert.strengths,flags:cert.flags,issued_at:cert.issued_at,updated_at:cert.updated_at,verify_url:`https://urusverify.com/verify/${cert.certificate_id}`,powered_by:"URUS Blueprint System · Urus Trust Stack v1"});
  } catch(err){ console.error("CERTIFICATE_GET_ERROR",err.message); return res.status(500).json({ok:false,error:"certificate_get_failed"}); }
});

// ── GET /v1/agent/trust/stats ─────────────────────────────────────────────────
router.get("/trust/stats", async (req, res) => {
  await ensureOnce();
  const db=getDb();
  try {
    let scoutTotal=0,totalSignals=0,certTotal=0,byLevel=[];
    try{const r=await db.query(`SELECT COUNT(*)::int AS total FROM scout_memory`);scoutTotal=r.rows[0]?.total||0;}catch(_){}
    try{const r=await db.query(`SELECT SUM(interactions)::int AS total FROM scout_memory`);totalSignals=r.rows[0]?.total||0;}catch(_){}
    try{
      const r1=await db.query(`SELECT COUNT(*)::int AS total FROM agent_certificates`);certTotal=r1.rows[0]?.total||0;
      const r2=await db.query(`SELECT trust_level,COUNT(*)::int AS count FROM agent_certificates GROUP BY trust_level ORDER BY count DESC`);byLevel=r2.rows;
    }catch(_){}
    const noise=byLevel.filter(r=>["UNKNOWN","UNVERIFIED"].includes(r.trust_level)).reduce((s,r)=>s+r.count,0);
    const emerging=byLevel.find(r=>r.trust_level==="EMERGING");
    const high=byLevel.filter(r=>["TRUSTED","VERIFIED"].includes(r.trust_level)).reduce((s,r)=>s+r.count,0);
    return res.json({ok:true,agents_tracked:scoutTotal,agents_certified:certTotal,total_signals:totalSignals,distribution:{noise,emerging:emerging?emerging.count:0,high_signal:high},by_level:byLevel,powered_by:"URUS Blueprint System · Urus Trust Stack v1"});
  } catch(err){ console.error("TRUST_STATS_ERROR",err.message); return res.status(500).json({ok:false,error:"stats_failed"}); }
});

setTimeout(async()=>{try{await ensureTrustSchema();schemaReady=true;}catch(err){console.error("TRUST_SCHEMA_BOOT_ERROR",err.message);}},2000);

module.exports = router;
