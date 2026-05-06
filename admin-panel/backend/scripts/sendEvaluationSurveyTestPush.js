'use strict';

/**
 * Envia um push de teste com o mesmo payload do convite à pesquisa (app abre o link no browser).
 * O utilizador deve ter sessão no app com notificações activas (token Expo registado).
 *
 * Uso:
 *   cd admin-panel/backend && node scripts/sendEvaluationSurveyTestPush.js alex@aria.com
 *
 * Requer: DATABASE_URL, EXPO_ACCESS_TOKEN (ou o que sendExpoPushToMany usar), ADMIN_PANEL_PUBLIC_BASE_URL para surveyUrl completo.
 */

require('dotenv').config();
const prisma = require('../src/db');
const { buildClientSurveyLinks } = require('../src/lib/evaluationSurveyUrl');
const { pushToUserById } = require('../src/lib/evaluationPush');

async function main() {
  const email = String(process.argv[2] || 'alex@aria.com')
    .trim()
    .toLowerCase();
  if (!email.includes('@')) {
    console.error('Uso: node scripts/sendEvaluationSurveyTestPush.js email@exemplo.com');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) {
    console.error('Nenhum utilizador activo com este e-mail:', email);
    process.exit(2);
  }

  const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
  if (!tokens.length) {
    console.error(
      'Sem token Expo para este utilizador. Abra o app Aria neste telemóvel, inicie sessão e active as notificações.',
    );
    process.exit(3);
  }

  const inst = await prisma.evaluationInstance.findFirst({
    where: { status: 'PENDING', publicToken: { not: null } },
    orderBy: { updatedAt: 'desc' },
    include: {
      execution: { select: { osNumber: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!inst) {
    console.error('Nenhuma avaliação PENDING com token na base. Sincronize uma OS ou crie instância de demo.');
    process.exit(4);
  }

  const links = buildClientSurveyLinks(inst.publicToken);
  const surveyUrl = links.fullUrl;
  if (!surveyUrl) {
    console.error('Defina ADMIN_PANEL_PUBLIC_BASE_URL no .env (URL onde está evaluation-survey.html).');
    process.exit(5);
  }

  const osLabel = inst.execution?.osNumber != null ? String(inst.execution.osNumber) : '—';
  const tenantLabel = inst.tenant?.name || 'Aria';

  await pushToUserById(user.id, {
    title: `${tenantLabel} — Avalie o serviço`,
    body: `Toque para responder à avaliação da OS ${osLabel}.`,
    data: {
      type: 'EVALUATION_CLIENT_SURVEY_INVITE',
      evaluationInstanceId: inst.id,
      surveyUrl,
      publicToken: inst.publicToken,
    },
  });

  console.log('Push enviado (mesmo tipo que «Enviar convite» no painel).', {
    toUser: user.email,
    role: user.role,
    tokens: tokens.length,
    surveyUrl,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(99);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
