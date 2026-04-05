/**
 * Ao ir para background: HEARTBEAT (não SESSION_CLOSE) + tentativa de flush da telemetria.
 * O SO limita execução em segundo plano; não garantimos envio completo.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { dataCollectionService } from './dataCollectionService';
import { pushTelemetryBatch } from './syncService';

export function startAppStateTelemetryBridge(): () => void {
  let last: AppStateStatus = AppState.currentState;

  const sub = AppState.addEventListener('change', (next) => {
    const wasActive = last === 'active';
    last = next;
    if (!wasActive || next !== 'background') return;
    void (async () => {
      try {
        await dataCollectionService.recordEvent('HEARTBEAT', { appBackground: true });
        await pushTelemetryBatch();
      } catch (e) {
        console.warn('[AppState] telemetria em background:', e);
      }
    })();
  });

  return () => sub.remove();
}
