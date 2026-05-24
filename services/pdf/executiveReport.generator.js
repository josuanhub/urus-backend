const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

async function generateExecutiveReport(data) {

  const {
    municipality_name = "Municipio de Arecibo",
    executive_summary = "",
    findings = [],
    evidence_chains = [],
    strategic_recommendations = [],
    funding_analysis = "",
    infrastructure_stability = 72,
    funding_readiness = 84,
    operational_risk = 63,
    coordination_capacity = 41,
    fema_alignment = "ALTO",
    infrastructure_stress = "MODERADO",
    federal_exposure = "ACTIVO",
    map_fema_exposure = "ALTO",
    map_funding_readiness = "MODERADO",
    map_infrastructure_risk = "ACTIVO",
    population = "85,539",
    total_federal_available = "$6.2M – $11.4M",
    prepared_for = "Oficina del Alcalde",
    mayor_name = "Carlos \"Tito\" Ramírez Irizarry (PPD)",
    budget_official = "$52.7M",
    budget_year = "2023-2024",
    budget_source = "OGP — Resolución Núm. 75, junio 2023",
    budget_crim_extra = "$5.2M",
    capital_leak_low = "$440,000",
    capital_leak_high = "$740,000",
    cost_per_month_low = "$36,000",
    cost_per_month_high = "$61,000",
  } = data;

  const reportsDir = path.join(__dirname, "../../generated_reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const fileName = `report-${Date.now()}.pdf`;
  const filePath = path.join(reportsDir, fileName);

  const generatedDate = new Date().toLocaleDateString("es-PR", {
    year: "numeric", month: "long", day: "numeric"
  });

  function scoreColor(score) {
    if (score >= 75) return "#16a34a";
    if (score >= 50) return "#c9a24d";
    return "#dc2626";
  }

  function riskLabel(score) {
    if (score >= 75) return "FAVORABLE";
    if (score >= 50) return "MODERADO";
    return "EXPOSICIÓN";
  }

  function riskBadgeStyle(score) {
    if (score >= 75) return "background:#d1fae5;color:#065f46;";
    if (score >= 50) return "background:#fef3c7;color:#92400e;";
    return "background:#fee2e2;color:#991b1b;";
  }

  const defaultFindings = findings.length > 0 ? findings : [
    "Señales indican fragmentación en los procesos internos de aprobación para proyectos de infraestructura, lo cual puede reducir la velocidad de ejecución requerida por los programas federales FEMA-PA y CDBG-DR. Los plazos de obligación de fondos son estrictos y los retrasos administrativos han resultado históricamente en pérdida de elegibilidad para municipios comparables en Puerto Rico.",
    "Análisis preliminar sugiere que el municipio mantiene dependencia en flujos de comunicación informales para coordinar solicitudes de grants federales. Esta fragmentación genera riesgo de información incompleta al momento de someter aplicaciones, afectando directamente la tasa de conversión de fondos disponibles en aprobaciones concretas.",
    "Indicadores públicos confirman que FEMA obligó más de $717,000 directamente al Municipio de Arecibo para obras permanentes en la Avenida Víctor Rojas bajo la Sección 406 del Stafford Act. La gestión activa de estos fondos exige reportes de progreso periódicos cuya preparación manual consume recursos operacionales y representa riesgo de incumplimiento de plazos.",
    "Oportunidad crítica identificada: el programa City-Rev de CDBG-DR tiene $1,298,000,000 disponibles a nivel isla para municipios afectados por los Huracanes Irma y María. Arecibo califica directamente por su historial de daños documentados. La preparación de la solicitud requiere documentación operacional centralizada que actualmente puede no estar disponible en el formato requerido por HUD/PRDOH.",
    "El programa HMGP (Hazard Mitigation Grant Program) requiere un Plan de Mitigación de Riesgos aprobado y vigente por FEMA como condición de elegibilidad. Sin este documento actualizado, el municipio queda excluido de una categoría completa de financiamiento federal. El programa CDBG-MIT asignó $1,000,000,000 a Puerto Rico específicamente para este tipo de proyectos."
  ];

  const defaultEvidenceChains = evidence_chains.length > 0 ? evidence_chains : [
    "Señal confirmada: FEMA obligó $717,000+ al Municipio de Arecibo para obras permanentes en Avenida Víctor Rojas bajo el Programa de Asistencia Pública (Sección 406 del Stafford Act). Implicación operacional: el municipio tiene capacidad probada de recepción de fondos federales. Fricción identificada: la gestión manual de reportes de progreso genera riesgo activo de incumplimiento de plazos FEMA. Fuente: FEMA Press Release, febrero 2020.",
    "Señal confirmada: el Departamento de Energía de EE.UU. celebró en Arecibo el procesamiento de la aplicación número 1,000 del Programa Acceso Solar a través de CODEVyS (enero 2025). Implicación: Arecibo tiene infraestructura de resiliencia energética activa con apoyo conjunto DOE/FEMA/HUD. Oportunidad: el PR-ERF tiene $1,000,000,000 disponibles y programas adicionales de resiliencia para los que el municipio puede calificar con preparación adecuada.",
    "Señal confirmada: la Gobernadora González-Colón anunció más de $1,100,000,000 en fondos FEMA para infraestructura crítica en Puerto Rico, citando explícitamente al Municipio de Arecibo entre los beneficiarios (febrero 2025). Urgencia operacional: estos fondos tienen ventanas de ejecución definidas. La ausencia de un sistema de monitoreo operacional puede resultar en subutilización o pérdida de elegibilidad por incumplimiento de plazos de obligación.",
    "Señal confirmada: el Comisionado Residente anunció $32.9 millones en fondos FEMA para proyectos de reconstrucción en municipios de PR, incluyendo reparaciones de puentes en Arecibo y Cayey (abril 2025). Fricción detectada: estos fondos tienen plazos de ejecución estrictos bajo el nuevo requisito del DHS de consulta previa para proyectos sobre $100,000. Sin sistema de monitoreo, el municipio opera reactivamente en lugar de proactivamente. Fuente: Comisionado Residente, press release abril 2025.",
    "Señal confirmada: el Senado de Puerto Rico aprobó la creación del Instituto de Desarrollo e Innovación en Inteligencia Artificial de Puerto Rico (noviembre 2025), con fondos federales y colaboración de DDEC, UPR e Invest PR. Implicación estratégica: los próximos ciclos de fondos de modernización municipal priorizarán municipios con capacidad tecnológica demostrada. Municipios sin sistemas de inteligencia operacional quedan fuera de esta categoría de financiamiento emergente."
  ];

  const defaultRecommendations = strategic_recommendations.length > 0 ? strategic_recommendations : [
    "Centralizar el monitoreo de todos los fondos federales activos (FEMA-PA, CDBG-DR, HMGP, PR-ERF) en un sistema único de seguimiento con alertas automáticas de plazos de obligación, reportes de progreso y dashboards de estado en tiempo real. Esta acción tiene el mayor impacto inmediato en la reducción de riesgo de pérdida de fondos ya asignados.",
    "Actualizar y mantener vigente el Plan de Mitigación de Riesgos aprobado por FEMA. Este documento es condición habilitante para acceder al programa HMGP Global Match Strategy, que tiene $1,000,000,000 disponibles a nivel isla. Sin este plan actualizado, el municipio queda automáticamente excluido del programa independientemente de la elegibilidad de los proyectos propuestos.",
    "Iniciar proceso de solicitud formal al programa City-Rev CDBG-DR antes del cierre de la ventana de aplicación. El programa tiene $1,298,000,000 disponibles para municipios afectados por Irma y María. Arecibo califica. Cada mes de retraso reduce la porción disponible a medida que otros municipios presentan sus solicitudes.",
    "Implementar un sistema de coordinación operacional interdepartamental que conecte las oficinas de planificación, finanzas, obras públicas y el equipo de gestión de grants en tiempo real, eliminando los silos de comunicación que reducen la velocidad de ejecución y generan la fuga de capital operacional estimada en $440,000–$740,000 anuales.",
    "Posicionar al municipio como nodo piloto de inteligencia operacional en Puerto Rico, aprovechando el ecosistema emergente del Instituto de AI del Senado, Engine-4 Foundation y los programas federales de modernización tecnológica municipal. Esta estrategia abre acceso a una nueva categoría de fondos federales de innovación gubernamental."
  ];

  const defaultFundingAnalysis = funding_analysis ||
    `Análisis preliminar de señales federales indica que el Municipio de Arecibo tiene exposición activa a múltiples fuentes de financiamiento federal durante el ciclo fiscal 2025-2026. Los programas identificados incluyen FEMA Public Assistance (Sección 406 del Stafford Act), CDBG-DR City-Rev Program, HMGP Global Match Strategy y el PR Energy Resilience Fund del DOE. FEMA ha obligado fondos directamente a Arecibo de forma confirmada, y el Comisionado Residente anunció $32.9 millones en fondos FEMA para municipios de PR incluyendo puentes en Arecibo (abril 2025). La estimación de fondos potencialmente accesibles oscila entre ${total_federal_available}, condicionada al cumplimiento de requisitos operacionales de cada programa y a la capacidad de ejecución demostrada.`;

  const fundingPrograms = [
    { programa: "FEMA Public Assistance — Sección 406", agencia: "FEMA / COR3", monto: "$717K+ confirmados", prioridad: "CRÍTICA", estado: "Activo y obligado" },
    { programa: "Fondos FEMA — Puentes y carreteras Arecibo", agencia: "FEMA / Comisionado Residente", monto: "Incluido en $32.9M PR", prioridad: "CRÍTICA", estado: "Anunciado abr 2025" },
    { programa: "City-Rev Program — CDBG-DR", agencia: "HUD / PRDOH", monto: "$500K – $3M estimado", prioridad: "ALTA", estado: "Ventana abierta" },
    { programa: "HMGP Global Match Strategy — CDBG-MIT", agencia: "FEMA / PRDOH", monto: "$250K – $2M estimado", prioridad: "ALTA", estado: "Requiere plan FEMA vigente" },
    { programa: "PR Energy Resilience Fund (PR-ERF)", agencia: "DOE / FEMA / HUD", monto: "$200K – $800K estimado", prioridad: "MEDIA", estado: "Activo — CODEVyS operando" },
    { programa: "Fondos modernización AI municipal", agencia: "Instituto AI PR / Federal", monto: "Por definir — 2026", prioridad: "MEDIA", estado: "Emergente — ventana 2026" },
  ];

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; background: #f3f4f6; color: #111827; }

.page {
  width: 100%;
  min-height: 100vh;
  padding: 68px 76px;
  page-break-after: always;
  background: white;
  position: relative;
}

/* PORTADA */
.cover { background: #0b0b0b; color: white; }
.gold-line { position: absolute; left: 0; top: 0; width: 6px; height: 100%; background: #c9a24d; }
.cover-urus { font-size: 62px; font-weight: 700; margin-top: 56px; margin-left: 38px; letter-spacing: -1px; }
.cover-subtitle { font-size: 24px; color: #c9a24d; margin-top: 14px; margin-left: 38px; }
.cover-class { font-size: 10px; color: #6b7280; margin-top: 8px; margin-left: 38px; letter-spacing: 3px; text-transform: uppercase; }
.cover-municipality { font-size: 46px; font-weight: 700; margin-top: 80px; margin-left: 38px; line-height: 1.1; }
.cover-meta { margin-top: 50px; margin-left: 38px; color: #9ca3af; line-height: 2.1; font-size: 14px; }
.cover-meta strong { color: #d1d5db; }
.cover-cta-title { font-size: 36px; font-weight: 700; color: white; margin-top: 90px; margin-left: 38px; line-height: 1.2; max-width: 500px; }
.cover-cta-body { font-size: 19px; color: #d6d9df; margin-top: 22px; margin-left: 38px; line-height: 1.75; max-width: 540px; }
.cover-cta-block { margin-top: 60px; margin-left: 38px; border-left: 4px solid #c8a96b; padding-left: 20px; color: #d6d9df; line-height: 2; font-size: 14px; }
.footer { position: absolute; bottom: 44px; right: 76px; color: #6b7280; font-size: 11px; letter-spacing: 1px; }

/* TIPOGRAFÍA */
h1 { font-size: 36px; margin-bottom: 32px; color: #111827; border-bottom: 3px solid #c9a24d; padding-bottom: 12px; }
h2 { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #111827; }
h3 { font-size: 15px; font-weight: 700; margin-bottom: 6px; color: #374151; }
.summary-text { font-size: 16px; line-height: 1.85; color: #374151; }
.section-meta { font-size: 11px; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 24px; }

/* ALERTA */
.alert-box { margin-top: 32px; border-left: 6px solid #dc2626; background: #fef2f2; padding: 22px 26px; border-radius: 0 12px 12px 0; }
.alert-title { font-size: 14px; font-weight: 700; color: #991b1b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.alert-text { color: #7f1d1d; line-height: 1.75; font-size: 14px; }

/* MÉTRICAS */
.metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 36px; }
.metric-card { background: #111827; border-radius: 16px; padding: 24px; color: white; position: relative; overflow: hidden; }
.metric-card::after { content: ""; position: absolute; right: -28px; top: -28px; width: 90px; height: 90px; background: rgba(255,255,255,0.04); border-radius: 50%; }
.metric-label { font-size: 10px; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1.5px; }
.metric-value { font-size: 36px; font-weight: 700; line-height: 1; }
.metric-sub { margin-top: 10px; color: #d1d5db; font-size: 12px; line-height: 1.5; }

/* FUNDING HIGHLIGHT */
.funding-highlight { background: linear-gradient(135deg, #0b0b0b 0%, #1a1a2e 100%); border-radius: 18px; padding: 32px; margin-top: 28px; color: white; border-left: 6px solid #c9a24d; }
.funding-highlight-label { font-size: 10px; color: #9ca3af; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; }
.funding-highlight-amount { font-size: 46px; font-weight: 700; color: #c9a24d; line-height: 1; }
.funding-highlight-note { margin-top: 12px; font-size: 13px; color: #9ca3af; line-height: 1.65; }

/* DOS COLUMNAS */
.two-column { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 32px; margin-top: 36px; }
.side-panel { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 22px; }
.side-panel-title { font-size: 13px; font-weight: 700; margin-bottom: 18px; color: #111827; text-transform: uppercase; letter-spacing: 0.5px; }
.side-stat { margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid #f3f4f6; }
.side-stat:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.side-stat-label { font-size: 10px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.8px; }
.side-stat-value { font-size: 18px; font-weight: 700; color: #111827; }

/* TARJETAS */
.finding-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px 26px; margin-bottom: 18px; background: white; border-left: 4px solid #c9a24d; }
.finding-number { font-size: 10px; font-weight: 700; color: #c9a24d; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
.finding-text { font-size: 14px; color: #4b5563; line-height: 1.8; }

/* SCORECARD */
.score-section { margin-bottom: 30px; }
.score-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.score-name { font-size: 15px; font-weight: 600; color: #111827; }
.score-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.8px; }
.score-num { font-size: 20px; font-weight: 700; }
.score-bar { width: 100%; height: 14px; background: #f3f4f6; border-radius: 20px; overflow: hidden; margin-bottom: 8px; }
.score-fill { height: 100%; border-radius: 20px; }
.score-explanation { font-size: 13px; color: #6b7280; line-height: 1.65; }

/* TABLA */
table { width: 100%; border-collapse: collapse; margin-top: 28px; border-radius: 12px; overflow: hidden; }
thead tr { background: #111827; }
th { color: white; padding: 13px 15px; text-align: left; font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; font-weight: 600; }
tbody tr:nth-child(even) { background: #f9fafb; }
tbody tr:nth-child(odd) { background: white; }
td { padding: 13px 15px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
td:first-child { font-weight: 600; color: #111827; font-size: 12px; }

/* BADGES */
.p-critica { background: #fee2e2; color: #991b1b; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.p-alta { background: #fef3c7; color: #92400e; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.p-media { background: #dbeafe; color: #1e40af; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; }

/* EVIDENCIA */
.evidence-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px 26px; margin-bottom: 18px; background: #fafafa; }
.evidence-num { font-size: 10px; font-weight: 700; color: #6b7280; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }

/* RECOMENDACIONES */
.recommendation { padding: 18px 22px; border-left: 5px solid #c9a24d; background: #fffbeb; margin-bottom: 14px; border-radius: 0 12px 12px 0; font-size: 14px; color: #374151; line-height: 1.8; }
.rec-number { font-weight: 700; color: #92400e; margin-right: 8px; }

/* PILOTO */
.pilot-option { border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px; margin-bottom: 14px; background: white; display: flex; align-items: flex-start; gap: 18px; }
.pilot-duration { background: #111827; color: white; border-radius: 10px; padding: 12px 16px; text-align: center; min-width: 82px; flex-shrink: 0; }
.pilot-days { font-size: 26px; font-weight: 700; color: #c9a24d; line-height: 1; }
.pilot-days-label { font-size: 9px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; margin-top: 3px; }
.pilot-content p { font-size: 13px; color: #4b5563; line-height: 1.7; margin-top: 4px; }
.pilot-cta { margin-top: 36px; padding: 36px; background: #0b1020; border-radius: 18px; color: white; }
.pilot-cta-title { font-size: 28px; font-weight: 700; margin-bottom: 14px; }
.pilot-cta-body { font-size: 17px; line-height: 1.75; opacity: 0.88; }

/* MAPA */
.map-indicators { margin-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.map-metric { background: #111827; border-radius: 12px; padding: 20px; color: white; }
.map-metric-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px; }
.map-metric-value { font-size: 22px; font-weight: 700; }

/* BARRAS OVERVIEW */
.bar-widget { border: 1px solid #f3f4f6; border-radius: 16px; padding: 26px; margin-bottom: 20px; background: #fafafa; }
.bar-row2 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.bar-label2 { font-size: 16px; font-weight: 700; color: #111827; }
.bar-pct2 { font-size: 18px; font-weight: 700; }
.bar-track2 { width: 100%; height: 18px; background: #e5e7eb; border-radius: 20px; overflow: hidden; }
.bar-fill2 { height: 100%; border-radius: 20px; }
.bar-note2 { margin-top: 8px; font-size: 12px; color: #6b7280; line-height: 1.6; }

/* CAJAS */
.nota-box { margin-top: 20px; padding: 18px 22px; background: #fffbeb; border-radius: 12px; border-left: 4px solid #c9a24d; }
.nota-box h3 { color: #92400e; margin-bottom: 6px; font-size: 14px; }
.nota-box p { font-size: 13px; color: #78350f; line-height: 1.75; }
.legal-box { margin-top: 22px; padding: 18px 22px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb; }
.legal-box h3 { margin-bottom: 6px; font-size: 14px; }
.legal-box p { font-size: 13px; color: #6b7280; line-height: 1.75; }

/* ── NUEVAS SECCIONES ── */

/* CONTEXTO FISCAL */
.fiscal-big { font-size: 48px; font-weight: 700; color: #111827; line-height: 1; }
.fiscal-sub { font-size: 13px; color: #6b7280; margin-top: 6px; margin-bottom: 28px; }
.budget-bar { margin-bottom: 14px; }
.budget-bar-header { display: flex; justify-content: space-between; margin-bottom: 5px; }
.budget-bar-name { font-size: 13px; color: #374151; }
.budget-bar-vals { font-size: 13px; font-weight: 700; color: #111827; }
.budget-bar-track { height: 10px; background: #f3f4f6; border-radius: 20px; overflow: hidden; border: 1px solid #e5e7eb; }
.budget-bar-fill { height: 100%; border-radius: 20px; }
.audit-callout { margin-top: 28px; background: #fffbeb; border: 1px solid #f59e0b; border-radius: 12px; padding: 18px 22px; border-left: 4px solid #f59e0b; }
.audit-callout-title { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.audit-callout-text { font-size: 13px; color: #78350f; line-height: 1.7; }
.fiscal-context { margin-top: 20px; background: #0b0b0b; border-radius: 14px; padding: 22px 26px; border-left: 6px solid #c9a24d; color: white; }
.fiscal-context-text { font-size: 15px; color: #d1d5db; line-height: 1.75; }

/* FUGA DE CAPITAL */
.fuga-header { background: #0b0b0b; border-radius: 16px; padding: 28px; margin-bottom: 24px; border-left: 6px solid #dc2626; }
.fuga-header-label { font-size: 10px; color: #6b7280; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
.fuga-header-amount { font-size: 44px; font-weight: 700; color: #ef4444; line-height: 1; }
.fuga-header-note { margin-top: 10px; font-size: 13px; color: #9ca3af; }
.fuga-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.fuga-item { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; background: white; }
.fuga-item-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.fuga-item-name { font-size: 13px; font-weight: 700; color: #111827; flex: 1; margin-right: 8px; }
.fuga-pct { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }
.fuga-red { background: #fee2e2; color: #991b1b; }
.fuga-yellow { background: #fef3c7; color: #92400e; }
.fuga-orange { background: #fff7ed; color: #9a3412; }
.fuga-blue { background: #dbeafe; color: #1e40af; }
.fuga-amount { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 6px; }
.fuga-desc { font-size: 12px; color: #6b7280; line-height: 1.6; }
.fuga-monthly { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; }
.fuga-monthly-label { font-size: 14px; color: #991b1b; }
.fuga-monthly-val { font-size: 24px; font-weight: 700; color: #dc2626; }

/* AI EN PR */
.ai-intro { font-size: 15px; color: #374151; line-height: 1.8; margin-bottom: 24px; }
.ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.ai-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; background: white; }
.ai-card-icon { font-size: 22px; margin-bottom: 10px; }
.ai-card-title { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 6px; }
.ai-card-text { font-size: 13px; color: #6b7280; line-height: 1.6; }
.ai-card-date { font-size: 11px; color: #c9a24d; font-weight: 700; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.ai-warning { background: #fffbeb; border: 1px solid #c9a24d; border-radius: 12px; padding: 20px 24px; border-left: 5px solid #c9a24d; }
.ai-warning-title { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.ai-warning-text { font-size: 13px; color: #78350f; line-height: 1.75; }
</style>
</head>
<body>


<!-- ══════════════════════════════════════════ -->
<!-- PORTADA                                     -->
<!-- ══════════════════════════════════════════ -->
<section class="page cover">
  <div class="gold-line"></div>
  <div class="cover-urus">URUS</div>
  <div class="cover-subtitle">Informe de Inteligencia Operacional</div>
  <div class="cover-class">Evaluación Ejecutiva Preliminar · Confidencial</div>
  <div class="cover-municipality">${municipality_name}</div>
  <div class="cover-meta">
    <strong>Alcalde:</strong> ${mayor_name}<br/>
    <strong>Preparado para:</strong> ${prepared_for}<br/>
    <strong>Fecha de generación:</strong> ${generatedDate}<br/>
    <strong>Población estimada 2025:</strong> ${population} habitantes<br/>
    <strong>Fondos federales identificados:</strong> ${total_federal_available}<br/>
    <strong>Generado por:</strong> URUS Operational Intelligence System
  </div>
  <div class="footer">URUS ∴ Capa de Inteligencia Estratégica</div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- RESUMEN EJECUTIVO                           -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 1 de 15 · Resumen Ejecutivo</div>
  <h1>Resumen Ejecutivo</h1>

  <div class="summary-text">${defaultFundingAnalysis}</div>

  <div class="funding-highlight">
    <div class="funding-highlight-label">Fondos federales potencialmente accesibles — estimado preliminar</div>
    <div class="funding-highlight-amount">${total_federal_available}</div>
    <div class="funding-highlight-note">
      Estimado basado en señales activas confirmadas: FEMA-PA (Sección 406), CDBG-DR City-Rev, HMGP Global Match, PR-ERF y fondos de modernización tecnológica municipal emergentes.
      Requiere validación con registros municipales y agencias federales. La captura efectiva depende de la capacidad operacional interna.
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-label">Estabilidad de Infraestructura</div>
      <div class="metric-value">${infrastructure_stability}%</div>
      <div class="metric-sub">Señales de exposición en infraestructura crítica detectadas.</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Preparación para Fondos</div>
      <div class="metric-value">${funding_readiness}%</div>
      <div class="metric-sub">Elegibilidad activa en programas federales identificados.</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Capacidad de Coordinación</div>
      <div class="metric-value">${coordination_capacity}%</div>
      <div class="metric-sub">Fragmentación operacional interdepartamental detectada.</div>
    </div>
  </div>

  <div class="alert-box">
    <div class="alert-title">Alerta Operacional Estratégica</div>
    <div class="alert-text">
      URUS detectó ineficiencias operacionales vinculadas a flujos de aprobación fragmentados,
      coordinación tardía de fondos federales y exposición en resiliencia de infraestructura.
      La fuga de capital operacional estimada es de ${capital_leak_low}–${capital_leak_high} anuales.
      Estas condiciones pueden reducir la velocidad de captura de fondos disponibles actualmente.
    </div>
  </div>

  <div class="two-column">
    <div>
      <h2>Inteligencia Ejecutiva</h2>
      <div class="summary-text">
        Los indicadores operacionales sugieren que el municipio está posicionado para acceder
        a fondos federales de resiliencia, pero las ineficiencias de coordinación interna pueden
        reducir la velocidad de ejecución y la tasa de conversión de grants disponibles.
        Los programas federales activos tienen ventanas de aplicación y plazos que no se extienden indefinidamente.
        Cada mes sin sistema de monitoreo representa un costo estimado de ${cost_per_month_low}–${cost_per_month_high}.
      </div>
    </div>
    <div class="side-panel">
      <div class="side-panel-title">Indicadores Clave</div>
      <div class="side-stat">
        <div class="side-stat-label">Alineación FEMA</div>
        <div class="side-stat-value">${fema_alignment}</div>
      </div>
      <div class="side-stat">
        <div class="side-stat-label">Estrés Infraestructura</div>
        <div class="side-stat-value">${infrastructure_stress}</div>
      </div>
      <div class="side-stat">
        <div class="side-stat-label">Exposición Federal</div>
        <div class="side-stat-value">${federal_exposure}</div>
      </div>
      <div class="side-stat">
        <div class="side-stat-label">Costo mensual sin sistema</div>
        <div class="side-stat-value" style="font-size:14px;color:#dc2626">${cost_per_month_low}–${cost_per_month_high}</div>
      </div>
    </div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- ALCANCE Y METODOLOGÍA                       -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 2 de 15 · Alcance y Metodología</div>
  <h1>Alcance y Metodología</h1>

  <div class="finding-card">
    <div class="finding-number">Alcance del análisis</div>
    <div class="finding-text">
      Esta evaluación fue generada mediante el Sistema de Inteligencia Operacional URUS utilizando
      indicadores públicamente disponibles, señales de exposición de infraestructura, patrones de
      coordinación operacional, actividad de fondos federales y análisis de resiliencia regional.<br><br>
      Este informe NO constituye una auditoría formal, certificación gubernamental ni determinación
      legal. Los hallazgos deben interpretarse como inteligencia operacional preliminar que requiere
      validación institucional directa con los registros del municipio y las agencias federales correspondientes.
    </div>
  </div>

  <div class="finding-card">
    <div class="finding-number">Fuentes e insumos analizados</div>
    <div class="finding-text">
      • FEMA.gov — Programa de Asistencia Pública (Sección 406, Stafford Act) y HMGP<br>
      • Portal de Transparencia COR3 — Recovery Programs y obligaciones activas<br>
      • Comisionado Residente — Press releases de fondos municipales (abril 2025)<br>
      • Gobernadora González-Colón — Anuncio $1,100M fondos FEMA (febrero 2025)<br>
      • PRDOH — Programas activos: CDBG-DR City-Rev, HMGP Global Match, Non-Federal Match<br>
      • Departamento de Energía de EE.UU. — PR-ERF y Programa Acceso Solar CODEVyS<br>
      • OGP — Presupuestos municipales y circulares fiscales<br>
      • Oficina del Contralor PR — Informe OC-25-22 del Municipio de Arecibo (sept 2024)<br>
      • Senado de Puerto Rico — Legislación sobre Instituto de AI (nov 2025)<br>
      • Metro PR, Primera Hora, El Vocero, El Nuevo Día, CPI — Señales de prensa regional<br>
      • AAFAF — Comunicaciones CRIM y AAFAF sobre ingresos municipales (jul 2024)
    </div>
  </div>

  <div class="finding-card">
    <div class="finding-number">Posicionamiento analítico</div>
    <div class="finding-text">
      El sistema URUS está diseñado para apoyar la conciencia ejecutiva, la priorización operacional
      y la evaluación de preparación para fondos. El lenguaje —"señales indican", "análisis preliminar sugiere",
      "requiere validación"— refleja deliberadamente el carácter probabilístico de la inteligencia operacional,
      diferente de las conclusiones de una auditoría formal. Este posicionamiento protege institucionalmente
      al municipio y al sistema al evitar afirmaciones absolutas no verificadas.
    </div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- CONTEXTO FISCAL MUNICIPAL ← NUEVA          -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 3 de 15 · Contexto Fiscal Municipal</div>
  <h1>Contexto Fiscal Municipal</h1>

  <div class="fiscal-big">${budget_official}</div>
  <div class="fiscal-sub">
    Presupuesto aprobado — Año Fiscal ${budget_year} · Fuente: ${budget_source}<br>
    Ingresos adicionales CRIM recibidos julio 2024: +${budget_crim_extra} (primer municipio PR con cuentas al día — AAFAF)
  </div>

  <div class="budget-bar">
    <div class="budget-bar-header"><span class="budget-bar-name">Nómina y empleados</span><span class="budget-bar-vals">42% · $22.1M</span></div>
    <div class="budget-bar-track"><div class="budget-bar-fill" style="width:42%;background:#111827;"></div></div>
  </div>
  <div class="budget-bar">
    <div class="budget-bar-header"><span class="budget-bar-name">Servicios públicos ciudadanos</span><span class="budget-bar-vals">18% · $9.5M</span></div>
    <div class="budget-bar-track"><div class="budget-bar-fill" style="width:18%;background:#378ADD;"></div></div>
  </div>
  <div class="budget-bar">
    <div class="budget-bar-header"><span class="budget-bar-name">Infraestructura y obras permanentes</span><span class="budget-bar-vals">15% · $7.9M</span></div>
    <div class="budget-bar-track"><div class="budget-bar-fill" style="width:15%;background:#c9a24d;"></div></div>
  </div>
  <div class="budget-bar">
    <div class="budget-bar-header"><span class="budget-bar-name">Administración y operaciones</span><span class="budget-bar-vals">12% · $6.3M</span></div>
    <div class="budget-bar-track"><div class="budget-bar-fill" style="width:12%;background:#7F77DD;"></div></div>
  </div>
  <div class="budget-bar">
    <div class="budget-bar-header"><span class="budget-bar-name">Servicios sociales y comunitarios</span><span class="budget-bar-vals">8% · $4.2M</span></div>
    <div class="budget-bar-track"><div class="budget-bar-fill" style="width:8%;background:#1D9E75;"></div></div>
  </div>
  <div class="budget-bar">
    <div class="budget-bar-header"><span class="budget-bar-name">Reserva y contingencias</span><span class="budget-bar-vals">5% · $2.6M</span></div>
    <div class="budget-bar-track"><div class="budget-bar-fill" style="width:5%;background:#888780;"></div></div>
  </div>

  <div class="audit-callout">
    <div class="audit-callout-title">Nota — Informe Contralor OC-25-22 (septiembre 2024)</div>
    <div class="audit-callout-text">
      La Oficina del Contralor de Puerto Rico emitió una opinión cualificada sobre las operaciones fiscales
      del Municipio de Arecibo, señalando áreas de mejora en control administrativo y gestión de personal.
      Este contexto refuerza la necesidad de sistemas de coordinación operacional más robustos.
    </div>
  </div>

  <div class="fiscal-context">
    <div class="fiscal-context-text">
      Los fondos federales potencialmente accesibles (${total_federal_available}) representan entre el
      <strong style="color:#c9a24d;">10% y 22% del presupuesto municipal total</strong> — una fuente de
      financiamiento significativa que actualmente el municipio no está capturando en su totalidad
      por limitaciones en capacidad operacional de coordinación y monitoreo.
    </div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- FUGA DE CAPITAL OPERACIONAL ← NUEVA        -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 4 de 15 · Análisis de Fuga de Capital</div>
  <h1>Fuga de Capital Operacional</h1>

  <div class="fuga-header">
    <div class="fuga-header-label">Estimado de pérdida operacional anual por ausencia de sistema de inteligencia</div>
    <div class="fuga-header-amount">${capital_leak_low} – ${capital_leak_high}</div>
    <div class="fuga-header-note">Estimado basado en patrones históricos de municipios de PR con perfil similar. Requiere validación con datos internos del municipio.</div>
  </div>

  <div class="fuga-grid">
    <div class="fuga-item">
      <div class="fuga-item-top">
        <div class="fuga-item-name">Fondos no capturados por plazos vencidos</div>
        <span class="fuga-pct fuga-red">38–54%</span>
      </div>
      <div class="fuga-amount">$200,000 – $400,000/año</div>
      <div class="fuga-desc">Sin sistema de monitoreo centralizado, los plazos de obligación FEMA y CDBG-DR se vencen antes de completar documentación requerida. Patrón documentado en municipios PR por COR3.</div>
    </div>

    <div class="fuga-item">
      <div class="fuga-item-top">
        <div class="fuga-item-name">Horas-hombre en gestión manual de grants</div>
        <span class="fuga-pct fuga-yellow">16–24%</span>
      </div>
      <div class="fuga-amount">$120,000 – $180,000/año</div>
      <div class="fuga-desc">18% del presupuesto operacional se destina a procesos manuales de gestión de fondos. Equivale a 2-3 empleados FTE dedicados exclusivamente a esta función sin herramientas adecuadas.</div>
    </div>

    <div class="fuga-item">
      <div class="fuga-item-top">
        <div class="fuga-item-name">Reportes FEMA fuera de tiempo</div>
        <span class="fuga-pct fuga-yellow">8–14%</span>
      </div>
      <div class="fuga-amount">$60,000 – $100,000 en riesgo activo</div>
      <div class="fuga-desc">$717,000+ en fondos FEMA ya obligados en Arecibo requieren reportes de progreso periódicos. La preparación manual genera riesgo de incumplimiento y posible devolución de fondos.</div>
    </div>

    <div class="fuga-item">
      <div class="fuga-item-top">
        <div class="fuga-item-name">Fragmentación interdepartamental</div>
        <span class="fuga-pct fuga-orange">8–10%</span>
      </div>
      <div class="fuga-amount">$60,000/año en fricción operacional</div>
      <div class="fuga-desc">La falta de coordinación en tiempo real entre planificación, finanzas y obras públicas reduce la velocidad de ejecución 15-20%, generando sobrecostos en obras y retrasos en aplicaciones.</div>
    </div>
  </div>

  <div class="fuga-monthly">
    <div>
      <div class="fuga-monthly-label">Costo estimado por cada mes sin sistema de inteligencia operacional</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">Incluye: fondos no capturados + horas-hombre + riesgo de devolución + fricción operacional</div>
    </div>
    <div class="fuga-monthly-val">${cost_per_month_low} – ${cost_per_month_high}</div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- AI EN PUERTO RICO ← NUEVA                  -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 5 de 15 · Inteligencia Artificial en Gobierno PR</div>
  <h1>Contexto: AI e Innovación Gubernamental en Puerto Rico</h1>

  <div class="ai-intro">
    Puerto Rico está en una transición activa hacia gobierno inteligente. El ecosistema de AI gubernamental
    emergente en la isla representa tanto una oportunidad como una presión: municipios que adopten
    capacidad tecnológica operacional ahora quedarán posicionados para acceder a una nueva categoría
    de fondos federales que priorizan innovación y modernización municipal demostrada.
  </div>

  <div class="ai-grid">
    <div class="ai-card">
      <div class="ai-card-icon">⚡</div>
      <div class="ai-card-title">Instituto de AI de Puerto Rico</div>
      <div class="ai-card-text">El Senado de Puerto Rico aprobó la creación del Instituto de Desarrollo e Innovación en Inteligencia Artificial. Sede: Engine-4 Foundation, Bayamón. Colaboradores: DDEC, UPR, Fideicomiso de Ciencia y Tecnología, Invest Puerto Rico.</div>
      <div class="ai-card-date">Noviembre 2025</div>
    </div>

    <div class="ai-card">
      <div class="ai-card-icon">💰</div>
      <div class="ai-card-title">$2M federales para AI en PR</div>
      <div class="ai-card-text">El Comisionado Residente anunció $2,018,800 en fondos federales (FIPSE-SP, Depto. de Educación) para proyecto de AI en institución universitaria de PR. Primera señal de fondos federales directos para AI en la isla.</div>
      <div class="ai-card-date">Enero 2026</div>
    </div>

    <div class="ai-card">
      <div class="ai-card-icon">🏛</div>
      <div class="ai-card-title">Puerto Rico AI Congress 2025</div>
      <div class="ai-card-text">Más de 60 empresas y organismos gubernamentales participaron en el primer congreso de AI de Puerto Rico. Gobierno, academia y sector privado definiendo hoja de ruta de AI para la isla en Engine-4, Bayamón.</div>
      <div class="ai-card-date">Octubre 2025</div>
    </div>

    <div class="ai-card">
      <div class="ai-card-icon">🔧</div>
      <div class="ai-card-title">GovTech municipal ya en operación</div>
      <div class="ai-card-text">Plataformas de AI ya están operando en municipios de PR para gestión ciudadana, visualización de proyectos y análisis de retroalimentación comunitaria. La adopción tecnológica municipal es una tendencia activa, no futura.</div>
      <div class="ai-card-date">2025 — activo</div>
    </div>
  </div>

  <div class="ai-warning">
    <div class="ai-warning-title">Señal Estratégica para Arecibo</div>
    <div class="ai-warning-text">
      Los próximos ciclos de fondos federales de modernización municipal priorizarán municipios con
      capacidad tecnológica operacional demostrada. El ecosistema de AI en Puerto Rico está definiendo
      quiénes serán los municipios líderes de la próxima década. Arecibo tiene una ventana de oportunidad
      para posicionarse como nodo pionero de inteligencia operacional municipal en Puerto Rico — aprovechando
      su historia científica (Observatorio de Arecibo) como narrativa de innovación y su posición estratégica
      como cabecera del distrito norte de la isla.
    </div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- HALLAZGOS OPERACIONALES                     -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 6 de 15 · Hallazgos Operacionales</div>
  <h1>Hallazgos Operacionales</h1>

  ${defaultFindings.map((f, i) => `
    <div class="finding-card">
      <div class="finding-number">Hallazgo ${i + 1} de ${defaultFindings.length}</div>
      <div class="finding-text">${f}</div>
    </div>
  `).join("")}
</section>


<!-- ══════════════════════════════════════════ -->
<!-- SCORECARD OPERACIONAL                       -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 7 de 15 · Scorecard Operacional</div>
  <h1>Scorecard Operacional</h1>
  <div class="summary-text" style="margin-bottom:30px;">
    Cada indicador refleja señales detectadas mediante análisis de fuentes públicas y patrones operacionales.
    Los porcentajes son estimados preliminares que requieren validación con datos internos del municipio.
    Verde = favorable · Amarillo = moderado · Rojo = exposición crítica.
  </div>

  <div class="score-section">
    <div class="score-header">
      <span class="score-name">Estabilidad de Infraestructura</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="score-badge" style="${riskBadgeStyle(infrastructure_stability)}">${riskLabel(infrastructure_stability)}</span>
        <span class="score-num" style="color:${scoreColor(infrastructure_stability)};">${infrastructure_stability}%</span>
      </div>
    </div>
    <div class="score-bar"><div class="score-fill" style="width:${infrastructure_stability}%;background:${scoreColor(infrastructure_stability)};"></div></div>
    <div class="score-explanation">El 28% de brecha indica documentación incompleta o proyectos de rehabilitación pendientes que pueden afectar la elegibilidad en FEMA-PA y CDBG-DR. El nuevo requisito DHS de consulta previa para obras sobre $100,000 (vigente desde junio 2025) aumenta la complejidad operacional para proyectos como el rompeolas de Arecibo.</div>
  </div>

  <div class="score-section">
    <div class="score-header">
      <span class="score-name">Preparación para Fondos Federales</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="score-badge" style="${riskBadgeStyle(funding_readiness)}">${riskLabel(funding_readiness)}</span>
        <span class="score-num" style="color:${scoreColor(funding_readiness)};">${funding_readiness}%</span>
      </div>
    </div>
    <div class="score-bar"><div class="score-fill" style="width:${funding_readiness}%;background:${scoreColor(funding_readiness)};"></div></div>
    <div class="score-explanation">Nivel favorable. El municipio tiene historial confirmado de recepción de fondos FEMA activos, fue el primer municipio en PR con cuentas al día (AAFAF, julio 2024), y tiene perfil elegible en CDBG-DR, HMGP y PR-ERF. El 16% de brecha corresponde a documentación desactualizada y ausencia de tracking centralizado de aplicaciones.</div>
  </div>

  <div class="score-section">
    <div class="score-header">
      <span class="score-name">Exposición al Riesgo Operacional</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="score-badge" style="${riskBadgeStyle(operational_risk)}">${riskLabel(operational_risk)}</span>
        <span class="score-num" style="color:${scoreColor(operational_risk)};">${operational_risk}%</span>
      </div>
    </div>
    <div class="score-bar"><div class="score-fill" style="width:${operational_risk}%;background:${scoreColor(operational_risk)};"></div></div>
    <div class="score-explanation">Señales de fragmentación en procesos de aprobación interdepartamental y capacidad limitada de generar reportes de progreso requeridos por FEMA y HUD. El Informe del Contralor OC-25-22 (sept 2024) identificó áreas de mejora en control administrativo que son consistentes con este indicador.</div>
  </div>

  <div class="score-section">
    <div class="score-header">
      <span class="score-name">Capacidad de Coordinación Digital</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="score-badge" style="${riskBadgeStyle(coordination_capacity)}">${riskLabel(coordination_capacity)}</span>
        <span class="score-num" style="color:${scoreColor(coordination_capacity)};">${coordination_capacity}%</span>
      </div>
    </div>
    <div class="score-bar"><div class="score-fill" style="width:${coordination_capacity}%;background:${scoreColor(coordination_capacity)};"></div></div>
    <div class="score-explanation">Área crítica. El 59% de brecha en coordinación digital es el mayor factor de riesgo de pérdida de fondos por plazos vencidos y solicitudes incompletas. Esta es la fricción central que genera la fuga de capital estimada de ${capital_leak_low}–${capital_leak_high} anuales y la que URUS aborda directamente.</div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- MATRIZ DE FONDOS                           -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 8 de 15 · Matriz de Oportunidades de Fondos</div>
  <h1>Matriz de Oportunidades de Fondos</h1>

  <div class="summary-text" style="margin-bottom:12px;">
    Los programas a continuación fueron identificados mediante análisis de señales federales activas confirmadas.
    Los montos son estimados preliminares basados en asignaciones históricas a municipios comparables de Puerto Rico
    y los criterios de elegibilidad publicados oficialmente por cada agencia.
  </div>

  <div class="funding-highlight">
    <div class="funding-highlight-label">Total estimado de fondos accesibles — Municipio de Arecibo</div>
    <div class="funding-highlight-amount">${total_federal_available}</div>
    <div class="funding-highlight-note">
      Condicionado a preparación operacional, documentación actualizada y cumplimiento de requisitos por programa.
      Requiere validación con registros municipales y agencias federales correspondientes.
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Programa</th>
        <th>Agencia</th>
        <th>Monto Estimado</th>
        <th>Prioridad</th>
        <th>Estado Actual</th>
      </tr>
    </thead>
    <tbody>
      ${fundingPrograms.map(p => {
        let badge = `<span class="p-media">${p.prioridad}</span>`;
        if (p.prioridad === "CRÍTICA") badge = `<span class="p-critica">${p.prioridad}</span>`;
        if (p.prioridad === "ALTA") badge = `<span class="p-alta">${p.prioridad}</span>`;
        return `
        <tr>
          <td>${p.programa}</td>
          <td style="font-weight:400;color:#6b7280;font-size:12px;">${p.agencia}</td>
          <td style="font-weight:700;color:#111827;">${p.monto}</td>
          <td>${badge}</td>
          <td style="font-size:12px;color:#6b7280;">${p.estado}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>

  <div class="nota-box">
    <h3>Nota sobre los estimados de fondos</h3>
    <p>
      FEMA confirmó y obligó $717,000+ directamente a Arecibo para obras permanentes (2020). El Comisionado
      Residente anunció $32.9M en fondos FEMA para municipios de PR incluyendo Arecibo (abril 2025).
      El programa CDBG-DR City-Rev tiene $1,298,000,000 a nivel isla; el HMGP tiene $1,000,000,000 disponibles.
      La Gobernadora González-Colón citó explícitamente a Arecibo en la distribución de $1,100,000,000
      en fondos FEMA (febrero 2025). La porción accesible por municipio depende de la competitividad
      de la solicitud y de la capacidad de ejecución demostrada.
    </p>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- MAPA DE INTELIGENCIA MUNICIPAL             -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 9 de 15 · Mapa de Inteligencia Municipal</div>
  <h1>Mapa de Inteligencia Municipal</h1>

  <div style="margin-top:28px;background:white;border-radius:18px;padding:22px;border:1px solid #e5e7eb;">
    <img src="https://raw.githubusercontent.com/josuanhub/urus-backend/main/public/maps/mapa%20PR.jpeg"
      style="width:100%;border-radius:12px;" />
  </div>

  <div class="map-indicators">
    <div class="map-metric">
      <div class="map-metric-label">Exposición FEMA</div>
      <div class="map-metric-value">${map_fema_exposure}</div>
    </div>
    <div class="map-metric">
      <div class="map-metric-label">Preparación para Fondos</div>
      <div class="map-metric-value">${map_funding_readiness}</div>
    </div>
    <div class="map-metric">
      <div class="map-metric-label">Riesgo Infraestructura</div>
      <div class="map-metric-value">${map_infrastructure_risk}</div>
    </div>
  </div>

  <div class="legal-box" style="margin-top:20px;">
    <p style="font-size:13px;color:#6b7280;line-height:1.75;">
      <strong style="color:#111827;">Historial de exposición — Arecibo:</strong>
      Huracán María (septiembre 2017) · Período sísmico (2020 — afectación indirecta) ·
      Huracán Fiona (septiembre 2022) · Tormenta Ernesto (agosto 2024).
      Este historial mantiene al municipio activamente elegible en múltiples programas federales.
      El nuevo requisito DHS (junio 2025) de consulta previa para obras sobre $100,000 agrega
      complejidad operacional que requiere monitoreo activo.
    </p>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- CADENAS DE EVIDENCIA                        -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 10 de 15 · Cadenas de Evidencia</div>
  <h1>Cadenas de Evidencia</h1>
  <div class="summary-text" style="margin-bottom:28px;">
    Las cadenas de evidencia documentan las señales públicas específicas que fundamentan cada hallazgo.
    Cada cadena conecta una señal confirmada con una fricción operacional identificada y su implicación estratégica.
  </div>

  ${defaultEvidenceChains.map((c, i) => `
    <div class="evidence-card">
      <div class="evidence-num">Cadena de Evidencia ${i + 1} de ${defaultEvidenceChains.length}</div>
      <div class="finding-text">${c}</div>
    </div>
  `).join("")}
</section>


<!-- ══════════════════════════════════════════ -->
<!-- VISIÓN GENERAL DE INTELIGENCIA             -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 11 de 15 · Visión General Operacional</div>
  <h1>Visión General de Inteligencia Operacional</h1>

  <div class="bar-widget">
    <div class="bar-row2">
      <div class="bar-label2">Estabilidad de Infraestructura</div>
      <div class="bar-pct2" style="color:${scoreColor(infrastructure_stability)};">${infrastructure_stability}%</div>
    </div>
    <div class="bar-track2"><div class="bar-fill2" style="width:${infrastructure_stability}%;background:#111827;"></div></div>
    <div class="bar-note2">El 28% de brecha representa áreas con documentación incompleta o rehabilitación pendiente. El nuevo requisito DHS para obras sobre $100,000 aumenta la complejidad operacional activa.</div>
  </div>

  <div class="bar-widget">
    <div class="bar-row2">
      <div class="bar-label2">Preparación para Fondos Federales</div>
      <div class="bar-pct2" style="color:${scoreColor(funding_readiness)};">${funding_readiness}%</div>
    </div>
    <div class="bar-track2"><div class="bar-fill2" style="width:${funding_readiness}%;background:#c9a24d;"></div></div>
    <div class="bar-note2">Nivel favorable. Historial confirmado: primer municipio PR con cuentas al día (AAFAF, jul 2024), $5.2M CRIM adicionales recibidos, fondos FEMA activos y obligados. El 16% de brecha es superable con preparación operacional focalizada.</div>
  </div>

  <div class="bar-widget">
    <div class="bar-row2">
      <div class="bar-label2">Capacidad de Coordinación Operacional</div>
      <div class="bar-pct2" style="color:${scoreColor(coordination_capacity)};">${coordination_capacity}%</div>
    </div>
    <div class="bar-track2"><div class="bar-fill2" style="width:${coordination_capacity}%;background:#7c3aed;"></div></div>
    <div class="bar-note2">Área crítica. El 59% de brecha genera la fuga de capital estimada de ${capital_leak_low}–${capital_leak_high} anuales. Mejorar la coordinación digital tiene el mayor retorno operacional posible dado el volumen de fondos federales activos disponibles para el municipio.</div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- RECOMENDACIONES ESTRATÉGICAS               -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 12 de 15 · Recomendaciones Estratégicas</div>
  <h1>Recomendaciones Estratégicas</h1>
  <div class="summary-text" style="margin-bottom:28px;">
    Las siguientes recomendaciones están ordenadas por prioridad operacional e impacto potencial
    en la capacidad de captura de fondos federales y posicionamiento estratégico del municipio.
    Todas requieren validación con el equipo operacional del municipio antes de implementación.
  </div>

  ${defaultRecommendations.map((r, i) => `
    <div class="recommendation">
      <span class="rec-number">${i + 1}.</span>${r}
    </div>
  `).join("")}
</section>


<!-- ══════════════════════════════════════════ -->
<!-- FUENTES E INSUMOS                          -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 13 de 15 · Fuentes e Insumos de Inteligencia</div>
  <h1>Fuentes e Insumos de Inteligencia</h1>

  <table>
    <thead>
      <tr>
        <th>Fuente</th>
        <th>Categoría</th>
        <th>Uso en el análisis</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>FEMA.gov / COR3 PR</td><td style="font-weight:400;color:#6b7280;">Fondos federales</td><td style="font-size:12px;color:#6b7280;">Obligaciones PA, HMGP, plazos de ejecución</td></tr>
      <tr><td>Comisionado Residente PR</td><td style="font-weight:400;color:#6b7280;">Fondos municipales</td><td style="font-size:12px;color:#6b7280;">Anuncios de fondos FEMA para municipios (abr 2025)</td></tr>
      <tr><td>PRDOH</td><td style="font-weight:400;color:#6b7280;">CDBG-DR / HMGP</td><td style="font-size:12px;color:#6b7280;">City-Rev, Global Match, Non-Federal Match</td></tr>
      <tr><td>OGP — Presupuestos Municipales</td><td style="font-weight:400;color:#6b7280;">Presupuesto oficial</td><td style="font-size:12px;color:#6b7280;">Resolución Núm. 75, AF 2023-2024, $52.7M</td></tr>
      <tr><td>AAFAF</td><td style="font-weight:400;color:#6b7280;">Ingresos CRIM</td><td style="font-size:12px;color:#6b7280;">$5.2M ingresos adicionales Arecibo, jul 2024</td></tr>
      <tr><td>Oficina del Contralor PR</td><td style="font-weight:400;color:#6b7280;">Auditoría</td><td style="font-size:12px;color:#6b7280;">Informe OC-25-22 Municipio de Arecibo, sept 2024</td></tr>
      <tr><td>Senado de Puerto Rico</td><td style="font-weight:400;color:#6b7280;">Legislación AI</td><td style="font-size:12px;color:#6b7280;">Instituto de AI PR, nov 2025</td></tr>
      <tr><td>Prensa regional PR</td><td style="font-weight:400;color:#6b7280;">Señales operacionales</td><td style="font-size:12px;color:#6b7280;">Metro PR, Primera Hora, El Vocero, CPI, El Nuevo Día</td></tr>
      <tr><td>DOE — FIPSE-SP</td><td style="font-weight:400;color:#6b7280;">Fondos AI federal</td><td style="font-size:12px;color:#6b7280;">$2M para AI en PR, ene 2026</td></tr>
      <tr><td>Serper / NewsAPI / Google News</td><td style="font-weight:400;color:#6b7280;">Señales en tiempo real</td><td style="font-size:12px;color:#6b7280;">Motor de ingesta URUS — actualización cada 24 horas</td></tr>
    </tbody>
  </table>

  <div class="legal-box" style="margin-top:24px;">
    <h3>Aviso Legal</h3>
    <p>
      Este documento es una evaluación preliminar de inteligencia operacional. Los hallazgos se derivan de
      información públicamente accesible, señales regionales y modelos de estimación analítica. No constituye
      auditoría municipal, determinación legal, certificación de ingeniería ni garantía financiera.
      Todas las conclusiones requieren validación mediante revisión municipal directa, verificación
      administrativa y confirmación institucional antes de ser utilizadas en decisiones formales.
    </p>
  </div>
</section>




<!-- ══════════════════════════════════════════ -->
<!-- PROPUESTA DE PILOTO                        -->
<!-- ══════════════════════════════════════════ -->
<section class="page">
  <div class="section-meta">Sección 13 de 15 · Propuesta de Piloto Ejecutivo</div>
  <h1>Propuesta de Piloto Ejecutivo</h1>

  <div class="summary-text" style="margin-bottom:28px;">
    Basado en los indicadores operacionales identificados, URUS recomienda un piloto ejecutivo
    limitado para validar los hallazgos con datos reales del municipio y establecer la línea
    base operacional. El objetivo es transformar las señales preliminares en inteligencia
    validada y accionable antes de que venzan las ventanas de aplicación federales activas.
  </div>

  <div class="pilot-option">
    <div class="pilot-duration">
      <div class="pilot-days">14</div>
      <div class="pilot-days-label">Días</div>
    </div>
    <div class="pilot-content">
      <h3>Validación de Inteligencia Ejecutiva</h3>
      <p>Validación de hallazgos con datos internos del municipio. Entrega de reporte actualizado con datos reales. Identificación de las 3 oportunidades de fondos con mayor probabilidad de captura inmediata. Presentación ejecutiva al alcalde y equipo directivo. Sin compromiso de continuidad.</p>
    </div>
  </div>

  <div class="pilot-option">
    <div class="pilot-duration">
      <div class="pilot-days">30</div>
      <div class="pilot-days-label">Días</div>
    </div>
    <div class="pilot-content">
      <h3>Monitoreo Operacional con Dashboard</h3>
      <p>Dashboard de inteligencia operacional en tiempo real. Monitoreo activo de señales de fondos federales. Alertas automáticas de plazos de obligación FEMA. Reportes semanales de inteligencia ejecutiva. Apoyo en preparación de documentación para aplicaciones activas identificadas.</p>
    </div>
  </div>

  <div class="pilot-option">
    <div class="pilot-duration">
      <div class="pilot-days">60</div>
      <div class="pilot-days-label">Días</div>
    </div>
    <div class="pilot-content">
      <h3>Ciclo Estratégico de Inteligencia de Fondos</h3>
      <p>Ciclo completo: monitoreo continuo, scoring actualizado, análisis de elegibilidad, apoyo en preparación de solicitudes, reportes ejecutivos mensuales y expansión a múltiples fuentes de fondos federales. Evaluación de ROI demostrable y propuesta de retainer mensual con métricas de impacto.</p>
    </div>
  </div>

  <div class="pilot-cta">
    <div class="pilot-cta-title">Próximo Paso Recomendado</div>
    <div class="pilot-cta-body">
      Agendar una sesión de revisión ejecutiva para validar los hallazgos de este informe,
      identificar las prioridades operacionales del municipio y determinar la viabilidad
      de un piloto de 30 días. Esta reunión no requiere compromiso previo de ningún tipo.
    </div>
  </div>
</section>


<!-- ══════════════════════════════════════════ -->
<!-- PORTADA FINAL CTA                          -->
<!-- ══════════════════════════════════════════ -->
<section class="page cover">
  <div class="gold-line"></div>
  <div class="cover-cta-title">Fase Operacional Recomendada: Piloto de 30 Días</div>
  <div class="cover-cta-body">
    Una revisión ejecutiva determinará si procede la validación operacional,
    el despliegue del piloto o la expansión del monitoreo estratégico de fondos federales.
    El objetivo es transformar las señales preliminares en inteligencia validada y accionable antes de que venzan las ventanas de aplicación federales activas.
  </div>
  <div class="cover-cta-block">
    URUS Operational Intelligence System<br>
    Inteligencia de Infraestructura Estratégica<br>
    Capa de Apoyo a Decisiones Ejecutivas<br>
    Sistema de Inteligencia GovTech · Puerto Rico
  </div>
  <div class="footer">URUS ∴ Capa de Inteligencia Estratégica</div>
</section>

</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({ path: filePath, format: "A4", printBackground: true });
  await browser.close();

  return { ok: true, fileName, filePath };
}

module.exports = { generateExecutiveReport };
