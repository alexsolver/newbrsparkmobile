'use strict';

const express = require('express');
const crypto = require('crypto');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { buildOccupancyIcs } = require('../lib/buildOccupancyIcs');
const { assertUserCanAccessOwnedOrSharedAsset } = require('../lib/tenantAssetSyncPolicy');

const router = express.Router();

function publicBaseUrl(req) {
  const fromEnv = (process.env.PUBLIC_API_BASE || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const host = req.get('host') || '';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  if (!host) return '';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/**
 * POST /api/asset-occupancy-calendar/ensure
 * body: { assetId: string, rotate?: boolean }
 * Cria ou devolve o feed iCal (token secreto) para o ativo do tenant do utilizador.
 */
router.post('/ensure', authUser, async (req, res) => {
  try {
    const { assetId, rotate } = req.body || {};
    if (!assetId || typeof assetId !== 'string') {
      return res.status(400).json({ error: 'assetId é obrigatório.' });
    }
    const email = String(req.user.email || '').trim();

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: { id: true, title: true, tenantId: true, createdByUserId: true, deletedAt: true },
    });
    if (!asset) {
      return res.status(404).json({ error: 'Ativo não encontrado ou ainda não sincronizado.' });
    }
    try {
      await assertUserCanAccessOwnedOrSharedAsset(prisma, {
        userId: req.user.id,
        userEmail: email,
        asset,
      });
    } catch (e) {
      if (e && e.code === 'ASSET_FORBIDDEN') {
        return res.status(403).json({ error: 'Sem permissão para este ativo.' });
      }
      throw e;
    }

    const existing = await prisma.assetOccupancyCalendarFeed.findUnique({
      where: { ownerEmail_assetId: { ownerEmail: email, assetId } },
    });

    let token;
    if (existing && !rotate) {
      token = existing.token;
    } else {
      token = crypto.randomBytes(32).toString('hex');
      await prisma.assetOccupancyCalendarFeed.upsert({
        where: { ownerEmail_assetId: { ownerEmail: email, assetId } },
        create: { ownerEmail: email, assetId, token },
        update: { token },
      });
    }

    const base = publicBaseUrl(req);
    const path = `/api/public/asset-occupancy.ics?token=${encodeURIComponent(token)}`;
    const url = base ? `${base}${path}` : path;

    const titleForCal = asset?.title;
    res.json({
      assetId,
      token,
      url,
      calName: titleForCal ? `Ocupação — ${titleForCal}` : `BrSpark — ${assetId}`,
    });
  } catch (e) {
    console.error('[asset-occupancy-calendar] ensure:', e);
    res.status(500).json({ error: e.message || 'Erro ao gerar feed.' });
  }
});

/**
 * GET público — Airbnb / calendários externos importam este URL (polling).
 * Query: token (obrigatório)
 */
async function publicAssetOccupancyIcs(req, res) {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send('Missing token');
    }

    const feed = await prisma.assetOccupancyCalendarFeed.findUnique({
      where: { token },
    });
    if (!feed) {
      res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send('Not found');
    }

    const row = await prisma.userModuleData.findUnique({
      where: {
        ownerEmail_module: { ownerEmail: feed.ownerEmail, module: 'agenda_events' },
      },
    });
    const data = Array.isArray(row?.data) ? row.data : [];

    let calName = `BrSpark — ${feed.assetId}`;
    const asset = await prisma.asset.findUnique({
      where: { id: feed.assetId },
      select: { title: true },
    });
    if (asset?.title) calName = `Ocupação — ${asset.title}`;

    const ics = buildOccupancyIcs({
      events: data,
      assetId: feed.assetId,
      calName,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return res.status(200).send(ics);
  } catch (e) {
    console.error('[asset-occupancy-calendar] public ics:', e);
    res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(e.message || 'Error');
  }
}

module.exports = { router, publicAssetOccupancyIcs };
