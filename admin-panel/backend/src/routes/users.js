'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { sendExpoPushToMany } = require('../services/expoPush');

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
      prisma.user.findMany({ where, skip: (page-1)*limit, take: +limit, orderBy: { createdAt: 'desc' }, include: { tenant: { select: { name: true } } } }),
      prisma.user.count({ where }),
    ]);
    res.json({ data: users, total, page: +page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { name, email, password, tenantId, role = 'USER' } = req.body;
    if (!name || !email || !password || !tenantId) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, password: hash, tenantId, role } });
    await prisma.auditLog.create({ data: { adminId: req.admin.id, tenantId, action: 'USER_CREATE', resource: email, category: 'ADMIN' } });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/users/:id/reset-password
router.patch('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'Nova senha ausente.' });
    const hash = await bcrypt.hash(newPassword, 10);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { password: hash } });
    await prisma.auditLog.create({ data: { adminId: req.admin.id, action: 'USER_RESET_PASSWORD', resource: user.email, category: 'ADMIN' } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/users/:id/toggle-active
router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: !current.isActive } });
    res.json({ id: user.id, isActive: user.isActive });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users/:id/disconnect
router.post('/:id/disconnect', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await prisma.user.update({
      where: { id: req.params.id },
      data: { currentSessionId: null, currentDeviceId: null }
    });

    const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
    if (tokens.length > 0) {
      sendExpoPushToMany(tokens, {
        data: { type: 'FORCE_LOGOUT', reason: 'ADMIN_FORCE' }
      }).catch(err => console.error('[admin_disconnect_push]', err));
    }

    res.json({ ok: true, message: 'Sessão encerrada com sucesso.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
