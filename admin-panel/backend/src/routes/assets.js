'use strict';
const router = require('express').Router();
const prisma = require('../db');

/**
 * GET /api/assets — read-only admin.
 * Bens são por utilizador (criador); não há listagem «inventário da empresa».
 * Parâmetros: createdByUserId (obrigatório exceto suporte plataforma com listAll=1), tenantId?, type?, q?, page?, limit?
 * Suporte SaaS / legacy_admin: listAll=1 repete o comportamento antigo (filtro opcional por tenant).
 */
router.get('/', async (req, res) => {
  try {
    const { tenantId, createdByUserId, type, q, page = 1, limit = 50 } = req.query;
    const tid = tenantId && String(tenantId).trim();
    const uid = createdByUserId && String(createdByUserId).trim();
    const listAll = String(req.query.listAll || '') === '1';
    const isPlatform = !!req.authorization?.authz?.isPlatform;

    const commonInclude = {
      tenant: { select: { name: true } },
      createdByUser: { select: { id: true, email: true, name: true } },
      _count: { select: { stockItems: true, children: true } },
    };

    let where;

    if (isPlatform && listAll) {
      where = {
        ...(tid && { tenantId: tid }),
        ...(type && { type }),
        ...(q && { title: { contains: q, mode: 'insensitive' } }),
      };
    } else {
      if (!uid) {
        return res.json({
          data: [],
          total: 0,
          page: +page,
          _meta: {
            policy: 'inventory_per_user',
            hint:
              'Indique createdByUserId para listar os bens desse utilizador. Apenas admins de plataforma podem usar listAll=1.',
          },
        });
      }
      where = {
        createdByUserId: uid,
        ...(tid && { tenantId: tid }),
        ...(type && { type }),
        ...(q && { title: { contains: q, mode: 'insensitive' } }),
      };
    }

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip: ((+page || 1) - 1) * (+limit || 50),
        take: +limit || 50,
        orderBy: { createdAt: 'desc' },
        include: commonInclude,
      }),
      prisma.asset.count({ where }),
    ]);
    res.json({ data: assets, total, page: +page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
