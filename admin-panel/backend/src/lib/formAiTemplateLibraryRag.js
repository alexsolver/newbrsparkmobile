'use strict';

const prisma = require('../db');
const {
  createEmbeddingVector,
  cosineSimilarity,
  jsonToVector,
} = require('./formAiOpenAiEmbeddings');

/** Mínimo de modelos com embedding na base para usar ranqueamento semântico. */
const MIN_EMBEDDINGS_FOR_SEMANTIC = 4;
/** Consultas muito curtas usam ranqueamento léxico (mais estável). */
const MIN_QUERY_LEN_FOR_EMBEDDING = 8;

/**
 * @param {string | null | undefined} s
 * @returns {string[]}
 */
function tokenize(s) {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * @param {string[]} arr
 * @returns {string[]}
 */
function uniqueTokens(arr) {
  return [...new Set(arr)];
}

/**
 * Monta texto de consulta para ranquear modelos (objetivo do painel + última mensagem do usuário).
 * @param {{
 *   messages?: { role?: string, content?: string }[],
 *   formContext?: { objective?: string, sector?: string, formKind?: string },
 * }} input
 * @returns {string}
 */
function buildCopilotRetrievalQuery(input) {
  const parts = [];
  const ctx = input.formContext && typeof input.formContext === 'object' ? input.formContext : {};
  const obj = typeof ctx.objective === 'string' ? ctx.objective.trim() : '';
  if (obj) parts.push(obj);
  const sec = typeof ctx.sector === 'string' ? ctx.sector.trim() : '';
  if (sec) parts.push(sec);
  const fk = typeof ctx.formKind === 'string' ? ctx.formKind.trim() : '';
  if (fk) parts.push(fk);
  const msgs = Array.isArray(input.messages) ? input.messages : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.role === 'user' && m.content) {
      parts.push(String(m.content).trim().slice(0, 2000));
      break;
    }
  }
  return parts.join(' ').trim().slice(0, 4000);
}

/**
 * @param {string[]} queryTokens
 * @param {string} title
 * @param {string} description
 * @returns {number}
 */
function scoreAgainstQuery(queryTokens, title, description) {
  if (!queryTokens.length) return 0;
  const docTokens = uniqueTokens([...tokenize(title), ...tokenize(description)]);
  const setDoc = new Set(docTokens);
  let score = 0;
  for (const t of queryTokens) {
    if (setDoc.has(t)) score += 3;
  }
  const lowTitle = String(title || '').toLowerCase();
  for (const t of queryTokens) {
    if (t.length >= 3 && lowTitle.includes(t)) score += 2;
  }
  return score;
}

/**
 * @param {unknown} schemaData
 * @returns {{ lines: string[], fieldCount: number, sectionCount: number }}
 */
function compactSchemaOutline(schemaData) {
  const lines = [];
  if (!Array.isArray(schemaData)) {
    return { lines, fieldCount: 0, sectionCount: 0 };
  }
  let n = 0;
  let sections = 0;
  let fields = 0;
  for (const f of schemaData) {
    if (!f || typeof f !== 'object') continue;
    const type = String(f.type || '').trim();
    if (type === 'section_break') {
      sections++;
      if (lines.length < 42) {
        const lab = f.label != null ? String(f.label).trim().slice(0, 120) : '';
        lines.push(`  Etapa: ${lab || '(sem nome)'}`);
      }
      continue;
    }
    fields++;
    if (n >= 34) continue;
    const label = f.label != null ? String(f.label).trim().slice(0, 120) : '';
    if (!type) continue;
    lines.push(`  · ${label || type} [${type}]`);
    n++;
  }
  return { lines, fieldCount: fields, sectionCount: sections };
}

/**
 * @param {{
 *   excludeTemplateId?: string | null,
 *   queryText?: string,
 *   tenantId?: string | null,
 *   topSimilar?: number,
 *   maxChars?: number,
 * }} opts
 * @returns {Promise<{ text: string, meta: Record<string, unknown> } | null>}
 */
async function tryBuildTemplateLibraryRagFromEmbeddings(opts) {
  const excludeId =
    opts.excludeTemplateId != null && String(opts.excludeTemplateId).trim()
      ? String(opts.excludeTemplateId).trim()
      : '';
  const maxChars = Math.min(20_000, Math.max(2000, opts.maxChars ?? 12_000));
  const topSimilar = Math.min(10, Math.max(2, opts.topSimilar ?? 5));
  const queryText = opts.queryText != null ? String(opts.queryText).trim() : '';
  if (queryText.length < MIN_QUERY_LEN_FOR_EMBEDDING) return null;

  const tenantId = opts.tenantId != null && String(opts.tenantId).trim() ? String(opts.tenantId).trim() : '';

  const whereEmb = {
    template: {
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}),
    },
  };

  const rows = await prisma.checklistTemplateEmbedding.findMany({
    where: whereEmb,
    select: {
      vector: true,
      template: {
        select: { id: true, title: true, description: true, schemaData: true, updatedAt: true },
      },
    },
    take: 500,
  });

  if (rows.length < MIN_EMBEDDINGS_FOR_SEMANTIC) return null;

  let qVec;
  try {
    const { vector } = await createEmbeddingVector(queryText.slice(0, 8000));
    qVec = vector;
  } catch {
    return null;
  }

  const scored = [];
  for (const row of rows) {
    const tpl = row.template;
    if (!tpl) continue;
    const v = jsonToVector(row.vector);
    if (!v || !qVec.length || v.length !== qVec.length) continue;
    const sim = cosineSimilarity(qVec, v);
    scored.push({ sim, template: tpl });
  }

  if (!scored.length) return null;

  scored.sort((a, b) => {
    if (b.sim !== a.sim) return b.sim - a.sim;
    const ta = a.template.updatedAt ? new Date(a.template.updatedAt).getTime() : 0;
    const tb = b.template.updatedAt ? new Date(b.template.updatedAt).getTime() : 0;
    return tb - ta;
  });

  const picked = scored.slice(0, topSimilar);
  const parts = [];
  let used = 0;
  for (const p of picked) {
    const row = p.template;
    const schemaData = Array.isArray(row.schemaData) ? row.schemaData : [];
    const outline = compactSchemaOutline(schemaData);
    const header =
      `Modelo «${String(row.title || '').slice(0, 160)}» (${outline.fieldCount} campos, ${outline.sectionCount} etapas)` +
      ` — similaridade ${p.sim.toFixed(4)}`;
    const descLine =
      row.description && String(row.description).trim()
        ? `Resumo: ${String(row.description).trim().slice(0, 280)}`
        : '';
    const bodyLines = outline.lines.join('\n').slice(0, 3200);
    const chunk = [header, descLine, 'Estrutura (referência):', bodyLines].filter(Boolean).join('\n');

    const next = parts.length ? parts.join('\n\n—\n\n') + '\n\n—\n\n' + chunk : chunk;
    if (next.length > maxChars) break;
    parts.push(chunk);
    used++;
  }

  if (!parts.length) {
    return {
      text: '',
      meta: {
        candidateCount: rows.length,
        usedCount: 0,
        skipped: 'outline_too_large',
        ranking: 'embedding',
      },
    };
  }

  const intro =
    '### Modelos semelhantes na biblioteca (RAG — referência)\n' +
    'São outros formulários ativos do painel (ranqueados por **similaridade semântica** com o pedido, via embeddings). ' +
    'Use só como inspiração de estrutura, tipos de campo e agrupamento em etapas. ' +
    'Não copie dados pessoais; os **ids de campos** destes modelos **não** servem no formulário atual — no schema compacto atual use sempre os **id** listados aí.\n\n';

  const text = (intro + parts.join('\n\n—\n\n')).slice(0, maxChars);
  return {
    text,
    meta: {
      candidateCount: rows.length,
      usedCount: used,
      ranking: 'embedding',
      queryLength: queryText.length,
    },
  };
}

/**
 * Recupera outros modelos ativos, ranqueia por similaridade léxica com o pedido e devolve resumo estrutural.
 * @param {{
 *   excludeTemplateId?: string | null,
 *   queryText?: string,
 *   tenantId?: string | null,
 *   candidatePool?: number,
 *   topSimilar?: number,
 *   maxChars?: number,
 *   useEmbeddings?: boolean,
 * }} opts
 * @returns {Promise<{ text: string, meta: { candidateCount: number, usedCount: number, skipped?: string, ranking?: string } }>}
 */
async function buildTemplateLibraryRagContext(opts) {
  const excludeId =
    opts.excludeTemplateId != null && String(opts.excludeTemplateId).trim()
      ? String(opts.excludeTemplateId).trim()
      : '';
  const maxChars = Math.min(20_000, Math.max(2000, opts.maxChars ?? 12_000));
  const topSimilar = Math.min(10, Math.max(2, opts.topSimilar ?? 5));
  const candidatePool = Math.min(250, Math.max(30, opts.candidatePool ?? 120));

  const queryText = opts.queryText != null ? String(opts.queryText).trim() : '';
  const useEmbeddings = opts.useEmbeddings !== false;

  if (useEmbeddings) {
    try {
      const emb = await tryBuildTemplateLibraryRagFromEmbeddings(opts);
      if (emb && emb.text && String(emb.text).trim()) {
        return emb;
      }
    } catch (e) {
      console.warn('[formAiTemplateLibraryRag] embeddings:', e && e.message ? e.message : e);
    }
  }

  const queryTokens = uniqueTokens(tokenize(queryText));

  const where = { isActive: true };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const tenantId = opts.tenantId != null && String(opts.tenantId).trim() ? String(opts.tenantId).trim() : '';
  if (tenantId) {
    where.OR = [{ tenantId }, { tenantId: null }];
  }

  try {
    const pool = await prisma.checklistTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: candidatePool,
      select: {
        id: true,
        title: true,
        description: true,
        updatedAt: true,
      },
    });

    if (!pool.length) {
      return { text: '', meta: { candidateCount: 0, usedCount: 0, skipped: 'no_templates' } };
    }

    const scored = pool.map((row) => {
      const title = row.title != null ? String(row.title) : '';
      const desc = row.description != null ? String(row.description) : '';
      const sc = queryTokens.length ? scoreAgainstQuery(queryTokens, title, desc) : 0;
      return { id: row.id, title, description: desc, score: sc, updatedAt: row.updatedAt };
    });

    if (queryTokens.length) {
      scored.sort((a, b) => b.score - a.score || (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
    }

    const picked = scored.slice(0, topSimilar);
    const ids = picked.map((p) => p.id);

    const fullRows = await prisma.checklistTemplate.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, description: true, schemaData: true },
    });
    const byId = new Map(fullRows.map((r) => [r.id, r]));

    const parts = [];
    let used = 0;
    for (const p of picked) {
      const row = byId.get(p.id);
      if (!row) continue;
      const schemaData = Array.isArray(row.schemaData) ? row.schemaData : [];
      const outline = compactSchemaOutline(schemaData);
      const header =
        `Modelo «${String(row.title || '').slice(0, 160)}» (${outline.fieldCount} campos, ${outline.sectionCount} etapas)` +
        (p.score > 0 ? ` — relevância ${p.score}` : '');
      const descLine =
        row.description && String(row.description).trim()
          ? `Resumo: ${String(row.description).trim().slice(0, 280)}`
          : '';
      const bodyLines = outline.lines.join('\n').slice(0, 3200);
      const chunk = [header, descLine, 'Estrutura (referência):', bodyLines].filter(Boolean).join('\n');

      const next = parts.length ? parts.join('\n\n—\n\n') + '\n\n—\n\n' + chunk : chunk;
      if (next.length > maxChars) break;
      parts.push(chunk);
      used++;
    }

    if (!parts.length) {
      return {
        text: '',
        meta: { candidateCount: pool.length, usedCount: 0, skipped: 'outline_too_large' },
      };
    }

    const intro =
      '### Modelos semelhantes na biblioteca (RAG — referência)\n' +
      'São outros formulários ativos do painel (ranqueados por palavras-chave do pedido e pela data de atualização). ' +
      'Use só como inspiração de estrutura, tipos de campo e agrupamento em etapas. ' +
      'Não copie dados pessoais; os **ids de campos** destes modelos **não** servem no formulário atual — no schema compacto atual use sempre os **id** listados aí.\n\n';

    const text = (intro + parts.join('\n\n—\n\n')).slice(0, maxChars);
    return {
      text,
      meta: {
        candidateCount: pool.length,
        usedCount: used,
        queryTokenCount: queryTokens.length,
        ranking: 'lexical',
      },
    };
  } catch (e) {
    console.warn('[formAiTemplateLibraryRag]', e && e.message ? e.message : e);
    return { text: '', meta: { candidateCount: 0, usedCount: 0, skipped: 'query_error' } };
  }
}

module.exports = {
  buildTemplateLibraryRagContext,
  tryBuildTemplateLibraryRagFromEmbeddings,
  buildCopilotRetrievalQuery,
  tokenize,
  compactSchemaOutline,
};
