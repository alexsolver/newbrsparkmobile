import * as Location from 'expo-location';
import { routeTracker } from '../services/routeTrackingService';
import { getGpsCapturePolicy } from '../services/gpsCapturePolicyStore';

export type ChecklistGpsWarmupHandle = { cancel: () => void };

const noop = () => {};

/**
 * Mantém um `watchPositionAsync` leve enquanto o checklist está em foco — ajuda o GNSS a fixar
 * antes de «Iniciar deslocamento» / capturas High. Não inicia se o route tracker já estiver ativo
 * (evita dois watches simultâneos durante o deslocamento). Encerra-se automaticamente quando o
 * `routeTracker` passa a ativo (ex.: após «Iniciar deslocamento»).
 */
export function startChecklistGpsWarmup(): ChecklistGpsWarmupHandle {
  let alive = true;
  let sub: Location.LocationSubscription | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const stopWarmupWatch = () => {
    sub?.remove();
    sub = null;
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  void (async () => {
    try {
      if (!getGpsCapturePolicy().warmupBalancedWhileChecklistFocused) return;
      if (routeTracker.isActive()) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive || status !== 'granted') return;
      const s = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 4000,
          distanceInterval: 25,
        },
        noop
      );
      if (!alive) {
        s.remove();
        return;
      }
      sub = s;
      pollTimer = setInterval(() => {
        if (!alive) return;
        if (routeTracker.isActive()) stopWarmupWatch();
      }, 1200);
    } catch {
      /* sem hardware / permissão revogada */
    }
  })();

  return {
    cancel: () => {
      alive = false;
      stopWarmupWatch();
    },
  };
}
