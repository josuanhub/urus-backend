// urus-radar-template.js

function generarHtmlReporteVip(data) {
  const { nombreCliente, region, totalValor, permisos } = data;

  const filas = (permisos || []).map(p => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <strong>${p.tipo_tramite || 'Permiso'}</strong><br/>
        <small style="color: #666;">${p.solicitante || ''}</small>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${p.ubicacion || 'N/A'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">$${(p.valorEstimado || 0).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>URUS Radar Report</title>
    </head>
    <body style="font-family: sans-serif; background: #f4f6f8; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 8px;">
        <h2 style="color: #0d1b2a;">🔵 URUS Radar — Reporte VIP</h2>
        <p><strong>Cliente:</strong> ${nombreCliente || 'Cliente VIP'}</p>
        <p><strong>Región:</strong> ${region || 'General'}</p>
        <p><strong>Valor Estimado Total:</strong> $${(totalValor || 0).toLocaleString()}</p>
        <hr/>
        <h3>Oportunidades Detectadas</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f0f4f8;">
              <th style="padding: 8px;">Trámite</th>
              <th style="padding: 8px;">Ubicación</th>
              <th style="padding: 8px;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${filas}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

module.exports = { generarHtmlReporteVip };
