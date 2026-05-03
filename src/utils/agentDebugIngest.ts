/**
 * Ingest NDJSON para o servidor de debug da sessão Cursor (porta 7819 no host de desenvolvimento).
 * `127.0.0.1` no telemóvel não é o Mac — usa o mesmo host LAN que `API_BASE`, host do Metro, ou `EXPO_PUBLIC_DEBUG_INGEST_HOST`.
 */
import Constants from 'expo-constants';
import { API_BASE } from '../services/appApiBase';

const INGEST_UUID = '2900a63a-2d40-4831-9026-3526ab938edc';
const SESSION_ID = 'd37eda';

function expoBundlerLanHost(): string | null {
  try {
    const raw =
      (Constants.expoConfig?.hostUri as string | undefined) ||
      (Constants.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | null)?.extra?.expoClient
        ?.hostUri ||
      ((Constants.manifest as { debuggerHost?: string } | null)?.debuggerHost as string | undefined);
    const host = raw?.split(':')[0]?.trim();
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;
    return host;
  } catch {
    return null;
  }
}

function apiBaseHost(): string | null {
  try {
    const base = String(API_BASE || '').trim();
    const u = new URL(base.includes('://') ? base : `http://${base}`);
    return u.hostname || null;
  } catch {
    return null;
  }
}

function isLikelyDevMachineOnLan(h: string): boolean {
  const x = h.toLowerCase();
  if (x === '10.0.2.2') return true;
  if (x === 'localhost' || x === '127.0.0.1') return true;
  if (x.startsWith('192.168.')) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(x)) return true;
  if (x.endsWith('.local')) return true;
  return false;
}

export function getAgentDebugIngestUrl(): string | null {
  const envHost = String(process.env.EXPO_PUBLIC_DEBUG_INGEST_HOST || '').trim();
  if (envHost) {
    const h = envHost.replace(/^https?:\/\//i, '').split(':')[0]?.trim();
    if (h) return `http://${h}:7819/ingest/${INGEST_UUID}`;
  }
  const apiH = apiBaseHost();
  if (apiH && isLikelyDevMachineOnLan(apiH)) {
    return `http://${apiH}:7819/ingest/${INGEST_UUID}`;
  }
  const lan = expoBundlerLanHost();
  if (lan) return `http://${lan}:7819/ingest/${INGEST_UUID}`;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return `http://127.0.0.1:7819/ingest/${INGEST_UUID}`;
  }
  return null;
}

export function agentDebugLog(entry: {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
  runId?: string;
}): void {
  const url = getAgentDebugIngestUrl();
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION_ID },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      timestamp: Date.now(),
      ...entry,
    }),
  }).catch(() => {});
}
