'use strict';

/**
 * Envia um e-mail de teste via integração «Microsoft Graph» (client credentials + Mail.Send).
 *
 * Uso:
 *   cd admin-panel/backend && node scripts/sendMicrosoftGraphTestEmail.js alexsolver@gmail.com
 *
 * Requer: DATABASE_URL (integração Microsoft Graph na BD) ou MICROSOFT_GRAPH_* no .env.
 */

require('dotenv').config();
const { sendEmailViaMicrosoftGraph } = require('../src/lib/microsoftGraphSendEmail');

async function main() {
  const to = String(process.argv[2] || '').trim().toLowerCase();
  if (!to || !to.includes('@')) {
    console.error('Uso: node scripts/sendMicrosoftGraphTestEmail.js destino@email.com');
    process.exit(1);
  }

  const subject = '[BrSpark] Teste Microsoft Graph';
  const text = [
    'Este é um e-mail de teste enviado pelo BrSpark usando a integração Microsoft Graph.',
    '',
    `Destinatário: ${to}`,
    `Data (UTC): ${new Date().toISOString()}`,
  ].join('\n');
  const html = `<p>Este é um e-mail de <strong>teste</strong> enviado pelo BrSpark via <strong>Microsoft Graph</strong>.</p>
<p>Destinatário: <code>${to.replace(/</g, '')}</code><br/>UTC: ${new Date().toISOString()}</p>`;

  const send = await sendEmailViaMicrosoftGraph({ to, subject, text, html });
  if (send.skipped) {
    console.error('Microsoft Graph não configurado:', send.reason);
    process.exit(2);
  }
  if (!send.ok) {
    console.error('Falha no envio:', send.error || send);
    if (send.data != null) console.error('Detalhe Graph:', JSON.stringify(send.data, null, 2));
    process.exit(3);
  }
  console.log('Enviado com sucesso para', to, 'HTTP', send.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
