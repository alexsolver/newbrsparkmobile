'use strict';

const { PrismaClient } = require('@prisma/client');
const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Garante `connection_limit` e `pool_timeout` mínimos na URL do Postgres.
 * Com RLS, cada pedido autenticado usa uma transacção até `res.finish`; um limite baixo na
 * DATABASE_URL (ex.: connection_limit=3) esgota o pool (P2024) e o login falha com «Erro interno».
 */
function databaseUrlWithPoolFloor(raw) {
  const s = String(raw || '').trim();
  if (!s || /^prisma\+/i.test(s)) return s;
  if (!/^postgres(ql)?:\/\//i.test(s)) return s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return s;
  }
  const minLimit = Math.max(
    5,
    Math.min(100, Number(process.env.BRSPARK_PRISMA_CONNECTION_LIMIT_MIN) || 25),
  );
  const minTimeoutSec = Math.max(
    15,
    Math.min(300, Number(process.env.BRSPARK_PRISMA_POOL_TIMEOUT_SEC) || 60),
  );
  const curLimit = Number(u.searchParams.get('connection_limit'));
  const curTimeout = Number(u.searchParams.get('pool_timeout'));
  if (!Number.isFinite(curLimit) || curLimit < minLimit) {
    u.searchParams.set('connection_limit', String(minLimit));
  }
  if (!Number.isFinite(curTimeout) || curTimeout < minTimeoutSec) {
    u.searchParams.set('pool_timeout', String(minTimeoutSec));
  }
  return u.toString();
}

const resolvedDatabaseUrl = databaseUrlWithPoolFloor(process.env.DATABASE_URL || '');

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  ...(resolvedDatabaseUrl ? { datasources: { db: { url: resolvedDatabaseUrl } } } : {}),
});

/** @type {AsyncLocalStorage<{ tx: import('@prisma/client').Prisma.TransactionClient }>} */
const rlsAls = new AsyncLocalStorage();

function activeClient() {
  const s = rlsAls.getStore();
  return s && s.tx ? s.tx : basePrisma;
}

/**
 * Dentro do middleware RLS, `prisma` resolve para o `tx` da transacção interactiva.
 * Esse cliente **não** expõe `$transaction` (ITXClientDenyList) — chamadas como
 * `prisma.$transaction([...])` falhavam com «$transaction is not a function».
 * Reutilizamos o mesmo `tx`: callback `fn(tx)` ou sequência de `PrismaPromise`.
 *
 * @param {unknown} first
 * @param {unknown[]} rest
 */
function prismaTransactionShim(first, ...rest) {
  const s = rlsAls.getStore();
  if (!s || !s.tx) {
    return basePrisma.$transaction(first, ...rest);
  }
  const { tx } = s;
  if (typeof first === 'function') {
    return first(tx);
  }
  if (Array.isArray(first)) {
    return (async () => {
      const out = [];
      for (const op of first) {
        out.push(await op);
      }
      return out;
    })();
  }
  return basePrisma.$transaction(first, ...rest);
}

const prisma = new Proxy(basePrisma, {
  get(_target, prop) {
    if (prop === '$transaction') {
      return prismaTransactionShim;
    }
    const active = activeClient();
    const v = active[prop];
    if (typeof v === 'function') return v.bind(active);
    return v;
  },
});

module.exports = prisma;
module.exports.basePrisma = basePrisma;
module.exports.rlsAls = rlsAls;
