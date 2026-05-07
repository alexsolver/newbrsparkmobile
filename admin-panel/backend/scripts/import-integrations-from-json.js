#!/usr/bin/env node
/**
 * Importa linhas da tabela Integration a partir de JSON (export do Postgres remoto).
 * Uso: node scripts/import-integrations-from-json.js [caminho.json]
 * Por omissão: scripts/.integrations-remote-import.json
 *
 * Requer DATABASE_URL no .env (PostgreSQL local).
 */
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const defaultFile = path.join(__dirname, '.integrations-remote-import.json');
const jsonPath = path.resolve(process.argv[2] || defaultFile);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL em falta (.env do backend).');
  process.exit(1);
}

const raw = fs.readFileSync(jsonPath, 'utf8').trim();
const rows = JSON.parse(raw);
if (!Array.isArray(rows)) {
  console.error('JSON tem de ser um array de integrações.');
  process.exit(1);
}

const prisma = new PrismaClient();

function rowToData(r) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    description: r.description ?? null,
    icon: r.icon ?? null,
    apiKey: r.apiKey ?? null,
    comprefaceDetectionKey: r.comprefaceDetectionKey ?? null,
    comprefaceVerificationKey: r.comprefaceVerificationKey ?? null,
    baseUrl: r.baseUrl ?? null,
    webhookUrl: r.webhookUrl ?? null,
    status: r.status ?? 'ACTIVE',
    lastTestedAt: r.lastTestedAt ? new Date(r.lastTestedAt) : null,
    metadata: r.metadata ?? undefined,
    createdAt: r.createdAt ? new Date(r.createdAt) : undefined,
    updatedAt: r.updatedAt ? new Date(r.updatedAt) : undefined,
  };
}

(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.integration.deleteMany({});
    for (const r of rows) {
      const data = rowToData(r);
      await tx.integration.create({ data });
    }
  });
  console.log(`Importadas ${rows.length} integrações de ${jsonPath}`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
