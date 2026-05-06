'use strict';
const router = require('express').Router();
const { Prisma } = require('@prisma/client');
const prisma = require('../db');
const { resolveScopedTenantId } = require('../lib/authorization');

const MAX_LIMIT = 200;
const MAX_CSV = 5000;

function parsePage(raw) {
  const n = parseInt(String(raw || '1'), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseLimit(raw, cap) {
  const n = parseInt(String(raw || '50'), 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(cap, Math.max(1, n));
}

/** Escopo: TENANT_ADMIN só vê o próprio tenant; demais podem filtrar por `tenantId`. */
function resolveTenantId(req, queryTenantId) {
  return resolveScopedTenantId(req.authorization, queryTenantId != null ? String(queryTenantId).trim() : null);
}

function buildWhereParts(tenantId, qRaw) {
  const parts = [
    Prisma.sql`si."currentStock" <= si."minStock"`,
    Prisma.sql`a."deletedAt" IS NULL`,
  ];
  if (tenantId) parts.push(Prisma.sql`t.id = ${tenantId}`);
  const q = qRaw != null ? String(qRaw).trim() : '';
  if (q) {
    const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    parts.push(
      Prisma.sql`(si.name ILIKE ${like} OR si.sku ILIKE ${like} OR a.title ILIKE ${like} OR t.name ILIKE ${like})`,
    );
  }
  return Prisma.join(parts, ' AND ');
}

// GET /api/stock-critical?page=1&limit=50&tenantId=&q=&format=json|csv
router.get('/', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, req.query.tenantId);
    const q = req.query.q;
    const whereClause = buildWhereParts(tenantId, q);
    const fmt = String(req.query.format || 'json').toLowerCase();

    if (fmt === 'csv') {
      const limit = parseLimit(req.query.limit, MAX_CSV);
      const rows = await prisma.$queryRaw`
        SELECT si.id AS "id", si.name AS "itemName", si.sku AS "sku",
               si."currentStock" AS "currentStock", si."minStock" AS "minStock",
               si.unit AS "unit",
               a.title AS "assetTitle", a.id AS "assetId",
               t.id AS "tenantId", t.name AS "tenantName"
        FROM "StockItem" si
        INNER JOIN "Asset" a ON a.id = si."assetId"
        INNER JOIN "Tenant" t ON t.id = a."tenantId"
        WHERE ${whereClause}
        ORDER BY (si."minStock" - si."currentStock") DESC, t.name ASC, si.name ASC
        LIMIT ${limit}
      `;
      const list = Array.isArray(rows) ? rows : [];
      const headers = [
        'tenantId',
        'tenantName',
        'assetId',
        'assetTitle',
        'itemId',
        'sku',
        'itemName',
        'unit',
        'currentStock',
        'minStock',
        'gap',
      ];
      const esc = (v) => {
        const t = String(v ?? '').replace(/"/g, '""');
        return /[",\n\r]/.test(t) ? `"${t}"` : t;
      };
      const lines = [headers.join(',')];
      for (const r of list) {
        const cur = Number(r.currentStock ?? 0);
        const mn = Number(r.minStock ?? 0);
        lines.push(
          [
            esc(r.tenantId),
            esc(r.tenantName),
            esc(r.assetId),
            esc(r.assetTitle),
            esc(r.id),
            esc(r.sku),
            esc(r.itemName),
            esc(r.unit),
            esc(cur),
            esc(mn),
            esc(mn - cur),
          ].join(','),
        );
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="aria-estoque-critico.csv"');
      res.send('\uFEFF' + lines.join('\n'));
      return;
    }

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, MAX_LIMIT);
    const offset = (page - 1) * limit;

    const [countRows, dataRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS cnt
        FROM "StockItem" si
        INNER JOIN "Asset" a ON a.id = si."assetId"
        INNER JOIN "Tenant" t ON t.id = a."tenantId"
        WHERE ${whereClause}
      `,
      prisma.$queryRaw`
        SELECT si.id AS "id", si.name AS "itemName", si.sku AS "sku",
               si."currentStock" AS "currentStock", si."minStock" AS "minStock",
               si.unit AS "unit",
               a.title AS "assetTitle", a.id AS "assetId",
               t.id AS "tenantId", t.name AS "tenantName"
        FROM "StockItem" si
        INNER JOIN "Asset" a ON a.id = si."assetId"
        INNER JOIN "Tenant" t ON t.id = a."tenantId"
        WHERE ${whereClause}
        ORDER BY (si."minStock" - si."currentStock") DESC, t.name ASC, si.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ]);

    const total = Number(countRows?.[0]?.cnt ?? 0);
    const data = (dataRows || []).map((row) => ({
      id: String(row.id),
      itemName: String(row.itemName ?? ''),
      sku: String(row.sku ?? ''),
      unit: String(row.unit ?? ''),
      currentStock: Number(row.currentStock ?? 0),
      minStock: Number(row.minStock ?? 0),
      gap: Number(row.minStock ?? 0) - Number(row.currentStock ?? 0),
      assetTitle: String(row.assetTitle ?? ''),
      assetId: String(row.assetId ?? ''),
      tenantId: String(row.tenantId ?? ''),
      tenantName: String(row.tenantName ?? ''),
    }));

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar estoque crítico.' });
  }
});

module.exports = router;
