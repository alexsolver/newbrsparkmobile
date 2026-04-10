#!/usr/bin/env node
/**
 * Cria convite de prestador (se necessário) e envia o e-mail via Nylas.
 * Uso: node scripts/sendTechnicianInviteEmail.js [email]
 * Env: DATABASE_URL, JWT_SECRET (não usado aqui), Nylas; opcional INVITE_TENANT_ID (tenant empregador).
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const crypto = require('crypto');

const prisma = require('../src/db');
const { sendEmailViaNylas } = require('../src/lib/nylasSendEmail');

function defaultEmptySchedule() {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const o = {};
  for (const d of days) {
    o[d] = [{ id: `s_${d}_0`, enabled: false, start: '08:00', end: '18:00', locationIds: [] }];
  }
  return o;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function pickEmployerTenantId(invitedEmail) {
  const envTid = (process.env.INVITE_TENANT_ID || '').trim();
  if (envTid) {
    const t = await prisma.tenant.findUnique({ where: { id: envTid } });
    if (!t) throw new Error(`INVITE_TENANT_ID inválido: ${envTid}`);
    const dupe = await prisma.user.findFirst({ where: { tenantId: envTid, email: invitedEmail } });
    if (dupe) throw new Error(`Já existe utilizador com este e-mail neste tenant (${t.name}).`);
    return envTid;
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  for (const t of tenants) {
    const dupe = await prisma.user.findFirst({ where: { tenantId: t.id, email: invitedEmail } });
    if (!dupe) return t.id;
  }
  throw new Error('Nenhum tenant onde este e-mail ainda não exista como utilizador (escolha INVITE_TENANT_ID).');
}

async function main() {
  const em = String(process.argv[2] || 'alex@lansolver.com')
    .trim()
    .toLowerCase();
  if (!em.includes('@')) {
    console.error('Indique um e-mail válido.');
    process.exit(1);
  }

  const anyAppAccount = await prisma.user.findFirst({ where: { email: em }, select: { id: true } });
  if (!anyAppAccount) {
    console.error(
      'Este e-mail ainda não tem conta no BrSpark. O prestador deve cadastrar-se no app com este e-mail antes.'
    );
    process.exit(1);
  }

  const tenantId = await pickEmployerTenantId(em);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  const pending = await prisma.technicianRegistrationApplication.findFirst({
    where: {
      tenantId,
      invitedEmail: em,
      status: { in: ['INVITED', 'DRAFT', 'SUBMITTED', 'NEEDS_REVISION'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  let app = pending;
  let token;

  if (pending && ['INVITED', 'DRAFT', 'NEEDS_REVISION'].includes(pending.status)) {
    token = pending.inviteToken;
    console.log(`Reutilizando candidatura ${pending.id} (estado: ${pending.status}).`);
  } else if (pending && pending.status === 'SUBMITTED') {
    console.error(
      'Já existe candidatura submetida em análise para este e-mail neste tenant. Aguarde aprovação ou use outro tenant (INVITE_TENANT_ID).'
    );
    process.exit(1);
  } else {
    token = crypto.randomBytes(32).toString('hex');
    app = await prisma.technicianRegistrationApplication.create({
      data: {
        tenantId,
        inviteToken: token,
        invitedEmail: em,
        status: 'INVITED',
        responsesJson: {
          email: em,
          name: '',
          technician: {
            workScheduleJson: defaultEmptySchedule(),
            serviceLocationIds: [],
            professionalDocuments: [],
            skillsJson: [],
          },
          personalDocuments: [],
          faceEnrollmentPhotos: [],
        },
        createdByUserId: null,
      },
    });
    await prisma.technicianRegistrationEvent
      .create({
        data: {
          applicationId: app.id,
          type: 'CREATED',
          message: 'CLI sendTechnicianInviteEmail.js',
          actorEmail: 'script@local',
        },
      })
      .catch(() => {});
    console.log(`Convite criado: ${app.id}`);
  }

  const deepLinkHint = `brspark://auth/tech-registration?token=${token}`;
  const textBody = [
    'Olá,',
    '',
    `${tenant.name} convidou você a concluir o cadastro de prestador no BrSpark.`,
    `Utilize a conta BrSpark já registada com o e-mail ${em} e abra o convite no app.`,
    '',
    `Abrir no app: ${deepLinkHint}`,
    '',
    'Se o link não abrir, abra o BrSpark, inicie sessão com este e-mail e utilize o fluxo de cadastro por convite com o token fornecido pelo gestor.',
  ].join('\n');

  const htmlBody = `<p>Olá,</p>
<p><strong>${escapeHtml(tenant.name)}</strong> convidou você a concluir o <strong>cadastro de prestador</strong> no BrSpark.</p>
<p>Utilize a conta já registada com o e-mail <strong>${escapeHtml(em)}</strong> e abra o convite no app.</p>
<p><a href="${escapeHtml(deepLinkHint)}">Abrir convite no app</a></p>
<p style="font-size:12px;color:#555">Se o botão não funcionar, copie o link acima para o navegador ou abra o app manualmente após iniciar sessão.</p>`;

  const send = await sendEmailViaNylas({
    to: { email: em },
    subject: `Convite BrSpark — cadastro de prestador (${tenant.name})`,
    text: textBody,
    html: htmlBody,
  });

  if (send.skipped) {
    console.error('Nylas não configurado:', send.reason);
    console.log('Token (envio manual):', token);
    console.log('Deep link:', deepLinkHint);
    process.exit(2);
  }
  if (!send.ok) {
    console.error('Falha Nylas:', send.error);
    console.log('Token:', token);
    process.exit(3);
  }

  console.log('E-mail enviado com sucesso para', em);
  console.log('HTTP', send.status);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
