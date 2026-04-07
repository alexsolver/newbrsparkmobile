'use strict';
/**
 * GET /api/sync/tech-stock/movements/search
 * Filtro por intervalo de datas (máx. 31 dias) + opcional texto q.
 * Movimentos em UserModuleData tech_stock_movements + enriquecimento com itens.
 */
const prisma = require('../db');

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_RETURN = 5000;

function ownerEmail(req) {
  return req.user?.email || req.query.owner_email || null;
}

module.exports = async function techStockMovementsSearchHandler(req, res) {
  const email = ownerEmail(req);
  if (!email) return res.status(400).json({ error: 'owner_email required' });

  const fromStr = String(req.query.from || '').trim();
  const toStr = String(req.query.to || '').trim();
  const rawQ = String(req.query.q || '').trim().toLowerCase();
  const tokens = rawQ.split(/\s+/).filter(Boolean);

  if (!fromStr || !toStr) {
    return res.status(400).json({ error: 'Parâmetros from e to (ISO 8601) são obrigatórios.' });
  }

  const fromT = new Date(fromStr).getTime();
  const toT = new Date(toStr).getTime();
  if (Number.isNaN(fromT) || Number.isNaN(toT)) {
    return res.status(400).json({ error: 'Datas from/to inválidas (use ISO 8601).' });
  }
  if (fromT > toT) {
    return res.status(400).json({ error: 'from deve ser anterior ou igual a to.' });
  }
  if (toT - fromT > MAX_RANGE_MS) {
    return res.status(400).json({ error: 'Intervalo máximo: 31 dias.' });
  }

  try {
    const [rowM, rowI] = await Promise.all([
      prisma.userModuleData.findUnique({
        where: { ownerEmail_module: { ownerEmail: email, module: 'tech_stock_movements' } },
      }),
      prisma.userModuleData.findUnique({
        where: { ownerEmail_module: { ownerEmail: email, module: 'tech_stock_items' } },
      }),
    ]);

    let movements = Array.isArray(rowM?.data) ? rowM.data.filter((m) => m && !m._isShared) : [];
    const items = Array.isArray(rowI?.data) ? rowI.data : [];
    const itemById = {};
    for (const it of items) {
      if (it && it.id) itemById[it.id] = it;
    }

    movements = movements.filter((m) => {
      const t = new Date(m.timestamp || 0).getTime();
      return !Number.isNaN(t) && t >= fromT && t <= toT;
    });

    movements.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });

    if (tokens.length > 0) {
      movements = movements.filter((m) => {
        const item = itemById[m.itemId];
        const hay = [
          m.id,
          m.itemId,
          m.type,
          String(m.quantity ?? ''),
          m.reason,
          m.responsibleId,
          m.subLocation,
          item?.sku,
          item?.name,
        ]
          .filter((x) => x != null && String(x).trim() !== '')
          .join(' ')
          .toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }

    const total = movements.length;
    let truncated = false;
    if (movements.length > MAX_RETURN) {
      truncated = true;
      movements = movements.slice(0, MAX_RETURN);
    }

    const enriched = movements.map((m) => ({
      ...m,
      itemSku: itemById[m.itemId]?.sku ?? null,
      itemName: itemById[m.itemId]?.name ?? null,
    }));

    return res.json({
      items: enriched,
      total,
      truncated,
      from: fromStr || null,
      to: toStr || null,
    });
  } catch (e) {
    console.error('[tech-stock/movements/search]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
