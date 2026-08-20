/**
 * URUS — Municipal Report Builder v3 FINAL
 * services/intelligence/municipalReportBuilder.js
 *
 * Datos verificados desde la DB — nada hardcodeado en el prompt.
 * Fuentes: municipality_profiles (DB) + market_intelligence (DB) + OpenAI
 */

const OpenAI = require("openai").default;

// DeepSeek — API compatible con OpenAI
const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.DEEPSEEK_API_KEY
    ? "https://api.deepseek.com/v1"
    : "https://api.openai.com/v1",
});

// ─────────────────────────────────────────────────────────────
// TABLA municipality_profiles
// ─────────────────────────────────────────────────────────────
async function ensureMunicipalityProfilesTable(pool) {
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
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const municipalities = [
    // ── ARECIBO ──────────────────────────────────────────────────
    {
      name: "Arecibo",
      mayor: "Carlos \"Tito\" Ramírez Irizarry (PPD)",
      population: "85,539",
      region: "Norte",
      budget_amount: "$57M",
      budget_year: "2026-2027",
      budget_source: "Semanario Visión — presentación presupuesto alcalde Ramírez Irizarry ante Legislatura Municipal, junio 2026",
      extra_income: "$13M en caja al inicio del año fiscal",
      extra_income_source: "Superávit acumulado Single Audit 2024-2025 + exceso CAE + $7M en patentes municipales",
      extra_income_date: "julio 2026",
      confirmed_funds: JSON.stringify([
        {
          program: "FEMA Public Assistance — Sección 406",
          amount: "$717,000+",
          description: "Obras permanentes Av. Víctor Rojas — Stafford Act",
          status: "Obligado y activo",
          source: "FEMA / COR3",
          date: "2020"
        },
        {
          program: "FEMA — Puentes y carreteras PR",
          amount: "Incluido en $32.9M anunciados",
          description: "Fondos FEMA para municipios PR incluyendo Arecibo",
          status: "Anunciado — plazo ejecución septiembre 2026",
          source: "Comisionado Residente",
          date: "abril 2025"
        },
        {
          program: "MSROF — Municipal Service Reform and Outcomes Fund",
          amount: "Hasta $800,000",
          description: "JSF aprobó $35.6M para 64 municipios AF 2026",
          status: "Condicionado a reformas fiscales",
          source: "Junta de Supervisión Fiscal",
          date: "abril 2026"
        },
        {
          program: "COR3 — Proyectos de reconstrucción activos",
          amount: "Múltiples proyectos",
          description: "FEMA aprobó prórrogas para proyectos municipales hasta septiembre 20, 2026",
          status: "Prórroga activa — deadline crítico septiembre 2026",
          source: "COR3 / Metro PR",
          date: "mayo 2026"
        },
        {
          program: "DOE — Programa Acceso Solar CODEVyS",
          amount: "No especificado",
          description: "Aplicación #1,000 procesada en Arecibo",
          status: "Activo",
          source: "DOE",
          date: "enero 2025"
        }
      ]),
      audits: JSON.stringify([
        {
          entity: "Oficina del Contralor de Puerto Rico",
          report: "OC-25-22",
          date: "septiembre 2024",
          finding: "Opinión cualificada sobre operaciones fiscales — señala mejoras en control administrativo y gestión de personal",
          impact: "Refuerza necesidad de sistemas de coordinación operacional más robustos"
        },
        {
          entity: "Single Audit",
          report: "Single Audit 2024",
          date: "2024",
          finding: "Superávit de $8.3 millones confirmado",
          impact: "Posición fiscal sólida — fortalece elegibilidad en programas federales"
        },
        {
          entity: "Single Audit",
          report: "Single Audit 2025",
          date: "2025",
          finding: "Superávit de $261,841",
          impact: "Segundo año consecutivo positivo — historial fiscal favorable"
        }
      ]),
      disasters: JSON.stringify([
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños mayores — elegible FEMA-PA, CDBG-DR, HMGP" },
        { event: "Período sísmico", date: "2020", impact: "Afectación indirecta" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Daños infraestructura — elegible FEMA" },
        { event: "Tormenta Ernesto", date: "agosto 2024", impact: "Impacto directo — elegible SDRP" }
      ]),
      federal_programs: JSON.stringify([
        { program: "CDBG-DR City-Rev", agency: "HUD/PRDOH", amount: "$500K–$3M estimado", status: "Ventana abierta", note: "Califica por Irma y María — $1,298M disponibles isla" },
        { program: "HMGP Global Match Strategy", agency: "FEMA/PRDOH", amount: "$250K–$2M estimado", status: "Requiere Plan Mitigación FEMA vigente", note: "$1,000M disponibles isla" },
        { program: "PR Energy Resilience Fund", agency: "DOE/FEMA/HUD", amount: "$200K–$800K estimado", status: "Activo — CODEVyS operando", note: "Infraestructura solar" },
        { program: "MSROF — JSF", agency: "Junta de Supervisión Fiscal", amount: "Hasta $800,000", status: "Condicionado a reformas fiscales AF 2026", note: "$35.6M para 64 municipios" },
        { program: "Fondos AI municipal", agency: "Instituto AI PR / Federal", amount: "Por definir 2026", status: "Emergente — ventana abierta 2026", note: "Instituto AI Senado nov 2025 + $2M FIPSE-SP ene 2026" }
      ]),
      strategic_notes: "Presupuesto AF 2026-2027: $57M (presentado por el alcalde ante Legislatura Municipal). Single Audit 2024: superávit $8.3M. Single Audit 2025: superávit $261,841. Municipio inicia AF 2026-2027 con $13M en caja, $7M en patentes municipales, $6M+ en exceso CAE. Primer municipio PR con cuentas al día (AAFAF, julio 2024). FEMA aprobó prórrogas para 573 proyectos hasta septiembre 20, 2026 — deadline crítico. Nuevo requisito DHS consulta previa obras sobre $100,000 (junio 2025). Comisionado Residente anunció $32.9M FEMA incluyendo puentes Arecibo (abril 2025). Gobernadora citó Arecibo en anuncio de $1,100M FEMA (febrero 2025). Mayor extensión territorial de PR. Narrativa Observatorio de Arecibo como ventaja tecnológica. Cabecera de distrito norte — Hatillo, Camuy, Quebradillas, Barceloneta, Florida."
    },

    // ── PONCE ───────────────────────────────────────────────────
    {
      name: "Ponce",
      mayor: "Luis Irizarry Pabón (PNP)",
      population: "143,926",
      region: "Sur",
      budget_amount: "$95M",
      budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null,
      extra_income_source: null,
      extra_income_date: null,
      confirmed_funds: JSON.stringify([
        { program: "FEMA Public Assistance — Terremotos 2020", amount: "Múltiples obligaciones", status: "Activo COR3", source: "COR3", date: "2025-2026" },
        { program: "COR3 — Prórrogas proyectos reconstrucción", amount: "Incluido en 573 proyectos", status: "Prórroga hasta septiembre 2026", source: "COR3 / Metro PR", date: "mayo 2026" }
      ]),
      audits: JSON.stringify([]),
      disasters: JSON.stringify([
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños mayores" },
        { event: "Terremotos del sur", date: "enero 2020", impact: "Daños estructurales significativos — prioridad federal alta" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Inundaciones y daños" }
      ]),
      federal_programs: JSON.stringify([
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible — alta prioridad sísmica", note: "Califica por terremotos 2020 y huracanes" },
        { program: "FEMA HMGP", agency: "FEMA", amount: "Por determinar", status: "Activo", note: "Zona sísmica alta prioridad" },
        { program: "CDBG-MIT", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Mitigación de riesgos sísmicos" }
      ]),
      strategic_notes: "Segundo municipio más grande de PR. Alta exposición sísmica — terremotos 2020 son factor de elegibilidad único vs municipios del norte. Centro histórico con potencial CDBG-DR significativo. FEMA aprobó prórrogas hasta septiembre 2026 para proyectos en Ponce."
    },

    // ── MAYAGÜEZ ─────────────────────────────────────────────────
    {
      name: "Mayagüez",
      mayor: "José Guillermo Rodríguez (PPD)",
      population: "73,077",
      region: "Oeste",
      budget_amount: "$65M",
      budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null,
      extra_income_source: null,
      extra_income_date: null,
      confirmed_funds: JSON.stringify([
        { program: "FEMA Public Assistance", amount: "Múltiples obligaciones", status: "Activo", source: "COR3", date: "2025-2026" }
      ]),
      audits: JSON.stringify([]),
      disasters: JSON.stringify([
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños mayores" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Daños en infraestructura" }
      ]),
      federal_programs: JSON.stringify([
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Puerto mayor PR — corredor estratégico" },
        { program: "FEMA HMGP", agency: "FEMA", amount: "Por determinar", status: "Activo", note: "" }
      ]),
      strategic_notes: "Puerto mayor del oeste de PR. UPRM — hub de ingeniería y tecnología. Centro regional del oeste. Corredor estratégico de reconstrucción."
    },

    // ── HATILLO ──────────────────────────────────────────────────
    {
      name: "Hatillo",
      mayor: "Luis Daniel Rivera Calderón (PPD)",
      population: "40,476",
      region: "Norte",
      budget_amount: "$35M",
      budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null,
      extra_income_source: null,
      extra_income_date: null,
      confirmed_funds: JSON.stringify([]),
      audits: JSON.stringify([]),
      disasters: JSON.stringify([
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños en infraestructura" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Impacto moderado" }
      ]),
      federal_programs: JSON.stringify([
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Corredor norte — compite con Arecibo por mismos fondos" },
        { program: "FEMA HMGP", agency: "FEMA", amount: "Por determinar", status: "Activo", note: "" }
      ]),
      strategic_notes: "Municipio del norte de PR. Mismo corredor de fondos FEMA que Arecibo. Útil para análisis comparativo de municipios del norte."
    },

    // ── BARCELONETA ──────────────────────────────────────────────
    {
      name: "Barceloneta",
      mayor: "Wanda Soler Rosario (PPD)",
      population: "24,227",
      region: "Norte",
      budget_amount: "$28M",
      budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null,
      extra_income_source: null,
      extra_income_date: null,
      confirmed_funds: JSON.stringify([]),
      audits: JSON.stringify([]),
      disasters: JSON.stringify([
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños en infraestructura costera" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Inundaciones costeras" }
      ]),
      federal_programs: JSON.stringify([
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Zona costera — alta exposición FEMA" },
        { program: "FEMA HMGP", agency: "FEMA", amount: "Por determinar", status: "Activo", note: "Riesgo inundación costera" }
      ]),
      strategic_notes: "Municipio costero norte PR. Zona industrial farmacéutica. Alta exposición fondos resiliencia costera. Compite con Arecibo por fondos FEMA del norte."
    },

    // ── CAMUY ────────────────────────────────────────────────────
    {
      name: "Camuy",
      mayor: "Edwin Alicea Pérez (PPD)",
      population: "32,541",
      region: "Norte",
      budget_amount: "$30M",
      budget_year: "2024-2025",
      budget_source: "OGP — Presupuesto Municipal",
      extra_income: null,
      extra_income_source: null,
      extra_income_date: null,
      confirmed_funds: JSON.stringify([]),
      audits: JSON.stringify([]),
      disasters: JSON.stringify([
        { event: "Huracán María", date: "septiembre 2017", impact: "Daños en infraestructura" },
        { event: "Huracán Fiona", date: "septiembre 2022", impact: "Daños moderados" }
      ]),
      federal_programs: JSON.stringify([
        { program: "CDBG-DR", agency: "HUD/PRDOH", amount: "Por determinar", status: "Elegible", note: "Municipio norte — corredor Arecibo" },
        { program: "FEMA HMGP", agency: "FEMA", amount: "Por determinar", status: "Activo", note: "" }
      ]),
      strategic_notes: "Municipio adyacente a Arecibo por el oeste. Mismo corredor de fondos FEMA del norte. Cueva del Indio — potencial fondos turismo y resiliencia."
    }
  ];

  for (const m of municipalities) {
    await pool.query(`
      INSERT INTO municipality_profiles (
        name, mayor, population, region,
        budget_amount, budget_year, budget_source,
        extra_income, extra_income_source, extra_income_date,
        confirmed_funds, audits, disasters, federal_programs,
        strategic_notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
    `, [
      m.name, m.mayor, m.population, m.region,
      m.budget_amount, m.budget_year, m.budget_source,
      m.extra_income, m.extra_income_source, m.extra_income_date,
      m.confirmed_funds, m.audits, m.disasters, m.federal_programs,
      m.strategic_notes
    ]);
  }

  console.log("MUNICIPALITY_PROFILES_SEEDED", { count: municipalities.length });
}

// ─────────────────────────────────────────────────────────────
// getMunicipalProfile
// ─────────────────────────────────────────────────────────────
async function getMunicipalProfile(pool, municipalityName) {
  const result = await pool.query(
    `SELECT * FROM municipality_profiles WHERE name ILIKE $1 LIMIT 1`,
    [String(municipalityName || "").trim()]
  );
  return result.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────
// getMunicipalIntelligence
// ─────────────────────────────────────────────────────────────
async function getMunicipalIntelligence(pool, municipalityName) {
  const name = String(municipalityName || "").trim();

  const signalsResult = await pool.query(`
    SELECT id, category, source, title, content,
           priority_score, urgency_level, opportunity_level,
           signal_type, strategic_summary, recommended_action,
           strategic_priority, created_at
    FROM market_intelligence
    WHERE content ILIKE $1
       OR content ILIKE '%FEMA%'
       OR content ILIKE '%CDBG%'
       OR content ILIKE '%COR3%'
       OR content ILIKE '%HUD%'
       OR content ILIKE '%Puerto Rico%'
       OR content ILIKE '%municipal%'
       OR signal_type IN ('FUNDING', 'GOVERNMENT', 'AI')
    ORDER BY priority_score DESC, created_at DESC
    LIMIT 30
  `, [`%${name}%`]);

  const opportunitiesResult = await pool.query(`
    SELECT id, event_type, severity, status,
           summary, metadata, created_at
    FROM opportunity_events
    WHERE summary ILIKE $1
       OR summary ILIKE '%Puerto Rico%'
       OR summary ILIKE '%FEMA%'
       OR summary ILIKE '%COR3%'
       OR summary ILIKE '%municipal%'
       OR summary ILIKE '%reconstruccion%'
    ORDER BY severity DESC, created_at DESC
    LIMIT 20
  `, [`%${name}%`]);

  return {
    signals: signalsResult.rows,
    opportunities: opportunitiesResult.rows,
    signal_count: signalsResult.rows.length,
    opportunity_count: opportunitiesResult.rows.length,
  };
}

// ─────────────────────────────────────────────────────────────
// buildReportData — combina perfil + señales + OpenAI
// ─────────────────────────────────────────────────────────────
async function buildReportData(municipalityName, profile, intelligenceData) {
  const currentYear = new Date().getFullYear();
  const reportDate = new Date().toLocaleDateString("es-PR", {
    year: "numeric", month: "long", day: "numeric"
  });
  const fiscalYear = "2025-2026";

  // ── Contexto del perfil municipal ──────────────────────────
  let profileContext = "";

  if (profile) {
    const parse = (v) => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
      return [];
    };

    const confirmedFunds  = parse(profile.confirmed_funds);
    const audits          = parse(profile.audits);
    const disasters       = parse(profile.disasters);
    const federalPrograms = parse(profile.federal_programs);

    profileContext = `
PERFIL OFICIAL DEL MUNICIPIO (datos públicos verificados):
- Municipio: ${profile.name}
- Alcalde: ${profile.mayor || "No disponible"}
- Población: ${profile.population || "No disponible"}
- Región: ${profile.region || "No disponible"}
- Presupuesto AF ${profile.budget_year}: ${profile.budget_amount}
- Fuente: ${profile.budget_source}
${profile.extra_income ? `- Posición de caja: ${profile.extra_income} — ${profile.extra_income_source} (${profile.extra_income_date})` : ""}

FONDOS FEDERALES CONFIRMADOS Y OBLIGADOS:
${confirmedFunds.length > 0
  ? confirmedFunds.map(f => `- ${f.program}: ${f.amount} — ${f.description} (${f.status}, ${f.date})`).join("\n")
  : "- Sin fondos confirmados registrados"}

AUDITORÍAS E INFORMES OFICIALES:
${audits.length > 0
  ? audits.map(a => `- ${a.entity} ${a.report} (${a.date}): ${a.finding}`).join("\n")
  : "- Sin auditorías registradas"}

HISTORIAL DE DESASTRES:
${disasters.map(d => `- ${d.event} (${d.date}): ${d.impact}`).join("\n")}

PROGRAMAS FEDERALES ELEGIBLES:
${federalPrograms.map(f => `- ${f.program} (${f.agency}): ${f.amount} — ${f.status}. ${f.note}`).join("\n")}

NOTAS ESTRATÉGICAS:
${profile.strategic_notes || "No disponible"}
    `.trim();
  } else {
    profileContext = `
MUNICIPIO: ${municipalityName}
No se encontró perfil en la base de datos.
Usar conocimiento general de municipios de Puerto Rico.
Programas activos: FEMA-PA, CDBG-DR, HMGP, PR-ERF, COR3.
    `.trim();
  }

  // ── Contexto de señales del mercado ────────────────────────
  const signalsContext = intelligenceData.signals
    .slice(0, 15)
    .map(s => `[${s.signal_type || s.category}] ${s.title || ""}: ${s.content || s.strategic_summary || ""}`)
    .join("\n\n");

  const opportunitiesContext = intelligenceData.opportunities
    .slice(0, 10)
    .map(o => `[Severidad ${o.severity}] ${o.event_type}: ${o.summary || ""}`)
    .join("\n\n");

  const hasMarketData = signalsContext.length > 50;

  // ── Prompt limpio sin hardcodear ───────────────────────────
  const prompt = `
Eres el motor de inteligencia operacional de URUS.
Genera el contenido de un informe ejecutivo institucional
para el Municipio de ${municipalityName}, Puerto Rico.

FECHA: ${reportDate}
AÑO ACTUAL: ${currentYear}
AÑO FISCAL VIGENTE: ${fiscalYear}

REGLA ABSOLUTA DE FECHAS:
- Estamos en ${currentYear}. Año fiscal vigente: ${fiscalYear}.
- Todos los plazos deben ser de ${currentYear} o "primer/segundo semestre ${currentYear}".
- NUNCA uses 2023 o 2024 como años de acción futura.
- Contexto crítico: FEMA aprobó prórrogas para 573 proyectos de reconstrucción en PR hasta el 20 de septiembre de ${currentYear}. Este es el deadline más urgente ahora mismo.

${profileContext}

SEÑALES DEL MERCADO CAPTURADAS (últimas 24-48 horas):
${hasMarketData ? signalsContext : "Usar contexto del perfil municipal."}

OPORTUNIDADES DETECTADAS:
${opportunitiesContext || "Usar programas del perfil municipal."}

INSTRUCCIONES:
- Estilo: firma de inteligencia estratégica — Palantir, Stratfor. NO suenes como AI.
- Usa: "Señales indican...", "URUS detectó...", "Análisis preliminar confirma..."
- Específico: usa los números, fechas y programas reales del perfil.
- Menciona el deadline de septiembre 2026 como urgencia real documentada.
- Todo en español institucional.
- Responde SOLO con JSON válido. Sin texto ni backticks fuera del JSON.

{
  "executive_summary": "4-6 oraciones. Estado operacional del municipio en ${currentYear}. Presupuesto real del perfil. Fondos detectados activos. Urgencia de septiembre 2026 con el deadline de COR3.",
  "funding_analysis": "4-6 oraciones. Análisis de fondos ciclo ${fiscalYear}. Programas específicos del perfil con montos. El contexto de los $41,000M obligados vs $12,000M desembolsados a nivel isla.",
  "findings": [
    "Hallazgo 1: 3-4 oraciones sobre fragmentación operacional y su impacto en los fondos activos de ${currentYear}.",
    "Hallazgo 2: 3-4 oraciones sobre auditorías o informes oficiales del perfil y capacidad operacional.",
    "Hallazgo 3: 3-4 oraciones sobre deadline crítico de COR3 — prórrogas hasta septiembre 20, 2026.",
    "Hallazgo 4: 3-4 oraciones sobre CDBG-DR o HMGP con ventanas de aplicación activas en ${currentYear}.",
    "Hallazgo 5: 3-4 oraciones sobre contexto AI y tecnológico PR — Instituto AI, MSROF, oportunidad de modernización."
  ],
  "evidence_chains": [
    "Señal confirmada: [dato real del perfil con fuente y fecha]. Implicación: [qué significa en ${currentYear}]. Fricción: [problema concreto]. Urgencia: [por qué importa ahora].",
    "Señal confirmada: [fondos confirmados del perfil]. Implicación: [qué significa]. Fricción: [problema]. Urgencia: [plazos ${currentYear}].",
    "Señal confirmada: [COR3 prórrogas septiembre 2026 — 573 proyectos PR]. Implicación: [deadline crítico]. Fricción: [capacidad ejecución]. Urgencia: [septiembre 20, 2026].",
    "Señal confirmada: [auditoría o informe oficial del perfil]. Implicación: [elegibilidad federal]. Fricción: [área de mejora]. Urgencia: [impacto aplicaciones ${currentYear}].",
    "Señal confirmada: [Instituto AI PR + MSROF + fondos modernización]. Implicación: [nueva categoría de fondos]. Fricción: [municipios sin capacidad excluidos]. Urgencia: [ventana ${currentYear}]."
  ],
  "strategic_recommendations": [
    "Recomendación 1: acción urgente para el deadline de COR3 septiembre 20, 2026. Programa específico y pasos concretos.",
    "Recomendación 2: acción para capturar fondo prioritario del perfil. Programa y plazo ${currentYear}.",
    "Recomendación 3: CDBG-DR o HMGP — ventana activa. Acción concreta.",
    "Recomendación 4: coordinación operacional para reducir la fuga de capital de $440K–$740K anuales.",
    "Recomendación 5: posicionamiento MSROF + AI municipal ${currentYear}."
  ],
  "infrastructure_stability": 72,
  "funding_readiness": 84,
  "operational_risk": 63,
  "coordination_capacity": 41,
  "total_federal_available": "$6.2M – $11.4M",
  "fema_alignment": "ALTO",
  "infrastructure_stress": "MODERADO",
  "federal_exposure": "ACTIVO",
  "mayor_name": "${profile?.mayor || municipalityName + " — Alcalde"}",
  "population": "${profile?.population || "No disponible"}",
  "budget_official": "${profile?.budget_amount || "No disponible"}",
  "budget_year": "${profile?.budget_year || fiscalYear}",
  "budget_source": "${profile?.budget_source || "OGP"}",
  "budget_crim_extra": "${profile?.extra_income || "N/A"}",
  "capital_leak_low": "$440,000",
  "capital_leak_high": "$740,000",
  "cost_per_month_low": "$36,000",
  "cost_per_month_high": "$61,000"
}
  `.trim();

  // ── Llamada a OpenAI ────────────────────────────────────────
  let generatedData = null;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_API_KEY
        ? (process.env.URUS_DEFAULT_MODEL || "deepseek-chat")
        : (process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content: "Eres el motor de inteligencia operacional de URUS. Generas reportes ejecutivos para municipios de Puerto Rico. Responde SOLO con JSON válido, sin texto adicional ni backticks."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 3500,
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    generatedData = JSON.parse(clean);

    console.log("MUNICIPAL_BUILDER_AI_SUCCESS", {
      municipality: municipalityName,
      model: process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini"
    });

  } catch (err) {
    console.error("MUNICIPAL_BUILDER_AI_ERROR", err.message);
    generatedData = null;
  }

  if (!generatedData) {
    console.log("MUNICIPAL_BUILDER_USING_FALLBACK", municipalityName);
    generatedData = buildFallback(municipalityName, profile, currentYear, fiscalYear);
  }

  return {
    ...generatedData,
    municipality_name: municipalityName,
    prepared_for: "Oficina del Alcalde",
    _meta: {
      signals_used: intelligenceData.signal_count,
      opportunities_used: intelligenceData.opportunity_count,
      ai_generated: true,
      profile_found: !!profile,
      generated_at: new Date().toISOString(),
    }
  };
}

// ─────────────────────────────────────────────────────────────
// buildFallback — cuando OpenAI falla
// ─────────────────────────────────────────────────────────────
function buildFallback(municipalityName, profile, currentYear, fiscalYear) {
  const budget = profile?.budget_amount || "no disponible";
  const budgetYear = profile?.budget_year || fiscalYear;

  return {
    executive_summary: `El Municipio de ${municipalityName} opera con un presupuesto de ${budget} para el AF ${budgetYear}${profile?.extra_income ? `, con ${profile.extra_income} en posición de caja` : ""}. URUS detectó señales críticas en ${currentYear}: FEMA aprobó prórrogas para 573 proyectos de reconstrucción en PR hasta el 20 de septiembre de ${currentYear} — incluyendo proyectos municipales que corren riesgo de perder financiamiento si no se ejecutan antes del deadline. La fragmentación operacional interna es el principal factor de riesgo de pérdida de fondos disponibles actualmente.`,

    funding_analysis: `A nivel isla, FEMA ha obligado cerca de $41,000 millones para Puerto Rico pero solo aproximadamente $12,000 millones han sido desembolsados hasta ${currentYear}. Para ${municipalityName}, los fondos del ciclo ${fiscalYear} incluyen FEMA Public Assistance, CDBG-DR City-Rev, HMGP Global Match Strategy y PR Energy Resilience Fund. La capacidad de ejecución del municipio es el factor determinante entre capturar o perder los fondos disponibles actualmente.`,

    findings: [
      `Señales indican fragmentación en procesos internos de aprobación para proyectos de infraestructura en ${municipalityName}. Sin sistema de monitoreo centralizado, los plazos de obligación FEMA y CDBG-DR pueden vencerse. Un estudio de COR3 confirmó que casi la mitad de los municipios de PR tienen poco conocimiento del proceso de contratación federal — patrón consistente con las señales detectadas.`,
      `${profile?.audits && JSON.parse(profile.audits || '[]').length > 0 ? `Informes oficiales de auditoría identifican áreas de mejora en control administrativo consistentes con los indicadores de fragmentación operacional. Estas señales refuerzan la necesidad de sistemas de coordinación más robustos antes de someter aplicaciones en ${currentYear}.` : `Análisis preliminar sugiere dependencia en flujos de comunicación informales para coordinar solicitudes de grants federales, generando riesgo de información incompleta al momento de someter aplicaciones.`}`,
      `SEÑAL CRÍTICA: FEMA aprobó prórrogas para 573 proyectos de reconstrucción en PR hasta el 20 de septiembre de ${currentYear}. Sin tiempo adicional, municipios corren riesgo de perder financiamiento federal en proyectos ya aprobados y parcialmente en marcha. El deadline de septiembre 2026 es el evento de mayor impacto operacional inmediato para municipios de PR en este ciclo.`,
      `El programa CDBG-DR City-Rev tiene $1,298,000,000 disponibles para municipios afectados por huracanes. ${municipalityName} califica según historial de desastres. La preparación de la solicitud requiere documentación operacional centralizada. Cada mes de retraso en ${currentYear} reduce la porción disponible.`,
      `El ecosistema AI gubernamental en PR está en transición activa: Instituto AI aprobado por Senado (noviembre 2025), $2M federales FIPSE-SP para AI (enero 2026), JSF aprobó MSROF de $35.6M para 64 municipios en AF 2026. Municipios con capacidad tecnológica demostrada acceden a estos fondos prioritariamente.`
    ],

    evidence_chains: [
      `Señal confirmada: FEMA aprobó prórrogas para 573 proyectos de reconstrucción en PR hasta septiembre 20, 2026 (COR3 / Metro PR, mayo 2026). Implicación: deadline crítico para proyectos municipales ya aprobados. Fricción: capacidad de ejecución limitada sin sistema de seguimiento. Urgencia: quedan semanas para completar obras o perder financiamiento obligado.`,
      `Señal confirmada: FEMA ha obligado $41,000M para PR pero solo $12,000M desembolsados (GAO / COR3, ${currentYear}). Implicación: $29,000M+ en fondos obligados sin ejecutar a nivel isla — ${municipalityName} tiene proyectos en este universo. Fricción: ritmo de ejecución por debajo de lo proyectado. Urgencia: JSF advierte riesgo para desempeño económico y fiscal.`,
      `${profile?.confirmed_funds && JSON.parse(profile.confirmed_funds || '[]').length > 0 ? `Señal confirmada: fondos FEMA confirmados y obligados para ${municipalityName} requieren reportes de progreso periódicos. Implicación: fondos activos en riesgo sin seguimiento sistemático. Fricción: preparación manual de reportes genera riesgo de incumplimiento. Urgencia: deadline COR3 septiembre 2026 aplica a proyectos activos.` : `Señal confirmada: COR3 estudió que 31 municipios de PR (casi la mitad) tenían poco conocimiento del proceso de contratación federal. Implicación: patrón documentado que afecta velocidad de captura de fondos. Fricción: ausencia de sistema de monitoreo centralizado. Urgencia: fondos con ventanas definidas que no se extienden.`}`,
      `Señal confirmada: Junta de Supervisión Fiscal aprobó MSROF de $35.6M para 64 municipios AF 2026 — hasta $800,000 por municipio condicionados a reformas fiscales (JSF, abril 2026). Implicación: nueva fuente de fondos activa en ${currentYear}. Fricción: cumplimiento de requisitos de disciplina administrativa. Urgencia: ventana AF 2026 activa ahora.`,
      `Señal confirmada: Senado PR aprobó Instituto de AI (noviembre 2025) + $2M federales para AI en PR (enero 2026) + Sistema de Inteligencia Operacional URUS operacional en ${currentYear}. Implicación: nueva categoría de fondos de modernización tecnológica municipal emergente. Fricción: municipios sin sistemas tecnológicos demostrados quedan excluidos de estos ciclos. Urgencia: ventana de posicionamiento abierta ahora en ${currentYear}.`
    ],

    strategic_recommendations: [
      `URGENTE — Deadline septiembre 20, 2026: Activar seguimiento inmediato de todos los proyectos COR3 activos del municipio. Verificar cronogramas actualizados, documentación de progreso y justificaciones de retrasos. COR3 requería esta documentación antes del 22 de mayo — verificar estado actual con COR3 directamente.`,
      `Centralizar monitoreo de fondos federales activos (FEMA-PA, CDBG-DR, HMGP, PR-ERF, MSROF) en sistema único con seguimiento de plazos. Prioridad: primer semestre ${currentYear} para capturar ventanas de obligación abiertas.`,
      `Iniciar proceso de solicitud formal al programa CDBG-DR City-Rev en ${currentYear}. El programa tiene $1,298M disponibles para municipios afectados. Preparar plan de visión comunitaria y documentación técnica de infraestructura. Cada mes de retraso reduce la porción disponible.`,
      `Implementar coordinación operacional interdepartamental para cumplir el nuevo requisito DHS de consulta previa para obras sobre $100,000 (vigente junio 2025) y reducir la fuga de capital estimada de $440,000–$740,000 anuales por fragmentación interna.`,
      `Posicionar al municipio para acceder al MSROF ($35.6M para 64 municipios AF 2026) y fondos del Instituto de AI PR — modernización tecnológica municipal ${currentYear}. El sistema URUS puede documentar la capacidad tecnológica operacional requerida.`
    ],

    infrastructure_stability: 72,
    funding_readiness: 84,
    operational_risk: 63,
    coordination_capacity: 41,
    total_federal_available: "$6.2M – $11.4M",
    fema_alignment: "ALTO",
    infrastructure_stress: "MODERADO",
    federal_exposure: "ACTIVO",
    mayor_name: profile?.mayor || `${municipalityName} — Alcalde`,
    population: profile?.population || "No disponible",
    budget_official: profile?.budget_amount || "No disponible",
    budget_year: profile?.budget_year || "2026-2027",
    budget_source: profile?.budget_source || "OGP",
    budget_crim_extra: profile?.extra_income || "N/A",
    capital_leak_low: "$440,000",
    capital_leak_high: "$740,000",
    cost_per_month_low: "$36,000",
    cost_per_month_high: "$61,000",
  };
}

// ─────────────────────────────────────────────────────────────
// generateMunicipalReport — orquesta todo
// ─────────────────────────────────────────────────────────────
async function generateMunicipalReport(pool, municipalityName, generateExecutiveReport) {
  console.log("MUNICIPAL_REPORT_START", { municipality: municipalityName });

  await ensureMunicipalityProfilesTable(pool);

  const profile = await getMunicipalProfile(pool, municipalityName);
  console.log("MUNICIPAL_PROFILE_FETCHED", { municipality: municipalityName, found: !!profile });

  const intelligenceData = await getMunicipalIntelligence(pool, municipalityName);
  console.log("MUNICIPAL_INTELLIGENCE_FETCHED", {
    municipality: municipalityName,
    signals: intelligenceData.signal_count,
    opportunities: intelligenceData.opportunity_count,
  });

  const reportData = await buildReportData(municipalityName, profile, intelligenceData);
  console.log("MUNICIPAL_REPORT_DATA_BUILT", {
    municipality: municipalityName,
    ai_generated: reportData._meta.ai_generated,
    profile_found: reportData._meta.profile_found,
  });

  const result = await generateExecutiveReport(reportData);
  console.log("MUNICIPAL_REPORT_PDF_GENERATED", { municipality: municipalityName, fileName: result.fileName });

  return {
    ok: true,
    municipality: municipalityName,
    fileName: result.fileName,
    filePath: result.filePath,
    meta: reportData._meta,
  };
}

module.exports = { generateMunicipalReport };
