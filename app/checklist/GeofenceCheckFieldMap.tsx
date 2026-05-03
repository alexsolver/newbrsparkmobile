/**
 * Mapa compacto no campo «Validar cerca»: zona do despacho + posição do técnico.
 * Alinhado à lógica de `computeGeofenceCheckInside` em `app/checklist/[id].tsx`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Dimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import GlobalGeofenceMapLayers from './GlobalGeofenceMapLayers';
import { parsePolygonRaw, type GlobalGeofenceMeta } from './globalGeofenceCombined';

const MAP_HEIGHT = 196;

function buildGeofenceCheckPreviewMeta(geoField: any, taskLocation: any): GlobalGeofenceMeta | null {
  if (!taskLocation || typeof taskLocation !== 'object') return null;

  const fieldMode = String(geoField?.geofenceType || 'radius').toLowerCase();
  const fieldRadius = parseInt(String(geoField?.geofenceRadius), 10) || 150;
  const geomTol = parseInt(String(geoField?.geofenceGeometryToleranceM), 10) || fieldRadius;
  const segBuf = parseInt(String(geoField?.geofenceSegmentBufferM), 10) || geomTol;

  const polyRaw = taskLocation?.locationPolygon;
  let polygon: number[][] = [];
  if (polyRaw) {
    try {
      const p = typeof polyRaw === 'string' ? JSON.parse(polyRaw) : polyRaw;
      polygon = Array.isArray(p) ? p : [];
    } catch {
      polygon = [];
    }
  }
  const taskZt = String(taskLocation?.locationZoneType || '').toLowerCase();
  const taskDestLat = Number(taskLocation?.locationLat);
  const taskDestLng = Number(taskLocation?.locationLng);
  const hasTaskPoint = Number.isFinite(taskDestLat) && Number.isFinite(taskDestLng);
  const taskTolRaw = Number(taskLocation?.locationRadius);
  const taskTol = Number.isFinite(taskTolRaw) && taskTolRaw > 0 ? taskTolRaw : NaN;

  if (fieldMode === 'radius') {
    if (!hasTaskPoint) return null;
    const effectiveRadius = Number.isFinite(taskTol) ? taskTol : fieldRadius;
    return {
      destination: { lat: taskDestLat, lng: taskDestLng },
      destinationRadiusM: effectiveRadius,
      geometry: null,
    };
  }

  if (!polygon.length) {
    if (!hasTaskPoint) return null;
    const effectiveRadius = Number.isFinite(taskTol) ? taskTol : geomTol;
    return {
      destination: { lat: taskDestLat, lng: taskDestLng },
      destinationRadiusM: effectiveRadius,
      geometry: null,
    };
  }

  const rForGeom =
    Number.isFinite(taskTol) && taskTol > 0 ? taskTol : taskZt === 'route' ? geomTol : taskZt === 'segment' ? segBuf : geomTol;

  let zoneForGeom = taskZt;
  if (taskZt === 'polygon' && polygon.length >= 3) zoneForGeom = 'polygon';
  else if (taskZt === 'route' && polygon.length >= 2) zoneForGeom = 'route';
  else if (taskZt === 'segment' && polygon.length >= 2) zoneForGeom = 'segment';
  else if (polygon.length >= 3) zoneForGeom = 'polygon';
  else if (polygon.length >= 2) zoneForGeom = 'route';
  else {
    if (!hasTaskPoint) return null;
    const effectiveRadius = Number.isFinite(taskTol) ? taskTol : geomTol;
    return {
      destination: { lat: taskDestLat, lng: taskDestLng },
      destinationRadiusM: effectiveRadius,
      geometry: null,
    };
  }

  const geometry = {
    zoneType: zoneForGeom,
    locationLat: taskLocation?.locationLat,
    locationLng: taskLocation?.locationLng,
    locationRadius: rForGeom,
    locationPolygon: polygon,
  };

  const usePolygonalFence =
    zoneForGeom === 'polygon' || zoneForGeom === 'route' || zoneForGeom === 'segment';

  if (usePolygonalFence) {
    return {
      destination: null,
      destinationRadiusM: fieldRadius,
      geometry,
    };
  }

  if (!hasTaskPoint) {
    return { destination: null, destinationRadiusM: fieldRadius, geometry };
  }
  const effectiveRadius = Number.isFinite(taskTol) ? taskTol : fieldRadius;
  return {
    destination: { lat: taskDestLat, lng: taskDestLng },
    destinationRadiusM: effectiveRadius,
    geometry,
  };
}

function cardinalRing(lat: number, lng: number, radiusM: number): { latitude: number; longitude: number }[] {
  const R = 6378137;
  const toDeg = 180 / Math.PI;
  const dLat = (radiusM / R) * toDeg;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng = cosLat > 1e-6 ? ((radiusM / R) * toDeg) / cosLat : dLat;
  return [
    { latitude: lat + dLat, longitude: lng },
    { latitude: lat - dLat, longitude: lng },
    { latitude: lat, longitude: lng + dLng },
    { latitude: lat, longitude: lng - dLng },
  ];
}

function parseUserFromSaved(json: string): { lat: number; lng: number } | null {
  try {
    const o = JSON.parse(json);
    const la = Number(o?.coordinates?.lat);
    const ln = Number(o?.coordinates?.lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
  } catch {
    /* ignore */
  }
  return null;
}

function collectFitCoordinates(gf: GlobalGeofenceMeta, user: { lat: number; lng: number } | null) {
  const pts: { latitude: number; longitude: number }[] = [];
  const add = (latitude: number, longitude: number) => {
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      pts.push({ latitude, longitude });
    }
  };

  if (gf.destination) {
    add(gf.destination.lat, gf.destination.lng);
    for (const c of cardinalRing(gf.destination.lat, gf.destination.lng, gf.destinationRadiusM)) {
      add(c.latitude, c.longitude);
    }
  }

  if (gf.geometry) {
    const poly = parsePolygonRaw(gf.geometry.locationPolygon);
    const zt = String(gf.geometry.zoneType || '').toLowerCase();
    const rGeom =
      gf.geometry.locationRadius != null && Number.isFinite(Number(gf.geometry.locationRadius))
        ? Number(gf.geometry.locationRadius)
        : gf.destinationRadiusM;
    const maxV = 72;
    const step = poly.length > maxV ? Math.ceil(poly.length / maxV) : 1;
    for (let i = 0; i < poly.length; i += step) {
      add(poly[i][0], poly[i][1]);
    }
    if (poly.length > 0) {
      const last = poly[poly.length - 1];
      const tail = pts[pts.length - 1];
      if (!tail || tail.latitude !== last[0] || tail.longitude !== last[1]) {
        add(last[0], last[1]);
      }
    }
    if (zt === 'segment' && poly.length >= 2 && Number.isFinite(rGeom) && rGeom > 0) {
      for (const c of cardinalRing(poly[0][0], poly[0][1], rGeom)) add(c.latitude, c.longitude);
      for (const c of cardinalRing(poly[1][0], poly[1][1], rGeom)) add(c.latitude, c.longitude);
    }
  }

  if (user) add(user.lat, user.lng);

  if (pts.length === 1) {
    const p = pts[0];
    add(p.latitude + 0.00035, p.longitude + 0.00035);
  }
  return pts;
}

type Props = {
  geoField: any;
  task: any | null | undefined;
  /** Valor JSON gravado no campo (evidência), para mostrar o pin da última captura em modo leitura. */
  savedValueJson: string;
  /** Se falso, só pin a partir de `savedValueJson`. */
  liveGps?: boolean;
  primaryColor: string;
};

export default function GeofenceCheckFieldMap({
  geoField,
  task,
  savedValueJson,
  liveGps = true,
  primaryColor,
}: Props) {
  const { t } = useTranslation();
  const mapRef = useRef<React.ElementRef<typeof MapView> | null>(null);
  const [canvasW, setCanvasW] = useState(() => Math.max(260, Dimensions.get('window').width - 88));
  const [mapReady, setMapReady] = useState(false);
  const [livePos, setLivePos] = useState<{ lat: number; lng: number } | null>(null);
  const [permDenied, setPermDenied] = useState(false);

  const gf = useMemo(() => buildGeofenceCheckPreviewMeta(geoField, task), [geoField, task]);
  const savedPos = useMemo(() => parseUserFromSaved(savedValueJson || ''), [savedValueJson]);

  const userPin = liveGps ? livePos ?? savedPos : savedPos;

  const initialRegion = useMemo(() => {
    if (!gf) {
      return { latitude: -15.78, longitude: -47.93, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    }
    const pts = collectFitCoordinates(gf, userPin);
    if (pts.length === 0) {
      return { latitude: -15.78, longitude: -47.93, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    }
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of pts) {
      minLat = Math.min(minLat, p.latitude);
      maxLat = Math.max(maxLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLng = Math.max(maxLng, p.longitude);
    }
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    let latDelta = Math.max((maxLat - minLat) * 1.45, 0.0018);
    let lngDelta = Math.max((maxLng - minLng) * 1.45, 0.0018);
    const cap = 1.2;
    latDelta = Math.min(latDelta, cap);
    lngDelta = Math.min(lngDelta, cap);
    return { latitude: centerLat, longitude: centerLng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
  }, [gf, userPin]);

  const refit = useCallback(() => {
    if (!mapReady || !mapRef.current || !gf) return;
    const coords = collectFitCoordinates(gf, userPin);
    if (coords.length < 1) return;
    try {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
        animated: true,
      });
    } catch {
      /* ignore */
    }
  }, [gf, mapReady, userPin]);

  useEffect(() => {
    refit();
  }, [refit]);

  useEffect(() => {
    if (!liveGps) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setPermDenied(true);
          return;
        }
        if (!cancelled) setPermDenied(false);
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setLivePos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {
        /* ignore */
      }
    };

    void tick();
    interval = setInterval(tick, 12000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [liveGps]);

  const onShellLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 40 && Math.abs(w - canvasW) > 1) setCanvasW(w);
  };

  if (!gf) {
    return (
      <View style={styles.noZone}>
        <Ionicons name="map-outline" size={22} color="#94a3b8" />
        <Text style={styles.noZoneText}>
          Zona de serviço indisponível no despacho — o mapa será preenchido quando a OS tiver local ou geometria.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {permDenied && liveGps ? (
        <Text style={styles.banner}>Ative a permissão de localização para ver o seu pin no mapa.</Text>
      ) : null}
      {!userPin && liveGps && !permDenied ? (
        <Text style={styles.hint}>{t('appAlerts.liveRoute.geofenceCheckGettingPosition')}</Text>
      ) : null}
      <View style={styles.mapShell} collapsable={false} onLayout={onShellLayout}>
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
          <GlobalGeofenceMapLayers gf={gf} destMarkerTitle={t('appAlerts.liveRoute.geofenceCheckServiceZoneMarker')} />
          {userPin ? (
            <Marker
              coordinate={{ latitude: userPin.lat, longitude: userPin.lng }}
              title={t('appAlerts.liveRoute.mapMarkerYourPosition')}
              tracksViewChanges={false}
            >
              <View style={[styles.userBubble, { borderColor: primaryColor }]}>
                <Ionicons name="person" size={14} color={primaryColor} />
              </View>
            </Marker>
          ) : null}
        </MapView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  mapShell: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  banner: {
    fontSize: 12,
    color: '#b45309',
    marginBottom: 8,
    lineHeight: 17,
  },
  noZone: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noZoneText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 17 },
  userBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
