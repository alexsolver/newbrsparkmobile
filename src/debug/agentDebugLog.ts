import Constants from 'expo-constants';

const SESSION = '99a0d4';
const INGEST = '/ingest/2900a63a-2d40-4831-9026-3526ab938edc';

function expoLanHost(): string | null {
  try {
    const candidates: string[] = [];
    const c1 = Constants.expoConfig?.hostUri;
    if (c1) candidates.push(String(c1));
    const m = Constants.manifest as { debuggerHost?: string } | null | undefined;
    if (m?.debuggerHost) candidates.push(String(m.debuggerHost));
    const m2 = Constants.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | undefined;
    if (m2?.extra?.expoClient?.hostUri) candidates.push(String(m2.extra.expoClient.hostUri));
    for (const raw of candidates) {
      const host = raw.split(':')[0]?.trim();
      if (host && host !== '127.0.0.1' && host !== 'localhost') return host;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Sem PII: truncar URLs longas e remover query. */
export function safeUrlHint(u: string | null | undefined): string {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const x = s.split('?')[0];
    return x.length > 120 ? `${x.slice(0, 120)}…` : x;
  } catch {
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  }
}

/**
 * Debug session 99a0d4: ingest no Mac (simulador 127.0.0.1 + LAN para telemóvel na mesma Wi‑Fi)
 * e `console.warn` para Metro quando o ingest não chega (ex.: dados móveis).
 */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'pre',
): void {
  const payload = {
    sessionId: SESSION,
    location,
    message,
    data,
    timestamp: Date.now(),
    hypothesisId,
    runId,
  };
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Debug-Session-Id': SESSION,
  };
  fetch(`http://127.0.0.1:7247${INGEST}`, { method: 'POST', headers, body }).catch(() => {});
  const lan = expoLanHost();
  if (lan) {
    fetch(`http://${lan}:7247${INGEST}`, { method: 'POST', headers, body }).catch(() => {});
  }
  console.warn('[DBG-99a0d4]', hypothesisId, message, data);
}
