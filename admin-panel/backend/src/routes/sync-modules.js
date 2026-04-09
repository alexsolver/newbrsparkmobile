'use strict';
/**
 * sync-modules.js — Rotas de sync para módulos do app mobile
 *
 * Todos os módulos usam a tabela UserModuleData (ownerEmail + module + data[]).
 * Padrão: GET retorna array, POST recebe array e substitui (upsert).
 *
 * Módulos suportados:
 *   costs/expenses | costs/recurring | costs/budgets
 *   insurance | maintenances | vault | media | asset_docs
 *   stock/items | stock/movements
 *   tech-stock/items | tech-stock/movements (estoque do técnico — independente de bens)
 *   tech-finance/entries (livro do técnico — independente de bens)
 *   agenda/events (compromissos locais AsyncStorage)
 *   asset-notes (notas por ativo — espelho JSON; app persiste em SQLite)
 */

const router = require('express').Router();
const prisma  = require('../db');
const authUser = require('../middleware/authUser');

// Todas as rotas exigem JWT de usuário
router.use(authUser);

/** Extrai owner_email do token ou do query param */
function ownerEmail(req) {
  return req.user?.email || req.query.owner_email || null;
}

/** GET helper: retorna data[] para o módulo (incluindo compartilhados) */
function pullHandler(module) {
  return async (req, res) => {
    const email = ownerEmail(req);
    if (!email) return res.status(400).json({ error: 'owner_email required' });
    try {
      // 1. Dados do próprio dono
      const row = await prisma.userModuleData.findUnique({
        where: { ownerEmail_module: { ownerEmail: email, module } },
      });
      let myData = row?.data ?? [];

      // 2. Buscar bens compartilhados com ele (status ACCEPTED)
      const shares = await prisma.assetShare.findMany({
        where: { 
          sharedWithEmail: email.toLowerCase(), 
          status: 'ACCEPTED',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: { assetId: true, modules: true, ownerEmail: true }
      });
      // Agrupar por dono (para fazer queries otimizadas em UserModuleData)
      const sharesByOwner = {};
      for (const share of shares) {
        // Valida se o módulo está liberado. Se modules for ["all"] ou incluir o nome da rota.
        let allowed = false;
        try {
           const mods = typeof share.modules === 'string' ? JSON.parse(share.modules) : share.modules;
           // O App mobile pode gravar ["*"] ou ["costs", "maint"], teremos que adaptar
           if (Array.isArray(mods) && (mods.includes('*') || mods.some(m => module.includes(m)))) {
              allowed = true;
           }
        } catch(e){}

        if (allowed) {
           if (!sharesByOwner[share.ownerEmail]) sharesByOwner[share.ownerEmail] = [];
           sharesByOwner[share.ownerEmail].push(share.assetId);
        }
      }

      // 3. Buscar e mesclar os dados compartilhados
      const ownerKeys = Object.keys(sharesByOwner);
      if (ownerKeys.length > 0) {
        const sharedRows = await prisma.userModuleData.findMany({
          where: {
            module,
            ownerEmail: { in: ownerKeys }
          }
        });

        for (const sharedRow of sharedRows) {
           const allowList = sharesByOwner[sharedRow.ownerEmail] || [];
           const elements = sharedRow.data || [];
           // Filtrar para incluir apenas itens que contêm o assetId liberado (ou parentId/rootId dependendo do módulo)
           // Na estrutura do BrSpark, a maioria das entidades tem 'assetId', 'parentId' ou 'rootId' atrelada.
           const grantedElements = elements.filter(el => {
              const aId = el.assetId || el.parentId || el.rootId;
              return allowList.includes(aId);
           });
           
           // Injetar readonly flag? Para o Frontend saber que não pode editar.
           const mappedElements = grantedElements.map(el => ({
              ...el,
              _isShared: true, 
              _ownerEmail: sharedRow.ownerEmail // Metadados úteis pro app mobile (push blocker)
           }));

           myData = myData.concat(mappedElements);
        }
      }

      return res.json(myData);
    } catch (e) {
      console.error(`[sync-modules] GET ${module}:`, e.message);
      return res.status(500).json({ error: e.message });
    }
  };
}

/** POST helper: recebe array e upserta (lidando com compartilhados) */
function pushHandler(module) {
  return async (req, res) => {
    const email = ownerEmail(req);
    if (!email) return res.status(400).json({ error: 'owner_email required' });
    const data = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: 'body must be array' });
    try {
      // Separar meus dados vs dados compartilhados modificados
      const myData = data.filter(el => !el._isShared);
      const sharedData = data.filter(el => el._isShared && el._ownerEmail);

      // 1. Gravar Meus Dados
      await prisma.userModuleData.upsert({
        where: { ownerEmail_module: { ownerEmail: email, module } },
        create: { ownerEmail: email, module, data: myData },
        update: { data: myData },
      });

      // 2. Processar Mutações em Dados Comcompartilhados (Rotear para o dono)
      if (sharedData.length > 0) {
         // Agrupar por dono original
         const byOwner = {};
         for (const item of sharedData) {
            if (!byOwner[item._ownerEmail]) byOwner[item._ownerEmail] = [];
            byOwner[item._ownerEmail].push(item);
         }

         for (const [oEmail, items] of Object.entries(byOwner)) {
            // Verificar permissões desse usuário sobre os assets que ele tentou mexer
            const shares = await prisma.assetShare.findMany({
               where: { 
                 sharedWithEmail: email.toLowerCase(), 
                 ownerEmail: oEmail, 
                 status: 'ACCEPTED', 
                 permission: 'WRITE',
                 OR: [
                   { expiresAt: null },
                   { expiresAt: { gt: new Date() } }
                 ]
               }
            });
            const allowedAssetIds = shares.map(s => s.assetId);

            // Filtrar itens apenas para ativos que ele tem permissão de WRITE
            const validItems = items.filter(el => {
               const aId = el.assetId || el.parentId || el.rootId;
               return allowedAssetIds.includes(aId);
            });

            if (validItems.length > 0) {
               // Buscar os dados originais do dono
               const ownerRow = await prisma.userModuleData.findUnique({
                  where: { ownerEmail_module: { ownerEmail: oEmail, module } }
               });
               
               let ownerData = ownerRow?.data || [];
               
               // Mesclar (Atualizar e Inserir)
               // Em BrSpark JSON arrays, usamos 'id' como chave forte
               for (const vi of validItems) {
                  // Limpar tags injetadas para não sujar o banco original
                  const cleanItem = { ...vi };
                  delete cleanItem._isShared;
                  delete cleanItem._ownerEmail;

                  const idx = ownerData.findIndex(el => el.id === vi.id);
                  if (idx >= 0) {
                     ownerData[idx] = cleanItem;
                  } else {
                     ownerData.push(cleanItem);
                  }
               }

               // Salvar de volta no dono
               await prisma.userModuleData.upsert({
                 where: { ownerEmail_module: { ownerEmail: oEmail, module } },
                 create: { ownerEmail: oEmail, module, data: ownerData },
                 update: { data: ownerData },
               });
            }
         }
      }

      return res.json({ ok: true, count: data.length });
    } catch (e) {
      console.error(`[sync-modules] POST ${module}:`, e.message);
      return res.status(500).json({ error: e.message });
    }
  };
}

// ── Custos ─────────────────────────────────────────────
router.get('/costs/expenses',  pullHandler('costs_expenses'));
router.post('/costs/expenses', pushHandler('costs_expenses'));

router.get('/costs/recurring',  pullHandler('costs_recurring'));
router.post('/costs/recurring', pushHandler('costs_recurring'));

router.get('/costs/budgets',  pullHandler('costs_budgets'));
router.post('/costs/budgets', pushHandler('costs_budgets'));

// ── Seguros ────────────────────────────────────────────
router.get('/insurance',  pullHandler('insurance_policies'));
router.post('/insurance', pushHandler('insurance_policies'));

// ── Manutenção ─────────────────────────────────────────
router.get('/maintenances',  pullHandler('maintenances'));
router.post('/maintenances', pushHandler('maintenances'));

// ── Cofre (Vault) ──────────────────────────────────────
// Vault é especial: dados são { assetId, entries[] }[]
router.get('/vault',  pullHandler('vault'));
router.post('/vault', pushHandler('vault'));

// ── Mídia (metadados) ──────────────────────────────────
router.get('/media',  pullHandler('media_remote_index'));
router.post('/media', pushHandler('media_remote_index'));

// ── Documentos dos Ativos ──────────────────────────────
router.get('/asset_docs',  pullHandler('asset_docs'));
router.post('/asset_docs', pushHandler('asset_docs'));

// ── Estoque ────────────────────────────────────────────
router.get('/stock/items',  pullHandler('stock_items'));
router.post('/stock/items', pushHandler('stock_items'));

router.get('/stock/movements',  pullHandler('stock_movements'));
router.post('/stock/movements', pushHandler('stock_movements'));

// ── Estoque do técnico (sem vínculo a Asset / portfólio) ─────────────────────
router.get('/tech-stock/items', pullHandler('tech_stock_items'));
router.post('/tech-stock/items', pushHandler('tech_stock_items'));

// GET /tech-stock/movements/search — implementado em routes/sync.js (montado antes deste router).

router.get('/tech-stock/movements', pullHandler('tech_stock_movements'));
router.post('/tech-stock/movements', pushHandler('tech_stock_movements'));

router.get('/tech-finance/entries', pullHandler('tech_finance_entries'));
router.post('/tech-finance/entries', pushHandler('tech_finance_entries'));

router.get('/agenda/events', pullHandler('agenda_events'));
router.post('/agenda/events', pushHandler('agenda_events'));

router.get('/asset-notes', pullHandler('asset_notes'));
router.post('/asset-notes', pushHandler('asset_notes'));

module.exports = router;
