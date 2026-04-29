/**
 * Debug push (sessão Cursor): POST para o ingest local + console.
 * Em dispositivo físico com build de loja, o ingest só funciona se o Metro indicar IP acessível (__DEV__).
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const SESSION_ID = '63633b';
const INGEST = '/ingest/2900a63a-2d40-4831-9026-3526ab938edc';

function ingestBaseUrls(): string[] {
  const out: string[] = [];
  out.push(`http://127.0.0.1:7819${INGEST}`);
  if (Platform.OS === 'android') {
    out.push(`http://10.0.2.2:7819${INGEST}`);
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri === 'string' && hostUri.length > 0) {
    const host = hostUri.split(':')[0];
    if (host && /^[\d.]+$/.test(host)) {
      out.push(`http://${host}:7819${INGEST}`);
    }
  }
  return [...new Set(out)];
}

export function agentPushDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  const line = {
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    ...payload,
  };
  try {
    // eslint-disable-next-line no-console
    console.warn('[BRSPARK_PUSH_DEBUG]', JSON.stringify(line));
  } catch {
    /* ignore */
  }
  const body = JSON.stringify(line);
  for (const base of ingestBaseUrls()) {
    fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': SESSION_ID,
      },
      body,
    }).catch(() => {});
  }
}
