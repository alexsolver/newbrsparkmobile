import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated, StyleSheet, Text, TouchableOpacity, View, Easing, Modal, Dimensions, Image, ScrollView,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { routeTracker, RouteUpdate } from '../../src/services/routeTrackingService';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useResolvedAvatarUri } from '../../src/hooks/useResolvedAvatarUri';
import { Alert, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiFetch } from '../../src/services/api';
import { enqueueTrackingSync } from '../../src/services/trackingSyncQueue';
import { fetchDrivingLegEtaMinutes, fetchDrivingGeometryLatLng } from '../../src/services/osrmClient';

/**
 * Android: `react-native-maps` usa Google Maps e precisa de API key no manifest.
 * Se o bundle Expo não tiver `android.config.googleMaps.apiKey`, o mapa nativo costuma fechar o app.
 * Neste caso usamos painel sem MapView; navegação = apps externos (Waze / Google Maps via URL).
 *
 * `EXPO_PUBLIC_FORCE_TRANSIT_SIMPLE_MAP=1` força sempre o modo simples (útil em testes).
 */
function shouldEmbedNativeTransitMap(): boolean {
  if (Platform.OS !== 'android') return true;
  if (process.env.EXPO_PUBLIC_FORCE_TRANSIT_SIMPLE_MAP === '1') return false;
  const k = (Constants.expoConfig as { android?: { config?: { googleMaps?: { apiKey?: string } } } })
    ?.android?.config?.googleMaps?.apiKey;
  return typeof k === 'string' && k.trim().length >= 20;
}

interface Props {
  route: number[][];      // [[lat,lng], ...]
  visible: boolean;       // set true when transit_start is pressed
  zoneType?: string | null;
  /** Destino explícito; pode omitir se `route` tiver pontos (o mapa usa o último vértice). */
  targetLoc?: { lat?: number | null; lng?: number | null };
  etaMinutes?: number | null;
  onEndTransit?: () => void;
  taskId?: string | null;
}

/** Destino OSRM: target explícito ou último vértice da rota (evita lista vazia só com polígono) */
export function pickDestinationForOsrm(
  targetLoc: Props['targetLoc'],
  route: number[][]
): { lat: number; lng: number } | null {
  const tlat = targetLoc?.lat;
  const tlng = targetLoc?.lng;
  if (
    tlat != null &&
    tlng != null &&
    Number.isFinite(Number(tlat)) &&
    Number.isFinite(Number(tlng))
  ) {
    return { lat: Number(tlat), lng: Number(tlng) };
  }
  if (Array.isArray(route) && route.length >= 1) {
    const last = route[route.length - 1];
    if (Array.isArray(last) && last.length >= 2) {
      const a = Number(last[0]);
      const b = Number(last[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) return { lat: a, lng: b };
    }
  }
  return null;
}

// ─── ETA Badge — Premium floating map overlay ─────────────────────────────────────────
function EtaBadge({
  etaMinutes,
  pct,
  hint,
}: {
  etaMinutes: number | null | undefined;
  pct: number;
  hint?: string | null;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const hasNum = typeof etaMinutes === 'number' && Number.isFinite(etaMinutes);
  const waiting = !hasNum;
  let timeStr = 'Calculando...';
  if (hasNum) {
    const hours = Math.floor(etaMinutes as number / 60);
    const mins = (etaMinutes as number) % 60;
    timeStr = hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim() : `${etaMinutes} min`;
  } else if (hint) {
    timeStr = hint;
  }

  return (
    <View style={etaStyles.wrapper} pointerEvents="none">
      <LinearGradient
        colors={['#f97316', '#ea580c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={etaStyles.gradient}
      >
        {/* Top Row: live dot + label */}
        <View style={etaStyles.topRow}>
          <View style={etaStyles.dotWrapper}>
            <Animated.View style={[etaStyles.pulseDot, { transform: [{ scale: pulse }] }]} />
            <View style={etaStyles.dot} />
          </View>
          <Text style={etaStyles.label}>EM ROTA</Text>
          <Ionicons name="navigate" size={9} color="rgba(255,255,255,0.7)" style={{ marginLeft: 2 }} />
        </View>

        {/* Main time display */}
        <Text style={etaStyles.time}>{timeStr}</Text>

        {!waiting && <Text style={etaStyles.sub}>tempo estimado de chegada</Text>}

        {/* Progress bar if we have route data */}
        {pct > 0 && (
          <View style={etaStyles.progressTrack}>
            <View style={[etaStyles.progressFill, { width: `${Math.max(pct, 5)}%` as any }]} />
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const etaStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 185,
    left: 16,
    zIndex: 20,
    borderRadius: 14,
    shadowColor: '#f97316',
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  gradient: {
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 8,
    borderRadius: 14,
    minWidth: 112,
    maxWidth: 220,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  dotWrapper: {
    width: 10, height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  dot: {
    width: 5, height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
    position: 'absolute',
  },
  pulseDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    position: 'absolute',
  },
  label: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  sub: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginTop: 1,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    marginTop: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
});
// ─────────────────────────────────────────────────────────────────────────────

const { width, height } = Dimensions.get('window');

export default function LiveRouteMapCard({ route, visible, zoneType, targetLoc, etaMinutes, onEndTransit, taskId }: Props) {
  const embedNativeMap = useMemo(() => shouldEmbedNativeTransitMap(), []);
  const mapRef = useRef<MapView>(null);
  const [update, setUpdate]           = useState<RouteUpdate | null>(null);
  const [myPos, setMyPos]             = useState<{ lat: number; lng: number } | null>(null);
  const [expanded, setExpanded]       = useState(true);
  const [coveredPath, setCoveredPath] = useState<number[][]>([]);
  const [dynamicRoute, setDynamicRoute] = useState<number[][] | null>(null);
  const { user } = useAuth();
  const avatarUri = useResolvedAvatarUri(user);

  const [isPaused, setIsPaused] = useState(false);
  const [clientEtaMinutes, setClientEtaMinutes] = useState<number | null>(null);
  const [etaHint, setEtaHint] = useState<string | null>(null);

  /** Refs: o efeito do ETA não pode depender de myPos/update — cada GPS reiniciava o efeito e abortava o fetch OSRM. */
  const myPosRef = useRef(myPos);
  const updateRef = useRef(update);
  myPosRef.current = myPos;
  updateRef.current = update;

  // Subscribe to route tracker updates
  useEffect(() => {
    if (!visible) return;

    if (!routeTracker.isActive() || routeTracker.getRouteLength() !== route.length) {
       routeTracker.start(route, 100).catch(() => {});
    }

    const handler = (u: RouteUpdate) => {
      setUpdate(u);
      setMyPos({ lat: u.currentLat, lng: u.currentLng });
      if (embedNativeMap) {
        mapRef.current?.animateCamera(
          { center: { latitude: u.currentLat, longitude: u.currentLng }, zoom: 16 },
          { duration: 800 }
        );
      }
    };

    const statusHandler = ({ status }: any) => {
      setIsPaused(status === 'PAUSED');
    };

    const traversedHandler = (coords: number[][]) => {
      setCoveredPath(coords);
    };

    routeTracker.on('update', handler);
    routeTracker.on('status_changed', statusHandler);
    routeTracker.on('traversed_update', traversedHandler);

    setIsPaused(routeTracker.isPaused());
    
    // Initialize coveredPath if resuming
    setCoveredPath(routeTracker.getTraversedPath());

    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(loc => setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude }))
      .catch(() => {});

    return () => {
      routeTracker.off('update', handler);
      routeTracker.off('status_changed', statusHandler);
      routeTracker.off('traversed_update', traversedHandler);
    };
  }, [visible, route, embedNativeMap]);

  // Linha no mapa: polilinha do template (≥2 pontos) OU reta OSRM + upgrade para geometria real.
  // Destino = mesmo critério do ETA (pickDestinationForOsrm), não só targetLoc — senão falha quando o pai manda lat/lng indefinidos mas há pontos na rota.
  const routeDestKey =
    route?.length && route.length > 0
      ? `${route[route.length - 1][0]},${route[route.length - 1][1]}`
      : '';

  useEffect(() => {
    if (!visible) {
      setDynamicRoute(null);
      return;
    }
    // Sempre pedir geometria OSRM (GPS → destino): templates com ≥3 vértices em linha quase reta
    // não traziam pedido nenhum e o mapa ficava só com a polilinha “admin”.
    const dest = pickDestinationForOsrm(targetLoc, route);
    if (!dest) return;

    let cancelled = false;
    let osrmGeometryOk = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const attempt = async () => {
      if (cancelled || osrmGeometryOk) return;
      // Mesma origem que o ETA (routeTracker pode ter GPS antes do setState em myPos).
      let oLat = myPosRef.current?.lat ?? updateRef.current?.currentLat;
      let oLng = myPosRef.current?.lng ?? updateRef.current?.currentLng;
      if (oLat == null || oLng == null) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          oLat = pos.coords.latitude;
          oLng = pos.coords.longitude;
        } catch {
          return;
        }
      }
      if (cancelled) return;
      const dLat = dest.lat;
      const dLng = dest.lng;
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;

      const straight: number[][] = [
        [oLat, oLng],
        [dLat, dLng],
      ];
      // Com template denso, não mostrar reta de fallback por cima — só polilinha OSRM ou o laranja do template.
      if (!cancelled && (!route || route.length <= 2)) {
        setDynamicRoute(straight);
      }

      const line = await fetchDrivingGeometryLatLng(oLat, oLng, dLat, dLng);
      if (cancelled) return;
      if (line && line.length >= 2) {
        osrmGeometryOk = true;
        setDynamicRoute(line);
        if (intervalId) clearInterval(intervalId);
      } else if (!cancelled && route && route.length > 2) {
        setDynamicRoute(null);
      } else if (!cancelled && (!route || route.length <= 2)) {
        setDynamicRoute(straight);
      }
    };

    void attempt();
    intervalId = setInterval(() => void attempt(), 12000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [visible, route?.length, routeDestKey, targetLoc?.lat, targetLoc?.lng]);

  // Encaixa rota + utilizador no ecrã (initialRegion sozinho cortava linhas longas).
  useEffect(() => {
    if (!embedNativeMap || !expanded) return;
    const pts: { latitude: number; longitude: number }[] = [];
    const pushRing = (ring: number[][]) => {
      for (const c of ring) {
        if (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
          pts.push({ latitude: c[0], longitude: c[1] });
        }
      }
    };
    if (dynamicRoute && dynamicRoute.length >= 2) pushRing(dynamicRoute);
    else if (route && route.length >= 2) pushRing(route);
    if (myPos) pts.push({ latitude: myPos.lat, longitude: myPos.lng });
    if (pts.length < 2) return;

    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 130, right: 36, bottom: 240, left: 36 },
        animated: true,
      });
    }, 450);
    return () => clearTimeout(t);
  }, [embedNativeMap, expanded, dynamicRoute, route, myPos?.lat, myPos?.lng]);

  const osrmDest = useMemo(
    () => pickDestinationForOsrm(targetLoc, route),
    [
      targetLoc?.lat,
      targetLoc?.lng,
      route?.length,
      route?.length ? route[route.length - 1]?.[0] : null,
      route?.length ? route[route.length - 1]?.[1] : null,
    ]
  );

  const parentHasFiniteEta = typeof etaMinutes === 'number' && Number.isFinite(etaMinutes);

  useEffect(() => {
    if (!visible) {
      setClientEtaMinutes(null);
      setEtaHint(null);
      return;
    }
    if (parentHasFiniteEta) {
      setClientEtaMinutes(null);
      setEtaHint(null);
      return;
    }
    if (!osrmDest) {
      setClientEtaMinutes(null);
      setEtaHint(null);
      return;
    }
    const { lat: dLat, lng: dLng } = osrmDest;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        let oLat = myPosRef.current?.lat ?? updateRef.current?.currentLat;
        let oLng = myPosRef.current?.lng ?? updateRef.current?.currentLng;
        if (oLat == null || oLng == null) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            if (!cancelled) {
              setClientEtaMinutes(null);
              setEtaHint(null);
            }
            return;
          }
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          oLat = pos.coords.latitude;
          oLng = pos.coords.longitude;
        }
        if (cancelled) return;
        const res = await fetchDrivingLegEtaMinutes(oLat, oLng, dLat, dLng);
        if (cancelled) return;
        if (res.ok && res.minutes != null) {
          setClientEtaMinutes(res.minutes);
          setEtaHint(null);
        } else {
          setClientEtaMinutes(null);
          setEtaHint(null);
        }
      } catch {
        if (!cancelled) {
          setClientEtaMinutes(null);
          setEtaHint(null);
        }
      }
    };

    setEtaHint(null);
    tick();
    const iv = setInterval(tick, 20000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [visible, parentHasFiniteEta, osrmDest?.lat, osrmDest?.lng]);

  /** Esconde polilinha do template quando há percurso dinâmico útil (evita duas linhas ou reta por cima da rota). */
  const suppressTemplatePolyline =
    !!(
      route &&
      route.length >= 2 &&
      dynamicRoute &&
      dynamicRoute.length >= 2 &&
      (route.length === 2 || dynamicRoute.length > 2)
    );

  if (!visible) return null;

  const isDeviation = update?.event === 'ROUTE_DEVIATION';
  const isComplete  = update?.event === 'ROUTE_COMPLETED';
  const pct         = update?.progressPercent ?? 0;
  const displayEtaMinutes = parentHasFiniteEta ? etaMinutes : clientEtaMinutes;
  
  let statusColor = '#f97316';
  if (isComplete) statusColor = '#16a34a';
  else if (isPaused) statusColor = '#94a3b8';
  else if (isDeviation) statusColor = '#dc2626';

  const centerLat = myPos?.lat ?? (route && route.length > 0 ? route[0][0] : -23.5505);
  const centerLng = myPos?.lng ?? (route && route.length > 0 ? route[0][1] : -46.6333);

  const handlePauseResume = async () => {
    if (!taskId) {
      Alert.alert(
        'Rastreamento',
        'Sem identificador da OS no mapa — o link do cliente não poderá ser atualizado quando houver rede.'
      );
      return;
    }
    if (isPaused) {
      routeTracker.resume();
      try {
        const r = await apiFetch(`/api/tracking/resume/${encodeURIComponent(taskId)}`, {
          method: 'POST',
        });
        if (!r.ok) {
          console.warn('[tracking] resume servidor', r.status);
          await enqueueTrackingSync(String(taskId), 'resume');
        }
      } catch (e) {
        console.warn('[tracking] resume offline/falha rede → fila', e);
        await enqueueTrackingSync(String(taskId), 'resume');
      }
      return;
    }
    routeTracker.pause();
    try {
      const r = await apiFetch(`/api/tracking/pause/${encodeURIComponent(taskId)}`, {
        method: 'POST',
      });
      if (!r.ok) {
        console.warn('[tracking] pause servidor', r.status);
        await enqueueTrackingSync(String(taskId), 'pause');
      }
    } catch (e) {
      console.warn('[tracking] pause offline/falha rede → fila', e);
      await enqueueTrackingSync(String(taskId), 'pause');
    }
  };

  const handleRecenter = async () => {
    if (!embedNativeMap) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        /* ignore */
      }
      return;
    }
    if (myPos) {
       mapRef.current?.animateCamera({ center: { latitude: myPos.lat, longitude: myPos.lng }, zoom: 16 }, { duration: 400 });
    } else {
       try {
         const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
         setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
         mapRef.current?.animateCamera({ center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }, zoom: 16 }, { duration: 400 });
       } catch (e) {
         // ignore
       }
    }
  };

  const openNavOptions = () => {
    if (zoneType === 'segment' && route && route.length >= 2) {
      Alert.alert(
        'Navegar para OS',
        'Para qual extremidade do trecho deseja navegar?',
        [
          { text: 'Ponto A', onPress: () => openDestInMaps(route[0][0], route[0][1]) },
          { text: 'Ponto B', onPress: () => openDestInMaps(route[1][0], route[1][1]) },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
      return;
    }
    
    // For route, target start of route
    const tLat = (zoneType === 'route' && route && route.length > 0) ? route[0][0] : targetLoc?.lat;
    const tLng = (zoneType === 'route' && route && route.length > 0) ? route[0][1] : targetLoc?.lng;
    
    openDestInMaps(tLat, tLng);
  };
  
  const openDestInMaps = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return;
    const options: any[] = [
      { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
      { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`) }
    ];
    if (Platform.OS === 'ios') {
      options.push({ text: 'Apple Maps', onPress: () => Linking.openURL(`maps://?daddr=${lat},${lng}`) });
      options.push({ text: 'Cancelar', style: 'cancel' });
      Alert.alert('Navegar para OS', 'Escolha seu aplicativo favorito:', options);
    } else {
      Linking.openURL(`geo:0,0?q=${lat},${lng}(Local da OS)`);
    }
  };

  // Minimized view (shows inline in scrollview)
  if (!expanded) {
    return (
      <TouchableOpacity style={styles.minimizedCard} onPress={() => setExpanded(true)}>
        <Ionicons name="map" size={24} color="#f97316" />
        <View style={{ flex: 1 }}>
           <Text style={styles.minimizedTitle}>Mapa da Rota Oculto</Text>
           <Text style={{ fontSize: 12, color: '#64748b' }}>Toque para voltar à navegação.</Text>
        </View>
        <Ionicons name="expand" size={20} color="#f97316" />
      </TouchableOpacity>
    );
  }

  const hasRoute = route && route.length >= 2;

  // Full Screen Modal View
  return (
    <Modal visible={expanded} animationType="slide">
      <View style={styles.modalContainer}>
        
        {/* Floating Header */}
        <View style={[styles.floatingHeader, { borderLeftColor: statusColor }]}>
           <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                 {isComplete ? 'Deslocamento Concluído' : isPaused ? 'Navegação Pausada' :(!hasRoute ? 'Deslocamento em Andamento' : (isDeviation ? `Desvio de ${update?.distanceFromRoute}m` : `Em Rota · ${pct}%`))}
              </Text>
              {/* ETA moved to floating map badge below */}
              {hasRoute && !isComplete && !isPaused && (
                 <View style={styles.miniBar}>
                   <View style={[styles.miniBarFill, { width: `${pct}%` as any, backgroundColor: statusColor }]} />
                 </View>
              )}
           </View>
           <TouchableOpacity style={styles.minimizeBtn} onPress={() => setExpanded(false)}>
             <Ionicons name="chevron-down" size={24} color="#64748b" />
           </TouchableOpacity>
        </View>

        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: centerLat, longitude: centerLng,
            latitudeDelta: 0.01, longitudeDelta: 0.01,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          followsUserLocation={false}
          showsCompass={false}
        >
          {route && route.length >= 2 && !suppressTemplatePolyline && (
            <Polyline
              coordinates={route.map((c) => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor="#ea580c"
              strokeWidth={2}
              lineDashPattern={Platform.OS === 'android' ? undefined : [12, 8]}
              zIndex={800}
              geodesic
            />
          )}
          {coveredPath && coveredPath.length >= 2 && (
            <Polyline
              coordinates={coveredPath.map((c) => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor="#3b82f6"
              strokeWidth={3}
              zIndex={900}
              geodesic
            />
          )}
          
          {zoneType !== 'segment' && route && route.length > 0 && (
            <>
              <Marker coordinate={{ latitude: route[0][0], longitude: route[0][1] }} title="Início" pinColor="#16a34a" />
              <Marker coordinate={{ latitude: route[route.length - 1][0], longitude: route[route.length - 1][1] }} title="Destino">
                 <View style={{ width: 28, height: 28, backgroundColor: '#dc2626', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                   <FontAwesome5 name="flag-checkered" size={12} color="#fff" />
                 </View>
              </Marker>
            </>
          )}

          {zoneType === 'segment' && route && route.length >= 2 && !suppressTemplatePolyline && (
            <>
              <Polyline
                coordinates={[
                  { latitude: route[0][0], longitude: route[0][1] },
                  { latitude: route[1][0], longitude: route[1][1] },
                ]}
                strokeColor="#a855f7"
                strokeWidth={2}
                lineDashPattern={Platform.OS === 'android' ? undefined : [10, 6]}
                zIndex={750}
                geodesic
              />
              <Marker coordinate={{ latitude: route[0][0], longitude: route[0][1] }} title="Ponto A" pinColor="#2563eb" />
              <Marker coordinate={{ latitude: route[1][0], longitude: route[1][1] }} title="Ponto B" pinColor="#d946ef" />
            </>
          )}
          
          {/* Percurso dinâmico (reta imediata + geometria OSRM quando disponível) */}
          {dynamicRoute && dynamicRoute.length >= 2 && (
             <>
               <Polyline
                 coordinates={dynamicRoute.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                 strokeColor="#2563eb"
                 strokeWidth={2}
                 lineDashPattern={Platform.OS === 'android' ? undefined : [8, 6]}
                 zIndex={1000}
                 geodesic={false}
               />
               <Marker coordinate={{ latitude: dynamicRoute[dynamicRoute.length - 1][0], longitude: dynamicRoute[dynamicRoute.length - 1][1] }} title="Destino">
                 <View style={{ width: 28, height: 28, backgroundColor: '#dc2626', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                   <FontAwesome5 name="flag-checkered" size={12} color="#fff" />
                 </View>
               </Marker>
             </>
          )}
          
          {myPos && (
            <Marker coordinate={{ latitude: myPos.lat, longitude: myPos.lng }} title="Você" zIndex={100}>
              <View style={styles.userMarkerContainer}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.userMarkerImage} />
                ) : (
                  <Ionicons name="person" size={20} color="#3b82f6" />
                )}
              </View>
            </Marker>
          )}
        </MapView>

        <View style={styles.floatingRightGroup}>
          {(route?.length > 0 || targetLoc?.lat) && (
            <TouchableOpacity style={styles.navBtn} onPress={openNavOptions}>
               <Ionicons name="navigate" size={24} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.recenterBtn} onPress={handleRecenter}>
            <Ionicons name="location" size={24} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* Floating Controls at Bottom */}
        <View style={styles.bottomControls}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
               <TouchableOpacity 
                  style={[styles.pauseBtn, isPaused && { backgroundColor: '#10b981', borderColor: '#10b981' }]} 
                  onPress={handlePauseResume}
               >
                  <Ionicons name={isPaused ? "play" : "pause"} size={18} color={isPaused ? "#fff" : "#475569"} />
                  <Text style={[styles.pauseText, isPaused && { color: '#fff' }]}>{isPaused ? 'Retomar Rota' : 'Pausar'}</Text>
               </TouchableOpacity>
            </View>

            {onEndTransit && (
               <TouchableOpacity style={styles.endTransitBtn} onPress={onEndTransit}>
                  <Ionicons name="stop-circle" size={20} color="#fff" />
                  <Text style={styles.endTransitText}>FINALIZAR DESLOCAMENTO</Text>
               </TouchableOpacity>
            )}
        </View>

        {/* ──── Premium ETA Badge — always visible during transit ──── */}
        {!isComplete && !isPaused && (
          <EtaBadge etaMinutes={displayEtaMinutes ?? null} pct={pct} hint={etaHint} />
        )}

        {/* Deviation Banner Overlay */}
        {isDeviation && !isPaused && (
          <View style={styles.deviationBanner}>
            <Ionicons name="warning" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.deviationText}>Você está fora da rota definida!</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: '#f1f5f9' },
  minimizedCard: { marginHorizontal: 16, marginTop: 10, padding: 16, backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  minimizedTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  
  floatingHeader: { position: 'absolute', top: 50, left: 16, right: 16, zIndex: 10, backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5, borderLeftWidth: 4 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  minimizeBtn: { padding: 4 },
  miniBar: { height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden', width: '100%', marginTop: 4 },
  miniBarFill: { height: 4, borderRadius: 2 },
  
  floatingRightGroup: { position: 'absolute', right: 16, bottom: 180, zIndex: 10, alignItems: 'center', gap: 12 },
  navBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', shadowColor: '#3b82f6', shadowOpacity: 0.4, shadowRadius: 6, elevation: 6 },
  recenterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5, elevation: 4 },
  
  bottomControls: { position: 'absolute', bottom: 30, left: 16, right: 16, zIndex: 20 },
  pauseBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2, gap: 8 },
  pauseText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  
  endTransitBtn: { flexDirection: 'row', backgroundColor: '#ea580c', paddingVertical: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#ea580c', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, gap: 10 },
  endTransitText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  deviationBanner: { position: 'absolute', top: 120, left: 16, right: 16, backgroundColor: '#dc2626', borderRadius: 8, flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, alignItems: 'center', shadowColor: '#dc2626', shadowOpacity: 0.4, shadowRadius: 6, elevation: 5 },
  deviationText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  userMarkerContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', borderWidth: 3, borderColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 5, overflow: 'hidden' },
  userMarkerImage: { width: '100%', height: '100%', resizeMode: 'cover' }
});
