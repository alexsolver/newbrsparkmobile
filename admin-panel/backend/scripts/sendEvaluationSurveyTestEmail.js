'use strict';

/**
 * Envia um e-mail de teste com o mesmo modelo do convite «Enviar convite» (avaliação ao cliente).
 * Usa a primeira instância PENDING com token na base; não altera dados.
 *
 * Uso:
 *   cd admin-panel/backend && node scripts/sendEvaluationSurveyTestEmail.js alex@brspark.com
 *
 * Requer: DATABASE_URL, MAILERSEND_* ou Nylas, ADMIN_PANEL_PUBLIC_BASE_URL (URL absoluta do evaluation-survey.html).
 */

require('dotenv').config();
const prisma = require('../src/db');
const { buildClientSurveyLinks } = require('../src/lib/evaluationSurveyUrl');
const { sendTransactionalEmailWithFallback } = require('../src/lib/transactionalEmailSend');

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escHrefAttr(url) {
  return String(url ?? '').replace(/"/g, '&quot;');
}

async function main() {
  const to = String(process.argv[2] || 'alex@brspark.com')
    .trim()
    .toLowerCase();
  if (!to.includes('@')) {
    console.error('Uso: node scripts/sendEvaluationSurveyTestEmail.js destino@email.com');
    process.exit(1);
  }

  const inst = await prisma.evaluationInstance.findFirst({
    where: { status: 'PENDING', publicToken: { not: null } },
    orderBy: { updatedAt: 'desc' },
    include: {
      execution: { select: { osNumber: true } },
      template: { select: { name: true } },
      tenant: { select: { name: true } },
    },
  });

  if (!inst) {
    console.error(
      'Nenhuma instância PENDING com token. Crie uma (ex.: sincronize uma OS) ou use o painel Qualidade → Instâncias.',
    );
    process.exit(2);
  }

  const links = buildClientSurveyLinks(inst.publicToken);
  const surveyUrl = links.fullUrl;
  if (!surveyUrl) {
    console.error(
      'ADMIN_PANEL_PUBLIC_BASE_URL não definido ou inválido. Defina no .env (origem onde está evaluation-survey.html, sem / no fim).',
    );
    process.exit(3);
  }

  const osLabel = inst.execution?.osNumber != null ? String(inst.execution.osNumber) : '—';
  const tenantLabel = inst.tenant?.name || 'BrSpark';
  const tplName = inst.template?.name || 'Avaliação de serviço';

  const subject = `[Teste] ${tenantLabel} — Avalie o atendimento (OS ${osLabel})`;
  const text = [
    `Olá,`,
    ``,
    `Convidamo-lo a avaliar o serviço (${tplName}). Ordem de serviço: ${osLabel}.`,
    `Abra o link no telemóvel ou computador:`,
    surveyUrl,
    ``,
    `Obrigado,`,
    tenantLabel,
  ].join('\n');
  const html = `<p>Olá,</p>
<p>Convidamo-lo a avaliar o serviço <strong>${escHtml(tplName)}</strong>. Ordem de serviço: <strong>${escHtml(
    osLabel,
  )}</strong>.</p>
<p><a href="${escHrefAttr(surveyUrl)}">Responder avaliação</a></p>
<p style="font-size:12px;color:#64748b">Se o botão não funcionar, copie e cole este endereço no navegador:<br/>${escHtml(
    surveyUrl,
  )}</p>`;

  const sent = await sendTransactionalEmailWithFallback({
    to,
    subject,
    text,
    html,
  });
  const ok = !!(sent.send && sent.send.ok);
  console.log(ok ? 'Enviado.' : 'Falha:', { provider: sent.provider, to, surveyUrl, error: sent.send?.error || sent.send?.reason });
  if (!ok) process.exit(4);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(99);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
