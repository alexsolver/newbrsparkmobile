/**
 * GeofenceStatusBar — Opção A
 * Persistent bar at the top of the checklist showing real-time geofence status.
 * Polls GPS every 15 seconds and classifies: inside / border / outside.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { evaluateCombinedGlobalFence } from './globalGeofenceCombined';

// ── Types ──────────────────────────────────────────────────────
interface TaskLocation {
  locationZoneType?: string | null; // 'radius' | 'polygon' | 'route' | 'combined'
  locationLat?: number | null;
  locationLng?: number | null;
  locationRadius?: number | null;
  locationPolygon?: number[][] | string | null;
  metadata?: { globalGeofence?: import('./globalGeofenceCombined').GlobalGeofenceMeta } | null;
}

interface Props {
  task: TaskLocation | null;
}

type GeoStatus = 'inside' | 'border' | 'outside' | 'unknown' | 'no_zone';

// ── Geo helpers ───────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Shortest distance from point to a polyline segment
function distanceToPolyline(lat: number, lng: number, route: number[][]): number {
  let minDist = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const [aLat, aLng] = route[i], [bLat, bLng] = route[i + 1];
    // Project point onto segment
    const dx = bLng - aLng, dy = bLat - aLat;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((lng - aLng) * dx + (lat - aLat) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const projLat = aLat + t * dy, projLng = aLng + t * dx;
    const d = haversine(lat, lng, projLat, projLng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Route progress: which fraction of the route the user has completed
function routeProgress(lat: number, lng: number, route: number[][]): number {
  let minDist = Infinity, closestIdx = 0;
  for (let i = 0; i < route.length; i++) {
    const d = haversine(lat, lng, route[i][0], route[i][1]);
    if (d < minDist) { minDist = d; closestIdx = i; }
  }
  return route.length > 1 ? closestIdx / (route.length - 1) : 0;
}

// ── Component ─────────────────────────────────────────────────
export default function GeofenceStatusBar({ task }: Props) {
  const [status, setStatus]     = useState<GeoStatus>('unknown');
  const [detail, setDetail]     = useState('Verificando posição...');
  const [progress, setProgress] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const check = async () => {
    try {
      if (!task) {
        setStatus('no_zone');
        setDetail('Sem zona definida nesta OS.');
        return;
      }

      const zoneType = task.locationZoneType;
      if (!zoneType || zoneType === 'none' || zoneType === 'route') {
        setStatus('no_zone');
        setDetail('Sem validação da barra (Gerido por outros cards)');
        return;
      }

      if (zoneType === 'combined') {
        const gf = task.metadata?.globalGeofence;
        if (!gf) {
          setStatus('unknown');
          setDetail('Cerca global: dados indisponíveis.');
          setProgress(null);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lng } = loc.coords;
        const r = evaluateCombinedGlobalFence(lat, lng, gf);
        setStatus(r.inside ? 'inside' : 'outside');
        setDetail(r.statusMsg);
        setProgress(null);
        return;
      }

      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('unknown');
        setDetail('Permissão de GPS negada.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;

      if (zoneType === 'radius') {
        const destLat = task.locationLat!;
        const destLng = task.locationLng!;
        if (destLat == null || destLng == null || !Number.isFinite(Number(destLat)) || !Number.isFinite(Number(destLng))) {
          setStatus('unknown');
          setDetail('Coordenadas do local não definidas no despacho.');
          setProgress(null);
          return;
        }
        const radius = task.locationRadius || 200;
        const dist = Math.round(haversine(lat, lng, Number(destLat), Number(destLng)));
        const borderZone = Math.round(radius * 0.2); // 20% of radius = border zone
        if (dist <= radius) {
          const s: GeoStatus = dist >= radius - borderZone ? 'border' : 'inside';
          setStatus(s);
          setDetail(`DENTRO: da área · ${dist}m do centro`);
        } else {
          setStatus('outside');
          setDetail(`FORA: da área · ${dist}m do local (raio: ${radius}m)`);
        }
        setProgress(null);
      } else if (zoneType === 'polygon') {
        const raw = task.locationPolygon;
        let polygon: number[][] = [];
        if (typeof raw === 'string') {
          try {
            const p = JSON.parse(raw);
            polygon = Array.isArray(p) ? p : [];
          } catch {
            polygon = [];
          }
        } else {
          polygon = (raw || []) as number[][];
        }
        const inside = polygon.length >= 3 ? pointInPolygon(lat, lng, polygon) : false;
        setStatus(inside ? 'inside' : 'outside');
        setDetail(
          polygon.length >= 3
            ? inside
              ? 'DENTRO: da área de serviço'
              : 'FORA: do polígono de serviço'
            : 'Polígono de serviço inválido ou vazio.',
        );
        setProgress(null);
      }
    } catch {
      setStatus('unknown');
      setDetail('GPS indisponível no momento.');
    }
  };

  useEffect(() => {
    void check().catch(() => {
      setStatus('unknown');
      setDetail('GPS indisponível no momento.');
    });
    const timer = setInterval(() => {
      void check().catch(() => {
        setStatus('unknown');
        setDetail('GPS indisponível no momento.');
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [task]);

  if (status === 'no_zone') return null;

  const colors: Record<GeoStatus, string> = {
    inside:  '#16a34a',
    border:  '#ca8a04',
    outside: '#dc2626',
    unknown: '#6b7280',
    no_zone: '#6b7280',
  };

  const bg = colors[status] + '18';
  const border = colors[status];
  const text = colors[status];

  return (
    <View style={[styles.bar, { backgroundColor: bg, borderColor: border }]}>
      <TouchableOpacity
        onPress={() => {
          setExpanded((e) => !e);
          void check().catch(() => {
            setStatus('unknown');
            setDetail('GPS indisponível no momento.');
          });
        }}
        activeOpacity={0.8}
      >
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: border }]} />
          <Text style={[styles.label, { color: text }]} numberOfLines={expanded ? 0 : 1}>{detail}</Text>
          <Text style={[styles.chevron, { color: text }]}>{expanded ? '▲' : '▼'}</Text>
        </View>

        {/* Route progress bar */}
        {progress !== null && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: border }]} />
          </View>
        )}

        {expanded && (
          <Text style={[styles.sub, { color: text }]}>
            Toque para atualizar · Atualiza a cada 15s
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    borderRadius: 10, borderWidth: 1, padding: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 12, fontWeight: '600' },
  chevron: { fontSize: 10 },
  progressTrack: {
    height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, marginTop: 6, overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  sub: { fontSize: 10, marginTop: 4, opacity: 0.7 },
});
