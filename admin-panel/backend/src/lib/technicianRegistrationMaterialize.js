'use strict';

const path = require('path');
const fs = require('fs').promises;
const { REGISTRATION_PRIMARY_FACE_ID, isRegistrationPrimaryFacePhoto } = require('./faceEnrollmentPrimary');
const { isProviderFirstNetworkEnabled } = require('./providerFirstNetwork');
const { normalizeServiceCoverageGeo } = require('./technicianServiceCoverage');
const { resolvePreferredActiveUserForDispatchOwnerEmail } = require('./userEmailUnique');

const UPLOADS_ROOT = path.join(__dirname, '../../public/uploads');

/** Mínimo de fotos faciais exigidas na candidatura (reconhecimento facial / FaceMatch). */
const MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT = 2;

function normalizeFacePhotos(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((p) => p && typeof p === 'object' && p.id && p.url);
  return [];
}

/**
 * Copia fotos de /uploads/tech-registration/{appId}/ para face-enrollment do usuário.
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
      out.push(p);
    }
  }
  return out;
}

async function unlinkPreviousPrimaryFaceFiles(userId) {
  const dir = path.join(UPLOADS_ROOT, 'face-enrollment', userId);
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const f of files) {
    if (f === `${REGISTRATION_PRIMARY_FACE_ID}.jpg` || f === `${REGISTRATION_PRIMARY_FACE_ID}.png` || f === `${REGISTRATION_PRIMARY_FACE_ID}.webp`) {
      try {
        await fs.unlink(path.join(dir, f));
      } catch (_) {}
    }
  }
}

/**
 * Copia a foto de perfil do passo 1 (avatar na candidatura) para matrícula facial do usuário.
 * @returns {Promise<object|null>}
 */
async function copyTechRegAvatarAsPrimaryFaceEnrollment(applicationId, userId, avatarUrl) {
  const url = String(avatarUrl || '').trim();
  const prefix = `/uploads/tech-registration/${applicationId}/`;
  if (!url.startsWith(prefix)) return null;

  const rel = url.replace(/^\/uploads\//, '');
  const srcAbs = path.join(UPLOADS_ROOT, ...rel.split('/'));
  await unlinkPreviousPrimaryFaceFiles(userId);
  const destDir = path.join(UPLOADS_ROOT, 'face-enrollment', userId);
  await fs.mkdir(destDir, { recursive: true });
  let ext = path.extname(srcAbs).toLowerCase();
  if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png' && ext !== '.webp') ext = '.jpg';
  const destName = ext === '.jpeg' ? `${REGISTRATION_PRIMARY_FACE_ID}.jpg` : `${REGISTRATION_PRIMARY_FACE_ID}${ext}`;
  const destAbs = path.join(destDir, destName);
  try {
    await fs.copyFile(srcAbs, destAbs);
  } catch (e) {
    console.warn('[tech-reg] cópia foto principal (passo 1) falhou:', e.message || e);
    return null;
  }
  const mimeType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return {
    id: REGISTRATION_PRIMARY_FACE_ID,
    url: `/uploads/face-enrollment/${userId}/${destName}`,
    mimeType,
    createdAt: new Date().toISOString(),
    registrationPrimary: true,
  };
}

/**
 * Matrícula facial: foto do passo 1 primeiro (referência), depois fotos do passo 2 copiadas.
 */
async function buildFaceEnrollmentFromApprovedRegistration(applicationId, userId, rawAvatarUrl, step2Photos) {
  const primary = await copyTechRegAvatarAsPrimaryFaceEnrollment(applicationId, userId, rawAvatarUrl);
  const copiedStep2 = await copyRegistrationFacePhotosToUser(applicationId, userId, step2Photos);
  const out = [];
  if (primary) out.push(primary);
  const primaryUrl = primary ? String(primary.url || '') : '';
  const rawAv = String(rawAvatarUrl || '').trim();
  for (const p of copiedStep2) {
    if (!p || isRegistrationPrimaryFacePhoto(p)) continue;
    const u = String(p.url || '');
    if (primaryUrl && u === primaryUrl) continue;
    if (rawAv && u === rawAv) continue;
    out.push(p);
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

function buildTechnicianProfilePayload(technician) {
  return {
    status: 'ACTIVE',
    score: Number(technician.score) >= 0 && Number(technician.score) <= 10 ? Number(technician.score) : 5,
    cft: technician.cft ? String(technician.cft).trim() : null,
    specialty: technician.specialty ? String(technician.specialty).trim() : null,
    workScheduleJson:
      technician.workScheduleJson && typeof technician.workScheduleJson === 'object'
        ? technician.workScheduleJson
        : {},
    skillsJson: parseSkills(technician.skillsJson),
    serviceLocationIds: Array.isArray(technician.serviceLocationIds) ? technician.serviceLocationIds : [],
    serviceCoverageGeoJson: normalizeServiceCoverageGeo(technician.serviceCoverageGeoJson),
    professionalDocuments: Array.isArray(technician.professionalDocuments)
      ? technician.professionalDocuments
      : [],
  };
}

async function mirrorApprovedLegacyRegistrationToProviderNetwork(prisma, { tenantId, userId, technician }) {
  if (!tenantId || !userId) return null;
  const enabled = await isProviderFirstNetworkEnabled(tenantId);
  if (!enabled) return null;

  const tech = technician && typeof technician === 'object' ? technician : {};
  const score = Number(tech.score);
  const normalizedScore = Number.isFinite(score) && score >= 0 && score <= 10 ? score : 5;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const tenantRow = await tx.tenant.findUnique({
      where: { id: String(tenantId) },
      select: { kind: true },
    });
    const tenantKind = String(tenantRow?.kind || 'COMPANY').toUpperCase();
    const isCompanyTenant = tenantKind === 'COMPANY';
    /** Vínculo prestador ↔ empresa na app é apenas DEDICATED; espaço CLIENT/PROVIDER é OWNER interno. */
    const relationshipType = isCompanyTenant ? 'DEDICATED' : 'OWNER';
    const affiliationNote = isCompanyTenant
      ? 'Criado automaticamente pela aprovação no fluxo legado (vínculo dedicado).'
      : 'Espaço próprio do prestador (owner). Vínculos com tenant empresa (COMPANY) usam vínculo dedicado.';

    const providerIdentity = await tx.providerIdentity.upsert({
      where: { userId: String(userId) },
      create: {
        userId: String(userId),
        globalStatus: 'VERIFIED',
        kycStatus: 'APPROVED',
        kycReviewedAt: now,
        score: normalizedScore,
        cft: tech.cft ? String(tech.cft).trim() : null,
        specialty: tech.specialty ? String(tech.specialty).trim() : null,
        skillsJson: parseSkills(tech.skillsJson),
        profileJson: {
          source: 'legacy_technician_registration',
          mirroredAt: now.toISOString(),
        },
      },
      update: {
        globalStatus: 'VERIFIED',
        kycStatus: 'APPROVED',
        kycReviewedAt: now,
        score: normalizedScore,
        cft: tech.cft ? String(tech.cft).trim() : null,
        specialty: tech.specialty ? String(tech.specialty).trim() : null,
        skillsJson: parseSkills(tech.skillsJson),
        profileJson: {
          source: 'legacy_technician_registration',
          mirroredAt: now.toISOString(),
        },
      },
    });

    await tx.providerTenantAffiliation.upsert({
      where: {
        tenantId_providerIdentityId: {
          tenantId: String(tenantId),
          providerIdentityId: providerIdentity.id,
        },
      },
      create: {
        tenantId: String(tenantId),
        providerIdentityId: providerIdentity.id,
        status: 'ACTIVE',
        relationshipType,
        invitedAt: now,
        requestedAt: now,
        activatedAt: now,
        note: affiliationNote,
      },
      update: {
        status: 'ACTIVE',
        relationshipType,
        activatedAt: now,
        note: affiliationNote,
      },
    });

    return providerIdentity.id;
  });
}

/**
 * Candidatura aprovada — usuário já existia no tenant (ex.: «Quero ser prestador» no app).
 * Atualiza perfil, documentos e TechnicianProfile; não altera a senha da conta.
 */
async function mergeTechRegistrationIntoExistingUser(prisma, app, existingUser, ctx) {
  const { raw, name, addressJson, personalDocuments, technician, faceBefore } = ctx;

  const mergedFaces = await buildFaceEnrollmentFromApprovedRegistration(
    app.id,
    existingUser.id,
    raw.avatarUrl,
    faceBefore
  );

  return prisma.$transaction(async (tx) => {
    const userData = {
      name,
      phone: raw.phone ? String(raw.phone).trim() : null,
      avatarUrl: raw.avatarUrl ? String(raw.avatarUrl).trim() : null,
      addressJson,
      personalDocuments,
      role: 'PROVIDER',
      isActive: true,
    };
    if (mergedFaces.length) {
      userData.faceEnrollmentPhotos = mergedFaces;
      userData.comprefaceRecognitionSync = {
        status: 'pending',
        at: new Date().toISOString(),
        message: 'Candidatura aprovada — a sincronizar galeria FaceMatch.',
      };
    }

    await tx.user.update({
      where: { id: existingUser.id },
      data: userData,
    });

    const techPayload = buildTechnicianProfilePayload(technician);
    const existingProfile = await tx.technicianProfile.findUnique({
      where: { userId: existingUser.id },
    });
    if (existingProfile) {
      await tx.technicianProfile.update({
        where: { id: existingProfile.id },
        data: techPayload,
      });
    } else {
      await tx.technicianProfile.create({
        data: { userId: existingUser.id, ...techPayload },
      });
    }

    await tx.technicianRegistrationApplication.update({
      where: { id: app.id },
      data: {
        status: 'APPROVED',
        createdUserId: existingUser.id,
        passwordHash: null,
        resolvedAt: new Date(),
        revisionNote: null,
      },
    });

    await tx.technicianRegistrationEvent.create({
      data: {
        applicationId: app.id,
        type: 'APPROVED',
        message: 'Utilizador existente — dados atualizados a partir da candidatura.',
        actorEmail: null,
      },
    });

    return tx.user.findUnique({ where: { id: existingUser.id } });
  });
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
  if (['APPROVED', 'REJECTED'].includes(app.status)) {
    throw new Error('Candidatura já encerrada.');
  }

  const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
  const email = String(raw.email || app.invitedEmail || '')
    .trim()
    .toLowerCase();
  if (!email) throw new Error('E-mail é obrigatório nas respostas.');

  const addressJson = raw.addressJson && typeof raw.addressJson === 'object' ? raw.addressJson : {};
  const personalDocuments = Array.isArray(raw.personalDocuments) ? raw.personalDocuments : [];
  const technician = raw.technician && typeof raw.technician === 'object' ? raw.technician : {};
  const faceBefore = normalizeFacePhotos(raw.faceEnrollmentPhotos);

  let existingUser = await resolvePreferredActiveUserForDispatchOwnerEmail(prisma, email, {
    tenantId: app.tenantId,
  });
  if (!existingUser && app.candidateUserId) {
    existingUser = await prisma.user.findFirst({
      where: { id: app.candidateUserId, tenantId: app.tenantId },
    });
  }

  /** Convite / rascunho: o utilizador já existe no tenant — aprovar sem exigir submissão nem snapshot de senha. */
  if (existingUser) {
    const fromForm = String(raw.name || '').trim();
    const fromAccount = String(existingUser.name || '').trim();
    const name =
      fromForm ||
      fromAccount ||
      (email.includes('@') ? email.split('@')[0] : email).trim() ||
      'Prestador';
    return mergeTechRegistrationIntoExistingUser(prisma, app, existingUser, {
      raw,
      name,
      addressJson,
      personalDocuments,
      technician,
      faceBefore,
    });
  }

  if (app.status !== 'SUBMITTED') {
    throw new Error('Só é possível aprovar candidaturas submetidas quando ainda não há utilizador com este e-mail no tenant.');
  }
  if (!app.passwordHash) throw new Error('Senha da candidatura ausente (reabra o fluxo).');

  const name = String(raw.name || '').trim();
  if (!name) throw new Error('Nome e e-mail são obrigatórios nas respostas.');

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
      },
    });

    await tx.technicianProfile.create({
      data: {
        userId: user.id,
        ...buildTechnicianProfilePayload(technician),
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

  const mergedFaces = await buildFaceEnrollmentFromApprovedRegistration(
    app.id,
    result.id,
    raw.avatarUrl,
    faceBefore
  );
  if (mergedFaces.length) {
    await prisma.user.update({
      where: { id: result.id },
      data: {
        faceEnrollmentPhotos: mergedFaces,
        comprefaceRecognitionSync: {
          status: 'pending',
          at: new Date().toISOString(),
          message: 'Candidatura aprovada — a sincronizar galeria FaceMatch.',
        },
      },
    });
  }

  return result;
}

module.exports = {
  materializeApprovedApplication,
  mirrorApprovedLegacyRegistrationToProviderNetwork,
  copyRegistrationFacePhotosToUser,
  buildFaceEnrollmentFromApprovedRegistration,
  normalizeFacePhotos,
  MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT,
};
