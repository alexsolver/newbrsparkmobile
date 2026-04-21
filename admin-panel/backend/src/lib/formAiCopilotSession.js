'use strict';

const prisma = require('../db');
const { parseFormContextFromOptions } = require('./formAiContext');
const { buildFilledFormsRagContext } = require('./formAiExecutionRag');
const { buildTemplateLibraryRagContext, buildCopilotRetrievalQuery } = require('./formAiTemplateLibraryRag');
const { runCopilotBrainTurn } = require('./copilotNext/runBrainTurn');
const { normalizeTemplateTitle } = require('./templateTitleUnique');
const {
  fetchMultipleReferenceUrlsForCopilot,
  normalizeHttpsReferenceUrls,
} = require('./formAiDocumentationFetch');

/**
 * Executa uma rodada completa do Copiloto (RAG execução + RAG biblioteca + LLM).
 * @param {{
 *   body: Record<string, unknown>,
 *   admin?: { tenantId?: string | null } | null,
 *   onProgress?: (ev: { step: string, message: string, ts?: number }) => void,
 * }} input
 * @returns {Promise<{ out: Awaited<ReturnType<typeof runCopilotBrainTurn>>, ragMeta: object, ragLibraryMeta: object }>}
 */
async function executeCopilotChatSession(input) {
  const startedAt = Date.now();
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const onProgress = typeof input.onProgress === 'function' ? input.onProgress : null;
  const meta = { retries: [], timings: {} };
  const prog = (step, message) => {
    try {
      onProgress?.({ step, message, ts: Date.now() });
    } catch (_) {
      /* ignore */
    }
  };

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('Envie "messages" (array não vazio).');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const schemaData = Array.isArray(body.schemaData) ? body.schemaData : [];
  const formContext = parseFormContextFromOptions(body.formContext || {});
  const spreadsheetSummary = typeof body.spreadsheetSummary === 'string' ? body.spreadsheetSummary : '';
  const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : '';
  const skipTemplateLibraryRag = body.skipTemplateLibraryRag === true || body.skipTemplateLibraryRag === 'true';
  const useEmbeddings = body.skipTemplateEmbeddings !== true && body.skipTemplateEmbeddings !== 'true';

  prog('start', 'Preparando o contexto…');

  let ragFilledFormsSummary = '';
  let ragMeta = { revisionCount: 0, skipped: 'no_template_id' };
  if (templateId) {
    prog('rag_exec', 'Carregando exemplos de preenchimentos deste modelo…');
    const t0 = Date.now();
    const rag = await buildFilledFormsRagContext({
      templateId,
      schemaData,
      maxRevisions: 10,
      maxChars: 14_000,
    });
    meta.timings.ragExecMs = Date.now() - t0;
    ragFilledFormsSummary = rag.text || '';
    ragMeta = rag.meta || { revisionCount: 0 };
  }

  let ragSimilarTemplatesSummary = '';
  let ragLibraryMeta = { usedCount: 0, skipped: skipTemplateLibraryRag ? 'skipped_by_client' : 'not_run' };
  if (!skipTemplateLibraryRag) {
    try {
      prog('rag_library', 'Consultando a biblioteca de formulários…');
      const t0 = Date.now();
      const retrievalQuery = buildCopilotRetrievalQuery({ messages, formContext });
      const tenantId =
        input.admin && typeof input.admin.tenantId === 'string' && input.admin.tenantId.trim()
          ? input.admin.tenantId.trim()
          : '';
      const lib = await buildTemplateLibraryRagContext({
        excludeTemplateId: templateId || null,
        queryText: retrievalQuery,
        tenantId: tenantId || null,
        topSimilar: 5,
        candidatePool: 120,
        maxChars: 12_000,
        useEmbeddings,
      });
      meta.timings.ragLibraryMs = Date.now() - t0;
      ragSimilarTemplatesSummary = lib.text || '';
      ragLibraryMeta = lib.meta || { usedCount: 0, skipped: 'empty' };
    } catch (eLib) {
      console.warn('[formAiCopilotSession] template library RAG:', eLib && eLib.message ? eLib.message : eLib);
      ragLibraryMeta = { usedCount: 0, skipped: 'error' };
    }
  }

  const templateSettings =
    body.templateSettings && typeof body.templateSettings === 'object' && !Array.isArray(body.templateSettings)
      ? body.templateSettings
      : {};
  const templateMetadata =
    body.templateMetadata && typeof body.templateMetadata === 'object' && !Array.isArray(body.templateMetadata)
      ? body.templateMetadata
      : {};

  let templateSiblingTitles = [];
  if (Array.isArray(body.templateSiblingTitles) && body.templateSiblingTitles.length) {
    templateSiblingTitles = body.templateSiblingTitles
      .map((x) => (x != null ? String(x).trim() : ''))
      .filter(Boolean)
      .slice(0, 120);
  } else {
    try {
      const fid =
        body.templateFolderId === undefined ||
        body.templateFolderId === null ||
        body.templateFolderId === ''
          ? null
          : String(body.templateFolderId);
      const excl = templateId || null;
      const rows = await prisma.checklistTemplate.findMany({
        where: { isActive: true, folderId: fid },
        select: { id: true, title: true },
      });
      templateSiblingTitles = rows
        .filter((r) => !excl || r.id !== excl)
        .map((r) => normalizeTemplateTitle(r.title))
        .filter(Boolean)
        .slice(0, 120);
    } catch (e) {
      console.warn('[formAiCopilotSession] sibling titles:', e && e.message ? e.message : e);
    }
  }

  const templateDraftTitle =
    typeof body.templateDraftTitle === 'string' ? String(body.templateDraftTitle) : '';
  const templateFolderId =
    body.templateFolderId === undefined
      ? undefined
      : body.templateFolderId === null || body.templateFolderId === ''
        ? null
        : String(body.templateFolderId);

  let documentationFetchedText = '';
  let documentationFetchWarning = '';
  /** @type {{ attempted: boolean, ok: boolean, chars: number, error: string | null, url: string | null, urls?: string[], items?: unknown[], referenceCount?: number, finalUrl?: string }} */
  const documentationFetch = {
    attempted: false,
    ok: false,
    chars: 0,
    error: null,
    url: null,
  };

  const refFromArray = [];
  if (Array.isArray(body.referenceUrls)) {
    for (const x of body.referenceUrls) {
      if (x != null && String(x).trim()) refFromArray.push(String(x).trim().slice(0, 2048));
    }
  }
  const legacyDoc =
    typeof body.documentationUrl === 'string' ? String(body.documentationUrl).trim().slice(0, 2048) : '';
  if (legacyDoc) refFromArray.unshift(legacyDoc);
  const urlsNormalized = normalizeHttpsReferenceUrls(refFromArray, 5);

  if (urlsNormalized.length > 0) {
    documentationFetch.attempted = true;
    documentationFetch.url = urlsNormalized[0];
    documentationFetch.urls = urlsNormalized;
    documentationFetch.referenceCount = urlsNormalized.length;
    prog('docs', `A carregar ${urlsNormalized.length} referência(ões) web…`);
    const t0 = Date.now();
    const multi = await fetchMultipleReferenceUrlsForCopilot(urlsNormalized, (i, n) => {
      prog('docs', `A carregar referência ${i}/${n}…`);
    });
    meta.timings.docsMs = Date.now() - t0;
    documentationFetchedText = multi.combinedText || '';
    documentationFetch.items = multi.items;
    documentationFetch.ok = multi.items.some((it) => it && it.ok);
    documentationFetch.chars = documentationFetchedText.length;
    if (multi.warnings && multi.warnings.length) {
      documentationFetchWarning = `Referências web: ${multi.warnings.join(' | ')}`;
    }
    if (!documentationFetch.ok && urlsNormalized.length === 1 && multi.items && multi.items[0]) {
      documentationFetch.error = multi.items[0].error || 'Falha ao carregar.';
      if (!documentationFetchWarning) {
        documentationFetchWarning = `Referência: não foi possível carregar — ${documentationFetch.error}`;
      }
    }
  }

  prog('llm', 'Gerando resposta com a IA…');
  const llmStartedAt = Date.now();
  let out = null;
  let llmError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const preferredMode =
        typeof body.copilotMode === 'string' && String(body.copilotMode).trim()
          ? String(body.copilotMode).trim()
          : 'auto';
      out = await runCopilotBrainTurn({
        messages,
        schemaData,
        formContext,
        spreadsheetSummary,
        ragFilledFormsSummary,
        ragSimilarTemplatesSummary,
        templateSettings,
        templateMetadata,
        templateDraftTitle,
        templateFolderId,
        templateId: templateId || null,
        templateSiblingTitles,
        documentationFetchedText: documentationFetchedText || undefined,
        documentationFetchWarning: documentationFetchWarning || undefined,
        preferredMode,
      });
      llmError = null;
      break;
    } catch (e) {
      llmError = e;
      const code = e && e.code ? String(e.code) : 'LLM_ERROR';
      const msg = e && e.message ? String(e.message) : 'Falha desconhecida.';
      meta.retries.push('tentativa ' + String(attempt + 1) + ': ' + code);
      if (attempt >= 1 || code === 'NO_OPENAI_KEY' || code === 'BAD_REQUEST') {
        break;
      }
      prog('llm_retry', 'A IA falhou uma vez e vamos tentar novamente…');
    }
  }
  meta.timings.llmMs = Date.now() - llmStartedAt;
  if (llmError) throw llmError;
  prog('done', 'Resposta pronta.');
  meta.timings.totalMs = Date.now() - startedAt;

  return { out: { ...out, meta }, ragMeta, ragLibraryMeta, documentationFetch };
}

module.exports = {
  executeCopilotChatSession,
};
