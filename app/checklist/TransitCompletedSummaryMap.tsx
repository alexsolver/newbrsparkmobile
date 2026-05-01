import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Dimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { formatDistance } from '../../src/i18n/formatters';

const MAP_HEIGHT = 200;
const MAX_POINTS = 500;

function dedupeConsecutiveLatLng(path: number[][]): number[][] {
  const out: number[][] = [];
  for (const p of path) {
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out;
}

function thinPathForMap(path: number[][], maxPts: number): number[][] {
  if (path.length <= maxPts) return path;
  const step = Math.ceil(path.length / maxPts);
  const out: number[][] = [];
  for (let i = 0; i < path.length; i += step) out.push(path[i]);
  const last = path[path.length - 1];
  const tail = out[out.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
  return out;
}

function projectPathToSvg(
  path: number[][],
  width: number,
  height: number,
  pad: number
): { d: string; sx: number; sy: number; ex: number; ey: number } | null {
  if (path.length < 2 || width < 24 || height < 24) return null;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const [la, ln] of path) {
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln);
    maxLng = Math.max(maxLng, ln);
  }
  const dLat = Math.max(maxLat - minLat, 1e-7);
  const dLng = Math.max(maxLng - minLng, 1e-7);
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const toX = (ln: number) => pad + ((ln - minLng) / dLng) * innerW;
  const toY = (la: number) => pad + ((maxLat - la) / dLat) * innerH;
  const pairs = path.map(([la, ln]) => `${toX(ln).toFixed(1)} ${toY(la).toFixed(1)}`);
  const d = `M ${pairs.join(' L ')}`;
  const [sla, sln] = path[0];
  const [ela, eln] = path[path.length - 1];
  return { d, sx: toX(sln), sy: toY(sla), ex: toX(eln), ey: toY(ela) };
}

function regionFromPath(path: number[][]): Region {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [la, ln] of path) {
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln);
    maxLng = Math.max(maxLng, ln);
  }
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latDelta = Math.max((maxLat - minLat) * 1.35, 0.0012);
  const lngDelta = Math.max((maxLng - minLng) * 1.35, 0.0012);
  return {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

function formatDurationBr(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${r}s`;
  return `${r}s`;
}

type Props = {
  /** [[lat, lng], …] — mínimo 2 pontos após normalização */
  pathLatLng: number[][];
  /** Rótulo de tempo já formatado, ou `null` para omitir */
  durationLabel?: string | null;
  /** Ex.: «12,34 km» */
  distanceLabel?: string | null;
};

/**
 * Resumo visual do trecho concluído: **SVG** (sempre visível dentro do scroll).
 * O `MapView` nativo costuma falhar em `ScrollView` / OS concluída (altura zero ou superfície em branco).
 */
export function TransitCompletedSummaryMap({
  pathLatLng,
  durationLabel,
  distanceLabel,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [canvasW, setCanvasW] = useState(() => Math.max(280, Dimensions.get('window').width - 72));
  const [mapReady, setMapReady] = useState(false);

  const path = useMemo(() => {
    const d = dedupeConsecutiveLatLng(pathLatLng);
    return thinPathForMap(d, MAX_POINTS);
  }, [pathLatLng]);

  const initialRegion = useMemo(() => regionFromPath(path), [path]);
  const mapCoords = useMemo(
    () => path.map(([latitude, longitude]) => ({ latitude, longitude })),
    [path]
  );

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 40 && Math.abs(w - canvasW) > 1) setCanvasW(w);
  };

  const svgModel = useMemo(
    () => projectPathToSvg(path, canvasW, MAP_HEIGHT, 14),
    [path, canvasW]
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current || mapCoords.length < 2) return;
    try {
      mapRef.current.fitToCoordinates(mapCoords, {
        edgePadding: { top: 36, right: 36, bottom: 36, left: 36 },
        animated: false,
      });
    } catch {
      /* fallback SVG cobre falhas de render */
    }
  }, [mapReady, mapCoords]);

  if (path.length < 2) return null;

  const showMetrics = !!(durationLabel && durationLabel.trim()) || !!(distanceLabel && distanceLabel.trim());

  return (
    <View style={styles.outer}>
      <Text style={styles.sectionTitle}>Percurso registado</Text>
      <Text style={styles.sectionHint}>Traço GPS capturado durante o deslocamento sobre mapa de ruas.</Text>
      {showMetrics ? (
        <View style={styles.metricsRow}>
          {durationLabel ? (
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>Tempo</Text>
              <Text style={styles.chipValue}>{durationLabel}</Text>
            </View>
          ) : null}
          {distanceLabel ? (
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>Distância</Text>
              <Text style={styles.chipValue}>{distanceLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.mapShell} collapsable={false} onLayout={onCanvasLayout}>
        <MapView
          ref={mapRef}
          style={{ width: canvasW, height: MAP_HEIGHT }}
          initialRegion={initialRegion}
          mapType="standard"
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          zoomControlEnabled={false}
          moveOnMarkerPress={false}
          scrollEnabled={false}
          zoomEnabled={false}
          onMapReady={() => setMapReady(true)}
        >
          <Polyline
            coordinates={mapCoords}
            strokeColor="#0284c7"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
          <Marker coordinate={mapCoords[0]} title="Início" pinColor="#16a34a" tracksViewChanges={false} />
          <Marker
            coordinate={mapCoords[mapCoords.length - 1]}
            title="Fim"
            pinColor="#dc2626"
            tracksViewChanges={false}
          />
        </MapView>
        {!mapReady && svgModel ? (
          <View style={styles.mapOverlayFallback} pointerEvents="none">
            <Svg width={canvasW} height={MAP_HEIGHT} viewBox={`0 0 ${canvasW} ${MAP_HEIGHT}`}>
              <Path
                d={svgModel.d}
                fill="none"
                stroke="#0284c7"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="10 7"
              />
              <Circle cx={svgModel.sx} cy={svgModel.sy} r={7} fill="#16a34a" stroke="#fff" strokeWidth={2} />
              <Circle cx={svgModel.ex} cy={svgModel.ey} r={7} fill="#dc2626" stroke="#fff" strokeWidth={2} />
            </Svg>
          </View>
        ) : null}
        {!mapReady && !svgModel ? (
          <View style={[styles.mapFallback, { width: canvasW, height: MAP_HEIGHT }]}>
            <Text style={styles.fallbackText}>Não foi possível desenhar o traço neste ecrã.</Text>
          </View>
        ) : null}
        <View style={styles.legendRow} pointerEvents="none">
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#16a34a' }]} />
            <Text style={styles.legendTxt}>Início</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
            <Text style={styles.legendTxt}>Fim</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Helpers para a tela do checklist (export reutilizável). */
export function transitActualMetricsLabels(am: {
  durationSeconds?: number;
  distanceMeters?: number;
}): { durationLabel: string | null; distanceLabel: string | null } {
  let durationLabel: string | null = null;
  let distanceLabel: string | null = null;
  if (am.durationSeconds != null && Number.isFinite(am.durationSeconds) && am.durationSeconds >= 0) {
    durationLabel = formatDurationBr(am.durationSeconds);
  }
  if (am.distanceMeters != null && Number.isFinite(am.distanceMeters) && am.distanceMeters >= 0) {
    distanceLabel = formatDistance(am.distanceMeters / 1000);
  }
  return { durationLabel, distanceLabel };
}

const styles = StyleSheet.create({
  outer: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0c4a6e',
  },
  mapShell: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
    position: 'relative',
  },
  mapFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(226,232,240,0.9)',
  },
  mapOverlayFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fallbackText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  legendRow: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
});
