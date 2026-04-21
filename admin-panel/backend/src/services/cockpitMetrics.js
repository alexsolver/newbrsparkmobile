'use strict';

const { $Enums } = require('@prisma/client');

/**
 * Cockpit Metrics Service
 * Agregador em memória para evitar gargalos (locks/sobrecarga) no banco de dados.
 * Recebe injeção de resultados do sync.js e armazena numa janela analítica.
 */

let metrics = {
  syncAttempts: 0,
  syncSuccess: 0,
  syncFailures: 0,
  payloadSizeTotal: 0,
  lastErrors: [],
  activeDevices: new Set(),
  startTime: Date.now()
};

const recordSync = (deviceId, success, payloadSize, errorDetails = null) => {
  metrics.syncAttempts++;
  if (deviceId) metrics.activeDevices.add(deviceId);
  
  if (success) {
    metrics.syncSuccess++;
    metrics.payloadSizeTotal += (payloadSize || 0);
  } else {
    metrics.syncFailures++;
    if (errorDetails) {
      metrics.lastErrors.unshift({ ts: new Date().toISOString(), deviceId, error: errorDetails });
      // Mantém apenas os 50 erros mais recentes para não vazar memória
      if (metrics.lastErrors.length > 50) metrics.lastErrors.pop();
    }
  }
};

/** Contagens globais do quadro OS/RT (mesma regra da antiga Central de operações, sem limite de 200 linhas). */
async function aggregateOperationsBoard(prisma) {
  const rows = await prisma.checklistExecution.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const by = rows.reduce((acc, r) => {
    acc[r.status] = r._count._all;
    return acc;
  }, {});
  const n = (s) => by[s] || 0;
  const pending = n('PENDING');
  const progress =
    n('RECEIVED') + n('ACCEPTED') + n('IN_PROGRESS') + n('PAUSED');
  const completed = n('COMPLETED') + n('SYNCED');
  const cancelled = n('CANCELLED');
  const terminalOk = new Set([
    'PENDING',
    'RECEIVED',
    'ACCEPTED',
    'IN_PROGRESS',
    'PAUSED',
    'COMPLETED',
    'SYNCED',
    'CANCELLED',
  ]);
  let errors = 0;
  let total = 0;
  for (const r of rows) {
    total += r._count._all;
    if (!terminalOk.has(r.status)) errors += r._count._all;
  }
  return { total, pending, progress, completed, cancelled, errors };
}

/**
 * Resumo de integrações (todas) e armazenamento em nuvem (type STORAGE — qualquer fornecedor).
 */
async function aggregateIntegrationAndStorage(prisma) {
  const integrations = { total: 0, active: 0, errorOrDisconnected: 0 };
  const cloudStorage = {
    providers: 0,
    activeOk: 0,
    issues: 0,
    lastTestedAt: null,
    /** none | ok | warning | error */
    health: 'none',
  };
  try {
    const all = await prisma.integration.findMany({
      select: { type: true, status: true, lastTestedAt: true, apiKey: true },
    });
    integrations.total = all.length;
    for (const row of all) {
      if (row.status === 'ACTIVE') integrations.active += 1;
      if (row.status === 'ERROR' || row.status === 'DISCONNECTED') {
        integrations.errorOrDisconnected += 1;
      }
    }

    const storageEnum = $Enums?.IntType?.STORAGE ?? 'STORAGE';
    const storageRows = all.filter((r) => {
      const t = r?.type;
      return t === storageEnum || String(t) === 'STORAGE';
    });
    cloudStorage.providers = storageRows.length;
    let latestTest = null;
    for (const r of storageRows) {
      if (r.status === 'ERROR' || r.status === 'DISCONNECTED') cloudStorage.issues += 1;
      const hasKey = r.apiKey && String(r.apiKey).trim().length > 0;
      if (r.status === 'ACTIVE' && hasKey) cloudStorage.activeOk += 1;
      if (r.lastTestedAt && (!latestTest || r.lastTestedAt > latestTest)) {
        latestTest = r.lastTestedAt;
      }
    }
    cloudStorage.lastTestedAt = latestTest ? latestTest.toISOString() : null;

    if (cloudStorage.providers === 0) {
      cloudStorage.health = 'none';
    } else if (cloudStorage.issues > 0) {
      cloudStorage.health = 'error';
    } else if (cloudStorage.activeOk >= 1) {
      cloudStorage.health = 'ok';
    } else {
      cloudStorage.health = 'warning';
    }
  } catch (e) {
    console.warn('[Cockpit] aggregateIntegrationAndStorage:', e.message);
  }
  return { integrations, cloudStorage };
}

const getMetrics = async (prisma) => {
  let pendingTasks = 0;
  let onDevicesTasks = 0;
  let activeUsers = 0;
  let historicalSyncs = 0;
  let operationsBoard = {
    total: 0,
    pending: 0,
    progress: 0,
    completed: 0,
    cancelled: 0,
    errors: 0,
  };
  let integrationSnapshot = {
    integrations: { total: 0, active: 0, errorOrDisconnected: 0 },
    cloudStorage: {
      providers: 0,
      activeOk: 0,
      issues: 0,
      lastTestedAt: null,
      health: 'none',
    },
  };

  try {
    activeUsers = await prisma.user.count({ where: { isActive: true } });
    pendingTasks = await prisma.checklistExecution.count({ where: { status: 'PENDING' } });
    onDevicesTasks = await prisma.checklistExecution.count({ where: { status: { in: ['RECEIVED', 'ACCEPTED', 'IN_PROGRESS'] } } });
    historicalSyncs = await prisma.checklistExecution.count({ where: { status: { in: ['COMPLETED', 'SYNCED'] } } });
    operationsBoard = await aggregateOperationsBoard(prisma);
  } catch (e) {
    console.warn('[Cockpit] Failed to fetch DB stats (core):', e.message);
  }

  try {
    integrationSnapshot = await aggregateIntegrationAndStorage(prisma);
  } catch (e) {
    console.warn('[Cockpit] Failed to fetch integration snapshot:', e.message);
  }

  const uptimeSeconds = Math.floor((Date.now() - metrics.startTime) / 1000);
  
  return {
    uptimeSeconds,
    operationsBoard,
    memory: {
      syncAttempts: metrics.syncAttempts,
      syncSuccess: metrics.syncSuccess,
      syncFailures: metrics.syncFailures,
      failureRate: metrics.syncAttempts > 0 ? ((metrics.syncFailures / metrics.syncAttempts) * 100).toFixed(2) : '0.00',
      payloadSizeTotalKB: (metrics.payloadSizeTotal / 1024).toFixed(2),
      activeDevicesCount: metrics.activeDevices.size,
      lastErrors: metrics.lastErrors.slice(0, 5) // Manda pro front apenas os top 5 para renderizar log
    },
    database: {
      activeUsers,
      pendingTasks,
      onDevicesTasks,
      historicalSyncs
    },
    integrationSnapshot,
    timestamp: new Date().toISOString()
  };
};

// Exposição global para limpar o set a cada ciclo (ex: zerar de madrugada)
const resetDaily = () => {
    metrics.syncAttempts = 0;
    metrics.syncSuccess = 0;
    metrics.syncFailures = 0;
    metrics.payloadSizeTotal = 0;
    metrics.activeDevices.clear();
};

module.exports = {
  recordSync,
  getMetrics,
  resetDaily
};
