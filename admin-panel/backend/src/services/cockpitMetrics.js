'use strict';

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

  try {
    activeUsers = await prisma.user.count({ where: { isActive: true } });
    pendingTasks = await prisma.checklistExecution.count({ where: { status: 'PENDING' } });
    onDevicesTasks = await prisma.checklistExecution.count({ where: { status: { in: ['RECEIVED', 'ACCEPTED', 'IN_PROGRESS'] } } });
    historicalSyncs = await prisma.checklistExecution.count({ where: { status: { in: ['COMPLETED', 'SYNCED'] } } });
    operationsBoard = await aggregateOperationsBoard(prisma);
  } catch(e) {
    console.warn('[Cockpit] Failed to fetch DB stats:', e.message);
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
