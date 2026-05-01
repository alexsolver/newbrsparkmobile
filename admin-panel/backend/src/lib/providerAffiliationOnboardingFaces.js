'use strict';

const fs = require('fs').promises;
const path = require('path');
const { verifyTechRegEnrollmentAgainstProfile } = require('./techRegComprefaceVerify');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads/provider-affiliate-onboarding');

/**
 * Extrai nome do ficheiro da URL devolvida pelo upload público.
 * @param {string} urlPath
 */
function filenameFromPublicAssetUrl(urlPath) {
  const s = String(urlPath || '').trim();
  if (!s) return '';
  try {
    const u = s.startsWith('http') ? new URL(s) : null;
    const pathname = u ? u.pathname : s;
    const parts = pathname.split('/').filter(Boolean);
    const i = parts.indexOf('assets');
    if (i >= 0 && parts[i + 2]) return path.basename(parts[i + 2]);
    return path.basename(pathname);
  } catch {
    return path.basename(s);
  }
}

/**
 * @param {string} affiliationId
 * @param {string} urlPath
 */
async function readMandatoryImageBuffer(affiliationId, urlPath) {
  const aid = String(affiliationId || '').trim();
  const fn = filenameFromPublicAssetUrl(urlPath);
  if (!aid || !fn || fn.includes('..')) return null;
  const dir = path.join(UPLOAD_ROOT, aid);
  const fp = path.join(dir, fn);
  if (!fp.startsWith(dir)) return null;
  try {
    const buf = await fs.readFile(fp);
    return buf && buf.length >= 64 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Compara fotos obrigatórias do onboarding web com FaceMatch (CompreFace) do tenant.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 * @param {string} affiliationId
 * @param {{ mandatory?: Record<string, { url?: string }> }} onboardingWeb
 * @returns {Promise<{ ok: true } | { ok: false, code?: string, message: string }>}
 */
async function verifyWebOnboardingMandatoryFaces(prisma, tenantId, affiliationId, onboardingWeb) {
  const tid = String(tenantId || '').trim();
  const m = onboardingWeb?.mandatory && typeof onboardingWeb.mandatory === 'object' ? onboardingWeb.mandatory : {};

  const ref = await readMandatoryImageBuffer(affiliationId, m.aiGuidedPhoto?.url);
  const fm1 = await readMandatoryImageBuffer(affiliationId, m.faceMatch1?.url);
  const fm2 = await readMandatoryImageBuffer(affiliationId, m.faceMatch2?.url);
  const idDoc = await readMandatoryImageBuffer(affiliationId, m.idDocumentPhoto?.url);

  if (!ref || !fm1 || !fm2 || !idDoc) {
    return {
      ok: false,
      code: 'MISSING_IMAGE_FILES',
      message: 'Não foi possível ler uma ou mais fotos enviadas. Volte a carregar os ficheiros.',
    };
  }

  const pairs = [
    { probe: fm1, idDoc: false, label: 'faceMatch1' },
    { probe: fm2, idDoc: false, label: 'faceMatch2' },
    { probe: idDoc, idDoc: true, label: 'idDocumentPhoto' },
  ];

  for (const p of pairs) {
    const r = await verifyTechRegEnrollmentAgainstProfile(prisma, tid, ref, p.probe, {
      idDocument: p.idDoc,
    });
    if (!r.ok) {
      return {
        ok: false,
        code: r.code || 'FACE_VERIFY_FAILED',
        message: r.message || 'Verificação facial falhou.',
      };
    }
  }

  return { ok: true };
}

module.exports = {
  verifyWebOnboardingMandatoryFaces,
  filenameFromPublicAssetUrl,
};
