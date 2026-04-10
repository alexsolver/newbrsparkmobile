'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../db');
const crypto  = require('crypto');
const { sendExpoPushToMany } = require('../services/expoPush');

// ─── POST /api/register ─────────────────────────────────────────────────────
// Público — cria conta de usuário individual (Tenant + User atomicamente)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, defaultLang = 'pt-BR', deviceId } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });

    // Verificar se já existe
    const existing = await prisma.tenant.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

    const hash = await bcrypt.hash(password, 10);

    // Gerar slug único a partir do email
    const baseSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
    let slug = baseSlug;
    let suffix = 0;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    // Criar Tenant + User em transação
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name, slug, email, ownerName: name, phone, defaultLang, status: 'TRIAL' }
      });

      const user = await tx.user.create({
        data: { name, email, password: hash, tenantId: tenant.id, role: 'TENANT_ADMIN' }
      });

      await tx.auditLog.create({
        data: { tenantId: tenant.id, userId: user.id, action: 'USER_REGISTER', resource: email, category: 'AUTH' }
      });

      return { tenant, user };
    });

    const newSessionId = crypto.randomUUID();
    await prisma.user.update({
      where: { id: result.user.id },
      data: {
        lastLogin: new Date(),
        currentSessionId: newSessionId,
        currentDeviceId: deviceId || null,
      },
    });

    const token = jwt.sign(
      {
        id: result.user.id,
        tenantId: result.tenant.id,
        email: result.user.email,
        role: result.user.role,
        sessionId: newSessionId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.status(201).json({
      token,
      user: { id: result.user.id, name, email: result.user.email, tenantId: result.tenant.id },
    });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/login ─────────────────────────────────────────────────────────
// Público — login do usuário do app (retorna JWT com tenantId)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const emailNorm = String(email).trim().toLowerCase();
    const candidates = await prisma.user.findMany({
      where: { email: emailNorm },
      include: { tenant: true, technicianProfile: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!candidates.length) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const tenantIdPick = req.body.tenantId != null && String(req.body.tenantId).trim() !== '' ? String(req.body.tenantId).trim() : null;

    let user;
    if (candidates.length === 1) {
      user = candidates[0];
    } else if (tenantIdPick) {
      user = candidates.find((u) => u.tenantId === tenantIdPick);
      if (!user) {
        return res.status(400).json({ error: 'Organização inválida para este e-mail.' });
      }
    } else {
      return res.status(409).json({
        code: 'MULTIPLE_ACCOUNTS',
        error:
          'Este e-mail está em mais de uma organização. Indique qual deseja aceder (tenantId) ou escolha no ecrã.',
        tenants: candidates.map((u) => ({
          id: u.tenantId,
          name: u.tenant?.name || u.tenantId,
        })),
      });
    }

    if (!user.tenant) return res.status(401).json({ error: 'Credenciais inválidas.' });

    if (!user.isActive)
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });

    if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED')
      return res.status(403).json({ error: 'Conta suspensa ou cancelada.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

    // Handle single-device session
    const { deviceId } = req.body;
    const newSessionId = crypto.randomUUID();

    // Notificar outros dispositivos: sessão anterior existia e o deviceId mudou (ou antes era desconhecido)
    const prevDevice = user.currentDeviceId != null ? String(user.currentDeviceId) : '';
    const nextDevice = deviceId != null ? String(deviceId) : '';
    const shouldNotifyOtherDevice = user.currentSessionId && prevDevice !== nextDevice;
    if (shouldNotifyOtherDevice) {
      const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
      if (tokens.length > 0) {
        sendExpoPushToMany(tokens, {
          data: { type: 'FORCE_LOGOUT', reason: 'NEW_LOGIN' }
        }).catch(err => console.error('[login_kickout]', err));
      }
    }

    await prisma.user.update({ 
      where: { id: user.id }, 
      data: { 
        lastLogin: new Date(),
        currentSessionId: newSessionId,
        currentDeviceId: deviceId || null 
      } 
    });

    await prisma.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.id, action: 'USER_LOGIN', resource: email, category: 'AUTH' }
    });

    const token = jwt.sign(
      { id: user.id, tenantId: user.tenantId, email: user.email, role: user.role, sessionId: newSessionId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        tenantId: user.tenantId,
        tenant: { id: user.tenant.id, name: user.tenant.name, status: user.tenant.status },
        technicianProfile: user.technicianProfile,
      },
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/me ─────────────────────────────────────────────────────────────
// Autenticado — retorna perfil do usuário logado (para o app)
const authUser = require('../middleware/authUser');
router.get('/me', authUser, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { 
        tenant: { include: { subscription: { include: { plan: true } } } },
        technicianProfile: true
      },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const { password: _, ...safe } = user;
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/me ─────────────────────────────────────────────────────────────
// Autenticado — atualiza perfil do usuário logado
router.put('/me', authUser, async (req, res) => {
  try {
    const { name, email, avatarUrl } = req.body;
    
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { 
        ...(name && { name }), 
        ...(email && { email }), 
        ...(avatarUrl !== undefined && { avatarUrl }) 
      }
    });

    const { password: _, ...safe } = updated;
    res.json(safe);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// ─── POST /api/me/technician ─────────────────────────────────────────────────
// Autenticado — converte usuário atual em prestador (cria TechnicianProfile)
router.post('/me/technician', authUser, async (req, res) => {
  try {
    const existing = await prisma.technicianProfile.findUnique({
      where: { userId: req.user.id }
    });
    if (existing) {
      return res.status(400).json({
        error: 'Já existe um pedido ou registro de prestador para esta conta.',
      });
    }

    const profile = await prisma.technicianProfile.create({
      data: {
        userId: req.user.id,
        status: 'PENDING',
        score: 5.0,
      },
    });

    res.status(201).json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
