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

module.exports = {
    normalizeTemplateTitle,
    titlesConflict,
    templateTitleCompareKey,
    findActiveDuplicateInFolder,
};
