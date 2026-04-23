import { Platform } from 'react-native';

const INGEST_PATH = '/ingest/2900a63a-2d40-4831-9026-3526ab938edc';

/** Em Android emulator, 127.0.0.1 é o próprio emulador — o host do Metro/Cursor fica em 10.0.2.2. */
export function agentDebugIngestUrl(): string {
  if (!__DEV__) return `http://127.0.0.1:7247${INGEST_PATH}`;
  if (Platform.OS === 'android') return `http://10.0.2.2:7247${INGEST_PATH}`;
  return `http://127.0.0.1:7247${INGEST_PATH}`;
}

export function agentDebugPost(body: Record<string, unknown>): void {
  void fetch(agentDebugIngestUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '98653d' },
    body: JSON.stringify(body),
  }).catch(() => {});
}
