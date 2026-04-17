'use strict';
const router = require('express').Router();
const prisma = require('../db');
const { assertTenantAccess, isPlatformAdmin, normalizeRole, resolveScopedTenantId } = require('../lib/authorization');

function canManageLocations(req) {
  if (isPlatformAdmin(req.authorization)) return true;
  return normalizeRole(req.admin?.role) === 'TENANT_ADMIN';
}

async function getScopedLocationOrNull(req, locationId) {
  if (!locationId) return null;
  const row = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, tenantId: true },
  });
  if (!row) return null;
  if (!assertTenantAccess(req.authorization, row.tenantId)) return null;
  return row;
}

// GET /api/locations?tenantId=
router.get('/', async (req, res) => {
  try {
    const requestedTenantId = String(req.query?.tenantId || '').trim() || null;
    if (requestedTenantId && !assertTenantAccess(req.authorization, requestedTenantId)) {
      return res.status(403).json({ error: 'Sem permissão para consultar bases deste tenant.' });
    }
    const scopedTenantId = resolveScopedTenantId(req.authorization, requestedTenantId);
    const where = scopedTenantId ? { tenantId: scopedTenantId } : {};
    const locations = await prisma.location.findMany({
      where, orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true, children: true } }, tenant: { select: { name: true } } }
    });
    res.json(locations);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/locations
router.post('/', async (req, res) => {
  try {
    if (!canManageLocations(req)) {
      return res.status(403).json({ error: 'Sem permissão para criar bases.' });
    }
    const { tenantId, name, type = 'BUILDING', address, floor, room, icon, latitude, longitude, parentId } = req.body;
    if (!tenantId || !name) return res.status(400).json({ error: 'tenantId e name são obrigatórios.' });
    if (!assertTenantAccess(req.authorization, tenantId)) {
      return res.status(403).json({ error: 'Sem permissão para criar bases neste tenant.' });
    }
    const location = await prisma.location.create({ data: { tenantId, name, type, address, floor, room, icon, latitude, longitude, parentId } });
    res.status(201).json(location);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/locations/:id
router.put('/:id', async (req, res) => {
  try {
    if (!canManageLocations(req)) {
      return res.status(403).json({ error: 'Sem permissão para editar bases.' });
    }
    const existing = await getScopedLocationOrNull(req, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Base não encontrada.' });
    if (req.body?.tenantId && !assertTenantAccess(req.authorization, req.body.tenantId)) {
      return res.status(403).json({ error: 'Sem permissão para mover a base para este tenant.' });
    }
    const location = await prisma.location.update({ where: { id: req.params.id }, data: req.body });
    res.json(location);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/locations/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!canManageLocations(req)) {
      return res.status(403).json({ error: 'Sem permissão para remover bases.' });
    }
    const existing = await getScopedLocationOrNull(req, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Base não encontrada.' });
    await prisma.location.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
