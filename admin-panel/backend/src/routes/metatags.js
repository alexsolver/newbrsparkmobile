'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/metatags?type=
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const tags = await prisma.metatag.findMany({
      where: type ? { type } : {},
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }]
    });
    res.json(tags);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/metatags
router.post('/', async (req, res) => {
  try {
    const { type, key, ptBr, enUs, esEs, icon, color, sortOrder = 0 } = req.body;
    if (!type || !key || !ptBr) return res.status(400).json({ error: 'type, key e ptBr são obrigatórios.' });
    const tag = await prisma.metatag.create({ data: { type, key, ptBr, enUs: enUs || ptBr, esEs: esEs || ptBr, icon, color, sortOrder } });
    res.status(201).json(tag);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/metatags/:id
router.put('/:id', async (req, res) => {
  try {
    const tag = await prisma.metatag.update({ where: { id: req.params.id }, data: req.body });
    res.json(tag);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/metatags/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.metatag.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
