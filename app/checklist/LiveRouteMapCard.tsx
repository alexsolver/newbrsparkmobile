import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, StyleSheet, Text, TouchableOpacity, View, Easing, Modal, Dimensions, Image
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { routeTracker, RouteUpdate } from '../../src/services/routeTrackingService';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { Alert, Linking, Platform } from 'react-native';

interface Props {
  route: number[][];      // [[lat,lng], ...]
  visible: boolean;       // set true when transit_start is pressed
  zoneType?: string | null;
  targetLoc?: { lat?: number | null; lng?: number | null };
  onEndTransit?: () => void;
}

const { width, height } = Dimensions.get('window');

export default function LiveRouteMapCard({ route, visible, zoneType, targetLoc, onEndTransit }: Props) {
  const mapRef = useRef<MapView>(null);
  const [update, setUpdate]           = useState<RouteUpdate | null>(null);
  const [myPos, setMyPos]             = useState<{ lat: number; lng: number } | null>(null);
  const [expanded, setExpanded]       = useState(true);
  const [coveredPath, setCoveredPath] = useState<number[][]>([]);
  const { user } = useAuth();
  
  // Track pause state natively inside component (or from routeTracker)
  const [isPaused, setIsPaused] = useState(false);

  // Subscribe to route tracker updates
  useEffect(() => {
    if (!visible) return;

    if (!routeTracker.isActive() || routeTracker.getRouteLength() !== route.length) {
       routeTracker.start(route, 100).catch(() => {});
    }

    const handler = (u: RouteUpdate) => {
      setUpdate(u);
      setMyPos({ lat: u.currentLat, lng: u.currentLng });
      mapRef.current?.animateCamera(
        { center: { latitude: u.currentLat, longitude: u.currentLng }, zoom: 16 },
        { duration: 800 }
      );
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
  }, [visible, route]);

  if (!visible) return null;

  const isDeviation = update?.event === 'ROUTE_DEVIATION';
  const isComplete  = update?.event === 'ROUTE_COMPLETED';
  const pct         = update?.progressPercent ?? 0;
  
  let statusColor = '#f97316';
  if (isComplete) statusColor = '#16a34a';
  else if (isPaused) statusColor = '#94a3b8';
  else if (isDeviation) statusColor = '#dc2626';

  const centerLat = myPos?.lat ?? (route && route.length > 0 ? route[0][0] : -23.5505);
  const centerLng = myPos?.lng ?? (route && route.length > 0 ? route[0][1] : -46.6333);

  const handlePauseResume = () => {
    if (isPaused) {
      routeTracker.resume();
    } else {
      routeTracker.pause();
    }
  };

  const handleRecenter = async () => {
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
          {route && route.length >= 2 && (
            <Polyline
              coordinates={route.map(c => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor="#ea580c"
              strokeWidth={5}
              lineDashPattern={[12, 8]}
            />
          )}
          {coveredPath && coveredPath.length >= 2 && (
            <Polyline
              coordinates={coveredPath.map(c => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor="#3b82f6"
              strokeWidth={7}
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

          {zoneType === 'segment' && route && route.length >= 2 && (
            <>
              <Marker coordinate={{ latitude: route[0][0], longitude: route[0][1] }} title="Ponto A" pinColor="#2563eb" />
              <Marker coordinate={{ latitude: route[1][0], longitude: route[1][1] }} title="Ponto B" pinColor="#d946ef" />
              {/* Note: In a real advanced app, we'd draw the segment polyline just like GeofenceMapScreen */}
            </>
          )}
          
          {myPos && (
            <Marker coordinate={{ latitude: myPos.lat, longitude: myPos.lng }} title="Você" zIndex={100}>
              <View style={styles.userMarkerContainer}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.userMarkerImage} />
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
