import {
  decideProviderTaskInclusion,
  shouldRequireKnownExecutionGate,
} from '../src/utils/providerTaskEventFilter';

function assertTrue(name: string, value: boolean): void {
  if (!value) {
    throw new Error(`FAIL: ${name}`);
  }
  console.log(`PASS: ${name}`);
}

function assertReason(name: string, reason: string, expected: string): void {
  if (reason !== expected) {
    throw new Error(`FAIL: ${name} (expected=${expected}, got=${reason})`);
  }
  console.log(`PASS: ${name}`);
}

const activeStatuses = new Set(['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED']);
const knownExecutionIds = new Set(['os_real_1', 'os_real_2']);
const executedMap: Record<string, unknown> = {
  os_done_1: { id: 'os_done_1', completedAt: '2026-04-01T10:00:00.000Z' },
};
const rejectedIds = new Set<string>(['os_rejected_1']);
const isRoutineTask = (row: any) => Boolean(row?.metadata?.routineTask);
const executedRawList = [{ id: 'os_old_purged' }];

assertTrue(
  'known-execution gate enabled only when lookup ok and ids available',
  shouldRequireKnownExecutionGate({ cloudLookupOk: true, knownExecutionIdsSize: 2 }) === true
);
assertTrue(
  'known-execution gate disabled when lookup fails',
  shouldRequireKnownExecutionGate({ cloudLookupOk: false, knownExecutionIdsSize: 2 }) === false
);
assertTrue(
  'known-execution gate disabled when lookup has zero ids',
  shouldRequireKnownExecutionGate({ cloudLookupOk: true, knownExecutionIdsSize: 0 }) === false
);

const realPending = decideProviderTaskInclusion({
  event: { id: 'os_real_1', source: 'CHECKLIST', category: 'TASK', status: 'PENDING', refId: 'tmpl_1' },
  knownExecutionIds,
  executedMap,
  rejectedIds,
  isRoutineTask,
  activeStatuses,
  executedRawList,
});
assertTrue('real pending should be included', realPending.ok === true);

const junkTask = decideProviderTaskInclusion({
  event: { id: 'junk_1', source: 'CRM', category: 'TASK', status: 'PENDING', title: 'Seguro Residencial — Teste' },
  knownExecutionIds,
  executedMap,
  rejectedIds,
  isRoutineTask,
  activeStatuses,
  executedRawList,
});
assertTrue('junk task should be rejected', junkTask.ok === false);
if (!junkTask.ok) assertReason('junk reject reason', junkTask.reason, 'not_known_execution');

const unknownChecklistWhenGateDisabled = decideProviderTaskInclusion({
  event: { id: 'os_live_3', source: 'CHECKLIST', category: 'TASK', status: 'PENDING', refId: 'tmpl_3' },
  knownExecutionIds: new Set<string>(),
  executedMap: {},
  rejectedIds,
  isRoutineTask,
  activeStatuses,
  executedRawList: [],
  requireKnownExecution: false,
});
assertTrue(
  'active checklist task must survive when known-execution gate is disabled',
  unknownChecklistWhenGateDisabled.ok === true
);

const junkWhenGateDisabled = decideProviderTaskInclusion({
  event: { id: 'junk_2', source: 'CRM', category: 'TASK', status: 'PENDING', title: 'Seguro Residencial — Teste' },
  knownExecutionIds: new Set<string>(),
  executedMap: {},
  rejectedIds,
  isRoutineTask,
  activeStatuses,
  executedRawList: [],
  requireKnownExecution: false,
});
assertTrue('junk still rejected when known-execution gate is disabled', junkWhenGateDisabled.ok === false);
if (!junkWhenGateDisabled.ok) {
  assertReason('junk reject reason with gate disabled', junkWhenGateDisabled.reason, 'not_checklist_event');
}

const wrongChecklistWithoutLink = decideProviderTaskInclusion({
  event: { id: 'os_real_2', source: 'CRM', category: 'TASK', status: 'PENDING' },
  knownExecutionIds,
  executedMap,
  rejectedIds,
  isRoutineTask,
  activeStatuses,
  executedRawList,
});
assertTrue('known id but without checklist marker should be rejected', wrongChecklistWithoutLink.ok === false);
if (!wrongChecklistWithoutLink.ok) {
  assertReason('missing checklist link reason', wrongChecklistWithoutLink.reason, 'not_checklist_event');
}

const reopenedActive = decideProviderTaskInclusion({
  event: { id: 'os_real_2', source: 'CHECKLIST', category: 'TASK', status: 'IN_PROGRESS', refId: 'tmpl_2' },
  knownExecutionIds,
  executedMap,
  rejectedIds,
  isRoutineTask,
  activeStatuses,
  executedRawList,
});
assertTrue('reopened active OS should be included', reopenedActive.ok === true);

const purgedOld = decideProviderTaskInclusion({
  event: { id: 'os_old_purged', source: 'CHECKLIST', category: 'TASK', status: 'COMPLETED', refId: 'tmpl_x' },
  knownExecutionIds,
  executedMap,
  rejectedIds,
  isRoutineTask,
  activeStatuses,
  executedRawList,
});
assertTrue('purged old should be rejected', purgedOld.ok === false);
if (!purgedOld.ok) assertReason('purged reason', purgedOld.reason, 'not_known_execution');

console.log('All provider task filter regression checks passed.');
