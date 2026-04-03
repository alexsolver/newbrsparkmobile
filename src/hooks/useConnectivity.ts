/**
 * useConnectivity — monitors server reachability for the BrSpark offline-first app.
 * 
 * Pings /api/config every 10 seconds (lightweight endpoint, no auth needed).
 * Returns: { isOnline: boolean, lastChecked: Date | null }
 */
import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../services/auth';

export function useConnectivity(intervalMs = 10000) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null); // null = not yet checked
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    try {
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
