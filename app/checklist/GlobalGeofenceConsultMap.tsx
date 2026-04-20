/**
 * Mapa consultivo no formulário: destino + geometrias da cerca global (OR).
 * Atualiza posição e texto dentro/fora em intervalos.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, LayoutAnimation } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import GlobalGeofenceMapLayers from './GlobalGeofenceMapLayers';
import type { GlobalGeofenceMeta } from './globalGeofenceCombined';
import { evaluateCombinedGlobalFence } from './globalGeofenceCombined';

type Props = {
  task: {
    id?: string;
    title?: string;
    locationLat?: number | null;
    locationLng?: number | null;
    metadata?: { globalGeofence?: GlobalGeofenceMeta } | null;
  };
  visible: boolean;
};

export default function GlobalGeofenceConsultMap({ task, visible }: Props) {
  const gf = task?.metadata?.globalGeofence;
  const [expanded, setExpanded] = useState(true);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [statusMsg, setStatusMsg] = useState('—');

  useEffect(() => {
    if (!visible || !gf) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setStatusMsg('GPS negado — ative permissões para ver a sua posição no mapa.');
        return;
      }
      const tick = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          setMyPos({ lat, lng });
          const r = evaluateCombinedGlobalFence(lat, lng, gf);
          setStatusMsg(r.statusMsg);
        } catch {
          setStatusMsg('Localização indisponível.');
        }
      };
      await tick();
      timer = setInterval(tick, 12000);
    })();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [visible, gf, task?.id]);

  if (!visible || !gf) return null;

  const initialLat = gf.destination?.lat ?? Number(task.locationLat) ?? -23.55;
  const initialLng = gf.destination?.lng ?? Number(task.locationLng) ?? -46.63;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => {
          if (Platform.OS === 'android') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }
          setExpanded((e) => !e);
        }}
        accessibilityLabel="Expandir ou recolher mapa da cerca global"
      >
        <Ionicons name="map" size={18} color="#0f766e" />
        <Text style={styles.headerTitle}>Cerca global — consulta no mapa</Text>
        <Text style={styles.chevron}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>
      {expanded && (
        <>
          <Text style={styles.hint} numberOfLines={4}>
            {statusMsg}
          </Text>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: initialLat,
              longitude: initialLng,
              latitudeDelta: 0.035,
              longitudeDelta: 0.035,
            }}
            showsUserLocation={false}
            showsMyLocationButton={false}
          >
            <GlobalGeofenceMapLayers gf={gf} destMarkerTitle={task.title || 'Destino da OS'} />
            {myPos ? (
              <Marker coordinate={{ latitude: myPos.lat, longitude: myPos.lng }} title="Você">
                <View style={styles.userDot} />
              </Marker>
            ) : null}
          </MapView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0f766e' },
  chevron: { fontSize: 11, color: '#0f766e' },
  hint: { fontSize: 11, color: '#475569', paddingHorizontal: 12, paddingBottom: 8, lineHeight: 16 },
  map: { width: '100%', height: 220 },
  userDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
