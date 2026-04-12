/**
 * Indica se o GPS deve mostrar aura de aviso (amarelo) no avatar:
 * serviços de localização desligados, permissão negada ou sem fix (timeout).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

const POSITION_TIMEOUT_MS = 6500;
const RECHECK_INTERVAL_MS = 22000;

async function computeGpsIssue(): Promise<boolean> {
  try {
    const servicesOn = await Location.hasServicesEnabledAsync();
    if (!servicesOn) return true;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return true;

    try {
      await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('gps-timeout')), POSITION_TIMEOUT_MS);
        }),
      ]);
      return false;
    } catch {
      return true;
    }
  } catch {
    return true;
  }
}

export function useGpsAuraIssue(): boolean {
  const [gpsIssue, setGpsIssue] = useState<boolean | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const issue = await computeGpsIssue();
      setGpsIssue(issue);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => {});

    const onAppState = (s: AppStateStatus) => {
      if (s === 'active') void refresh().catch(() => {});
    };
    const sub = AppState.addEventListener('change', onAppState);
    const interval = setInterval(() => {
      void refresh().catch(() => {});
    }, RECHECK_INTERVAL_MS);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [refresh]);

  return gpsIssue === true;
}
