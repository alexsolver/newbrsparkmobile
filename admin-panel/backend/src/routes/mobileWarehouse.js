'use strict';

const express = require('express');
const authUser = require('../middleware/authUser');
const prisma = require('../db');

const router = express.Router();

/**
 * Garante um Asset OTHER por técnico (email) com metadata.mobileWarehouse.
 * O app usa o assetId como locationId dos StockItems do armazém móvel.
 */
router.get('/mobile-warehouse', authUser, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const emailRaw = String(req.user?.email || '').trim();
    const emailNorm = emailRaw.toLowerCase();
    if (!tenantId || !emailNorm) {
      return res.status(400).json({ error: 'Tenant ou email em falta.' });
    }

    const candidates = await prisma.asset.findMany({
      where: { tenantId, deletedAt: null, type: 'OTHER' },
      select: { id: true, title: true, metadata: true },
    });

    const existing = candidates.find((a) => {
      const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      return m.mobileWarehouse === true && String(m.ownerEmail || '').toLowerCase() === emailNorm;
    });

    if (existing) {
      return res.json({ assetId: existing.id, title: existing.title });
    }

    const title = `Armazém móvel (${emailRaw})`;
    const created = await prisma.asset.create({
      data: {
        tenantId,
        title,
        type: 'OTHER',
        metadata: { mobileWarehouse: true, ownerEmail: emailNorm },
      },
    });

    return res.json({ assetId: created.id, title: created.title });
  } catch (e) {
    console.error('[mobile-warehouse]', e);
    return res.status(500).json({ error: 'Falha ao garantir armazém móvel.' });
  }
});

module.exports = router;
