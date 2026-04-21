import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useProviderBroadcastOffer } from '../context/ProviderBroadcastOfferContext';
import { fetchDrivingLegMetrics } from '../services/osrmClient';
import { stripFormTemplateTitleLabelPrefix } from '../utils/stripFormTemplateTitleLabelPrefix';
import { taskOsLabel } from '../utils/taskOsLabel';

const SHEET_H = Dimensions.get('window').height * 0.52;
const MAP_H = 132;

function parseCoordLatLng(t: any): { lat: number; lng: number } | null {
  const rawLat = t?.locationLat ?? t?.metadata?.locationLat ?? t?.metadata?.lat;
  const rawLng = t?.locationLng ?? t?.metadata?.locationLng ?? t?.metadata?.lng;
  const lat =
    typeof rawLat === 'number' && Number.isFinite(rawLat)
      ? rawLat
      : parseFloat(String(rawLat ?? '').trim().replace(',', '.'));
  const lng =
    typeof rawLng === 'number' && Number.isFinite(rawLng)
      ? rawLng
      : parseFloat(String(rawLng ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function taskMetadataRecord(t: any): Record<string, unknown> {
  const m = t?.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

function expectedFormDurationMinutes(task: any): number | null {
  const raw = task?.expectedFormDurationMinutes ?? task?.metadata?.expectedFormDurationMinutes;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return null;
  return Math.floor(Number(raw));
}

/** Metros → texto curto (pt-BR), alinhado ao dashboard. */
function formatMetersForUi(meters: number): string {
  const km = meters / 1000;
  if (km < 1) {
    return `${Math.round(meters)} m`;
  }
  return `${km.toLocaleString('pt-BR', {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  })} km`;
}

function offerSubtitleLine(task: any): string {
  const meta = taskMetadataRecord(task);
  const formRaw =
    task?.formTemplateTitle != null && String(task.formTemplateTitle).trim() !== ''
      ? String(task.formTemplateTitle).trim()
      : String(task?.templateTitle ?? meta.templateTitle ?? '').trim();
  const form = stripFormTemplateTitleLabelPrefix(formRaw);
  const serviceLine = String(task?.service ?? '').trim();
  const left = form && form !== serviceLine ? form : serviceLine || form || 'OS';
  const due = providerTaskDueShort(task);
  if (due) return `${left} · ${due}`;
  return left;
}

function providerTaskDueShort(t: any): string | null {
  const ag = t?.agendaEndAt ?? t?.plannedFormEndAt;
  if (ag != null && String(ag).trim() !== '') {
    const d = new Date(String(ag));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  const meta = taskMetadataRecord(t);
  if (meta.dueDate != null && String(meta.dueDate).trim() !== '') {
    const raw = String(meta.dueDate).trim();
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  if (t?.endDate != null && String(t.endDate).trim() !== '') {
    const d = new Date(String(t.endDate));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  return null;
}

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Contagem regressiva se `metadata.broadcastClaimExpiresAt` (ISO) existir; senão não mostra tempo. */
function useOfferCountdownSeconds(task: any | null): number | null {
  const [sec, setSec] = useState<number | null>(null);

  useEffect(() => {
    if (!task) {
      setSec(null);
      return;
    }
    const meta = taskMetadataRecord(task);
    const raw =
      meta.broadcastClaimExpiresAt ??
      meta.broadcastOfferExpiresAt ??
      task.broadcastClaimExpiresAt ??
      null;
    if (raw == null || String(raw).trim() === '') {
      setSec(null);
      return;
    }
    const endMs = Date.parse(String(raw));
    if (!Number.isFinite(endMs)) {
      setSec(null);
      return;
    }
    const tick = () => {
      setSec(Math.max(0, Math.floor((endMs - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [task?.id, task?.metadata?.broadcastClaimExpiresAt, task?.metadata?.broadcastOfferExpiresAt]);

  return sec;
}

export function ProviderBroadcastOfferSheet() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    broadcastOfferTasks,
    setBroadcastOfferTasks,
    invokeAcceptOffer,
    invokeRejectOffer,
  } = useProviderBroadcastOffer();

  const task = broadcastOfferTasks[0] ?? null;
  const visible = broadcastOfferTasks.length > 0;

  const dest = task ? parseCoordLatLng(task) : null;
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [distText, setDistText] = useState<string>('—');
  const [etaText, setEtaText] = useState<string>('—');

  const mapRegion = useMemo(() => {
    if (!dest) {
      return {
        latitude: -23.5505,
        longitude: -46.6333,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    return {
      latitude: dest.lat,
      longitude: dest.lng,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
  }, [dest?.lat, dest?.lng]);

  const loadOsrm = useCallback(async (t: any | null) => {
    if (!t || !dest) {
      setDistText('—');
      setEtaText('—');
      return;
    }
    setMetricsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDistText('—');
        setEtaText('—');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const oLat = loc.coords.latitude;
      const oLng = loc.coords.longitude;
      const m = await fetchDrivingLegMetrics(oLat, oLng, dest.lat, dest.lng, { timeoutMs: 22000 });
      if (!m.ok) {
        setDistText('—');
        setEtaText('—');
        return;
      }
      const dm = m.distanceMeters;
      setDistText(dm != null && Number.isFinite(dm) ? formatMetersForUi(dm) : '—');
      const min = m.durationSeconds != null ? Math.max(1, Math.round(m.durationSeconds / 60)) : null;
      setEtaText(min != null ? `${min} min` : '—');
    } catch {
      setDistText('—');
      setEtaText('—');
    } finally {
      setMetricsLoading(false);
    }
  }, [dest]);

  useEffect(() => {
    void loadOsrm(task);
  }, [task?.id, dest?.lat, dest?.lng, loadOsrm, task]);

  const durMinutes = task ? expectedFormDurationMinutes(task) : null;
  const durLabel = durMinutes != null ? `${durMinutes} min` : '—';

  const countdownSec = useOfferCountdownSeconds(task);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);

  const onDismiss = () => {
    if (busy) return;
    setBroadcastOfferTasks((prev) => prev.slice(1));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} android_disableSound />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.cardWhite,
              height: SHEET_H,
              maxHeight: SHEET_H,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          {task ? (
            <>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.textLight, marginBottom: 6 }}>
                {taskOsLabel(task)}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '900', color: C.slate, marginBottom: 4 }}>
                Surgiu uma nova demanda para sua área
              </Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 10 }} numberOfLines={2}>
                {offerSubtitleLine(task)}
              </Text>

              <View style={[styles.mapWrap, { borderColor: C.border }]}>
                {dest ? (
                  <MapView
                    style={StyleSheet.absoluteFill}
                    provider={PROVIDER_DEFAULT}
                    region={mapRegion}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                  >
                    <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} />
                  </MapView>
                ) : (
                  <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: C.textSecondary, fontSize: 13 }}>Sem coordenadas de destino</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 10 }}>
                {(
                  [
                    { k: 'dur', label: 'DURAÇÃO', value: durLabel, color: C.accent ?? '#EA580C' },
                    { k: 'dist', label: 'DISTÂNCIA', value: distText, color: C.slate },
                    { k: 'eta', label: 'ETA', value: etaText, color: C.success?.text ?? '#16A34A' },
                  ] as const
                ).map((col) => (
                  <View
                    key={col.k}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      backgroundColor: C.divider,
                      borderRadius: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 6,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '800', color: C.textLight }}>{col.label}</Text>
                    {metricsLoading && col.k !== 'dur' ? (
                      <ActivityIndicator style={{ marginTop: 6 }} size="small" color={C.textSecondary} />
                    ) : (
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 14, fontWeight: '900', marginTop: 4, color: col.color }}
                      >
                        {col.value}
                      </Text>
                    )}
                  </View>
                ))}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#FFF4E8',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <Ionicons name="flash" size={18} color="#EA580C" />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '900',
                      color: '#EA580C',
                      letterSpacing: 0.3,
                    }}
                    numberOfLines={1}
                  >
                    OFERTA DISPONÍVEL
                  </Text>
                </View>
                {countdownSec != null ? (
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#DC2626', fontVariant: ['tabular-nums'] }}>
                    {formatMmSs(countdownSec)}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  disabled={!!busy}
                  onPress={async () => {
                    if (!task) return;
                    setBusy('reject');
                    try {
                      await invokeRejectOffer(task);
                      setBroadcastOfferTasks((prev) => prev.filter((x) => String(x.id) !== String(task.id)));
                    } catch {
                      /* handler mostra Alert */
                    } finally {
                      setBusy(null);
                    }
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    borderRadius: 12,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: C.border,
                    backgroundColor: C.cardWhite,
                  }}
                >
                  {busy === 'reject' ? (
                    <ActivityIndicator size="small" color={C.textSecondary} />
                  ) : (
                    <Text style={{ color: C.textSecondary, fontWeight: '800', fontSize: 14 }}>Recusar</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!!busy}
                  onPress={async () => {
                    if (!task) return;
                    setBusy('accept');
                    try {
                      await invokeAcceptOffer(task);
                      setBroadcastOfferTasks((prev) => prev.filter((x) => String(x.id) !== String(task.id)));
                    } catch {
                      /* handler mostra Alert */
                    } finally {
                      setBusy(null);
                    }
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: C.accent ?? '#EA580C',
                  }}
                >
                  {busy === 'accept' ? (
                    <ActivityIndicator size="small" color={C.cardWhite} />
                  ) : (
                    <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 14 }}>Aceitar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  mapWrap: {
    width: '100%',
    height: MAP_H,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
