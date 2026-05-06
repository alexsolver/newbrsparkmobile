'use strict';

const fs = require('fs');
const path = require('path');
const { resolveOpenAiCredentials } = require('./openAiCredentials');

const CONTEXT_TTL_MS = 5 * 60 * 1000;

let contextCache = {
  builtAt: 0,
  text: '',
  sources: [],
};

function safeReadFile(absPath, maxChars) {
  try {
    const raw = fs.readFileSync(absPath, 'utf8');
    const txt = String(raw || '').trim();
    if (!txt) return '';
    if (!maxChars || txt.length <= maxChars) return txt;
    return `${txt.slice(0, maxChars)}\n\n...[truncado ${txt.length - maxChars} caracteres]`;
  } catch {
    return '';
  }
}

function parseOpenApiDigest(openApiText) {
  if (!openApiText) {
    return 'OpenAPI indisponível.';
  }
  try {
    const spec = JSON.parse(openApiText);
    const pathsObj = spec && typeof spec === 'object' && spec.paths && typeof spec.paths === 'object' ? spec.paths : {};
    const pathKeys = Object.keys(pathsObj);
    const tagArr = Array.isArray(spec?.tags) ? spec.tags : [];

    const operations = [];
    for (const p of pathKeys) {
      const byMethod = pathsObj[p] && typeof pathsObj[p] === 'object' ? pathsObj[p] : {};
      for (const method of Object.keys(byMethod)) {
        const m = String(method || '').toLowerCase();
        if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(m)) continue;
        const op = byMethod[method] || {};
        const sum = op.summary ? String(op.summary).trim() : '';
        const tags = Array.isArray(op.tags) ? op.tags.join(', ') : '';
        const sec = Array.isArray(op.security)
          ? op.security.length === 0
            ? 'public'
            : 'protected'
          : 'protected(default)';
        operations.push(`${m.toUpperCase()} ${p} | ${sec}${sum ? ` | ${sum}` : ''}${tags ? ` | tags: ${tags}` : ''}`);
      }
    }

    const lines = operations.slice(0, 260);
    const more = operations.length > lines.length ? `\n... +${operations.length - lines.length} operações` : '';

    return [
      `Título: ${spec?.info?.title || 'n/a'} | Versão: ${spec?.info?.version || 'n/a'}`,
      `Paths: ${pathKeys.length} | Operações: ${operations.length} | Tags: ${tagArr.length}`,
      `SecuritySchemes: ${Object.keys(spec?.components?.securitySchemes || {}).join(', ') || 'nenhum'}`,
      '',
      'Operações (amostra):',
      ...lines,
      more,
    ].join('\n');
  } catch (e) {
    return `OpenAPI inválido: ${e.message}`;
  }
}

function parsePrismaDigest(schemaText) {
  if (!schemaText) {
    return 'Schema Prisma indisponível.';
  }
  const modelNames = [];
  const enumNames = [];
  const modelRe = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  const enumRe = /^enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;

  let m;
  while ((m = modelRe.exec(schemaText))) modelNames.push(m[1]);
  while ((m = enumRe.exec(schemaText))) enumNames.push(m[1]);

  return [
    `Models (${modelNames.length}): ${modelNames.slice(0, 120).join(', ')}${modelNames.length > 120 ? ' ...' : ''}`,
    `Enums (${enumNames.length}): ${enumNames.slice(0, 80).join(', ')}${enumNames.length > 80 ? ' ...' : ''}`,
    '',
    'Schema (trecho):',
    schemaText.slice(0, 40_000) + (schemaText.length > 40_000 ? '\n\n...[truncado]' : ''),
  ].join('\n');
}

function extractRouteMounts(indexSource) {
  if (!indexSource) return 'Montagens de rotas indisponíveis.';
  const lines = indexSource
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter((ln) =>
      ln.startsWith('app.use(') ||
      ln.startsWith('app.get(') ||
      ln.startsWith('app.post(') ||
      ln.startsWith('app.patch(') ||
      ln.startsWith('app.put(') ||
      ln.startsWith('app.delete(')
    );
  const trimmed = lines.slice(0, 260);
  return [
    `Linhas relevantes (${lines.length}):`,
    ...trimmed,
    lines.length > trimmed.length ? `... +${lines.length - trimmed.length} linhas` : '',
  ].join('\n');
}

function buildDocsAssistantContext() {
  const now = Date.now();
  if (contextCache.text && now - contextCache.builtAt < CONTEXT_TTL_MS) {
    return {
      text: contextCache.text,
      sources: contextCache.sources,
      builtAt: contextCache.builtAt,
      cached: true,
    };
  }

  const openApiPath = path.resolve(__dirname, '../../../openapi.json');
  const prismaSchemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
  const backendIndexPath = path.resolve(__dirname, '../index.js');
  const openApiBuilderPath = path.resolve(__dirname, '../../../scripts/build-openapi.js');
  const adminReadmePath = path.resolve(__dirname, '../../../README.md');
  const designDocPath = path.resolve(__dirname, '../../../../docs/DESIGN.md');

  const openApiRaw = safeReadFile(openApiPath, 2_500_000);
  const prismaRaw = safeReadFile(prismaSchemaPath, 180_000);
  const backendIndexRaw = safeReadFile(backendIndexPath, 140_000);
  const openApiBuilderRaw = safeReadFile(openApiBuilderPath, 20_000);
  const adminReadmeRaw = safeReadFile(adminReadmePath, 60_000);
  const designDocRaw = safeReadFile(designDocPath, 60_000);

  const sections = [
    '## OPENAPI_DIGEST',
    parseOpenApiDigest(openApiRaw),
    '',
    '## PRISMA_SCHEMA_DIGEST',
    parsePrismaDigest(prismaRaw),
    '',
    '## BACKEND_ROUTE_MOUNTS',
    extractRouteMounts(backendIndexRaw),
    '',
    '## OPENAPI_BUILDER_SCRIPT',
    openApiBuilderRaw || 'Indisponível',
    '',
    '## ADMIN_PANEL_README',
    adminReadmeRaw || 'Indisponível',
    '',
    '## SYSTEM_DESIGN_DOC',
    designDocRaw || 'Indisponível',
  ];

  const text = sections.join('\n');
  const sources = [
    { id: 'openapi', path: openApiPath },
    { id: 'prisma', path: prismaSchemaPath },
    { id: 'backend_index', path: backendIndexPath },
    { id: 'openapi_builder', path: openApiBuilderPath },
    { id: 'admin_readme', path: adminReadmePath },
    { id: 'design_doc', path: designDocPath },
  ];

  contextCache = {
    builtAt: now,
    text,
    sources,
  };

  return {
    text,
    sources,
    builtAt: now,
    cached: false,
  };
}

function normalizeInputMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(-14)) {
    if (!row || typeof row !== 'object') continue;
    const role = String(row.role || '').trim().toLowerCase();
    if (role !== 'user' && role !== 'assistant') continue;
    const content = String(row.content || '').trim();
    if (!content) continue;
    out.push({ role, content: content.slice(0, 5000) });
  }
  return out;
}

async function askDocsAssistant(input) {
  const messages = normalizeInputMessages(input?.messages);
  if (!messages.length) {
    const err = new Error('Envie "messages" com pelo menos uma pergunta.');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const { apiKey, model, baseUrl } = await resolveOpenAiCredentials();
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error(
      'Chave OpenAI ausente: configure a integração "OpenAI" em Integrações no painel ou defina OPENAI_API_KEY no servidor.'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }

  const context = buildDocsAssistantContext();

  const systemPrompt =
    'Você é o especialista técnico-operacional do Aria. ' +
    'Responda dúvidas de arquitetura, API, banco de dados, segurança, fluxos e automações com objetividade técnica. ' +
    'Use SOMENTE as informações do contexto fornecido; quando algo não estiver no contexto, diga explicitamente que não foi encontrado. ' +
    'Sempre devolva resposta em português do Brasil, incluindo: (1) resposta direta, (2) principais evidências, (3) riscos/limitações se houver. ' +
    'Se citar endpoints, use o caminho e método HTTP. Se citar banco, cite nomes de models/tabelas quando possível.';

  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${String(apiKey).trim()}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `### CONTEXTO TÉCNICO ARIA\n${context.text}` },
        ...messages,
      ],
    }),
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta OpenAI inválida (HTTP ${response.status}): ${raw.slice(0, 200)}`);
  }

  if (!response.ok) {
    const msg = parsed?.error?.message || raw.slice(0, 280);
    throw new Error(`OpenAI: ${msg}`);
  }

  const answer = parsed?.choices?.[0]?.message?.content;
  if (!answer || typeof answer !== 'string') {
    throw new Error('Resposta OpenAI sem conteúdo textual.');
  }

  return {
    answer: answer.trim(),
    model,
    sources: context.sources,
    contextBuiltAt: context.builtAt,
    contextCached: context.cached,
  };
}

module.exports = {
  askDocsAssistant,
  buildDocsAssistantContext,
};
