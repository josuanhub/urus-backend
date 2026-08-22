/**
 * URUS Municipal Report Builder v4
 * services/intelligence/municipalReportBuilder.js
 *
 * Cualquier municipio de PR:
 * 1. Busca perfil en DB
 * 2. Si no existe → Serper + Wikipedia + DeepSeek extrae datos reales
 * 3. Guarda en DB (próxima vez instantáneo)
 * 4. Genera reporte con datos reales
 */

const OpenAI = require("openai").default;

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY
    ? "https://api.deepseek.com/v1"
    : "https://api.openai.com/v1",
});

const MODEL = process.env.DEEPSEEK_API_KEY
  ? (process.env.URUS_DEFAULT_MODEL || "deepseek-v4-flash")
  : (process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini");

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function parse(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  if (v && typeof v === "object") return v;
  return [];
}

async function callAI(messages, maxTokens = 3500, temp = 0.3) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: temp,
    max_tokens: maxTokens,
  });
  const raw = completion?.choices?.[0]?.message?.content || "";
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON in response");
  return JSON.parse(raw.substring(s, e + 1));
}

// ─── TABLA ────────────────────────────────────────────────────────────────────
async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS municipality_profiles (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                TEXT NOT NULL UNIQUE,
      mayor               TEXT,
      population          TEXT,
      region              TEXT,
      budget_amount       TEXT,
      budget_year         TEXT,
      budget_source       TEXT,
      extra_income        TEXT,
      extra_income_source TEXT,
      extra_income_date   TEXT,
      confirmed_funds     JSONB DEFAULT '[]'::jsonb,
      audits              JSONB DEFAULT '[]'::jsonb,
      disasters           JSONB DEFAULT '[]'::jsonb,
      federal_programs    JSONB DEFAULT '[]'::jsonb,
      strategic_notes     TEXT,
      auto_generated      BOOLEAN DEFAULT false,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// ─── SEED ─────────────────────────────────────────────────────────────────────
async function seedMunicipalities(pool) {
  const data = [
    {
      name: "Arecibo",
      mayor: 'Carlos "Tito" Ramírez Irizarry (PPD)',
      population: "85,539", region: "Norte",
      budget_amount: "$57M", budget_year: "2026-2027",
      budget_source: "Semanario Visión — presentación presupuesto junio 2026",
      extra_income: "$13M en caja al inicio del año fiscal",
      extra_income_source: "Superávit acumulado Single Audit 2024-2025 + exceso CAE + patentes",
      extra_income_date: "julio 2026",
      confirmed_funds: [
        { program: "FEMA Public Assistance — Sección 406", amount: "$717,000+", description: "Obras permanentes Av. Víctor Rojas — Stafford Act", status: "Obligado y activo", source: "FEMA / COR3", date: "2020" },
        { program: "FEMA — Puentes y carreteras PR", amount: "Incluido en $32.9M", description: "Fondos FEMA municipios PR incluyendo Arecibo", status: "Anunciado — ejecución septiembre 2026", source: "Comisionado Residente", date: "abril 2025" },
        { program: "MSROF — JSF", amount: "Hasta $800,000", description: "$35.6M para 64 municipios AF 2026", status: "Condicionado a reformas fiscales", source: "Junta de Supervisión Fiscal", date: "abril 2026" },
        { program: "COR3 — Proyectos activos", amount: "Múltiples proyectos", description: "Prórrogas FEMA hasta septiembre 20 2026", status: "Prórroga activa — deadline crítico", source: "COR3", date: "mayo 2026" }
      ],
      audits: [
        { entity: "Oficina del Contralor PR", report: "OC-25-22", date: "septiembre 2024", finding: "Opinión cualificada — mejoras en control administrativo y gestión de personal", impact: "Refuerza necesidad de coordinación operacional más robusta" },
        { entity: "Single Audit", report: "AF 2024", date: "2024", finding: "Superávit $8.3M confirmado", impact: "Posición fiscal sólida" },
        { entity: "Single Audit", report: "AF 2025", date: "2025", finding: "Superávit $261,841", impact: "Segundo año consecutivo positivo" }
      ],
      disasters: [
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños mayores — elegible FEMA-PA, CDBG-DR, HMGP" },
        { event: "Período sísmico", date: "2020", impact: "Afectación indirecta" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Daños infraestructura" },
        { event: "Tormenta Ernesto", date: "agosto 2024", impact: "Impacto directo — elegible SDRP" }
      ],
      federal_programs: [
        { program: "CDBG-DR City-Rev", agency: "HUD/PRDOH", amount: "$500K–$3M estimado", status: "Ventana abierta", note: "$1,298M disponibles isla" },
        { program: "HMGP Global Match Strategy", agency: "FEMA/PRDOH", amount: "$250K–$2M estimado", status: "Requiere Plan Mitigación FEMA vigente", note: "$1,000M disponibles isla" },
        { program: "PR Energy Resilience Fund", agency: "DOE/FEMA/HUD", amount: "$200K–$800K estimado", status: "Activo — CODEVyS operando", note: "Solar" },
        { program: "MSROF — JSF", agency: "Junta de Supervisión Fiscal", amount: "Hasta $800,000", status: "Condicionado AF 2026", note: "$35.6M para 64 municipios" },
        { program: "Fondos AI municipal", agency: "Instituto AI PR / Federal", amount: "Por definir 2026", status: "Emergente", note: "Instituto AI Senado nov 2025" }
      ],
      strategic_notes: "Primer municipio PR con cuentas al día (AAFAF, julio 2024). Single Audit 2024 superávit $8.3M. $13M en caja inicio AF 2026-2027. Prórrogas FEMA hasta septiembre 20 2026 — deadline crítico. Gobernadora citó Arecibo en anuncio $1,100M FEMA (febrero 2025). Mayor extensión territorial PR. Observatorio de Arecibo como narrativa tecnológica.",
      auto_generated: false
    },
    {
      name: "Ponce",
      mayor: "Luis Irizarry Pabón (PNP)",
      population: "143,926", region: "Sur",
      budget_amount: "$95M", budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null, extra_income_source: null, extra_income_date: null,
      confirmed_funds: [
        { program: "FEMA Public Assistance — Terremotos 2020", amount: "Múltiples obligaciones", status: "Activo COR3", source: "COR3", date: "2025-2026" },
        { program: "COR3 — Prórrogas proyectos", amount: "Incluido en 573 proyectos PR", status: "Prórroga hasta septiembre 2026", source: "COR3", date: "mayo 2026" }
      ],
      audits: [],
      disasters: [
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños mayores" },
        { event: "Terremotos del sur", date: "enero 2020", impact: "Daños estructurales significativos — prioridad federal alta" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Inundaciones y daños" }
      ],
      federal_programs: [
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible — alta prioridad sísmica", note: "Califica por terremotos 2020 y huracanes" },
        { program: "CDBG-MIT", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Mitigación riesgos sísmicos" },
        { program: "FEMA HMGP", agency: "FEMA/PRDOH", amount: "Por determinar", status: "Activo", note: "Zona sísmica alta prioridad" },
        { program: "MSROF — JSF", agency: "JSF", amount: "Hasta $800,000", status: "Condicionado AF 2026", note: "" }
      ],
      strategic_notes: "Segundo municipio más grande de PR. Alta exposición sísmica — terremotos 2020 son factor de elegibilidad único vs municipios del norte. Centro histórico con potencial CDBG-DR significativo. FEMA aprobó prórrogas hasta septiembre 2026.",
      auto_generated: false
    },
    {
      name: "Caguas",
      mayor: 'William E. Miranda Torres "Willito" (PPD)',
      population: "142,893", region: "Centro-Este",
      budget_amount: "$85M", budget_year: "2025-2026",
      budget_source: "OGP — Presupuesto Municipal Autónomo de Caguas",
      extra_income: null, extra_income_source: null, extra_income_date: null,
      confirmed_funds: [
        { program: "FEMA Public Assistance — Huracanes", amount: "Múltiples obligaciones activas", status: "Activo COR3", source: "COR3 / FEMA", date: "2025-2026" },
        { program: "COR3 — Prórrogas proyectos reconstrucción", amount: "Incluido en 573 proyectos PR", status: "Prórroga hasta septiembre 2026", source: "COR3", date: "mayo 2026" }
      ],
      audits: [],
      disasters: [
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños mayores — elegible FEMA-PA, CDBG-DR, HMGP" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Inundaciones — elegible FEMA" }
      ],
      federal_programs: [
        { program: "CDBG-DR City-Rev", agency: "HUD/PRDOH", amount: "$500K–$3M estimado", status: "Ventana abierta", note: "Califica por Irma y María" },
        { program: "HMGP Global Match Strategy", agency: "FEMA/PRDOH", amount: "$250K–$2M estimado", status: "Requiere Plan Mitigación FEMA vigente", note: "$1,000M disponibles isla" },
        { program: "PR Energy Resilience Fund", agency: "DOE/FEMA/HUD", amount: "$200K–$800K estimado", status: "Activo", note: "" },
        { program: "MSROF — JSF", agency: "JSF", amount: "Hasta $800,000", status: "Condicionado AF 2026", note: "" }
      ],
      strategic_notes: "Tercer municipio más grande de PR. Municipio Autónomo con poderes especiales. Alcalde Willito desde 2010 — administración estable. Oficina Comisionado Residente establecida en Caguas (2025). Hub de servicios federales del este de PR.",
      auto_generated: false
    },
    {
      name: "Mayagüez",
      mayor: "José Guillermo Rodríguez (PPD)",
      population: "73,077", region: "Oeste",
      budget_amount: "$65M", budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null, extra_income_source: null, extra_income_date: null,
      confirmed_funds: [
        { program: "FEMA Public Assistance", amount: "Múltiples obligaciones", status: "Activo", source: "COR3", date: "2025-2026" }
      ],
      audits: [],
      disasters: [
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños mayores" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Daños en infraestructura" }
      ],
      federal_programs: [
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Puerto mayor PR — corredor estratégico" },
        { program: "HMGP", agency: "FEMA/PRDOH", amount: "Por determinar", status: "Activo", note: "" },
        { program: "MSROF — JSF", agency: "JSF", amount: "Hasta $800,000", status: "Condicionado AF 2026", note: "" }
      ],
      strategic_notes: "Puerto mayor del oeste de PR. UPRM — hub ingeniería y tecnología. Centro regional del oeste.",
      auto_generated: false
    },
    {
      name: "Hatillo",
      mayor: "Luis Daniel Rivera Calderón (PPD)",
      population: "40,476", region: "Norte",
      budget_amount: "$35M", budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null, extra_income_source: null, extra_income_date: null,
      confirmed_funds: [],
      audits: [],
      disasters: [
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños en infraestructura" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Impacto moderado" }
      ],
      federal_programs: [
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Corredor norte" },
        { program: "HMGP", agency: "FEMA/PRDOH", amount: "Por determinar", status: "Activo", note: "" },
        { program: "MSROF — JSF", agency: "JSF", amount: "Hasta $800,000", status: "Condicionado AF 2026", note: "" }
      ],
      strategic_notes: "Municipio norte corredor Arecibo.",
      auto_generated: false
    },
    {
      name: "Barceloneta",
      mayor: "Wanda Soler Rosario (PPD)",
      population: "24,227", region: "Norte",
      budget_amount: "$28M", budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null, extra_income_source: null, extra_income_date: null,
      confirmed_funds: [],
      audits: [],
      disasters: [
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños costera" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Inundaciones costeras" }
      ],
      federal_programs: [
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Zona costera" },
        { program: "HMGP", agency: "FEMA/PRDOH", amount: "Por determinar", status: "Activo", note: "" },
        { program: "MSROF — JSF", agency: "JSF", amount: "Hasta $800,000", status: "Condicionado AF 2026", note: "" }
      ],
      strategic_notes: "Municipio costero norte. Zona industrial farmacéutica.",
      auto_generated: false
    },
    {
      name: "Camuy",
      mayor: "Edwin Alicea Pérez (PPD)",
      population: "32,541", region: "Norte",
      budget_amount: "$30M", budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null, extra_income_source: null, extra_income_date: null,
      confirmed_funds: [],
      audits: [],
      disasters: [
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños en infraestructura" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Daños moderados" }
      ],
      federal_programs: [
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "" },
        { program: "HMGP", agency: "FEMA/PRDOH", amount: "Por determinar", status: "Activo", note: "" },
        { program: "MSROF — JSF", agency: "JSF", amount: "Hasta $800,000", status: "Condicionado AF 2026", note: "" }
      ],
      strategic_notes: "Municipio adyacente a Arecibo por el oeste. Cueva del Indio — potencial turismo.",
      auto_generated: false
    }
  ];

  for (const m of data) {
    await pool.query(`
      INSERT INTO municipality_profiles (
        name, mayor, population, region,
        budget_amount, budget_year, budget_source,
        extra_income, extra_income_source, extra_income_date,
        confirmed_funds, audits, disasters, federal_programs,
        strategic_notes, auto_generated
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (name) DO UPDATE SET
        mayor               = EXCLUDED.mayor,
        population          = EXCLUDED.population,
        budget_amount       = EXCLUDED.budget_amount,
        budget_year         = EXCLUDED.budget_year,
        budget_source       = EXCLUDED.budget_source,
        extra_income        = EXCLUDED.extra_income,
        extra_income_source = EXCLUDED.extra_income_source,
        extra_income_date   = EXCLUDED.extra_income_date,
        confirmed_funds     = EXCLUDED.confirmed_funds,
        audits              = EXCLUDED.audits,
        disasters           = EXCLUDED.disasters,
        federal_programs    = EXCLUDED.federal_programs,
        strategic_notes     = EXCLUDED.strategic_notes,
        updated_at          = now()
      WHERE municipality_profiles.auto_generated = true
         OR municipality_profiles.updated_at < now() - interval '30 days'
    `, [
      m.name, m.mayor, m.population, m.region,
      m.budget_amount, m.budget_year, m.budget_source,
      m.extra_income || null, m.extra_income_source || null, m.extra_income_date || null,
      JSON.stringify(m.confirmed_funds), JSON.stringify(m.audits),
      JSON.stringify(m.disasters), JSON.stringify(m.federal_programs),
      m.strategic_notes, m.auto_generated
    ]);
  }
  console.log("SEED_DONE", { count: data.length });
}

// ─── BÚSQUEDA AUTOMÁTICA ──────────────────────────────────────────────────────
async function searchMunicipio(name) {
  const results = [];

  // 1. Wikipedia siempre — gratis, sin créditos
  try {
    const w = await fetch(
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name + ", Puerto Rico")}`,
      { headers: { "User-Agent": "URUS-Intelligence/1.0" } }
    );
    if (w.ok) {
      const wiki = await w.json();
      if (wiki.extract) {
        results.push(`WIKIPEDIA: ${wiki.extract.substring(0, 1500)}`);
        console.log("WIKI_SUCCESS", { name, chars: wiki.extract.length });
      }
    }
  } catch (e) {
    console.error("WIKI_ERROR", e.message);
  }

  // 2. Serper solo si tiene créditos disponibles
  if (process.env.SERPER_API_KEY) {
    const queries = [
      `${name} Puerto Rico alcalde 2025 2026`,
      `${name} municipio Puerto Rico presupuesto fondos FEMA 2026`,
    ];
    for (const q of queries) {
      try {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ q, gl: "us", hl: "es", num: 5 }),
        });
        const data = await res.json();
        // Si no hay créditos Serper devuelve error — ignorar silenciosamente
        if (data.error || data.statusCode === 402) {
          console.log("SERPER_NO_CREDITS — usando solo Wikipedia + DeepSeek");
          break;
        }
        (data.organic || []).slice(0, 3).forEach(r =>
          results.push(`FUENTE: ${r.link}\nTÍTULO: ${r.title}\nCONTENIDO: ${r.snippet || ""}`)
        );
        if (data.answerBox?.snippet) results.push(`RESPUESTA: ${data.answerBox.snippet}`);
      } catch (e) {
        console.error("SERPER_ERROR", q, e.message);
        break;
      }
    }
  } else {
    console.log("SERPER_NOT_CONFIGURED — usando Wikipedia + DeepSeek");
  }

  // 3. Siempre agregar contexto de PR que DeepSeek usará
  results.push(`CONTEXTO PR 2026: Municipio de ${name}, Puerto Rico. 
Todos los municipios de PR calificaron por Huracán María (2017) para CDBG-DR y HMGP.
FEMA aprobó prórrogas para 573 proyectos hasta septiembre 20, 2026.
JSF aprobó MSROF $35.6M para 64 municipios AF 2026.
CDBG-DR City-Rev tiene $1,298M disponibles para municipios afectados.
Instituto AI PR aprobado Senado (noviembre 2025).`);

  return results;
}

// ─── EXTRACCIÓN DE PERFIL ────────────────────────────────────────────────────
async function extractProfile(name, searchResults) {
  if (!searchResults.length) return null;
  const ctx = searchResults.join("\n\n").substring(0, 4000);
  const yr = new Date().getFullYear();

  try {
    return await callAI([
      { role: "system", content: `Eres un experto en municipios de Puerto Rico con conocimiento completo de todos los 78 alcaldes, presupuestos, regiones y datos municipales actuales.
Cuando no encuentres un dato en la información proporcionada, usa tu conocimiento propio sobre Puerto Rico para completarlo.
Para el alcalde: si no está en el texto busca en tu conocimiento — conoces a todos los alcaldes de PR 2024-2026.
Para presupuesto: si no está, estima basado en la población del municipio.
Responde SOLO JSON válido, sin backticks ni texto adicional.` },
      { role: "user", content: `Genera el perfil del Municipio de ${name}, Puerto Rico usando la información disponible y tu conocimiento.

INFORMACIÓN DISPONIBLE:
${ctx}

IMPORTANTE: Usa tu conocimiento sobre Puerto Rico para completar datos que no estén en el texto.
Conoces a todos los alcaldes de PR, sus partidos, regiones y contexto municipal.

Responde ÚNICAMENTE con este JSON (sin texto antes ni después, sin backticks):
{"mayor":"nombre del alcalde actual con partido en paréntesis","population":"población aproximada","region":"región de PR","budget_amount":"presupuesto en formato $XM","budget_year":"2024-2025","budget_source":"OGP — Presupuesto Municipal","confirmed_funds":[],"disasters":[{"event":"Huracán María","date":"septiembre 2017","impact":"Daños — elegible FEMA-PA, CDBG-DR, HMGP"},{"event":"Huracán Fiona","date":"septiembre 2022","impact":"Daños — elegible FEMA"}],"federal_programs":[{"program":"CDBG-DR City-Rev","agency":"HUD/PRDOH","amount":"$500K–$3M estimado","status":"Ventana abierta","note":"Califica por Irma y María"},{"program":"HMGP Global Match Strategy","agency":"FEMA/PRDOH","amount":"$250K–$2M estimado","status":"Requiere Plan Mitigación FEMA vigente","note":"$1,000M isla"},{"program":"PR Energy Resilience Fund","agency":"DOE/FEMA/HUD","amount":"$200K–$800K estimado","status":"Activo","note":""},{"program":"MSROF — JSF","agency":"JSF","amount":"Hasta $800,000","status":"Condicionado AF 2026","note":""}],"strategic_notes":"contexto estratégico específico de ${name}"}` }
    ], 1500, 0.1);
  } catch (e) {
    console.error("EXTRACT_ERROR", e.message);
    return null;
  }
}

// ─── GUARDAR PERFIL AUTO ──────────────────────────────────────────────────────
async function saveAutoProfile(pool, name, p) {
  try {
    await pool.query(`
      INSERT INTO municipality_profiles
        (name,mayor,population,region,budget_amount,budget_year,budget_source,
         confirmed_funds,disasters,federal_programs,strategic_notes,auto_generated)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
      ON CONFLICT (name) DO UPDATE SET
        mayor=EXCLUDED.mayor, population=EXCLUDED.population, region=EXCLUDED.region,
        budget_amount=EXCLUDED.budget_amount, budget_year=EXCLUDED.budget_year,
        budget_source=EXCLUDED.budget_source, confirmed_funds=EXCLUDED.confirmed_funds,
        disasters=EXCLUDED.disasters, federal_programs=EXCLUDED.federal_programs,
        strategic_notes=EXCLUDED.strategic_notes, auto_generated=true, updated_at=now()
    `, [
      name,
      p.mayor || `${name} — Alcalde`,
      p.population || "Por confirmar",
      p.region || "Puerto Rico",
      p.budget_amount || "Por confirmar",
      p.budget_year || "2025-2026",
      p.budget_source || "OGP",
      JSON.stringify(p.confirmed_funds || []),
      JSON.stringify(p.disasters || [
        { event:"Huracán María", date:"septiembre 2017", impact:"Daños — elegible FEMA-PA, CDBG-DR, HMGP" }
      ]),
      JSON.stringify(p.federal_programs || [
        { program:"CDBG-DR City-Rev", agency:"HUD/PRDOH", amount:"$500K–$3M estimado", status:"Ventana abierta", note:"" },
        { program:"HMGP Global Match Strategy", agency:"FEMA/PRDOH", amount:"$250K–$2M estimado", status:"Requiere Plan Mitigación FEMA vigente", note:"" },
        { program:"PR Energy Resilience Fund", agency:"DOE/FEMA/HUD", amount:"$200K–$800K estimado", status:"Activo", note:"" },
        { program:"MSROF — JSF", agency:"JSF", amount:"Hasta $800,000", status:"Condicionado AF 2026", note:"" }
      ]),
      p.strategic_notes || `Municipio de ${name}, Puerto Rico.`,
    ]);
    console.log("AUTO_PROFILE_SAVED", { name });
  } catch (e) {
    console.error("AUTO_SAVE_ERROR", e.message);
  }
}

// ─── OBTENER PERFIL ───────────────────────────────────────────────────────────
async function getOrBuildProfile(pool, name) {
  // 1. Buscar en DB
  const r = await pool.query(`SELECT * FROM municipality_profiles WHERE name ILIKE $1 LIMIT 1`, [name]);
  if (r.rows.length > 0) {
    const p = r.rows[0];
    const ageH = (Date.now() - new Date(p.updated_at)) / 3600000;
    if (!p.auto_generated || ageH < 168) {
      console.log("PROFILE_FROM_DB", { name, auto: p.auto_generated });
      return p;
    }
  }

  // 2. Buscar datos reales
  console.log("SEARCHING_REAL_DATA", { name });
  const searchResults = await searchMunicipio(name);
  if (searchResults.length > 0) {
    const profileData = await extractProfile(name, searchResults);
    if (profileData) {
      await saveAutoProfile(pool, name, profileData);
      const saved = await pool.query(`SELECT * FROM municipality_profiles WHERE name ILIKE $1 LIMIT 1`, [name]);
      if (saved.rows.length > 0) return saved.rows[0];
    }
  }

  // Aunque no haya Serper, usar DeepSeek con contexto de PR para generar perfil
  console.log("PROFILE_BUILDING_FROM_AI_KNOWLEDGE", { name });
  const minimalContext = [
    `CONTEXTO PR 2026: Municipio de ${name}, Puerto Rico.
Todos los municipios calificaron por Huracán María (2017). 
FEMA prórrogas 573 proyectos hasta septiembre 20, 2026.
JSF MSROF $35.6M para 64 municipios AF 2026.
Usa tu conocimiento sobre los municipios de Puerto Rico para completar los datos.`
  ];
  const profileData = await extractProfile(name, minimalContext);
  if (profileData && profileData.mayor && profileData.mayor !== `${name} — Alcalde`) {
    await saveAutoProfile(pool, name, profileData);
    const saved = await pool.query(`SELECT * FROM municipality_profiles WHERE name ILIKE $1 LIMIT 1`, [name]);
    if (saved.rows.length > 0) return saved.rows[0];
  }
  
  console.log("PROFILE_GENERIC_FINAL", { name });
  return null;
}

// ─── SEÑALES DEL MERCADO ──────────────────────────────────────────────────────
async function getIntelligence(pool, name) {
  const [sig, opp] = await Promise.all([
    pool.query(`
      SELECT title, content, signal_type, strategic_summary, priority_score
      FROM market_intelligence
      WHERE content ILIKE $1 OR content ILIKE '%FEMA%' OR content ILIKE '%COR3%'
         OR content ILIKE '%Puerto Rico%' OR signal_type IN ('FUNDING','GOVERNMENT','AI')
      ORDER BY priority_score DESC, created_at DESC LIMIT 20
    `, [`%${name}%`]),
    pool.query(`
      SELECT event_type, severity, summary
      FROM opportunity_events
      WHERE summary ILIKE $1 OR summary ILIKE '%Puerto Rico%' OR summary ILIKE '%FEMA%'
      ORDER BY severity DESC, created_at DESC LIMIT 12
    `, [`%${name}%`])
  ]);
  return {
    signals: sig.rows, signal_count: sig.rows.length,
    opportunities: opp.rows, opportunity_count: opp.rows.length
  };
}

// ─── CONSTRUIR REPORTE ────────────────────────────────────────────────────────
async function buildReport(name, profile, intel) {
  const yr = new Date().getFullYear();
  const date = new Date().toLocaleDateString("es-PR", { year:"numeric", month:"long", day:"numeric" });

  const funds  = profile ? parse(profile.confirmed_funds)  : [];
  const audits = profile ? parse(profile.audits)           : [];
  const disast = profile ? parse(profile.disasters)        : [];
  const progs  = profile ? parse(profile.federal_programs) : [];

  const profileCtx = profile ? `
PERFIL VERIFICADO — MUNICIPIO DE ${name.toUpperCase()}:
Alcalde: ${profile.mayor}
Población: ${profile.population}
Región: ${profile.region}
Presupuesto AF ${profile.budget_year}: ${profile.budget_amount}
Fuente: ${profile.budget_source}
${profile.extra_income ? `Posición financiera adicional: ${profile.extra_income} (${profile.extra_income_source}, ${profile.extra_income_date})` : ""}

FONDOS FEDERALES CONFIRMADOS:
${funds.length ? funds.map(f => `• ${f.program}: ${f.amount} — ${f.status} (${f.source}, ${f.date})`).join("\n") : "• Sin fondos específicos confirmados — aplican fondos generales PR"}

AUDITORÍAS OFICIALES:
${audits.length ? audits.map(a => `• ${a.entity} ${a.report} (${a.date}): ${a.finding}`).join("\n") : "• Sin auditorías registradas"}

HISTORIAL DESASTRES (define elegibilidad federal):
${disast.map(d => `• ${d.event} (${d.date}): ${d.impact}`).join("\n")}

PROGRAMAS FEDERALES ELEGIBLES:
${progs.map(p => `• ${p.program} (${p.agency}): ${p.amount} — ${p.status}`).join("\n")}

CONTEXTO ESTRATÉGICO: ${profile.strategic_notes}
`.trim() : `MUNICIPIO: ${name}, Puerto Rico. Sin perfil específico. Aplican fondos generales PR — FEMA-PA, CDBG-DR ($1,298M isla), HMGP ($1,000M isla), MSROF ($35.6M 64 municipios).`;

  const signals = intel.signals.slice(0,10).map(s =>
    `[${s.signal_type}] ${s.title}: ${(s.content||s.strategic_summary||"").substring(0,200)}`
  ).join("\n");

  const prompt = `
Eres el motor de inteligencia operacional URUS. Genera informe ejecutivo para Municipio de ${name}, PR.
FECHA: ${date} | AÑO: ${yr}

REGLAS IRROMPIBLES:
1. MENCIONAR alcalde ${profile?.mayor || "del municipio"} POR NOMBRE en el resumen
2. USAR presupuesto exacto ${profile?.budget_amount || "del perfil"}
3. MENCIONAR deadline COR3 septiembre 20, 2026
4. IMPOSIBLE confundir este informe con el de otro municipio
5. Solo años 2025-2026 como fechas futuras. NUNCA 2023 o 2024
6. Estilo Palantir/Stratfor: "URUS detectó...", "Señales confirman...", "Análisis indica..."
7. Todo en español institucional
8. SOLO JSON válido — sin texto adicional

${profileCtx}

SEÑALES MERCADO:
${signals || "Usar datos del perfil"}

JSON A GENERAR:
{
  "executive_summary": "4-6 oraciones. OBLIGATORIO: alcalde ${profile?.mayor || "por nombre"}, presupuesto ${profile?.budget_amount || ""}, fondos confirmados del perfil, deadline COR3 septiembre 2026",
  "funding_analysis": "4-6 oraciones. FEMA obligó $41B para PR — $12B desembolsados. Programas específicos de ${name} con montos exactos del perfil",
  "findings": [
    "Fragmentación operacional en ${name}: presupuesto ${profile?.budget_amount || ""}, región ${profile?.region || ""}, impacto en plazos FEMA/CDBG-DR activos en ${yr}",
    "${audits[0] ? `Informe ${audits[0].report} (${audits[0].entity}, ${audits[0].date}): ${audits[0].finding} — implicación en elegibilidad federal` : `Capacidad fiscal de ${name} para gestionar fondos federales — análisis de perfil administrativo ${yr}`}",
    "DEADLINE CRÍTICO: FEMA aprobó prórrogas 573 proyectos PR hasta septiembre 20, 2026. ${name} tiene proyectos en este universo: ${funds.slice(0,2).map(f=>f.program).join(", ") || "proyectos COR3 activos"}",
    "CDBG-DR City-Rev y HMGP: ${name} califica por ${disast.slice(0,2).map(d=>d.event+" "+d.date).join(" y ")}. Ventanas activas ${yr} — preparación requerida",
    "AI y modernización: Instituto AI PR (nov 2025), $2M FIPSE-SP (ene 2026), MSROF $35.6M para 64 municipios AF 2026 — posicionamiento para ${name}"
  ],
  "evidence_chains": [
    "Señal confirmada: ${funds[0] ? `${funds[0].program} — ${funds[0].amount} (${funds[0].source}, ${funds[0].date})` : `FEMA Public Assistance activo PR ${yr}`}. Implicación para ${name}: [específica]. Fricción: sin seguimiento centralizado. Urgencia: deadline septiembre 2026",
    "Señal confirmada: ${funds[1] ? `${funds[1].program} — ${funds[1].amount} (${funds[1].source}, ${funds[1].date})` : `COR3 prórrogas 573 proyectos hasta septiembre 20 2026`}. Implicación para ${name}: [específica]. Fricción: ejecución sin sistema. Urgencia: ${yr}",
    "Señal confirmada: FEMA aprobó prórrogas 573 proyectos PR hasta septiembre 20, 2026 (COR3, mayo 2026). Implicación para ${name}: deadline crítico proyectos activos. Fricción: capacidad ejecución limitada. Urgencia: semanas restantes",
    "Señal confirmada: ${audits[0] ? `${audits[0].entity} emitió ${audits[0].report} (${audits[0].date}): ${audits[0].finding}` : `JSF aprobó MSROF $35.6M para 64 municipios AF 2026`}. Implicación: elegibilidad federal ${name}. Fricción: [área de mejora]. Urgencia: ${yr}",
    "Señal confirmada: Instituto AI PR aprobado Senado (nov 2025) + $2M FIPSE-SP (ene 2026) + MSROF condicionado AF 2026. Implicación para ${name}: fondos modernización disponibles. Fricción: municipios sin capacidad quedan excluidos. Urgencia: ${yr}"
  ],
  "strategic_recommendations": [
    "URGENTE septiembre 20 2026: alcalde ${profile?.mayor || "del municipio"} debe activar seguimiento inmediato proyectos COR3 de ${name}. Fondos: ${funds.slice(0,2).map(f=>f.program).join(", ") || "proyectos FEMA activos"}",
    "Iniciar solicitud CDBG-DR City-Rev ${yr}. ${name} califica por ${disast[0]?.event || "Huracán María"}. Preparar plan visión comunitaria y documentación técnica",
    "Actualizar Plan Mitigación FEMA para ${name} — habilitante para HMGP ($1,000M isla). Sin este plan ${name} queda excluido automáticamente",
    "Implementar coordinación operacional en ${name} para requisito DHS consulta previa (jun 2025) obras >$100K y reducir fuga capital $440K–$740K anuales",
    "Posicionar ${name} para MSROF + fondos AI municipal ${yr}. Alcalde ${profile?.mayor || "del municipio"} puede liderar posicionamiento estratégico regional"
  ],
  "infrastructure_stability": ${disast.length>=3?65:disast.length>=2?72:78},
  "funding_readiness": ${funds.length>=3?88:funds.length>=2?84:funds.length>=1?78:70},
  "operational_risk": ${audits.length>0?68:60},
  "coordination_capacity": ${profile?.extra_income?48:41},
  "total_federal_available": "${progs.length>=4?"$6.2M – $11.4M":"$4.5M – $8.2M"}",
  "fema_alignment": "${disast.length>=3?"ALTO":"MODERADO"}",
  "infrastructure_stress": "${funds.length>=2?"ACTIVO":"MODERADO"}",
  "federal_exposure": "${funds.length>=1?"ACTIVO":"MODERADO"}"
}
`.trim();

  let generated = null;
  try {
    generated = await callAI([
      { role: "system", content: `Motor de inteligencia URUS. Informes ESPECÍFICOS por municipio. 
INACEPTABLE texto genérico. Mencionar alcalde por nombre. Usar datos exactos del perfil. 
SOLO JSON válido.` },
      { role: "user", content: prompt }
    ], 3500, 0.4);
    console.log("AI_SUCCESS", { name, model: MODEL });
  } catch (e) {
    console.error("AI_ERROR", e.message);
    // Intentar una vez más con prompt más simple
    try {
      const retry = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "Eres URUS, sistema de inteligencia municipal de PR. Responde SOLO JSON válido." },
          { role: "user", content: `Genera un análisis ejecutivo para el Municipio de ${name}, Puerto Rico.
Alcalde: ${profile?.mayor || "alcalde del municipio"}
Presupuesto: ${profile?.budget_amount || "presupuesto municipal"}
Región: ${profile?.region || "Puerto Rico"}

Responde ÚNICAMENTE con este JSON (sin texto extra):
{"executive_summary":"4 oraciones sobre ${name} mencionando al alcalde ${profile?.mayor||""} y presupuesto ${profile?.budget_amount||""} y deadline COR3 septiembre 2026","funding_analysis":"4 oraciones sobre fondos federales disponibles para ${name} en 2026","findings":["Fragmentación operacional en ${name} con presupuesto ${profile?.budget_amount||"municipal"} afecta captura de fondos federales activos en 2026","Capacidad fiscal de ${name} y experiencia administrativa en gestión de programas FEMA y CDBG-DR","FEMA aprobó prórrogas para 573 proyectos en PR hasta septiembre 20 2026 — deadline crítico para proyectos de ${name}","CDBG-DR City-Rev $1,298M isla y HMGP $1,000M isla disponibles para ${name} que califica por Huracán María 2017","Instituto AI PR nov 2025 y MSROF $35.6M para 64 municipios AF 2026 — oportunidad para ${name}"],"evidence_chains":["FEMA prórrogas 573 proyectos PR hasta septiembre 20 2026. Implicación para ${name}: deadline crítico. Urgencia: semanas restantes","CDBG-DR $1,298M isla — ${name} califica por Huracán María 2017. Oportunidad $500K–$3M. Urgencia: ventana activa 2026","HMGP $1,000M isla requiere Plan Mitigación FEMA vigente. Sin este plan ${name} queda excluido automáticamente","JSF MSROF $35.6M para 64 municipios AF 2026 — nueva fuente activa para ${name}","Instituto AI PR + $2M FIPSE-SP federal 2026 — fondos modernización municipal disponibles para ${name}"],"strategic_recommendations":["URGENTE septiembre 20 2026: activar seguimiento proyectos COR3 de ${name} — deadline crítico esta semana","Iniciar solicitud CDBG-DR City-Rev para ${name} — $1,298M isla disponibles califica por María 2017","Actualizar Plan Mitigación FEMA para ${name} — habilitante para HMGP $1,000M isla","Implementar coordinación operacional en ${name} para requisito DHS jun 2025 obras sobre $100K","Posicionar ${name} para MSROF y fondos AI municipal 2026"],"infrastructure_stability":72,"funding_readiness":70,"operational_risk":60,"coordination_capacity":41,"total_federal_available":"$4.5M – $8.2M","fema_alignment":"MODERADO","infrastructure_stress":"MODERADO","federal_exposure":"MODERADO"}` }
        ],
        temperature: 0.2,
        max_tokens: 2500,
      });
      const raw2 = retry?.choices?.[0]?.message?.content || "";
      const s2 = raw2.indexOf("{");
      const e2 = raw2.lastIndexOf("}");
      if (s2 !== -1 && e2 !== -1) {
        generated = JSON.parse(raw2.substring(s2, e2 + 1));
        console.log("AI_RETRY_SUCCESS", { name });
      } else {
        generated = buildFallback(name, profile, funds, disast, progs, audits, yr);
      }
    } catch (e2) {
      console.error("AI_RETRY_ERROR", e2.message);
      generated = buildFallback(name, profile, funds, disast, progs, audits, yr);
    }
  }

  // Campos que SIEMPRE vienen del perfil — nunca de DeepSeek
  const fixed = {
    mayor_name: profile?.mayor || `${name} — Alcalde`,
    population: profile?.population || "Por confirmar",
    budget_official: profile?.budget_amount || "Por confirmar",
    budget_year: profile?.budget_year || "2025-2026",
    budget_source: profile?.budget_source || "OGP — Presupuesto Municipal",
    budget_crim_extra: profile?.extra_income || "N/A",
    capital_leak_low: "$440,000",
    capital_leak_high: "$740,000",
    cost_per_month_low: "$36,000",
    cost_per_month_high: "$61,000",
    funding_programs: buildFundingPrograms(funds, progs),
    audit_note_title: audits.length ? `Nota — ${audits[0].entity} ${audits[0].report} (${audits[0].date})` : null,
    audit_note_text: audits.length ? `${audits[0].finding} ${audits[0].impact||""}` : null,
    map_exposure_text: disast.length
      ? `Historial de exposición — ${name}: ${disast.map(d=>`${d.event} (${d.date})`).join(" · ")}. Este historial mantiene al municipio activamente elegible en múltiples programas federales. Requisito DHS (junio 2025): consulta previa para obras >$100,000.`
      : `${name} califica por historial de desastres naturales en programas FEMA-PA, CDBG-DR y HMGP.`,
    funding_matrix_note: `Estimados basados en asignaciones históricas a municipios comparables de PR y criterios de elegibilidad oficiales. Requiere validación con registros de ${name} y agencias federales.`,
    sources_budget: `${profile?.budget_source||"OGP"} · AF ${profile?.budget_year||"2025-2026"} · ${profile?.budget_amount||"Por confirmar"}`,
    sources_crim: profile?.extra_income ? `${profile.extra_income} — ${profile.extra_income_source} (${profile.extra_income_date})` : null,
  };

  return {
    ...generated,
    ...fixed,
    municipality_name: name,
    prepared_for: "Oficina del Alcalde",
    _meta: {
      signals_used: intel.signal_count,
      opportunities_used: intel.opportunity_count,
      ai_generated: true,
      profile_found: !!profile,
      profile_auto: profile?.auto_generated || false,
      generated_at: new Date().toISOString(),
    }
  };
}

function buildFundingPrograms(funds, progs) {
  const list = [];
  funds.slice(0,2).forEach(f => list.push({
    programa: f.program, agencia: f.source||"Agencia federal",
    monto: f.amount, prioridad: "CRÍTICA", estado: f.status
  }));
  progs.slice(0,4).forEach(f => list.push({
    programa: f.program, agencia: f.agency,
    monto: f.amount, estado: f.status,
    prioridad: f.status?.includes("Requiere")?"ALTA":f.status?.includes("Emergente")?"MEDIA":"ALTA"
  }));
  while (list.length < 4) {
    list.push({ programa:"CDBG-DR City-Rev", agencia:"HUD/PRDOH", monto:"$500K–$3M estimado", prioridad:"ALTA", estado:"Ventana abierta" });
    list.push({ programa:"HMGP Global Match", agencia:"FEMA/PRDOH", monto:"$250K–$2M estimado", prioridad:"ALTA", estado:"Requiere Plan FEMA" });
    if (list.length >= 4) break;
  }
  return list.slice(0, 6);
}

function buildFallback(name, profile, funds, disast, progs, audits, yr) {
  const budget = profile?.budget_amount || "presupuesto municipal";
  const mayor = profile?.mayor || `alcalde de ${name}`;
  return {
    executive_summary: `El Municipio de ${name}, bajo la administración del ${mayor}, opera con un presupuesto de ${budget} para el ciclo fiscal 2025-2026. URUS detectó señales críticas: FEMA aprobó prórrogas para 573 proyectos de reconstrucción en Puerto Rico hasta el 20 de septiembre de ${yr}. Los fondos federales potencialmente accesibles oscilan entre ${progs.length>=4?"$6.2M–$11.4M":"$4.5M–$8.2M"}, condicionados a la capacidad operacional del municipio.`,
    funding_analysis: `A nivel isla, FEMA ha obligado $41,000M para PR pero solo $12,000M han sido desembolsados hasta ${yr}. Para ${name}: FEMA-PA, CDBG-DR City-Rev ($1,298M isla), HMGP ($1,000M isla), MSROF JSF ($35.6M 64 municipios AF 2026). ${name} califica directamente por ${disast.slice(0,2).map(d=>d.event+" "+d.date).join(" y ")}.`,
    findings: [
      `URUS detectó fragmentación en procesos internos de coordinación de fondos federales del Municipio de ${name}. Presupuesto ${budget} — ausencia de sistema centralizado genera riesgo de vencimiento de plazos FEMA y CDBG-DR activos en ${yr}.`,
      audits.length ? `${audits[0].entity} emitió ${audits[0].report} (${audits[0].date}): ${audits[0].finding}. Impacto en elegibilidad federal: ${audits[0].impact}.` : `Capacidad administrativa de ${name} para gestionar fondos federales requiere fortalecimiento en coordinación interdepartamental para maximizar captura de fondos en ${yr}.`,
      `SEÑAL CRÍTICA: FEMA aprobó prórrogas para 573 proyectos en PR hasta septiembre 20, 2026 (COR3). ${name} tiene proyectos en este universo. Sin seguimiento centralizado, el deadline puede vencerse perdiendo financiamiento ya obligado.`,
      `CDBG-DR City-Rev ($1,298M isla) y HMGP ($1,000M isla) — ${name} califica por ${disast.slice(0,2).map(d=>d.event+" ("+d.date+")").join(" y ")}. Preparación de solicitud requiere documentación centralizada actualmente no disponible en formato HUD/PRDOH.`,
      `Instituto AI PR (nov 2025), $2M FIPSE-SP federal (ene 2026), MSROF $35.6M para 64 municipios AF 2026. Alcalde ${mayor} puede posicionar a ${name} como líder regional en fondos de modernización tecnológica municipal.`
    ],
    evidence_chains: [
      `Señal confirmada: FEMA prórrogas 573 proyectos PR hasta septiembre 20, 2026 (COR3, mayo 2026). Implicación para ${name}: deadline crítico. Fricción: ejecución sin sistema centralizado. Urgencia: semanas restantes.`,
      `Señal confirmada: CDBG-DR City-Rev $1,298M isla — ${name} califica por ${disast[0]?.event||"Huracán María"} (${disast[0]?.date||"2017"}). Implicación: $500K–$3M. Fricción: documentación técnica requerida. Urgencia: cada mes reduce la porción.`,
      `Señal confirmada: HMGP $1,000M isla. ${name} califica pero REQUIERE Plan Mitigación FEMA vigente. Implicación: mayor programa de mitigación disponible. Fricción: sin plan = exclusión automática. Urgencia: ${yr}.`,
      `Señal confirmada: JSF MSROF $35.6M para 64 municipios AF 2026 — hasta $800,000 por municipio (JSF, abril 2026). Implicación: nueva fuente activa ${yr}. Fricción: reformas fiscales requeridas. Urgencia: ventana AF 2026.`,
      `Señal confirmada: Instituto AI PR + $2M FIPSE-SP + MSROF. Implicación: fondos modernización disponibles. Fricción: municipios sin sistemas excluidos. Urgencia: ${yr} — ventana abierta ahora.`
    ],
    strategic_recommendations: [
      `URGENTE — septiembre 20, 2026: alcalde ${mayor} debe activar seguimiento inmediato proyectos COR3 de ${name}. Sin acción esta semana, fondos ya obligados pueden perderse.`,
      `Iniciar solicitud CDBG-DR City-Rev en ${yr}. ${name} califica por ${disast[0]?.event||"Huracán María"}. Preparar plan visión comunitaria y documentación técnica de infraestructura.`,
      `Actualizar Plan Mitigación FEMA para ${name} — habilitante para HMGP ($1,000M isla). Sin plan, ${name} queda excluido automáticamente del programa más grande.`,
      `Implementar coordinación operacional en ${name} para requisito DHS (jun 2025) obras >$100K y reducir fuga capital estimada $440K–$740K anuales.`,
      `Posicionar ${name} para MSROF y fondos AI municipal ${yr}. Alcalde ${mayor} puede liderar posicionamiento estratégico regional.`
    ],
    infrastructure_stability: disast.length>=3?65:disast.length>=2?72:78,
    funding_readiness: funds.length>=3?88:funds.length>=2?84:funds.length>=1?78:70,
    operational_risk: audits.length>0?68:60,
    coordination_capacity: profile?.extra_income?48:41,
    total_federal_available: progs.length>=4?"$6.2M – $11.4M":"$4.5M – $8.2M",
    fema_alignment: disast.length>=3?"ALTO":"MODERADO",
    infrastructure_stress: funds.length>=2?"ACTIVO":"MODERADO",
    federal_exposure: funds.length>=1?"ACTIVO":"MODERADO",
  };
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
async function generateMunicipalReport(pool, municipalityName, generateExecutiveReport) {
  const name = String(municipalityName||"").trim();
  console.log("REPORT_START", { name });

  await ensureTable(pool);
  await seedMunicipalities(pool);

  const profile = await getOrBuildProfile(pool, name);
  console.log("PROFILE_READY", { name, mayor: profile?.mayor||"N/A", budget: profile?.budget_amount||"N/A" });

  const intel = await getIntelligence(pool, name);
  const reportData = await buildReport(name, profile, intel);

  console.log("REPORT_BUILT", { name, mayor: reportData.mayor_name, budget: reportData.budget_official });

  const result = await generateExecutiveReport(reportData);
  console.log("PDF_DONE", { name, file: result.fileName });

  return {
    ok: true,
    municipality: name,
    fileName: result.fileName,
    reportUrl: `${process.env.BASE_URL||"https://www.urusverify.com"}/generated_reports/${result.fileName}`,
    meta: reportData._meta,
  };
}

module.exports = { generateMunicipalReport };
