import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  RefreshControl,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import {
  SERVICE_CATEGORY_COLORS,
  MEDIA_TAG_COLORS,
  MODE_SEGMENT_COLORS,
  type ColorPalette,
} from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { AssetCard } from '../../src/components/AssetCard';
import { Asset } from '../../src/types/asset';
import { LinearGradient } from 'expo-linear-gradient';
import { getRootAssets, getLocalAssets, getServiceCategories, saveServiceCategories } from '../../src/database';
import { ApiService, ProviderService } from '../../src/services/api';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Badge } from '../../src/components/Badge';
import { StockService } from '../../src/services/stockService';
import { StockItem } from '../../src/types/stock';
import { useAuth } from '../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../src/context/AppContext';
import { API_BASE, apiFetch } from '../../src/services/auth';
import { getOsrmBaseUrl } from '../../src/services/osrmConfig';
import { fetchTravelDurationsFromOrigin, fetchStitchedDrivingRouteLatLng } from '../../src/services/osrmClient';
import { useManualSync } from '../../src/hooks/useManualSync';
import { useConnectivity } from '../../src/hooks/useConnectivity';
import {
  pushSyncQueue,
  pullTasks,
  enqueueExecutionStatusPatch,
  getTaskIdsWithPendingExecutionStatusOutbox,
  purgeExpiredCompletedExecutionCaches,
  COMPLETED_BODY_LOCAL_TTL_MS,
} from '../../src/services/syncService';
import { taskOsLabel } from '../../src/utils/taskOsLabel';
import { LocationZoneTypeBadge } from '../../src/components/LocationZoneTypeBadge';
import MapView, { Marker, Callout, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Categorias de Serviço (Circular Style) — IDs batem com o backend ────────
const SERVICE_CATEGORIES = [
  { id: 'all',          labelKey: 'all',          icon: 'apps',                   color: SERVICE_CATEGORY_COLORS.all },
  { id: 'Elétrica',    labelKey: 'electrical',    icon: 'flash',                  color: SERVICE_CATEGORY_COLORS['Elétrica'] },
  { id: 'Hidráulica',  labelKey: 'plumbing',      icon: 'water-outline',          color: SERVICE_CATEGORY_COLORS['Hidráulica'] },
  { id: 'Limpeza',     labelKey: 'cleaning',      icon: 'sparkles-outline',       color: SERVICE_CATEGORY_COLORS['Limpeza'], isMCI: false },
  { id: 'Reformas',    labelKey: 'renovation',    icon: 'hammer',                 color: SERVICE_CATEGORY_COLORS['Reformas'] },
  { id: 'Jardinagem',  labelKey: 'garden',        icon: 'leaf-outline',           color: SERVICE_CATEGORY_COLORS['Jardinagem'] },
  { id: 'Segurança',   labelKey: 'security',      icon: 'shield-checkmark',       color: SERVICE_CATEGORY_COLORS['Segurança'] },
  { id: 'Climatização',labelKey: 'climatization', icon: 'thermometer-outline',    color: SERVICE_CATEGORY_COLORS['Climatização'] },
  { id: 'Tecnologia',  labelKey: 'technology',    icon: 'laptop-outline',         color: SERVICE_CATEGORY_COLORS['Tecnologia'] },
];

/** Limite seguro para o OSRM (1 origem + destinos) */
const OSRM_MAX_DESTINATIONS = 90;
/** Mantido na assinatura por compatibilidade; a geometria segue o mapa de deslocamento (só trechos OSRM). */
const OSRM_MAX_WAYPOINTS_FOR_GEOMETRY = 28;
/** Igual a `LiveRouteMapCard`: voltar a pedir geometria até o GPS/OSRM responder. */
const OSRM_ROUTE_MAP_RETRY_MS = 12000;

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

/** Distância em metros (aprox.) entre dois pontos WGS84. */
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

/**
 * Pins com o mesmo endereço (ou < ~50 m) sobrepõem-se no MapKit; o 1 cobre o 2 com zIndex alto.
 * Desloca só a posição **do marcador** (a polilinha continua nas coords reais).
 */
function spreadOverlappingRouteMarkerCoords(
  coords: { lat: number; lng: number }[],
  minSeparationM = 52
): { latitude: number; longitude: number }[] {
  const n = coords.length;
  const out = coords.map((c) => ({ latitude: c.lat, longitude: c.lng }));
  if (n < 2) return out;

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (haversineMeters(coords[i], coords[j]) < minSeparationM) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }

  const stepM = 38;
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((a, b) => a - b);
    let sumLat = 0;
    let sumLng = 0;
    for (const i of idxs) {
      sumLat += coords[i].lat;
      sumLng += coords[i].lng;
    }
    const cLat = sumLat / idxs.length;
    const cLng = sumLng / idxs.length;
    const cosLat = Math.cos((cLat * Math.PI) / 180) || 0.35;
    const metersToLat = stepM / 111_320;
    const metersToLng = stepM / (111_320 * cosLat);

    idxs.forEach((idx, slot) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * slot) / idxs.length;
      out[idx] = {
        latitude: cLat + Math.sin(angle) * metersToLat,
        longitude: cLng + Math.cos(angle) * metersToLng,
      };
    });
  }

  return out;
}

/** Mesma ordenação da lista “Rota do dia” (para polilinha bater com os números 1,2,3…). */
function sortTasksForOsrmRoute(
  tasks: any[],
  mode: 'NEWEST' | 'OLDEST' | 'OSRM_ROUTE' | 'OSRM_SLA_ROUTE',
  osrmDurations: Record<string, number>
): any[] {
  return [...tasks].sort((a, b) => {
    if (mode === 'OSRM_ROUTE' || mode === 'OSRM_SLA_ROUTE') {
      const d1 = osrmDurations[String(a.id)] ?? 999999;
      const d2 = osrmDurations[String(b.id)] ?? 999999;
      if (mode === 'OSRM_SLA_ROUTE') {
        const getScore = (item: any, durationSecs: number) => {
          const durationMins = durationSecs / 60;
          if (!item.dueDate) return durationMins;
          const msToDue = new Date(item.dueDate).getTime() - Date.now();
          const minsToDue = msToDue / 60000;
          let urgencyDiscount = 0;
          if (minsToDue < 0) urgencyDiscount = 999999;
          else if (minsToDue < 120) urgencyDiscount = (120 - minsToDue) * 5;
          else if (minsToDue < 1440) urgencyDiscount = (1440 - minsToDue) * 0.1;
          return durationMins - urgencyDiscount;
        };
        return getScore(a, d1) - getScore(b, d2);
      }
      return d1 - d2;
    }
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (isNaN(tA) || isNaN(tB)) return 0;
    return mode === 'NEWEST' ? tB - tA : tA - tB;
  });
}

function taskMetadataRecord(t: any): Record<string, unknown> {
  const m = t?.metadata;
  if (m == null) return {};
  if (typeof m === 'string') {
    try {
      const o = JSON.parse(m);
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }
  if (typeof m === 'object') return m as Record<string, unknown>;
  return {};
}

/** Nome do solicitante (metadata do despacho / integração). */
function providerTaskRequesterDisplayName(t: any): string {
  const meta = taskMetadataRecord(t);
  for (const k of ['requesterName', 'clientName', 'solicitante', 'customerName', 'contactName', 'requester', 'requesterLabel']) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

/** Endereço do local de atendimento ou coordenadas aproximadas. */
function providerTaskServiceAddressLine(t: any): string {
  const top = t?.locationAddress;
  if (top != null && String(top).trim()) return String(top).trim();
  const meta = taskMetadataRecord(t);
  for (const k of ['locationAddress', 'serviceAddress', 'endereco', 'address']) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  const la = Number(t?.locationLat);
  const ln = Number(t?.locationLng);
  if (Number.isFinite(la) && Number.isFinite(ln)) return `${la.toFixed(5)}, ${ln.toFixed(5)}`;
  return '';
}

function parseProviderTaskLocationPolygon(t: any): number[][] | null {
  const raw = t?.locationPolygon;
  if (raw == null) return null;
  if (Array.isArray(raw) && raw.length > 0) return raw as number[][];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) && p.length > 0 ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Coordenadas do ponto de destino no mapa (1.º vértice em rota/trecho; senão lat/lng da OS). */
function providerTaskMapTargetCoords(t: any): { lat: number; lng: number } | null {
  const z = String(t?.locationZoneType || '').toLowerCase();
  const poly = parseProviderTaskLocationPolygon(t);
  if ((z === 'route' || z === 'segment') && poly && poly.length >= 1) {
    const la = Number(poly[0][0]);
    const ln = Number(poly[0][1]);
    if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
  }
  const la = Number(t?.locationLat);
  const ln = Number(t?.locationLng);
  if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
  return null;
}

function openProviderTaskInExternalMaps(t: any) {
  const dest = providerTaskMapTargetCoords(t);
  const label = (providerTaskServiceAddressLine(t) || 'Destino').slice(0, 120);
  if (dest) {
    const { lat, lng } = dest;
    if (Platform.OS === 'android') {
      void Linking.openURL(`geo:0,0?q=${lat},${lng}(Local da OS)`);
      return;
    }
    const options: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      { text: 'Waze', onPress: () => void Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
      {
        text: 'Google Maps',
        onPress: () =>
          void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
      },
      {
        text: 'Apple Maps',
        onPress: () => void Linking.openURL(`maps://?daddr=${lat},${lng}`),
      },
      { text: 'Cancelar', style: 'cancel' },
    ];
    Alert.alert('Abrir no mapa', label, options);
  } else {
    const q = providerTaskServiceAddressLine(t);
    if (q) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      void Linking.openURL(url).catch(() =>
        Alert.alert('Erro', 'Não foi possível abrir o mapa.')
      );
    } else {
      Alert.alert('Localização', 'Esta OS não tem coordenadas nem endereço para abrir no mapa.');
    }
  }
}

/** Cliente/local, cronograma e descrição — modal da OS e painel "Detalhes" nos cards. */
function ProviderTaskDetailSections({ task, compact }: { task: any; compact?: boolean }) {
  const { colors: P } = useTheme();
  const mbMain = compact ? 10 : 20;
  const mbSchedule = compact ? 10 : 24;
  const mbDesc = compact ? 0 : 32;
  const pad = compact ? 12 : 16;
  const cardRadius = compact ? 12 : 16;
  const scheduleBorder = compact ? P.border : P.divider;
  const linkBlue = P.status.info.fg;

  return (
    <>
      <View
        style={{
          backgroundColor: P.background,
          borderRadius: cardRadius,
          padding: pad,
          marginBottom: mbMain,
          borderWidth: 1,
          borderColor: P.border,
        }}
      >
        <Text
          style={{
            fontSize: compact ? 11 : 13,
            fontWeight: '800',
            color: P.textLight,
            textTransform: 'uppercase',
            marginBottom: compact ? 8 : 10,
            letterSpacing: 0.5,
          }}
        >
          Cliente e local
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
          <Ionicons
            name="person-outline"
            size={compact ? 16 : 18}
            color={P.textLight}
            style={{ marginRight: compact ? 10 : 12, marginTop: 2 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: compact ? 10 : 11, color: P.textLight, fontWeight: '600' }}>Solicitante</Text>
            <Text style={{ fontSize: compact ? 14 : 15, color: P.slate, fontWeight: '700' }}>
              {providerTaskRequesterDisplayName(task) || '—'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <TouchableOpacity
            onPress={() => openProviderTaskInExternalMaps(task)}
            accessibilityRole="button"
            accessibilityLabel="Abrir local no mapa"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: compact ? 8 : 10, marginTop: 0, padding: 4 }}
          >
            <Ionicons name="location-outline" size={compact ? 20 : 22} color={linkBlue} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: compact ? 10 : 11, color: P.textLight, fontWeight: '600' }}>Local de atendimento</Text>
            <TouchableOpacity
              onPress={() => openProviderTaskInExternalMaps(task)}
              activeOpacity={0.65}
              disabled={!providerTaskServiceAddressLine(task) && !providerTaskMapTargetCoords(task)}
            >
              <Text
                style={{
                  fontSize: compact ? 14 : 15,
                  color:
                    providerTaskServiceAddressLine(task) || providerTaskMapTargetCoords(task) ? linkBlue : P.textSecondary,
                  fontWeight: '600',
                  lineHeight: 22,
                  textDecorationLine:
                    providerTaskServiceAddressLine(task) || providerTaskMapTargetCoords(task) ? 'underline' : 'none',
                }}
              >
                {providerTaskServiceAddressLine(task) || '—'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View
        style={{
          backgroundColor: P.background,
          borderRadius: cardRadius,
          padding: pad,
          marginBottom: mbSchedule,
          borderWidth: 1,
          borderColor: scheduleBorder,
        }}
      >
        <Text
          style={{
            fontSize: compact ? 11 : 13,
            fontWeight: '800',
            color: P.textLight,
            textTransform: 'uppercase',
            marginBottom: 8,
            letterSpacing: 0.5,
          }}
        >
          Cronograma
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Ionicons name="time" size={compact ? 16 : 18} color={P.textLight} style={{ marginRight: compact ? 10 : 12 }} />
          <View>
            <Text style={{ fontSize: compact ? 10 : 11, color: P.textLight, fontWeight: '600' }}>Criado em</Text>
            <Text style={{ fontSize: compact ? 13 : 14, color: P.textSecondary, fontWeight: '800' }}>
              {new Date(task.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="alert-circle" size={compact ? 16 : 18} color={P.destructive} style={{ marginRight: compact ? 10 : 12 }} />
          <View>
            <Text
              style={{
                fontSize: compact ? 10 : 11,
                color: P.destructive,
                fontWeight: '800',
                textTransform: 'uppercase',
              }}
            >
              Vencimento Limite
            </Text>
            <Text style={{ fontSize: compact ? 13 : 14, color: P.destructive, fontWeight: '900' }}>
              {new Date(task.dueDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ marginBottom: mbDesc }}>
        <Text
          style={{
            fontSize: compact ? 11 : 13,
            fontWeight: '800',
            color: P.textLight,
            textTransform: 'uppercase',
            marginBottom: 8,
            letterSpacing: 0.5,
          }}
        >
          Descrição
        </Text>
        <Text style={{ fontSize: compact ? 14 : 15, color: P.textSecondary, lineHeight: compact ? 21 : 24 }}>{task.description}</Text>
      </View>
    </>
  );
}

function metaFlagTrue(meta: Record<string, unknown>, key: string): boolean {
  const v = meta[key];
  return v === true || v === 'true' || String(v ?? '').toLowerCase() === 'true';
}

/** Pausa de deslocamento (POST /api/tracking/pause) — alinhado a `isTrackingPaused` no backend. */
function isDisplacementTrackingPausedMeta(meta: Record<string, unknown>): boolean {
  const v = meta.trackingPaused;
  if (v === false || v === 0 || v === 'false' || v === '0') return false;
  if (v === true || v === 1) return true;
  if (v === 'true' || v === '1') return true;
  return false;
}

/**
 * Ciclo de revisão após reabertura no painel: `reopenForRevisionPending` só até RECEIVED/ACCEPTED/IN_PROGRESS;
 * `revisionVisitActive` mantém-se na visita; legado: `reopenCount > 0` em execuções ainda ativas.
 */
function taskMetadataIndicatesRevisionVisit(t: any, meta: Record<string, unknown>): boolean {
  if (metaFlagTrue(meta, 'reopenForRevisionPending') || metaFlagTrue(meta, 'revisionVisitActive')) return true;
  const rc = Number(meta.reopenCount);
  return Number.isFinite(rc) && rc > 0;
}

/** OS em visita de revisão (cor índigo) enquanto ativa — cartão concluído usa verde; ver badge abaixo. */
function isProviderRevisionTask(t: any): boolean {
  const st = String(t?.status || '').toUpperCase();
  if (['COMPLETED', 'SYNCED', 'CANCELLED', 'DONE', 'CLOSED', 'ARCHIVED'].includes(st)) return false;
  const meta = taskMetadataRecord(t);
  return taskMetadataIndicatesRevisionVisit(t, meta);
}

/**
 * Badge "Revisão" em qualquer aba: visita aberta OU OS que já teve ciclo de reabertura
 * (`reopenCount` no metadata mantém-se após concluir) ou mais de uma submissão (`lastSubmittedRevision`).
 */
function providerTaskShowsRevisionBadge(t: any): boolean {
  const meta = taskMetadataRecord(t);
  if (taskMetadataIndicatesRevisionVisit(t, meta)) return true;
  const lsr = Number(t?.lastSubmittedRevision);
  if (Number.isFinite(lsr) && lsr > 1) return true;
  return false;
}

const SERVER_COMPLETED_STATUSES = new Set([
  'COMPLETED',
  'SYNCED',
  'DONE',
  'CLOSED',
  'FINISHED',
  'COMPLETE',
  'ARCHIVED',
]);

function effectiveProviderTaskStatus(
  t: any,
  completedIds: Set<string>,
  inprogressIds: Set<string>,
  acceptedIds: Set<string> = new Set()
): string {
  const raw = String(t.status || 'PENDING').toUpperCase();
  /** OS reaberta no admin: servidor manda PENDING/IN_PROGRESS/… — o cache local "executada" não pode esconder isso. */
  const serverActive = ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(raw);
  if (SERVER_COMPLETED_STATUSES.has(raw)) return 'COMPLETED';
  if (completedIds.has(String(t.id)) && !serverActive) return 'COMPLETED';
  const meta = taskMetadataRecord(t);
  const reopenRevision = taskMetadataIndicatesRevisionVisit(t, meta);
  // Revisão: como OS nova em Pendentes até aceitar; depois de aceitar / iniciar, "Em andamento".
  if (reopenRevision && (raw === 'PENDING' || raw === 'RECEIVED')) {
    if (inprogressIds.has(String(t.id)) || acceptedIds.has(String(t.id))) return 'IN_PROGRESS';
    return 'PENDING';
  }
  const pausedByMeta =
    meta.executionPaused === true ||
    meta.executionPaused === 'true' ||
    String(meta.executionPaused || '').toLowerCase() === 'true';
  if (raw === 'PAUSED' || pausedByMeta || isDisplacementTrackingPausedMeta(meta)) return 'PAUSED';
  if (inprogressIds.has(String(t.id))) return 'IN_PROGRESS';
  if (raw === 'IN_PROGRESS') return 'IN_PROGRESS';
  // Aceite no app (lista local) ou no Kanban: não deixar em "Pendentes" só porque o PATCH ainda não chegou ao servidor.
  if (acceptedIds.has(String(t.id)) && (raw === 'PENDING' || raw === 'RECEIVED')) return 'IN_PROGRESS';
  if (raw === 'RECEIVED') return 'PENDING';
  if (raw === 'ACCEPTED') return 'IN_PROGRESS';
  return raw === 'PENDING' || raw === '' ? 'PENDING' : raw;
}

function providerTabMatchesTask(
  tab: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
  status: string
): boolean {
  // PAUSED: mesma aba que "Em andamento" (OS já iniciada; cartão vermelho com badge de pausa).
  if (tab === 'PENDING') return status === 'PENDING';
  if (tab === 'IN_PROGRESS') return status === 'IN_PROGRESS' || status === 'PAUSED';
  return status === tab;
}

/** Cor do cartão alinhada ao estado efetivo (evita ficar cinza/âmbar se `order.color` ficou desatualizado). */
function providerTaskListAccentColor(
  t: any,
  completedIds: Set<string>,
  inprogressIds: Set<string>,
  acceptedIds: Set<string> = new Set(),
  P: ColorPalette
): string {
  const eff = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
  if (eff === 'COMPLETED') return P.connectivity.online;
  if (eff === 'PAUSED') return P.connectivity.offline;
  if (isProviderRevisionTask(t) && (eff === 'PENDING' || eff === 'IN_PROGRESS')) {
    return SERVICE_CATEGORY_COLORS.Tecnologia;
  }
  if (inprogressIds.has(String(t.id)) || t.isAccepted) return MEDIA_TAG_COLORS.DURING;
  return P.textLight;
}

/**
 * Mesma abordagem do mapa de deslocamento (`LiveRouteMapCard`): cada perna usa `fetchDrivingGeometryLatLng`
 * via `fetchStitchedDrivingRouteLatLng` (OSRM direto → várias bases → proxy backend por trecho).
 */
async function fetchDayRoutePolylineCoords(
  _apiBase: string,
  oLat: number,
  oLng: number,
  sortedPendentes: { locationLat: number; locationLng: number }[],
  _maxWaypointsIgnored: number
): Promise<{ latitude: number; longitude: number }[]> {
  const waypoints = [
    { lat: oLat, lng: oLng },
    ...sortedPendentes.map((p) => ({ lat: p.locationLat, lng: p.locationLng })),
  ];
  const ring = await fetchStitchedDrivingRouteLatLng(waypoints, { timeoutMs: 120000 });
  if (!ring || ring.length < 2) return [];
  return ring.map(([la, ln]) => ({ latitude: la, longitude: ln }));
}

// ─── Busca inteligente ─────────────────────────────────────────────
function smartMatch(provider: any, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matchIn = (text: string) => (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q);
  const words = q.split(/\s+/);
  if (matchIn(provider.name || '')) return true;
  if (matchIn(provider.category || '')) return true;
  // tags: backend → comma string | legacy → array
  const tagsArr: string[] = typeof provider.tags === 'string'
    ? provider.tags.split(',').filter(Boolean)
    : (Array.isArray(provider.tags) ? provider.tags : []);
  if (tagsArr.some((t: string) => matchIn(t))) return true;
  // keywords: flat string search
  const kwStr: string = typeof provider.keywords === 'string'
    ? provider.keywords
    : (Array.isArray(provider.keywords) ? provider.keywords.join(' ') : '');
  return words.some(w => kwStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(w));
}

/** PATCH IN_PROGRESS (ou fila offline) + cache `@brspark_cloud_tasks`, alinhado ao checklist. */
async function enqueueExecutionInProgressFromDashboard(taskId: string): Promise<void> {
  const id = String(taskId || '').trim();
  if (!id) return;
  const ts = new Date().toISOString();
  await enqueueExecutionStatusPatch(id, {
    status: 'IN_PROGRESS',
    timestamp: ts,
    metadata: { executionPaused: false, lastResumedAt: ts },
  });
  try {
    const raw = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
    let arr: any[] = [];
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
    if (!Array.isArray(arr)) arr = [];
    const ix = arr.findIndex((x: any) => String(x.id) === id);
    if (ix >= 0) {
      arr[ix] = {
        ...arr[ix],
        status: 'IN_PROGRESS',
        metadata: {
          ...(arr[ix].metadata || {}),
          executionPaused: false,
          lastResumedAt: ts,
        },
      };
      await AsyncStorage.setItem('@brspark_cloud_tasks', JSON.stringify(arr));
    }
  } catch {
    /* ignore */
  }
}

export default function DashboardScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createDashboardStyles(C), [C]);
  const { user, userRole } = useAuth();
  const { isOnline } = useConnectivity(8000);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Tab bar height: ~49px bar + bottom safe area inset
  const TAB_BAR_HEIGHT = 49 + insets.bottom;
  const pagerRef = useRef<ScrollView>(null);
  const mapRef = useRef<MapView>(null);
  /** Mapa modal "Rota do Dia" — ref para encaixar todas as paradas (evita zoom agressivo que some marcadores). */
  const routeDayMapRef = useRef<MapView>(null);
  const isInternalScroll = useRef(false);
  const [pagerWidth, setPagerWidth] = useState(SCREEN_W);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [pendingShares, setPendingShares] = useState<any[]>([]);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const next = new Set(expandedProviders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedProviders(next);
  };
  const [allExpanded, setAllExpanded] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const { mode, setMode } = useAppContext();
  const [svcFilter, setSvcFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<'DEFAULT' | 'RATING' | 'AGENDA' | 'VERIFIED' | 'PRICE' | 'DISTANCE'>('DEFAULT');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [assetSortMode, setAssetSortMode] = useState<'MANUAL' | 'A_Z' | 'Z_A' | 'STATUS_UP' | 'STATUS_DOWN'>('MANUAL');
  const [assetSortSheetVisible, setAssetSortSheetVisible] = useState(false);
  const [portfolioViewMode, setPortfolioViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [providerTab, setProviderTab] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('PENDING');
  const [providerTasks, setProviderTasks] = useState<any[]>([]);
  const [inprogressIds, setInprogressIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  /** IDs em `@brspark_accepted_tasks` — alinhado a `effectiveProviderTaskStatus` (aba Pendentes vs Em andamento). */
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [providerSortMode, setProviderSortMode] = useState<'NEWEST' | 'OLDEST' | 'OSRM_ROUTE' | 'OSRM_SLA_ROUTE'>('NEWEST');
  const [osrmDurations, setOsrmDurations] = useState<Record<string, number>>({});
  const [isOptimizingRoute, setIsOptimizingRoute] = useState(false);
  /** Qual modo está a ser calculado (spinner nos chips — não confundir com providerSortMode até terminar) */
  const [osrmOptimizingMode, setOsrmOptimizingMode] = useState<null | 'OSRM_ROUTE' | 'OSRM_SLA_ROUTE'>(null);
  const lastOsrmPendingKeyRef = useRef<string>('');
  const [providerSearch, setProviderSearch] = useState('');
  const [isProviderMenuExpanded, setIsProviderMenuExpanded] = useState(true);
  const [activeCardDropdown, setActiveCardDropdown] = useState<string | null>(null);

  // Which list section is currently in drag-reorder mode ('MY' | 'SHARED' | null)
  const [reorderingList, setReorderingList] = useState<'MY' | 'SHARED' | null>(null);

  // Task Card Details Modal
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState<boolean>(false);
  const [routeMapCenterObj, setRouteMapCenterObj] = useState<{lat: number, lng: number} | null>(null);
  const [osrmRouteCoords, setOsrmRouteCoords] = useState<{latitude: number, longitude: number}[]>([]);
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  /** Pendentes com coordenadas, na mesma ordem da lista quando “Rota” está ativa (mapa alinhado à timeline). */
  const routeMapTasksOrdered = useMemo(() => {
    const base = providerTasks.filter((t) => {
      const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
      if (!providerTabMatchesTask(providerTab, s)) return false;
      return parseCoordLatLng(t) != null;
    });
    if (providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE') {
      return sortTasksForOsrmRoute(base, providerSortMode, osrmDurations);
    }
    return sortTasksForOsrmRoute(base, 'NEWEST', {});
  }, [providerTasks, completedIds, inprogressIds, acceptedIds, providerTab, providerSortMode, osrmDurations]);

  /** Coordenadas só para o pin (polilinha usa coords reais). Separa pins < ~50 m para não esconder 2 atrás do 1. */
  const routeMapMarkerCoords = useMemo(() => {
    const pts = routeMapTasksOrdered
      .map((t) => parseCoordLatLng(t))
      .filter((c): c is { lat: number; lng: number } => c != null);
    return spreadOverlappingRouteMarkerCoords(pts);
  }, [routeMapTasksOrdered]);

  const providerStageCounts = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    for (const task of providerTasks) {
      const s = effectiveProviderTaskStatus(task, completedIds, inprogressIds, acceptedIds);
      if (providerTabMatchesTask('PENDING', s)) pending += 1;
      else if (providerTabMatchesTask('IN_PROGRESS', s)) inProgress += 1;
      else if (providerTabMatchesTask('COMPLETED', s)) completed += 1;
    }
    return { pending, inProgress, completed };
  }, [providerTasks, completedIds, inprogressIds, acceptedIds]);

  /** Geometria “Rota do dia” = mesmo padrão que deslocamento: tentar ao abrir e a cada 12s até haver polilinha. */
  useEffect(() => {
    if (!showRouteMap) return;
    if (providerSortMode !== 'OSRM_ROUTE' && providerSortMode !== 'OSRM_SLA_ROUTE') return;

    const normalized = routeMapTasksOrdered
      .map((t) => {
        const c = parseCoordLatLng(t);
        if (!c) return null;
        return { locationLat: c.lat, locationLng: c.lng };
      })
      .filter((x): x is { locationLat: number; locationLng: number } => x != null);
    if (normalized.length === 0) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let geometryOk = false;

    const attempt = async () => {
      if (cancelled || geometryOk) return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const line = await fetchDayRoutePolylineCoords(
          API_BASE,
          loc.coords.latitude,
          loc.coords.longitude,
          normalized,
          OSRM_MAX_WAYPOINTS_FOR_GEOMETRY
        );
        if (cancelled) return;
        if (line.length >= 2) {
          geometryOk = true;
          setOsrmRouteCoords(line);
          if (intervalId) clearInterval(intervalId);
        }
      } catch (e) {
        if (__DEV__) console.warn('[route map] geometria', e);
      }
    };

    void attempt();
    intervalId = setInterval(() => void attempt(), OSRM_ROUTE_MAP_RETRY_MS);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [showRouteMap, providerSortMode, routeMapTasksOrdered]);

  /** Mostra todas as paradas com número (evita initialRegion 0.02 ao focar um pin — no iOS some vista/intermediários). */
  useEffect(() => {
    if (!showRouteMap) return;
    const coords = routeMapTasksOrdered
      .map((t) => {
        const c = parseCoordLatLng(t);
        return c ? { latitude: c.lat, longitude: c.lng } : null;
      })
      .filter((x): x is { latitude: number; longitude: number } => x != null);
    if (coords.length === 0) return;

    const run = () => {
      const m = routeDayMapRef.current;
      if (!m) return;
      if (coords.length === 1) {
        m.animateToRegion(
          { ...coords[0], latitudeDelta: 0.08, longitudeDelta: 0.08 },
          320
        );
        return;
      }
      try {
        m.fitToCoordinates(coords, {
          edgePadding: { top: 112, right: 48, bottom: 88, left: 48 },
          animated: true,
        });
      } catch {
        /* MapView ainda a montar */
      }
    };

    let tid: ReturnType<typeof setTimeout> | null = null;
    const raf = requestAnimationFrame(() => {
      tid = setTimeout(run, 200);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (tid) clearTimeout(tid);
    };
  }, [showRouteMap, routeMapTasksOrdered]);

  const handleOptimizeRoute = async (mode: 'OSRM_ROUTE' | 'OSRM_SLA_ROUTE') => {
    const pendentesAll = providerTasks.filter((t) => {
      const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
      return providerTabMatchesTask(providerTab, s);
    });
    const pendentes = pendentesAll
      .map((t) => ({ t, c: parseCoordLatLng(t) }))
      .filter((x): x is { t: any; c: { lat: number; lng: number } } => x.c !== null)
      .map((x) => ({ ...x.t, locationLat: x.c.lat, locationLng: x.c.lng }));

    if (pendentes.length === 0) {
        Alert.alert("Aviso", "Não há nenhuma atividade pendente com coordenadas de destino cadastradas para criar percurso.");
        return;
    }

    let slice = pendentes;
    if (pendentes.length > OSRM_MAX_DESTINATIONS) {
      slice = pendentes.slice(0, OSRM_MAX_DESTINATIONS);
      Alert.alert(
        'Limite de pontos',
        `Só os primeiros ${OSRM_MAX_DESTINATIONS} destinos com coordenadas entram no cálculo (limite do serviço OSRM).`
      );
    }

    setIsOptimizingRoute(true);
    setOsrmOptimizingMode(mode);
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error("Permissão de GPS negada.");

        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const oLng = location.coords.longitude;
        const oLat = location.coords.latitude;

        const osrmBase = await getOsrmBaseUrl();
        const { byId: newDurs } = await fetchTravelDurationsFromOrigin(
          osrmBase,
          oLat,
          oLng,
          slice.map((p) => ({
            id: String(p.id),
            locationLat: p.locationLat,
            locationLng: p.locationLng,
          }))
        );

        const sortedPendentes = [...slice].sort((a,b) => {
           const d1 = newDurs[String(a.id)] ?? 999999;
           const d2 = newDurs[String(b.id)] ?? 999999;
           if (mode === 'OSRM_SLA_ROUTE') {
               const getScore = (item: any, durationSecs: number) => {
                   const durationMins = durationSecs / 60;
                   if (!item.dueDate) return durationMins;
                   const msToDue = new Date(item.dueDate).getTime() - Date.now();
                   const minsToDue = msToDue / 60000;
                   let urgencyDiscount = 0;
                   if (minsToDue < 0) urgencyDiscount = 999999;
                   else if (minsToDue < 120) urgencyDiscount = (120 - minsToDue) * 5;
                   else if (minsToDue < 1440) urgencyDiscount = (1440 - minsToDue) * 0.1;
                   return durationMins - urgencyDiscount;
               };
               return getScore(a, d1) - getScore(b, d2);
           }
           return d1 - d2;
        });

        setOsrmDurations(newDurs);
        setProviderSortMode(mode);
        lastOsrmPendingKeyRef.current = slice.map((p) => String(p.id)).sort().join('|');

        /* Polilinha: vários trechos OSRM — não bloquear o spinner nem a lista (igual prioridade ao ordenamento). */
        void (async () => {
          try {
            const polyCoords = await fetchDayRoutePolylineCoords(
              API_BASE,
              oLat,
              oLng,
              sortedPendentes,
              OSRM_MAX_WAYPOINTS_FOR_GEOMETRY
            );
            setOsrmRouteCoords(polyCoords);
          } catch (e) {
            if (__DEV__) console.warn('[route poly] pós-otimização', e);
          }
        })();
    } catch (err: any) {
        Alert.alert("Erro de Roteamento", err?.message || String(err));
    } finally {
        setIsOptimizingRoute(false);
        setOsrmOptimizingMode(null);
    }
  };

  const onSortRoutePress = (mode: 'OSRM_ROUTE' | 'OSRM_SLA_ROUTE') => {
      if (providerSortMode === mode) return;

      const pendentesIds = providerTasks
        .filter((t) => {
          const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
          return providerTabMatchesTask(providerTab, s);
        })
        .filter((t) => parseCoordLatLng(t) !== null)
        .map((t) => String(t.id));

      const pendingKey = [...pendentesIds].sort().join('|');
      const listChanged = lastOsrmPendingKeyRef.current !== '' && lastOsrmPendingKeyRef.current !== pendingKey;
      const needsRecalc =
        listChanged ||
        pendentesIds.some((id) => osrmDurations[id] === undefined) ||
        Object.keys(osrmDurations).length === 0;

      if (needsRecalc) {
          handleOptimizeRoute(mode);
      } else {
          setProviderSortMode(mode);
          void (async () => {
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') return;
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              const pendentesAll = providerTasks.filter((t) => {
                const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
                return providerTabMatchesTask(providerTab, s);
              });
              const pendentes = pendentesAll
                .map((t) => ({ t, c: parseCoordLatLng(t) }))
                .filter((x): x is { t: any; c: { lat: number; lng: number } } => x.c !== null)
                .map((x) => ({ ...x.t, locationLat: x.c.lat, locationLng: x.c.lng }));
              if (pendentes.length === 0) return;
              const sortedPendentes = [...pendentes].sort((a, b) => {
                const d1 = osrmDurations[String(a.id)] ?? 999999;
                const d2 = osrmDurations[String(b.id)] ?? 999999;
                if (mode === 'OSRM_SLA_ROUTE') {
                  const getScore = (item: any, durationSecs: number) => {
                    const durationMins = durationSecs / 60;
                    if (!item.dueDate) return durationMins;
                    const msToDue = new Date(item.dueDate).getTime() - Date.now();
                    const minsToDue = msToDue / 60000;
                    let urgencyDiscount = 0;
                    if (minsToDue < 0) urgencyDiscount = 999999;
                    else if (minsToDue < 120) urgencyDiscount = (120 - minsToDue) * 5;
                    else if (minsToDue < 1440) urgencyDiscount = (1440 - minsToDue) * 0.1;
                    return durationMins - urgencyDiscount;
                  };
                  return getScore(a, d1) - getScore(b, d2);
                }
                return d1 - d2;
              });
              const polyCoords = await fetchDayRoutePolylineCoords(
                API_BASE,
                loc.coords.latitude,
                loc.coords.longitude,
                sortedPendentes,
                OSRM_MAX_WAYPOINTS_FOR_GEOMETRY
              );
              setOsrmRouteCoords(polyCoords);
            } catch (e) {
              console.warn('[route poly] atualizar ao mudar modo', e);
            }
          })();
      }
  };

  const moveAsset = (index: number, direction: 'UP' | 'DOWN', currentList: Asset[], isGlobal: boolean) => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === currentList.length - 1) return;

    const clone = [...currentList];
    const swapIdx = direction === 'UP' ? index - 1 : index + 1;
    [clone[index], clone[swapIdx]] = [clone[swapIdx], clone[index]];

    const updates: { id: string; displayOrder: number }[] = [];
    clone.forEach((item, i) => {
      item.displayOrder = i + 1;
      updates.push({ id: item.id, displayOrder: i + 1 });
    });

    import('../../src/database').then(({ updateAssetOrder }) => {
      updateAssetOrder(updates, user?.email || '');
    });

    const applySwap = (prev: Asset[]) =>
      prev.map(a => { const found = clone.find(c => c.id === a.id); return found ? { ...a, displayOrder: found.displayOrder } : a; });

    if (isGlobal) setAllAssets(applySwap);
    else setAssets(applySwap);
  };


  const handleSolicitar = (providerName: string) => {
    if (!user) {
      Alert.alert(
        t('home.createAccount'),
        t('home.createAccountMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('home.login'), onPress: () => router.push('/auth/login' as any) },
        ]
      );
      return;
    }
    // TODO: Navigate to service request flow
    Alert.alert(t('home.requestService'), t('home.requestServiceMsg', { name: providerName }));
  };

  /** Evita corridas: vários loadData (focus + poller a cada 5s) não podem sobrescrever `inprogressIds` com leituras antigas do AsyncStorage. */
  const loadDataChainRef = useRef(Promise.resolve());
  /** `false` = último check de rede foi offline; usado para disparar sync em rajada ao voltar online. */
  const reconnectOnlineRef = useRef<boolean | null>(null);

  const loadData = (triggerSync = false) => {
    const run = async () => {
    // Bens: apenas para usuários autenticados
    if (user) {
      const email = user.email || '';

      // Auto-sync: se banco local estiver vazio OU sync explícito solicitado
      const localAssets = getRootAssets(email, { includeMobileWarehouse: false });
      if (triggerSync || localAssets.length === 0) {
        try {
          await ApiService.sync(email);
        } catch (e) {
          console.warn('[Portfolio] Auto-sync falhou:', e);
        }
      }

      // Buscar ordens do prestador via agenda service
      try {
         const { AgendaService } = require('../../src/services/agendaService');

         // Sincroniza OS da nuvem; o race só limita o “primeiro tick” — sempre esperamos o pull terminar
         // antes de ler a agenda, senão o AsyncStorage pode ainda ter cache antigo (sem osNumber / FT).
         const pullPromise = pullTasks(email).catch((err: unknown) =>
           console.warn('[loadData] pullTasks falhou (offline?):', err)
         );
         await Promise.race([pullPromise, new Promise((r) => setTimeout(r, 3000))]);
         await pullPromise;
         await purgeExpiredCompletedExecutionCaches();
         const events = await AgendaService.getUnifiedAgenda(email);
         
         const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
         let executedTasksRaw = [];
         try { executedTasksRaw = JSON.parse(executedStr); } catch(e) {}
         if (!Array.isArray(executedTasksRaw)) executedTasksRaw = [];
         
         const executedMap: Record<string, any> = {};
         const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
         const now = Date.now();
         let updatedExecs = false;
         const validExecs = [];
         
         for (const ex of executedTasksRaw) {
             const item = typeof ex === 'string' ? { id: ex, completedAt: new Date().toISOString() } : ex;
             if (typeof ex === 'string') updatedExecs = true;
             const completedTs = new Date(item.completedAt ?? 0).getTime();
             const age = Number.isFinite(completedTs) ? now - completedTs : 0;
             if (!Number.isFinite(completedTs) || age <= THIRTY_DAYS_MS) {
                 validExecs.push(item);
                 executedMap[String(item.id)] = item;
             } else {
                 updatedExecs = true;
             }
         }
         
         if (updatedExecs) {
             await AsyncStorage.setItem('@brspark_executed_tasks', JSON.stringify(validExecs));
         }
         
         const inprogStr = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
         let inprogressTasks = [];
         try { inprogressTasks = JSON.parse(inprogStr); } catch(e) {}
         if (!Array.isArray(inprogressTasks)) inprogressTasks = [];
         const outboxInProgIds = await getTaskIdsWithPendingExecutionStatusOutbox();
         const inprogressMerged = Array.from(
           new Set([
             ...inprogressTasks.map((id: string) => String(id)),
             ...outboxInProgIds.map((id) => String(id)),
           ])
         );
         
         const accStr = await AsyncStorage.getItem('@brspark_accepted_tasks') || '[]';
         let acceptedTasks: string[] = [];
         try { acceptedTasks = JSON.parse(accStr); } catch(e) {}
         if (!Array.isArray(acceptedTasks)) acceptedTasks = [];
         const acceptedIdSet = new Set(acceptedTasks.map((id: string) => String(id)));
         setAcceptedIds(acceptedIdSet);
         
         const rejStr = await AsyncStorage.getItem('@brspark_rejected_tasks') || '[]';
         let rejectedTasks: string[] = [];
         try { rejectedTasks = JSON.parse(rejStr); } catch(e) {}
         if (!Array.isArray(rejectedTasks)) rejectedTasks = [];
         
         const outboxStr = await AsyncStorage.getItem('@brspark_outbox') || '[]';
         let outboxTasks = [];
         try { outboxTasks = JSON.parse(outboxStr); } catch(e){}
         const pendingSyncIds = new Set(Array.isArray(outboxTasks) ? outboxTasks.map((o:any) => String(o.taskId)) : []);

         // Inject executed tasks that disappeared from the backend (cloud purged) back into the dataset
         const existingIds = new Set(events.map((e:any) => String(e.id)));
         const combinedEvents = [...events];
         for (const key of Object.keys(executedMap)) {
             if (!existingIds.has(key)) {
                 const exData = executedMap[key];
                 combinedEvents.push({
                     id: key,
                     source: 'CHECKLIST',
                     category: 'TASK',
                     status: 'COMPLETED',
                     title: exData.title || `OS Fechada (ID: ${key.substring(0,6)})`,
                     description: exData.description || 'Esta Ordem de Serviço foi concluída e arquivada pelo servidor central.',
                     startDate: exData.completedAt,
                     endDate: exData.completedAt,
                     color: exData.color || MEDIA_TAG_COLORS.AFTER,
                     metadata: { icon: exData.icon || 'checkmark-done-circle' },
                     refId: exData.refId || key,
                 });
             }
         }
         
         const pt_filtered = combinedEvents.filter((e: any) => {
             if (e.source !== 'CHECKLIST' && e.category !== 'TASK') return false;
             if (rejectedTasks.includes(String(e.id))) return false;
             return true; 
         }).filter((e: any) => {
             const isPurged = executedTasksRaw.find((raw:any) => (typeof raw === 'string' ? raw : raw.id) === String(e.id)) 
                              && !executedMap[String(e.id)];
             return !isPurged;
         });
         
         console.log('AGENDA EVENTS LOADED:', events.length, 'INJECTED:', combinedEvents.length - events.length, 'FILTERED:', pt_filtered.length);
         const completedSetForMap = new Set(Object.keys(executedMap));
         const inprogSetForMap = new Set(inprogressMerged);
         const mapped = pt_filtered.map((t: any) => {
            const dt = new Date(t.startDate || Date.now());
            const day = isNaN(dt.getDate()) ? '29' : dt.getDate().toString().padStart(2,'0');
            const month = isNaN(dt.getMonth()) ? '03' : (dt.getMonth() + 1).toString().padStart(2,'0');
            const year = isNaN(dt.getFullYear()) ? '2026' : dt.getFullYear();

            const geo = parseCoordLatLng(t);
            const eff = effectiveProviderTaskStatus(t, completedSetForMap, inprogSetForMap, acceptedIdSet);
            const serviceTitle = t.title || 'Serviço Gên.';
            const rawFormTitle = String(
              t.templateTitle ?? taskMetadataRecord(t).templateTitle ?? ''
            ).trim();
            const formTemplateTitle =
              rawFormTitle && rawFormTitle !== String(serviceTitle).trim() ? rawFormTitle : null;

            return {
               ...t,
               id: String(t.id),
               osNumber: t.osNumber ?? null,
               locationAddress: t.locationAddress ?? null,
               locationZoneType: t.locationZoneType ?? t.metadata?.locationZoneType ?? null,
               locationLat: geo?.lat ?? t.locationLat ?? null,
               locationLng: geo?.lng ?? t.locationLng ?? null,
               title: `${taskOsLabel({ ...t, id: String(t.id) })} — ${t.title || 'Manutenção'}`,
               status: eff,
               isPendingSync: pendingSyncIds.has(String(t.id)),
               isCachedLocally: false,
               service: serviceTitle,
               formTemplateTitle,
               createdAt: t.startDate || new Date().toISOString(),
               dueDate: t.metadata?.dueDate || t.endDate || new Date(new Date().getTime() + 86400000).toISOString(),
               description: t.description || 'Nenhuma descrição detalhada foi fornecida para esta Ordem de Serviço.',
               color: providerTaskListAccentColor(
                 {
                   ...t,
                   id: String(t.id),
                   status: eff,
                   isAccepted: acceptedTasks.includes(String(t.id)),
                 },
                 completedSetForMap,
                 inprogSetForMap,
                 acceptedIdSet,
                 C
               ),
               refId: t.refId,
               icon: t.metadata?.icon || t.icon || null,
               isAccepted: acceptedTasks.includes(String(t.id)),
               pauseReasonSummary: t.metadata?.lastPauseReasonSummary || null,
            };
         });
         // Default to NEWEST based on createdAt
         mapped.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

         const cacheNow = Date.now();
         const completedIdList = mapped
           .filter((t: any) => t.status === 'COMPLETED')
           .map((t: any) => String(t.id));
         const execKeys = completedIdList.map((id: string) => `@brspark_execution_${id}`);
         const pairs = execKeys.length > 0 ? await AsyncStorage.multiGet(execKeys) : [];
         const completedBodyCachedIds = new Set<string>();
         for (const [k, v] of pairs) {
           if (!v) continue;
           try {
             const o = JSON.parse(v);
             const dl = Number(o._technicianViewDownloadAt);
             if (Number.isFinite(dl) && cacheNow - dl <= COMPLETED_BODY_LOCAL_TTL_MS) {
               completedBodyCachedIds.add(String(k.replace('@brspark_execution_', '')));
             }
           } catch {
             /* ignore */
           }
         }
         for (let i = 0; i < mapped.length; i++) {
           const t = mapped[i];
           mapped[i] = {
             ...t,
             isCachedLocally:
               t.status === 'COMPLETED' && completedBodyCachedIds.has(String(t.id)),
           };
         }

         setProviderTasks(mapped);
         setInprogressIds(new Set(inprogressMerged));
         setCompletedIds(new Set(Object.keys(executedMap)));
      } catch(e) {
         console.error('ERROR LOADING AGENDA:', e);
      }

      setAssets(getRootAssets(email, { includeMobileWarehouse: false }));
      setAllAssets(getLocalAssets(email, { includeMobileWarehouse: false }));
      const items = await StockService.getItems();
      setStockItems(items);

      try {
        const res = await apiFetch('/api/shares/pending');
        if (res.ok) {
          const data = await res.json();
          setPendingShares(data);
        }
      } catch (e) {
        setPendingShares([]);
      }
    } else {
      setAssets([]);
      setAllAssets([]);
      setStockItems([]);
      setPendingShares([]);
      setProviderTasks([]);
      setInprogressIds(new Set());
      setCompletedIds(new Set());
      setAcceptedIds(new Set());
    }

    // Categorias de serviço: fixa por ora
    setCategories([
      { id: 'all',         label: t('home.serviceCategories.all'),        icon: 'apps' },
      { id: 'Elétrica',   label: 'Elétrica',    icon: 'flash' },
      { id: 'Hidráulica', label: 'Hidráulica',  icon: 'water' },
      { id: 'Limpeza',    label: 'Limpeza',     icon: 'brush-outline' },
      { id: 'Reformas',   label: 'Reformas',    icon: 'hammer' },
      { id: 'Segurança',  label: 'Segurança',   icon: 'shield-checkmark' },
      { id: 'Jardinagem', label: 'Jardinagem',  icon: 'leaf' },
      { id: 'Climatização', label: 'Climatização', icon: 'thermometer-outline' },
      { id: 'Tecnologia', label: 'Tecnologia',  icon: 'laptop-outline' },
    ]);

    // Prestadores: busca paginada via ProviderService (lida com cache offline automaticamente)
    const result = await ProviderService.search({ page: 1, limit: 20 });
    setProviders(result.data);
    };

    loadDataChainRef.current = loadDataChainRef.current.then(run).catch((e) => {
      console.error('[Dashboard] loadData:', e);
    });
    return loadDataChainRef.current;
  };

  // Primeira montagem: sincroniza se banco estiver vazio
  const hasMountedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      loadData(true); // primeira visita: força sync
    } else {
      loadData(false); // voltas subsequentes: só lê cache local
    }
  }, [user]));

  // Sync scroll to global mode changes (from Header)
  React.useEffect(() => {
    let page = 0;
    if (userRole === 'TECHNICIAN') {
      page = mode === 'PROVIDER' ? 1 : 0;
    } else {
      page = mode === 'ASSETS' ? 1 : 0;
    }
    isInternalScroll.current = true;
    pagerRef.current?.scrollTo({ x: page * pagerWidth, animated: true });
    // Release lock after animation
    const timer = setTimeout(() => { isInternalScroll.current = false; }, 500);
    return () => clearTimeout(timer);
  }, [mode, pagerWidth, userRole]);

  // Rajada de sync ao recuperar rede (complementa o poller de 5 s e reduz sensação de "app preso").
  useEffect(() => {
    if (!user?.email) return;
    if (isOnline === false) {
      reconnectOnlineRef.current = false;
      return;
    }
    if (isOnline !== true) return;
    const prev = reconnectOnlineRef.current;
    reconnectOnlineRef.current = true;
    if (prev !== false) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;
        try {
          await pushSyncQueue(user.email);
          await pullTasks(user.email);
          loadData(false);
        } catch (e) {
          console.warn('[Dashboard] sync pós-reconexão:', e);
        }
        if (i < 2) await new Promise((r) => setTimeout(r, 650));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, user]);

  // ── Auto-Sync Background Poller for Pending Offline Tasks ──
  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      if (!active || !user) return;
      try {
        // ALWAYS push sync queue so that pushTelemetryBatch() runs!
        await pushSyncQueue(user.email);
        await pullTasks(user.email);
        if (active) loadData(false);
      } catch(e) {
         console.log("[Auto-Poller] Falha silenciosa:", e);
      }
    }, 5000); // 5 segundos
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  const { refreshing, onRefresh } = useManualSync(() => loadData(true));

  const handleAcceptShare = async (assetId: string) => {
    try {
      await apiFetch(`/api/shares/${assetId}/accept`, { method: 'POST' });
      onRefresh(); // Trigger a full sync so the new asset is downloaded
    } catch(e) {
      Alert.alert('Erro', 'Não foi possível aceitar o convite.');
    }
  };

  const handleRejectShare = async (assetId: string) => {
    try {
      await apiFetch(`/api/shares/${assetId}/reject`, { method: 'POST' });
      loadData();
    } catch(e) {
      Alert.alert('Erro', 'Não foi possível recusar o convite.');
    }
  };

  const getAssetStockInfo = (assetId: string) => {
    const items = stockItems.filter(i => i.locationId === assetId);
    const hasLow = items.some(i => i.currentStock <= i.minStock);
    return { hasStock: items.length > 0, hasLowStock: hasLow };
  };

  const onPageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isInternalScroll.current) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / pagerWidth);
    
    let newMode = mode;
    if (userRole === 'TECHNICIAN') {
      newMode = page === 0 ? 'ASSETS' : 'PROVIDER';
    } else {
      newMode = page === 0 ? 'SERVICES' : 'ASSETS';
    }
    
    if (newMode !== mode) setMode(newMode as any);
  };

  // ─── Parse GPS coordinates from asset details ────────────────────────────
  const parseGPS = (gpsStr?: string): { latitude: number; longitude: number } | null => {
    if (!gpsStr) return null;
    const parts = gpsStr.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1] };
    }
    return null;
  };

  // ─── Render: Map View ────────────────────────────────────────────────────
  const renderMapContent = () => {
    const pool = activeFilter === 'GLOBAL' ? allAssets : assets;
    const visibleAssets = pool.filter(a =>
      activeFilter === 'ALL' || activeFilter === 'GLOBAL' || a.type === activeFilter
    );

    const mappable = visibleAssets
      .map(a => ({ asset: a, coords: parseGPS((a.details as any)?.gpsCoordinates) }))
      .filter(item => item.coords !== null) as { asset: Asset; coords: { latitude: number; longitude: number } }[];

    const unmapped = visibleAssets.filter(a => !parseGPS((a.details as any)?.gpsCoordinates));

    // Calculate initial region from markers or default to Brazil center
    const initialRegion = mappable.length > 0
      ? {
          latitude: mappable.reduce((s, m) => s + m.coords.latitude, 0) / mappable.length,
          longitude: mappable.reduce((s, m) => s + m.coords.longitude, 0) / mappable.length,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }
      : { latitude: -15.7801, longitude: -47.9292, latitudeDelta: 20, longitudeDelta: 20 };

    const TYPE_COLORS: Record<string, string> = {
      REAL_ESTATE: MEDIA_TAG_COLORS.BEFORE,
      TERRESTRIAL: MODE_SEGMENT_COLORS.PROVIDER,
      AQUATIC: SERVICE_CATEGORY_COLORS['Climatização'],
      SPECIAL: SERVICE_CATEGORY_COLORS.Reformas,
      OTHER: MEDIA_TAG_COLORS.OTHER,
    };

    // Build a map of parentId -> children names (from all loaded assets)
    const childrenByParent: Record<string, string[]> = {};
    allAssets.forEach(a => {
      if (a.parentId) {
        if (!childrenByParent[a.parentId]) childrenByParent[a.parentId] = [];
        childrenByParent[a.parentId].push(a.title);
      }
    });

    return (
      <View style={{ flex: 1, minHeight: 500 }}>
        {mappable.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 }}>
            <Ionicons name="map-outline" size={52} color={C.textLight} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.textSecondary, marginTop: 16 }}>Nenhum bem tem localização GPS</Text>
            <Text style={{ fontSize: 12, color: C.textLight, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}>
              Adicione coordenadas ao cadastrar um bem para visualizá-lo no mapa.
            </Text>
          </View>
        ) : (
          <View style={{ position: 'relative' }}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={{ width: '100%', height: 520, borderRadius: 20 }}
              initialRegion={initialRegion}
              showsUserLocation
              showsMyLocationButton={false}
            >
              {mappable.map(({ asset, coords }) => {
                const childNames = childrenByParent[asset.id] || [];
                // Use the higher value between DB count and derived count from allAssets
                const childCount = Math.max(asset.childrenCount ?? 0, childNames.length);
                const hasChildren = childCount > 0;
                const markerColor = TYPE_COLORS[asset.type] || MEDIA_TAG_COLORS.OTHER;
                const typeIcon = asset.type === 'REAL_ESTATE' ? 'home'
                  : asset.type === 'TERRESTRIAL' ? 'car'
                  : asset.type === 'AQUATIC' ? 'boat'
                  : 'star';
                const labels: Record<string, string> = { REAL_ESTATE: 'Imóvel', TERRESTRIAL: 'Terrestre', AQUATIC: 'Aquático', SPECIAL: 'Especial', OTHER: 'Outro' };
                return (
                  <Marker
                    key={asset.id}
                    coordinate={coords}
                    onCalloutPress={() => router.push(`/asset/${asset.id}` as any)}
                  >
                    {/* Pin */}
                    <View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: markerColor,
                        justifyContent: 'center', alignItems: 'center',
                        borderWidth: hasChildren ? 3 : 2.5,
                        borderColor: hasChildren ? C.status.warning.border : C.cardWhite,
                        shadowColor: C.slate, shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
                      }}>
                        <Ionicons name={typeIcon as any} size={16} color={C.cardWhite} />
                      </View>
                      {hasChildren && (
                        <View style={{
                          position: 'absolute', top: 0, right: 0,
                          minWidth: 18, height: 18, borderRadius: 9,
                          backgroundColor: MEDIA_TAG_COLORS.DURING,
                          borderWidth: 1.5, borderColor: C.cardWhite,
                          alignItems: 'center', justifyContent: 'center',
                          paddingHorizontal: 3,
                          shadowColor: C.slate, shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.2, shadowRadius: 2, elevation: 3,
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: '900', color: C.cardWhite, lineHeight: 11 }}>
                            {childCount > 9 ? '9+' : childCount}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Custom Callout — always shows linked assets section */}
                    <Callout tooltip onPress={() => router.push(`/asset/${asset.id}` as any)}>
                      <View style={{
                        backgroundColor: C.cardWhite, borderRadius: 14, padding: 14,
                        minWidth: 200, maxWidth: 250,
                        shadowColor: C.slate, shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15, shadowRadius: 10, elevation: 6,
                        borderWidth: 1, borderColor: C.border,
                      }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <View style={{
                            width: 30, height: 30, borderRadius: 15,
                            backgroundColor: markerColor + '20',
                            justifyContent: 'center', alignItems: 'center', marginRight: 10,
                          }}>
                            <Ionicons name={typeIcon as any} size={15} color={markerColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: C.slate }} numberOfLines={1}>{asset.title}</Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: C.textLight, marginTop: 1 }}>{labels[asset.type] || asset.type}</Text>
                          </View>
                        </View>

                        {/* Address */}
                        {asset.details?.address ? (
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                            <Ionicons name="location-outline" size={12} color={C.textLight} style={{ marginRight: 5, marginTop: 1 }} />
                            <Text style={{ fontSize: 11, color: C.textLight, flex: 1 }} numberOfLines={2}>{asset.details.address}</Text>
                          </View>
                        ) : null}

                        {/* Linked assets — only shown when there are children */}
                        {hasChildren && (
                        <View style={{
                          borderTopWidth: 1, borderTopColor: C.divider,
                          paddingTop: 8,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Ionicons name="link" size={12} color={MEDIA_TAG_COLORS.DURING} style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: C.status.warning.fg, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {childCount} bem{childCount > 1 ? 'ns' : ''} vinculado{childCount > 1 ? 's' : ''}
                            </Text>
                          </View>
                          {childNames.slice(0, 4).map((name, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: MEDIA_TAG_COLORS.DURING, marginRight: 7 }} />
                              <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
                            </View>
                          ))}
                          {childNames.length > 4 && (
                            <Text style={{ fontSize: 11, color: C.textLight, fontStyle: 'italic', marginTop: 2 }}>+{childNames.length - 4} mais</Text>
                          )}
                        </View>
                        )}

                        {/* Tap hint */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.background }}>
                          <Text style={{ fontSize: 10, color: C.textLight, fontWeight: '600' }}>Toque para abrir</Text>
                          <Ionicons name="chevron-forward" size={11} color={C.textLight} style={{ marginLeft: 2 }} />
                        </View>
                      </View>
                    </Callout>
                  </Marker>
                );
              })}

            </MapView>

            {/* ── Legend overlay — bottom-left inside the map ── */}
            <View style={{
              position: 'absolute', bottom: TAB_BAR_HEIGHT + 16, left: 12,
              backgroundColor: 'rgba(255,255,255,0.96)',
              borderRadius: 16, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
              shadowColor: C.slate, shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.14, shadowRadius: 8, elevation: 5,
              maxWidth: 210,
              // Never taller than the visible map area above the tab bar
              maxHeight: 520 - TAB_BAR_HEIGHT - 32,
            }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ paddingBottom: 6 }}
              >
              {(() => {
                const TYPE_LABELS: Record<string, string> = { REAL_ESTATE: 'Imóvel', TERRESTRIAL: 'Terrestre', AQUATIC: 'Aquático', SPECIAL: 'Especial', OTHER: 'Outro' };
                const showNames = mappable.length <= 6;

                return (
                  <>
                    {/* Section: No mapa */}
                    <Text style={{ fontSize: 9, fontWeight: '800', color: C.textLight, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                      📍 No mapa
                    </Text>

                    {showNames ? (
                      // Show individual asset names — tapping pans the map to that asset
                      mappable.map(({ asset, coords }) => {
                        const color = TYPE_COLORS[asset.type] || MEDIA_TAG_COLORS.OTHER;
                        const hasKids = (asset.childrenCount ?? 0) > 0 || (childrenByParent[asset.id] || []).length > 0;
                        return (
                          <TouchableOpacity
                            key={asset.id}
                            onPress={() => {
                              mapRef.current?.animateToRegion(
                                { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
                                600
                              );
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}
                          >
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 8, borderWidth: hasKids ? 2 : 0, borderColor: C.status.warning.border }} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: C.slate, flex: 1 }} numberOfLines={1}>
                              {asset.title}
                            </Text>
                            {hasKids && (
                              <Text style={{ fontSize: 9, color: MEDIA_TAG_COLORS.DURING, fontWeight: '800', marginLeft: 4 }}>
                                +{Math.max(asset.childrenCount ?? 0, (childrenByParent[asset.id] || []).length)}
                              </Text>
                            )}
                            <Ionicons name="locate" size={10} color={C.border} style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      // Fallback to category counts when many assets
                      Object.entries(TYPE_COLORS).map(([type, color]) => {
                        const count = mappable.filter(m => m.asset.type === type).length;
                        if (count === 0) return null;
                        return (
                          <View key={type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 8 }} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: C.slate }}>
                              {TYPE_LABELS[type]} <Text style={{ color: C.textLight }}>({count})</Text>
                            </Text>
                          </View>
                        );
                      })
                    )}

                    {/* Section: Sem localização */}
                    {unmapped.length > 0 && (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.divider, gap: 3 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: C.textLight, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
                          Sem localização
                        </Text>
                        {unmapped.slice(0, 5).map(a => (
                          <TouchableOpacity
                            key={a.id}
                            onPress={() => router.push(`/asset/${a.id}` as any)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}
                          >
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.border, marginRight: 8 }} />
                            <Text style={{ fontSize: 12, color: C.textLight, fontWeight: '500', flex: 1 }} numberOfLines={1}>{a.title}</Text>
                            <Ionicons name="chevron-forward" size={10} color={C.border} style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        ))}
                        {unmapped.length > 5 && (
                          <Text style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>+{unmapped.length - 5} sem localização</Text>
                        )}
                      </View>
                    )}
                  </>
                );
              })()}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    );
  };


  // ─── Render: Assets Dashboard ──────────────────────────────────────────
  const renderAssetContent = () => {
    const pool = activeFilter === 'GLOBAL' ? allAssets : assets;
    let visibleAssets = pool.filter(a => activeFilter === 'ALL' || activeFilter === 'GLOBAL' || a.type === activeFilter);
    visibleAssets = visibleAssets.sort((a, b) => {
      if (assetSortMode === 'MANUAL') return (a.displayOrder || 0) - (b.displayOrder || 0);
      if (assetSortMode === 'A_Z') return a.title.localeCompare(b.title);
      if (assetSortMode === 'Z_A') return b.title.localeCompare(a.title);
      if (assetSortMode === 'STATUS_UP') {
        const sa = a.statusType === 'success' ? 1 : 0;
        const sb = b.statusType === 'success' ? 1 : 0;
        if (sa !== sb) return sb - sa;
        return a.title.localeCompare(b.title);
      }
      if (assetSortMode === 'STATUS_DOWN') {
        const sa = a.statusType === 'success' ? 1 : 0;
        const sb = b.statusType === 'success' ? 1 : 0;
        if (sa !== sb) return sa - sb;
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    const myAssets = visibleAssets.filter(a => !a.details?._isShared);
    const sharedAssets = visibleAssets.filter(a => a.details?._isShared);

    const renderAssetList = (assetList: Asset[], title?: string, listKey?: 'MY' | 'SHARED') => {
      if (assetList.length === 0 && !title?.includes('Compartilhados')) return null;
      if (assetList.length === 0 && title?.includes('Compartilhados') && pendingShares.length === 0) return null;
      const isThisListReordering = reorderingList === listKey;
      const isGlobal = activeFilter === 'GLOBAL';
      return (
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          {title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.textLight, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Text>
              {!isThisListReordering && (
                <Text style={{ fontSize: 10, color: C.textLight, fontWeight: '600' }}>Segure para reordenar</Text>
              )}
            </View>
          )}
          {!title && !isThisListReordering && assetList.length > 1 && (
            <Text style={{ fontSize: 10, color: C.textLight, fontWeight: '600', textAlign: 'right', marginBottom: 8, marginTop: -4 }}>Segure um card para reordenar</Text>
          )}
          {assetList.map((asset, idx) => {
              const stockInfo = getAssetStockInfo(asset.id);
              return (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onPress={() => { if (!isThisListReordering) router.push(`/asset/${asset.id}` as any); }}
                  onLongPress={assetSortMode === 'MANUAL' && listKey ? () => setReorderingList(isThisListReordering ? null : listKey) : undefined}
                  hasStock={stockInfo.hasStock}
                  hasLowStock={stockInfo.hasLowStock}
                  forceExpand={allExpanded}
                  isReordering={isThisListReordering}
                  onMoveUp={isThisListReordering ? () => moveAsset(idx, 'UP', assetList, isGlobal) : undefined}
                  onMoveDown={isThisListReordering ? () => moveAsset(idx, 'DOWN', assetList, isGlobal) : undefined}
                />
              );
            })}
        </View>
      );
    };

    return (
      <View>
        {pendingShares.length > 0 && (
          <View style={{ padding: 16, backgroundColor: C.status.info.bg, borderWidth: 1, borderColor: C.status.info.border, borderRadius: 16, marginHorizontal: 16, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: MEDIA_TAG_COLORS.BEFORE, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Ionicons name="mail-unread" size={18} color={C.cardWhite} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.status.info.fg }}>Você tem {pendingShares.length} convite(s) pendente(s)</Text>
                <Text style={{ fontSize: 12, color: MEDIA_TAG_COLORS.BEFORE, marginTop: 2 }}>Alguém quer compartilhar um ativo com você.</Text>
              </View>
            </View>
            {pendingShares.map(ps => (
              <View key={ps.id} style={{ backgroundColor: C.cardWhite, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.status.info.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                 <View style={{ flex: 1 }}>
                   <Text style={{ fontSize: 13, fontWeight: '800', color: C.slate, marginBottom: 2 }}>{ps.asset?.title || 'Bem Compartilhado'}</Text>
                   <Text style={{ fontSize: 10, color: C.textSecondary, fontWeight: '600' }}>DE: {ps.ownerEmail}</Text>
                   <Text style={{ fontSize: 10, color: MEDIA_TAG_COLORS.AFTER, fontWeight: '800', marginTop: 2 }}>{ps.permission === 'WRITE' ? 'Pode Editar' : 'Somente Leitura'}</Text>
                 </View>
                 <View style={{ flexDirection: 'row', gap: 8 }}>
                   <TouchableOpacity onPress={() => handleRejectShare(ps.assetId)} style={{ padding: 8, backgroundColor: C.status.danger.bg, borderRadius: 8 }}>
                     <Ionicons name="close" size={18} color={C.destructive} />
                   </TouchableOpacity>
                   <TouchableOpacity onPress={() => handleAcceptShare(ps.assetId)} style={{ padding: 8, backgroundColor: C.status.success.bg, borderRadius: 8 }}>
                     <Ionicons name="checkmark" size={18} color={MEDIA_TAG_COLORS.AFTER} />
                   </TouchableOpacity>
                 </View>
              </View>
            ))}
          </View>
        )}
        {renderAssetList(myAssets, sharedAssets.length > 0 || pendingShares.length > 0 ? 'Meus Bens' : undefined, 'MY')}
        {renderAssetList(sharedAssets, 'Compartilhados comigo', 'SHARED')}
        {/* Floating Done button when reordering */}
        {reorderingList && (
          <TouchableOpacity
            onPress={() => setReorderingList(null)}
            style={{
              position: 'absolute', bottom: 16, alignSelf: 'center',
              backgroundColor: MEDIA_TAG_COLORS.AFTER, borderRadius: 24,
              paddingHorizontal: 28, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              shadowColor: MEDIA_TAG_COLORS.AFTER, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
              left: '25%',
            }}
          >
            <Ionicons name="checkmark-done" size={18} color={C.cardWhite} />
            <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 14 }}>Concluir Ordenação</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>

      {/* Horizontal Pager */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPageScroll}
        onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}
        scrollEventThrottle={16}
        scrollEnabled={true}
        style={{ flex: 1 }}
      >
        {/* ═══════ PAGE 1: Catálogo de Serviços ═══════ */}
        {userRole === 'CLIENT' && (
        <ScrollView
          style={{ width: pagerWidth }}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium UI Header (Services Only) */}
          <LinearGradient 
            colors={[SERVICE_CATEGORY_COLORS.all, C.branding]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.premiumHeader}
          >
            <View style={styles.premiumHeaderRow}>
              <Text style={styles.premiumHeaderText}>{t('home.searchTitle')}</Text>
            </View>

            {/* Circular Categories (Scrollable) */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.circularCatScroll}
             keyboardShouldPersistTaps="handled">
              {SERVICE_CATEGORIES.map((cat: any) => (
                <TouchableOpacity key={cat.id} style={styles.circularCatItem} onPress={() => setSvcFilter(cat.id)}>
                  <View style={[styles.circularCatIconWrap, svcFilter === cat.id && styles.circularCatActive]}>
                    {cat.isMCI
                      ? <MaterialCommunityIcons name={cat.icon as any} size={24} color={C.cardWhite} />
                      : <Ionicons name={cat.icon as any} size={24} color={C.cardWhite} />}
                  </View>
                  <Text style={styles.circularCatLabel} numberOfLines={1}>{t(`home.serviceCategories.${cat.labelKey}`)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </LinearGradient>

          {/* Search Bar (Floating style) */}
          <View style={styles.searchWrapPremium}>
            <Ionicons name="search" size={18} color={C.textLight} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={C.textLight}
              value={searchText}
              onChangeText={(t) => setSearchText(t)}
            returnKeyType="done"
                      />
          </View>

          {/* Filter & Sort Chips (iFood Inspired) */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}
           keyboardShouldPersistTaps="handled">
            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode !== 'DEFAULT' && styles.ifoodChipActive]}
              onPress={() => setSortModalVisible(true)}
            >
              <Ionicons name="options-outline" size={16} color={sortMode !== 'DEFAULT' ? C.accent : C.textSecondary} />
              <Text style={[styles.ifoodChipText, sortMode !== 'DEFAULT' && { color: C.accent, fontWeight: '800' }]}>
                {sortMode === 'DEFAULT' ? t('home.sort.open') : t(`home.sort.${sortMode.toLowerCase()}`)}
              </Text>
              <Ionicons name="chevron-down" size={14} color={sortMode !== 'DEFAULT' ? C.accent : C.textLight} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode === 'VERIFIED' && styles.ifoodChipActive]}
              onPress={() => setSortMode(sortMode === 'VERIFIED' ? 'DEFAULT' : 'VERIFIED')}
            >
              <Text style={[styles.ifoodChipText, sortMode === 'VERIFIED' && { color: C.accent, fontWeight: '800' }]}>
                {t('home.verifiedProviders')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode === 'AGENDA' && styles.ifoodChipActive]}
              onPress={() => setSortMode(sortMode === 'AGENDA' ? 'DEFAULT' : 'AGENDA')}
            >
              <Text style={[styles.ifoodChipText, sortMode === 'AGENDA' && { color: C.accent, fontWeight: '800' }]}>
                {t('home.availableNow')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.ifoodChip, sortMode === 'RATING' && styles.ifoodChipActive]}
              onPress={() => setSortMode(sortMode === 'RATING' ? 'DEFAULT' : 'RATING')}
            >
              <Text style={[styles.ifoodChipText, sortMode === 'RATING' && { color: C.accent, fontWeight: '800' }]}>
                {t('home.topRated')}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Provider List */}
          <View style={{ paddingHorizontal: 16 }}>
            {(svcFilter !== 'all' || searchText.length > 0) && (
              <Text style={styles.resultsLabel}>
                {searchText ? t('home.resultsFor', { query: searchText }) : (svcFilter !== 'all' ? t(`home.serviceCategories.${svcFilter}`) : '')}
              </Text>
            )}

            {svcFilter === 'all' && !searchText && (
              <Text style={styles.sectionLabel}>{t('home.featuredProviders')}</Text>
            )}

            {providers
              .filter(p => svcFilter === 'all' ? true : p.category === svcFilter)
              .filter(p => smartMatch(p, searchText))
              .sort((a, b) => {
                if (sortMode === 'RATING') return b.rating - a.rating;
                if (sortMode === 'VERIFIED') return (b.verified ? 1 : 0) - (a.verified ? 1 : 0);
                // Simple alphabetic for others in this mock
                if (sortMode === 'DEFAULT') return 0;
                return a.id.localeCompare(b.id);
              })
              .map(provider => {
                const isExpanded = expandedProviders.has(provider.id);
                return (
                  <View key={provider.id} style={styles.providerCard}>
                    <TouchableOpacity 
                      activeOpacity={0.8}
                      onPress={() => toggleExpand(provider.id)}
                      style={{ flexDirection: 'row', alignItems: 'flex-start' }}
                    >
                      <Image source={{ uri: provider.photo }} style={styles.providerPhoto} />
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1, paddingRight: 8 }}>
                            <Text style={[styles.providerName, { flexShrink: 1 }]} numberOfLines={2}>{provider.name}</Text>
                          </View>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={C.textLight} style={{ marginTop: 2 }} />
                        </View>
                        
                        <View style={[styles.providerSubRow, { flexWrap: 'wrap', gap: 6 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
                            <Ionicons name="star" size={11} color={MEDIA_TAG_COLORS.DURING} />
                            <Text style={[styles.providerRating, { fontSize: 11 }]}>{provider.rating}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: C.textLight }}>({provider.reviews || 0})</Text>
                          </View>
                          <View style={[styles.promoBadge, { 
                            backgroundColor: C.accent + '10', 
                            borderColor: C.accent + '30', 
                            borderWidth: 0.5,
                            marginVertical: 2,
                            flexShrink: 1
                          }]}>
                            <Ionicons name="calendar-outline" size={10} color={C.accent} style={{ marginRight: 3 }} />
                            <Text style={[styles.promoBadgeText, { color: C.accent, fontSize: 8.5, fontWeight: '800' }]} numberOfLines={1}>
                              {provider.category?.toUpperCase() || 'SERVIÇO'}
                            </Text>
                          </View>
                        </View>

                        {isExpanded && (
                          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12 }}>
                            <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>{t('assetDetail.generalInfo')}</Text>
                            <View style={styles.providerTagsRow}>
                                <View style={styles.providerHighlightPill}>
                                  <Text style={styles.providerHighlightText}>{typeof provider.tags === 'string' ? provider.tags.split(',').slice(0,2).join(' · ') : ''}</Text>
                                </View>
                            </View>
                            <Text style={{ fontSize: 11, color: C.textLight, marginTop: 10 }}>{t('home.providerCardBio')}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                      <TouchableOpacity 
                        style={{ backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => handleSolicitar(provider.name)}
                      >
                         <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 9.5, textTransform: 'uppercase' }}>{t('home.requestBtn')}</Text>
                         <Ionicons name="arrow-forward" size={10} color={C.cardWhite} style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

            {providers.filter(p => svcFilter === 'all' ? p.verified : p.category === svcFilter).filter(p => smartMatch(p, searchText)).length === 0 && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="search-outline" size={44} color={C.textLight} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.textSecondary, marginTop: 12 }}>{t('home.noProviders')}</Text>
              </View>
            )}
          </View>
        </ScrollView>
        )}

        {/* ═══════ PAGE 2: Dashboard de Ativos ═══════ */}
        <ScrollView
          style={{ width: pagerWidth }}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: C.primary }]}>{t('home.activePortfolio')}</Text>
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>

              {/* Cards view */}
              <TouchableOpacity
                style={[styles.selectorBtnActive, {
                  paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: portfolioViewMode === 'LIST' ? C.primary + '15' : C.cardWhite,
                  borderWidth: portfolioViewMode === 'LIST' ? 1 : 0,
                  borderColor: portfolioViewMode === 'LIST' ? C.primary + '40' : 'transparent',
                }]}
                onPress={() => setPortfolioViewMode('LIST')}
              >
                <Ionicons
                  name={portfolioViewMode === 'LIST' ? 'grid' : 'grid-outline'}
                  size={20}
                  color={portfolioViewMode === 'LIST' ? C.primary : C.textLight}
                />
              </TouchableOpacity>

              {/* Expand/collapse — when in MAP, switches to LIST expanded */}
              <TouchableOpacity
                style={[styles.selectorBtnActive, { backgroundColor: C.cardWhite, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10 }]}
                onPress={() => {
                  if (portfolioViewMode === 'MAP') {
                    setPortfolioViewMode('LIST');
                    setAllExpanded(true);
                  } else {
                    setAllExpanded(prev => !prev);
                  }
                }}
              >
                <Ionicons name="git-branch-outline" size={20} color={allExpanded && portfolioViewMode === 'LIST' ? C.primary : C.textLight} />
              </TouchableOpacity>

              {/* Map view — last before + */}
              <TouchableOpacity
                style={[styles.selectorBtnActive, {
                  paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: portfolioViewMode === 'MAP' ? C.status.info.bg : C.cardWhite,
                  borderWidth: portfolioViewMode === 'MAP' ? 1 : 0,
                  borderColor: portfolioViewMode === 'MAP' ? MEDIA_TAG_COLORS.BEFORE : 'transparent',
                }]}
                onPress={() => setPortfolioViewMode('MAP')}
              >
                <Ionicons
                  name={portfolioViewMode === 'MAP' ? 'map' : 'map-outline'}
                  size={20}
                  color={portfolioViewMode === 'MAP' ? MEDIA_TAG_COLORS.BEFORE : C.textLight}
                />
              </TouchableOpacity>

              {/* Add new */}
              <TouchableOpacity
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                onPress={() => router.push('/asset/new')}
              >
                <Ionicons name="add" size={24} color={C.cardWhite} />
              </TouchableOpacity>
            </View>


          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll} style={{marginBottom: 16}} keyboardShouldPersistTaps="handled">
             {[
                { id: 'ALL',         label: 'Geral' },
                { id: 'REAL_ESTATE', label: t('home.assetTypes.realEstate') },
                { id: 'TERRESTRIAL', label: t('home.assetTypes.terrestrial') },
                { id: 'AQUATIC',     label: t('home.assetTypes.aquatic') },
                { id: 'SPECIAL',     label: t('home.assetTypes.special') },
                { id: 'GLOBAL',      label: 'Todos' },
             ].map(f => (
               <TouchableOpacity key={f.id} style={[styles.filterChip, { backgroundColor: C.divider, borderColor: C.border }, activeFilter === f.id && styles.filterChipActive]} onPress={() => setActiveFilter(f.id)}><Text style={[styles.filterChipText, { color: C.textSecondary }, activeFilter === f.id && styles.filterChipTextActive]}>{f.label}</Text></TouchableOpacity>
             ))}
          </ScrollView>
          {portfolioViewMode === 'MAP' ? renderMapContent() : renderAssetContent()}
        </ScrollView>

        {/* ═══════ PAGE 3: Dashboard do Prestador ═══════ */}
        {userRole === 'TECHNICIAN' && (
        <ScrollView
          style={{ width: pagerWidth }}
          contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          {/* Sticky Tab Header Wrapper */}
          <View style={{ backgroundColor: C.background, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider, zIndex: 10 }}>
            {/* Provider Top Tabs */}
            <View style={{ flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.divider, borderRadius: 14, padding: 4 }}>
              {[
                { id: 'PENDING' as const, label: 'Pendentes', color: MODE_SEGMENT_COLORS.PROVIDER },
                { id: 'IN_PROGRESS' as const, label: 'Em andamento', color: MEDIA_TAG_COLORS.BEFORE },
                { id: 'COMPLETED' as const, label: 'Concluídas', color: MEDIA_TAG_COLORS.AFTER },
              ].map((tab) => {
              const isActive = providerTab === tab.id;
              const stageCount =
                tab.id === 'PENDING'
                  ? providerStageCounts.pending
                  : tab.id === 'IN_PROGRESS'
                    ? providerStageCounts.inProgress
                    : providerStageCounts.completed;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => {
                    setProviderTab(tab.id as any);
                    if (tab.id !== 'PENDING' && (providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE')) {
                      setProviderSortMode('NEWEST');
                    }
                  }}
                  activeOpacity={0.8}
                  style={{
                    flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                    backgroundColor: isActive ? C.cardWhite : 'transparent',
                    shadowColor: isActive ? C.slate : 'transparent', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isActive ? 0.1 : 0, shadowRadius: 4, elevation: isActive ? 2 : 0
                  }}
                >
                  <Text
                    style={{ fontSize: 11, fontWeight: isActive ? '900' : '700', color: isActive ? tab.color : C.textLight, textAlign: 'center' }}
                    numberOfLines={2}
                  >
                    {tab.label}
                    <Text style={{ fontWeight: '800', opacity: isActive ? 0.92 : 0.85 }}>{` (${stageCount})`}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
            </View>
          </View>

          {/* Provider Search & Filters */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: 12, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: C.divider, shadowColor: C.slate, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 }}>
               <Ionicons name="search" size={20} color={C.textLight} style={{ marginRight: 12 }} />
               <TextInput 
                 style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.slate, padding: 0 }} 
                 placeholder="Buscar OS..." 
                 placeholderTextColor={C.textLight}
                 value={providerSearch}
                 onChangeText={setProviderSearch}
                 returnKeyType="search"
               />
               {providerSearch.length > 0 && (
                 <TouchableOpacity onPress={() => setProviderSearch('')}>
                   <Ionicons name="close-circle" size={20} color={C.border} />
                 </TouchableOpacity>
               )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4, paddingBottom: 8, marginTop: 12 }}>
               <TouchableOpacity 
                  onPress={() => setProviderSortMode('NEWEST')}
                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, backgroundColor: providerSortMode === 'NEWEST' ? C.status.warning.bg : 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
               >
                  <Ionicons name={providerSortMode === 'NEWEST' ? "time" : "time-outline"} size={16} color={providerSortMode === 'NEWEST' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: providerSortMode === 'NEWEST' ? '900' : '700', color: providerSortMode === 'NEWEST' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight, textTransform: 'uppercase' }}>Recentes</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                  onPress={() => setProviderSortMode('OLDEST')}
                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, backgroundColor: providerSortMode === 'OLDEST' ? C.status.warning.bg : 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
               >
                  <Ionicons name={providerSortMode === 'OLDEST' ? "calendar" : "calendar-outline"} size={16} color={providerSortMode === 'OLDEST' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 11, fontWeight: providerSortMode === 'OLDEST' ? '900' : '700', color: providerSortMode === 'OLDEST' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight, textTransform: 'uppercase' }}>Antigas</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                  onPress={() => onSortRoutePress('OSRM_ROUTE')}
                  disabled={isOptimizingRoute || providerTab !== 'PENDING'}
                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, backgroundColor: providerSortMode === 'OSRM_ROUTE' ? C.status.warning.bg : 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, opacity: providerTab === 'PENDING' ? 1 : 0.5 }}
               >
                  {osrmOptimizingMode === 'OSRM_ROUTE' ? <ActivityIndicator size="small" color={MODE_SEGMENT_COLORS.PROVIDER} style={{ marginRight: 6 }} /> : <Ionicons name="rocket" size={16} color={providerSortMode === 'OSRM_ROUTE' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight} style={{ marginRight: 6 }} />}
                  <Text style={{ fontSize: 11, fontWeight: providerSortMode === 'OSRM_ROUTE' ? '900' : '700', color: providerSortMode === 'OSRM_ROUTE' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight, textTransform: 'uppercase' }}>Rota</Text>
               </TouchableOpacity>
               <TouchableOpacity 
                  onPress={() => onSortRoutePress('OSRM_SLA_ROUTE')}
                  disabled={isOptimizingRoute || providerTab !== 'PENDING'}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: providerSortMode === 'OSRM_SLA_ROUTE' ? C.status.warning.bg : 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, opacity: providerTab === 'PENDING' ? 1 : 0.5 }}
               >
                  {osrmOptimizingMode === 'OSRM_SLA_ROUTE' ? <ActivityIndicator size="small" color={MODE_SEGMENT_COLORS.PROVIDER} style={{ marginRight: 6 }} /> : <Ionicons name={providerSortMode === 'OSRM_SLA_ROUTE' ? "alert-circle" : "alert-circle-outline"} size={16} color={providerSortMode === 'OSRM_SLA_ROUTE' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight} style={{ marginRight: 6 }} />}
                  <Text style={{ fontSize: 11, fontWeight: providerSortMode === 'OSRM_SLA_ROUTE' ? '900' : '700', color: providerSortMode === 'OSRM_SLA_ROUTE' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight, textTransform: 'uppercase' }}>Rota + Vencimento</Text>
               </TouchableOpacity>
               
            </ScrollView>
          </View>

          {/* Provider Content Placeholder / List */}
          {providerTasks.filter(t => {
            const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
            return providerTabMatchesTask(providerTab, s);
          }).length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 40 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.status.warning.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
              <Ionicons name="construct" size={40} color={MODE_SEGMENT_COLORS.PROVIDER} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: C.slate, textAlign: 'center', marginBottom: 12, letterSpacing: -0.5 }}>
              {providerTab === 'PENDING' ? 'Nenhuma Ordem Pendente' : providerTab === 'IN_PROGRESS' ? 'Nenhuma Em Andamento' : 'Nenhuma Concluída'}
            </Text>
            <Text style={{ fontSize: 14, color: C.textLight, textAlign: 'center', lineHeight: 22 }}>
              A lista de serviços aparecerá aqui logo que houver despachos do painel central.
            </Text>
          </View>
          ) : (
            <View style={{ padding: 16 }}>
              {providerTasks
                .filter(t => {
                  const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
                  return providerTabMatchesTask(providerTab, s);
                })
                .filter(t => providerSearch === '' || t.id.toLowerCase().includes(providerSearch.toLowerCase()) || (t.osNumber && String(t.osNumber).toLowerCase().includes(providerSearch.toLowerCase())) || (t.service && t.service.toLowerCase().includes(providerSearch.toLowerCase())))
                .sort((a,b) => {
                   if (providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE') {
                       const d1 = osrmDurations[String(a.id)] ?? 999999;
                       const d2 = osrmDurations[String(b.id)] ?? 999999;
                       
                       if (providerSortMode === 'OSRM_SLA_ROUTE') {
                           const getScore = (item: any, durationSecs: number) => {
                               const durationMins = durationSecs / 60;
                               if (!item.dueDate) return durationMins;
                               
                               const msToDue = new Date(item.dueDate).getTime() - Date.now();
                               const minsToDue = msToDue / 60000;
                               
                               let urgencyDiscount = 0;
                               if (minsToDue < 0) {
                                   urgencyDiscount = 999999; // Atrasado: prioridade absoluta
                               } else if (minsToDue < 120) {
                                   urgencyDiscount = (120 - minsToDue) * 5; // < 2h: alta redução de custo
                               } else if (minsToDue < 1440) {
                                   urgencyDiscount = (1440 - minsToDue) * 0.1; // < 1d: leve desconto
                               }
                               return durationMins - urgencyDiscount;
                           };
                           return getScore(a, d1) - getScore(b, d2);
                       }
                       return d1 - d2;
                   }
                   const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                   const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                   if (isNaN(tA) || isNaN(tB)) return 0;
                   return providerSortMode === 'NEWEST' ? tB - tA : tA - tB;
                })
                .map((order, index, arr) => {
                const listAccent = providerTaskListAccentColor(order, completedIds, inprogressIds, acceptedIds, C);
                const listEff = effectiveProviderTaskStatus(order, completedIds, inprogressIds, acceptedIds);
                return (
                <View key={order.id} style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 12 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 16, overflow: 'hidden',
                      shadowColor: listAccent, shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
                    }}
                  >
                    {/* Gradient background wash from status color */}
                    <LinearGradient
                      colors={[`${listAccent}22`, `${listAccent}08`, C.cardWhite]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ borderRadius: 16, borderWidth: 1, borderColor: `${listAccent}30` }}
                    >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedTask(order);
                        setTaskModalVisible(true);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'stretch' }}
                    >
                      {/* Wide left accent bar */}
                      <View style={{
                        width: 6, borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
                        backgroundColor: listAccent,
                      }} />

                      {/* Icon area with status tint */}
                      <View style={{
                        width: 64, justifyContent: 'center', alignItems: 'center',
                        paddingVertical: 16, paddingLeft: 10,
                      }}>
                        <View style={{
                          width: 48, height: 48, borderRadius: 12,
                          backgroundColor: `${listAccent}20`,
                          borderWidth: 1.5, borderColor: `${listAccent}40`,
                          justifyContent: 'center', alignItems: 'center',
                        }}>
                          <Ionicons
                            name={(order.icon as any) || 'construct-outline'}
                            size={24}
                            color={listAccent}
                          />
                        </View>
                      </View>

                      {/* Right Content */}
                      <View style={{ flex: 1, paddingVertical: 14, paddingRight: 14 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
                            <View
                              style={{
                                flexShrink: 0,
                                maxWidth: '100%',
                                backgroundColor: `${listAccent}26`,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: `${listAccent}4D`,
                              }}
                            >
                              <Text
                                style={{ fontSize: 10, fontWeight: '900', color: C.slate, letterSpacing: 0.35 }}
                              >
                                {taskOsLabel(order)}
                              </Text>
                            </View>
                            <LocationZoneTypeBadge zoneType={order.locationZoneType} />
                            {providerTaskShowsRevisionBadge(order) && (
                              <View
                                style={{
                                  backgroundColor: C.status.info.bg,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: C.status.info.border,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                }}
                              >
                                <Ionicons name="refresh-circle-outline" size={11} color={C.status.info.fg} style={{ marginRight: 3 }} />
                                <Text style={{ fontSize: 8, fontWeight: '900', color: C.status.info.fg, letterSpacing: 0.2 }}>
                                  {t('home.revisionBadge')}
                                </Text>
                              </View>
                            )}
                            {listEff === 'PAUSED' ? (
                              <View
                                style={{
                                  backgroundColor: C.status.danger.bg,
                                  paddingHorizontal: 6,
                                  paddingVertical: 3,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: C.status.danger.border,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                }}
                              >
                                <Ionicons name="pause-circle" size={10} color={C.status.danger.fg} style={{ marginRight: 2 }} />
                                <Text style={{ fontSize: 9, color: C.status.danger.fg, fontWeight: '900' }}>{t('pause.listBadge')}</Text>
                              </View>
                            ) : listEff !== 'COMPLETED' &&
                              (order as any).etaMinutes !== undefined &&
                              (order as any).etaMinutes !== null ? (
                              <View style={{ backgroundColor: C.status.success.bg, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: C.status.success.border, flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="location" size={10} color={C.status.success.fg} style={{ marginRight: 2 }} />
                                <Text style={{ fontSize: 9, color: C.status.success.fg, fontWeight: '900' }}>ETA: {(order as any).etaMinutes} min</Text>
                              </View>
                            ) : null}
                          </View>
                          {listEff === 'COMPLETED' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                               {order.isCachedLocally && !order.isPendingSync && (
                                   <Ionicons name="arrow-down" size={14} color={MEDIA_TAG_COLORS.AFTER} style={{ marginRight: 2, marginTop: 2, fontWeight: '900' }} />
                               )}
                               <Ionicons
                                 name={order.isPendingSync ? 'cloud-offline' : 'cloud-done'}
                                 size={22}
                                 color={order.isPendingSync ? MEDIA_TAG_COLORS.DURING : MEDIA_TAG_COLORS.AFTER}
                               />
                            </View>
                          )}
                        </View>
                        <View style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: 15, color: C.slate, fontWeight: '900', lineHeight: 20 }} numberOfLines={2}>
                            {order.service}
                          </Text>
                          {order.formTemplateTitle ? (
                            <Text
                              style={{
                                fontSize: 10,
                                color: C.textLight,
                                fontWeight: '600',
                                marginTop: 4,
                                lineHeight: 14,
                              }}
                              numberOfLines={2}
                            >
                              {order.formTemplateTitle}
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ gap: 3 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={12} color={C.textLight} style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 10, color: C.textLight, fontWeight: '600' }}>Criado: {new Date(order.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="calendar-outline" size={12} color={C.destructive} style={{ marginRight: 5 }} />
                            <Text style={{ fontSize: 10, color: C.destructive, fontWeight: '800' }}>Vence: {new Date(order.dueDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                          </View>
                        </View>

                        {/* Footer dropdown */}
                        <TouchableOpacity
                          style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: `${listAccent}20`, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => setActiveCardDropdown(activeCardDropdown === order.id ? null : order.id)}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: activeCardDropdown === order.id ? '700' : '900',
                              color: C.textLight,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            {activeCardDropdown === order.id ? 'Esconder' : 'Detalhes'}
                          </Text>
                          <Ionicons name={activeCardDropdown === order.id ? 'chevron-up' : 'chevron-down'} size={12} color={C.textLight} style={{ marginLeft: 3 }} />
                        </TouchableOpacity>

                        {activeCardDropdown === order.id && (
                          <View style={{ marginTop: 8 }}>
                            <ProviderTaskDetailSections task={order} compact />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>

                {/* Right Side: Timeline Ribbon */}
                {(providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE') && (
                    <View style={{ width: 44, marginLeft: 8, alignItems: 'center' }}>
                       {/* Upper Line segment */}
                       <View style={{ flex: 1, width: 2, backgroundColor: index === 0 ? 'transparent' : (providerSortMode === 'OSRM_SLA_ROUTE' ? C.destructive : MODE_SEGMENT_COLORS.PROVIDER), opacity: 0.3 }} />
                       
                       {/* Node */}
                       <TouchableOpacity 
                         onPress={() => {
                            const coords = order.locationLat && order.locationLng ? { latitude: Number(order.locationLat), longitude: Number(order.locationLng) } : null;
                            if (coords) setRouteMapCenterObj({ lat: coords.latitude, lng: coords.longitude });
                            else setRouteMapCenterObj(null);
                            setShowRouteMap(true);
                         }}
                         style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: providerSortMode === 'OSRM_SLA_ROUTE' ? C.status.danger.bg : C.status.warning.bg, justifyContent: 'center', alignItems: 'center', marginVertical: -16, zIndex: 10, borderWidth: 2, borderColor: providerSortMode === 'OSRM_SLA_ROUTE' ? C.destructive : MODE_SEGMENT_COLORS.PROVIDER }}>
                          <Text style={{ color: providerSortMode === 'OSRM_SLA_ROUTE' ? C.destructive : MODE_SEGMENT_COLORS.PROVIDER, fontWeight: '900', fontSize: 13 }}>{index + 1}</Text>
                       </TouchableOpacity>
                       
                       {/* Lower Line segment */}
                       <View style={{ flex: 1, width: 2, backgroundColor: index === arr.length - 1 ? 'transparent' : (providerSortMode === 'OSRM_SLA_ROUTE' ? C.destructive : MODE_SEGMENT_COLORS.PROVIDER), opacity: 0.3 }} />
                    </View>
                )}
                </View>
              );
              })}
            </View>
          )}
        </ScrollView>
        )}
      </ScrollView>



      {/* ─── Asset Smart Sort Bottom Sheet ─── */}
      <Modal
        visible={assetSortSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssetSortSheetVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setAssetSortSheetVisible(false)} />
          <View style={[styles.sortSheet, { backgroundColor: C.cardWhite }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: C.primary }]}>Ordenar Portfolio</Text>
            <View style={styles.sortGrid}>
              {[
                { id: 'MANUAL',      label: 'Padrão',           icon: 'layers-outline',      color: C.textLight,
                  desc: 'Ordem de cadastro' },
                { id: 'A_Z',         label: 'A → Z',            icon: 'text-outline',         color: MEDIA_TAG_COLORS.BEFORE,
                  desc: 'Ordem alfabética' },
                { id: 'Z_A',         label: 'Z → A',            icon: 'text-outline',         color: SERVICE_CATEGORY_COLORS.Tecnologia,
                  desc: 'Ordem reversa' },
                { id: 'STATUS_DOWN', label: 'Alertas Primeiro', icon: 'warning-outline',      color: MEDIA_TAG_COLORS.DURING,
                  desc: 'Atenção no topo' },
                { id: 'STATUS_UP',   label: 'OK Primeiro',      icon: 'checkmark-circle-outline', color: MEDIA_TAG_COLORS.AFTER,
                  desc: 'Saudáveis no topo' },
              ].map(item => {
                const isActive = assetSortMode === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.sortItem, isActive && { opacity: 1 }]}
                    onPress={() => { setAssetSortMode(item.id as any); setAssetSortSheetVisible(false); }}
                  >
                    <View style={[styles.sortIconCircle, isActive && { borderColor: item.color, borderWidth: 2, backgroundColor: item.color + '12' }]}>
                      <Ionicons name={item.icon as any} size={26} color={isActive ? item.color : C.textLight} />
                    </View>
                    <Text style={[styles.sortItemLabel, isActive && { color: item.color, fontWeight: '800' }]}>{item.label}</Text>
                    <Text style={{ fontSize: 9, color: C.textLight, fontWeight: '600', textAlign: 'center', marginTop: 2 }}>{item.desc}</Text>
                    {isActive && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color, marginTop: 4 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Sorting Modal (iFood Bottom Sheet style) ─── */}
      <Modal
        visible={sortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setSortModalVisible(false)} />
          <View style={[styles.sortSheet, { backgroundColor: C.cardWhite }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: C.primary }]}>Ordenação por</Text>
            
            <View style={styles.sortGrid}>
              {[
                { id: 'DEFAULT',  label: 'Filtro Padrão', icon: 'swap-vertical', color: MODE_SEGMENT_COLORS.PROVIDER },
                { id: 'RATING',   label: 'Avaliação',     icon: 'star',          color: MEDIA_TAG_COLORS.DURING },
                { id: 'AGENDA',   label: 'Próxima Agenda',  icon: 'calendar',      color: C.accent },
                { id: 'VERIFIED', label: 'Verificados',   icon: 'checkmark-circle',color: MEDIA_TAG_COLORS.BEFORE },
                { id: 'DISTANCE', label: 'Proximidade',   icon: 'location',      color: C.success.text },
                { id: 'PRICE',    label: 'Custo Benefício', icon: 'cash',          color: MEDIA_TAG_COLORS.AFTER },
              ].map(item => (
                <TouchableOpacity 
                  key={item.id} 
                  style={styles.sortItem} 
                  onPress={() => { setSortMode(item.id as any); setSortModalVisible(false); }}
                >
                  <View style={[styles.sortIconCircle, sortMode === item.id && { borderColor: C.accent, borderWidth: 2 }]}>
                    <Ionicons name={item.icon as any} size={28} color={sortMode === item.id ? C.accent : C.textLight} />
                  </View>
                  <Text style={[styles.sortItemLabel, sortMode === item.id && { color: C.accent, fontWeight: '800' }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Task Details Modal (Bottom Sheet variant) ─── */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTaskModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setTaskModalVisible(false)} />
          <View
            style={[
              styles.sortSheet,
              {
                backgroundColor: C.cardWhite,
                paddingHorizontal: 24,
                paddingBottom: 0,
                paddingTop: 10,
                height: Dimensions.get('window').height * 0.85,
                maxHeight: Dimensions.get('window').height * 0.85,
                flexDirection: 'column',
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            {selectedTask && (
              <>
                <ScrollView
                  style={{ flex: 1, marginTop: 8, minHeight: 0 }}
                  contentContainerStyle={{ paddingBottom: 16 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                >
                  <View style={{ alignItems: 'center', marginBottom: 20 }}>
                    {selectedTask.icon ? (
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 20,
                          backgroundColor: C.warning.background,
                          borderWidth: 2,
                          borderColor: C.status.warning.border,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginBottom: 16,
                          shadowColor: C.accent,
                          shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.2,
                          shadowRadius: 10,
                          elevation: 6,
                        }}
                      >
                        {selectedTask.icon.startsWith('http') ? (
                          <Image source={{ uri: selectedTask.icon }} style={{ width: 32, height: 32 }} resizeMode="contain" />
                        ) : (
                          <Ionicons name={selectedTask.icon as any} size={32} color={C.accent} />
                        )}
                      </View>
                    ) : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        marginBottom: 6,
                        flexWrap: 'wrap',
                        paddingHorizontal: 8,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: `${(selectedTask as { color?: string }).color || MEDIA_TAG_COLORS.OTHER}26`,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: `${(selectedTask as { color?: string }).color || MEDIA_TAG_COLORS.OTHER}4D`,
                          maxWidth: '100%',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '900',
                            color: C.slate,
                            letterSpacing: 0.4,
                            textAlign: 'center',
                          }}
                        >
                          {taskOsLabel(selectedTask)}
                        </Text>
                      </View>
                      <LocationZoneTypeBadge
                        zoneType={(selectedTask as { locationZoneType?: string | null }).locationZoneType}
                        containerSize={26}
                        iconSize={15}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: '900',
                        color: C.slate,
                        textAlign: 'center',
                        lineHeight: 28,
                        marginBottom: 16,
                      }}
                    >
                      {selectedTask.service}
                    </Text>
                  </View>

                  <ProviderTaskDetailSections task={selectedTask} />

                  {(selectedTask.status === 'PENDING' || selectedTask.status === 'RECEIVED') &&
                    !selectedTask.isAccepted &&
                    rejectingTaskId === selectedTask.id && (
                      <View
                        style={{
                          backgroundColor: C.status.danger.bg,
                          padding: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: C.status.danger.border,
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '800',
                            color: C.status.danger.fg,
                            marginBottom: 8,
                            textTransform: 'uppercase',
                          }}
                        >
                          Motivo da Rejeição
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: C.cardWhite,
                            borderRadius: 8,
                            padding: 12,
                            borderWidth: 1,
                            borderColor: C.status.danger.border,
                            minHeight: 80,
                            textAlignVertical: 'top',
                            color: C.slate,
                          }}
                          placeholder="Especifique o motivo detalhadamente..."
                          multiline
                          value={rejectReason}
                          onChangeText={setRejectReason}
                        />
                      </View>
                    )}

                  {selectedTask.status === 'PAUSED' && (selectedTask as any).pauseReasonSummary ? (
                    <View
                      style={{
                        backgroundColor: C.status.danger.bg,
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: C.status.danger.border,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: C.status.danger.fg, marginBottom: 4 }}>
                        {t('pause.listBadge')}
                      </Text>
                      <Text style={{ fontSize: 13, color: C.slate, lineHeight: 18 }}>
                        {String((selectedTask as any).pauseReasonSummary)}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View
                  style={{
                    paddingTop: 12,
                    paddingBottom: Math.max(insets.bottom, 12),
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: C.border,
                    backgroundColor: C.cardWhite,
                  }}
                >
                  {(selectedTask.status === 'PENDING' || selectedTask.status === 'RECEIVED') && !selectedTask.isAccepted && (
                    <>
                      {rejectingTaskId === selectedTask.id ? (
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setRejectingTaskId(null);
                              setRejectReason('');
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: C.cardWhite,
                              paddingVertical: 14,
                              borderRadius: 12,
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: C.status.danger.border,
                            }}
                          >
                            <Text style={{ color: C.status.danger.fg, fontWeight: '800' }}>Voltar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              if (rejectReason.trim().length < 10) {
                                return Alert.alert(
                                  'Atenção',
                                  'Por favor, explique o motivo da rejeição de forma mais detalhada.'
                                );
                              }
                              try {
                                await apiFetch(`/api/operations/tasks/${selectedTask.id}/reject`, {
                                  method: 'POST',
                                  body: JSON.stringify({ reason: rejectReason }),
                                });
                                const rStr = await AsyncStorage.getItem('@brspark_rejected_tasks') || '[]';
                                let rejArr: string[] = [];
                                try {
                                  rejArr = JSON.parse(rStr);
                                } catch (e) {}
                                if (!Array.isArray(rejArr)) rejArr = [];
                                if (!rejArr.includes(String(selectedTask.id))) {
                                  rejArr.push(String(selectedTask.id));
                                  await AsyncStorage.setItem('@brspark_rejected_tasks', JSON.stringify(rejArr));
                                }
                                setRejectingTaskId(null);
                                setRejectReason('');
                                setTaskModalVisible(false);
                                loadData(false);
                                Alert.alert('Recusada', 'A atividade foi rejeitada e retirada da sua fila.');
                              } catch (e: any) {
                                Alert.alert('Erro', 'Falha ao rejeitar a atividade: ' + e.message);
                              }
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: C.destructive,
                              paddingVertical: 14,
                              borderRadius: 12,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: C.cardWhite, fontWeight: '800' }}>Confirmar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setRejectingTaskId(selectedTask.id);
                              setRejectReason('');
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: C.status.danger.bg,
                              paddingVertical: 16,
                              borderRadius: 14,
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: C.status.danger.border,
                            }}
                          >
                            <Text style={{ color: C.destructive, fontWeight: '800', fontSize: 15 }}>Rejeitar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              if (!selectedTask.refId) {
                                Alert.alert('Erro', 'Formulário ausente na OS.');
                                return;
                              }

                              const accStr = await AsyncStorage.getItem('@brspark_accepted_tasks') || '[]';
                              let acceptedLocal: string[] = [];
                              try {
                                acceptedLocal = JSON.parse(accStr);
                              } catch (e) {}
                              if (!Array.isArray(acceptedLocal)) acceptedLocal = [];

                              if (!acceptedLocal.includes(String(selectedTask.id))) {
                                acceptedLocal.push(String(selectedTask.id));
                                await AsyncStorage.setItem('@brspark_accepted_tasks', JSON.stringify(acceptedLocal));
                              }

                              setSelectedTask((prev: any) => ({ ...prev, isAccepted: true }));
                              loadData(false);

                              Alert.alert('OS Aceita!', 'Excelente! Deseja iniciar a execução da atividade agora mesmo?', [
                                { text: 'Agora Não', style: 'cancel', onPress: () => setTaskModalVisible(false) },
                                {
                                  text: 'Sim, Iniciar Agora',
                                  style: 'default',
                                  onPress: async () => {
                                    const _ip = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
                                    let _ipArr: string[] = [];
                                    try {
                                      _ipArr = JSON.parse(_ip);
                                    } catch (e) {}
                                    if (!Array.isArray(_ipArr)) _ipArr = [];
                                    if (!_ipArr.includes(String(selectedTask.id))) {
                                      _ipArr.push(String(selectedTask.id));
                                      await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(_ipArr));
                                    }
                                    await enqueueExecutionInProgressFromDashboard(String(selectedTask.id));
                                    setInprogressIds((prev) => {
                                      const s = new Set(prev);
                                      s.add(String(selectedTask.id));
                                      return s;
                                    });
                                    setTaskModalVisible(false);
                                    router.push({
                                      pathname: '/checklist/[id]',
                                      params: { id: selectedTask.refId, taskId: selectedTask.id },
                                    } as any);
                                  },
                                },
                              ]);
                            }}
                            style={{
                              flex: 2,
                              backgroundColor: C.success.text,
                              paddingVertical: 16,
                              borderRadius: 14,
                              alignItems: 'center',
                              shadowColor: C.success.text,
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.3,
                              shadowRadius: 8,
                              elevation: 4,
                            }}
                          >
                            <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 15 }}>Aceitar Ordem</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}

                  {(selectedTask.status === 'PENDING' || selectedTask.status === 'RECEIVED') && selectedTask.isAccepted && (
                    <TouchableOpacity
                      onPress={async () => {
                        if (!selectedTask.refId || selectedTask.refId === 'null') {
                          Alert.alert('Erro', 'Formulário não associado a esta Atividade.');
                          return;
                        }
                        const _ip = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
                        let _ipArr: string[] = [];
                        try {
                          _ipArr = JSON.parse(_ip);
                        } catch (e) {}
                        if (!Array.isArray(_ipArr)) _ipArr = [];
                        if (!_ipArr.includes(String(selectedTask.id))) {
                          _ipArr.push(String(selectedTask.id));
                          await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(_ipArr));
                        }
                        await enqueueExecutionInProgressFromDashboard(String(selectedTask.id));
                        setInprogressIds((prev) => {
                          const s = new Set(prev);
                          s.add(String(selectedTask.id));
                          return s;
                        });
                        setTaskModalVisible(false);
                        router.push({
                          pathname: '/checklist/[id]',
                          params: { id: selectedTask.refId, taskId: selectedTask.id },
                        } as any);
                      }}
                      style={{
                        backgroundColor: MEDIA_TAG_COLORS.DURING,
                        paddingVertical: 16,
                        borderRadius: 14,
                        alignItems: 'center',
                        shadowColor: MEDIA_TAG_COLORS.DURING,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        elevation: 4,
                      }}
                    >
                      <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 15 }}>Iniciar Ordem (Em Campo)</Text>
                    </TouchableOpacity>
                  )}

                  {(selectedTask.status === 'IN_PROGRESS' || selectedTask.status === 'PAUSED') && (
                    <>
                      {selectedTask.status === 'PAUSED' ? (
                        <TouchableOpacity
                          onPress={async () => {
                            if (!selectedTask.refId || selectedTask.refId === 'null') {
                              Alert.alert('Erro', 'Formulário não associado a esta Atividade.');
                              return;
                            }
                            await enqueueExecutionInProgressFromDashboard(String(selectedTask.id));
                            setTaskModalVisible(false);
                            loadData(false);
                            router.push({
                              pathname: '/checklist/[id]',
                              params: { id: selectedTask.refId, taskId: selectedTask.id },
                            } as any);
                          }}
                          style={{
                            backgroundColor: C.destructive,
                            paddingVertical: 16,
                            borderRadius: 14,
                            alignItems: 'center',
                            shadowColor: C.destructive,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 8,
                            elevation: 4,
                          }}
                        >
                          <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 15 }}>{t('pause.unpauseBtn')}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => {
                            if (!selectedTask.refId || selectedTask.refId === 'null') {
                              Alert.alert('Erro', 'Formulário não associado a esta Atividade.');
                              return;
                            }
                            setTaskModalVisible(false);
                            router.push({
                              pathname: '/checklist/[id]',
                              params: { id: selectedTask.refId, taskId: selectedTask.id },
                            } as any);
                          }}
                          style={{
                            backgroundColor: MEDIA_TAG_COLORS.BEFORE,
                            paddingVertical: 16,
                            borderRadius: 14,
                            alignItems: 'center',
                            shadowColor: MEDIA_TAG_COLORS.BEFORE,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 8,
                            elevation: 4,
                          }}
                        >
                          <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 15 }}>Iniciar / Retomar</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {selectedTask.status === 'COMPLETED' && (
                    <TouchableOpacity
                      onPress={() => {
                        if (!selectedTask.refId) return;
                        setTaskModalVisible(false);
                        router.push({
                          pathname: '/checklist/[id]',
                          params: { id: selectedTask.refId, taskId: selectedTask.id },
                        } as any);
                      }}
                      style={{
                        backgroundColor: MEDIA_TAG_COLORS.AFTER,
                        paddingVertical: 16,
                        borderRadius: 14,
                        alignItems: 'center',
                        shadowColor: MEDIA_TAG_COLORS.AFTER,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        elevation: 4,
                      }}
                    >
                      <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 15 }}>Visualizar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Rota Map Modal Modal */}
      <Modal
        visible={showRouteMap}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowRouteMap(false);
          setRouteMapCenterObj(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: C.cardWhite }}>
           <View style={{ height: 110, backgroundColor: C.overlayDark, paddingTop: 50, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
              <View>
                 <Text style={{ color: C.onOverlayDark, fontSize: 18, fontWeight: '900' }}>Rota do Dia</Text>
                 <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 2 }}>Ordem OSRM para execução</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowRouteMap(false);
                  setRouteMapCenterObj(null);
                }}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }}
              >
                 <Ionicons name="close" size={24} color={C.onOverlayDark} />
              </TouchableOpacity>
           </View>

            {showRouteMap && (
             <MapView
               ref={routeDayMapRef}
               key="route-day-map"
               provider={PROVIDER_DEFAULT}
               style={{ flex: 1 }}
               initialRegion={{
                 latitude: routeMapCenterObj?.lat || (providerTasks.find(t => {
                     if (t.status !== 'PENDING' && t.status !== 'RECEIVED') return false;
                     return !!(t.locationLat && t.locationLng);
                 }) ? Number(providerTasks.find(t => (t.status === 'PENDING' || t.status === 'RECEIVED') && t.locationLat && t.locationLng)?.locationLat) || -23.5505 : -23.5505),
                 longitude: routeMapCenterObj?.lng || (providerTasks.find(t => {
                     if (t.status !== 'PENDING' && t.status !== 'RECEIVED') return false;
                     return !!(t.locationLat && t.locationLng);
                 }) ? Number(providerTasks.find(t => (t.status === 'PENDING' || t.status === 'RECEIVED') && t.locationLat && t.locationLng)?.locationLng) || -46.6333 : -46.6333),
                 latitudeDelta: 0.12,
                 longitudeDelta: 0.12
               }}
             showsUserLocation
           >
             {routeMapTasksOrdered.map((task, index) => {
                const c = parseCoordLatLng(task)!;
                const pin =
                  routeMapMarkerCoords[index] ?? { latitude: c.lat, longitude: c.lng };
                const routeMapEff = effectiveProviderTaskStatus(task, completedIds, inprogressIds, acceptedIds);
                return (
                   <Marker key={`rm-${task.id}`} coordinate={pin} zIndex={100 + index} tracksViewChanges={false}>
                     <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: MEDIA_TAG_COLORS.DURING, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: C.cardWhite, shadowColor: C.slate, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6 }}>
                       <Text style={{ color: C.cardWhite, fontSize: 15, fontWeight: '900' }}>{index + 1}</Text>
                     </View>
                     <Callout>
                       <View style={{ width: 230, padding: 8 }}>
                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                           <LocationZoneTypeBadge zoneType={task.locationZoneType} containerSize={22} iconSize={12} />
                           <Text style={{ flex: 1, fontSize: 14, fontWeight: '900', color: C.slate }} numberOfLines={2}>
                             {task.title}
                           </Text>
                         </View>
                         <Text style={{ fontSize: 12, color: C.textLight }}>{task.asset?.title || 'Local'}</Text>
                         {providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE' ? (
                           <Text
                             style={{
                               fontSize: 12,
                               fontWeight: '900',
                               color: routeMapEff === 'PAUSED' ? C.status.danger.fg : MEDIA_TAG_COLORS.AFTER,
                               marginTop: 6,
                               textTransform: 'uppercase',
                             }}
                           >
                             {routeMapEff === 'PAUSED'
                               ? t('pause.listBadge')
                               : `ETA: ${osrmDurations[String(task.id)] ? Math.ceil(osrmDurations[String(task.id)] / 60) + ' min' : index === 0 ? 'Atual' : '--'}`}
                           </Text>
                         ) : null}
                       </View>
                     </Callout>
                   </Marker>
                );
             })}
             
             {osrmRouteCoords.length > 0 ? (
               <Polyline
                 key={`osrm-poly-${osrmRouteCoords.length}-${String(osrmRouteCoords[0]?.latitude)}`}
                 coordinates={osrmRouteCoords}
                 strokeColor={MEDIA_TAG_COLORS.BEFORE}
                 strokeWidth={5}
                 lineJoin="round"
                 lineCap="round"
               />
             ) : (
               <Polyline 
                 coordinates={routeMapTasksOrdered.map((t) => {
                   const c = parseCoordLatLng(t)!;
                   return { latitude: c.lat, longitude: c.lng };
                 })} 
                 strokeColor={MEDIA_TAG_COLORS.BEFORE} 
                 strokeWidth={2} 
                 lineDashPattern={[15, 10]}
               />
             )}
           </MapView>
            )}
        </View>
      </Modal>

    </View>
  );
}

function createDashboardStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },

  // Page Indicator
  pageIndicator: { flexDirection: 'row', marginHorizontal: 48, marginTop: 12, marginBottom: 8, backgroundColor: C.divider, borderRadius: 14, padding: 4 },
  pageTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 11 },
  pageTabActive: { backgroundColor: C.accent, shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  pageTabText: { fontSize: 10, fontWeight: '900', color: C.textSecondary },
  pageTabTextActive: { color: C.cardWhite },

  // Services: Search
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, marginBottom: 12, backgroundColor: C.surfaceLow, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '700', color: C.primary, padding: 0 },

  // Services: Section Label
  sectionLabel: { fontSize: 11, fontWeight: '900', color: C.primary, paddingHorizontal: 16, marginTop: 12, marginBottom: 16, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.6 },

  // Services: Category Grid (iFood-style 2 columns)
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  catGridCard: { flexDirection: 'row', alignItems: 'center', width: (SCREEN_W - 42) / 2, backgroundColor: C.surfaceLow, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 },
  catGridLabel: { fontSize: 13, fontWeight: '700', color: C.primary, marginLeft: 10 },

  // Services: Category Pills
  catScroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: C.surfaceLow },
  catPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  catPillText: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
  catPillTextActive: { color: C.cardWhite },

  // Services: Dropdown
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceLow, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  dropdownLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: C.primary },
  dropdownMenu: { marginTop: 6, backgroundColor: C.cardWhite, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: C.divider },
  dropdownItemActive: { backgroundColor: C.status.info.bg },
  dropdownItemText: { fontSize: 14, fontWeight: '600', color: C.textSecondary },
  dropdownItemTextActive: { fontWeight: '800', color: C.primary },

  // Services: Results
  resultsLabel: { fontSize: 18, fontWeight: '900', color: C.primary, marginBottom: 14, letterSpacing: -0.3 },

  // Services: Provider Card (iFood-inspired High End)
  providerCard: { backgroundColor: C.cardWhite, paddingVertical: 16, paddingHorizontal: 16, borderRadius: 16, marginBottom: 12, shadowColor: C.slate, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  providerPhoto: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.surfaceLow, borderWidth: 1, borderColor: C.divider },
  providerName: { fontSize: 12, fontWeight: '700', color: C.slate, letterSpacing: -0.2 },
  providerRating: { fontSize: 12, fontWeight: '700', color: MEDIA_TAG_COLORS.DURING, marginLeft: 4 },
  providerSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  providerSubText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  promoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.status.info.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  promoBadgeText: { fontSize: 11, fontWeight: '800', color: SERVICE_CATEGORY_COLORS.Reformas },
  providerTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  providerHighlightPill: { backgroundColor: C.surfaceLow, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  providerHighlightText: { fontSize: 11, fontWeight: '600', color: C.textSecondary },

  // Assets: Section header
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: C.primary, letterSpacing: -0.5, textTransform: 'uppercase' },
  selectorGroup: { flexDirection: 'row', backgroundColor: C.divider, borderRadius: 10, padding: 4 },
  selectorBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  selectorBtnActive: { backgroundColor: C.cardWhite, shadowColor: C.slate, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  listCard: { backgroundColor: C.cardWhite, padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listInfo: { flex: 1, paddingRight: 12 },
  listTitle: { fontSize: 14, fontWeight: '900', color: C.primary, textTransform: 'uppercase', letterSpacing: -0.2 },
  listType: { fontSize: 10, color: C.textSecondary, marginTop: 2, fontWeight: '800', textTransform: 'uppercase' },
  filterScroll: { paddingHorizontal: 16, paddingBottom: 8 },
  // Premium Services UI
  // Premium Services UI (Refined Typo & Deep Slate Ardósia)
  premiumHeader: { paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingHorizontal: 16, paddingTop: 10 },
  premiumHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  premiumHeaderText: { fontSize: 15, fontWeight: '900', color: C.cardWhite, letterSpacing: -0.4 },
  
  circularCatScroll: { paddingRight: 20 },
  circularCatItem: { alignItems: 'center', width: 95 },
  circularCatIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  circularCatActive: { backgroundColor: SERVICE_CATEGORY_COLORS.all, shadowColor: SERVICE_CATEGORY_COLORS.all, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  circularCatLabel: { fontSize: 9, fontWeight: '900', color: C.cardWhite, opacity: 0.85, letterSpacing: 0.5, textAlign: 'center', textTransform: 'uppercase' },

  searchWrapPremium: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: -16, backgroundColor: C.cardWhite, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, shadowColor: C.slate, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },

  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: C.surfaceLow, marginRight: 8 },
  filterChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  filterChipText: { fontSize: 11, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterChipTextActive: { color: C.cardWhite, fontWeight: '900' },

  // iFood Chips
  ifoodChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardWhite, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  ifoodChipActive: { backgroundColor: C.accent + '10', borderColor: C.accent },
  ifoodChipText: { fontSize: 13, color: C.textSecondary, fontWeight: '500', marginHorizontal: 4 },

  // Sort Bottom Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sortSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10, backgroundColor: C.cardWhite },
  sheetHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 30, letterSpacing: -0.5, color: C.primary },
  sortGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  sortItem: { width: '31%', alignItems: 'center', marginBottom: 24 },
  sortIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1.5, borderColor: C.border },
  sortItemLabel: { fontSize: 11, color: C.textLight, fontWeight: '600', textAlign: 'center' },
});
}
