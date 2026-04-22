'use strict';

/**
 * Normaliza o idioma da app (i18next) para a etiqueta de locale dos documentos legais.
 * @param {string|undefined} requested
 * @returns {'pt-BR'|'en-US'|'es-ES'}
 */
function normalizeComplianceLocale(requested) {
  const r = String(requested || 'pt-BR')
    .trim()
    .replace('_', '-');
  const lower = r.toLowerCase();
  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('es')) return 'es-ES';
  return 'pt-BR';
}

/**
 * Ordem de fallback ao procurar documento publicado (ex.: en-US → pt-BR).
 * @param {string|undefined} requested
 * @returns {string[]}
 */
function complianceLocaleFallbackChain(requested) {
  const primary = normalizeComplianceLocale(requested);
  const chain = [primary];
  if (primary !== 'pt-BR') chain.push('pt-BR');
  return [...new Set(chain)];
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ type: string, tenantId?: string|null, localeHint?: string|null }} opts
 */
async function findPublishedComplianceDoc(prisma, opts) {
  const type = String(opts.type || '').toUpperCase();
  const tenantId = opts.tenantId || null;
  const chain = complianceLocaleFallbackChain(opts.localeHint);

  for (const locale of chain) {
    let doc = null;
    if (tenantId) {
      doc = await prisma.complianceDoc.findFirst({
        where: { type, isActive: true, tenantId, locale },
        orderBy: { publishedAt: 'desc' },
      });
    }
    if (!doc) {
      doc = await prisma.complianceDoc.findFirst({
        where: { type, isActive: true, tenantId: null, locale },
        orderBy: { publishedAt: 'desc' },
      });
    }
    if (doc) return doc;
  }
  return null;
}

const KNOWN_TYPES = ['TERMS_OF_USE', 'PRIVACY_POLICY', 'LGPD_DPA', 'COOKIE_POLICY'];

/**
 * Um documento ativo por tipo, respeitando tenantId (se houver) e fallback de locale.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ tenantId?: string|null, localeHint?: string|null }} opts
 */
async function listActiveComplianceDocsForLocale(prisma, opts) {
  const tenantId = opts.tenantId || null;
  const out = [];
  for (const type of KNOWN_TYPES) {
    const doc = await findPublishedComplianceDoc(prisma, {
      type,
      tenantId,
      localeHint: opts.localeHint,
    });
    if (doc) {
      out.push({
        id: doc.id,
        type: doc.type,
        version: doc.version,
        title: doc.title,
        publishedAt: doc.publishedAt,
        tenantId: doc.tenantId,
        locale: doc.locale,
      });
    }
  }
  return out;
}

module.exports = {
  normalizeComplianceLocale,
  complianceLocaleFallbackChain,
  findPublishedComplianceDoc,
  listActiveComplianceDocsForLocale,
};
