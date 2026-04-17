import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
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
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  FlatList,
  Animated,
  Easing,
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
import {
  getRootAssets,
  getLocalAssets,
  getServiceCategories,
  ensureServiceCategoriesColorColumn,
} from '../../src/database';
import { LEGACY_SERVICE_CATEGORY_I18N } from '../../src/services/directoryCategories';
import { resolveDirectoryMediaUri } from '../../src/utils/directoryMediaUrl';
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
import { tabBarOuterHeight } from '../../src/components/FloatingRadialMenu';
import { TaskMetadataGlyph } from '../../src/components/TaskMetadataGlyph';
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
  getTaskIdsWithPendingLocalSyncOverlay,
  purgeExpiredCompletedExecutionCaches,
  COMPLETED_BODY_LOCAL_TTL_MS,
} from '../../src/services/syncService';
import { patchCloudTaskById } from '../../src/lib/cloudTasksBuckets';
import { taskRowIsRoutineTask } from '../../src/lib/routineTaskQueueUi';
import {
  appendUniqueStringToStoredArray,
  updateStoredJsonArray,
} from '../../src/lib/asyncStorageAtomic';
import { cacheChecklistTemplateIfMissing } from '../../src/services/routineTaskService';
import {
  peekPendingOpenExecutionFromPush,
  takePendingOpenExecutionFromPush,
} from '../../src/lib/pushExecutionOpenIntent';
import { taskOsLabel } from '../../src/utils/taskOsLabel';
import { stripFormTemplateTitleLabelPrefix } from '../../src/utils/stripFormTemplateTitleLabelPrefix';
import {
  effectiveProviderTaskStatus,
  taskMetadataIndicatesRevisionVisit,
} from '../../src/utils/providerTaskStatus';
import { getLocationZoneTypeVisual, resolveLocationZoneChrome } from '../../src/utils/locationZoneTypeDisplay';
import { LocationZoneTypeBadge } from '../../src/components/LocationZoneTypeBadge';
import MapView, { Marker, Callout, Polyline, Polygon, PROVIDER_DEFAULT } from 'react-native-maps';
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

/** Abas Pendentes/Iniciadas: virtualização. Concluídas: janela + «Carregar mais». */
const PROVIDER_OS_COMPLETED_PAGE = 50;
const PROVIDER_OS_COMPLETED_INITIAL = 50;

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

/** Rejeita “coordenadas” falsas (ex.: `Number(null)` === 0). */
function isTriviallyEmptyMapCoords(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  if (Math.abs(lat) < 1e-8 && Math.abs(lng) < 1e-8) return true;
  return false;
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

/** Texto curto para UI (pt-BR): metros se menor que 1 km, senão km com 0–1 casas. */
function formatHaversineForUi(meters: number): string {
  const km = meters / 1000;
  if (km < 1) {
    return `${Math.round(meters)} m`;
  }
  return `${km.toLocaleString('pt-BR', {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  })} km`;
}

/** Minutos previstos de preenchimento do formulário (snapshot no despacho; pode vir só em metadata). */
function providerTaskExpectedFormDurationMinutes(task: any): number | null {
  const raw = task?.expectedFormDurationMinutes ?? task?.metadata?.expectedFormDurationMinutes;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return null;
  return Math.floor(Number(raw));
}

/** ETA de deslocamento (painel), se existir no payload ou metadata. */
function providerTaskEtaMinutes(task: any): number | null {
  const raw = task?.etaMinutes ?? task?.metadata?.etaMinutes;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const n = Math.floor(Number(raw));
  if (n < 0) return null;
  return n;
}

/** ISO de fim da janela prevista do formulário (prioriza slot na agenda); fallback legado para prazo em metadata/endDate. */
function providerTaskDueIso(t: any): string {
  const ag = t?.agendaEndAt ?? t?.plannedFormEndAt;
  if (ag != null && String(ag).trim() !== '') return String(ag).trim();
  if (t?.metadata?.dueDate != null && String(t.metadata.dueDate).trim() !== '') {
    return String(t.metadata.dueDate).trim();
  }
  if (t?.endDate != null && String(t.endDate).trim() !== '') return String(t.endDate).trim();
  return new Date(new Date().getTime() + 86400000).toISOString();
}

/** Prazo real para ordenação (sem fallback “amanhã” quando não há vencimento). */
function providerTaskDueIsoForSort(t: any): string | null {
  const ag = t?.agendaEndAt ?? t?.plannedFormEndAt;
  if (ag != null && String(ag).trim() !== '') return String(ag).trim();
  const meta = taskMetadataRecord(t);
  if (meta.dueDate != null && String(meta.dueDate).trim() !== '') return String(meta.dueDate).trim();
  if (t?.endDate != null && String(t.endDate).trim() !== '') return String(t.endDate).trim();
  return null;
}

function ymdLocalNoonToIsoUtc(ymd: string | undefined | null): string | null {
  if (ymd == null || String(ymd).trim() === '') return null;
  const s = String(ymd).trim();
  if (s.includes('T')) return s;
  return `${s}T12:00:00.000Z`;
}

function parseIsoToMs(iso: string | null | undefined): number {
  if (iso == null || String(iso).trim() === '') return 0;
  const t = new Date(String(iso).trim()).getTime();
  return Number.isFinite(t) ? t : 0;
}

type ProviderListSortMode =
  | 'NEWEST'
  | 'OLDEST'
  | 'CREATED_NEWEST'
  | 'CREATED_OLDEST'
  | 'DUE_SOONEST'
  | 'DUE_LATEST'
  | 'OSRM_ROUTE'
  | 'OSRM_SLA_ROUTE';

/** Modos listados na folha de toque longo (sem rota OSRM). */
type ProviderLongPressSheetMode =
  | 'NEWEST'
  | 'OLDEST'
  | 'CREATED_NEWEST'
  | 'CREATED_OLDEST'
  | 'DUE_SOONEST'
  | 'DUE_LATEST';

const PROVIDER_LONGPRESS_SORT_ROWS: {
  mode: ProviderLongPressSheetMode;
  i18nKey: ProviderSortSheetLabelKey;
  icon: string;
}[] = [
  { mode: 'NEWEST', i18nKey: 'receiptNewest', icon: 'arrow-down-circle-outline' },
  { mode: 'OLDEST', i18nKey: 'receiptOldest', icon: 'arrow-up-circle-outline' },
  { mode: 'CREATED_NEWEST', i18nKey: 'createdNew', icon: 'create-outline' },
  { mode: 'CREATED_OLDEST', i18nKey: 'createdOld', icon: 'document-text-outline' },
  { mode: 'DUE_SOONEST', i18nKey: 'dueSoon', icon: 'alarm-outline' },
  { mode: 'DUE_LATEST', i18nKey: 'dueLate', icon: 'hourglass-outline' },
];

/** Critérios mostrados ao segurar «Recentes» (sem opostos de «Antigas» na mesma folha). */
const PROVIDER_LONGPRESS_RECENT_MODES: readonly ProviderLongPressSheetMode[] = [
  'NEWEST',
  'CREATED_NEWEST',
  'DUE_SOONEST',
];
/** Critérios mostrados ao segurar «Antigas». */
const PROVIDER_LONGPRESS_OLD_MODES: readonly ProviderLongPressSheetMode[] = [
  'OLDEST',
  'CREATED_OLDEST',
  'DUE_LATEST',
];

function providerLongPressModesForAnchor(anchor: 'NEWEST' | 'OLDEST'): readonly ProviderLongPressSheetMode[] {
  return anchor === 'NEWEST' ? PROVIDER_LONGPRESS_RECENT_MODES : PROVIDER_LONGPRESS_OLD_MODES;
}

function providerListModeInLongPressAnchorFamily(
  mode: ProviderListSortMode,
  anchor: 'NEWEST' | 'OLDEST',
): boolean {
  if (mode === 'OSRM_ROUTE' || mode === 'OSRM_SLA_ROUTE') return false;
  return (providerLongPressModesForAnchor(anchor) as readonly string[]).includes(mode);
}

function providerLongPressRowsForAnchor(anchor: 'NEWEST' | 'OLDEST') {
  const allow = new Set(providerLongPressModesForAnchor(anchor));
  return PROVIDER_LONGPRESS_SORT_ROWS.filter((r) => allow.has(r.mode));
}

function normalizeSavedLongPressForSlot(
  mode: ProviderLongPressSheetMode,
  slot: 'recent' | 'old',
): ProviderLongPressSheetMode {
  const anchor = slot === 'recent' ? 'NEWEST' : 'OLDEST';
  return providerLongPressModesForAnchor(anchor).includes(mode) ? mode : anchor === 'NEWEST' ? 'NEWEST' : 'OLDEST';
}

const OS_ALT_SORT_STORAGE_KEY = '@brspark_provider_os_alt_sort_v1';
const PROVIDER_CARD_HIGH_CONTRAST_KEY = '@brspark_provider_cards_high_contrast_v1';
const PROVIDER_CARD_VARIANT_KEY = '@brspark_provider_cards_variant_v1';
type ProviderCardVariant = 'premium';

/** Chips Recentes / Antigas / Roteirizador — mesma métrica de ícone e texto. */
const PROVIDER_OS_SORT_CHIP_ICON_SIZE = 16;
const PROVIDER_OS_SORT_CHIP_FONT_SIZE = 11;
const PROVIDER_OS_SORT_CHIP_LINE_HEIGHT = Math.round(PROVIDER_OS_SORT_CHIP_FONT_SIZE * 1.22);
const PROVIDER_OS_SORT_CHIP_ICON_MARGIN = 5;

type ProviderSortSheetLabelKey =
  | 'receiptNewest'
  | 'receiptOldest'
  | 'completedNewest'
  | 'completedOldest'
  | 'createdNew'
  | 'createdOld'
  | 'dueSoon'
  | 'dueLate';

function providerSortSheetLabelI18nKey(
  key: ProviderSortSheetLabelKey,
  tab: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
): ProviderSortSheetLabelKey {
  if (tab === 'COMPLETED') {
    if (key === 'receiptNewest') return 'completedNewest';
    if (key === 'receiptOldest') return 'completedOldest';
  }
  return key;
}

function isProviderLongPressSheetMode(s: string): s is ProviderLongPressSheetMode {
  return (
    s === 'NEWEST' ||
    s === 'OLDEST' ||
    s === 'CREATED_NEWEST' ||
    s === 'CREATED_OLDEST' ||
    s === 'DUE_SOONEST' ||
    s === 'DUE_LATEST'
  );
}

function parseStoredAltSort(obj: unknown, slot: 'recent' | 'old'): ProviderLongPressSheetMode {
  if (obj == null || typeof obj !== 'object') return slot === 'recent' ? 'NEWEST' : 'OLDEST';
  const raw = (obj as Record<string, unknown>)[slot];
  const s = String(raw || '');
  if (isProviderLongPressSheetMode(s)) return s;
  return slot === 'recent' ? 'NEWEST' : 'OLDEST';
}

function providerAltPickedDefaultForSheet(
  anchor: 'NEWEST' | 'OLDEST',
  currentMode: ProviderListSortMode,
  savedRecent: ProviderLongPressSheetMode,
  savedOld: ProviderLongPressSheetMode,
): ProviderLongPressSheetMode {
  if (providerListModeInLongPressAnchorFamily(currentMode, anchor)) {
    return currentMode as ProviderLongPressSheetMode;
  }
  return anchor === 'NEWEST' ? savedRecent : savedOld;
}

function providerSortTieBreak(a: { id?: string }, b: { id?: string }): number {
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function compareProviderTasksForList(a: any, b: any, mode: ProviderListSortMode): number {
  if (mode === 'OSRM_ROUTE' || mode === 'OSRM_SLA_ROUTE') return 0;
  if (mode === 'NEWEST' || mode === 'OLDEST') {
    const ra = a.__receivedSortMs ?? 0;
    const rb = b.__receivedSortMs ?? 0;
    const c = mode === 'NEWEST' ? rb - ra : ra - rb;
    return c !== 0 ? c : providerSortTieBreak(a, b);
  }
  if (mode === 'CREATED_NEWEST' || mode === 'CREATED_OLDEST') {
    const ca = a.__osCreatedSortMs ?? 0;
    const cb = b.__osCreatedSortMs ?? 0;
    const d = mode === 'CREATED_NEWEST' ? cb - ca : ca - cb;
    return d !== 0 ? d : providerSortTieBreak(a, b);
  }
  if (mode === 'DUE_SOONEST') {
    const da = a.__dueSortMs && a.__dueSortMs > 0 ? a.__dueSortMs : Number.MAX_SAFE_INTEGER;
    const db = b.__dueSortMs && b.__dueSortMs > 0 ? b.__dueSortMs : Number.MAX_SAFE_INTEGER;
    const e = da - db;
    return e !== 0 ? e : providerSortTieBreak(a, b);
  }
  if (mode === 'DUE_LATEST') {
    const da = a.__dueSortMs && a.__dueSortMs > 0 ? a.__dueSortMs : 0;
    const db = b.__dueSortMs && b.__dueSortMs > 0 ? b.__dueSortMs : 0;
    const f = db - da;
    return f !== 0 ? f : providerSortTieBreak(a, b);
  }
  return 0;
}

function providerTaskHasAgendaFormWindow(t: any): boolean {
  const end = t?.agendaEndAt ?? t?.plannedFormEndAt;
  return end != null && String(end).trim() !== '';
}

function providerTaskPlannedStartIso(t: any): string | null {
  const s = t?.agendaStartAt ?? t?.scheduledStartAt;
  if (s == null || String(s).trim() === '') return null;
  return String(s).trim();
}

function providerTaskPlannedEndIso(t: any): string | null {
  const e = t?.agendaEndAt ?? t?.plannedFormEndAt;
  if (e == null || String(e).trim() === '') return null;
  return String(e).trim();
}

function formatProviderTaskWindowDateTime(isoLike: string, locale: string): string {
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return isoLike;
  return d.toLocaleString(locale || 'pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Pendentes, em andamento ou pausa: mostrar duração prevista do formulário + distância até o local no card. */
function providerCardShowsFieldMetrics(listEff: string): boolean {
  return listEff === 'PENDING' || listEff === 'IN_PROGRESS' || listEff === 'PAUSED';
}

function providerCardDistanceReady(
  status: 'idle' | 'loading' | 'ready' | 'denied' | 'error',
  loc: { lat: number; lng: number } | null,
): boolean {
  return status === 'loading' || status === 'idle' || (status === 'ready' && loc != null);
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

/** Minutos até o prazo efetivo de ordenação (`__dueSortMs`: fim previsto formulário ou vencimento). */
function providerTaskMinutesToDueSort(item: any): number | null {
  const ms = item.__dueSortMs;
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) <= 0) return null;
  return (Number(ms) - Date.now()) / 60000;
}

/** Duração de viagem ajustada por urgência (Rota + SLA). Usa `__dueSortMs`, não o `dueDate` só vencimento do cartão. */
function providerOsrmSlaAdjustedDurationMinutes(durationSecs: number, item: any): number {
  const durationMins = durationSecs / 60;
  const minsToDue = providerTaskMinutesToDueSort(item);
  if (minsToDue == null) return durationMins;
  let urgencyDiscount = 0;
  if (minsToDue < 0) urgencyDiscount = 999999;
  else if (minsToDue < 120) urgencyDiscount = (120 - minsToDue) * 5;
  else if (minsToDue < 1440) urgencyDiscount = (1440 - minsToDue) * 0.1;
  return durationMins - urgencyDiscount;
}

/** Mesma ordenação da lista “Rota do dia” (para polilinha bater com os números 1,2,3…). */
function sortTasksForOsrmRoute(
  tasks: any[],
  mode: ProviderListSortMode,
  osrmDurations: Record<string, number>
): any[] {
  return [...tasks].sort((a, b) => {
    if (mode === 'OSRM_ROUTE' || mode === 'OSRM_SLA_ROUTE') {
      const d1 = osrmDurations[String(a.id)] ?? 999999;
      const d2 = osrmDurations[String(b.id)] ?? 999999;
      if (mode === 'OSRM_SLA_ROUTE') {
        return providerOsrmSlaAdjustedDurationMinutes(d1, a) - providerOsrmSlaAdjustedDurationMinutes(d2, b);
      }
      return d1 - d2;
    }
    return compareProviderTasksForList(a, b, mode);
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

/** Vencimento operacional (`metadata.dueDate` / `endDate`), sem fim previsto da agenda — valor do cartão. */
function providerTaskVencimentoIso(t: any): string | null {
  const meta = taskMetadataRecord(t);
  if (meta.dueDate != null && String(meta.dueDate).trim() !== '') return String(meta.dueDate).trim();
  if (t?.endDate != null && String(t.endDate).trim() !== '') return String(t.endDate).trim();
  return null;
}

/** ISO da sincronização no aparelho (metadata.receivedAt ou syncedAt). */
function providerTaskDeviceReceivedAtIso(t: any): string | null {
  const meta = taskMetadataRecord(t);
  for (const k of ['receivedAt', 'syncedAt'] as const) {
    const v = meta[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/** Início do relógio «aguardando aceite»: recebimento no aparelho, senão criação da OS. */
function providerTaskAwaitAcceptStartMs(t: any): number {
  const recvMs = parseIsoToMs(providerTaskDeviceReceivedAtIso(t));
  if (recvMs > 0) return recvMs;
  const createdMs = parseIsoToMs(t?.createdAt);
  if (createdMs > 0) return createdMs;
  return Date.now();
}

function computeProviderAwaitAcceptElapsedMinutes(t: any, nowMs: number = Date.now()): number {
  const start = providerTaskAwaitAcceptStartMs(t);
  return Math.max(0, Math.floor((nowMs - start) / 60_000));
}

/** Cartão/modal: mostrar contador até o técnico aceitar (PENDING/RECEIVED e ainda não aceite local). */
function providerTaskShowsAwaitAcceptCounter(t: any): boolean {
  if (t?.isAccepted) return false;
  const st = String(t?.status || '').toUpperCase();
  return st === 'PENDING' || st === 'RECEIVED';
}

/** Data/hora de fim realizado da OS (payload, metadata ou cache local de concluídas). */
function providerTaskCompletedAtIso(
  t: any,
  executedMap?: Record<string, any>,
): string | null {
  const top = t?.completedAt;
  if (top != null && String(top).trim() !== '') return String(top).trim();
  const meta = taskMetadataRecord(t);
  const metaCompleted = meta.completedAt;
  if (metaCompleted != null && String(metaCompleted).trim() !== '') {
    return String(metaCompleted).trim();
  }
  const id = String(t?.id || '').trim();
  if (id && executedMap && executedMap[id]) {
    const exCompleted = executedMap[id]?.completedAt;
    if (exCompleted != null && String(exCompleted).trim() !== '') {
      return String(exCompleted).trim();
    }
  }
  return null;
}

function formatProviderTaskLocaleDateTime(iso: string | null | undefined, localeTag: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(localeTag || 'pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Título do formulário para o modal de OS (alinhado ao cartão: omite se for igual ao serviço). */
function providerTaskModalFormTitle(t: any): string | null {
  const explicit = t?.formTemplateTitle;
  const raw =
    explicit != null && String(explicit).trim() !== ''
      ? String(explicit).trim()
      : String(t?.templateTitle ?? taskMetadataRecord(t).templateTitle ?? '').trim();
  if (!raw) return null;
  const display = stripFormTemplateTitleLabelPrefix(raw);
  if (!display) return null;
  const serviceLine = String(t?.service ?? '').trim();
  if (serviceLine && display === serviceLine) return null;
  return display;
}

/**
 * Texto do chip roxo com o nome do modelo na lista de OS (prefixo «Formulário» do payload é removido).
 * Em pausa: mostra o nome do template sempre que existir (mesmo igual à linha de serviço),
 * pois o mapeamento zera `formTemplateTitle` nesse caso e o cartão ficava sem o chip.
 */
function providerOsCardFormTemplateBadgeText(order: any, listEff: string): string | null {
  const fromMapped =
    order?.formTemplateTitle != null && String(order.formTemplateTitle).trim() !== ''
      ? String(order.formTemplateTitle).trim()
      : '';
  const raw = String(order?.templateTitle ?? taskMetadataRecord(order).templateTitle ?? '').trim();
  const resolved = stripFormTemplateTitleLabelPrefix(fromMapped || raw);
  if (!resolved) return null;
  const serviceLine = String(order?.service ?? '').trim();
  if (String(listEff || '').toUpperCase() === 'PAUSED') return resolved;
  if (serviceLine && resolved === serviceLine) return null;
  return resolved;
}

function parseProviderVoiceNoteStored(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    try {
      const j = JSON.parse(s);
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function providerValueHasPendingVoiceNote(raw: unknown): boolean {
  const o = parseProviderVoiceNoteStored(raw);
  if (!o) return false;
  const transcript = String(o.transcript || '').trim();
  if (transcript) return false;
  const phase = String(o.phase || o.status || '').trim().toLowerCase();
  const localUri = String(o.localUri || '').trim();
  return phase === 'pending_transcription' && !!localUri;
}

function providerTaskHasPendingVoiceTranscription(task: any): boolean {
  const r = task?.responses;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
    if (k.startsWith('__section_repeat_') && Array.isArray(v)) {
      for (const row of v) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        for (const rv of Object.values(row as Record<string, unknown>)) {
          if (providerValueHasPendingVoiceNote(rv)) return true;
        }
      }
      continue;
    }
    if (providerValueHasPendingVoiceNote(v)) return true;
  }
  return false;
}

/** Tipografia do valor numérico (duração, distância, ETA) — uma única definição para não haver diferença visual. */
const providerOsCardFooterValueTextBase = {
  fontSize: 15,
  fontWeight: '900' as const,
  marginTop: 4,
  letterSpacing: -0.2,
  lineHeight: 18,
};

/** Célula da faixa inferior do card de OS (ícone + rótulo + 1–2 linhas de valor). */
function ProviderOsCardFooterMetric(props: {
  C: ColorPalette;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  label: string;
  line1: string;
  line2?: string | null;
  line1Color: string;
  line2Color?: string;
}) {
  const { C, icon, iconColor, label, line1, line2, line1Color, line2Color } = props;
  const l2c = line2Color ?? line1Color;
  return (
    <View style={{ flex: 1, minWidth: 64, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      <Ionicons name={icon} size={18} color={iconColor} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '900',
            color: C.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text style={[providerOsCardFooterValueTextBase, { color: line1Color }]} numberOfLines={1}>
          {line1}
        </Text>
        {line2 != null && line2 !== '' ? (
          <Text style={{ fontSize: 12, fontWeight: '800', color: l2c, marginTop: 2 }} numberOfLines={1}>
            {line2}
          </Text>
        ) : null}
      </View>
    </View>
  );
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
  const c = parseCoordLatLng(t);
  if (c && !isTriviallyEmptyMapCoords(c.lat, c.lng)) return `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  return '';
}

/** Endereço textual do local (campos de endereço), sem usar lat/lng como texto — para mensagens quando não há mapa. */
function providerTaskServiceAddressTextOnly(t: any): string {
  const top = t?.locationAddress;
  if (top != null && String(top).trim()) return String(top).trim();
  const meta = taskMetadataRecord(t);
  for (const k of ['locationAddress', 'serviceAddress', 'endereco', 'address']) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

/** Nome amigável do local de atendimento (bem, metadata ou integração). */
function providerTaskServiceLocationName(t: any): string {
  const ln = t?.locationName;
  if (ln != null && String(ln).trim()) return String(ln).trim();
  const at = t?.assetTitle;
  if (at != null && String(at).trim()) return String(at).trim();
  const ast = t?.asset;
  if (ast && typeof ast === 'object' && ast.title != null && String(ast.title).trim()) {
    return String(ast.title).trim();
  }
  const meta = taskMetadataRecord(t);
  for (const k of [
    'locationName',
    'serviceLocationName',
    'localName',
    'nomeLocal',
    'placeName',
    'establishmentName',
    'nome_do_local',
    'localNome',
  ]) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

/** Mapa compacto no card ou mensagem (Alert) se não houver coordenadas — usado pelo mapinha e pelo badge de tipo de local. */
function runProviderOsMapMiniPress(order: any, setMiniMapTask: (t: any) => void): void {
  const coords = providerTaskMapTargetCoords(order);
  if (!coords) {
    const name = providerTaskServiceLocationName(order);
    const addrText = providerTaskServiceAddressTextOnly(order);
    const head = [name, addrText].filter(Boolean).join('\n\n');
    if (head) {
      Alert.alert(
        'Local de atendimento',
        `${head}\n\nNão há coordenadas geográficas para mostrar no mapa.`
      );
    } else {
      Alert.alert('Local de atendimento', 'Não há local de atendimento especificado nesta OS.');
    }
    return;
  }
  setMiniMapTask(order);
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

/**
 * Coordenadas do ponto de destino no mapa (1.º vértice em rota/trecho; senão o mesmo critério que `parseCoordLatLng`).
 * Não usar `Number(t.locationLat)` com valores null — em JS `Number(null)` é 0 e abria o mapa sem local real.
 */
function providerTaskMapTargetCoords(t: any): { lat: number; lng: number } | null {
  const z = String(t?.locationZoneType || '').toLowerCase();
  const poly = parseProviderTaskLocationPolygon(t);
  if ((z === 'route' || z === 'segment') && poly && poly.length >= 1) {
    const la = Number(poly[0][0]);
    const ln = Number(poly[0][1]);
    if (
      Number.isFinite(la) &&
      Number.isFinite(ln) &&
      la >= -90 &&
      la <= 90 &&
      ln >= -180 &&
      ln <= 180 &&
      !isTriviallyEmptyMapCoords(la, ln)
    ) {
      return { lat: la, lng: ln };
    }
  }
  const c = parseCoordLatLng(t);
  if (!c || isTriviallyEmptyMapCoords(c.lat, c.lng)) return null;
  return c;
}

/** Abre apps de mapa num par lat/lng (Waze / Google / Apple no iOS; geo: no Android). */
function openLatLngInExternalMaps(lat: number, lng: number, labelForAlert: string) {
  const label = (labelForAlert || 'Destino').slice(0, 120);
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
}

function openProviderTaskInExternalMaps(t: any) {
  const dest = providerTaskMapTargetCoords(t);
  const label = (providerTaskServiceAddressLine(t) || 'Destino').slice(0, 120);
  if (dest) {
    openLatLngInExternalMaps(dest.lat, dest.lng, label);
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

/** Extremos A e B do trecho (`locationPolygon` com dois pontos). */
function providerTaskSegmentPolygonEndpoints(
  t: any,
): { a: { lat: number; lng: number }; b: { lat: number; lng: number } } | null {
  const z = String(t?.locationZoneType || '').toLowerCase();
  if (z !== 'segment') return null;
  const poly = parseProviderTaskLocationPolygon(t);
  if (!poly || poly.length < 2) return null;
  const parsePt = (p: number[]): { lat: number; lng: number } | null => {
    const la = Number(p[0]);
    const ln = Number(p[1]);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
    if (isTriviallyEmptyMapCoords(la, ln)) return null;
    return { lat: la, lng: ln };
  };
  const a = parsePt(poly[0]);
  const b = parsePt(poly[poly.length - 1]);
  if (!a || !b) return null;
  return { a, b };
}

function providerTaskMetaString(meta: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

/** Texto do extremo A (metadata ou `locationAddress` principal). */
function providerTaskSegmentAddressLineA(t: any): string {
  const meta = taskMetadataRecord(t);
  const fromMeta = providerTaskMetaString(meta, [
    'locationAddressStart',
    'segmentAddressA',
    'locationAddressA',
    'addressA',
    'originAddress',
    'startAddress',
  ]);
  if (fromMeta) return fromMeta;
  const top = t?.locationAddress;
  if (top != null && String(top).trim()) return String(top).trim();
  return '';
}

/** Texto do extremo B (metadata; não reutiliza o único `locationAddress` para não duplicar A). */
function providerTaskSegmentAddressLineB(t: any): string {
  const meta = taskMetadataRecord(t);
  return providerTaskMetaString(meta, [
    'locationAddressEnd',
    'segmentAddressB',
    'locationAddressB',
    'addressB',
    'destinationAddress',
    'endAddress',
  ]);
}

function providerTaskSegmentDisplayLineA(t: any): string {
  const ends = providerTaskSegmentPolygonEndpoints(t);
  const addr = providerTaskSegmentAddressLineA(t);
  if (addr) return addr;
  if (ends) return `${ends.a.lat.toFixed(5)}, ${ends.a.lng.toFixed(5)}`;
  return '';
}

function providerTaskSegmentDisplayLineB(t: any): string {
  const ends = providerTaskSegmentPolygonEndpoints(t);
  const addr = providerTaskSegmentAddressLineB(t);
  if (addr) return addr;
  if (ends) return `${ends.b.lat.toFixed(5)}, ${ends.b.lng.toFixed(5)}`;
  return '';
}

function providerTaskMiniMapPolylineCoords(t: any): { latitude: number; longitude: number }[] | null {
  const poly = parseProviderTaskLocationPolygon(t);
  if (!poly || poly.length < 2) return null;
  const z = String(t?.locationZoneType || '').toLowerCase();
  if (z !== 'segment' && z !== 'route') return null;
  const out = poly
    .map((p) => ({ latitude: Number(p[0]), longitude: Number(p[1]) }))
    .filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
  return out.length >= 2 ? out : null;
}

function providerTaskMiniMapPolygonCoords(t: any): { latitude: number; longitude: number }[] | null {
  const poly = parseProviderTaskLocationPolygon(t);
  if (!poly || poly.length < 3) return null;
  const z = String(t?.locationZoneType || '').toLowerCase();
  if (z !== 'polygon') return null;
  const out = poly
    .map((p) => ({ latitude: Number(p[0]), longitude: Number(p[1]) }))
    .filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
  return out.length >= 3 ? out : null;
}

/** Região inicial do mapa compacto (ponto, trecho, rota ou polígono). */
function providerTaskMiniMapInitialRegion(t: any): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  const pad = 1.45;
  const line = providerTaskMiniMapPolylineCoords(t);
  const poly = providerTaskMiniMapPolygonCoords(t);
  const pts = line ?? poly;
  if (pts && pts.length >= 2) {
    const lats = pts.map((p) => p.latitude);
    const lngs = pts.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.002) * pad;
    const lngSpan = Math.max(maxLng - minLng, 0.002) * pad;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latSpan, 0.006),
      longitudeDelta: Math.max(lngSpan, 0.006),
    };
  }
  const c = providerTaskMapTargetCoords(t);
  if (c) {
    return { latitude: c.lat, longitude: c.lng, latitudeDelta: 0.022, longitudeDelta: 0.022 };
  }
  return { latitude: -15.793889, longitude: -47.882778, latitudeDelta: 0.4, longitudeDelta: 0.4 };
}

/** Cliente/local, detalhes (datas) e descrição — modal da OS. */
function ProviderTaskDetailSections({ task }: { task: any }) {
  const { t, i18n } = useTranslation();
  const { colors: P } = useTheme();
  const linkBlue = P.status.info.fg;
  const segmentEnds = providerTaskSegmentPolygonEndpoints(task);
  const segmentLineA = segmentEnds ? providerTaskSegmentDisplayLineA(task) : '';
  const segmentLineB = segmentEnds ? providerTaskSegmentDisplayLineB(task) : '';
  const vencDetailIso = providerTaskVencimentoIso(task);
  const vencDetailMs = vencDetailIso ? new Date(vencDetailIso).getTime() : NaN;
  const vencDetailOverdue = Number.isFinite(vencDetailMs) && vencDetailMs < Date.now();

  return (
    <>
      <View
        style={{
          backgroundColor: P.background,
          borderRadius: 14,
          padding: 11,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: P.border,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '800',
            color: P.textLight,
            textTransform: 'uppercase',
            marginBottom: 8,
            letterSpacing: 0.45,
          }}
        >
          Cliente e local
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
          <Ionicons
            name="person-outline"
            size={15}
            color={P.textLight}
            style={{ marginRight: 10, marginTop: 2 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>Solicitante</Text>
            <Text style={{ fontSize: 13, color: P.slate, fontWeight: '700' }}>
              {providerTaskRequesterDisplayName(task) || '—'}
            </Text>
          </View>
        </View>
        {segmentEnds ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => openLatLngInExternalMaps(segmentEnds.a.lat, segmentEnds.a.lng, segmentLineA || 'Extremo A')}
                accessibilityRole="button"
                accessibilityLabel="Abrir extremo A no mapa"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginRight: 10, marginTop: 0, padding: 4 }}
              >
                <Ionicons name="location-outline" size={18} color={linkBlue} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                  Trecho — extremo A (início)
                </Text>
                <TouchableOpacity
                  onPress={() => openLatLngInExternalMaps(segmentEnds.a.lat, segmentEnds.a.lng, segmentLineA || 'Extremo A')}
                  activeOpacity={0.65}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: linkBlue,
                      fontWeight: '600',
                      lineHeight: 19,
                      textDecorationLine: 'underline',
                    }}
                  >
                    {segmentLineA || '—'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TouchableOpacity
                onPress={() => openLatLngInExternalMaps(segmentEnds.b.lat, segmentEnds.b.lng, segmentLineB || 'Extremo B')}
                accessibilityRole="button"
                accessibilityLabel="Abrir extremo B no mapa"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginRight: 10, marginTop: 0, padding: 4 }}
              >
                <Ionicons name="location-outline" size={18} color={linkBlue} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                  Trecho — extremo B (fim)
                </Text>
                <TouchableOpacity
                  onPress={() => openLatLngInExternalMaps(segmentEnds.b.lat, segmentEnds.b.lng, segmentLineB || 'Extremo B')}
                  activeOpacity={0.65}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: linkBlue,
                      fontWeight: '600',
                      lineHeight: 19,
                      textDecorationLine: 'underline',
                    }}
                  >
                    {segmentLineB || '—'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <TouchableOpacity
              onPress={() => openProviderTaskInExternalMaps(task)}
              accessibilityRole="button"
              accessibilityLabel="Abrir local no mapa"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ marginRight: 10, marginTop: 0, padding: 4 }}
            >
              <Ionicons name="location-outline" size={18} color={linkBlue} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>Local de atendimento</Text>
              <TouchableOpacity
                onPress={() => openProviderTaskInExternalMaps(task)}
                activeOpacity={0.65}
                disabled={!providerTaskServiceAddressLine(task) && !providerTaskMapTargetCoords(task)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color:
                      providerTaskServiceAddressLine(task) || providerTaskMapTargetCoords(task) ? linkBlue : P.textSecondary,
                    fontWeight: '600',
                    lineHeight: 19,
                    textDecorationLine:
                      providerTaskServiceAddressLine(task) || providerTaskMapTargetCoords(task) ? 'underline' : 'none',
                  }}
                >
                  {providerTaskServiceAddressLine(task) || '—'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View
        style={{
          backgroundColor: P.background,
          borderRadius: 14,
          padding: 11,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: P.divider,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '800',
            color: P.textLight,
            textTransform: 'uppercase',
            marginBottom: 6,
            letterSpacing: 0.45,
          }}
        >
          Detalhes
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="time" size={15} color={P.textLight} style={{ marginRight: 10 }} />
          <View>
            <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>Criado em</Text>
            <Text style={{ fontSize: 12, color: P.textSecondary, fontWeight: '800' }}>
              {new Date(task.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="phone-portrait-outline" size={15} color={P.textLight} style={{ marginRight: 10 }} />
          <View>
            <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>{t('home.osReceivedAtLabel')}</Text>
            <Text style={{ fontSize: 12, color: P.textSecondary, fontWeight: '800' }}>
              {formatProviderTaskLocaleDateTime(providerTaskDeviceReceivedAtIso(task), i18n.language)}
            </Text>
          </View>
        </View>
        {providerTaskExpectedFormDurationMinutes(task) != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons
              name="hourglass-outline"
              size={15}
              color={P.status.info.fg}
              style={{ marginRight: 10 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                {t('home.expectedFormScheduleLabel')}
              </Text>
              <Text style={{ fontSize: 12, color: P.textSecondary, fontWeight: '800' }}>
                {t('agenda.expectedFormMinutes', {
                  count: providerTaskExpectedFormDurationMinutes(task)!,
                })}
              </Text>
              <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600', marginTop: 4, lineHeight: 14 }}>
                {t('home.osFormWindowHint')}
              </Text>
            </View>
          </View>
        ) : null}
        {providerTaskHasAgendaFormWindow(task) ||
        (task?.startedAt && String(task.startedAt).trim() !== '') ||
        (task?.completedAt && String(task.completedAt).trim() !== '') ? (
          <View style={{ marginBottom: 10 }}>
            <Text
              style={{
                fontSize: 10,
                color: P.textLight,
                fontWeight: '800',
                textTransform: 'uppercase',
                marginBottom: 8,
                letterSpacing: 0.45,
              }}
            >
              {t('home.osFormWindowSectionTitle')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="calendar-outline" size={15} color={P.status.info.fg} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                  {t('home.osPlannedStartLabel')}
                </Text>
                <Text style={{ fontSize: 12, color: P.textSecondary, fontWeight: '800' }}>
                  {providerTaskPlannedStartIso(task)
                    ? formatProviderTaskWindowDateTime(
                        providerTaskPlannedStartIso(task)!,
                        i18n.language || 'pt-BR',
                      )
                    : '—'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="calendar" size={15} color={P.status.info.fg} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                  {t('home.osPlannedEndLabel')}
                </Text>
                <Text style={{ fontSize: 12, color: P.textSecondary, fontWeight: '800' }}>
                  {providerTaskPlannedEndIso(task)
                    ? formatProviderTaskWindowDateTime(
                        providerTaskPlannedEndIso(task)!,
                        i18n.language || 'pt-BR',
                      )
                    : '—'}
                </Text>
              </View>
            </View>
            {vencDetailIso ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="alert-circle-outline" size={15} color={P.textSecondary} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                    {t('home.osVencimentoDetailLabel')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: vencDetailOverdue ? P.destructive : P.textSecondary,
                      fontWeight: '800',
                    }}
                  >
                    {formatProviderTaskWindowDateTime(vencDetailIso, i18n.language || 'pt-BR')}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="play-circle-outline" size={15} color={P.textSecondary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                  {t('home.osActualStartLabel')}
                </Text>
                <Text style={{ fontSize: 12, color: P.textSecondary, fontWeight: '800' }}>
                  {task?.startedAt && String(task.startedAt).trim() !== ''
                    ? formatProviderTaskWindowDateTime(String(task.startedAt), i18n.language || 'pt-BR')
                    : '—'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="checkmark-done-outline" size={15} color={P.textSecondary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                  {t('home.osActualEndLabel')}
                </Text>
                <Text style={{ fontSize: 12, color: P.textSecondary, fontWeight: '800' }}>
                  {task?.completedAt && String(task.completedAt).trim() !== ''
                    ? formatProviderTaskWindowDateTime(String(task.completedAt), i18n.language || 'pt-BR')
                    : t('home.osActualEndPending')}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons
              name="calendar-outline"
              size={15}
              color={vencDetailIso ? (vencDetailOverdue ? P.destructive : P.textSecondary) : P.textLight}
              style={{ marginRight: 10 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: P.textLight, fontWeight: '600' }}>
                {t('home.osVencimentoDetailLabel')}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: vencDetailIso ? (vencDetailOverdue ? P.destructive : P.textSecondary) : P.textLight,
                  fontWeight: '800',
                }}
              >
                {vencDetailIso
                  ? formatProviderTaskWindowDateTime(vencDetailIso, i18n.language || 'pt-BR')
                  : '—'}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={{ marginBottom: 18 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '800',
            color: P.textLight,
            textTransform: 'uppercase',
            marginBottom: 6,
            letterSpacing: 0.45,
          }}
        >
          Descrição
        </Text>
        <Text style={{ fontSize: 13, color: P.textSecondary, lineHeight: 20 }}>{task.description}</Text>
      </View>
    </>
  );
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

function providerTabMatchesTask(
  tab: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
  status: string
): boolean {
  // PAUSED: mesma aba que "Iniciadas" (OS já iniciada; cartão vermelho com badge de pausa).
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
  if (eff === 'IN_PROGRESS' || eff === 'PAUSED') return MEDIA_TAG_COLORS.DURING;
  return P.textLight;
}

const PROVIDER_CARD_SURFACE = {
  radius: 20,
  headerPadTop: 14,
  headerPadSide: 14,
  headerPadBottom: 10,
  sectionPadSide: 14,
  sectionPadBottom: 14,
};

function providerCardPremiumTone(
  listEff: string,
  listAccent: string,
  overdue: boolean,
  highContrast: boolean,
  C: ColorPalette,
): {
  stripe: string;
  cardBorder: string;
  cardBg: string;
  idBg: string;
  idBorder: string;
  idInk: string;
  statusBg: string;
  statusBorder: string;
  statusInk: string;
} {
  const strongBorder = highContrast ? `${C.slate}5C` : C.border;
  const neutralStatusBg = highContrast ? '#E2E8F0' : '#E2E8F0';
  const neutralStatusInk = highContrast ? C.slate : C.textSecondary;
  const pendingCardBg = highContrast ? '#E2E8F0' : '#E2E8F0';
  const inProgressCardBg = highContrast ? '#FED7AA' : '#FED7AA';
  const pausedCardBg = highContrast ? '#FECACA' : '#FECACA';
  const completedCardBg = highContrast ? '#D9EFE1' : '#E4F3E8';
  const completedStatusBg = highContrast ? '#CFE6D8' : '#D8EEDF';
  const completedStatusBorder = highContrast ? '#6B9E84' : '#8DBAA4';
  const base = {
    stripe: listAccent,
    cardBorder: strongBorder,
    cardBg: pendingCardBg,
    idBg: highContrast ? `${C.slate}1A` : `${C.slate}0D`,
    idBorder: highContrast ? `${C.slate}50` : `${C.slate}1F`,
    idInk: C.slate,
    statusBg: neutralStatusBg,
    statusBorder: strongBorder,
    statusInk: neutralStatusInk,
  };
  const applyOverdue = (tone: {
    stripe: string;
    cardBorder: string;
    cardBg: string;
    idBg: string;
    idBorder: string;
    idInk: string;
    statusBg: string;
    statusBorder: string;
    statusInk: string;
  }) =>
    overdue
      ? {
          ...tone,
          cardBorder: highContrast ? C.destructive : tone.cardBorder,
          statusBg: C.status.danger.bg,
          statusBorder: highContrast ? C.destructive : C.status.danger.border,
          statusInk: C.status.danger.fg,
        }
      : tone;
  if (listEff === 'PAUSED') {
    return applyOverdue({
      ...base,
      stripe: C.destructive,
      cardBg: pausedCardBg,
      cardBorder: highContrast ? C.destructive : C.status.danger.border,
      idBg: `${C.destructive}12`,
      idBorder: highContrast ? `${C.destructive}7A` : `${C.destructive}2E`,
      idInk: C.destructive,
      statusBg: C.status.danger.bg,
      statusBorder: highContrast ? C.destructive : C.status.danger.border,
      statusInk: C.status.danger.fg,
    });
  }
  if (listEff === 'COMPLETED') {
    return applyOverdue({
      ...base,
      stripe: C.status.success.fg,
      cardBg: completedCardBg,
      cardBorder: highContrast ? '#6B9E84' : '#8DBAA4',
      idBg: `${C.status.success.fg}12`,
      idBorder: highContrast ? `${C.status.success.fg}78` : `${C.status.success.fg}2A`,
      idInk: C.status.success.fg,
      statusBg: completedStatusBg,
      statusBorder: completedStatusBorder,
      statusInk: C.status.success.fg,
    });
  }
  if (listEff === 'IN_PROGRESS') {
    return applyOverdue({
      ...base,
      stripe: MEDIA_TAG_COLORS.DURING,
      cardBg: inProgressCardBg,
      cardBorder: highContrast ? `${MEDIA_TAG_COLORS.DURING}80` : C.status.warning.border,
      idBg: highContrast ? `${MEDIA_TAG_COLORS.DURING}1D` : `${MEDIA_TAG_COLORS.DURING}14`,
      idBorder: highContrast ? `${MEDIA_TAG_COLORS.DURING}6D` : `${MEDIA_TAG_COLORS.DURING}33`,
      idInk: C.slate,
      statusBg: highContrast ? `${MEDIA_TAG_COLORS.DURING}1C` : `${MEDIA_TAG_COLORS.DURING}14`,
      statusBorder: highContrast ? `${MEDIA_TAG_COLORS.DURING}6D` : `${MEDIA_TAG_COLORS.DURING}30`,
      statusInk: MEDIA_TAG_COLORS.DURING,
    });
  }
  return applyOverdue({
    ...base,
    stripe: C.textLight,
    cardBg: pendingCardBg,
    idBg: highContrast ? `${C.textLight}1E` : `${C.textLight}12`,
    idBorder: highContrast ? `${C.textLight}68` : `${C.textLight}28`,
    idInk: C.slate,
    statusBg: neutralStatusBg,
    statusBorder: strongBorder,
    statusInk: neutralStatusInk,
  });
}

function providerCardEnterMotionProfile(
  status: string,
  index: number,
  reduceMotion: boolean,
): { duration: number; delay: number; translateY: number; fromScale: number } {
  if (reduceMotion) return { duration: 1, delay: 0, translateY: 0, fromScale: 1 };
  const i = Math.min(Math.max(0, index), 8);
  const baseDelay = i * 58;
  const st = String(status || '').toUpperCase();
  if (st === 'PAUSED') return { duration: 190, delay: baseDelay, translateY: 12, fromScale: 0.992 };
  if (st === 'IN_PROGRESS') return { duration: 210, delay: baseDelay, translateY: 14, fromScale: 0.99 };
  if (st === 'COMPLETED') return { duration: 180, delay: baseDelay, translateY: 10, fromScale: 0.994 };
  return { duration: 220, delay: baseDelay, translateY: 16, fromScale: 0.988 };
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

/** PATCH IN_PROGRESS (ou fila offline) + cache local FT/RT (buckets), alinhado ao checklist. */
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
    await patchCloudTaskById(id, (row) => ({
      ...row,
      status: 'IN_PROGRESS',
      metadata: {
        ...(row.metadata || {}),
        executionPaused: false,
        lastResumedAt: ts,
      },
    }));
  } catch {
    /* ignore */
  }
}

/** Pill creme/terracota + pulso + ícone à esquerda — compartilhado por pausa e «aguardando aceite». */
function ProviderTerracottaDurationPillBadge(props: {
  task: any;
  computeMinutes: (task: any) => number;
  tickIntervalMs: number;
  getA11y: (minutes: number) => string;
  /** Se true (padrão), minutos < 0 mostram «—» (ex.: pausa sem `lastPauseAt`). */
  dashWhenNegative?: boolean;
  alignSelf?: 'flex-start' | 'center';
  renderBelow?: (minutes: number) => React.ReactNode;
  /** Ícone à esquerda do contador (padrão: ampulheta para espera). */
  leadingIcon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Animação do ícone: giro 180° (ampulheta), pulso de escala (pausa) ou estático. */
  leadingIconAnimation?: 'flip' | 'pulse' | 'none';
  /** Versão compacta para cards: ocupa menos espaço e enfatiza alerta de ação. */
  compact?: boolean;
  /** Cor semântica do alerta (pausa = danger, aguardo aceite = warning). */
  tone?: 'warning' | 'danger';
}) {
  const {
    task,
    computeMinutes,
    tickIntervalMs,
    getA11y,
    dashWhenNegative = true,
    alignSelf = 'flex-start',
    renderBelow,
    leadingIcon = 'hourglass-outline',
    leadingIconAnimation = 'flip',
    compact = false,
    tone = 'warning',
  } = props;
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState(() => computeMinutes(task));
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.35)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const iconPulseScale = useRef(new Animated.Value(1)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    const tick = () => setMinutes(computeMinutes(taskRef.current));
    tick();
    const id = setInterval(tick, tickIntervalMs);
    return () => clearInterval(id);
  }, [task?.id, task?.lastPauseAt, tickIntervalMs, computeMinutes]);

  useEffect(() => {
    const dur = compact ? 520 : 780;
    const upScale = compact ? 1.1 : 1.045;
    const downOpacity = compact ? 0.24 : 0.22;
    const upOpacity = compact ? 0.7 : 0.55;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: upScale,
            duration: dur,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: upOpacity,
            duration: dur,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: dur,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: downOpacity,
            duration: dur,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.35);
    };
  }, [compact, pulseOpacity, pulseScale]);

  useEffect(() => {
    if (!compact) {
      shakeX.stopAnimation();
      shakeX.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(shakeX, { toValue: -2.2, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 2.2, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -1.6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 1.6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      shakeX.setValue(0);
    };
  }, [compact, shakeX]);

  useEffect(() => {
    iconPulseScale.stopAnimation();
    iconPulseScale.setValue(1);
    if (leadingIconAnimation !== 'flip') {
      flip.stopAnimation();
      flip.setValue(0);
      return;
    }
    const spin = Animated.loop(
      Animated.sequence([
        Animated.timing(flip, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(flip, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    );
    spin.start();
    return () => {
      spin.stop();
      flip.setValue(0);
    };
  }, [flip, leadingIconAnimation]);

  useEffect(() => {
    flip.stopAnimation();
    flip.setValue(0);
    if (leadingIconAnimation !== 'pulse') {
      iconPulseScale.stopAnimation();
      iconPulseScale.setValue(1);
      return;
    }
    const dur = 700;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulseScale, {
          toValue: 1.14,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(iconPulseScale, {
          toValue: 1,
          duration: dur,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      iconPulseScale.setValue(1);
    };
  }, [leadingIconAnimation, iconPulseScale]);

  const rotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const dash = dashWhenNegative && minutes < 0;
  const valueLabel = dash ? '—' : String(Math.max(0, minutes));
  const a11y = getA11y(minutes);

  const bg = tone === 'danger' ? '#FFE7E7' : '#FFF1DD';
  const border = tone === 'danger' ? '#FCA5A5' : '#FDBA74';
  const iconC = tone === 'danger' ? '#B91C1C' : '#C2410C';
  const textC = tone === 'danger' ? '#7F1D1D' : '#7C2D12';

  const pillBody = (
    <>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          left: -2,
          right: -2,
          top: -2,
          bottom: -2,
          borderRadius: compact ? 14 : 20,
          backgroundColor: border,
          opacity: pulseOpacity,
          transform: [{ scale: pulseScale }, ...(compact ? [{ translateX: shakeX }] : [])],
        }}
        collapsable={false}
      />
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: compact ? 3 : 5,
          paddingHorizontal: compact ? 8 : 10,
          borderRadius: compact ? 12 : 18,
          backgroundColor: bg,
          borderWidth: compact ? 1.5 : 2,
          borderColor: border,
          gap: compact ? 6 : 8,
          zIndex: 2,
          transform: compact ? [{ translateX: shakeX }] : undefined,
        }}
        collapsable={false}
      >
        {leadingIconAnimation === 'flip' ? (
          <Animated.View style={{ transform: [{ rotate }] }} collapsable={false}>
            <Ionicons name={leadingIcon} size={16} color={iconC} />
          </Animated.View>
        ) : leadingIconAnimation === 'pulse' ? (
          <Animated.View
            style={{
              width: compact ? 18 : 22,
              height: compact ? 18 : 22,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: iconPulseScale }],
            }}
            collapsable={false}
          >
            <Ionicons name={leadingIcon} size={compact ? 14 : 18} color={iconC} />
          </Animated.View>
        ) : (
          <View
            style={{ width: compact ? 14 : 18, height: compact ? 14 : 18, alignItems: 'center', justifyContent: 'center' }}
            collapsable={false}
          >
            <Ionicons name={leadingIcon} size={compact ? 14 : 18} color={iconC} />
          </View>
        )}
        <View style={{ alignItems: 'flex-start', justifyContent: 'center' }} collapsable={false}>
          <Text
            style={{
              fontSize: compact ? 13 : 15,
              fontWeight: '900',
              color: textC,
              fontVariant: ['tabular-nums'],
              lineHeight: compact ? 15 : 17,
            }}
          >
            {compact ? `${valueLabel}m` : valueLabel}
          </Text>
          {!compact ? (
            <Text style={{ fontSize: 8, fontWeight: '700', color: textC, opacity: 0.92, marginTop: 0 }}>
              {t('pause.listBadgeMinutesUnit')}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </>
  );

  if (renderBelow) {
    return (
      <View style={{ alignItems: 'center', alignSelf }} collapsable={false}>
        <View accessibilityRole="text" accessibilityLabel={a11y} style={{ position: 'relative' }} collapsable={false}>
          {pillBody}
        </View>
        {renderBelow(minutes)}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={a11y}
      style={{ alignSelf, position: 'relative' }}
      collapsable={false}
    >
      {pillBody}
    </View>
  );
}

/** Contador (minutos) desde recebimento no aparelho ou criação da OS até aceitar — lista compacta ou modal. */
function ProviderAwaitAcceptMinutesChip(props: { task: any; C: ColorPalette; compact: boolean }) {
  const { task, C, compact } = props;
  const { t } = useTranslation();
  const pill = (
    <ProviderTerracottaDurationPillBadge
      task={task}
      computeMinutes={computeProviderAwaitAcceptElapsedMinutes}
      tickIntervalMs={15_000}
      getA11y={(m) => t('home.providerOsAwaitAcceptA11y', { count: Math.max(0, m) })}
      dashWhenNegative={false}
      alignSelf={compact ? 'flex-start' : 'center'}
      compact={compact}
      tone="warning"
      renderBelow={
        compact
          ? undefined
          : (minutes) => (
              <>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: '#8B4513',
                    marginTop: 8,
                    textAlign: 'center',
                  }}
                >
                  {t('home.providerOsAwaitAcceptMinutes', { count: minutes })}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: C.slate, marginTop: 5, textAlign: 'center' }}>
                  {t('home.providerOsAwaitAcceptMinutesSub')}
                </Text>
              </>
            )
      }
    />
  );
  if (compact) {
    return pill;
  }
  return (
    <View accessibilityRole="text" style={{ alignSelf: 'center', marginBottom: 12, alignItems: 'center' }}>
      {pill}
    </View>
  );
}

/** ISO da última pausa de atendimento (metadata servidor / checklist). */
function providerTaskLastPauseIso(t: any): string | null {
  const top = t?.lastPauseAt != null ? String(t.lastPauseAt).trim() : '';
  if (top) return top;
  const m = t?.metadata;
  if (m && typeof m === 'object' && m.lastPauseAt != null) {
    const s = String(m.lastPauseAt).trim();
    if (s) return s;
  }
  return null;
}

function computeProviderPausedElapsedMinutes(t: any): number {
  const iso = providerTaskLastPauseIso(t);
  if (!iso) return -1;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return -1;
  return Math.max(0, Math.floor((Date.now() - ms) / 60_000));
}

/** Badge de minutos em pausa — mesmo pill/animacao que «aguardando aceite». */
function ProviderPausedDurationBadge(props: { task: any }) {
  const { task } = props;
  const { t } = useTranslation();
  return (
    <ProviderTerracottaDurationPillBadge
      task={task}
      computeMinutes={computeProviderPausedElapsedMinutes}
      tickIntervalMs={30_000}
      getA11y={(m) => (m < 0 ? t('pause.listBadge') : t('pause.listBadgeA11y', { count: m }))}
      dashWhenNegative
      alignSelf="center"
      compact
      tone="danger"
      leadingIcon="pause-circle-outline"
      leadingIconAnimation="pulse"
    />
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { colors: C, dark: themeDark, appDisplayName, appTagline } = useTheme();
  const styles = useMemo(() => createDashboardStyles(C), [C]);
  const { user, userRole } = useAuth();
  const { isOnline } = useConnectivity(8000);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  /** Área reservada para a tab bar inferior (largura total + «Mais») */
  const TAB_BAR_HEIGHT = tabBarOuterHeight(insets.bottom);
  const catalogScrollBottomPad = insets.bottom + 132;
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
  /** Limite de linhas na aba Concluídas (lista completa continua em memória após sync). */
  const [providerCompletedListCap, setProviderCompletedListCap] = useState(PROVIDER_OS_COMPLETED_INITIAL);
  const [providerTasks, setProviderTasks] = useState<any[]>([]);
  const [inprogressIds, setInprogressIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  /** IDs em `@brspark_accepted_tasks` (aceite local); a aba «Iniciadas» usa `inprogressIds` / estado IN_PROGRESS. */
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [providerSortMode, setProviderSortMode] = useState<ProviderListSortMode>('NEWEST');
  const providerCardEnterAnimMapRef = useRef<Map<string, Animated.Value>>(new Map());
  const providerCardEnterSeenRef = useRef<Set<string>>(new Set());
  const [providerCardVariant] = useState<ProviderCardVariant>('premium');
  const [providerCardHighContrast, setProviderCardHighContrast] = useState(false);
  const [providerReduceMotion, setProviderReduceMotion] = useState(false);
  const [osrmDurations, setOsrmDurations] = useState<Record<string, number>>({});
  const [isOptimizingRoute, setIsOptimizingRoute] = useState(false);
  /** Qual modo está a ser calculado (spinner nos chips — não confundir com providerSortMode até terminar) */
  const [osrmOptimizingMode, setOsrmOptimizingMode] = useState<null | 'OSRM_ROUTE' | 'OSRM_SLA_ROUTE'>(null);
  const lastOsrmPendingKeyRef = useRef<string>('');
  /** Evita que o toque curto dispare logo após toque longo (Recentes / Antigas). */
  const skipReceiptTapAfterLongPress = useRef(false);
  /** Evita vários `loadData(true)` ao abrir OS a partir de push enquanto a lista ainda não traz o id. */
  const pushOpenLoadAttemptRef = useRef<string | null>(null);
  /** Folha de critérios alternativos: âncora do segmento que abriu o menu. */
  const [providerAltSortAnchor, setProviderAltSortAnchor] = useState<null | 'NEWEST' | 'OLDEST'>(null);
  const [providerAltSortPicked, setProviderAltSortPicked] = useState<ProviderLongPressSheetMode>('NEWEST');
  const [savedAltSortRecent, setSavedAltSortRecent] = useState<ProviderLongPressSheetMode>('NEWEST');
  const [savedAltSortOld, setSavedAltSortOld] = useState<ProviderLongPressSheetMode>('OLDEST');
  const [providerRouteSheetOpen, setProviderRouteSheetOpen] = useState(false);
  const [isProviderMenuExpanded, setIsProviderMenuExpanded] = useState(true);
  // Which list section is currently in drag-reorder mode ('MY' | 'SHARED' | null)
  const [reorderingList, setReorderingList] = useState<'MY' | 'SHARED' | null>(null);

  // Task Card Details Modal
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskModalVisible, setTaskModalVisible] = useState(false);

  /** Com rede: guardar o JSON do modelo em `@brspark_templates` ao abrir o cartão — evita checklist vazio offline. */
  useEffect(() => {
    if (mode !== 'PROVIDER' || !taskModalVisible || !selectedTask?.refId) return;
    const rid = String(selectedTask.refId).trim();
    if (!rid || rid === 'null' || rid === 'undefined') return;
    void cacheChecklistTemplateIfMissing(rid, { timeoutMs: 22_000 });
  }, [mode, taskModalVisible, selectedTask?.refId]);
  const [showRouteMap, setShowRouteMap] = useState<boolean>(false);
  const [routeMapCenterObj, setRouteMapCenterObj] = useState<{lat: number, lng: number} | null>(null);
  /** Mapa compacto no card da OS (local de atendimento). */
  const [providerOsMiniMapTask, setProviderOsMiniMapTask] = useState<any | null>(null);
  const providerOsMiniMapHeaderName = providerOsMiniMapTask
    ? providerTaskServiceLocationName(providerOsMiniMapTask) || 'Local de atendimento'
    : '';
  const providerOsMiniMapHeaderAddress = providerOsMiniMapTask
    ? providerTaskServiceAddressTextOnly(providerOsMiniMapTask)
    : '';
  const [osrmRouteCoords, setOsrmRouteCoords] = useState<{latitude: number, longitude: number}[]>([]);
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  /** GPS atual para distância Haversine nos cards (sem API externa). */
  const [providerMyLocation, setProviderMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [providerMyLocationStatus, setProviderMyLocationStatus] = useState<
    'idle' | 'loading' | 'ready' | 'denied' | 'error'
  >('idle');

  useEffect(() => {
    if (mode !== 'PROVIDER') {
      return;
    }
    let cancelled = false;
    setProviderMyLocationStatus('loading');
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setProviderMyLocation(null);
            setProviderMyLocationStatus('denied');
          }
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setProviderMyLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        setProviderMyLocationStatus('ready');
      } catch {
        if (!cancelled) {
          setProviderMyLocation(null);
          setProviderMyLocationStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'PROVIDER') return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(OS_ALT_SORT_STORAGE_KEY);
        const o = raw ? JSON.parse(raw) : {};
        if (cancelled) return;
        setSavedAltSortRecent(
          normalizeSavedLongPressForSlot(parseStoredAltSort(o, 'recent'), 'recent'),
        );
        setSavedAltSortOld(normalizeSavedLongPressForSlot(parseStoredAltSort(o, 'old'), 'old'));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  /** Pendentes com coordenadas, na mesma ordem da lista quando “Rota” está ativa (mapa alinhado à timeline). */
  const routeMapTasksOrdered = useMemo(() => {
    const base = providerTasks.filter((t) => {
      const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
      if (!providerTabMatchesTask(providerTab, s)) return false;
      return parseCoordLatLng(t) != null;
    });
    return sortTasksForOsrmRoute(base, providerSortMode, osrmDurations);
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

  useEffect(() => {
    setProviderCompletedListCap(PROVIDER_OS_COMPLETED_INITIAL);
  }, [providerTab, providerTasks]);

  const providerOsListSorted = useMemo(() => {
    const filtered = providerTasks.filter((t) => {
      const s = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
      return providerTabMatchesTask(providerTab, s);
    });
    return sortTasksForOsrmRoute(filtered, providerSortMode, osrmDurations);
  }, [providerTasks, completedIds, inprogressIds, acceptedIds, providerTab, providerSortMode, osrmDurations]);

  const providerOsFlatData = useMemo(() => {
    if (providerTab !== 'COMPLETED') return providerOsListSorted;
    return providerOsListSorted.slice(0, providerCompletedListCap);
  }, [providerTab, providerOsListSorted, providerCompletedListCap]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [hcRaw, rm, boldText] = await Promise.all([
          AsyncStorage.getItem(PROVIDER_CARD_HIGH_CONTRAST_KEY),
          AccessibilityInfo.isReduceMotionEnabled(),
          AccessibilityInfo.isBoldTextEnabled(),
        ]);
        if (cancelled) return;
        const hc = hcRaw === '1' || hcRaw === 'true' || boldText === true;
        setProviderCardHighContrast(hc);
        void AsyncStorage.setItem(PROVIDER_CARD_VARIANT_KEY, 'premium').catch(() => {});
        setProviderReduceMotion(!!rm);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    providerCardEnterSeenRef.current = new Set();
    providerCardEnterAnimMapRef.current.clear();
  }, [providerTab]);

  useEffect(() => {
    const existingIds = new Set(providerOsFlatData.map((row) => String(row?.id || '')));
    for (const id of [...providerCardEnterAnimMapRef.current.keys()]) {
      if (!existingIds.has(id)) providerCardEnterAnimMapRef.current.delete(id);
    }
    providerOsFlatData.forEach((row, idx) => {
      const id = String(row?.id || '').trim();
      if (!id || providerCardEnterSeenRef.current.has(id)) return;
      providerCardEnterSeenRef.current.add(id);
      const status = effectiveProviderTaskStatus(row, completedIds, inprogressIds, acceptedIds);
      const profile = providerCardEnterMotionProfile(status, idx, providerReduceMotion);
      const v = new Animated.Value(0);
      providerCardEnterAnimMapRef.current.set(id, v);
      if (providerReduceMotion) {
        v.setValue(1);
        return;
      }
      Animated.timing(v, {
        toValue: 1,
        duration: profile.duration,
        delay: profile.delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        providerCardEnterAnimMapRef.current.set(id, new Animated.Value(1));
      });
    });
  }, [providerOsFlatData, completedIds, inprogressIds, acceptedIds, providerReduceMotion]);

  const providerCardAnimatedStyle = useCallback((taskId: string, status: string, index: number) => {
    const id = String(taskId || '').trim();
    if (!id) return undefined;
    const profile = providerCardEnterMotionProfile(status, index, providerReduceMotion);
    if (providerReduceMotion) return undefined;
    const v = providerCardEnterAnimMapRef.current.get(id);
    if (!v) return undefined;
    return {
      opacity: v,
      transform: [
        {
          translateY: v.interpolate({
            inputRange: [0, 1],
            outputRange: [profile.translateY, 0],
          }),
        },
        {
          scale: v.interpolate({
            inputRange: [0, 1],
            outputRange: [profile.fromScale, 1],
          }),
        },
      ],
    };
  }, [providerReduceMotion]);

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
               return providerOsrmSlaAdjustedDurationMinutes(d1, a) - providerOsrmSlaAdjustedDurationMinutes(d2, b);
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
                  return providerOsrmSlaAdjustedDurationMinutes(d1, a) - providerOsrmSlaAdjustedDurationMinutes(d2, b);
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

    import('../../src/database')
      .then(({ updateAssetOrder }) => {
        updateAssetOrder(updates, user?.email || '');
      })
      .catch(() => {});

    const applySwap = (prev: Asset[]) =>
      prev.map(a => { const found = clone.find(c => c.id === a.id); return found ? { ...a, displayOrder: found.displayOrder } : a; });

    if (isGlobal) setAllAssets(applySwap);
    else setAssets(applySwap);
  };


  /** Evita corridas: vários loadData (focus + poller a cada 20s) não podem sobrescrever `inprogressIds` com leituras antigas do AsyncStorage. */
  const loadDataChainRef = useRef(Promise.resolve());
  /** `false` = último check de rede foi offline; usado para disparar sync em rajada ao voltar online. */
  const reconnectOnlineRef = useRef<boolean | null>(null);
  /** Última vez que o diretório de empresas veio da rede com sucesso (força bust após TTL). */
  const lastDirectoryFetchRef = useRef(0);

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
         const events = await AgendaService.getUnifiedAgenda(
           email,
           userRole === 'TECHNICIAN' ? 'PROVIDER' : 'CLIENT',
         );
         
         const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
         let executedTasksRaw = [];
         try { executedTasksRaw = JSON.parse(executedStr); } catch(e) {}
         if (!Array.isArray(executedTasksRaw)) executedTasksRaw = [];
         
         const executedMap: Record<string, any> = {};
         const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
         const now = Date.now();
         let updatedExecs = false;
         const validExecs: any[] = [];
         
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
             await updateStoredJsonArray<any>('@brspark_executed_tasks', (current) => {
               const merged = [...validExecs];
               const seen = new Set(
                 merged.map((ex) => String(typeof ex === 'string' ? ex : ex?.id || '').trim()).filter(Boolean)
               );
               for (const ex of current) {
                 const item = typeof ex === 'string' ? { id: ex, completedAt: new Date().toISOString() } : ex;
                 const id = String(item?.id || '').trim();
                 if (!id || seen.has(id)) continue;
                 const completedTs = new Date(item?.completedAt ?? 0).getTime();
                 const age = Number.isFinite(completedTs) ? now - completedTs : 0;
                 if (!Number.isFinite(completedTs) || age <= THIRTY_DAYS_MS) {
                   merged.push(item);
                   seen.add(id);
                 }
               }
               return merged;
             });
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
                     completedAt: exData.completedAt,
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
             if (taskRowIsRoutineTask(e)) return false;
             return true;
         }).filter((e: any) => {
             const isPurged = executedTasksRaw.find((raw:any) => (typeof raw === 'string' ? raw : raw.id) === String(e.id)) 
                              && !executedMap[String(e.id)];
             return !isPurged;
         });

         const pendingSyncIds = await getTaskIdsWithPendingLocalSyncOverlay();

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

            const executionCreatedIso =
              t.executionCreatedAt != null && String(t.executionCreatedAt).trim() !== ''
                ? String(t.executionCreatedAt).trim()
                : null;
            const createdAtDisplay =
              executionCreatedIso || ymdLocalNoonToIsoUtc(t.startDate) || new Date().toISOString();
            const receivedMs = parseIsoToMs(providerTaskDeviceReceivedAtIso(t));
            const osCreatedMs =
              parseIsoToMs(executionCreatedIso) ||
              parseIsoToMs(ymdLocalNoonToIsoUtc(t.startDate)) ||
              0;
            const completedMs =
              eff === 'COMPLETED'
                ? parseIsoToMs(providerTaskCompletedAtIso(t, executedMap))
                : 0;
            const __receivedSortMs =
              completedMs > 0 ? completedMs : receivedMs > 0 ? receivedMs : osCreatedMs;
            const __osCreatedSortMs = osCreatedMs;
            const __dueSortMs = parseIsoToMs(providerTaskDueIsoForSort(t));

            return {
               ...t,
               id: String(t.id),
               osNumber: t.osNumber ?? null,
               locationAddress: t.locationAddress ?? null,
               locationZoneType: t.locationZoneType ?? t.metadata?.locationZoneType ?? null,
               locationLat: geo?.lat ?? t.locationLat ?? null,
               locationLng: geo?.lng ?? t.locationLng ?? null,
               expectedFormDurationMinutes: providerTaskExpectedFormDurationMinutes(t),
               etaMinutes: providerTaskEtaMinutes(t),
               title: `${taskOsLabel({ ...t, id: String(t.id) })} — ${t.title || 'Manutenção'}`,
               status: eff,
               isPendingSync: pendingSyncIds.has(String(t.id)),
               isCachedLocally: false,
               service: serviceTitle,
               formTemplateTitle,
               createdAt: createdAtDisplay,
               dueDate: providerTaskVencimentoIso(t) ?? '',
               __receivedSortMs,
               __osCreatedSortMs,
               __dueSortMs,
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
               iconLibrary: t.metadata?.iconLibrary || null,
               isAccepted: acceptedTasks.includes(String(t.id)),
               pauseReasonSummary: t.metadata?.lastPauseReasonSummary || null,
               lastPauseAt: t.metadata?.lastPauseAt ?? null,
            };
         });
         // Ordem inicial alinhada a «Recentes»: data de recebimento no aparelho (fallback criação).
         mapped.sort((a: any, b: any) => compareProviderTasksForList(a, b, 'NEWEST'));

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

    ensureServiceCategoriesColorColumn();
    const storedCats = getServiceCategories();
    if (storedCats.length > 0) {
      setCategories([
        {
          id: 'all',
          labelKey: 'all',
          label: t('home.serviceCategories.all'),
          icon: 'apps',
          color: SERVICE_CATEGORY_COLORS.all,
        },
        ...storedCats.map((r: any) => ({
          id: r.id,
          label: r.label,
          labelKey: LEGACY_SERVICE_CATEGORY_I18N[r.id] ?? undefined,
          icon: r.icon,
          color: r.color || SERVICE_CATEGORY_COLORS[r.id],
        })),
      ]);
    } else {
      setCategories(
        SERVICE_CATEGORIES.map((c) => ({
          id: c.id,
          labelKey: c.labelKey,
          label:
            c.id === 'all'
              ? t('home.serviceCategories.all')
              : c.id,
          icon: c.icon,
          color: c.color,
          isMCI: c.isMCI,
        }))
      );
    }

    // Diretório de empresas: rede com bust periódico: evita lista desatualizada / SQLite com IDs antigos.
    const directoryTtlMs = 120_000;
    const forceDirectory =
      triggerSync || Date.now() - lastDirectoryFetchRef.current >= directoryTtlMs;
    const result = await ProviderService.search({
      page: 1,
      limit: 20,
      forceRefresh: forceDirectory,
    });
    if (!result.fromCache) {
      lastDirectoryFetchRef.current = Date.now();
    }
    setProviders(result.data);
    };

    loadDataChainRef.current = loadDataChainRef.current.then(run).catch((e) => {
      console.error('[Dashboard] loadData:', e);
    });
    return loadDataChainRef.current;
  };

  /** Abrir cartão da OS após toque «OK» na notificação push. */
  useEffect(() => {
    if (userRole !== 'TECHNICIAN') return;
    const tid = peekPendingOpenExecutionFromPush();
    if (!tid) return;
    if (mode !== 'PROVIDER') return;
    const found = providerTasks.find((t: any) => String(t.id) === String(tid));
    if (found) {
      takePendingOpenExecutionFromPush();
      setProviderTab('PENDING');
      setSelectedTask(found);
      setTaskModalVisible(true);
    }
  }, [providerTasks, mode, userRole]);

  useFocusEffect(
    useCallback(() => {
      if (userRole !== 'TECHNICIAN') return;
      const tid = peekPendingOpenExecutionFromPush();
      if (!tid) {
        pushOpenLoadAttemptRef.current = null;
        return;
      }
      setMode('PROVIDER');
      const found = providerTasks.find((t: any) => String(t.id) === String(tid));
      if (found) return;
      if (pushOpenLoadAttemptRef.current !== tid) {
        pushOpenLoadAttemptRef.current = tid;
        loadData(true);
      }
    }, [userRole, providerTasks, loadData, setMode])
  );

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

  // Rajada de sync ao recuperar rede (complementa o poller de 20 s e reduz sensação de "app preso").
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
          // Primeiro tick: sync completo (bens + filas) — após offline o `loadData(false)` pode deixar UI «vazia» se o cache local estiver inconsistente.
          await loadData(i === 0);
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
    const interval = setInterval(() => {
      if (!active || !user) return;
      void (async () => {
        try {
          // ALWAYS push sync queue so that pushTelemetryBatch() runs!
          await pushSyncQueue(user.email);
          await pullTasks(user.email);
          if (active) await loadData(false);
        } catch (e) {
          console.log('[Auto-Poller] Falha silenciosa:', e);
        }
      })();
    }, 20_000); // 20 s — sincroniza OS sem martelar /api/sync/tasks

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

  /** Catálogo SERVIÇOS: só a lista de empresas rola; categorias, busca e chips ficam fixos. */
  const catalogFilteredProviders = useMemo(
    () =>
      providers
        .filter((p) => (svcFilter === 'all' ? true : p.category === svcFilter))
        .filter((p) => smartMatch(p, searchText))
        .sort((a, b) => {
          if (sortMode === 'RATING') return b.rating - a.rating;
          if (sortMode === 'VERIFIED') return (b.verified ? 1 : 0) - (a.verified ? 1 : 0);
          if (sortMode === 'DEFAULT') return 0;
          return a.id.localeCompare(b.id);
        }),
    [providers, svcFilter, searchText, sortMode]
  );

  const catalogListHeader = useMemo(
    () => (
      <View style={{ paddingHorizontal: 16 }}>
        {(svcFilter !== 'all' || searchText.length > 0) && (
          <Text style={styles.resultsLabel}>
            {searchText
              ? t('home.resultsFor', { query: searchText })
              : svcFilter !== 'all'
                ? (() => {
                    const c = categories.find((x: any) => x.id === svcFilter);
                    if (c?.labelKey) return t(`home.serviceCategories.${c.labelKey}`);
                    return c?.label || c?.id || svcFilter;
                  })()
                : ''}
          </Text>
        )}
        {svcFilter === 'all' && !searchText && (
          <Text style={styles.sectionLabel}>{t('home.featuredProviders')}</Text>
        )}
      </View>
    ),
    [svcFilter, searchText, categories, t, styles]
  );

  const providerOsSortChipsHeader = useMemo(
    () => (
      <View style={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 6, backgroundColor: C.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 2,
            gap: 5,
          }}
        >
          <Pressable
            delayLongPress={420}
            onLongPress={() => {
              skipReceiptTapAfterLongPress.current = true;
              setProviderAltSortPicked(
                providerAltPickedDefaultForSheet(
                  'NEWEST',
                  providerSortMode,
                  savedAltSortRecent,
                  savedAltSortOld,
                ),
              );
              setProviderAltSortAnchor('NEWEST');
            }}
            onPress={() => {
              if (skipReceiptTapAfterLongPress.current) {
                skipReceiptTapAfterLongPress.current = false;
                return;
              }
              setProviderSortMode(savedAltSortRecent);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: providerListModeInLongPressAnchorFamily(providerSortMode, 'NEWEST')
                ? C.status.warning.bg
                : 'transparent',
              paddingHorizontal: 6,
              paddingVertical: 3,
              borderRadius: 12,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Ionicons
              name={
                providerListModeInLongPressAnchorFamily(providerSortMode, 'NEWEST') ? 'time' : 'time-outline'
              }
              size={PROVIDER_OS_SORT_CHIP_ICON_SIZE}
              color={
                providerListModeInLongPressAnchorFamily(providerSortMode, 'NEWEST')
                  ? MODE_SEGMENT_COLORS.PROVIDER
                  : C.textLight
              }
              style={{ marginRight: PROVIDER_OS_SORT_CHIP_ICON_MARGIN }}
            />
            <Text
              style={{
                fontSize: PROVIDER_OS_SORT_CHIP_FONT_SIZE,
                lineHeight: PROVIDER_OS_SORT_CHIP_LINE_HEIGHT,
                fontWeight: providerListModeInLongPressAnchorFamily(providerSortMode, 'NEWEST') ? '900' : '700',
                color: providerListModeInLongPressAnchorFamily(providerSortMode, 'NEWEST')
                  ? MODE_SEGMENT_COLORS.PROVIDER
                  : C.textLight,
                textTransform: 'uppercase',
                flexShrink: 1,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t('home.providerSort.recent')}
            </Text>
          </Pressable>
          <Pressable
            delayLongPress={420}
            onLongPress={() => {
              skipReceiptTapAfterLongPress.current = true;
              setProviderAltSortPicked(
                providerAltPickedDefaultForSheet(
                  'OLDEST',
                  providerSortMode,
                  savedAltSortRecent,
                  savedAltSortOld,
                ),
              );
              setProviderAltSortAnchor('OLDEST');
            }}
            onPress={() => {
              if (skipReceiptTapAfterLongPress.current) {
                skipReceiptTapAfterLongPress.current = false;
                return;
              }
              setProviderSortMode(savedAltSortOld);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: providerListModeInLongPressAnchorFamily(providerSortMode, 'OLDEST')
                ? C.status.warning.bg
                : 'transparent',
              paddingHorizontal: 6,
              paddingVertical: 3,
              borderRadius: 12,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Ionicons
              name={
                providerListModeInLongPressAnchorFamily(providerSortMode, 'OLDEST')
                  ? 'calendar'
                  : 'calendar-outline'
              }
              size={PROVIDER_OS_SORT_CHIP_ICON_SIZE}
              color={
                providerListModeInLongPressAnchorFamily(providerSortMode, 'OLDEST')
                  ? MODE_SEGMENT_COLORS.PROVIDER
                  : C.textLight
              }
              style={{ marginRight: PROVIDER_OS_SORT_CHIP_ICON_MARGIN }}
            />
            <Text
              style={{
                fontSize: PROVIDER_OS_SORT_CHIP_FONT_SIZE,
                lineHeight: PROVIDER_OS_SORT_CHIP_LINE_HEIGHT,
                fontWeight: providerListModeInLongPressAnchorFamily(providerSortMode, 'OLDEST') ? '900' : '700',
                color: providerListModeInLongPressAnchorFamily(providerSortMode, 'OLDEST')
                  ? MODE_SEGMENT_COLORS.PROVIDER
                  : C.textLight,
                textTransform: 'uppercase',
                flexShrink: 1,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t('home.providerSort.oldestRecv')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setProviderRouteSheetOpen(true)}
            style={({ pressed }) => {
              const routeOn = providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE';
              return {
                flex: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: routeOn ? C.status.warning.bg : 'transparent',
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderRadius: 12,
                opacity: providerTab === 'PENDING' ? (pressed ? 0.88 : 1) : 0.5,
              };
            }}
          >
            {(() => {
              const routeOn = providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE';
              const iconName =
                providerSortMode === 'OSRM_SLA_ROUTE'
                  ? routeOn
                    ? 'alert-circle'
                    : 'alert-circle-outline'
                  : providerSortMode === 'OSRM_ROUTE'
                    ? routeOn
                      ? 'rocket'
                      : 'rocket-outline'
                    : 'rocket-outline';
              return (
                <>
                  {isOptimizingRoute &&
                  (osrmOptimizingMode === 'OSRM_ROUTE' || osrmOptimizingMode === 'OSRM_SLA_ROUTE') ? (
                    <View
                      style={{
                        width: PROVIDER_OS_SORT_CHIP_ICON_SIZE,
                        height: PROVIDER_OS_SORT_CHIP_ICON_SIZE,
                        marginRight: PROVIDER_OS_SORT_CHIP_ICON_MARGIN,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <ActivityIndicator size="small" color={MODE_SEGMENT_COLORS.PROVIDER} />
                    </View>
                  ) : (
                    <Ionicons
                      name={iconName as any}
                      size={PROVIDER_OS_SORT_CHIP_ICON_SIZE}
                      color={routeOn ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight}
                      style={{ marginRight: PROVIDER_OS_SORT_CHIP_ICON_MARGIN }}
                    />
                  )}
                  <Text
                    style={{
                      fontSize: PROVIDER_OS_SORT_CHIP_FONT_SIZE,
                      lineHeight: PROVIDER_OS_SORT_CHIP_LINE_HEIGHT,
                      fontWeight: routeOn ? '900' : '700',
                      color: routeOn ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight,
                      textTransform: 'uppercase',
                      flexShrink: 1,
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {t('home.providerSort.routerLabel')}
                  </Text>
                </>
              );
            })()}
          </Pressable>
        </View>
      </View>
    ),
    [
      C.background,
      C.status.warning.bg,
      C.textLight,
      isOptimizingRoute,
      osrmOptimizingMode,
      providerSortMode,
      providerTab,
      savedAltSortOld,
      savedAltSortRecent,
      t,
    ],
  );

  const providerOsCompletedListFooter = useMemo(() => {
    if (providerTab !== 'COMPLETED' || providerOsListSorted.length === 0) return null;
    const total = providerOsListSorted.length;
    const shown = providerOsFlatData.length;
    if (total > shown) {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
          <Text style={{ fontSize: 12, color: C.textLight, marginBottom: 10 }}>
            {t('home.providerCompletedShowing', { shown, total })}
          </Text>
          <Pressable
            onPress={() => setProviderCompletedListCap((c) => c + PROVIDER_OS_COMPLETED_PAGE)}
            style={({ pressed }) => ({
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: MODE_SEGMENT_COLORS.PROVIDER,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
              {t('home.providerCompletedLoadMore')}
            </Text>
          </Pressable>
        </View>
      );
    }
    if (total > PROVIDER_OS_COMPLETED_INITIAL) {
      return (
        <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 }}>
          <Text style={{ fontSize: 12, color: C.textLight, textAlign: 'center' }}>
            {t('home.providerCompletedAllLoaded', { total })}
          </Text>
        </View>
      );
    }
    return null;
  }, [C.textLight, providerOsFlatData.length, providerOsListSorted.length, providerTab, t]);

  /** No modo prestador (técnico), a página de bens fica à esquerda no pager — desativa o swipe para não aceder a bens por gesto. */
  const technicianProviderPagerLocked = userRole === 'TECHNICIAN' && mode === 'PROVIDER';

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
        scrollEnabled={!technicianProviderPagerLocked}
        bounces={!technicianProviderPagerLocked}
        style={{ flex: 1 }}
      >
        {/* ═══════ PAGE 1: Catálogo de Serviços ═══════ */}
        {userRole === 'CLIENT' && (
        <View style={{ width: pagerWidth, flex: 1, backgroundColor: C.background }}>
          <LinearGradient
            colors={[SERVICE_CATEGORY_COLORS.all, C.branding]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.premiumHeader}
          >
            <View style={styles.premiumHeaderRow}>
              <View>
                <Text style={styles.premiumHeaderEyebrow}>{appDisplayName}</Text>
                <Text style={styles.premiumHeaderText}>{t('home.searchTitle')}</Text>
                <Text style={styles.premiumHeaderSub} numberOfLines={1}>{appTagline}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.circularCatScroll}
              keyboardShouldPersistTaps="handled"
            >
              {(categories.length > 0 ? categories : SERVICE_CATEGORIES).map((cat: any) => (
                <TouchableOpacity key={cat.id} style={styles.circularCatItem} onPress={() => setSvcFilter(cat.id)}>
                  <View style={[styles.circularCatIconWrap, svcFilter === cat.id && styles.circularCatActive]}>
                    {cat.isMCI
                      ? <MaterialCommunityIcons name={cat.icon as any} size={24} color={C.cardWhite} />
                      : <Ionicons name={cat.icon as any} size={24} color={C.cardWhite} />}
                  </View>
                  <Text style={styles.circularCatLabel} numberOfLines={1}>
                    {cat.labelKey
                      ? t(`home.serviceCategories.${cat.labelKey}`)
                      : (cat.label || cat.id)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </LinearGradient>

          <View style={styles.searchWrapPremium}>
            <Ionicons name="search" size={18} color={C.textLight} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={C.textLight}
              value={searchText}
              onChangeText={(txt) => setSearchText(txt)}
              returnKeyType="done"
            />
          </View>

          {/* Altura fixa: ScrollView horizontal dentro de coluna flex:1 esticava na vertical e inchava os chips */}
          <View style={{ height: 48, flexGrow: 0, flexShrink: 0, justifyContent: 'center' }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              style={{ flexGrow: 0 }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingVertical: 4,
                gap: 8,
                alignItems: 'center',
                flexGrow: 0,
              }}
              keyboardShouldPersistTaps="handled"
            >
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
          </View>

          <FlatList
            data={catalogFilteredProviders}
            keyExtractor={(p) => p.id}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: catalogScrollBottomPad,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
            ListHeaderComponent={catalogListHeader}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 16 }}>
                <Ionicons name="search-outline" size={44} color={C.textLight} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.textSecondary, marginTop: 12 }}>{t('home.noProviders')}</Text>
              </View>
            }
            renderItem={({ item: provider }) => {
              const isExpanded = expandedProviders.has(provider.id);
              const openCatalog = () => router.push(`/provider-services/${provider.id}` as any);
              return (
                <View style={[styles.providerCard, { marginHorizontal: 16 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={openCatalog}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start' }}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.openServiceCatalog', { name: provider.name })}
                    >
                      <Image
                        source={{
                          uri: resolveDirectoryMediaUri(
                            String(provider.logo_url || provider.photo || '')
                          ),
                        }}
                        style={styles.providerPhoto}
                        resizeMode={provider.logo_url ? 'contain' : 'cover'}
                      />
                      <View style={{ flex: 1, marginLeft: 16, paddingRight: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                          <Text style={[styles.providerName, { flexShrink: 1 }]} numberOfLines={2}>{provider.name}</Text>
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
                            flexShrink: 1,
                          }]}>
                            <Ionicons name="calendar-outline" size={10} color={C.accent} style={{ marginRight: 3 }} />
                            <Text style={[styles.promoBadgeText, { color: C.accent, fontSize: 8.5, fontWeight: '800' }]} numberOfLines={1}>
                              {provider.category?.toUpperCase() || 'SERVIÇO'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleExpand(provider.id)}
                      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
                      style={{ padding: 4, marginTop: -2 }}
                      accessibilityRole="button"
                      accessibilityLabel={isExpanded ? t('home.collapseProvider') : t('home.expandProvider')}
                    >
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={C.textLight} />
                    </TouchableOpacity>
                  </View>

                  {isExpanded && (
                    <View style={{ marginTop: 10, marginLeft: 0, borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12, paddingHorizontal: 0 }}>
                      {(() => {
                        const tagStr = typeof provider.tags === 'string' ? provider.tags.trim() : '';
                        const kwStr = provider.keywords ? String(provider.keywords).trim() : '';
                        if (!tagStr && !kwStr) {
                          return (
                            <Text style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic' }}>
                              {t('home.providerNoExtraInfo')}
                            </Text>
                          );
                        }
                        return (
                          <>
                            <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>{t('assetDetail.generalInfo')}</Text>
                            {tagStr ? (
                              <View style={styles.providerTagsRow}>
                                <View style={styles.providerHighlightPill}>
                                  <Text style={styles.providerHighlightText}>
                                    {tagStr.split(',').slice(0, 2).join(' · ')}
                                  </Text>
                                </View>
                              </View>
                            ) : null}
                            {kwStr ? (
                              <Text style={{ fontSize: 11, color: C.textSecondary, marginTop: tagStr ? 10 : 0 }} numberOfLines={8}>
                                {kwStr}
                              </Text>
                            ) : null}
                          </>
                        );
                      })()}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                    <TouchableOpacity
                      style={{ backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                      onPress={openCatalog}
                    >
                      <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 9.5, textTransform: 'uppercase' }}>{t('home.requestBtn')}</Text>
                      <Ionicons name="arrow-forward" size={10} color={C.cardWhite} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </View>
        )}

        {/* ═══════ PAGE 2: Dashboard de Ativos ═══════ */}
        <ScrollView
          style={{ width: pagerWidth }}
          contentContainerStyle={{ paddingBottom: catalogScrollBottomPad }}
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
        <View style={{ width: pagerWidth, flex: 1, backgroundColor: C.background }}>
          {/* Cabeçalho das abas (fixo no topo desta página) */}
          <View
            style={{
              backgroundColor: C.background,
              paddingTop: 6,
              paddingBottom: 6,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: C.divider,
              zIndex: 10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                marginHorizontal: 16,
                borderRadius: 14,
                padding: 2,
                backgroundColor: C.surfaceLow,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: C.border,
              }}
            >
              {(
                [
                  {
                    id: 'PENDING' as const,
                    label: 'Pendentes',
                    color: MODE_SEGMENT_COLORS.PROVIDER,
                    icon: 'hourglass-outline' as const,
                  },
                  {
                    id: 'IN_PROGRESS' as const,
                    label: 'Iniciadas',
                    color: MEDIA_TAG_COLORS.BEFORE,
                    icon: 'build-outline' as const,
                  },
                  {
                    id: 'COMPLETED' as const,
                    label: 'Concluídas',
                    color: MEDIA_TAG_COLORS.AFTER,
                    icon: 'checkmark-done-outline' as const,
                  },
                ] as const
              ).map((tab) => {
                const isActive = providerTab === tab.id;
                const stageCount =
                  tab.id === 'PENDING'
                    ? providerStageCounts.pending
                    : tab.id === 'IN_PROGRESS'
                      ? providerStageCounts.inProgress
                      : providerStageCounts.completed;
                const inactiveInk = C.textLight;
                /** Mesma lógica que `providerTaskListAccentColor`: pendente = cinza; em andamento = âmbar; concluída = verde. */
                const tabTopStripeColor =
                  tab.id === 'PENDING'
                    ? C.textLight
                    : tab.id === 'IN_PROGRESS'
                      ? MEDIA_TAG_COLORS.DURING
                      : C.connectivity.online;
                return (
                  <Pressable
                    key={tab.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`${tab.label}, ${stageCount}`}
                    android_ripple={{ color: themeDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)', foreground: true }}
                    onPress={() => {
                      setProviderTab(tab.id as any);
                      if (tab.id !== 'PENDING' && (providerSortMode === 'OSRM_ROUTE' || providerSortMode === 'OSRM_SLA_ROUTE')) {
                        setProviderSortMode('NEWEST');
                      }
                    }}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        marginHorizontal: 2,
                        borderRadius: 12,
                        overflow: 'hidden',
                        backgroundColor: isActive
                          ? C.cardWhite
                          : pressed
                            ? themeDark
                              ? 'rgba(255,255,255,0.06)'
                              : 'rgba(15,23,42,0.04)'
                            : 'transparent',
                        ...(isActive
                          ? Platform.select({
                              ios: {
                                shadowColor: '#0f172a',
                                shadowOffset: { width: 0, height: 3 },
                                shadowOpacity: 0.12,
                                shadowRadius: 6,
                              },
                              android: { elevation: 3 },
                              default: {},
                            })
                          : {}),
                      },
                    ]}
                  >
                    {isActive ? (
                      <View style={{ height: 2, width: '100%', backgroundColor: tabTopStripeColor }} />
                    ) : (
                      <View style={{ height: 2, width: '100%', backgroundColor: 'transparent' }} />
                    )}
                    <View
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 6,
                        paddingHorizontal: 4,
                        minHeight: 46,
                      }}
                    >
                      <Text
                        style={{
                          width: '100%',
                          fontSize: 16,
                          fontWeight: isActive ? '900' : '800',
                          letterSpacing: 0.2,
                          color: isActive ? C.slate : inactiveInk,
                          textAlign: 'center',
                        }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.88}
                      >
                        {tab.label}
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 3,
                          gap: 5,
                        }}
                      >
                        <Ionicons
                          name={tab.icon}
                          size={16}
                          color={isActive ? tab.color : inactiveInk}
                          style={{ opacity: isActive ? 1 : 0.9 }}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            lineHeight: 14,
                            fontWeight: '900',
                            fontVariant: ['tabular-nums'],
                            letterSpacing: 0.35,
                            color: isActive ? tab.color : C.slate,
                            ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
                          }}
                          numberOfLines={1}
                        >
                          {stageCount > 999 ? '999+' : String(stageCount)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Provider Content Placeholder / List */}
          {providerOsListSorted.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 40 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.status.warning.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
              <Ionicons name="construct" size={40} color={MODE_SEGMENT_COLORS.PROVIDER} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: C.slate, textAlign: 'center', marginBottom: 12, letterSpacing: -0.5 }}>
              {providerTab === 'PENDING' ? 'Nenhuma Ordem Pendente' : providerTab === 'IN_PROGRESS' ? 'Nenhuma Ordem Iniciada' : 'Nenhuma Concluída'}
            </Text>
            <Text style={{ fontSize: 14, color: C.textLight, textAlign: 'center', lineHeight: 22 }}>
              A lista de serviços aparecerá aqui logo que houver despachos do painel central.
            </Text>
          </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={providerOsFlatData}
              keyExtractor={(row) => String(row.id)}
              extraData={`${completedIds.size}-${inprogressIds.size}-${acceptedIds.size}-${providerOsFlatData.length}-${providerTab}-${providerSortMode}-${providerCardVariant}-${providerCardHighContrast ? 1 : 0}`}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={7}
              windowSize={9}
              maxToRenderPerBatch={12}
              removeClippedSubviews={false}
              contentContainerStyle={{
                flexGrow: 1,
                paddingTop: 4,
                paddingBottom: catalogScrollBottomPad,
              }}
              ListHeaderComponent={providerOsSortChipsHeader}
              ListFooterComponent={providerOsCompletedListFooter}
              renderItem={({ item: order, index }) => {
                const listAccent = providerTaskListAccentColor(order, completedIds, inprogressIds, acceptedIds, C);
                const listEff = effectiveProviderTaskStatus(order, completedIds, inprogressIds, acceptedIds);
                const cardVencIso = providerTaskVencimentoIso(order);
                const cardVencMs = cardVencIso ? new Date(cardVencIso).getTime() : NaN;
                const cardVencOverdue = Number.isFinite(cardVencMs) && cardVencMs < Date.now();
                const cardVencLine = t('home.osDueLine', {
                  date: cardVencIso
                    ? new Date(cardVencIso).toLocaleString(i18n.language || 'pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '—',
                });
                const osMapZoneVisual = getLocationZoneTypeVisual(order.locationZoneType);
                const zoneChrome = resolveLocationZoneChrome(order.locationZoneType, C, themeDark);
                /** Mesmo ponto que o mapinha / OSRM (inclui 1.º vértice de rota/trecho) — alinhado a pendentes e em andamento. */
                const providerCardMapDest = providerTaskMapTargetCoords(order);
                const etaChipMinutes = providerTaskEtaMinutes(order);
                const showProviderEtaChip =
                  providerCardShowsFieldMetrics(listEff) &&
                  listEff !== 'PAUSED' &&
                  etaChipMinutes != null;
                const durMinFooter = providerTaskExpectedFormDurationMinutes(order);
                const hasDurFooter = providerCardShowsFieldMetrics(listEff) && durMinFooter != null;
                const showDistFooter =
                  providerCardShowsFieldMetrics(listEff) &&
                  providerCardMapDest &&
                  providerCardDistanceReady(providerMyLocationStatus, providerMyLocation);
                const formBadgeText = providerOsCardFormTemplateBadgeText(order, listEff);
                const cardTone = providerCardPremiumTone(
                  listEff,
                  listAccent,
                  cardVencOverdue,
                  providerCardHighContrast,
                  C,
                );
                const cardStatusChipText =
                  listEff === 'PAUSED'
                    ? t('osSearch.status.PAUSED', { defaultValue: 'Em pausa' })
                    : listEff === 'IN_PROGRESS'
                      ? t('osSearch.status.IN_PROGRESS', { defaultValue: 'Em andamento' })
                      : listEff === 'COMPLETED'
                        ? t('osSearch.status.COMPLETED', { defaultValue: 'Concluída' })
                        : t('osSearch.status.PENDING', { defaultValue: 'Pendente' });
                const hasPendingVoiceNote = providerTaskHasPendingVoiceTranscription(order);
                const cardMetaLabelColor = providerCardHighContrast ? C.slate : C.textSecondary;
                const cardMetaBodyColor = providerCardHighContrast ? C.slate : C.textSecondary;
                const isPremiumCard = providerCardVariant === 'premium';
                return (
                <Animated.View
                  style={[
                    { flexDirection: 'row', alignItems: 'stretch', marginBottom: 12, paddingHorizontal: 16 },
                    providerCardAnimatedStyle(String(order.id), listEff, index),
                  ]}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: isPremiumCard ? PROVIDER_CARD_SURFACE.radius : 16,
                      overflow: 'hidden',
                      shadowColor: '#0f172a',
                      shadowOffset: { width: 0, height: isPremiumCard ? 4 : 3 },
                      shadowOpacity: isPremiumCard
                        ? providerCardHighContrast
                          ? 0.12
                          : 0.08
                        : providerCardHighContrast
                          ? 0.1
                          : 0.06,
                      shadowRadius: isPremiumCard ? (providerCardHighContrast ? 12 : 10) : 8,
                      elevation: isPremiumCard ? (providerCardHighContrast ? 3 : 2) : 2,
                    }}
                  >
                    <View
                      style={{
                        borderRadius: isPremiumCard ? PROVIDER_CARD_SURFACE.radius : 16,
                        borderWidth: 1,
                        borderColor: cardTone.cardBorder,
                        backgroundColor: cardTone.cardBg,
                      }}
                    >
                    <Pressable
                      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                      onPress={() => {
                        setSelectedTask(order);
                        setTaskModalVisible(true);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'stretch',
                        opacity: pressed ? 0.96 : 1,
                        transform: [{ scale: pressed ? (isPremiumCard ? 0.987 : 0.992) : 1 }],
                      })}
                    >
                      <View
                        style={{
                          width: isPremiumCard ? 4 : 5,
                          backgroundColor: cardTone.stripe,
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0, flexDirection: 'column' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <View
                          style={{
                            width: 64,
                            justifyContent: 'flex-start',
                            alignItems: 'center',
                            paddingTop: isPremiumCard ? PROVIDER_CARD_SURFACE.headerPadTop : 12,
                            paddingBottom: 12,
                            paddingLeft: 8,
                          }}
                        >
                          <View
                            style={{
                              width: isPremiumCard ? 52 : 48,
                              height: isPremiumCard ? 52 : 48,
                              borderRadius: 14,
                              backgroundColor: `${cardTone.stripe}24`,
                              borderWidth: 1.5,
                              borderColor: `${cardTone.stripe}70`,
                              justifyContent: 'center',
                              alignItems: 'center',
                              shadowColor: cardTone.stripe,
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.22,
                              shadowRadius: 6,
                              elevation: 3,
                            }}
                          >
                            <TaskMetadataGlyph
                              icon={(order.icon as any) || 'construct-outline'}
                              iconLibrary={order.iconLibrary}
                              size={28}
                              color={listAccent}
                            />
                          </View>
                        </View>

                        <View
                          style={{
                            flex: 1,
                            minWidth: 0,
                            paddingTop: isPremiumCard ? PROVIDER_CARD_SURFACE.headerPadTop : 12,
                            paddingRight: PROVIDER_CARD_SURFACE.headerPadSide,
                            paddingBottom: PROVIDER_CARD_SURFACE.headerPadBottom,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <View
                                  style={{
                                    alignSelf: 'flex-start',
                                    backgroundColor: cardTone.idBg,
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: cardTone.idBorder,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: '900', color: cardTone.idInk, letterSpacing: 0.3 }}>
                                    {taskOsLabel(order)}
                                  </Text>
                                </View>
                                {isPremiumCard ? (
                                  <View
                                    style={{
                                      alignSelf: 'flex-start',
                                      backgroundColor: cardTone.statusBg,
                                      borderColor: cardTone.statusBorder,
                                      borderWidth: 1,
                                      borderRadius: 999,
                                      paddingHorizontal: 9,
                                      paddingVertical: 4,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontWeight: '900',
                                        color: cardTone.statusInk,
                                        letterSpacing: 0.25,
                                      }}
                                    >
                                      {cardStatusChipText}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                              {formBadgeText ? (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    marginTop: 6,
                                    gap: 10,
                                  }}
                                >
                                  <View
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      alignSelf: 'flex-start',
                                      maxWidth: '100%',
                                      paddingVertical: 5,
                                      paddingHorizontal: 11,
                                      borderRadius: 999,
                                      backgroundColor: `${C.primary}F0`,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: '800',
                                        color: C.cardWhite,
                                        letterSpacing: -0.08,
                                        lineHeight: 15,
                                      }}
                                      numberOfLines={2}
                                    >
                                      {formBadgeText}
                                    </Text>
                                  </View>
                                  {listEff === 'PAUSED' ? (
                                    <ProviderPausedDurationBadge task={order} />
                                  ) : providerTab === 'PENDING' && !order.isAccepted ? (
                                    <ProviderAwaitAcceptMinutesChip task={order} C={C} compact />
                                  ) : null}
                                </View>
                              ) : listEff === 'PAUSED' ? (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    marginTop: 6,
                                    justifyContent: 'flex-end',
                                    width: '100%',
                                  }}
                                >
                                  <ProviderPausedDurationBadge task={order} />
                                </View>
                              ) : providerTab === 'PENDING' && !order.isAccepted ? (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    marginTop: 6,
                                    justifyContent: 'flex-end',
                                    width: '100%',
                                  }}
                                >
                                  <ProviderAwaitAcceptMinutesChip task={order} C={C} compact />
                                </View>
                              ) : null}
                              <Text
                                style={{
                                  marginTop: 8,
                                  fontSize: isPremiumCard ? 17 : 15,
                                  color: providerCardHighContrast ? '#020617' : C.slate,
                                  fontWeight: isPremiumCard ? '800' : '700',
                                  lineHeight: isPremiumCard ? 22 : 20,
                                  letterSpacing: isPremiumCard ? -0.2 : -0.1,
                                }}
                                numberOfLines={2}
                              >
                                {order.service}
                              </Text>
                            </View>

                            <View style={{ alignItems: 'center', gap: 9, paddingTop: 3 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {providerTaskShowsRevisionBadge(order) ? (
                                  <Pressable
                                    onPress={() => {
                                      setSelectedTask(order);
                                      setTaskModalVisible(true);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('home.revisionBadge')}
                                    accessibilityHint="Abre o detalhe da OS"
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    style={({ pressed }) => ({
                                      width: 30,
                                      height: 30,
                                      borderRadius: 11,
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      backgroundColor: C.status.info.bg,
                                      borderWidth: 1,
                                      borderColor: C.status.info.border,
                                      opacity: pressed ? 0.82 : 1,
                                    })}
                                  >
                                    <Ionicons name="layers-outline" size={16} color={C.status.info.fg} />
                                  </Pressable>
                                ) : null}
                                <View
                                  style={{
                                  width: 30,
                                  height: 30,
                                    borderRadius: 11,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    backgroundColor: order.isPendingSync ? C.status.warning.bg : C.status.success.bg,
                                    borderWidth: 1,
                                    borderColor: order.isPendingSync ? C.status.warning.border : C.status.success.border,
                                  }}
                                >
                                  <Ionicons
                                    name={order.isPendingSync ? 'cloud-offline' : 'cloud-done'}
                                    size={16}
                                    color={order.isPendingSync ? C.status.warning.fg : C.status.success.fg}
                                  />
                                </View>
                                {hasPendingVoiceNote ? (
                                  <View
                                    style={{
                                      width: 30,
                                      height: 30,
                                      borderRadius: 11,
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      backgroundColor: C.status.warning.bg,
                                      borderWidth: 1,
                                      borderColor: C.status.warning.border,
                                    }}
                                  >
                                    <Ionicons name="mic-outline" size={16} color={C.status.warning.fg} />
                                  </View>
                                ) : null}
                              </View>
                              <Pressable
                                onPress={() => runProviderOsMapMiniPress(order, setProviderOsMiniMapTask)}
                                accessibilityRole="button"
                                accessibilityLabel={`${osMapZoneVisual.label}. Ver local no mapa`}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={({ pressed }) => ({
                                  width: isPremiumCard ? 46 : 44,
                                  height: isPremiumCard ? 46 : 44,
                                  borderRadius: isPremiumCard ? 23 : 22,
                                  backgroundColor: zoneChrome.backgroundColor,
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  borderWidth: 1,
                                  borderColor: zoneChrome.borderColor,
                                  opacity: pressed ? 0.88 : 1,
                                })}
                              >
                                <Ionicons
                                  name={osMapZoneVisual.icon}
                                  size={isPremiumCard ? 21 : 20}
                                  color={zoneChrome.iconColor}
                                />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: PROVIDER_CARD_SURFACE.sectionPadSide,
                          paddingTop: 12,
                          paddingBottom: PROVIDER_CARD_SURFACE.sectionPadBottom,
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: C.divider,
                          flexGrow: 0,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            marginBottom: 12,
                            paddingBottom: 12,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: C.divider,
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                            <Ionicons
                              name="phone-portrait-outline"
                              size={16}
                              color={cardMetaLabelColor}
                              style={{ marginTop: 1 }}
                            />
                            <Text
                              style={{
                                flex: 1,
                                fontSize: 12,
                                color: cardMetaBodyColor,
                                fontWeight: '900',
                                lineHeight: 16,
                                letterSpacing: -0.12,
                              }}
                              numberOfLines={3}
                            >
                              {t('home.osReceivedAtLine', {
                                date: formatProviderTaskLocaleDateTime(
                                  providerTaskDeviceReceivedAtIso(order),
                                  i18n.language,
                                ),
                              })}
                            </Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                            <Ionicons
                              name="calendar-outline"
                              size={16}
                              color={cardVencIso ? (cardVencOverdue ? C.destructive : cardMetaBodyColor) : cardMetaLabelColor}
                              style={{ marginTop: 1 }}
                            />
                            <Text
                              style={{
                                flex: 1,
                                fontSize: 12,
                                color: cardVencIso ? (cardVencOverdue ? C.destructive : cardMetaBodyColor) : cardMetaLabelColor,
                                fontWeight: '900',
                                lineHeight: 16,
                                letterSpacing: -0.12,
                              }}
                              numberOfLines={3}
                            >
                              {cardVencLine}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 12, columnGap: 6 }}>
                          <ProviderOsCardFooterMetric
                            C={C}
                            icon="hourglass-outline"
                            iconColor={C.accent}
                            label={t('home.osMetaDuration')}
                            line1={hasDurFooter ? `${durMinFooter} min` : '—'}
                            line1Color={C.accent}
                          />
                          <View style={{ flex: 1, minWidth: 64, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                            <View style={{ position: 'relative', marginTop: 2 }}>
                              <Ionicons
                                name="location-outline"
                                size={18}
                                color={showDistFooter ? C.status.success.fg : C.textLight}
                              />
                              {showDistFooter && providerMyLocation ? (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={11}
                                  color={C.status.success.fg}
                                  style={{ position: 'absolute', right: -4, bottom: -2 }}
                                />
                              ) : null}
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '900',
                                  color: C.textSecondary,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.5,
                                }}
                                numberOfLines={1}
                              >
                                {t('home.osMetaDistance')}
                              </Text>
                              {showDistFooter &&
                              (providerMyLocationStatus === 'loading' || providerMyLocationStatus === 'idle') ? (
                                <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                                  <ActivityIndicator size="small" color={C.textSecondary} />
                                </View>
                              ) : showDistFooter && providerMyLocation ? (
                                <Text
                                  style={[providerOsCardFooterValueTextBase, { color: C.slate }]}
                                  numberOfLines={1}
                                >
                                  {formatHaversineForUi(
                                    haversineMeters(providerMyLocation, providerCardMapDest),
                                  )}
                                </Text>
                              ) : (
                                <Text style={[providerOsCardFooterValueTextBase, { color: C.textSecondary }]}>
                                  —
                                </Text>
                              )}
                            </View>
                          </View>
                          <ProviderOsCardFooterMetric
                            C={C}
                            icon="navigate-outline"
                            iconColor={C.status.success.fg}
                            label={t('home.osMetaEta')}
                            line1={showProviderEtaChip ? `${etaChipMinutes} min` : '—'}
                            line1Color={C.status.success.fg}
                          />
                        </View>
                      </View>
                      </View>
                    </Pressable>
                  </View>
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
                       <View style={{ flex: 1, width: 2, backgroundColor: index === providerOsFlatData.length - 1 ? 'transparent' : (providerSortMode === 'OSRM_SLA_ROUTE' ? C.destructive : MODE_SEGMENT_COLORS.PROVIDER), opacity: 0.3 }} />
                    </View>
                )}
                </Animated.View>
              );
              }}
            />
          )}
        </View>
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

      {/* ─── Prestador: menu toque longo (Recentes / Antigas) ─── */}
      <Modal
        visible={providerAltSortAnchor != null}
        transparent
        animationType="slide"
        onRequestClose={() => setProviderAltSortAnchor(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setProviderAltSortAnchor(null)} />
          <View
            style={[
              styles.sortSheet,
              {
                backgroundColor: C.cardWhite,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                maxHeight: Dimensions.get('window').height * 0.78,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: C.primary, marginBottom: 14 }]}>{t('home.providerSort.altSheetTitle')}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {(providerAltSortAnchor ? providerLongPressRowsForAnchor(providerAltSortAnchor) : []).map((row) => {
                const selected = providerAltSortPicked === row.mode;
                const labelI18nKey = providerSortSheetLabelI18nKey(row.i18nKey, providerTab);
                return (
                  <TouchableOpacity
                    key={row.mode}
                    onPress={() => setProviderAltSortPicked(row.mode)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 4,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: C.divider,
                    }}
                  >
                    <Ionicons
                      name={row.icon as any}
                      size={22}
                      color={selected ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight}
                    />
                    <Text style={{ flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '800', color: C.slate }}>
                      {t(`home.providerSort.${labelI18nKey}`)}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={24} color={MODE_SEGMENT_COLORS.PROVIDER} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', marginTop: 14 }}>
              <TouchableOpacity
                onPress={() => {
                  setProviderSortMode(providerAltSortPicked as ProviderListSortMode);
                  setProviderAltSortAnchor(null);
                }}
                style={{
                  flex: 1,
                  marginRight: 10,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: C.divider,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: C.slate }}>{t('home.providerSort.actionView')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  const anchor = providerAltSortAnchor;
                  if (!anchor) return;
                  setProviderSortMode(providerAltSortPicked as ProviderListSortMode);
                  try {
                    const raw = await AsyncStorage.getItem(OS_ALT_SORT_STORAGE_KEY);
                    let o: Record<string, string> = {};
                    try {
                      o = raw ? JSON.parse(raw) : {};
                    } catch {
                      o = {};
                    }
                    if (anchor === 'NEWEST') {
                      o.recent = providerAltSortPicked;
                      setSavedAltSortRecent(providerAltSortPicked);
                    } else {
                      o.old = providerAltSortPicked;
                      setSavedAltSortOld(providerAltSortPicked);
                    }
                    await AsyncStorage.setItem(OS_ALT_SORT_STORAGE_KEY, JSON.stringify(o));
                  } catch {
                    /* ignore */
                  }
                  setProviderAltSortAnchor(null);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: MODE_SEGMENT_COLORS.PROVIDER,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFFFFF' }}>{t('home.providerSort.actionSave')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Prestador: Roteirizador (Rota / Rota + prazo) ─── */}
      <Modal
        visible={providerRouteSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProviderRouteSheetOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setProviderRouteSheetOpen(false)} />
          <View
            style={[
              styles.sortSheet,
              {
                backgroundColor: C.cardWhite,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: C.primary, marginBottom: 8 }]}>{t('home.providerSort.routerSheetTitle')}</Text>
            <Text
              style={{
                fontSize: 13,
                color: C.textLight,
                textAlign: 'center',
                marginBottom: 14,
                lineHeight: 18,
                paddingHorizontal: 6,
              }}
            >
              {t('home.providerSort.routerSheetSubtitle')}
            </Text>
            {(
              [
                { mode: 'OSRM_ROUTE' as const, i18nKey: 'route' as const, icon: 'navigate-outline' as const },
                { mode: 'OSRM_SLA_ROUTE' as const, i18nKey: 'routeSla' as const, icon: 'git-merge-outline' as const },
              ] as const
            ).map((row) => {
              const routeLocked = providerTab !== 'PENDING';
              const routeCalcBusy =
                isOptimizingRoute &&
                (osrmOptimizingMode === 'OSRM_ROUTE' || osrmOptimizingMode === 'OSRM_SLA_ROUTE');
              const selected = providerSortMode === row.mode;
              const rowLoading = osrmOptimizingMode === row.mode;
              const disabled = routeLocked || routeCalcBusy;
              return (
                <TouchableOpacity
                  key={row.mode}
                  disabled={disabled}
                  onPress={() => {
                    if (providerSortMode !== row.mode) {
                      onSortRoutePress(row.mode as 'OSRM_ROUTE' | 'OSRM_SLA_ROUTE');
                    }
                    setProviderRouteSheetOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 4,
                    opacity: disabled ? 0.45 : 1,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: C.divider,
                  }}
                >
                  {rowLoading ? (
                    <ActivityIndicator size="small" color={MODE_SEGMENT_COLORS.PROVIDER} style={{ width: 22 }} />
                  ) : (
                    <Ionicons
                      name={row.icon as any}
                      size={22}
                      color={selected ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight}
                    />
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: C.slate }}>{t(`home.providerSort.${row.i18nKey}`)}</Text>
                    {routeLocked ? (
                      <Text style={{ fontSize: 11, color: C.textLight, marginTop: 3 }}>
                        {t('home.providerSort.routeOnlyPending')}
                      </Text>
                    ) : null}
                  </View>
                  {selected && !rowLoading ? (
                    <Ionicons name="checkmark-circle" size={24} color={MODE_SEGMENT_COLORS.PROVIDER} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => setProviderRouteSheetOpen(false)}
              style={{
                marginTop: 12,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: C.divider,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.slate }}>{t('home.providerSort.sheetClose')}</Text>
            </TouchableOpacity>
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
                paddingHorizontal: 16,
                paddingBottom: 0,
                paddingTop: 6,
                height: Dimensions.get('window').height * 0.52,
                maxHeight: Dimensions.get('window').height * 0.52,
                flexDirection: 'column',
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            {selectedTask && (
              <>
                <ScrollView
                  style={{ flex: 1, marginTop: 4, minHeight: 0 }}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                >
                  <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    {providerTaskShowsAwaitAcceptCounter(selectedTask) ? (
                      <ProviderAwaitAcceptMinutesChip task={selectedTask} C={C} compact={false} />
                    ) : selectedTask.icon ? (
                      <View
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 16,
                          backgroundColor: C.warning.background,
                          borderWidth: 2,
                          borderColor: C.status.warning.border,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginBottom: 10,
                          shadowColor: C.accent,
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.16,
                          shadowRadius: 8,
                          elevation: 4,
                        }}
                      >
                        {selectedTask.icon.startsWith('http') ? (
                          <Image source={{ uri: selectedTask.icon }} style={{ width: 26, height: 26 }} resizeMode="contain" />
                        ) : (
                          <TaskMetadataGlyph
                            icon={selectedTask.icon as any}
                            iconLibrary={selectedTask.iconLibrary}
                            size={26}
                            color={C.accent}
                          />
                        )}
                      </View>
                    ) : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        marginBottom: 4,
                        flexWrap: 'wrap',
                        paddingHorizontal: 6,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: `${(selectedTask as { color?: string }).color || MEDIA_TAG_COLORS.OTHER}26`,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: `${(selectedTask as { color?: string }).color || MEDIA_TAG_COLORS.OTHER}4D`,
                          maxWidth: '100%',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '900',
                            color: C.slate,
                            letterSpacing: 0.35,
                            textAlign: 'center',
                          }}
                        >
                          {taskOsLabel(selectedTask)}
                        </Text>
                      </View>
                      <LocationZoneTypeBadge
                        zoneType={(selectedTask as { locationZoneType?: string | null }).locationZoneType}
                        containerSize={22}
                        iconSize={13}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '900',
                        color: C.slate,
                        textAlign: 'center',
                        lineHeight: 21,
                        marginBottom: providerTaskModalFormTitle(selectedTask) ? 8 : 12,
                      }}
                    >
                      {selectedTask.service}
                    </Text>
                    {providerTaskModalFormTitle(selectedTask) ? (
                      <View
                        style={{
                          alignSelf: 'center',
                          maxWidth: '92%',
                          marginBottom: 12,
                          paddingVertical: 4,
                          paddingHorizontal: 11,
                          borderRadius: 999,
                          backgroundColor: C.primary,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: C.cardWhite,
                            textAlign: 'center',
                            letterSpacing: -0.06,
                            lineHeight: 14,
                          }}
                          numberOfLines={3}
                        >
                          {providerTaskModalFormTitle(selectedTask)}
                        </Text>
                      </View>
                    ) : null}
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
                    paddingTop: 8,
                    paddingBottom: Math.max(insets.bottom, 10),
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: C.border,
                    backgroundColor: C.cardWhite,
                  }}
                >
                  {(selectedTask.status === 'PENDING' || selectedTask.status === 'RECEIVED') && !selectedTask.isAccepted && (
                    <>
                      {rejectingTaskId === selectedTask.id ? (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setRejectingTaskId(null);
                              setRejectReason('');
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: C.cardWhite,
                              paddingVertical: 11,
                              borderRadius: 11,
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: C.status.danger.border,
                            }}
                          >
                            <Text style={{ color: C.status.danger.fg, fontWeight: '800', fontSize: 13 }}>Voltar</Text>
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
                              paddingVertical: 11,
                              borderRadius: 11,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: C.cardWhite, fontWeight: '800', fontSize: 13 }}>Confirmar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setRejectingTaskId(selectedTask.id);
                              setRejectReason('');
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: C.status.danger.bg,
                              paddingVertical: 12,
                              borderRadius: 12,
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor: C.status.danger.border,
                            }}
                          >
                            <Text style={{ color: C.destructive, fontWeight: '800', fontSize: 13 }}>Rejeitar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              if (!selectedTask.refId) {
                                Alert.alert('Erro', 'Formulário ausente na OS.');
                                return;
                              }

                              await appendUniqueStringToStoredArray('@brspark_accepted_tasks', String(selectedTask.id));
                              try {
                                const acceptedTs = new Date().toISOString();
                                await enqueueExecutionStatusPatch(String(selectedTask.id), {
                                  status: 'ACCEPTED',
                                  timestamp: acceptedTs,
                                  metadata: { acceptedAt: acceptedTs },
                                });
                                await patchCloudTaskById(String(selectedTask.id), (row) => ({
                                  ...row,
                                  status: 'ACCEPTED',
                                  metadata: { ...(row.metadata || {}), acceptedAt: acceptedTs },
                                }));
                              } catch {
                                /* ignore */
                              }

                              setSelectedTask((prev: any) => ({ ...prev, isAccepted: true }));
                              loadData(false);

                              Alert.alert('OS Aceita!', 'Excelente! Deseja iniciar a execução da atividade agora mesmo?', [
                                { text: 'Agora Não', style: 'cancel', onPress: () => setTaskModalVisible(false) },
                                {
                                  text: 'Sim, Iniciar Agora',
                                  style: 'default',
                                  onPress: async () => {
                                    await appendUniqueStringToStoredArray(
                                      '@brspark_inprogress_tasks',
                                      String(selectedTask.id)
                                    );
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
                              paddingVertical: 12,
                              borderRadius: 12,
                              alignItems: 'center',
                              shadowColor: C.success.text,
                              shadowOffset: { width: 0, height: 3 },
                              shadowOpacity: 0.22,
                              shadowRadius: 6,
                              elevation: 3,
                            }}
                          >
                            <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 13 }}>Aceitar Ordem</Text>
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
                        await appendUniqueStringToStoredArray(
                          '@brspark_inprogress_tasks',
                          String(selectedTask.id)
                        );
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
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: 'center',
                        shadowColor: MEDIA_TAG_COLORS.DURING,
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.22,
                        shadowRadius: 6,
                        elevation: 3,
                      }}
                    >
                      <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 13 }}>Iniciar Ordem (Em Campo)</Text>
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
                            paddingVertical: 12,
                            borderRadius: 12,
                            alignItems: 'center',
                            shadowColor: C.destructive,
                            shadowOffset: { width: 0, height: 3 },
                            shadowOpacity: 0.22,
                            shadowRadius: 6,
                            elevation: 3,
                          }}
                        >
                          <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 13 }}>{t('pause.unpauseBtn')}</Text>
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
                            paddingVertical: 12,
                            borderRadius: 12,
                            alignItems: 'center',
                            shadowColor: MEDIA_TAG_COLORS.BEFORE,
                            shadowOffset: { width: 0, height: 3 },
                            shadowOpacity: 0.22,
                            shadowRadius: 6,
                            elevation: 3,
                          }}
                        >
                          <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 13 }}>Iniciar / Retomar</Text>
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
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: 'center',
                        shadowColor: MEDIA_TAG_COLORS.AFTER,
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.22,
                        shadowRadius: 6,
                        elevation: 3,
                      }}
                    >
                      <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 13 }}>Visualizar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Mapa compacto — local de atendimento (abre a partir do ícone de mapa no card) */}
      <Modal
        visible={providerOsMiniMapTask != null}
        transparent
        animationType="fade"
        onRequestClose={() => setProviderOsMiniMapTask(null)}
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 22 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            activeOpacity={1}
            onPress={() => setProviderOsMiniMapTask(null)}
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.48)' }]}
          />
          {providerOsMiniMapTask ? (
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: C.cardWhite,
                borderWidth: 1,
                borderColor: C.border,
                shadowColor: '#000',
                shadowOpacity: 0.22,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 10,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: C.divider,
                }}
              >
                <View style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.slate }} numberOfLines={2}>
                    {providerOsMiniMapHeaderName}
                  </Text>
                  {providerOsMiniMapHeaderAddress ? (
                    <Text
                      style={{ fontSize: 13, color: C.textSecondary, marginTop: 4, lineHeight: 18, fontWeight: '500' }}
                      numberOfLines={4}
                    >
                      {providerOsMiniMapHeaderAddress}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => setProviderOsMiniMapTask(null)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar"
                >
                  <Ionicons name="close" size={26} color={C.textLight} />
                </TouchableOpacity>
              </View>
              {providerTaskMapTargetCoords(providerOsMiniMapTask) ? (
                <MapView
                  style={{
                    width: '100%',
                    height: Math.min(288, Math.round(Dimensions.get('window').height * 0.38)),
                  }}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={providerTaskMiniMapInitialRegion(providerOsMiniMapTask)}
                  scrollEnabled
                  zoomEnabled
                  rotateEnabled={false}
                  pitchEnabled={false}
                  showsUserLocation
                >
                  {(() => {
                    const mini = providerOsMiniMapTask;
                    const polyCoords = providerTaskMiniMapPolygonCoords(mini);
                    const lineCoords = providerTaskMiniMapPolylineCoords(mini);
                    const pin = providerTaskMapTargetCoords(mini)!;
                    const pinTitle = (
                      providerTaskServiceLocationName(mini) ||
                      String(mini?.service || 'OS').trim() ||
                      'OS'
                    ).slice(0, 80);
                    const pinDesc = providerTaskServiceAddressTextOnly(mini).slice(0, 200);
                    return (
                      <>
                        {polyCoords ? (
                          <Polygon
                            coordinates={polyCoords}
                            strokeColor={MEDIA_TAG_COLORS.BEFORE}
                            fillColor={`${MEDIA_TAG_COLORS.BEFORE}40`}
                            strokeWidth={2}
                          />
                        ) : null}
                        {lineCoords ? (
                          <Polyline
                            coordinates={lineCoords}
                            strokeColor={MEDIA_TAG_COLORS.BEFORE}
                            strokeWidth={4}
                            lineCap="round"
                            lineJoin="round"
                          />
                        ) : null}
                        <Marker
                          coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                          tracksViewChanges={false}
                          title={pinTitle}
                          description={pinDesc || undefined}
                        />
                      </>
                    );
                  })()}
                </MapView>
              ) : (
                <View style={{ paddingHorizontal: 16, paddingVertical: 18 }}>
                  <Text style={{ fontSize: 13, color: C.textLight, lineHeight: 20 }}>
                    Não há coordenadas disponíveis para mostrar no mapa.
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
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
  premiumHeaderEyebrow: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.86)', textTransform: 'uppercase', letterSpacing: 0.65, marginBottom: 2 },
  premiumHeaderText: { fontSize: 15, fontWeight: '900', color: C.cardWhite, letterSpacing: -0.4 },
  premiumHeaderSub: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.86)', marginTop: 4 },
  
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
