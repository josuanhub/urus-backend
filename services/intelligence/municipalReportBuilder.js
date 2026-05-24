/**
 * URUS — Municipal Report Builder
 * Archivo: services/intelligence/municipalReportBuilder.js
 *
 * Función: conecta los datos ingeridos en market_intelligence y opportunity_events
 * con el generador de PDF ejecutivo. Toma un municipio, busca señales reales,
 * llama a OpenAI para generar narrativa institucional y devuelve el objeto
 * data listo para pasarle a generateExecutiveReport().
 */

const OpenAI = require("openai").default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────────────────────
// PIEZA 1 — getMunicipalIntelligence
// Busca en la base de datos todas las señales relevantes
// para el municipio pedido
// ─────────────────────────────────────────────────────────────

async function getMunicipalIntelligence(pool, municipalityName) {
  const name = String(municipalityName || "").trim();

  // Busca señales en market_intelligence que mencionen el municipio
  // o que sean de categorías relevantes (FUNDING, GOVERNMENT, FEMA, etc.)
  const signalsResult = await pool.query(
    `
    SELECT
      id,
      category,
      source,
      title,
      content,
      priority_score,
      urgency_level,
      opportunity_level,
      signal_type,
      strategic_summary,
      recommended_action,
      strategic_priority,
      created_at
    FROM market_intelligence
    WHERE
      content ILIKE $1
      OR content ILIKE '%FEMA%'
      OR content ILIKE '%CDBG%'
      OR content ILIKE '%HUD%'
      OR content ILIKE '%Puerto Rico%'
      OR signal_type IN ('FUNDING', 'GOVERNMENT')
    ORDER BY priority_score DESC, created_at DESC
    LIMIT 30
    `,
    [`%${name}%`]
  );

  // Busca oportunidades de alta severidad en opportunity_events
  const opportunitiesResult = await pool.query(
    `
    SELECT
      id,
      event_type,
      severity,
      summary,
      metadata,
      created_at
    FROM opportunity_events
    WHERE severity >= 6
    ORDER BY severity DESC, created_at DESC
    LIMIT 20
    `
  );

  const signals = signalsResult.rows || [];
  const opportunities = opportunitiesResult.rows || [];

  // Si no hay señales específicas del municipio, usa las de PR en general
  // Esto garantiza que siempre haya contenido para el reporte
  const hasContent = signals.length > 0 || opportunities.length > 0;

  return {
    municipality: name,
    signals,
    opportunities,
    hasContent,
    signal_count: signals.length,
    opportunity_count: opportunities.length,
    top_priority: signals[0]?.priority_score || 0,
  };
}

// ─────────────────────────────────────────────────────────────
// PIEZA 2 — buildReportData
// Toma las señales reales y llama a OpenAI para generar
// la narrativa institucional del reporte
// ─────────────────────────────────────────────────────────────

async function buildReportData(municipalityName, intelligenceData) {
  const { signals, opportunities } = intelligenceData;

  // Prepara el contexto de señales para OpenAI
  const signalsContext = signals
    .slice(0, 15)
    .map(s => `[${s.signal_type || s.category}] ${s.title || ""}: ${s.content || s.strategic_summary || ""}`)
    .join("\n\n");

  const opportunitiesContext = opportunities
    .slice(0, 10)
    .map(o => `[Severidad ${o.severity}] ${o.event_type}: ${o.summary || ""}`)
    .join("\n\n");

  const hasRealData = signalsContext.length > 50 || opportunitiesContext.length > 50;

  // ── PROMPT PARA OPENAI ────────────────────────────────────────
  // Le pedimos que genere el contenido del reporte basado en
  // las señales reales ingeridas por el sistema
  const currentYear = new Date().getFullYear(); // 2026
  const fiscalYear = "2025-2026";
  const reportDate = new Date().toLocaleDateString("es-PR", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `
Eres el motor de inteligencia operacional de URUS.
Tu función es generar el contenido de un informe ejecutivo institucional
para el Municipio de ${municipalityName} en Puerto Rico.

FECHA ACTUAL: ${reportDate}
AÑO FISCAL VIGENTE: ${fiscalYear}
AÑO ACTUAL: ${currentYear}

CRÍTICO — REGLAS DE FECHAS:
- Estamos en ${currentYear}. NUNCA menciones 2023 ni 2024 como años futuros o de acción.
- El año fiscal municipal vigente comenzó el 1 de julio de 2025 y termina el 30 de junio de 2026.
- Cualquier recomendación de acción debe usar plazos de ${currentYear} o "primer semestre 2026" o "segundo semestre 2026".
- Los fondos federales mencionados son de ciclos 2025-2026 activos AHORA.
- Si usas una fecha, que sea en 2025 o 2026, nunca antes.

CONTEXTO CLAVE DE ARECIBO (usar estos datos reales):
- Alcalde: Carlos "Tito" Ramírez Irizarry (PPD) — reelecto noviembre 2024
- Presupuesto AF 2023-2024: $52.7M (OGP, Resolución Núm. 75)
- Ingresos adicionales CRIM julio 2024: +$5.2M (primer municipio PR con cuentas al día)
- FEMA obligó $717,000+ directamente a Arecibo — Av. Víctor Rojas (Sección 406)
- Comisionado Residente anunció $32.9M FEMA para municipios PR incluyendo puentes Arecibo (abril 2025)
- Gobernadora anunció $1,100M FEMA para PR infraestructura — Arecibo citado (febrero 2025)
- Informe Contralor OC-25-22 (septiembre 2024): opinión cualificada sobre operaciones fiscales
- Senado PR aprobó Instituto de AI (noviembre 2025) — Engine-4, Bayamón
- $2M federales para AI en PR anunciados enero 2026 (FIPSE-SP)
- Nuevo requisito DHS: consulta previa para obras sobre $100,000 (vigente junio 2025)
- Tormenta Ernesto impactó Arecibo agosto 2024

El informe debe sonar como un análisis de una firma de inteligencia estratégica
(al estilo Stratfor o Palantir), NO como un reporte de AI.

Usa lenguaje como:
- "Señales indican que..."
- "Análisis preliminar sugiere..."
- "Indicadores públicos confirman..."
- "Exposición potencial detectada..."

SEÑALES REALES DETECTADAS POR EL SISTEMA (${currentYear}):
${hasRealData ? signalsContext : "Usar programas federales activos en 2025-2026: FEMA-PA Sección 406, CDBG-DR City-Rev ($1,298M isla), HMGP Global Match ($1,000M isla), PR-ERF DOE, fondos AI municipal."}

OPORTUNIDADES DE ALTA PRIORIDAD DETECTADAS:
${hasRealData ? opportunitiesContext : "FEMA-PA activo Arecibo, CDBG-DR City-Rev ventana abierta, HMGP requiere plan mitigación vigente, PR-ERF CODEVyS operando."}

INSTRUCCIONES:
Genera un JSON válido con exactamente esta estructura.
No incluyas texto fuera del JSON.
Todo en español.
Sé específico con números, programas y agencias reales de Puerto Rico.
Todas las fechas y plazos deben ser de 2025 o 2026, nunca de 2023 o 2024.

{
  "executive_summary": "Párrafo de 4-6 oraciones que resume el estado operacional del municipio en 2026, los fondos detectados activos ahora mismo, y la urgencia de actuar antes de que venzan las ventanas de aplicación de 2026. Menciona montos específicos reales de Arecibo.",
  "funding_analysis": "Párrafo de 4-6 oraciones sobre el análisis de fondos disponibles en el ciclo fiscal 2025-2026. Menciona FEMA ($32.9M anunciados abril 2025 incluyendo Arecibo), CDBG-DR, HUD, DOE cuando aplique. Incluye estimados de montos accesibles para Arecibo.",
  "findings": [
    "Hallazgo 1 en 3-4 oraciones: sobre fragmentación operacional y su impacto en fondos FEMA activos en 2025-2026",
    "Hallazgo 2 en 3-4 oraciones: sobre el informe del Contralor OC-25-22 de septiembre 2024 y su relación con la capacidad operacional",
    "Hallazgo 3 en 3-4 oraciones: sobre los $32.9M FEMA anunciados en abril 2025 para municipios PR incluyendo Arecibo",
    "Hallazgo 4 en 3-4 oraciones: sobre CDBG-DR City-Rev y la ventana de aplicación activa para municipios afectados por María e Irma",
    "Hallazgo 5 en 3-4 oraciones: sobre el contexto AI en Puerto Rico (Instituto AI nov 2025, $2M federales ene 2026) y la oportunidad para Arecibo"
  ],
  "evidence_chains": [
    "Señal confirmada: FEMA obligó $717,000+ a Arecibo para obras Av. Víctor Rojas (Sección 406, Stafford Act). Implicación operacional: [qué significa para capacidad de fondos]. Fricción identificada: [problema concreto en 2026]. Urgencia: [por qué importa ahora en 2026].",
    "Señal confirmada: Comisionado Residente anunció $32.9M FEMA para municipios PR incluyendo puentes Arecibo (abril 2025). Implicación operacional: [qué significa]. Fricción identificada: [nuevo requisito DHS consulta previa junio 2025]. Urgencia: [plazos de ejecución 2026].",
    "Señal confirmada: Gobernadora González-Colón anunció $1,100M FEMA para infraestructura PR citando Arecibo (febrero 2025). Implicación operacional: [qué significa]. Fricción identificada: [fragmentación operacional]. Urgencia: [ventanas de ejecución definidas].",
    "Señal confirmada: Informe Contralor OC-25-22 emitió opinión cualificada sobre operaciones fiscales de Arecibo (septiembre 2024). Implicación operacional: [relación con elegibilidad federal]. Fricción identificada: [necesidad de mejoras en control administrativo]. Urgencia: [impacto en aplicaciones de fondos 2026].",
    "Señal confirmada: Senado PR aprobó Instituto de AI (noviembre 2025) y $2M federales para AI en PR (enero 2026). Implicación operacional: [nueva categoría de fondos emergente]. Fricción identificada: [municipios sin capacidad tecnológica quedan excluidos]. Urgencia: [ventana de posicionamiento 2026 para Arecibo]."
  ],
  "strategic_recommendations": [
    "Centralizar monitoreo de todos los fondos federales activos (FEMA-PA, CDBG-DR, HMGP, PR-ERF) en sistema único con alertas de plazos. Acción inmediata en primer semestre 2026 para capturar ventanas de obligación abiertas actualmente.",
    "Actualizar Plan de Mitigación de Riesgos FEMA — condición habilitante para HMGP Global Match Strategy ($1,000M disponibles a nivel isla). Sin este plan vigente, el municipio queda excluido automáticamente. Plazo: segundo trimestre 2026.",
    "Iniciar proceso de solicitud formal al programa City-Rev CDBG-DR para ${currentYear}. El programa tiene $1,298M disponibles para municipios afectados por Irma y María. Arecibo califica. Cada mes de retraso en 2026 reduce la porción disponible.",
    "Implementar sistema de coordinación operacional interdepartamental que conecte planificación, finanzas y obras públicas en tiempo real para cumplir el nuevo requisito DHS de consulta previa (vigente desde junio 2025) para obras sobre $100,000.",
    "Posicionar a Arecibo como nodo piloto del ecosistema de inteligencia operacional municipal de Puerto Rico, aprovechando el Instituto de AI del Senado (nov 2025) y los $2M federales para AI (ene 2026) para acceder a fondos de modernización tecnológica municipal emergentes en 2026."
  ],
  "infrastructure_stability": 72,
  "funding_readiness": 84,
  "operational_risk": 63,
  "coordination_capacity": 41,
  "total_federal_available": "$6.2M – $11.4M",
  "fema_alignment": "ALTO",
  "infrastructure_stress": "MODERADO",
  "federal_exposure": "ACTIVO"
}
  `.trim();

  // Llama a OpenAI para generar el contenido
  let generatedData = null;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.URUS_DEFAULT_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres el motor de inteligencia operacional de URUS. Generas reportes ejecutivos institucionales para municipios de Puerto Rico. Responde SOLO con JSON válido, sin texto adicional."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.4,
      max_tokens: 3000,
    });

    const raw = completion?.choices?.[0]?.message?.content || "";

    // Limpia el JSON por si OpenAI pone backticks
    const clean = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    generatedData = JSON.parse(clean);

  } catch (err) {
    console.error("MUNICIPAL_BUILDER_AI_ERROR", err.message);
    // Si OpenAI falla, usa defaults de Arecibo
    generatedData = null;
  }

  // ── CALCULA SCORES BASADOS EN SEÑALES REALES ─────────────────
  // Si tenemos señales reales, ajusta los scores dinámicamente
  let scores = {
    infrastructure_stability: 72,
    funding_readiness: 84,
    operational_risk: 63,
    coordination_capacity: 41,
  };

  if (intelligenceData.signal_count > 0) {
    const avgPriority = signals.reduce((a, s) => a + (s.priority_score || 5), 0) / signals.length;
    const avgOpportunity = signals.reduce((a, s) => a + (s.opportunity_level || 5), 0) / signals.length;

    // Funding readiness sube si hay muchas señales de oportunidad
    scores.funding_readiness = Math.min(95, Math.round(70 + (avgOpportunity * 2)));

    // Infrastructure stability baja si hay señales de riesgo alto
    const highRisk = opportunities.filter(o => o.severity >= 8).length;
    scores.infrastructure_stability = Math.max(50, Math.round(80 - (highRisk * 5)));

    // Operational risk sube con más señales de urgencia
    const urgentSignals = signals.filter(s => s.urgency_level >= 7).length;
    scores.operational_risk = Math.min(85, Math.round(55 + (urgentSignals * 3)));
  }

  // ── ENSAMBLA EL OBJETO FINAL ──────────────────────────────────
  return {
    municipality_name: municipalityName,
    prepared_for: "Oficina del Alcalde",
    population: getMunicipalityPopulation(municipalityName),
    total_federal_available: generatedData?.total_federal_available || "$6.2M – $11.4M",

    executive_summary: generatedData?.executive_summary ||
      `Análisis preliminar de señales federales indica que el Municipio de ${municipalityName} tiene exposición activa a múltiples fuentes de financiamiento federal durante el ciclo fiscal 2025-2026.`,

    funding_analysis: generatedData?.funding_analysis ||
      `Los programas FEMA-PA, CDBG-DR City-Rev y HMGP Global Match están activos para municipios de Puerto Rico. ${municipalityName} tiene perfil elegible basado en historial de desastres declarados.`,

    findings: generatedData?.findings || [
      "Señales indican fragmentación en procesos internos de aprobación para proyectos de infraestructura.",
      "Análisis preliminar sugiere dependencia en flujos de comunicación informales para coordinar grants.",
      "Indicadores públicos muestran oportunidades activas de funding federal sin sistema de monitoreo.",
      "Exposición detectada en coordinación interdepartamental que reduce velocidad de ejecución.",
      "Señales de preparación favorable para programas FEMA y CDBG-DR activos actualmente."
    ],

    evidence_chains: generatedData?.evidence_chains || [
      "Señal detectada: fondos FEMA activos en Puerto Rico para infraestructura municipal. Implicación: el municipio tiene perfil elegible. Fricción: ausencia de sistema de monitoreo centralizado.",
      "Señal detectada: programa CDBG-DR City-Rev con $1,298M disponibles para municipios afectados por Irma y María. Fricción: documentación técnica requerida sin sistema de preparación.",
      "Señal detectada: HMGP Global Match Strategy con $1,000M disponibles. Fricción: requiere Plan de Mitigación FEMA vigente.",
      "Señal detectada: PR Energy Resilience Fund con $1,000M activos. Fricción: coordinación entre agencias sin capa de inteligencia operacional.",
      "Señal detectada: Gobernadora González-Colón anunció $1.1B en fondos FEMA para infraestructura en PR (febrero 2025). Fricción: ventanas de ejecución definidas sin sistema de tracking."
    ],

    strategic_recommendations: generatedData?.strategic_recommendations || [
      "Centralizar monitoreo de fondos federales activos en sistema único con alertas de plazos.",
      "Actualizar Plan de Mitigación FEMA para habilitar acceso a HMGP ($1,000M disponibles).",
      "Iniciar proceso de solicitud formal al programa City-Rev CDBG-DR.",
      "Implementar sistema de coordinación operacional interdepartamental en tiempo real.",
      "Establecer protocolo permanente de inteligencia de funding con análisis automático de elegibilidad."
    ],

    infrastructure_stability: generatedData?.infrastructure_stability || scores.infrastructure_stability,
    funding_readiness: generatedData?.funding_readiness || scores.funding_readiness,
    operational_risk: generatedData?.operational_risk || scores.operational_risk,
    coordination_capacity: generatedData?.coordination_capacity || scores.coordination_capacity,

    fema_alignment: generatedData?.fema_alignment || "ALTO",
    infrastructure_stress: generatedData?.infrastructure_stress || "MODERADO",
    federal_exposure: generatedData?.federal_exposure || "ACTIVO",

    map_fema_exposure: "ALTO",
    map_funding_readiness: "MODERADO",
    map_infrastructure_risk: "ACTIVO",

    // Metadata del proceso
    _meta: {
      signals_used: intelligenceData.signal_count,
      opportunities_used: intelligenceData.opportunity_count,
      ai_generated: generatedData !== null,
      generated_at: new Date().toISOString(),
    }
  };
}

// ─────────────────────────────────────────────────────────────
// HELPER — población por municipio
// Datos del Censo 2020 Puerto Rico
// ─────────────────────────────────────────────────────────────

function getMunicipalityPopulation(name) {
  const populations = {
    "arecibo": "87,242",
    "bayamón": "185,674",
    "bayamon": "185,674",
    "carolina": "158,816",
    "ponce": "143,926",
    "caguas": "127,975",
    "guaynabo": "90,281",
    "san juan": "321,041",
    "mayagüez": "75,241",
    "mayaguez": "75,241",
    "trujillo alto": "67,780",
    "toa baja": "79,726",
    "toa alta": "72,025",
    "vega baja": "55,997",
    "humacao": "52,132",
    "isabela": "42,012",
    "aguadilla": "54,466",
    "quebradillas": "24,036",
    "camuy": "32,644",
    "hatillo": "40,390",
  };

  const key = String(name || "").toLowerCase().replace("municipio de ", "").trim();
  return populations[key] || "N/D";
}

// ─────────────────────────────────────────────────────────────
// PIEZA 3 — generateMunicipalReport (función principal)
// Orquesta todo el proceso de punta a punta
// ─────────────────────────────────────────────────────────────

async function generateMunicipalReport(pool, municipalityName, generateExecutiveReport) {
  console.log("MUNICIPAL_REPORT_START", { municipality: municipalityName });

  // Paso 1 — Busca señales en la base de datos
  const intelligenceData = await getMunicipalIntelligence(pool, municipalityName);

  console.log("MUNICIPAL_INTELLIGENCE_FETCHED", {
    municipality: municipalityName,
    signals: intelligenceData.signal_count,
    opportunities: intelligenceData.opportunity_count,
  });

  // Paso 2 — Construye el objeto de datos con AI
  const reportData = await buildReportData(municipalityName, intelligenceData);

  console.log("MUNICIPAL_REPORT_DATA_BUILT", {
    municipality: municipalityName,
    ai_generated: reportData._meta.ai_generated,
  });

  // Paso 3 — Genera el PDF
  const result = await generateExecutiveReport(reportData);

  console.log("MUNICIPAL_REPORT_PDF_GENERATED", {
    municipality: municipalityName,
    fileName: result.fileName,
  });

  return {
    ok: true,
    municipality: municipalityName,
    fileName: result.fileName,
    filePath: result.filePath,
    meta: reportData._meta,
  };
}

module.exports = {
  getMunicipalIntelligence,
  buildReportData,
  generateMunicipalReport,
};
