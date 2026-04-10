'use strict';

/**
 * Persiste estado CompreFace Recognition no User (painel + cadastro de prestador).
 * @param {{ ok: boolean, faces?: number, subject?: string, error?: string, orphanSubjectsCleaned?: number }} r
 */
async function persistComprefaceRecognitionSync(prisma, userId, r) {
  if (!userId || !r || typeof r !== 'object') return;
  const now = new Date().toISOString();
  if (r.ok) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        comprefaceRecognitionSync: {
          status: 'synced',
          at: now,
          faces: Number(r.faces) || 0,
          subject: r.subject || null,
        },
      },
    });
    return;
  }
  const errMsg = String(r.error || 'Falha na sincronização.').slice(0, 480);
  const prev = await prisma.user.findUnique({
    where: { id: userId },
    select: { comprefaceRecognitionSync: true },
  });
  let previous = null;
  const s = prev?.comprefaceRecognitionSync;
  if (s && typeof s === 'object' && !Array.isArray(s) && s.status === 'synced') {
    previous = { at: s.at, faces: s.faces, subject: s.subject };
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      comprefaceRecognitionSync: {
        status: 'error',
        at: now,
        message: errMsg,
        previous,
      },
    },
  });
}

module.exports = { persistComprefaceRecognitionSync };
