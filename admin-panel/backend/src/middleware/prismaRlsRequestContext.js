'use strict';

const { applyPrismaRlsSession } = require('../lib/prismaRlsSession');
const { resolveAppEffectiveTenantId } = require('../lib/appLoginEffectiveTenant');

function rlsDisabled() {
  const v = String(process.env.BRSPARK_RLS_DISABLE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Uma transacção PostgreSQL por pedido HTTP autenticado, com `set_config(..., true)` para as políticas RLS.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @param {{ bridgeInternal?: boolean, reportsApiKey?: boolean }} [opts]
 */
async function continueWithRlsTransaction(req, res, next, opts = {}) {
  if (rlsDisabled()) {
    return next();
  }

  const db = require('../db');
  const { basePrisma, rlsAls } = db;

  if (req.appUser && !req.user && req.appUser.id) {
    try {
      const eff = await resolveAppEffectiveTenantId(basePrisma, req.appUser.id);
      if (eff) {
        req.appUser = { ...req.appUser, tenantId: eff };
      }
    } catch (_) {
      /* ignorar — mantém tenantId do JWT */
    }
  }

  const txTimeout = Math.min(
    900_000,
    Math.max(60_000, Number(process.env.BRSPARK_RLS_TX_TIMEOUT_MS) || 300_000),
  );
  const txMaxWait = Math.min(120_000, Math.max(5_000, Number(process.env.BRSPARK_RLS_TX_MAXWAIT_MS) || 30_000));

  try {
    await basePrisma.$transaction(
      async (tx) => {
        await applyPrismaRlsSession(tx, req, opts);
        await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (err) => {
            if (settled) return;
            settled = true;
            res.removeListener('finish', onFinish);
            res.removeListener('close', onClose);
            if (err) reject(err);
            else resolve();
          };
          const onFinish = () => finish();
          const onClose = () => finish();
          res.once('finish', onFinish);
          res.once('close', onClose);

          rlsAls.run({ tx }, () => {
            try {
              // `next` do Express não aceita callback; passar função era tratada como erro.
              next();
            } catch (e) {
              finish(e);
            }
          });
        });
      },
      { timeout: txTimeout, maxWait: txMaxWait, isolationLevel: 'ReadCommitted' },
    );
  } catch (err) {
    if (!res.headersSent) {
      const msg = err && err.message ? String(err.message) : 'Erro na transacção.';
      if (String(msg).includes('Transaction already closed') || String(msg).includes('timeout')) {
        return res.status(503).json({ error: 'Servidor ocupado. Tente novamente.', code: 'RLS_TX_TIMEOUT' });
      }
    }
    return next(err);
  }
}

/**
 * Router middleware: contexto interno Laravel / bridge (acesso total via GUC `app.bridge_internal`).
 */
async function prismaRlsInternalBridgeMiddleware(req, res, next) {
  return continueWithRlsTransaction(req, res, next, { bridgeInternal: true });
}

module.exports = {
  continueWithRlsTransaction,
  prismaRlsInternalBridgeMiddleware,
};
