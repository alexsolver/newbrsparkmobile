'use strict';

/**
 * Pré-carga de "materiais / entrada" para o app (tabela materials_receipt_inputs).
 *
 * - GET  /api/materials-receipt-inputs — JWT usuário: lista linhas do próprio conductor_id.
 * - POST /api/materials-receipt-inputs/import — admin JWT ou REPORTS_API_KEY: cria linhas em lote.
 */

const router = require('express').Router();
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { adminOrReportsApiKey } = require('../middleware/auth');
const { Prisma } = require('@prisma/client');

function toRow(r) {
  return {
    id: r.id,
    conductor_id: r.conductorId,
    tenant_id: r.tenantId,
    nome: r.nome,
    codigo_interno: r.codigoInterno,
    sku: r.sku,
    preco_un: r.precoUn != null ? Number(r.precoUn) : null,
    qtd: r.qtd,
    meta: r.meta,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

router.get('/', authUser, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const conductorId = req.user.id;
    const rows = await prisma.materialsReceiptInput.findMany({
      where: { tenantId, conductorId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: rows.map(toRow) });
  } catch (err) {
    console.error('[materials-receipt-inputs GET]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', adminOrReportsApiKey, async (req, res) => {
  try {
    const { tenant_id, conductor_id, items, replace } = req.body || {};
    if (!tenant_id || !conductor_id) {
      return res.status(400).json({ error: 'tenant_id e conductor_id são obrigatórios.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items deve ser um array não vazio.' });
    }

    const user = await prisma.user.findFirst({
      where: { id: conductor_id, tenantId: tenant_id },
      select: { id: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'Usuário (conductor_id) não encontrado neste tenant.' });
    }

    const data = [];
    for (const raw of items) {
      const nome = raw && raw.nome != null ? String(raw.nome).trim() : '';
      if (!nome) {
        return res.status(400).json({ error: 'Cada item precisa de nome.' });
      }
      const codigo_interno =
        raw && raw.codigo_interno != null ? String(raw.codigo_interno).trim() : '';
      const sku = raw && raw.sku != null ? String(raw.sku).trim() : '';
      let precoUn = null;
      if (raw && raw.preco_un != null && raw.preco_un !== '') {
        const n = Number(raw.preco_un);
        if (!Number.isFinite(n)) {
          return res.status(400).json({ error: 'preco_un inválido em um dos itens.' });
        }
        precoUn = n;
      }
      let qtd = 0;
      if (raw && raw.qtd != null && raw.qtd !== '') {
        const q = Math.floor(Number(raw.qtd));
        if (!Number.isFinite(q) || q < 0) {
          return res.status(400).json({ error: 'qtd inválida em um dos itens.' });
        }
        qtd = q;
      }
      let meta = null;
      if (raw && raw.meta !== undefined && raw.meta !== null) {
        if (typeof raw.meta === 'object' && !Array.isArray(raw.meta)) {
          meta = raw.meta;
        } else if (Array.isArray(raw.meta)) {
          meta = raw.meta;
        } else {
          try {
            meta = JSON.parse(String(raw.meta));
          } catch {
            return res.status(400).json({ error: 'meta deve ser JSON válido (objeto, array ou string JSON).' });
          }
        }
      }

      data.push({
        tenantId: tenant_id,
        conductorId: conductor_id,
        nome,
        codigoInterno: codigo_interno,
        sku,
        precoUn: precoUn != null ? new Prisma.Decimal(precoUn) : null,
        qtd,
        meta,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (replace === true || replace === 'true' || replace === 1) {
        await tx.materialsReceiptInput.deleteMany({
          where: { tenantId: tenant_id, conductorId: conductor_id },
        });
      }
      for (const row of data) {
        await tx.materialsReceiptInput.create({ data: row });
      }
      return tx.materialsReceiptInput.findMany({
        where: { tenantId: tenant_id, conductorId: conductor_id },
        orderBy: { createdAt: 'asc' },
      });
    });

    res.status(201).json({ ok: true, count: data.length, items: result.map(toRow) });
  } catch (err) {
    console.error('[materials-receipt-inputs import]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
