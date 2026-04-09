'use strict';
const router = require('express').Router();
const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { sendExpoPushToMany } = require('../services/expoPush');

const userListSelect = {
  id: true,
  tenantId: true,
  email: true,
  name: true,
  avatarUrl: true,
  phone: true,
  role: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { name: true } },
  technicianProfile: { select: { id: true, status: true } },
};

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const { tenantId, role, q, page = 1, limit = 50 } = req.query;
    const where = {
      ...(tenantId && { tenantId }),
      ...(role && { role }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        select: userListSelect,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ data: users, total, page: +page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { name, email, password, tenantId, role = 'USER' } = req.body;
    if (!name || !email || !password || !tenantId) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, password: hash, tenantId, role } });
    await prisma.auditLog.create({
      data: { adminId: req.admin.id, tenantId, action: 'USER_CREATE', resource: email, category: 'ADMIN' },
    });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/reset-password
router.patch('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'Nova senha ausente.' });
    const hash = await bcrypt.hash(newPassword, 10);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { password: hash } });
    await prisma.auditLog.create({
      data: { adminId: req.admin.id, action: 'USER_RESET_PASSWORD', resource: user.email, category: 'ADMIN' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/technician-profile — { status }
router.patch('/:id/technician-profile', async (req, res) => {
  try {
    const allowed = new Set(['ACTIVE', 'PENDING', 'INACTIVE', 'SUSPENDED']);
    const st = String(req.body.status || '').toUpperCase();
    if (!allowed.has(st)) return res.status(400).json({ error: 'status inválido.' });

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { technicianProfile: true },
    });
    if (!user || !user.technicianProfile) {
      return res.status(404).json({ error: 'Este usuário não tem perfil de prestador.' });
    }

    const updated = await prisma.technicianProfile.update({
      where: { id: user.technicianProfile.id },
      data: { status: st },
    });

    await prisma.auditLog
      .create({
        data: {
          adminId: req.admin.id,
          tenantId: user.tenantId,
          action: 'TECHNICIAN_PROFILE_STATUS',
          resource: user.email,
          category: 'ADMIN',
          metadata: { userId: user.id, status: st },
        },
      })
      .catch(() => {});

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/toggle-active
router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: !current.isActive } });
    res.json({ id: user.id, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/disconnect
router.post('/:id/disconnect', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await prisma.user.update({
      where: { id: req.params.id },
      data: { currentSessionId: null, currentDeviceId: null },
    });

    const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
    if (tokens.length > 0) {
      sendExpoPushToMany(tokens, {
        data: { type: 'FORCE_LOGOUT', reason: 'ADMIN_FORCE' },
      }).catch((err) => console.error('[admin_disconnect_push]', err));
    }

    res.json({ ok: true, message: 'Sessão encerrada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — ficha completa (sem password)
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        tenant: { select: { id: true, name: true, email: true } },
        technicianProfile: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const { password, ...safe } = user;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildTechnicianData(technician) {
  if (!technician || typeof technician !== 'object') return {};
  const data = {};
  if (technician.status != null) data.status = String(technician.status).toUpperCase();
  if (technician.cft !== undefined) data.cft = technician.cft ? String(technician.cft).trim() : null;
  if (technician.specialty !== undefined) data.specialty = technician.specialty ? String(technician.specialty).trim() : null;
  if (technician.score != null && Number.isFinite(Number(technician.score))) data.score = Number(technician.score);
  if (technician.workScheduleJson !== undefined) data.workScheduleJson = technician.workScheduleJson;
  if (technician.skillsJson !== undefined) data.skillsJson = technician.skillsJson;
  if (technician.serviceLocationIds !== undefined) data.serviceLocationIds = technician.serviceLocationIds;
  if (technician.professionalDocuments !== undefined) data.professionalDocuments = technician.professionalDocuments;
  return data;
}

// PATCH /api/users/:id — atualização geral + perfil técnico
router.patch('/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.user.findUnique({
      where: { id },
      include: { technicianProfile: true },
    });
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const {
      name,
      email,
      phone,
      role,
      avatarUrl,
      isActive,
      addressJson,
      personalDocuments,
      isProvider,
      technician,
    } = req.body;

    if (email != null && String(email).toLowerCase().trim() !== existing.email.toLowerCase()) {
      const dup = await prisma.user.findFirst({
        where: {
          tenantId: existing.tenantId,
          email: String(email).trim().toLowerCase(),
          NOT: { id },
        },
      });
      if (dup) return res.status(400).json({ error: 'E-mail já em uso neste tenant.' });
    }

    await prisma.$transaction(async (tx) => {
      const userPatch = {};
      if (name != null) userPatch.name = String(name).trim();
      if (email != null) userPatch.email = String(email).trim().toLowerCase();
      if (phone !== undefined) userPatch.phone = phone ? String(phone).trim() : null;
      if (role != null) userPatch.role = role;
      if (avatarUrl !== undefined) userPatch.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null;
      if (typeof isActive === 'boolean') userPatch.isActive = isActive;
      if (addressJson !== undefined) userPatch.addressJson = addressJson;
      if (personalDocuments !== undefined) userPatch.personalDocuments = personalDocuments;

      if (Object.keys(userPatch).length) {
        await tx.user.update({ where: { id }, data: userPatch });
      }

      const techPayload = buildTechnicianData(technician);

      if (isProvider === true) {
        if (!existing.technicianProfile) {
          await tx.technicianProfile.create({
            data: {
              userId: id,
              status: techPayload.status || 'PENDING',
              score: techPayload.score ?? 5,
              cft: techPayload.cft ?? null,
              specialty: techPayload.specialty ?? null,
              workScheduleJson: techPayload.workScheduleJson ?? undefined,
              skillsJson: techPayload.skillsJson ?? undefined,
              serviceLocationIds: techPayload.serviceLocationIds ?? undefined,
              professionalDocuments: techPayload.professionalDocuments ?? undefined,
            },
          });
        } else if (Object.keys(techPayload).length) {
          await tx.technicianProfile.update({
            where: { userId: id },
            data: techPayload,
          });
        }
      } else if (isProvider === false && existing.technicianProfile) {
        await tx.technicianProfile.update({
          where: { userId: id },
          data: { status: 'INACTIVE' },
        });
      } else if (existing.technicianProfile && Object.keys(techPayload).length) {
        await tx.technicianProfile.update({
          where: { userId: id },
          data: techPayload,
        });
      }
    });

    await prisma.auditLog
      .create({
        data: {
          adminId: req.admin.id,
          tenantId: existing.tenantId,
          action: 'USER_UPDATE_ADMIN',
          resource: existing.email,
          category: 'ADMIN',
          metadata: { userId: id },
        },
      })
      .catch(() => {});

    const fresh = await prisma.user.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true, email: true } }, technicianProfile: true },
    });
    const { password, ...safe } = fresh;
    res.json(safe);
  } catch (err) {
    console.error('PATCH /users/:id', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
