/**
 * RouteProgressBar — Opção D widget
 * Shows live route progress + deviation alert when route tracking is active.
 */
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { routeTracker, RouteUpdate } from '../../src/services/routeTrackingService';
import { Ionicons } from '@expo/vector-icons';

export default function RouteProgressBar() {
  const [update, setUpdate] = useState<RouteUpdate | null>(null);

  useEffect(() => {
    const handler = (u: RouteUpdate) => setUpdate(u);
    routeTracker.on('update', handler);
    return () => { routeTracker.off('update', handler); };
  }, []);

  if (!routeTracker.isActive() || !update || routeTracker.getRouteLength() < 2) return null;

  const isDeviation = update.event === 'ROUTE_DEVIATION';
  const isComplete  = update.event === 'ROUTE_COMPLETED';
  const color = isComplete ? '#16a34a' : isDeviation ? '#dc2626' : '#f97316';

  return (
    <View style={[styles.container, { borderColor: color + '40', backgroundColor: color + '12' }]}>
      {/* Header row */}
      <View style={styles.row}>
        {isComplete && <Ionicons name="flag" size={14} color={color} />}
        {isDeviation && <Ionicons name="warning" size={14} color={color} />}
        {!isComplete && !isDeviation && <Ionicons name="compass" size={14} color={color} />}
        <Text style={[styles.status, { color }]}>
          {isComplete
            ? 'Rota concluída!'
            : isDeviation
            ? `Desvio de rota · ${update.distanceFromRoute}m fora`
            : `No trajeto · ${update.progressPercent}% concluído`}
        </Text>
        <Text style={[styles.pct, { color }]}>{update.progressPercent}%</Text>
      </View>

      {/* Progress track */}
      <View style={styles.track}>
        <View style={[styles.fill, {
          width: `${update.progressPercent}%` as any,
          backgroundColor: color
        }]} />
        {/* Waypoint dots */}
        {[25, 50, 75].map(p => (
          <View key={p} style={[
            styles.waypoint,
            { left: `${p}%` as any },
            update.progressPercent >= p ? { backgroundColor: color } : {}
          ]} />
        ))}
      </View>

      {isDeviation && (
        <Text style={styles.alert}>
          Retorne ao trajeto definido para continuar.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginTop: 4,
    borderRadius: 10, borderWidth: 1, padding: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  status: { flex: 1, fontSize: 12, fontWeight: '600' },
  pct: { fontSize: 13, fontWeight: '800' },
  track: {
    height: 6, backgroundColor: '#e5e7eb', borderRadius: 3,
    overflow: 'visible', position: 'relative',
  },
  fill: { height: 6, borderRadius: 3, position: 'absolute', left: 0, top: 0 },
  waypoint: {
    position: 'absolute', top: -3,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#d1d5db',
    borderWidth: 2, borderColor: '#fff',
    marginLeft: -6,
  },
  alert: { fontSize: 10, color: '#dc2626', marginTop: 6, fontStyle: 'italic' },
});
