import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';

async function assertConnectedWhenOnlineRequired(): Promise<boolean> {
  try {
    const netState = await Network.getNetworkStateAsync();
    if (!netState.isConnected) {
      Alert.alert(
        'Validação Online Obrigatória',
        'Esta etapa da OS possui regras de segurança e não pode ser preenchida offline.\n\nPor favor, conecte-se à internet para continuar.',
        [{ text: 'OK' }],
      );
      return false;
    }
    return true;
  } catch {
    Alert.alert('Erro de Conexão', 'Não foi possível verificar a conectividade.');
    return false;
  }
}

export type LocationPickPayloadV1 = {
  version: 1;
  capturedAt: string;
  gps: { lat: number; lng: number; accuracy?: number | null };
  pin: { lat: number; lng: number };
  addressGps?: string;
  addressPin?: string;
  /** true quando o técnico moveu o alfinete ou atualizou o GPS após uma confirmação — obriga confirmar outra vez. */
  adjustmentPending?: boolean;
};

const DELTA = 0.004;
/** ~1 m em graus — compara rascunho com valor guardado */
const COORD_EPS = 1e-5;

function coordsMatchSaved(
  saved: LocationPickPayloadV1,
  gps: { lat: number; lng: number },
  pin: { lat: number; lng: number }
): boolean {
  return (
    Math.abs(gps.lat - saved.gps.lat) < COORD_EPS &&
    Math.abs(gps.lng - saved.gps.lng) < COORD_EPS &&
    Math.abs(pin.lat - saved.pin.lat) < COORD_EPS &&
    Math.abs(pin.lng - saved.pin.lng) < COORD_EPS
  );
}

function parsePayload(raw: unknown): LocationPickPayloadV1 | null {
  if (raw == null) return null;
  let o: any = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object' || o.version !== 1) return null;
  const gl = o.gps?.lat;
  const gg = o.gps?.lng;
  const pl = o.pin?.lat;
  const pg = o.pin?.lng;
  if (
    typeof gl !== 'number' ||
    typeof gg !== 'number' ||
    typeof pl !== 'number' ||
    typeof pg !== 'number' ||
    !Number.isFinite(gl) ||
    !Number.isFinite(gg) ||
    !Number.isFinite(pl) ||
    !Number.isFinite(pg)
  ) {
    return null;
  }
  return o as LocationPickPayloadV1;
}

export function isLocationPickAnswerValid(raw: unknown): boolean {
  const p = parsePayload(raw);
  if (!p) return false;
  if (p.adjustmentPending === true) return false;
  return true;
}

async function reverseLabel(lat: number, lng: number): Promise<string | undefined> {
  try {
    const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!rev?.length) return undefined;
    const r = rev[0];
    const parts = [r.street, r.streetNumber, r.district || r.subregion, r.city || r.region].filter(Boolean);
    return parts.length ? parts.join(', ') : undefined;
  } catch {
    return undefined;
  }
}

/** Evita que reverse geocode pendure indefinidamente e impeça gravar a localização. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

type Props = {
  value: unknown;
  onChange: (json: string) => void;
  disabled?: boolean;
  primaryColor: string;
  /** Quando true (definido no builder), bloqueia GPS, mapa, confirmar e limpar sem internet. */
  requireOnlineValidation?: boolean;
};

export function ChecklistLocationPickField({
  value,
  onChange,
  disabled,
  primaryColor,
  requireOnlineValidation = false,
}: Props) {
  const { height: windowH } = useWindowDimensions();
  const mapHeight = useMemo(() => Math.round(Math.min(200, Math.max(120, windowH * 0.22))), [windowH]);
  const networkState = Network.useNetworkState();
  const offlineBlocked =
    requireOnlineValidation && !disabled && networkState.isConnected === false;

  const saved = useMemo(() => parsePayload(value), [value]);
  const [loadingGps, setLoadingGps] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy?: number | null } | null>(
    saved ? { lat: saved.gps.lat, lng: saved.gps.lng, accuracy: saved.gps.accuracy } : null
  );
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    saved ? { lat: saved.pin.lat, lng: saved.pin.lng } : null
  );
  const [region, setRegion] = useState<Region | null>(() =>
    saved
      ? {
          latitude: saved.pin.lat,
          longitude: saved.pin.lng,
          latitudeDelta: DELTA,
          longitudeDelta: DELTA,
        }
      : null
  );
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (value === '' || value === null) {
      setGps(null);
      setPin(null);
      setRegion(null);
      return;
    }
    const p = parsePayload(value);
    if (p) {
      setGps({ lat: p.gps.lat, lng: p.gps.lng, accuracy: p.gps.accuracy });
      setPin({ lat: p.pin.lat, lng: p.pin.lng });
      setRegion({
        latitude: p.pin.lat,
        longitude: p.pin.lng,
        latitudeDelta: DELTA,
        longitudeDelta: DELTA,
      });
    }
  }, [value]);

  /** initialRegion só vale na 1.ª montagem — sempre que a região alvo muda, centramos a câmera no alfinete */
  useEffect(() => {
    if (!region) return;
    const r = region;
    const t = setTimeout(() => {
      mapRef.current?.animateToRegion(r, 400);
    }, 80);
    return () => clearTimeout(t);
  }, [region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]);

  /** Resposta aceite pelo checklist (inclui bloquear "Próximo" com ajuste por confirmar). */
  const hasConfirmedAnswer = useMemo(() => {
    if (!saved || !gps || !pin) return false;
    if (saved.adjustmentPending === true) return false;
    return coordsMatchSaved(saved, gps, pin);
  }, [saved, gps, pin]);

  const needsReconfirm = useMemo(() => {
    if (!gps || !pin) return false;
    if (!saved) return false;
    return saved.adjustmentPending === true || !coordsMatchSaved(saved, gps, pin);
  }, [saved, gps, pin]);

  const valueRef = useRef(value);
  valueRef.current = value;
  const gpsRef = useRef(gps);
  gpsRef.current = gps;

  const pushAdjustmentPending = useCallback(
    (nextGps: { lat: number; lng: number; accuracy?: number | null }, nextPin: { lat: number; lng: number }) => {
      const s = parsePayload(valueRef.current);
      if (!s) return;
      const payload: LocationPickPayloadV1 = {
        version: 1,
        capturedAt: s.capturedAt,
        gps: { lat: nextGps.lat, lng: nextGps.lng, accuracy: nextGps.accuracy ?? null },
        pin: { lat: nextPin.lat, lng: nextPin.lng },
        ...(s.addressGps ? { addressGps: s.addressGps } : {}),
        ...(s.addressPin ? { addressPin: s.addressPin } : {}),
        adjustmentPending: true,
      };
      onChange(JSON.stringify(payload));
    },
    [onChange],
  );

  const captureGps = useCallback(async () => {
    if (disabled) return;
    if (requireOnlineValidation) {
      const ok = await assertConnectedWhenOnlineRequired();
      if (!ok) return;
    }
    setLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS', 'Permissão de localização negada. Ative nas configurações do celular.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const acc = loc.coords.accuracy;
      const g = { lat, lng, accuracy: acc ?? null };
      setGps(g);
      setPin({ lat, lng });
      setRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: DELTA,
        longitudeDelta: DELTA,
      });
      pushAdjustmentPending(g, { lat, lng });
    } catch (e: any) {
      Alert.alert('GPS', e?.message || 'Não foi possível obter a posição.');
    } finally {
      setLoadingGps(false);
    }
  }, [disabled, requireOnlineValidation, pushAdjustmentPending]);

  const confirmPick = useCallback(async () => {
    if (!gps || !pin || disabled) return;
    if (requireOnlineValidation) {
      const ok = await assertConnectedWhenOnlineRequired();
      if (!ok) return;
    }
    const capturedAt = new Date().toISOString();
    let addressGps: string | undefined;
    let addressPin: string | undefined;
    try {
      const pair = await Promise.all([
        withTimeout(reverseLabel(gps.lat, gps.lng), 8000),
        withTimeout(reverseLabel(pin.lat, pin.lng), 8000),
      ]);
      addressGps = pair[0];
      addressPin = pair[1];
    } catch {
      /* endereços são opcionais — coordenadas gravam na mesma */
    }
    const payload: LocationPickPayloadV1 = {
      version: 1,
      capturedAt,
      gps: { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy ?? null },
      pin: { lat: pin.lat, lng: pin.lng },
      ...(addressGps ? { addressGps } : {}),
      ...(addressPin ? { addressPin } : {}),
    };
    onChange(JSON.stringify(payload));
  }, [gps, pin, disabled, onChange, requireOnlineValidation]);

  const clearPick = useCallback(async () => {
    if (disabled) return;
    if (requireOnlineValidation) {
      const ok = await assertConnectedWhenOnlineRequired();
      if (!ok) return;
    }
    onChange('');
  }, [disabled, onChange, requireOnlineValidation]);

  const onDragEnd = useCallback(
    async (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      if (disabled) return;
      if (requireOnlineValidation) {
        const ok = await assertConnectedWhenOnlineRequired();
        if (!ok) return;
      }
      const { latitude, longitude } = e.nativeEvent.coordinate;
      const newPin = { lat: latitude, lng: longitude };
      setPin(newPin);
      const g = gpsRef.current;
      if (g) pushAdjustmentPending(g, newPin);
    },
    [disabled, requireOnlineValidation, pushAdjustmentPending],
  );

  if (disabled && saved) {
    return (
      <View style={styles.readonlyBox}>
        <Text style={styles.readonlyTitle}>Localização registada</Text>
        <Text style={styles.readonlyRow}>
          <Text style={styles.k}>GPS: </Text>
          {saved.gps.lat.toFixed(6)}, {saved.gps.lng.toFixed(6)}
          {saved.gps.accuracy != null ? ` (±${Math.round(saved.gps.accuracy)}m)` : ''}
        </Text>
        {saved.addressGps ? <Text style={styles.addr}>{saved.addressGps}</Text> : null}
        <Text style={[styles.readonlyRow, { marginTop: 8 }]}>
          <Text style={styles.k}>Alfinete: </Text>
          {saved.pin.lat.toFixed(6)}, {saved.pin.lng.toFixed(6)}
        </Text>
        {saved.addressPin ? <Text style={styles.addr}>{saved.addressPin}</Text> : null}
        <Text style={styles.meta}>{new Date(saved.capturedAt).toLocaleString('pt-PT')}</Text>
      </View>
    );
  }

  if (disabled && !saved) {
    return (
      <Text style={styles.muted}>Sem localização.</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {offlineBlocked ? (
        <View style={styles.onlineBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color="#b45309" style={{ marginRight: 8 }} />
          <Text style={styles.onlineBannerText}>
            Este campo exige internet (definição do formulário). Conecte-se para obter o GPS, mover o alfinete e
            confirmar.
          </Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={[styles.btnGps, { borderColor: primaryColor }, offlineBlocked && styles.btnMuted]}
        onPress={captureGps}
        disabled={disabled || loadingGps || offlineBlocked}
        activeOpacity={0.85}
      >
        {loadingGps ? (
          <ActivityIndicator color={primaryColor} style={{ marginRight: 8 }} />
        ) : (
          <Ionicons name="navigate" size={22} color={primaryColor} style={{ marginRight: 8 }} />
        )}
        <Text style={[styles.btnGpsText, { color: primaryColor }]}>
          {gps ? 'Atualizar posição GPS' : 'Obter posição GPS'}
        </Text>
      </TouchableOpacity>

      {gps ? (
        <View style={styles.coordsBox}>
          <View style={styles.coordsRow}>
            <Text style={styles.coordsLabel}>GPS</Text>
            <Text style={styles.coordsVal} numberOfLines={2}>
              {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
              {gps.accuracy != null ? ` · ±${Math.round(gps.accuracy)}m` : ''}
            </Text>
          </View>
          {pin ? (
            <View style={[styles.coordsRow, styles.coordsRowDivider]}>
              <Text style={styles.coordsLabel}>Alfinete</Text>
              <Text style={styles.coordsVal} numberOfLines={2}>
                {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.hint}>Obtenha o GPS e, se precisar, ajuste o alfinete no mapa antes de confirmar.</Text>
      )}

      {region && pin ? (
        <>
          <Text style={styles.mapHint}>
            {offlineBlocked ? 'Alfinete bloqueado sem internet.' : 'Arraste o alfinete no mapa; depois confirme em baixo.'}
          </Text>
          <View style={[styles.mapContainer, { height: mapHeight }]}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
            >
              <Marker
                coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                draggable={!offlineBlocked}
                onDragEnd={onDragEnd}
              />
            </MapView>
          </View>
        </>
      ) : null}

      {gps && pin ? (
        <View style={styles.rowBtnsCol}>
          {needsReconfirm ? (
            <Text style={styles.reconfirmHint}>Posição alterada — confirme de novo para guardar.</Text>
          ) : null}
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                hasConfirmedAnswer ? styles.btnPrimarySuccess : { backgroundColor: primaryColor },
                offlineBlocked && styles.btnPrimaryMuted,
              ]}
              onPress={confirmPick}
              disabled={disabled || offlineBlocked || hasConfirmedAnswer}
              activeOpacity={hasConfirmedAnswer ? 1 : 0.85}
            >
              <Ionicons
                name={hasConfirmedAnswer ? 'checkmark-done' : 'checkmark-circle'}
                size={20}
                color="#fff"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.btnPrimaryText}>
                {hasConfirmedAnswer
                  ? 'Localização confirmada'
                  : needsReconfirm
                    ? 'Confirmar novamente'
                    : 'Confirmar localização'}
              </Text>
            </TouchableOpacity>
            {gps ? (
              <TouchableOpacity style={styles.btnGhost} onPress={clearPick} disabled={disabled || offlineBlocked}>
                <Text style={styles.btnGhostText}>Limpar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {hasConfirmedAnswer && !disabled ? (
            <Text style={styles.afterSaveHint}>Use Limpar para voltar a definir a localização.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  onlineBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 10,
  },
  onlineBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#92400e',
    lineHeight: 17,
    fontWeight: '600',
  },
  btnMuted: { opacity: 0.55 },
  btnPrimaryMuted: { opacity: 0.55 },
  btnGps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#f8fafc',
  },
  btnGpsText: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 11, color: '#64748b', lineHeight: 15 },
  mapHint: { fontSize: 11, fontWeight: '700', color: '#0f172a', lineHeight: 15 },
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#e2e8f0',
  },
  coordsBox: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 0,
  },
  coordsRow: { gap: 2 },
  coordsRowDivider: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#cbd5e1',
  },
  coordsLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
  coordsVal: { fontSize: 12, color: '#0f172a', fontFamily: 'monospace', lineHeight: 16 },
  rowBtnsCol: { gap: 6 },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexGrow: 1,
    justifyContent: 'center',
  },
  btnPrimarySuccess: {
    backgroundColor: '#16a34a',
    borderWidth: 1,
    borderColor: '#15803d',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhost: { paddingVertical: 12, paddingHorizontal: 12 },
  btnGhostText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
  reconfirmHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    lineHeight: 16,
  },
  afterSaveHint: { fontSize: 11, color: '#64748b', lineHeight: 15, paddingLeft: 2 },
  muted: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  readonlyBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  readonlyTitle: { fontSize: 14, fontWeight: '800', color: '#14532d', marginBottom: 4 },
  readonlyRow: { fontSize: 13, color: '#166534' },
  k: { fontWeight: '800' },
  addr: { fontSize: 12, color: '#15803d', marginTop: 2 },
  meta: { fontSize: 11, color: '#64748b', marginTop: 8 },
});
