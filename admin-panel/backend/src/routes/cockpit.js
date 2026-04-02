'use strict';

const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { getMetrics } = require('../services/cockpitMetrics');

// Rota ultra otimizada para ser chamada a cada 30 segundos pelo Operations Cockpit
router.get('/health', async (req, res) => {
  try {
    const data = await getMetrics(prisma);
    res.json({ status: 'ok', data });
  } catch (error) {
    console.error('[Cockpit Route] Error fetching health metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
