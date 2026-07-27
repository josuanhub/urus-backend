// urus-radar-template.js

function generarHtmlReporteVip(data) {
  const { nombreCliente, region, totalValor, permisos } = data;

  const totalFormateado = (totalValor || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });

  const tarjetasProyectos = (permisos || []).map(p => {
    const valorItem = (p.valorEstimado || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    });

    const score = p.score || 90;
    let badgeColor = '#10B981'; // verde
    if (score < 80) badgeColor = '#F59E0B'; // amarillo

    return `
      <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <span style="font-size: 12px; font-weight: 700; color: #4B5563; text-transform: uppercase; tracking-spacing: 0.5px;">${p.tipo_tramite || 'Permiso de Construcción'}</span>
            <h4 style="margin: 4px 0 0 0; color: #111827; font-size: 16px;">Caso: ${p.caso || 'N/A'}</h4>
          </div>
          <span style="background-color: ${badgeColor}; color: #ffffff; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px;">
            Score: ${score}/100
          </span>
        </div>
        
        <p style="margin: 0 0 12px 0; color: #374151; font-size: 14px; line-height: 1.5;">
          <strong>📍 Ubicación:</strong> ${p.ubicacion || 'Dirección no especificada'}<br/>
          <strong>👤 Solicitante/Contratista:</strong> ${p.solicitante || 'En revisión'}
        </p>

        <div style="background-color: #f9fafb; padding: 10px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280; font-weight: 500;">Valor Estimado:</span>
          <span style="font-size: 16px; color: #0f172a; font-weight: 700;">${valorItem}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>URUS Intelligence — Reporte VIP</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        
        <!-- ENCABEZADO CORPORATIVO -->
        <div style="background-color: #0f172a; padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px; font-weight: 800;">URUS INTELLIGENCE</h1>
          <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 14px;">Oportunidades de Construcción Exclusivas</p>
        </div>

        <!-- MÉTRICA DESTACADA -->
        <div style="background-color: #eff6ff; border-bottom: 1px solid #dbeafe; padding: 24px; text-align: center;">
          <p style="margin: 0; font-size: 13px; color: #1e40af; font-weight: 600; text-transform: uppercase;">Nuevos Proyectos Detectados en ${region || 'tu zona'}</p>
          <h2 style="margin: 8px 0 0 0; color: #1e3a8a; font-size: 32px; font-weight: 800;">${totalFormateado} USD</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #3b82f6;">${permisos?.length || 0} oportunidades de alto valor identificadas hoy</p>
        </div>

        <!-- LISTA DE TARJETAS DE PROYECTO -->
        <div style="padding: 24px;">
          <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #111827;">Oportunidades Destacadas</h3>
          ${tarjetasProyectos}

          <!-- BOTÓN DE LLAMADO A LA ACCIÓN (CTA) -->
          <div style="margin-top: 32px; padding: 24px; background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; text-align: center;">
            <h3 style="margin: 0 0 8px 0; color: #581c87; font-size: 18px;">¿Quieres recibir estos datos en tiempo real antes que tu competencia?</h3>
            <p style="margin: 0 0 18px 0; color: #6b21a8; font-size: 14px; line-height: 1.4;">Accede al flujo diario de leads calificados directamente en tu WhatsApp o Correo.</p>
            <a href="https://urusverify.com/subscribe" style="background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; display: inline-block; font-size: 15px;">Activar Suscripción VIP Aquí</a>
          </div>
        </div>

        <!-- PIE DE PÁGINA -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
          <p style="margin: 0;">URUS Intelligence OS — Reportes Automatizados de Permisos</p>
        </div>

      </div>
    </body>
    </html>
  `;
}

module.exports = { generarHtmlReporteVip };
