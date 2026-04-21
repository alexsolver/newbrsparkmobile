/**
 * useConnectivity — estado "online" coerente para o app offline-first.
 *
 * 1) Sem transporte (Wi‑Fi/dados) → offline imediato.
 * 2) Caso contrário, ping leve em /api/config (servidor BrSpark acessível).
 *
 * Não usamos só `isInternetReachable`: no Android costuma atrasar ou dar falso negativo;
 * a fonte de verdade após haver interface é o fetch.
 *
 * iOS: o `NWPathMonitor` / expo-network tende a notificar mais tarde que o Android; por isso
 * usamos intervalo de sondagem mais curto, debounce menor e verificação imediata quando
 * `isConnected` volta a true (anel verde no header).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { API_BASE } from '../services/auth';

const NET_DEBOUNCE_MS_ANDROID = 400;
const NET_DEBOUNCE_MS_IOS = 120;
const FETCH_TIMEOUT_MS = Platform.OS === 'ios' ? 3200 : 4000;

function defaultPollIntervalMs(explicit?: number) {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  return Platform.OS === 'ios' ? 3500 : 10000;
}

export function useConnectivity(intervalMs?: number) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null); // null = not yet checked
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const netDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net?.isConnected === false) {
        setIsOnline(false);
        setLastChecked(new Date());
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ok = res.ok || res.status === 304;
      setIsOnline(ok);
    } catch (e: any) {
      setIsOnline(false);
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    const pollEvery = defaultPollIntervalMs(intervalMs);
    void check().catch(() => {});

    timerRef.current = setInterval(() => {
      void check().catch(() => {});
    }, pollEvery);

    const debounceMs =
      Platform.OS === 'ios' ? NET_DEBOUNCE_MS_IOS : NET_DEBOUNCE_MS_ANDROID;

    const scheduleCheckFromNet = (event: Network.NetworkStateEvent) => {
      try {
        const connected = event?.isConnected === true;
        if (Platform.OS === 'ios' && connected) {
          if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
          netDebounceRef.current = null;
          void check().catch(() => {});
          return;
        }
        if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
        netDebounceRef.current = setTimeout(() => {
          netDebounceRef.current = null;
          void check().catch(() => {});
        }, debounceMs);
      } catch (e) {
        console.warn('[useConnectivity] listener de rede:', e);
      }
    };

    const netSub = Network.addNetworkStateListener(scheduleCheckFromNet);

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void check().catch(() => {});
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
      netSub.remove();
      appSub.remove();
    };
  }, [intervalMs, check]);

  return { isOnline, lastChecked };
}
