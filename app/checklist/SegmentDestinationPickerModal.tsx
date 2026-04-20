import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type LatLng = { lat: number; lng: number };

export type SegmentDestinationPickerModalProps = {
  visible: boolean;
  pointA: LatLng;
  pointB: LatLng;
  onSelect: (which: 'A' | 'B') => void;
  onCancel: () => void;
};

export default function SegmentDestinationPickerModal({
  visible,
  pointA,
  pointB,
  onSelect,
  onCancel,
}: SegmentDestinationPickerModalProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const mapW = Math.min(width - 32, 400);

  const region = useMemo(() => {
    const lat = (pointA.lat + pointB.lat) / 2;
    const lng = (pointA.lng + pointB.lng) / 2;
    const dLat = Math.abs(pointA.lat - pointB.lat) || 0.002;
    const dLng = Math.abs(pointA.lng - pointB.lng) || 0.002;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: Math.max(dLat * 2.8, 0.01),
      longitudeDelta: Math.max(dLng * 2.8, 0.01),
    };
  }, [pointA.lat, pointA.lng, pointB.lat, pointB.lng]);

  const lineCoords = useMemo(
    () => [
      { latitude: pointA.lat, longitude: pointA.lng },
      { latitude: pointB.lat, longitude: pointB.lng },
    ],
    [pointA, pointB]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('segmentDest.title', 'Destino do deslocamento')}</Text>
          <Text style={styles.sub}>
            {t(
              'segmentDest.subtitle',
              'A OS é um trecho (A ↔ B). Escolha para onde navegar e calcular o ETA.'
            )}
          </Text>
          <View style={[styles.mapWrap, { width: mapW, height: 220 }]}>
            <MapView style={StyleSheet.absoluteFill} initialRegion={region} rotateEnabled={false}>
              <Polyline coordinates={lineCoords} strokeColor="#9333ea" strokeWidth={3} />
              <Marker coordinate={{ latitude: pointA.lat, longitude: pointA.lng }} title="A">
                <View style={styles.markerA}>
                  <Text style={styles.markerTxt}>A</Text>
                </View>
              </Marker>
              <Marker coordinate={{ latitude: pointB.lat, longitude: pointB.lng }} title="B">
                <View style={styles.markerB}>
                  <Text style={styles.markerTxt}>B</Text>
                </View>
              </Marker>
            </MapView>
          </View>
          <TouchableOpacity style={styles.btnA} onPress={() => onSelect('A')} activeOpacity={0.85}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.btnTxt}>{t('segmentDest.chooseA', 'Navegar para o ponto A')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnB} onPress={() => onSelect('B')} activeOpacity={0.85}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.btnTxt}>{t('segmentDest.chooseB', 'Navegar para o ponto B')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={onCancel}>
            <Text style={styles.btnGhostTxt}>{t('common.cancel', 'Cancelar')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 14, textAlign: 'center' },
  mapWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  markerA: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerB: {
    backgroundColor: '#c026d3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },
  btnA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    marginBottom: 10,
  },
  btnB: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#a21caf',
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    marginBottom: 10,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { paddingVertical: 10 },
  btnGhostTxt: { color: '#64748b', fontWeight: '700', fontSize: 15 },
});
