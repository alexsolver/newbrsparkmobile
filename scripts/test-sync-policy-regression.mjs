import assert from 'node:assert/strict';
import {
  metadataIndicatesAdminRevisionCycle,
  shouldRemoveExecutedCacheForRemoteTask,
} from '../src/services/syncPolicy.ts';

function run() {
  const nonePending = new Set();

  // Regressão do bug: após concluir offline, o backend pode devolver IN_PROGRESS por alguns segundos.
  // Sem metadado de revisão, NÃO pode remover da lista local de concluídas.
  assert.equal(
    shouldRemoveExecutedCacheForRemoteTask(
      { id: 'os-1', status: 'IN_PROGRESS', metadata: {} },
      nonePending
    ),
    false,
    'não deve remover concluída local sem sinal de revisão'
  );

  // Se há payload pendente de checklist na outbox, também não remove.
  assert.equal(
    shouldRemoveExecutedCacheForRemoteTask(
      { id: 'os-2', status: 'PENDING', metadata: { reopenForRevisionPending: true } },
      new Set(['os-2'])
    ),
    false,
    'não deve remover quando ainda há checklist pendente na outbox'
  );

  // Reabertura explícita por revisão deve remover da cache de concluídas.
  assert.equal(
    shouldRemoveExecutedCacheForRemoteTask(
      { id: 'os-3', status: 'PENDING', metadata: { reopenForRevisionPending: true } },
      nonePending
    ),
    true,
    'deve remover quando reopenForRevisionPending=true'
  );
  assert.equal(
    shouldRemoveExecutedCacheForRemoteTask(
      { id: 'os-4', status: 'RECEIVED', metadata: { revisionVisitActive: true } },
      nonePending
    ),
    true,
    'deve remover quando revisionVisitActive=true'
  );
  assert.equal(
    shouldRemoveExecutedCacheForRemoteTask(
      { id: 'os-5', status: 'IN_PROGRESS', metadata: { reopenCount: 2 } },
      nonePending
    ),
    true,
    'deve remover quando reopenCount>0'
  );

  // Status terminal nunca remove.
  assert.equal(
    shouldRemoveExecutedCacheForRemoteTask(
      { id: 'os-6', status: 'COMPLETED', metadata: { reopenForRevisionPending: true } },
      nonePending
    ),
    false,
    'status terminal não deve acionar remoção'
  );

  // Garantia dos detectores de ciclo de revisão.
  assert.equal(metadataIndicatesAdminRevisionCycle({}), false);
  assert.equal(metadataIndicatesAdminRevisionCycle({ reopenForRevisionPending: true }), true);
  assert.equal(metadataIndicatesAdminRevisionCycle({ revisionVisitActive: 'true' }), true);
  assert.equal(metadataIndicatesAdminRevisionCycle({ reopenCount: 1 }), true);
  assert.equal(metadataIndicatesAdminRevisionCycle({ reopenCount: 0 }), false);
}

run();
console.log('[OK] sync policy regression checks passed');
