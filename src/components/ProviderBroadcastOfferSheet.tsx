import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { PermissionStatus } from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useProviderBroadcastOffer } from '../context/ProviderBroadcastOfferContext';
import { fetchDrivingLegMetrics } from '../services/osrmClient';
import { stripFormTemplateTitleLabelPrefix } from '../utils/stripFormTemplateTitleLabelPrefix';
import { taskOsLabel } from '../utils/taskOsLabel';
import { TAB_BAR_INSETS_BOTTOM_MIN } from './FloatingRadialMenu';
import { useTransitMapExpanded } from '../context/TransitMapExpandedContext';

export type BroadcastOfferSheetMode = 'expanded' | 'minimized';

export type BroadcastOfferSheetModel = {
  visible: boolean;
  /** Primeira vez / nova OS: expandido; tocar fora: minimiza até aceitar/rejeitar. */
  sheetExpanded: boolean;
  modalKey: string;
  onDismiss: () => void;
  renderLayer: (
    embeddedInTransitModal: boolean,
    mode: BroadcastOfferSheetMode
  ) => React.ReactElement | null;
};

const BroadcastOfferSheetModelContext = createContext<BroadcastOfferSheetModel | null>(null);

export function BroadcastOfferSheetModelProvider({ children }: { children: ReactNode }) {
  const model = useBroadcastOfferSheetLayer();
  return (
    <BroadcastOfferSheetModelContext.Provider value={model}>{children}</BroadcastOfferSheetModelContext.Provider>
  );
}

export function useBroadcastOfferSheetModel(): BroadcastOfferSheetModel {
  const ctx = useContext(BroadcastOfferSheetModelContext);
  if (!ctx) {
    throw new Error('useBroadcastOfferSheetModel requires BroadcastOfferSheetModelProvider');
  }
  return ctx;
}

const MAP_H = 118;
/** Android: mapa da oferta mais alto (tab + folha). iOS mantém MAP_H. */
const MAP_H_ANDROID = 176;
/** Altura máxima da folha em relação à janela (ScrollView cobre overflow — evita “tela inteira”). */
const SHEET_MAX_HEIGHT_FRAC = 0.58;
/** Android: folha um pouco mais alta para caber mapa maior + botões. */
const SHEET_MAX_HEIGHT_FRAC_ANDROID = 0.64;
/** Evita spinner infinito se a permissão de local não resolver (bug conhecido em alguns builds iOS). */
const PERMISSION_MS = 12000;
/** Evita spinner infinito se o GPS não resolver (simulador / permissões). */
const GPS_POSITION_MS = 20000;
/** Velocidade média urbana (m/s) só para ETA aproximado quando o OSRM não responde. */
const FALLBACK_URBAN_SPEED_MS = 28 / 3.6;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Evita 0,0 e NaN como “destino” no texto de endereço. */
function isTriviallyEmptyMapCoords(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  if (Math.abs(lat) < 1e-8 && Math.abs(lng) < 1e-8) return true;
  return false;
}

/** Mesma lógica do dashboard prestador: endereço textual ou coordenadas. */
function serviceAddressLineForOffer(t: any): string {
  const top = t?.locationAddress;
  if (top != null && String(top).trim()) return String(top).trim();
  const meta = taskMetadataRecord(t);
  for (const k of ['locationAddress', 'serviceAddress', 'endereco', 'address']) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  const c = parseCoordLatLng(t);
  if (c && !isTriviallyEmptyMapCoords(c.lat, c.lng)) {
    return `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  }
  return '';
}

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

function useBroadcastOfferSheetLayer(): BroadcastOfferSheetModel {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const sheetMaxHeight = Math.min(
    windowHeight *
      (Platform.OS === 'android' ? SHEET_MAX_HEIGHT_FRAC_ANDROID : SHEET_MAX_HEIGHT_FRAC),
    windowHeight - Math.max(insets.top, 8)
  );
  const mapPreviewHeight = Platform.OS === 'android' ? MAP_H_ANDROID : MAP_H;
  /**
   * Rodapé (Recusar / Aceitar):
   * Não usar `tabBarOuterHeight` + grande extra — duplicava a “altura da tab” e criava faixa branca enorme
   * abaixo dos botões. Basta área segura + folga curta sobre gestos / FAB.
   */
  const footerBottomPadIos = 12 + Math.max(insets.bottom, TAB_BAR_INSETS_BOTTOM_MIN);
  /** Android: botões pouco acima do rodapé (gestos / tab) — valores moderados para não criar faixa branca. */
  const footerBottomPadAndroidRoot = 10 + Math.max(insets.bottom, 16) + 16;
  const footerBottomPadAndroidEmbedded = 10 + Math.max(insets.bottom, 20) + 12;
  const {
    broadcastOfferTasks,
    setBroadcastOfferTasks,
    invokeAcceptOffer,
    invokeRejectOffer,
  } = useProviderBroadcastOffer();

  const task = broadcastOfferTasks[0] ?? null;
  const visible = broadcastOfferTasks.length > 0;

  const dest = task ? parseCoordLatLng(task) : null;
  /** Primitivos estáveis — o objeto `dest` muda de referência a cada render e quebrava useCallback/useEffect. */
  const destLat = dest?.lat;
  const destLng = dest?.lng;
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [distText, setDistText] = useState<string>('—');
  const [etaText, setEtaText] = useState<string>('—');
  /** Ignore atualizações de texto de corridas antigas; dist/eta só da última carga. */
  const metricsLoadSeqRef = useRef(0);
  /** Várias cargas sobrepostas — só desliga o spinner quando a última termina. */
  const metricsInflightRef = useRef(0);

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

  const applyDistEtaIfCurrent = useCallback((seq: number, dist: string, eta: string) => {
    if (metricsLoadSeqRef.current === seq) {
      setDistText(dist);
      setEtaText(eta);
    }
  }, []);

  const loadOsrm = useCallback(
    async (t: any | null) => {
      if (!t || destLat == null || destLng == null) {
        setDistText('—');
        setEtaText('—');
        return;
      }
      const mySeq = ++metricsLoadSeqRef.current;
      metricsInflightRef.current += 1;
      setMetricsLoading(true);
      try {
        let status: PermissionStatus;
        try {
          const perm = await Promise.race([
            Location.requestForegroundPermissionsAsync(),
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('perm_timeout')), PERMISSION_MS)
            ),
          ]);
          status = perm.status;
        } catch {
          status = PermissionStatus.DENIED;
        }
        if (status !== 'granted') {
          applyDistEtaIfCurrent(mySeq, '—', '—');
          return;
        }
        let loc: Location.LocationObject;
        try {
          loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<Location.LocationObject>((_, rej) =>
              setTimeout(() => rej(new Error('gps_timeout')), GPS_POSITION_MS)
            ),
          ]);
        } catch {
          applyDistEtaIfCurrent(mySeq, '—', '—');
          return;
        }
        const oLat = loc.coords.latitude;
        const oLng = loc.coords.longitude;
        const m = await fetchDrivingLegMetrics(oLat, oLng, destLat, destLng, { timeoutMs: 22000 });
        if (!m.ok) {
          const hm = haversineMeters(
            { lat: oLat, lng: oLng },
            { lat: destLat, lng: destLng }
          );
          if (Number.isFinite(hm) && hm > 0) {
            const minEst = Math.max(1, Math.round(hm / FALLBACK_URBAN_SPEED_MS / 60));
            applyDistEtaIfCurrent(mySeq, formatMetersForUi(hm), `~${minEst} min`);
          } else {
            applyDistEtaIfCurrent(mySeq, '—', '—');
          }
          return;
        }
        const dm = m.distanceMeters;
        const dLabel = dm != null && Number.isFinite(dm) ? formatMetersForUi(dm) : '—';
        const min = m.durationSeconds != null ? Math.max(1, Math.round(m.durationSeconds / 60)) : null;
        const eLabel = min != null ? `${min} min` : '—';
        applyDistEtaIfCurrent(mySeq, dLabel, eLabel);
      } catch {
        applyDistEtaIfCurrent(mySeq, '—', '—');
      } finally {
        metricsInflightRef.current = Math.max(0, metricsInflightRef.current - 1);
        if (metricsInflightRef.current === 0) {
          setMetricsLoading(false);
        }
      }
    },
    [applyDistEtaIfCurrent, destLat, destLng]
  );

  useEffect(() => {
    void loadOsrm(task);
  }, [task?.id, destLat, destLng, loadOsrm]);

  /** Se algum await nativo ignorar deadline, o spinner não pode ficar eterno. */
  useEffect(() => {
    if (!metricsLoading) return;
    const id = setTimeout(() => setMetricsLoading(false), 22000);
    return () => clearTimeout(id);
  }, [metricsLoading]);

  const durMinutes = task ? expectedFormDurationMinutes(task) : null;
  const durLabel = durMinutes != null ? `${durMinutes} min` : '—';
  const serviceAddressLine = task ? serviceAddressLineForOffer(task) : '';

  const countdownSec = useOfferCountdownSeconds(task);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  /** Expandido = folha completa; minimizado = só faixa inferior (oferta continua na fila). */
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const lastOfferTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    const tid = task?.id != null ? String(task.id) : null;
    if (tid === null) {
      lastOfferTaskIdRef.current = null;
      return;
    }
    if (lastOfferTaskIdRef.current !== tid) {
      lastOfferTaskIdRef.current = tid;
      setSheetExpanded(true);
    }
  }, [task?.id]);

  /** Toque fora (backdrop): minimiza; não remove a oferta. */
  const onDismiss = useCallback(() => {
    if (busy) return;
    setSheetExpanded(false);
  }, [busy]);

  const onExpandFromMinimized = useCallback(() => {
    setSheetExpanded(true);
  }, []);

  const modalKey = visible && task ? `broadcast-offer-${String(task.id)}` : 'broadcast-offer-hidden';

  const renderLayer = useCallback(
    (embeddedInTransitModal: boolean, mode: BroadcastOfferSheetMode) => {
      if (!visible || !task) return null;
      const footerPad =
        Platform.OS === 'android'
          ? embeddedInTransitModal
            ? footerBottomPadAndroidEmbedded
            : footerBottomPadAndroidRoot
          : footerBottomPadIos;

      if (mode === 'minimized') {
        const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
        return (
          <View
            style={[
              styles.minimizedBar,
              {
                backgroundColor: C.cardWhite,
                paddingBottom: bottomPad,
                paddingTop: 10,
                borderColor: C.border,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onExpandFromMinimized}
              accessibilityRole="button"
              accessibilityLabel="Abrir oferta de demanda"
              style={styles.minimizedBarInner}
            >
              <View style={[styles.handle, { backgroundColor: C.border, marginBottom: 8 }]} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${C.accent}22`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="flash" size={20} color={C.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.textLight }} numberOfLines={1}>
                    {taskOsLabel(task)}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: C.slate }} numberOfLines={1}>
                    Nova demanda · toque para ver
                  </Text>
                </View>
                {countdownSec != null ? (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '900',
                      color: '#DC2626',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatMmSs(countdownSec)}
                  </Text>
                ) : null}
                <Ionicons name="chevron-up" size={22} color={C.textSecondary} />
              </View>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} android_disableSound />
          <View
            style={[
              styles.sheetWrap,
              Platform.OS === 'android' ? { elevation: 9999 } : null,
              { zIndex: 9999 },
            ]}
          >
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: C.cardWhite,
                  height: sheetMaxHeight,
                  maxHeight: sheetMaxHeight,
                },
              ]}
            >
              {task ? (
                <>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    bounces={false}
                    nestedScrollEnabled
                    style={styles.sheetScroll}
                    contentContainerStyle={styles.sheetScrollContent}
                  >
                    <View style={[styles.handle, { backgroundColor: C.border }]} />

                    <Text style={{ fontSize: 11, fontWeight: '600', color: C.textLight, marginBottom: 6 }}>
                      {taskOsLabel(task)}
                    </Text>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: C.slate, marginBottom: 4 }}>
                      Surgiu uma nova demanda para sua área
                    </Text>
                    <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 10 }} numberOfLines={2}>
                      {offerSubtitleLine(task)}
                    </Text>
                    {serviceAddressLine ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 8,
                          marginBottom: 10,
                          paddingHorizontal: 2,
                        }}
                      >
                        <Ionicons name="location-outline" size={18} color={C.textSecondary} style={{ marginTop: 1 }} />
                        <Text style={{ fontSize: 13, color: C.slate, fontWeight: '600', flex: 1 }} numberOfLines={4}>
                          {serviceAddressLine}
                        </Text>
                      </View>
                    ) : null}

                    <View style={[styles.mapWrap, { height: mapPreviewHeight, borderColor: C.border }]}>
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
                          { k: 'dur', label: 'DURAÇÃO', value: durLabel, color: C.accent },
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
                        backgroundColor: `${C.accent}22`,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                        <Ionicons name="flash" size={18} color={C.accent} />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '900',
                            color: C.accent,
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
                  </ScrollView>

                  <View
                    style={[
                      styles.sheetFooter,
                      {
                        borderTopColor: C.border,
                        backgroundColor: C.cardWhite,
                        paddingBottom: footerPad,
                      },
                    ]}
                  >
                    <View
                    style={{
                      flexDirection: 'row',
                      gap: 10,
                      paddingTop: Platform.OS === 'android' ? 6 : 12,
                    }}
                  >
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
                          backgroundColor: C.accent,
                        }}
                      >
                        {busy === 'accept' ? (
                          <ActivityIndicator size="small" color={C.cardWhite} />
                        ) : (
                          <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 14 }}>Aceitar</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [
      mapPreviewHeight,
      footerBottomPadAndroidEmbedded,
      footerBottomPadAndroidRoot,
      footerBottomPadIos,
      visible,
      task,
      C,
      insets.bottom,
      sheetMaxHeight,
      serviceAddressLine,
      durLabel,
      distText,
      etaText,
      metricsLoading,
      countdownSec,
      busy,
      dest,
      mapRegion,
      onDismiss,
      onExpandFromMinimized,
      invokeAcceptOffer,
      invokeRejectOffer,
      setBroadcastOfferTasks,
    ]
  );

  return { visible, sheetExpanded, modalKey, onDismiss, renderLayer };
}

/**
 * Folha global (Modal raiz). Com o mapa de deslocamento em ecrã inteiro, desactiva-se —
 * iOS e Android: um segundo `Modal` na árvore raiz fica atrás do `Modal` nativo do mapa;
 * a folha passa a desenhar-se dentro do mapa (`BroadcastOfferSheetEmbedded`).
 */
export function ProviderBroadcastOfferSheet() {
  const { transitMapExpanded } = useTransitMapExpanded();
  const { visible, sheetExpanded, modalKey, onDismiss, renderLayer } = useBroadcastOfferSheetModel();
  if (transitMapExpanded) return null;
  if (!visible) return null;

  /** Minimizado: sem Modal de ecrã inteiro — toques passam à app; só a faixa inferior é interactiva. */
  if (!sheetExpanded) {
    return (
      <View style={styles.floatingMinimizedHost} pointerEvents="box-none" collapsable={false}>
        {renderLayer(false, 'minimized')}
      </View>
    );
  }

  return (
    <Modal
      key={modalKey}
      visible
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent={Platform.OS === 'android'}
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      {renderLayer(false, 'expanded')}
    </Modal>
  );
}

/**
 * Overlay dentro do `Modal` do mapa de deslocamento (iOS + Android).
 * Sem isto, um `Modal` na raiz compete com o do mapa e fica invisível por baixo.
 *
 * iOS: **não** usar `Modal` aninhado aqui — quebra o hit-testing em builds recentes (toques mortos
 * em botões por baixo, inclusive fora deste ecrã). Usamos `View` em ecrã inteiro + zIndex (igual ao Android).
 */
export function BroadcastOfferSheetEmbedded() {
  const { transitMapExpanded } = useTransitMapExpanded();
  const { visible, sheetExpanded, renderLayer } = useBroadcastOfferSheetModel();
  if (!transitMapExpanded || !visible) return null;

  if (!sheetExpanded) {
    return (
      <View style={styles.embeddedMinimizedHost} pointerEvents="box-none" collapsable={false}>
        {renderLayer(true, 'minimized')}
      </View>
    );
  }

  return (
    <View style={styles.embeddedRoot} pointerEvents="box-none" collapsable={false}>
      {renderLayer(true, 'expanded')}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Folha minimizada sobre o dashboard (fora de Modal — toques no resto da tela passam). */
  floatingMinimizedHost: {
    ...Platform.select({
      ios: { zIndex: 200000 },
      android: { elevation: 200000 },
      default: {},
    }),
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** Barra compacta — mesmo estilo no mapa embutido (só fundo local). */
  embeddedMinimizedHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
    elevation: 100000,
  },
  minimizedBar: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  minimizedBarInner: {
    width: '100%',
  },
  /** Cobre todo o `Modal` do mapa de deslocamento — folha acima do conteúdo nativo. */
  embeddedRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
    ...Platform.select({
      ios: {
        /** Acima do MapView e restantes overlays no modal de deslocamento. */
        zIndex: 999999,
      },
      default: {},
    }),
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  /** Garante stacking acima da tab (Android). */
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 6,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sheetScroll: {
    flex: 1,
    minHeight: 0,
  },
  sheetScrollContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  sheetFooter: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
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
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
