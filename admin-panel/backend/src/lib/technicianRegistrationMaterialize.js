'use strict';

const path = require('path');
const fs = require('fs').promises;

const UPLOADS_ROOT = path.join(__dirname, '../../public/uploads');

function normalizeFacePhotos(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((p) => p && typeof p === 'object' && p.id && p.url);
  return [];
}

/**
 * Copia fotos de /uploads/tech-registration/{appId}/ para face-enrollment do utilizador.
 * @returns {Promise<Array<{ id: string, url: string, mimeType?: string, createdAt?: string }>>}
 */
async function copyRegistrationFacePhotosToUser(applicationId, userId, photos) {
  const list = normalizeFacePhotos(photos);
  const out = [];
  const prefix = `/uploads/tech-registration/${applicationId}/`;
  const destDir = path.join(UPLOADS_ROOT, 'face-enrollment', userId);
  await fs.mkdir(destDir, { recursive: true });

  for (const p of list) {
    const url = String(p.url || '');
    if (!url.startsWith(prefix)) {
      out.push(p);
      continue;
    }
    const rel = url.replace(/^\/uploads\//, '');
    const srcAbs = path.join(UPLOADS_ROOT, ...rel.split('/'));
    const ext = path.extname(srcAbs) || '.jpg';
    const destName = `${p.id}${ext}`;
    const destAbs = path.join(destDir, destName);
    try {
      await fs.copyFile(srcAbs, destAbs);
      out.push({
        ...p,
        url: `/uploads/face-enrollment/${userId}/${destName}`,
      });
    } catch (e) {
      console.warn('[tech-reg] copy face photo skip', srcAbs, e.message);
    }
  }
  return out;
}

function parseSkills(raw) {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Persiste User + TechnicianProfile a partir de responsesJson da candidatura aprovada.
 */
async function materializeApprovedApplication(prisma, applicationId) {
  const app = await prisma.technicianRegistrationApplication.findUnique({
    where: { id: applicationId },
    include: { tenant: { select: { id: true, name: true } } },
  });
  if (!app) throw new Error('Candidatura não encontrada.');
  if (app.status !== 'SUBMITTED') throw new Error('Só é possível aprovar candidaturas submetidas.');
  if (!app.passwordHash) throw new Error('Senha da candidatura em falta (reabra o fluxo).');

  const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
  const email = String(raw.email || app.invitedEmail || '')
    .trim()
    .toLowerCase();
  const name = String(raw.name || '').trim();
  if (!email || !name) throw new Error('Nome e e-mail são obrigatórios nas respostas.');

  const dup = await prisma.user.findFirst({
    where: { tenantId: app.tenantId, email },
  });
  if (dup) throw new Error('Já existe um utilizador com este e-mail neste tenant.');

  const addressJson = raw.addressJson && typeof raw.addressJson === 'object' ? raw.addressJson : {};
  const personalDocuments = Array.isArray(raw.personalDocuments) ? raw.personalDocuments : [];
  const technician = raw.technician && typeof raw.technician === 'object' ? raw.technician : {};
  const professionalDocuments = Array.isArray(technician.professionalDocuments)
    ? technician.professionalDocuments
    : [];
  const workScheduleJson =
    technician.workScheduleJson && typeof technician.workScheduleJson === 'object'
      ? technician.workScheduleJson
      : {};
  const serviceLocationIds = Array.isArray(technician.serviceLocationIds)
    ? technician.serviceLocationIds
    : [];
  const skillsJson = parseSkills(technician.skillsJson);
  const faceBefore = normalizeFacePhotos(raw.faceEnrollmentPhotos);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: app.tenantId,
        email,
        name,
        password: app.passwordHash,
        phone: raw.phone ? String(raw.phone).trim() : null,
        avatarUrl: raw.avatarUrl ? String(raw.avatarUrl).trim() : null,
        role: 'PROVIDER',
        isActive: true,
        addressJson,
        personalDocuments,
        faceEnrollmentPhotos: [],
        comprefaceRecognitionSync: faceBefore.length
          ? {
              status: 'pending',
              at: new Date().toISOString(),
              message: 'Candidatura aprovada — a sincronizar galeria CompreFace.',
            }
          : undefined,
      },
    });

    const copiedFaces = await copyRegistrationFacePhotosToUser(app.id, user.id, faceBefore);
    if (copiedFaces.length) {
      await tx.user.update({
        where: { id: user.id },
        data: { faceEnrollmentPhotos: copiedFaces },
      });
    }

    await tx.technicianProfile.create({
      data: {
        userId: user.id,
        status: 'ACTIVE',
        score: Number(technician.score) >= 0 && Number(technician.score) <= 10 ? Number(technician.score) : 5,
        cft: technician.cft ? String(technician.cft).trim() : null,
        specialty: technician.specialty ? String(technician.specialty).trim() : null,
        workScheduleJson,
        skillsJson,
        serviceLocationIds,
        professionalDocuments,
      },
    });

    await tx.technicianRegistrationApplication.update({
      where: { id: app.id },
      data: {
        status: 'APPROVED',
        createdUserId: user.id,
        passwordHash: null,
        resolvedAt: new Date(),
        revisionNote: null,
      },
    });

    await tx.technicianRegistrationEvent.create({
      data: {
        applicationId: app.id,
        type: 'APPROVED',
        message: null,
        actorEmail: null,
      },
    });

    return user;
  });

  return result;
}

module.exports = {
  materializeApprovedApplication,
  copyRegistrationFacePhotosToUser,
  normalizeFacePhotos,
};
