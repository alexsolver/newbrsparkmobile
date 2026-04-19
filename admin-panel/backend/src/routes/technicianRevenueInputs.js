'use strict';

/**
 * Pré-carga de receitas do técnico para o app (tabela technician_revenue_inputs).
 *
 * - GET  /api/technician-revenue-inputs — JWT: linhas do próprio utilizador (conductor).
 * - POST /api/technician-revenue-inputs/import — admin JWT ou REPORTS_API_KEY: lote.
 */

const router = require('express').Router();
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { adminOrReportsApiKey } = require('../middleware/auth');
const { Prisma } = require('@prisma/client');

/** Quando o deploy não correu `prisma generate` após adicionar TechnicianRevenueInput, o delegate não existe. */
function technicianRevenueOr503(res) {
  const d = prisma.technicianRevenueInput;
  if (d && typeof d.findMany === 'function') return d;
  console.error(
    '[technician-revenue-inputs] prisma.technicianRevenueInput indisponível — execute no backend: npm install && npx prisma generate; aplique a migração 20260422150000_technician_revenue_inputs e reinicie.'
  );
  res.status(503).json({
    error:
      'Servidor sem o cliente Prisma atualizado para receitas. No backend: npm install, npx prisma generate, migrar a BD e reiniciar o API (ver migração technician_revenue_inputs).',
  });
  return null;
}

function parseFtsOrigem(raw) {
  if (raw == null || raw === '') return null;
  if (Array.isArray(raw)) {
    const arr = raw.map((x) => String(x).trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  if (typeof raw === 'string') {
    const parts = raw
      .split(/[,;]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : null;
  }
  return null;
}

function toRow(r) {
  return {
    id: r.id,
    conductor_id: r.conductorId,
    tenant_id: r.tenantId,
    descricao: r.descricao,
    valor: r.valor != null ? Number(r.valor) : 0,
    fts_origem: r.ftsOrigem,
    meta: r.meta,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

router.get('/', authUser, async (req, res) => {
  const Rev = technicianRevenueOr503(res);
  if (!Rev) return;
  try {
    const tenantId = req.user.tenantId;
    const conductorId = req.user.id;
    const rows = await Rev.findMany({
      where: { tenantId, conductorId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: rows.map(toRow) });
  } catch (err) {
    console.error('[technician-revenue-inputs GET]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', adminOrReportsApiKey, async (req, res) => {
  const Rev = technicianRevenueOr503(res);
  if (!Rev) return;
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
      const descricao = raw && raw.descricao != null ? String(raw.descricao).trim() : '';
      if (!descricao) {
        return res.status(400).json({ error: 'Cada item precisa de descricao.' });
      }
      let valor = 0;
      if (raw && raw.valor != null && raw.valor !== '') {
        const n = Number(raw.valor);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'valor inválido em um dos itens.' });
        }
        valor = n;
      }
      const ftsOrigem = parseFtsOrigem(raw?.fts_origem != null ? raw.fts_origem : raw?.ftsOrigem);
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
            return res.status(400).json({ error: 'meta deve ser JSON válido.' });
          }
        }
      }

      data.push({
        tenantId: tenant_id,
        conductorId: conductor_id,
        descricao,
        valor: new Prisma.Decimal(valor),
        ftsOrigem,
        meta,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const TxRev = tx.technicianRevenueInput;
      if (!TxRev || typeof TxRev.findMany !== 'function') {
        throw new Error('Prisma transaction: technicianRevenueInput indisponível (rode prisma generate no servidor).');
      }
      if (replace === true || replace === 'true' || replace === 1) {
        await TxRev.deleteMany({
          where: { tenantId: tenant_id, conductorId: conductor_id },
        });
      }
      for (const row of data) {
        await TxRev.create({ data: row });
      }
      return TxRev.findMany({
        where: { tenantId: tenant_id, conductorId: conductor_id },
        orderBy: { createdAt: 'asc' },
      });
    });

    res.status(201).json({ ok: true, count: data.length, items: result.map(toRow) });
  } catch (err) {
    console.error('[technician-revenue-inputs import]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
