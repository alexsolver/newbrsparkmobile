/**
 * useConnectivity — estado «online» coerente para o app offline-first.
 *
 * 1) Sem transporte (Wi‑Fi/dados) ou internet explicitamente indisponível → offline.
 * 2) Caso contrário, ping leve em /api/config (servidor BrSpark acessível).
 */
import { useState, useEffect, useRef } from 'react';
import * as Network from 'expo-network';
import { API_BASE } from '../services/auth';

export function useConnectivity(intervalMs = 10000) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null); // null = not yet checked
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected === false) {
        setIsOnline(false);
        setLastChecked(new Date());
        return;
      }
      if (net.isInternetReachable === false) {
        setIsOnline(false);
        setLastChecked(new Date());
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setIsOnline(res.ok || res.status === 304);
    } catch {
      setIsOnline(false);
    } finally {
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    check(); // immediate first check
    timerRef.current = setInterval(check, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [intervalMs]);

  return { isOnline, lastChecked };
}
