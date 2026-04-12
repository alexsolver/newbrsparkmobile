/**
 * Contexto de OS a partir do cache FT local (`@brspark_cloud_tasks` — ver `cloudTasksBuckets.ts`).
 */

export type CloudTaskFinanceInfo = {
  osNumber: string | null;
  activityTitle: string;
  requester: string;
  location: string;
};

function taskMetadataRecord(t: any): Record<string, unknown> {
  const m = t?.metadata;
  if (m == null) return {};
  if (typeof m === 'string') {
    try {
      const o = JSON.parse(m);
      return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof m === 'object') return m as Record<string, unknown>;
  return {};
}

function requesterFromTask(t: any): string {
  const meta = taskMetadataRecord(t);
  for (const k of [
    'requesterName',
    'clientName',
    'solicitante',
    'customerName',
    'contactName',
    'requester',
    'requesterLabel',
  ]) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

function locationFromTask(t: any): string {
  const top = t?.locationAddress;
  if (top != null && String(top).trim()) return String(top).trim();
  const meta = taskMetadataRecord(t);
  for (const k of ['locationAddress', 'serviceAddress', 'endereco', 'address']) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  const la = Number(t?.locationLat);
  const ln = Number(t?.locationLng);
  if (Number.isFinite(la) && Number.isFinite(ln)) return `${la.toFixed(5)}, ${ln.toFixed(5)}`;
  return '';
}

function activityTitleFromTask(t: any): string {
  const top = t?.title != null ? String(t.title).trim() : '';
  if (top) return top;
  const meta = taskMetadataRecord(t);
  const tt = meta.templateTitle != null ? String(meta.templateTitle).trim() : '';
  return tt;
}

/** Constrói o registro a guardar no mapa id → contexto (a partir de um item cru do pull de tarefas). */
export function cloudTaskToFinanceInfo(t: any): CloudTaskFinanceInfo {
  const rawOs = t?.osNumber ?? t?.os_number;
  const osNumber = rawOs != null && String(rawOs).trim() !== '' ? String(rawOs).trim() : null;
  return {
    osNumber,
    activityTitle: activityTitleFromTask(t),
    requester: requesterFromTask(t),
    location: locationFromTask(t),
  };
}

export function formatOsHeadline(taskId: string, info: CloudTaskFinanceInfo | undefined): string {
  if (info?.osNumber) return `OS ${info.osNumber}`;
  if (info?.activityTitle) return info.activityTitle.slice(0, 48);
  return `Execução ${String(taskId).slice(0, 8)}…`;
}
