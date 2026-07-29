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

    return `
      <table width="100%" cellpadding="10" cellspacing="0" style="background-color:#f9f9f9; border-radius:6px; margin-bottom:20px;">
        <tr>
          <td style="font-size:14px; color:#333333; border-bottom:1px solid #e0e0e0; padding:10px;">
            <strong>📍 Ubicación:</strong> ${p.ubicacion || 'N/D'}
          </td>
        </tr>
        <tr>
          <td style="font-size:14px; color:#333333; border-bottom:1px solid #e0e0e0; padding:10px;">
            <strong>🏗️ Tipo:</strong> ${p.tipo_tramite || 'N/D'}
          </td>
        </tr>
        <tr>
          <td style="font-size:14px; color:#333333; border-bottom:1px solid #e0e0e0; padding:10px;">
            <strong>💰 Presupuesto:</strong> ${valorItem}
          </td>
        </tr>
        <tr>
          <td style="font-size:14px; color:#333333; padding:10px;">
            <strong>👤 Entidad:</strong> ${p.solicitante || 'N/D'}
          </td>
        </tr>
      </table>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">
              
              <!-- HEADER -->
              <tr>
                <td style="background-color:#0a0a0a; padding:30px 40px; text-align:center;">
                  <h1 style="color:#ffffff; font-size:24px; margin:0;">🚨 ALERTA URUS</h1>
                  <p style="color:#888888; font-size:14px; margin:5px 0 0 0;">Oportunidades detectadas en tiempo real</p>
                </td>
              </tr>

              <!-- CUERPO -->
              <tr>
                <td style="padding:40px;">
                  
                  <p style="font-size:18px; color:#333333; margin:0 0 10px 0;">
                    Hola <strong>${nombreCliente || 'cliente'}</strong>,
                  </p>
                  <p style="font-size:16px; color:#333333; margin:0 0 20px 0;">
                    Se detectaron <strong>${permisos?.length || 0} oportunidades</strong> en <strong>${region || 'tu zona'}</strong> con un volumen total de <strong>${totalFormateado}</strong>.
                  </p>
                  <p style="font-size:14px; color:#666666; margin:0 0 30px 0;">
                    Nadie en el mercado abierto lo sabe todavía. Pero el sistema de URUS ya lo detectó.
                  </p>

                  <!-- LISTA DE PERMISOS -->
                  ${tarjetasProyectos}

                  <!-- EXPLICACIÓN -->
                  <p style="font-size:14px; color:#333333; margin:30px 0 20px 0;">
                    <strong>Por qué estás recibiendo esto:</strong>
                  </p>
                  <p style="font-size:14px; color:#666666; margin:0 0 20px 0;">
                    Esta información no está en el periódico ni en listas públicas habituales. Es una alerta privada exclusiva para la red VIP de URUS Intelligence.
                  </p>
                  <p style="font-size:14px; color:#666666; margin:0 0 30px 0;">
                    El contratista que llega primero a la mesa no negocia en subasta: cierra el contrato. Mientras tu competencia espera a que el permiso salga en las noticias, tú puedes tener la propuesta en el escritorio del dueño hoy.
                  </p>

                  <!-- CTA -->
                  <p style="font-size:14px; color:#333333; margin:0 0 20px 0;">
                    <strong>Cada día recibes las mejores oportunidades nuevas de construcción de tu mercado antes que tu competencia.><br>
                    URUS rastrea oportunidades de alto valor en tiempo real y te las entrega antes que tu competencia.
                  </p>
                  <p style="font-size:14px; color:#666666; margin:0 0 30px 0;">
                    Pruébalo sin pagar un solo centavo:
                  </p>

                  <!-- BOTÓN -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <a href="mailto:urus.intelligence@gmail.com?subject=QUIERO&body=Quiero%20activar%20mi%20prueba%20gratis%20de%207%20días" style="display:inline-block; padding:14px 32px; background-color:#1a73e8; color:#ffffff; text-decoration:none; border-radius:6px; font-size:16px; font-weight:bold;">
                          ▶️ ACTIVAR PRUEBA GRATIS
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="font-size:12px; color:#999999; margin:30px 0 0 0; text-align:center;">
                    Un solo contrato de estos paga 10 años de inteligencia de datos.
                  </p>

                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td style="background-color:#0a0a0a; padding:20px 40px; text-align:center;">
                  <p style="color:#888888; font-size:12px; margin:0;">
                    URUS Intelligence<br>
                    Data & Automation for High-Ticket Construction
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

module.exports = { generarHtmlReporteVip };

