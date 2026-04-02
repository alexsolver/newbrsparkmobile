'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/locations?tenantId=
router.get('/', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const where = tenantId ? { tenantId } : {};
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
    const { tenantId, name, type = 'BUILDING', address, floor, room, icon, latitude, longitude, parentId } = req.body;
    if (!tenantId || !name) return res.status(400).json({ error: 'tenantId e name são obrigatórios.' });
    const location = await prisma.location.create({ data: { tenantId, name, type, address, floor, room, icon, latitude, longitude, parentId } });
    res.status(201).json(location);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/locations/:id
router.put('/:id', async (req, res) => {
  try {
    const location = await prisma.location.update({ where: { id: req.params.id }, data: req.body });
    res.json(location);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/locations/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.location.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
