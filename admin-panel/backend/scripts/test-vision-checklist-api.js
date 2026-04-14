#!/usr/bin/env node
'use strict';

/**
 * Testa o endpoint externo da integração «Visão IA - YOLO» com o mesmo contrato
 * do proxy (/api/checklists/vision/analyze → serviço YOLO/outro).
 *
 * Pedido: POST multipart/form-data
 *   - media: ficheiro (imagem PNG de teste 1×1)
 *   - questions: JSON array [{ "id": string, "text": string }, ...]
 *   - schemaVersion: "1"
 * Cabeçalho opcional: Authorization: Bearer <apiKey do painel>
 *
 * Resposta esperada: JSON com array `answers` (alinhado a normalizeVisionAnalyzeResponse).
 *
 * Uso:
 *   node scripts/test-vision-checklist-api.js --from-db
 *   node scripts/test-vision-checklist-api.js "http://IP:PORTA/caminho" [bearerToken]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const prisma = require('../src/db');
const { testIntegration } = require('../src/lib/integrationTester');
const {
  buildMultipartBuffer,
  fetchVisionPostPreservingMethod,
  normalizeVisionAnalyzeResponse,
  prismaWhereVisionChecklistIntegration,
  VISION_INTEGRATION_NAME,
} = require('../src/lib/visionChecklistAnalyze');

const PROBE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l1GWDQAAAABJRU5ErkJggg==',
  'base64',
);

const PROBE_QUESTIONS = [{ id: 'probe_q', text: 'Há conteúdo visível na imagem?' }];

function printContract() {
  console.log(`
=== Contrato «${VISION_INTEGRATION_NAME}» (Visão IA / painel) ===
Método: POST
Content-Type: multipart/form-data; boundary=...
Partes:
  - media       (ficheiro)  imagem ou vídeo
  - questions   (texto)     JSON: [{"id":"...","text":"..."}, ...] (máx. 10 no proxy)
  - schemaVersion (texto)   "1"
Opcional: Authorization: Bearer <token configurado no painel>

Resposta: application/json com pelo menos:
  { "answers": [ { "questionId"|"question", "value", "confidence", ... }, ... ] }
Valores sim/não normalizados: yes/no/sim/não/true/false/...
`);
}

async function loadUrlFromDb() {
  const row = await prisma.integration.findFirst({
    where: prismaWhereVisionChecklistIntegration(),
  });
  if (!row || !String(row.baseUrl || '').trim()) {
    return null;
  }
  return {
    baseUrl: String(row.baseUrl).trim(),
    apiKey: row.apiKey != null ? String(row.apiKey).trim() : '',
  };
}

async function fetchAndNormalize(baseUrl, apiKey) {
  const boundary = '----BrSparkVisionCli' + Date.now().toString(36);
  const bodyBuf = buildMultipartBuffer(boundary, [
    { name: 'media', value: PROBE_PNG, filename: 'probe.png', contentType: 'image/png' },
    { name: 'questions', value: JSON.stringify(PROBE_QUESTIONS) },
    { name: 'schemaVersion', value: '1' },
  ]);
  const extRes = await fetchVisionPostPreservingMethod(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: bodyBuf,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await extRes.text();
  const normalized = normalizeVisionAnalyzeResponse(text, PROBE_QUESTIONS);
  return { status: extRes.status, normalized, bodyPreview: text.slice(0, 400) };
}

async function main() {
  const args = process.argv.slice(2);
  let baseUrl;
  let apiKey = '';

  if (args.length >= 1 && args[0].startsWith('http')) {
    baseUrl = args[0].trim();
    apiKey = (args[1] || '').trim();
  } else {
    const fromDb = await loadUrlFromDb();
    if (!fromDb) {
      printContract();
      console.error(
        'Sem URL: configure «Visão IA - YOLO» no painel ou passe o URL:\n' +
          '  node scripts/test-vision-checklist-api.js "http://host:porta/rota" [token]\n',
      );
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    }
    baseUrl = fromDb.baseUrl;
    apiKey = fromDb.apiKey;
    console.log(`(URL lido da base de dados: ${baseUrl})\n`);
  }

  printContract();
  console.log(`Endpoint em teste: ${baseUrl}\n`);

  const probe = await testIntegration({
    type: 'VISION',
    name: VISION_INTEGRATION_NAME,
    baseUrl,
    apiKey,
  });

  console.log('--- Passo 1: teste de integração (POST multipart) ---');
  console.log(JSON.stringify(probe, null, 2));

  if (!probe.ok) {
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }

  console.log('\n--- Passo 2: validação do JSON de resposta (contrato BrSpark) ---');
  try {
    const { status, normalized, bodyPreview } = await fetchAndNormalize(baseUrl, apiKey);
    console.log('HTTP', status);
    if (!normalized.ok) {
      console.log('normalizeVisionAnalyzeResponse:', normalized.error);
      console.log('Pré-visualização do corpo:', bodyPreview.replace(/\s+/g, ' '));
      await prisma.$disconnect().catch(() => {});
      process.exit(2);
    }
    console.log('OK — resposta compatível. Resumo das respostas:');
    console.log(
      JSON.stringify(
        normalized.payload.answers.map((a) => ({
          questionId: a.questionId,
          value: a.value,
          confidence: a.confidence,
        })),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error('Erro no passo 2:', e.message || e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }

  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

main();
