import { apiFetch } from './auth';

export type WorkTimePunchType = 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END';

export type WorkTimeSettingsPayload = {
  moduleEnabled: boolean;
  requireFaceOnEveryPunch: boolean;
  requireGpsOnEveryPunch: boolean;
  requireResolvedAddress: boolean;
  maxClockDriftSeconds: number | null;
  minGpsAccuracyMeters: number | null;
  employeeNoticeMarkdown: string | null;
  consentVersion: string | null;
};

export type WorkTimeMeOk = {
  ok: true;
  tenantId: string;
  userId: string;
  role: string;
  featureFlagEnabled: boolean;
  settings: WorkTimeSettingsPayload;
  userWorkTimeEnabled: boolean;
  workTimeEnrolledAt: string | null;
  faceEnrollmentOk: boolean;
  showWorkTimeInApp: boolean;
  canRegisterPunch: boolean;
};

export type WorkTimeMeErr = { ok: false; error: string };

export type WorkTimeMeResponse = WorkTimeMeOk | WorkTimeMeErr;

export async function fetchWorkTimeMe(): Promise<WorkTimeMeResponse | null> {
  const res = await apiFetch('/api/work-time/me');
  if (res.status === 404) return null;
  const data = (await res.json().catch(() => ({}))) as WorkTimeMeResponse;
  if (!res.ok) {
    const msg = typeof (data as WorkTimeMeErr).error === 'string' ? (data as WorkTimeMeErr).error : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
    return data as WorkTimeMeErr;
  }
  return data as WorkTimeMeOk;
}

export type WorkTimeDeviceInfo = {
  brand?: string;
  modelName?: string;
  osName?: string;
  osVersion?: string;
  deviceName?: string;
  deviceYearClass?: number;
  appVersion?: string;
  nativeAppVersion?: string;
  platform?: string;
};

export type PostWorkTimePunchBody = {
  type: WorkTimePunchType;
  deviceTimestamp: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  faceVerificationId?: string;
  faceScore?: number | null;
  faceEngine?: string | null;
  rawPayload?: Record<string, unknown>;
  /** Registo por exceção (falhou GPS/endereço/face obrigatório) — exige justificativa. */
  exceptionRegistration?: boolean;
  exceptionJustification?: string;
  deviceInfo?: WorkTimeDeviceInfo;
  /** Batida guardada offline e enviada depois — o servidor relaxa o controlo de deriva do relógio. */
  offlineDeferredSubmission?: boolean;
  /** ISO do instante em que a batida foi enfileirada no aparelho (alinhado a `deviceTimestamp`). */
  offlineQueuedAt?: string;
  /** Idempotência / dedupe por reenvio da mesma batida. */
  clientPunchUuid?: string;
};

export type WorkTimePunchCreated = {
  id: string;
  faceEnrollmentInvalid?: boolean;
  exceptionRegistration?: boolean;
  exceptionJustification?: string | null;
  validationSnapshot?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export class WorkTimePunchRequestError extends Error {
  code?: string;
  failures?: string[];
  constructor(message: string, code?: string, failures?: string[]) {
    super(message);
    this.name = 'WorkTimePunchRequestError';
    this.code = code;
    this.failures = failures;
  }
}

/** Erro de rede / timeout típico do fetch no React Native. */
export function isConnectivityFailure(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  const msg = String(err instanceof Error ? err.message : err || '');
  if (name === 'AbortError') return true;
  return (
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('Timeout') ||
    msg.includes('timed out')
  );
}

export async function postWorkTimePunch(body: PostWorkTimePunchBody): Promise<WorkTimePunchCreated> {
  const res = await apiFetch('/api/work-time/punches', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as WorkTimePunchCreated & {
    error?: string;
    code?: string;
    failures?: string[];
  };
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
    throw new WorkTimePunchRequestError(msg, typeof data.code === 'string' ? data.code : undefined, data.failures);
  }
  return data;
}

export type WorkTimePunchRow = {
  id: string;
  type: string;
  deviceTimestamp: string;
  formattedAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  validationSnapshot?: Record<string, unknown> | null;
  rawPayload?: Record<string, unknown> | null;
  /** Preenchido pelo servidor (GET batidas). */
  employeeFullName?: string | null;
  employeeEmail?: string | null;
  employeeMatricula?: string | null;
  deviceSummary?: string | null;
  gpsLine?: string | null;
  faceEnrollmentInvalid?: boolean | null;
  faceVerificationId?: string | null;
  exceptionRegistration?: boolean | null;
  exceptionJustification?: string | null;
  /** Relatório admin: jornada trabalhada no dia (fuso São Paulo) até esta batida. */
  accumulatedWorkDayMs?: number | null;
  accumulatedWorkDayLabel?: string | null;
  /** Batida ainda na fila local (aguarda envio / validação no servidor). */
  syncPending?: boolean;
  syncPendingError?: string | null;
};

/**
 * Batidas do servidor. `null` = falha de rede ou HTTP não OK (usar cache local em `workTimePunchesCache`).
 * `[]` = resposta válida sem batidas no período.
 */
export async function fetchWorkTimePunches(days = 31): Promise<WorkTimePunchRow[] | null> {
  const res = await apiFetch(`/api/work-time/punches?days=${encodeURIComponent(String(days))}`);
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { data?: WorkTimePunchRow[] };
  return Array.isArray(j.data) ? j.data : [];
}

/** Obtém batidas do servidor ou, em falha, a última cópia em cache para o utilizador. */
export async function fetchWorkTimePunchesWithLocalFallback(
  session: { id: string; tenantId: string } | null,
  days = 31
): Promise<WorkTimePunchRow[]> {
  try {
    const { readWorkTimePunchesCacheForUser, writeWorkTimePunchesCache } = await import('./workTimePunchesCache');
    let fresh: WorkTimePunchRow[] | null = null;
    try {
      fresh = await fetchWorkTimePunches(days);
    } catch {
      fresh = null;
    }
    if (fresh !== null) {
      try {
        await writeWorkTimePunchesCache(session, fresh);
      } catch {
        /* gravação best-effort */
      }
      return fresh;
    }
    const cached = await readWorkTimePunchesCacheForUser(session);
    return cached.length ? cached : [];
  } catch {
    return [];
  }
}
