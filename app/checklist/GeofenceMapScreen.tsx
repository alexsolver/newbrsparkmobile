/**
 * GeofenceMapScreen — Opção B
 * Full-screen map confirmation shown BEFORE the technician starts the checklist.
 * Shows zone/route + live position. Pode bloquear início se fora + failMode='block' (exceto tipo **rota**: só aviso, nunca bloqueia).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Platform, Image,
  StyleSheet, Text, TouchableOpacity, View
} from 'react-native';
import MapView, { Circle, Marker, Polygon, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { getCurrentPositionWithGpsPolicy } from '../../src/lib/getCurrentPositionWithAccuracyFallback';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/theme/ThemeContext';
import { useResolvedAvatarUri } from '../../src/hooks/useResolvedAvatarUri';
import { evaluateCombinedGlobalFence, parsePolygonRaw } from './globalGeofenceCombined';
import GlobalGeofenceMapLayers from './GlobalGeofenceMapLayers';

interface TaskLocation {
  id?: string;
  title?: string;
  locationZoneType?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationRadius?: number | null;
  locationAddress?: string | null;
  locationPolygon?: number[][] | string | null;
  /** Destino de navegação explícito (ex.: ponto ≠ primeiro vértice do KML). */
  metadata?: {
    navigationDestination?: { kind?: string; lat?: number; lng?: number };
    globalGeofence?: import('./globalGeofenceCombined').GlobalGeofenceMeta;
  } | null;
}

interface Props {
  task: TaskLocation;
  failMode?: 'block' | 'warn';
  onProceed: () => void;
  onCancel: () => void;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
  const a = Math.sin(toRad(lat2-lat1)/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(toRad(lng2-lng1)/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function pointInPolygon(lat: number, lng: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length-1; i < poly.length; j = i++) {
    if ((poly[i][0] > lat) !== (poly[j][0] > lat) &&
        lng < ((poly[j][1]-poly[i][1])*(lat-poly[i][0])/(poly[j][0]-poly[i][0])+poly[i][1]))
      inside = !inside;
  }
  return inside;
}

function nearestRoutePoint(lat: number, lng: number, route: number[][]): number {
  let min = Infinity;
  for (let i = 0; i < route.length-1; i++) {
    const [aL, aG] = route[i], [bL, bG] = route[i+1];
    const dx = bG-aG, dy = bL-aL, len2 = dx*dx+dy*dy;
    let t = len2 > 0 ? ((lng-aG)*dx+(lat-aL)*dy)/len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = haversine(lat, lng, aL+t*dy, aG+t*dx);
    if (d < min) min = d;
  }
  return min;
}

export default function GeofenceMapScreen({ task, failMode = 'warn', onProceed, onCancel }: Props) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const avatarUri = useResolvedAvatarUri(user);
  const mapRef = useRef<MapView>(null);
  const [myPos, setMyPos]     = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState<'inside' | 'outside' | 'unknown'>('unknown');
  const [statusMsg, setStatusMsg] = useState(() => t('appAlerts.geofenceMap.gettingLocation'));
  const [distance, setDistance]   = useState<number | null>(null);

  const zoneType = task.locationZoneType;
  const polygon: number[][] = (() => {
    const raw = task.locationPolygon;
    if (!raw) return [];
    try { 
      let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; 
      if (Array.isArray(parsed)) {
          return parsed.map((pt: any) => {
              if (Array.isArray(pt)) return [parseFloat(pt[0]), parseFloat(pt[1])];
              return pt.lat !== undefined ? [parseFloat(pt.lat), parseFloat(pt.lng)] : pt;
          });
      }
      return [];
    } catch { return []; }
  })();

  const evaluate = useCallback((lat: number, lng: number) => {
    if (!zoneType || zoneType === 'none') {
      setStatus('inside'); setStatusMsg(t('appAlerts.geofenceMap.noRestriction')); return;
    }
    if (zoneType === 'combined') {
      const gfm = task.metadata?.globalGeofence;
      if (!gfm) {
        setStatus('unknown');
        setStatusMsg(t('appAlerts.geofenceMap.globalConfigUnavailable'));
        return;
      }
      const r = evaluateCombinedGlobalFence(lat, lng, gfm);
      setStatus(r.inside ? 'inside' : 'outside');
      setStatusMsg(r.statusMsg);
      setDistance(r.distanceDest ?? r.distanceGeom ?? null);
      return;
    }
    if (zoneType === 'radius') {
      const destLat = Number(task.locationLat);
      const destLng = Number(task.locationLng);
      const radiusRaw = Number(task.locationRadius);
      if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
        setStatus('unknown');
        setStatusMsg(t('appAlerts.geofenceMap.areaCoordsUnavailable'));
        return;
      }
      const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 200;
      const dest = { lat: destLat, lng: destLng };
      const dist = Math.round(haversine(lat, lng, dest.lat, dest.lng));
      setDistance(dist);
      if (dist <= radius) {
        setStatus('inside'); setStatusMsg(t('appAlerts.geofenceMap.insideRadius', { dist }));
      } else {
        setStatus('outside'); setStatusMsg(t('appAlerts.geofenceMap.outsideRadius', { dist, radius }));
      }
    } else if (zoneType === 'polygon') {
      const inside = pointInPolygon(lat, lng, polygon);
      setStatus(inside ? 'inside' : 'outside');
      setStatusMsg(inside ? t('appAlerts.geofenceMap.insidePolygonFull') : t('appAlerts.geofenceMap.outsidePolygonFull'));
    } else if (zoneType === 'route') {
      const dist = Math.round(nearestRoutePoint(lat, lng, polygon));
      setDistance(dist);
      const threshold = task.locationRadius || 100; // distância de desvio configurável
      if (dist <= threshold) {
        setStatus('inside'); setStatusMsg(t('appAlerts.geofenceMap.insideRoute', { dist }));
      } else {
        setStatus('outside');
        setStatusMsg(t('appAlerts.geofenceMap.outsideRouteWarn', { dist, thr: threshold }));
      }
    } else if (zoneType === 'segment') {
      if (polygon.length >= 2) {
        const distA = Math.round(haversine(lat, lng, polygon[0][0], polygon[0][1]));
        const distB = Math.round(haversine(lat, lng, polygon[1][0], polygon[1][1]));
        const dist = Math.min(distA, distB);
        setDistance(dist);
        const radius = task.locationRadius || 150;
        if (dist <= radius) {
          const end = distA < distB ? 'A' : 'B';
          setStatus('inside'); setStatusMsg(t('appAlerts.geofenceMap.insideSegmentEnd', { end, dist }));
        } else {
          setStatus('outside'); setStatusMsg(t('appAlerts.geofenceMap.outsideSegment', { dist, radius }));
        }
      }
    }
  }, [task, polygon, t, zoneType]);

  useEffect(() => {
    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') { setLoading(false); setStatus('unknown'); setStatusMsg(t('appAlerts.geofenceMap.gpsDeniedShort')); return; }
      const loc = await getCurrentPositionWithGpsPolicy();
      const { latitude: lat, longitude: lng } = loc.coords;
      setMyPos({ lat, lng });
      evaluate(lat, lng);
      setLoading(false);

      // Fit map to show both user and zone
      setTimeout(() => {
        if (!mapRef.current) return;
        const zt = task.locationZoneType;
        const gfm = task.metadata?.globalGeofence;
        if (zt === 'combined' && gfm) {
          const points: { latitude: number; longitude: number }[] = [{ latitude: lat, longitude: lng }];
          if (gfm.destination) {
            points.push({ latitude: gfm.destination.lat, longitude: gfm.destination.lng });
          }
          const gp = gfm.geometry ? parsePolygonRaw(gfm.geometry.locationPolygon) : [];
          for (const c of gp) {
            if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
              points.push({ latitude: c[0], longitude: c[1] });
            }
          }
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
            animated: true,
          });
          return;
        }
        const points =
          polygon.length > 0
            ? [...polygon.map((c) => ({ latitude: c[0], longitude: c[1] })), { latitude: lat, longitude: lng }]
            : [{ latitude: lat, longitude: lng }];
        const zoneLat = Number(task.locationLat);
        const zoneLng = Number(task.locationLng);
        if (Number.isFinite(zoneLat) && Number.isFinite(zoneLng)) {
          points.push({ latitude: zoneLat, longitude: zoneLng });
        }
        mapRef.current.fitToCoordinates(points, {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        });
      }, 500);
    })();
  }, [task, evaluate, t]);

  const openInMaps = () => {
    if (zoneType === 'combined') {
      const gfm = task.metadata?.globalGeofence;
      const gPoly = gfm?.geometry ? parsePolygonRaw(gfm.geometry.locationPolygon) : [];
      const gzt = String(gfm?.geometry?.zoneType || '').toLowerCase();
      if (gzt === 'segment' && gPoly.length >= 2) {
        Alert.alert(
          t('appAlerts.geofence.navigateTitle'),
          t('appAlerts.geofence.navigateSegmentBody'),
          [
            { text: t('appAlerts.geofence.segmentPointA'), onPress: () => openDestInMaps(gPoly[0][0], gPoly[0][1]) },
            { text: t('appAlerts.geofence.segmentPointB'), onPress: () => openDestInMaps(gPoly[1][0], gPoly[1][1]) },
            { text: t('appAlerts.home.mapPickerCancel'), style: 'cancel' },
          ],
        );
        return;
      }
      const nav = (task as TaskLocation).metadata?.navigationDestination;
      if (nav?.kind === 'point' && Number.isFinite(Number(nav.lat)) && Number.isFinite(Number(nav.lng))) {
        openDestInMaps(Number(nav.lat), Number(nav.lng));
        return;
      }
      if (gfm?.destination) {
        openDestInMaps(gfm.destination.lat, gfm.destination.lng);
        return;
      }
      if (gPoly.length > 0) {
        openDestInMaps(gPoly[0][0], gPoly[0][1]);
      }
      return;
    }

    // Caso seja Trecho, mostrar alerta para escolher Ponto A ou Ponto B
    if (zoneType === 'segment' && polygon.length >= 2) {
      Alert.alert(
        t('appAlerts.geofence.navigateTitle'),
        t('appAlerts.geofence.navigateSegmentBody'),
        [
          { text: t('appAlerts.geofence.segmentPointA'), onPress: () => openDestInMaps(polygon[0][0], polygon[0][1]) },
          { text: t('appAlerts.geofence.segmentPointB'), onPress: () => openDestInMaps(polygon[1][0], polygon[1][1]) },
          { text: t('appAlerts.home.mapPickerCancel'), style: 'cancel' },
        ],
      );
      return;
    }

    // Rota / polígono KML: navegar para o **destino** do despacho, não para o 1.º vértice do ficheiro.
    const nav = (task as TaskLocation).metadata?.navigationDestination;
    if (zoneType === 'route' || zoneType === 'polygon') {
      if (nav?.kind === 'point' && Number.isFinite(Number(nav.lat)) && Number.isFinite(Number(nav.lng))) {
        openDestInMaps(Number(nav.lat), Number(nav.lng));
        return;
      }
      const nlat = Number(task.locationLat);
      const nlng = Number(task.locationLng);
      if (Number.isFinite(nlat) && Number.isFinite(nlng)) {
        openDestInMaps(nlat, nlng);
        return;
      }
      if (polygon.length > 0) {
        openDestInMaps(polygon[0][0], polygon[0][1]);
      }
      return;
    }
    openDestInMaps(task.locationLat, task.locationLng);
  };

  const openDestInMaps = (targetLat?: number | null, targetLng?: number | null) => {
    const lat = Number(targetLat);
    const lng = Number(targetLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    
    const options: any[] = [
      { text: t('appAlerts.home.mapPickerWaze'), onPress: () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
      {
        text: t('appAlerts.home.mapPickerGoogle'),
        onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
      },
    ];

    if (Platform.OS === 'ios') {
      options.push({ text: t('appAlerts.home.mapPickerApple'), onPress: () => Linking.openURL(`maps://?daddr=${lat},${lng}`) });
      options.push({ text: t('appAlerts.home.mapPickerCancel'), style: 'cancel' });
      Alert.alert(t('appAlerts.geofence.navigateTitle'), t('appAlerts.geofence.navigateBody'), options);
    } else {
      Linking.openURL(`geo:0,0?q=${lat},${lng}(${t('appAlerts.home.mapAndroidGeoLabel')})`);
    }
  };

  const handleProceed = () => {
    // Rota (KML): nunca bloquear — o cartão já mostra FORA/DENTRO; deslocamento registre patrulha no relatório.
    if (zoneType === 'route') {
      onProceed();
      return;
    }
    if (status === 'outside' && failMode === 'block') {
      Alert.alert(t('appAlerts.geofence.blockedTitle'), t('appAlerts.geofence.blockedBodyPrefix') + statusMsg);
      return;
    }
    if (status === 'outside' && failMode === 'warn') {
      Alert.alert(t('common.attention'), statusMsg + t('appAlerts.geofence.evidenceSuffix'), [
        { text: t('appAlerts.home.mapPickerCancel'), style: 'cancel' },
        { text: t('appAlerts.geofence.proceedAnyway'), onPress: onProceed },
      ]);
      return;
    }
    onProceed();
  };

  const statusColor =
    status === 'inside'
      ? '#16a34a'
      : status === 'outside'
        ? zoneType === 'route'
          ? '#d97706'
          : '#dc2626'
        : '#6b7280';

  const gfm = task.metadata?.globalGeofence;
  const taskLat =
    zoneType === 'combined' && gfm?.destination
      ? Number(gfm.destination.lat)
      : Number(task.locationLat);
  const taskLng =
    zoneType === 'combined' && gfm?.destination
      ? Number(gfm.destination.lng)
      : Number(task.locationLng);
  const initialLat = Number.isFinite(taskLat) ? taskLat : myPos?.lat ?? -23.55;
  const initialLng = Number.isFinite(taskLng) ? taskLng : myPos?.lng ?? -46.63;

  // Map region defaults
  const initialRegion = {
    latitude: initialLat,
    longitude: initialLng,
    latitudeDelta: 0.01, longitudeDelta: 0.01,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {myPos && (
          <Marker
            coordinate={{ latitude: myPos.lat, longitude: myPos.lng }}
            title={t('appAlerts.liveRoute.mapMarkerYou')}
            zIndex={999}
          >
            <View style={styles.userMarkerOutline}>
              <View style={styles.userMarkerInner}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.userMarkerImage} />
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="person" size={18} color="#3b82f6" />
                  </View>
                )}
              </View>
            </View>
          </Marker>
        )}
        {zoneType === 'combined' && gfm ? (
          <GlobalGeofenceMapLayers
            gf={gfm}
            destMarkerTitle={String(task.title || '').trim() || t('appAlerts.checklist.transitMapWoDestinationFallback')}
          />
        ) : null}
        {/* Radius zone */}
        {zoneType !== 'combined' &&
          zoneType === 'radius' &&
          Number.isFinite(Number(task.locationLat)) &&
          Number.isFinite(Number(task.locationLng)) && (
          <>
            <Circle
              center={{ latitude: Number(task.locationLat), longitude: Number(task.locationLng) }}
              radius={task.locationRadius || 200}
              fillColor="rgba(59,130,246,0.12)"
              strokeColor="#3b82f6"
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: Number(task.locationLat), longitude: Number(task.locationLng) }}
              title={task.title || 'Local da OS'}
              pinColor="#3b82f6"
            />
          </>
        )}

        {/* Polygon zone */}
        {zoneType !== 'combined' && zoneType === 'polygon' && polygon.length >= 3 && (
          <Polygon
            coordinates={polygon.map(c => ({ latitude: c[0], longitude: c[1] }))}
            fillColor="rgba(59,130,246,0.12)"
            strokeColor="#3b82f6"
            strokeWidth={2}
          />
        )}

        {/* Route */}
        {zoneType !== 'combined' && zoneType === 'route' && polygon.length >= 2 && (
          <>
            <Polyline
              coordinates={polygon.map(c => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor={C.accent}
              strokeWidth={2}
              lineDashPattern={[8, 4]}
            />
            {/* Start and end markers */}
            <Marker
              coordinate={{ latitude: polygon[0][0], longitude: polygon[0][1] }}
              title={t('appAlerts.checklist.transitMapLegendStart')}
              pinColor="#16a34a"
            />
            <Marker
              coordinate={{
                latitude: polygon[polygon.length - 1][0],
                longitude: polygon[polygon.length - 1][1],
              }}
              title={t('appAlerts.checklist.transitMapMarkerEndDestination')}
            >
               <View style={{ width: 32, height: 32, backgroundColor: '#dc2626', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                 <FontAwesome5 name="flag-checkered" size={14} color="#fff" />
               </View>
            </Marker>
          </>
        )}

        {/* Segment zone */}
        {zoneType !== 'combined' && zoneType === 'segment' && polygon.length >= 2 && (
          <>
            <Polyline
              coordinates={[{ latitude: polygon[0][0], longitude: polygon[0][1] }, { latitude: polygon[1][0], longitude: polygon[1][1] }]}
              strokeColor="#9ca3af"
              strokeWidth={2}
              lineDashPattern={[5, 10]}
            />
            {/* Ponto A */}
            <Circle
              center={{ latitude: polygon[0][0], longitude: polygon[0][1] }}
              radius={task.locationRadius || 150}
              fillColor="rgba(37,99,235,0.12)"
              strokeColor="#2563eb"
              strokeWidth={2}
            />
            <Marker coordinate={{ latitude: polygon[0][0], longitude: polygon[0][1] }} title="Ponto A" pinColor="#2563eb" />
            
            {/* Ponto B */}
            <Circle
              center={{ latitude: polygon[1][0], longitude: polygon[1][1] }}
              radius={task.locationRadius || 150}
              fillColor="rgba(217,70,239,0.12)"
              strokeColor="#d946ef"
              strokeWidth={2}
            />
            <Marker coordinate={{ latitude: polygon[1][0], longitude: polygon[1][1] }} title="Ponto B" pinColor="#d946ef" />
          </>
        )}
      </MapView>

      {/* Status overlay */}
      <View style={[styles.statusCard, { borderColor: statusColor + '40' }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusTitle, { color: statusColor }]}>
            {loading ? 'Localizando...' : statusMsg}
          </Text>
          {task.locationAddress && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="location" size={12} color="#6b7280" />
              <Text style={[styles.address, { marginTop: 0, marginLeft: 3 }]} numberOfLines={1}>{task.locationAddress}</Text>
            </View>
          )}
        </View>
        {loading && <ActivityIndicator size="small" color={statusColor} />}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btnCancel} onPress={onCancel}>
          <Text style={styles.btnCancelText}>← Voltar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btnStart,
            {
              backgroundColor:
                status === 'outside' && failMode === 'block' && zoneType !== 'route'
                  ? '#9ca3af'
                  : C.accent,
            },
          ]}
          onPress={handleProceed}
        >
          <Text style={styles.btnStartText}>
            {status === 'outside' && failMode === 'block' && zoneType !== 'route'
              ? 'BLOQUEADO'
              : 'INICIAR OS'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { flex: 1 },
  statusCard: {
    position: 'absolute', top: 50, left: 16, right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12, borderWidth: 1,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { fontSize: 13, fontWeight: '700' },
  address: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  actions: {
    position: 'absolute', bottom: 40, left: 16, right: 16,
    flexDirection: 'row', gap: 10,
  },
  btnCancel: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  btnCancelText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  btnMaps: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  btnMapsText: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
  btnStart: {
    flex: 1, borderRadius: 10, padding: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  btnStartText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  userMarkerOutline: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  userMarkerInner: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', overflow: 'hidden' },
  userMarkerImage: { width: '100%', height: '100%', resizeMode: 'cover' }
});
