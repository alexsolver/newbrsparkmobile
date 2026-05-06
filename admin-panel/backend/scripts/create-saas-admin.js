#!/usr/bin/env node
/**
 * Cria ou atualiza um utilizador com papel SAAS_ADMIN para login no painel
 * (POST /api/auth/tenant-login: slug da organização + e-mail + senha).
 *
 * Variáveis de ambiente (ou flags --chave=valor):
 *   SAAS_ADMIN_EMAIL, SAAS_ADMIN_PASSWORD — obrigatórios
 *   TENANT_SLUG — default: aria
 *   CREATE_MISSING_TENANT=1 ou --create-tenant — cria o tenant se o slug não existir
 *   TENANT_CONTACT_EMAIL — e-mail único na tabela Tenant (obrigatório ao criar tenant; default platform.{slug}@local.invalid)
 *   TENANT_NAME, TENANT_OWNER_NAME — opcionais ao criar tenant
 *
 * Exemplo:
 *   cd admin-panel/backend && node scripts/create-saas-admin.js --slug=brspark --email=admin@brspark.com --password='SuaSenha' --create-tenant
 */
'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const prisma = require('../src/db');

function parseArgv(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (const a of argv) {
    if (a === '--create-tenant') {
      out['create-tenant'] = true;
      continue;
    }
    const m = /^--([\w-]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function resolveLocaleId() {
  const br = await prisma.localeProfile.findFirst({ where: { countryCode: 'BR' } });
  if (br) return br.id;
  const any = await prisma.localeProfile.findFirst();
  return any ? any.id : null;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const email = String(args.email || process.env.SAAS_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  const password = String(args.password || process.env.SAAS_ADMIN_PASSWORD || '');
  const slug = String(args.slug || process.env.TENANT_SLUG || 'aria')
    .trim()
    .toLowerCase();
  const createTenant =
    args['create-tenant'] === true || process.env.CREATE_MISSING_TENANT === '1';

  if (!email || !password) {
    console.error(
      [
        'Defina e-mail e senha, por exemplo:',
        '  TENANT_SLUG=aria SAAS_ADMIN_EMAIL=novo@empresa.com SAAS_ADMIN_PASSWORD=\'…\' node scripts/create-saas-admin.js',
        'ou:',
        '  node scripts/create-saas-admin.js --slug=aria --email=novo@empresa.com --password=\'…\' [--create-tenant]',
        '',
        'Se o slug não existir, use --create-tenant (e opcionalmente TENANT_CONTACT_EMAIL=email@unico.com).',
      ].join('\n'),
    );
    process.exit(1);
  }

  const slugNorm = slug;
  let tenant = await prisma.tenant.findFirst({
    where: { slug: { equals: slugNorm, mode: 'insensitive' } },
  });

  if (!tenant && createTenant) {
    const contactEmail = String(
      process.env.TENANT_CONTACT_EMAIL || `platform.${slugNorm}@local.invalid`,
    )
      .trim()
      .toLowerCase();
    const existingContact = await prisma.tenant.findUnique({ where: { email: contactEmail } });
    if (existingContact) {
      console.error(
        `O e-mail de contacto do tenant «${contactEmail}» já está em uso. Defina TENANT_CONTACT_EMAIL com outro valor.`,
      );
      process.exit(1);
    }
    const localeId = await resolveLocaleId();
    const name = String(process.env.TENANT_NAME || slugNorm).trim() || slugNorm;
    const ownerName = String(process.env.TENANT_OWNER_NAME || 'Administrador').trim();
    tenant = await prisma.tenant.create({
      data: {
        name,
        slug: slugNorm,
        email: contactEmail,
        ownerName,
        status: 'ACTIVE',
        localeId,
        defaultLang: 'pt-BR',
      },
    });
    console.log(`✅ Tenant criado: slug=${tenant.slug} id=${tenant.id}`);
  }

  if (!tenant) {
    console.error(
      `Nenhum tenant com slug «${slugNorm}». Execute npm run db:seed ou crie com --create-tenant.`,
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.tenantId !== tenant.id) {
    console.error(
      `O e-mail «${email}» já está associado a outra organização. Use outro e-mail ou remova/migre o registo.`,
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const displayName = String(process.env.SAAS_ADMIN_NAME || 'Administrador SaaS').trim();

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'SAAS_ADMIN',
        password: hash,
        name: displayName || existing.name,
        isActive: true,
      },
    });
    console.log(`✅ Utilizador atualizado: ${email} (SAAS_ADMIN) no tenant «${tenant.slug}»`);
  } else {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        name: displayName || 'Administrador SaaS',
        password: hash,
        role: 'SAAS_ADMIN',
        isActive: true,
      },
    });
    console.log(`✅ Utilizador criado: ${email} (SAAS_ADMIN) no tenant «${tenant.slug}»`);
  }

  console.log('\nLogin no painel:');
  console.log(`  Organização (slug): ${tenant.slug}`);
  console.log(`  E-mail: ${email}`);
  console.log('  Senha: (a que indicou)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
