/**
 * Unicidade do título de ChecklistTemplate por pasta (folderId null = raiz).
 * Comparação case-insensitive após normalização.
 */

function normalizeTemplateTitle(s) {
    return String(s ?? '')
        .trim()
        .replace(/\s+/g, ' ');
}

function titlesConflict(a, b) {
    const na = normalizeTemplateTitle(a);
    const nb = normalizeTemplateTitle(b);
    if (!na || !nb) return false;
    return na.toLowerCase() === nb.toLowerCase();
}

/** Chave para comparação (trim, espaços, minúsculas). */
function templateTitleCompareKey(s) {
    return normalizeTemplateTitle(s).toLowerCase();
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ folderId: string | null; title: string; excludeId?: string | null }} p
 * @returns {Promise<{ id: string; title: string } | null>}
 */
async function findActiveDuplicateInFolder(prisma, { folderId, title, excludeId }) {
    const key = templateTitleCompareKey(title);
    if (!key) return null;
    const fid = folderId == null ? null : String(folderId);
    const rows = await prisma.checklistTemplate.findMany({
        where: {
            isActive: true,
            folderId: fid === null ? null : fid,
        },
        select: { id: true, title: true },
    });
    for (const row of rows) {
        if (excludeId && row.id === excludeId) continue;
        if (templateTitleCompareKey(row.title) === key) return row;
    }
    return null;
}

/**
 * Ajusta o título para não colidir com outro modelo ativo na mesma pasta.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ folderId: string | null; desiredTitle: string; excludeId?: string | null }} p
 * @returns {Promise<string | null>}
 */
async function ensureUniqueActiveTitleInFolder(prisma, { folderId, desiredTitle, excludeId }) {
    const base = normalizeTemplateTitle(desiredTitle);
    if (!base) return null;
    let candidate = base;
    let n = 0;
    let guard = 0;
    while ((await findActiveDuplicateInFolder(prisma, { folderId, title: candidate, excludeId })) && guard < 48) {
        guard += 1;
        n += 1;
        const suffix = n === 1 ? ' (IA)' : ` (IA ${n})`;
        candidate = (base + suffix).trim();
        if (candidate.length > 200) {
            candidate = (base.slice(0, Math.max(1, 200 - suffix.length)) + suffix).trim();
        }
    }
    if (await findActiveDuplicateInFolder(prisma, { folderId, title: candidate, excludeId })) {
        const tail = String(Date.now()).slice(-6);
        candidate = (base.slice(0, 190) + ' ·' + tail).trim();
    }
    return candidate.length > 200 ? candidate.slice(0, 200) : candidate;
}

module.exports = {
    normalizeTemplateTitle,
    titlesConflict,
    templateTitleCompareKey,
    findActiveDuplicateInFolder,
    ensureUniqueActiveTitleInFolder,
};
