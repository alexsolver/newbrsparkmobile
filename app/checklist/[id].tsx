import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  AppState,
  Platform,
  type AppStateStatus,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { createVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Network from 'expo-network';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanResponder } from 'react-native';
import { type ColorPalette, MEDIA_TAG_COLORS } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons, AntDesign, Entypo, Feather, FontAwesome, FontAwesome5, Foundation, MaterialIcons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { apiFetch, getToken, handleUnauthorizedMaybeSessionInvalidated } from '../../src/services/auth';
import { fetchDrivingLegEtaMinutes, fetchDrivingLegMetrics } from '../../src/services/osrmClient';
import { fetchGoogleDrivingLegMetricsOrNull } from '../../src/services/googleMapsRoutesClient';
import {
  TRANSIT_ETA_GOOGLE_REFRESH_MS,
  TRANSIT_ETA_GOOGLE_MAX_CALLS_PER_TRIP,
  TRANSIT_ETA_TICK_MS,
  computeTickingEtaMinutes,
} from '../../src/services/transitEtaPolicy';
import { haversineMeters, polylineLengthMeters } from '../../src/utils/polylineMetrics';
import { LinearGradient } from 'expo-linear-gradient';
import GeofenceStatusBar from './GeofenceStatusBar';
import GeofenceMapScreen from './GeofenceMapScreen';
import GeofenceCheckFieldMap from './GeofenceCheckFieldMap';
import GlobalGeofenceConsultMap from './GlobalGeofenceConsultMap';
import { resolveGlobalFenceDestinationCoords, taskHasGeometryForGlobalGate } from './globalGeofenceCombined';
import SegmentDestinationPickerModal from './SegmentDestinationPickerModal';
import RouteProgressBar from './RouteProgressBar';
import LiveRouteMapCard, { pickDestinationForOsrm } from './LiveRouteMapCard';
import { TransitCompletedSummaryMap, transitActualMetricsLabels } from './TransitCompletedSummaryMap';
import { routeTracker } from '../../src/services/routeTrackingService';
import { computePatrolCompliance } from '../../src/services/patrolRouteMetrics';
import { dataCollectionService } from '../../src/services/dataCollectionService';
import { FieldHelpInstructions, isFieldInstructionsVisible } from '../../src/components/FieldHelpInstructions';
import { LeituraBlock } from '../../src/components/LeituraBlock';
import { ValueInput } from '../../src/components/ValueInput';
import { ChecklistImageAnnotationField } from '../../src/components/ChecklistImageAnnotationField';
import {
  ChecklistLookupSelectField,
  ChecklistOpinionScaleField,
  ChecklistRepeatableMatrixField,
} from '../../src/components/ChecklistExtendedFieldWidgets';
import { ChecklistVisionGridComposeRunner } from '../../src/components/ChecklistVisionGridComposeRunner';
import {
  ChecklistVoiceNoteField,
  parseVoiceNoteValue,
  voiceNoteHasPendingTranscription,
  voiceNoteValueIsFilled,
} from '../../src/components/ChecklistVoiceNoteField';
import {
  ChecklistLocationPickField,
  isLocationPickAnswerValid,
  summarizeLocationPickValue,
} from '../../src/components/ChecklistLocationPickField';
import { checkAttachmentMeta } from '../../src/utils/safeAttachment';
import { taskOsLabel } from '../../src/utils/taskOsLabel';
import { fetchExecutionOpsChat, getOpsChatAckStorageKey } from '../../src/services/executionOpsChat';
import { PAUSE_CATEGORIES, PAUSE_DETAIL_MIN_LEN, type PauseCategoryDef } from '../../src/checklist/pauseCatalog';
import { applyChecklistTextMask, uiValueForChecklistMask } from '../../src/checklist/applyTextMask';
import {
  enqueueExecutionStatusPatch,
  pushSyncQueue,
  COMPLETED_BODY_LOCAL_TTL_MS,
  checklistOutboxIdentityKey,
  clearExecutionStatusOutboxForTask,
} from '../../src/services/syncService';
import { metadataIndicatesAdminRevisionCycle } from '../../src/services/syncPolicy';
import {
  appendUniqueStringToStoredArray,
  updateStoredJsonArray,
  withAsyncStorageKeyLock,
} from '../../src/lib/asyncStorageAtomic';
import {
  findCloudTaskById,
  loadAllCloudTasksForExecutionLookup,
  savePartitionedFromUnifiedList,
  patchCloudTaskById,
} from '../../src/lib/cloudTasksBuckets';
import { applyMaterialsStockForSubmission, parseMaterialsValue } from '../../src/checklist/applyMaterialsStockOnSubmit';
import { applyMaterialsReceiptForSubmission } from '../../src/checklist/applyMaterialsReceiptOnSubmit';
import {
  materialsReceiptFieldIsComplete,
  parseMaterialsReceiptValue,
} from '../../src/checklist/materialsReceiptValue';
import {
  applyTechnicianFinanceForSubmission,
  parseTechnicianFinanceValue,
} from '../../src/checklist/applyTechnicianFinanceOnSubmit';
import {
  parseTechnicianRevenueIntegrationValue,
  technicianRevenueFieldIsComplete,
} from '../../src/checklist/technicianRevenueIntegrationValue';
import { ChecklistMaterialsConsumptionField } from '../../src/components/ChecklistMaterialsConsumptionField';
import { ChecklistMaterialsReceiptField } from '../../src/components/ChecklistMaterialsReceiptField';
import { ChecklistTechnicianFinanceField } from '../../src/components/ChecklistTechnicianFinanceField';
import { ChecklistTechnicianRevenueField } from '../../src/components/ChecklistTechnicianRevenueField';
import { useAuth } from '../../src/hooks/useAuth';
import { evaluateBusinessCondition } from '../../src/lib/businessRuleCondition';
import { effectiveSchemaFieldType } from '../../src/services/checklistTemplateSchema';
import {
  formatCalculatedResultDisplay,
  resolveCalcDisplayMode,
} from '../../src/checklist/calculatedFieldFormat';

/** Ícone + cor por categoria no picker de pausa (alinhado ao checklist laranja + hierarquia visual). */
const PAUSE_PICKER_CAT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  personal: 'person-outline',
  operational: 'construct-outline',
  logistics: 'car-outline',
  client_site: 'business-outline',
  equipment: 'hammer-outline',
  safety: 'shield-checkmark-outline',
  communication: 'chatbubbles-outline',
  admin: 'document-text-outline',
  other: 'ellipsis-horizontal-circle-outline',
};
const PAUSE_PICKER_CAT_COLOR: Record<string, string> = {
  personal: '#7C3AED',
  logistics: '#0369A1',
  client_site: '#059669',
  equipment: '#475569',
  safety: '#DC2626',
  communication: '#4F46E5',
  admin: '#CA8A04',
  other: '#64748B',
};

/** Extrai valor de objecto JSON por caminho com pontos (ex.: current.temp_c); suporta índices numéricos em arrays. */
function brsparkJsonPathLookup(obj: unknown, path: string): unknown {
  if (!path || typeof path !== 'string') return undefined;
  const parts = path
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (/^\d+$/.test(p) && Array.isArray(cur)) {
      cur = cur[parseInt(p, 10)];
    } else if (typeof cur === 'object' && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur;
}

function formatDurationClock(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Trilha GPS no JSON (app / API): `[[lat,lng],…]`, `[{lat,lng},…]` ou string JSON —
 * alinhado ao relatório (`normalizeTraversedPathForReport`).
 */
function normalizeStoredTraversedPathForTransit(raw: unknown): number[][] | null {
  if (raw == null) return null;
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  const out: number[][] = [];
  for (const c of arr) {
    if (Array.isArray(c) && c.length >= 2) {
      const la = typeof c[0] === 'number' ? c[0] : parseFloat(String(c[0]));
      const ln = typeof c[1] === 'number' ? c[1] : parseFloat(String(c[1]));
      if (Number.isFinite(la) && Number.isFinite(ln)) out.push([la, ln]);
    } else if (c && typeof c === 'object' && !Array.isArray(c)) {
      const o = c as Record<string, unknown>;
      const la = Number(o.lat ?? o.latitude);
      const ln = Number(o.lng ?? o.lon ?? o.longitude);
      if (Number.isFinite(la) && Number.isFinite(ln)) out.push([la, ln]);
    }
  }
  return out.length ? out : null;
}

/** Valor já guardado como evidência de deslocamento (não vazio). */
function isTransitEvidenceNonempty(raw: unknown): boolean {
  const ev = parseTransitFieldEvidence(raw);
  if (!ev) return false;
  return !!(ev.timestamp || (ev.lat != null && ev.lng != null));
}

function looksLikeTransitDisplacementJson(raw: unknown): boolean {
  const o = coerceTransitEvidenceObject(raw);
  if (!o) return false;
  const act = String(o.action || '').toUpperCase();
  return act === 'SAIDA' || act === 'CHEGADA';
}

/** Preferência na fusão rascunho/servidor: rascunho com evidência vence; senão mantém servidor. */
function transitRawPreferNonempty(draftVal: unknown, serverVal: unknown): unknown {
  if (isTransitEvidenceNonempty(draftVal)) return draftVal;
  if (isTransitEvidenceNonempty(serverVal)) return serverVal;
  return draftVal !== undefined ? draftVal : serverVal;
}

/**
 * `{...server,...draft}` apaga deslocamentos já sincronizados se o rascunho local tiver chaves vazias.
 * Preserva início/fim de deslocamento a partir de qualquer lado com evidência válida.
 */
function mergeResponsesDraftOverServerPreserveTransitDisplacement(
  serverR: Record<string, unknown>,
  draftRes: Record<string, unknown>
): Record<string, any> {
  const base = { ...serverR, ...draftRes } as Record<string, any>;
  const allRoot = new Set([...Object.keys(serverR), ...Object.keys(draftRes)]);
  for (const k of allRoot) {
    if (k.startsWith('__section_repeat_')) {
      const sr = serverR[k];
      const dr = draftRes[k];
      if (!Array.isArray(sr) && !Array.isArray(dr)) continue;
      const rowsS = Array.isArray(sr) ? sr : [];
      const rowsD = Array.isArray(dr) ? dr : [];
      const prevMerged = Array.isArray(base[k]) ? (base[k] as unknown[]) : [];
      const maxLen = Math.max(rowsS.length, rowsD.length, prevMerged.length);
      const out: unknown[] = [];
      for (let i = 0; i < maxLen; i++) {
        const rowS =
          rowsS[i] && typeof rowsS[i] === 'object' && !Array.isArray(rowsS[i])
            ? (rowsS[i] as Record<string, unknown>)
            : {};
        const rowD =
          rowsD[i] && typeof rowsD[i] === 'object' && !Array.isArray(rowsD[i])
            ? (rowsD[i] as Record<string, unknown>)
            : {};
        const rowB =
          prevMerged[i] && typeof prevMerged[i] === 'object' && !Array.isArray(prevMerged[i])
            ? { ...(prevMerged[i] as Record<string, unknown>) }
            : { ...rowS, ...rowD };
        const cellKeys = new Set([...Object.keys(rowS), ...Object.keys(rowD), ...Object.keys(rowB)]);
        for (const cid of cellKeys) {
          if (
            looksLikeTransitDisplacementJson(rowS[cid]) ||
            looksLikeTransitDisplacementJson(rowD[cid]) ||
            looksLikeTransitDisplacementJson(rowB[cid])
          ) {
            (rowB as any)[cid] = transitRawPreferNonempty(rowD[cid], rowS[cid]);
          }
        }
        out.push(rowB);
      }
      base[k] = out;
      continue;
    }
    if (looksLikeTransitDisplacementJson(serverR[k]) || looksLikeTransitDisplacementJson(draftRes[k])) {
      base[k] = transitRawPreferNonempty(draftRes[k], serverR[k]);
    }
  }
  /** Servidor pode manter `__form_paused_since` após retoma só com metadata; o rascunho já não traz a chave — não reintroduzir pausa «fantasma». */
  try {
    const hist = base[PAUSE_HISTORY_KEY];
    let arr: unknown = hist;
    if (typeof arr === 'string') {
      try {
        arr = JSON.parse(arr);
      } catch {
        arr = null;
      }
    }
    let hasOpenPause = false;
    if (Array.isArray(arr)) {
      for (const ev of arr) {
        const o = ev as { endedAt?: unknown; startedAt?: unknown } | null;
        if (o && (o.endedAt == null || o.endedAt === '') && o.startedAt) {
          hasOpenPause = true;
          break;
        }
      }
    }
    if (!hasOpenPause && base.__form_paused_since != null && String(base.__form_paused_since).trim() !== '') {
      delete base.__form_paused_since;
    }
  } catch {
    /* ignore */
  }
  return base;
}

/** Desembrulha JSON em string até objecto (cache/API por vezes dupla codificação). */
function coerceTransitEvidenceObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  let cur: unknown = raw;
  for (let d = 0; d < 5; d++) {
    if (typeof cur === 'string') {
      const t = cur.trim();
      if (!t) return null;
      try {
        cur = JSON.parse(t);
      } catch {
        return null;
      }
      continue;
    }
    break;
  }
  if (cur && typeof cur === 'object' && !Array.isArray(cur)) return cur as Record<string, unknown>;
  return null;
}

/**
 * Garante ≥2 pontos para pré-visualização (SVG): remove duplicados consecutivos;
 * se início e fim forem o mesmo GPS (caso comum), desloca o 2.º ponto uns metros para o traço aparecer.
 */
function finalizeTransitPreviewPolyline(path: number[][] | null | undefined): number[][] | null {
  if (!path || path.length === 0) return null;
  const dedupeConsecutive = (pts: number[][]) => {
    const o: number[][] = [];
    for (const p of pts) {
      const q = o[o.length - 1];
      if (!q || q[0] !== p[0] || q[1] !== p[1]) o.push(p);
    }
    return o;
  };
  const d = dedupeConsecutive(path);
  if (d.length >= 2) return d;
  if (path.length >= 2) {
    const a = path[0];
    const b = path[path.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) {
      return [
        [a[0], a[1]],
        [a[0] + 0.00025, a[1] + 0.00025],
      ];
    }
    return dedupeConsecutive([a, b]);
  }
  if (d.length === 1) {
    const a = d[0];
    return [
      [a[0], a[1]],
      [a[0] + 0.00025, a[1] + 0.00025],
    ];
  }
  return null;
}

/** Evidência guardada em transit_start / transit_end (JSON no mapa de respostas). */
function parseTransitFieldEvidence(raw: unknown): {
  timestamp?: string;
  address?: string;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  /** Trilha GPS gravada no fim do deslocamento (`handleTransit` → `traversedPath`). */
  traversedPath?: number[][];
  plannedMetrics?: {
    durationSeconds?: number | null;
    distanceMeters?: number | null;
    source?: string;
  };
  actualMetrics?: {
    durationSeconds?: number;
    distanceMeters?: number;
    pathPointCount?: number;
  };
} | null {
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  try {
    const o = coerceTransitEvidenceObject(raw);
    if (!o) return null;
    const coords = o.coordinates as Record<string, unknown> | undefined;
    const latRaw =
      coords?.lat ?? coords?.latitude ?? o.lat ?? o.latitude;
    const lngRaw =
      coords?.lng ?? coords?.longitude ?? coords?.lon ?? o.lng ?? o.longitude;
    const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw));
    const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw));
    const accRaw = o.accuracyMeters ?? o.accuracy;
    const accuracyMeters =
      accRaw != null && Number.isFinite(Number(accRaw)) ? Number(accRaw) : undefined;
    const pathNorm =
      normalizeStoredTraversedPathForTransit(o.traversedPath) ??
      normalizeStoredTraversedPathForTransit(o.gpsTrack) ??
      normalizeStoredTraversedPathForTransit(o.track);
    const traversedPath = pathNorm ?? undefined;
    return {
      timestamp: typeof o.timestamp === 'string' ? o.timestamp : undefined,
      address: typeof o.address === 'string' ? o.address : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      accuracyMeters,
      ...(traversedPath ? { traversedPath } : {}),
      plannedMetrics: o.plannedMetrics as
        | { durationSeconds?: number | null; distanceMeters?: number | null; source?: string }
        | undefined,
      actualMetrics: o.actualMetrics as
        | { durationSeconds?: number; distanceMeters?: number; pathPointCount?: number }
        | undefined,
    };
  } catch {
    return null;
  }
}

function formatTransitEvidenceLines(
  ev: NonNullable<ReturnType<typeof parseTransitFieldEvidence>>
): string[] {
  const lines: string[] = [];
  if (ev.timestamp) {
    const d = new Date(ev.timestamp);
    if (Number.isFinite(d.getTime())) {
      lines.push(
        `Data e hora: ${d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}`
      );
    }
  }
  if (ev.address && ev.address.trim()) {
    lines.push(`Local: ${ev.address.trim()}`);
  }
  const hasCoords =
    ev.lat != null &&
    ev.lng != null &&
    !(ev.lat === 0 && ev.lng === 0) &&
    Number.isFinite(ev.lat) &&
    Number.isFinite(ev.lng);
  if (hasCoords) {
    lines.push(`Coordenadas: ${ev.lat!.toFixed(6)}, ${ev.lng!.toFixed(6)}`);
  } else if (lines.length > 0) {
    lines.push('Coordenadas: não disponíveis (GPS indisponível ou sem permissão).');
  }
  if (ev.accuracyMeters != null && ev.accuracyMeters > 0 && Number.isFinite(ev.accuracyMeters)) {
    lines.push(`Precisão estimada: ±${Math.round(ev.accuracyMeters)} m`);
  }
  const pm = ev.plannedMetrics;
  if (pm && (pm.distanceMeters != null || pm.durationSeconds != null)) {
    const parts: string[] = [];
    if (pm.distanceMeters != null && Number.isFinite(pm.distanceMeters)) {
      parts.push(`${(pm.distanceMeters / 1000).toFixed(2)} km`);
    }
    if (pm.durationSeconds != null && Number.isFinite(pm.durationSeconds) && pm.durationSeconds > 0) {
      parts.push(`~${Math.round(pm.durationSeconds / 60)} min (estimativa)`);
    }
    if (parts.length) lines.push(`Rota planejada: ${parts.join(' · ')}`);
  }
  const am = ev.actualMetrics;
  if (am && (am.distanceMeters != null || am.durationSeconds != null)) {
    const parts: string[] = [];
    if (am.durationSeconds != null && Number.isFinite(am.durationSeconds)) {
      const h = Math.floor(am.durationSeconds / 3600);
      const m = Math.floor((am.durationSeconds % 3600) / 60);
      const s = Math.floor(am.durationSeconds % 60);
      parts.push(
        h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${s}s` : `${s}s`
      );
    }
    if (am.distanceMeters != null && Number.isFinite(am.distanceMeters)) {
      parts.push(`${(am.distanceMeters / 1000).toFixed(2)} km`);
    }
    if (parts.length) lines.push(`Trecho real: ${parts.join(' · ')}`);
  }
  return lines;
}

function getSectionTimingKeys(sectionId: string) {
  return {
    /** Marcador de progresso: primeira entrada na etapa (não é cronômetro). */
    start: `__section_start_${sectionId}`,
    /** Marcador de progresso: etapa concluída (botão avançar/finalizar). */
    end: `__section_end_${sectionId}`,
    /** Cronômetro: início do segmento atualmente aberto nesta etapa. */
    activeStart: `__section_active_start_${sectionId}`,
    /** Cronômetro: acumulado de segundos já fechados nesta etapa. */
    activeSeconds: `__section_active_seconds_${sectionId}`,
  };
}

const PAUSE_HISTORY_KEY = '__pause_history';
const REVISION_TIMER_RESET_TOKEN_KEY = '__revision_timer_reset_token';

function metaRevisionVisitContext(m: unknown): boolean {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  const tk = (x: unknown) => x === true || x === 'true' || String(x ?? '').toLowerCase() === 'true';
  if (tk(r.reopenForRevisionPending) || tk(r.revisionVisitActive)) return true;
  const rc = Number(r.reopenCount);
  return Number.isFinite(rc) && rc > 0;
}

function buildRevisionTimerResetToken(taskId: unknown, lastSubmittedRevisionLike: unknown): string {
  const tid = String(taskId ?? '').trim() || 'no_task';
  const last = Number(lastSubmittedRevisionLike);
  const nextRevision = Number.isFinite(last) && last >= 0 ? Math.floor(last) + 1 : 1;
  return `${tid}::rev_${nextRevision}`;
}

/** Estados terminais na API / sync (alinhar com `SERVER_COMPLETED_STATUSES` na tela inicial). */
const EXEC_VIEW_ONLY_STATUSES = new Set([
  'COMPLETED',
  'SYNCED',
  'CANCELLED',
  'CANCELED',
  'DONE',
  'CLOSED',
  'FINISHED',
  'COMPLETE',
  'ARCHIVED',
]);

/**
 * OS já fechada: sempre só leitura. Revisão válida reabre com PENDING/IN_PROGRESS no servidor;
 * `reopenCount` pode permanecer no metadata após conclusão e não deve desbloquear edição.
 */
function executionIsViewOnly(exec: unknown): boolean {
  if (!exec || typeof exec !== 'object') return false;
  const e = exec as Record<string, unknown>;
  const st = String(e.status || '').toUpperCase();
  return EXEC_VIEW_ONLY_STATUSES.has(st);
}

/**
 * GET `/executions/:id` pode ainda devolver IN_PROGRESS/PENDING enquanto o POST de conclusão não
 * sincronizou — alinhado a `effectiveProviderTaskStatus` e `shouldRemoveExecutedCacheForRemoteTask`.
 * Só desbloquear edição com ciclo explícito de revisão no painel (`syncPolicy.metadataIndicatesAdminRevisionCycle`).
 */
function remoteExecAllowsEditAfterLocalCompletion(remoteExec: unknown): boolean {
  return metadataIndicatesAdminRevisionCycle(
    remoteExec && typeof remoteExec === 'object'
      ? (remoteExec as Record<string, unknown>).metadata
      : undefined
  );
}

/** Só anular assinatura e início/fim de deslocamento; manter o resto do preenchimento. */
const REVISION_SESSION_FIELD_TYPES = new Set([
  'signature',
  'signature_summary',
  'transit_start',
  'transit_end',
]);

/** Campos de mídia + prompt estruturado (sim/não) analisados no servidor (YOLO ou Gemini). */
function isVisionSimNaoMediaFieldType(t: string): boolean {
  return t === 'vision_checklist' || t === 'vision_ai_analysis';
}

/** Assinatura e deslocamento: não reaproveitar após reabertura; demais respostas mantêm-se. */
function stripRevisionSessionFieldResponses(res: Record<string, any>, schemaData: any[] | undefined): void {
  if (!res || typeof res !== 'object') return;
  if (!Array.isArray(schemaData)) return;
  const toStrip = new Set<string>();
  for (const f of schemaData) {
    if (!f?.id) continue;
    if (REVISION_SESSION_FIELD_TYPES.has(effectiveSchemaFieldType(f))) toStrip.add(String(f.id));
  }
  for (const fid of toStrip) {
    if (res[fid] != null) delete res[fid];
  }
  for (const k of Object.keys(res)) {
    if (!k.startsWith('__section_repeat_') || !Array.isArray((res as any)[k])) continue;
    for (const row of (res as any)[k] as any[]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      for (const fid of toStrip) {
        if (row[fid] != null) delete row[fid];
      }
    }
  }
  function looksLikeSignatureValue(raw: unknown): boolean {
    if (raw == null) return false;
    return typeof raw === 'string' && raw.trim().startsWith('SIG_V1|');
  }
  for (const k of Object.keys(res)) {
    if (k.startsWith('__section_repeat_') && Array.isArray((res as any)[k])) {
      for (const row of (res as any)[k] as any[]) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        for (const ck of Object.keys(row)) {
          const cell = (row as any)[ck];
          if (looksLikeTransitDisplacementJson(cell) || looksLikeSignatureValue(cell)) delete (row as any)[ck];
        }
      }
    } else if (!k.startsWith('__')) {
      const v = (res as any)[k];
      if (looksLikeTransitDisplacementJson(v) || looksLikeSignatureValue(v)) delete (res as any)[k];
    }
  }
}

/** Remove cronômetros / produtividade da visita anterior (mesmo executionId em revisão). */
function stripFormProductivityTimerFields(res: Record<string, any>, schemaData: any[] | undefined): void {
  const fixed = new Set([
    '__form_started_at',
    '__form_active_seconds',
    '__form_paused_since',
    '__form_completed_at',
    '__form_fill_duration_sec',
    '__form_active_seconds_final',
    PAUSE_HISTORY_KEY,
    REVISION_TIMER_RESET_TOKEN_KEY,
  ]);
  for (const k of fixed) delete res[k];
  if (Array.isArray(schemaData)) {
    for (const f of schemaData) {
      if (f?.type === 'section_break' && f?.id) {
        delete res[`__section_start_${f.id}`];
        delete res[`__section_end_${f.id}`];
      }
    }
  }
}

/**
 * OS recém-recebida deve abrir sem progresso fantasma de UI.
 * Mantém respostas de negócio e remove só metadados de avanço/timers.
 */
function stripFreshTaskProgressMeta(res: Record<string, any>, schemaData: any[] | undefined): void {
  if (!res || typeof res !== 'object') return;
  stripFormProductivityTimerFields(res, schemaData);
  for (const k of Object.keys(res)) {
    if (k.startsWith('__time_')) delete res[k];
  }
}

function newSubmissionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parsePauseHistory(responses: Record<string, any>): any[] {
  const h = responses[PAUSE_HISTORY_KEY];
  if (Array.isArray(h)) return h;
  if (typeof h === 'string') {
    try {
      const p = JSON.parse(h);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Lista local usada no dashboard (`effectiveProviderTaskStatus`) para a aba "Em andamento". */
async function ensureTaskMarkedInProgressLocally(executionId: string): Promise<void> {
  const id = String(executionId || '').trim();
  if (!id) return;
  try {
    await appendUniqueStringToStoredArray('@brspark_inprogress_tasks', id);
  } catch {
    /* ignore */
  }
}

/** Resumo do motivo da pausa ainda aberta (sem fechar o intervalo). */
function getOpenPauseSummaryFromResponses(prev: Record<string, any>): string {
  const hist = parsePauseHistory(prev);
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i]?.endedAt == null && hist[i]?.startedAt) {
      return [hist[i].categoryLabel, hist[i].subLabel, hist[i].detail].filter(Boolean).join(', ');
    }
  }
  return '';
}

function pauseEventWindowMs(ev: any): { start: number; end: number } | null {
  const s = ev?.startedAt ? new Date(ev.startedAt).getTime() : NaN;
  const e = ev?.endedAt ? new Date(ev.endedAt).getTime() : NaN;
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return { start: s, end: e };
}

function getCompletedPauseSeconds(responses: Record<string, any>): number {
  let sec = 0;
  for (const ev of parsePauseHistory(responses)) {
    if (ev?.endedAt != null && ev?.durationSec != null) {
      sec += Math.max(0, Number(ev.durationSec) || 0);
    }
  }
  return sec;
}

function getActivePauseSeconds(responses: Record<string, any>, nowMs: number): number {
  const since = responses.__form_paused_since;
  if (!since) return 0;
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

function getTotalPausedSeconds(responses: Record<string, any>, nowMs: number): number {
  return getCompletedPauseSeconds(responses) + getActivePauseSeconds(responses, nowMs);
}

function overlapSeconds(
  windowStart: number,
  windowEnd: number,
  pauseStart: number,
  pauseEnd: number
): number {
  const lo = Math.max(windowStart, pauseStart);
  const hi = Math.min(windowEnd, pauseEnd);
  return hi > lo ? Math.floor((hi - lo) / 1000) : 0;
}

/** Duração da etapa em segundos; null se ainda não houve início registrado. */
function getSectionElapsedSeconds(responses: Record<string, any>, sectionId: string, nowMs: number): number | null {
  const { start, activeStart, activeSeconds } = getSectionTimingKeys(sectionId);
  const startedMarker = responses[start];
  const hasStarted = (typeof startedMarker === 'string' && startedMarker.trim() !== '') || !!startedMarker;
  const base = Number(responses[activeSeconds]);
  let sec = Number.isFinite(base) && base > 0 ? Math.floor(base) : 0;

  const segStartRaw = responses[activeStart];
  if (segStartRaw) {
    const startMs = new Date(segStartRaw).getTime();
    if (!Number.isNaN(startMs)) {
      let seg = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      for (const ev of parsePauseHistory(responses)) {
        const w = pauseEventWindowMs(ev);
        if (w) seg -= overlapSeconds(startMs, nowMs, w.start, w.end);
      }
      const since = responses.__form_paused_since;
      if (since) {
        const pt = new Date(since).getTime();
        if (!Number.isNaN(pt)) {
          seg -= overlapSeconds(startMs, nowMs, pt, nowMs);
        }
      }
      sec += Math.max(0, seg);
    }
  }
  if (!hasStarted && sec <= 0) return null;
  return Math.max(0, sec);
}

function getFormElapsedSeconds(responses: Record<string, any>, nowMs: number): number {
  const raw = responses.__form_started_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return 0;
  const elapsed = Math.max(0, Math.floor((nowMs - t) / 1000));
  return Math.max(0, elapsed - getTotalPausedSeconds(responses, nowMs));
}

function getFormActiveDisplaySeconds(
  responses: Record<string, any>,
  fgSegmentStart: number | null,
  nowMs: number
): number {
  const base = Number(responses.__form_active_seconds);
  const b = Number.isFinite(base) && base >= 0 ? base : 0;
  if (responses.__form_paused_since) return b;
  if (fgSegmentStart != null && nowMs >= fgSegmentStart) {
    return b + Math.floor((nowMs - fgSegmentStart) / 1000);
  }
  return b;
}

/** Resposta extra: notas do técnico por campo (configurável no builder). */
function technicianCommentKey(fieldId: string) {
  return `__comment_${fieldId}`;
}

/** Tamanho máximo do prompt estruturado de visão IA; alinhado ao backend `visionSimNaoQuestions.js`. */
const MAX_VISION_STRUCTURED_PROMPT_CHARS = 12000;
/** Com mais de uma pergunta sim/não, o texto por pergunta — alinhado a `checklistsVision.js`. */
const MAX_VISION_MULTI_SIMNAO_TEXT_CHARS = 500;
const MAX_VISION_SIMNAO_QUESTIONS = 10;

function sanitizeVisionQuestionId(raw: unknown, index: number): string {
  const fallback = `q${index + 1}`;
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  const cleaned = s.replace(/[^\w-]/g, '_').slice(0, 64);
  return cleaned || fallback;
}

/** Duração máxima de vídeo nos campos Visão de IA (detecção e análise) — `videoMaxDuration` do ImagePicker + validação. */
const VISION_CAMERA_VIDEO_MAX_SECONDS = 10;

/** Chave única por campo + linha de seção repetível (evita bloquear outras linhas durante a análise). */
function visionAnalyzeBusyKey(fieldId: string, scope?: SectionRepeatScope | null) {
  if (!scope) return fieldId;
  return `${fieldId}::__r__${scope.sectionId}__${scope.rowIndex}`;
}

function getVisionQuestionsFromField(field: any): { id: string; text: string }[] {
  const cfg =
    field?.config && typeof field.config === 'object' ? (field.config as Record<string, unknown>) : undefined;
  const structured = String(
    field?.visionStructuredPrompt ??
      field?.vision_structured_prompt ??
      cfg?.visionStructuredPrompt ??
      cfg?.vision_structured_prompt ??
      '',
  ).trim();

  const vq =
    field?.visionQuestions ??
    field?.vision_questions ??
    (cfg?.visionQuestions as unknown[] | undefined);

  const items: { id: string; text: string }[] = [];
  if (Array.isArray(vq)) {
    for (let i = 0; i < vq.length; i++) {
      const x = vq[i];
      if (!x || typeof x !== 'object') continue;
      const text = String((x as any).text || (x as any).question || '').trim();
      if (!text) continue;
      const id = String((x as any).id || '').trim();
      items.push({ id, text });
    }
  }

  const ft = effectiveSchemaFieldType(field);

  /** Análise (Gemini): manter um único critério `q1` com texto longo (comportamento legado). */
  if (ft === 'vision_ai_analysis') {
    if (structured) {
      return [{ id: 'q1', text: structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS) }];
    }
    if (!items.length) return [];
    if (items.length >= 2) {
      const joined = items
        .map((it) => it.text)
        .join('\n\n')
        .slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
      return joined ? [{ id: 'q1', text: joined }] : [];
    }
    return [
      {
        id: sanitizeVisionQuestionId(items[0].id, 0),
        text: items[0].text.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS),
      },
    ];
  }

  /** Detecção (YOLO): sempre um único critério `q1` (várias linhas legadas são fundidas). */
  if (ft === 'vision_checklist') {
    if (structured) {
      return [{ id: 'q1', text: structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS) }];
    }
    if (!items.length) return [];
    if (items.length >= 2) {
      const joined = items
        .map((it) => it.text)
        .join('\n\n')
        .slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
      return joined ? [{ id: 'q1', text: joined }] : [];
    }
    return [
      {
        id: sanitizeVisionQuestionId(items[0].id, 0),
        text: items[0].text.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS),
      },
    ];
  }

  if (structured) {
    return [{ id: 'q1', text: structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS) }];
  }
  return [];
}

/** Rótulo para `answers[].value` (sim/não/unknown ou texto livre, ex. nota). */
function formatVisionIaAnswerLabel(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const v = s.toLowerCase();
  if (v === 'yes' || v === 'sim') return 'Sim';
  if (v === 'no' || v === 'não' || v === 'nao') return 'Não';
  if (v === 'unknown' || v === 'indefinido' || v === 'indeterminado') return 'Não verificado (IA)';
  return s || 'Indefinido';
}

/** Visão IA (análise e detecção): mostrar texto/confiança/nota no formulário (padrão: sim). */
function visionAiShowsResponseInForm(field: any): boolean {
  const ft = effectiveSchemaFieldType(field);
  if (ft !== 'vision_ai_analysis' && ft !== 'vision_checklist') return true;
  return field?.visionShowAiResponseInForm !== false;
}

/** Alinha ao Form Builder: `photo_only` | `video_only` | `photo_and_video` (padrão). */
function normalizeVisionCaptureMode(field: any): 'photo_only' | 'video_only' | 'photo_and_video' {
  const m = String(field?.visionCaptureMode ?? field?.vision_capture_mode ?? '').trim();
  if (m === 'photo_only' || m === 'video_only' || m === 'photo_and_video') return m;
  return 'photo_and_video';
}

/** `visionCaptureMode` definido no Form Builder. */
function getVisionCaptureMediaTypes(field: any): ImagePicker.MediaTypeOptions {
  const mode = normalizeVisionCaptureMode(field);
  if (mode === 'photo_only') return ImagePicker.MediaTypeOptions.Images;
  if (mode === 'video_only') return ImagePicker.MediaTypeOptions.Videos;
  return ImagePicker.MediaTypeOptions.All;
}

/** Subtítulo do cartão de captura — espelha «Somente foto / Somente vídeo / Foto e vídeo» do builder (detecção e análise). */
function visionCaptureModeSubtitle(field: any): string {
  const mode = normalizeVisionCaptureMode(field);
  const sec = VISION_CAMERA_VIDEO_MAX_SECONDS;
  if (mode === 'photo_only') return 'Somente foto pela câmera.';
  if (mode === 'video_only') return `Somente vídeo pela câmera (até ${sec} s).`;
  return `Foto e vídeo pela câmera (vídeo até ${sec} s).`;
}

/** Duração do vídeo em ms: metadado do ImagePicker (ms) ou sonda via `expo-video` quando vier vazio. */
async function probeVisionRecordedVideoDurationMs(uri: string): Promise<number | null> {
  if (!uri) return null;
  let player: ReturnType<typeof createVideoPlayer> | null = null;
  try {
    player = createVideoPlayer(uri);
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (player.status === 'error') return null;
      if (player.status === 'readyToPlay') {
        const s = player.duration;
        if (Number.isFinite(s) && s > 0) return Math.round(s * 1000);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const s = player.duration;
    if (Number.isFinite(s) && s > 0) return Math.round(s * 1000);
    return null;
  } catch {
    return null;
  } finally {
    try {
      player?.release();
    } catch {
      /* ignore */
    }
  }
}

async function assertVisionCameraVideoWithinMaxSeconds(
  asset: ImagePicker.ImagePickerAsset,
  uri: string,
  mime: string,
): Promise<boolean> {
  if (!String(mime).startsWith('video')) return true;
  const maxMs = VISION_CAMERA_VIDEO_MAX_SECONDS * 1000;
  const slackMs = 350;
  let durMs: number | null = null;
  const raw = asset.duration;
  if (raw != null && Number.isFinite(raw) && raw > 0) {
    durMs = raw;
  } else {
    durMs = await probeVisionRecordedVideoDurationMs(uri);
  }
  if (durMs != null && durMs > maxMs + slackMs) {
    Alert.alert(
      i18n.t('checklistForm.visionVideoTooLongTitle'),
      i18n.t('checklistForm.visionVideoTooLongBody', { seconds: VISION_CAMERA_VIDEO_MAX_SECONDS }),
    );
    return false;
  }
  return true;
}

/** Ícone principal do cartão de captura (modo definido no builder). */
function visionCaptureModeHeroIcon(field: any): keyof typeof Ionicons.glyphMap {
  const mode = normalizeVisionCaptureMode(field);
  if (mode === 'photo_only') return 'camera-outline';
  if (mode === 'video_only') return 'videocam-outline';
  return 'scan-outline';
}

/** RN por vezes omite `mimeType` ou envia octet-stream; o backend exige image/* ou video/*. */
function inferMimeFromVisionCameraAsset(a: ImagePicker.ImagePickerAsset): string {
  const explicit = a.mimeType != null ? String(a.mimeType).trim() : '';
  if (explicit && explicit.toLowerCase() !== 'application/octet-stream') return explicit;
  const path = (a.uri || '').split('?')[0].toLowerCase();
  if (a.type === 'video') {
    if (path.endsWith('.mov') || path.endsWith('.qt')) return 'video/quicktime';
    if (path.endsWith('.webm')) return 'video/webm';
    if (path.endsWith('.3gp') || path.endsWith('.3gpp')) return 'video/3gpp';
    return 'video/mp4';
  }
  if (a.type === 'image') {
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.heic') || path.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
  }
  if (/\.(mov|qt)$/i.test(path)) return 'video/quicktime';
  if (/\.(mp4|m4v)$/i.test(path)) return 'video/mp4';
  if (/\.(webm)$/i.test(path)) return 'video/webm';
  if (/\.(png)$/i.test(path)) return 'image/png';
  if (/\.(jpe?g)$/i.test(path)) return 'image/jpeg';
  return explicit || 'application/octet-stream';
}

function parseVisionChecklistStored(raw: unknown): Record<string, any> | null {
  if (raw === undefined || raw === null) return null;
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, any>) : null;
}

/**
 * URI da captura atual: no modal «Instruções», substitui as imagens de referência do modelo
 * (desenho/exemplo) pela fotografia já registada no campo.
 */
function helpInstructionCapturePreviewUri(field: any, raw: unknown): string | null {
  const ft = effectiveSchemaFieldType(field);
  if (ft === 'image_annotation') {
    if (raw === undefined || raw === null) return null;
    let o: unknown = raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        o = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const rec = o as Record<string, unknown>;
    const uri = String(rec.imageUri || rec.uri || '').trim();
    if (uri && (uri.startsWith('http') || uri.startsWith('file:'))) return uri;
    return null;
  }
  if (ft === 'vision_checklist' || ft === 'vision_ai_analysis') {
    const o = parseVisionChecklistStored(raw);
    const u = o?.localUri != null ? String(o.localUri).trim() : '';
    if (u && (u.startsWith('http') || u.startsWith('file:'))) return u;
    return null;
  }
  if (ft === 'photo' || ft === 'photo_stamped' || ft === 'facial_recognition' || ft === 'file_upload') {
    const looksLikeImageUri = (u: string) => {
      const path = u.split('?')[0].toLowerCase();
      return /\.(jpe?g|png|gif|webp|heic|heif)(\b|$)/i.test(path);
    };
    const pick = (u: string) => {
      const t = u.trim();
      if (!t || (!t.startsWith('http') && !t.startsWith('file:'))) return null;
      if (ft === 'file_upload' && !looksLikeImageUri(t)) return null;
      return t;
    };
    if (Array.isArray(raw)) {
      for (let i = raw.length - 1; i >= 0; i--) {
        const got = pick(String(raw[i] ?? ''));
        if (got) return got;
      }
      return null;
    }
    return pick(String(raw ?? ''));
  }
  return null;
}

const VISION_ANALYSIS_GRID_KEYS = ['1x1', '2x2'] as const;
type VisionAnalysisGridKey = (typeof VISION_ANALYSIS_GRID_KEYS)[number];

/** Só 1×1 e 2×2 são suportados; grelhas antigas (2×1, 3×1, …) migram para 2×2. */
function normalizeVisionAnalysisGridKey(raw: unknown): VisionAnalysisGridKey {
  const s = String(raw ?? '1x1')
    .trim()
    .toLowerCase()
    .replace(/\*/g, 'x');
  if (s === '1x1' || s === '2x2') return s;
  if (s === '2x1' || s === '3x1' || s === '3x2' || s === '3x3') return '2x2';
  return '1x1';
}

/** Grelha 1×1 ou 2×2 para `vision_ai_analysis` e `vision_checklist` (composição única antes do envio à API). */
function getVisionAnalysisGridLayout(field: any): { key: VisionAnalysisGridKey; cols: number; rows: number; count: number } {
  const ft = effectiveSchemaFieldType(field);
  if (ft !== 'vision_ai_analysis' && ft !== 'vision_checklist') {
    return { key: '1x1', cols: 1, rows: 1, count: 1 };
  }
  const key = normalizeVisionAnalysisGridKey(field?.visionAnalysisGrid ?? field?.vision_analysis_grid);
  const map: Record<VisionAnalysisGridKey, readonly [number, number]> = {
    '1x1': [1, 1],
    '2x2': [2, 2],
  };
  const [cols, rows] = map[key];
  return { key, cols, rows, count: cols * rows };
}

function normalizeVisionGridSlotUris(raw: unknown, count: number): string[] {
  const out = Array.from({ length: count }, () => '');
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < count && i < raw.length; i++) {
    const u = raw[i];
    out[i] = u != null && String(u).trim() ? String(u).trim() : '';
  }
  return out;
}

const VISION_STATUS_PENDING_ANALYSIS = 'pending_analysis';

function isVisionPendingAnalysisRecord(o: Record<string, any> | null | undefined): boolean {
  if (!o) return false;
  return String(o.status || '').toLowerCase() === VISION_STATUS_PENDING_ANALYSIS;
}

/** Mídia pronta para envio à API (1×1 ou grelha com todas as células + composto em `localUri`). */
function visionStoredHasRunnableMedia(field: any, o: Record<string, any>): boolean {
  const localUri = o.localUri != null ? String(o.localUri).trim() : '';
  if (!localUri) return false;
  const layout = getVisionAnalysisGridLayout(field);
  if (layout.count <= 1) return true;
  const slots = normalizeVisionGridSlotUris(o.gridSlotUris, layout.count);
  return slots.every((u) => u.length > 0);
}

/** Tipos em que "múltiplo" não se aplica (seção usa outro fluxo; calculado/transit são especiais). */
const MULTIPLE_EXCLUDED_FIELD_TYPES = new Set([
  'section_break',
  'hidden',
  'calculated',
  'transit_start',
  'transit_end',
  'materials_consumption',
  'materials_receipt',
  'technician_finance_expense',
  'technician_finance_revenue',
  'signature',
  'signature_summary',
  'vision_checklist',
  'vision_ai_analysis',
  'leitura',
  'voice_note',
  'image_annotation',
  'lookup_select',
  'repeatable_matrix',
  'opinion_scale',
]);

function fieldAllowsMultiple(field: any) {
  const t = effectiveSchemaFieldType(field);
  return !!(field?.multiple && t && !MULTIPLE_EXCLUDED_FIELD_TYPES.has(t));
}

function sectionAllowsRepeat(sectionField: any) {
  return sectionField?.type === 'section_break' && !!sectionField?.multiple;
}

function sectionRepeatStorageKey(sectionId: string) {
  return `__section_repeat_${sectionId}`;
}

function sectionRepeatCompletedStorageKey(sectionId: string) {
  return `__section_repeat_completed_${sectionId}`;
}

function sectionRepeatMinRows(sectionField: any): number {
  const raw = sectionField?.minItems;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const m = parseInt(String(raw), 10);
    if (Number.isFinite(m) && m >= 0) return m;
  }
  return 0;
}

function sectionRepeatMaxRows(sectionField: any): number | null {
  const raw = sectionField?.maxItems;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const m = parseInt(String(raw), 10);
  if (Number.isFinite(m) && m > 0) return m;
  return null;
}

/** Comentário do técnico guardado dentro de uma linha de seção repetível. */
function rowTechnicianCommentKey(fieldId: string) {
  return `_comment_${fieldId}`;
}

type SectionRepeatScope = { sectionId: string; rowIndex: number };

function getRepeatRows(responses: Record<string, any>, sectionId: string): Record<string, any>[] {
  const raw = responses[sectionRepeatStorageKey(sectionId)];
  return Array.isArray(raw) ? raw : [];
}

function getScopedFieldValue(
  responses: Record<string, any>,
  scope: SectionRepeatScope | null | undefined,
  fieldId: string
) {
  if (!scope) return responses[fieldId];
  const rows = getRepeatRows(responses, scope.sectionId);
  const row = rows[scope.rowIndex];
  return row && typeof row === 'object' ? row[fieldId] : undefined;
}

/** Valor de campo na raiz ou dentro de seções repetíveis (transit_start/end fora do sítio errado quebrava o mapa). */
function findFieldValueInResponses(
  responses: Record<string, any>,
  fieldId: string,
  schemaData: any[] | undefined
): unknown {
  if (!fieldId || !responses || typeof responses !== 'object') return undefined;
  const root = responses[fieldId];
  if (root != null && String(root).trim() !== '') return root;
  if (!Array.isArray(schemaData)) return undefined;
  for (const f of schemaData) {
    if (f?.type !== 'section_break' || !f?.multiple || !f?.id) continue;
    const rkey = sectionRepeatStorageKey(f.id);
    const rows = responses[rkey];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === 'object') {
        const v = row[fieldId];
        if (v != null && String(v).trim() !== '') return v;
      }
    }
  }
  return undefined;
}

/** `transit_start` imediatamente antes deste `transit_end` na ordem do schema. */
function findPreviousTransitStartForEnd(schemaData: any[] | undefined, endFieldId: string): any | null {
  if (!Array.isArray(schemaData) || !endFieldId) return null;
  let lastStart: any | null = null;
  for (const f of schemaData) {
    if (!f || typeof f !== 'object') continue;
    if (f.type === 'transit_start') lastStart = f;
    if (f.id === endFieldId && f.type === 'transit_end') return lastStart;
  }
  return null;
}

/** Primeiro `transit_end` após este `transit_start` no schema (antes do próximo início). */
function findTransitEndFieldAfterStart(schemaData: any[] | undefined, startFieldId: string): any | null {
  if (!Array.isArray(schemaData) || !startFieldId) return null;
  let seen = false;
  for (const f of schemaData) {
    if (!f || typeof f !== 'object') continue;
    if (f.id === startFieldId && f.type === 'transit_start') seen = true;
    else if (seen && f.type === 'transit_end') return f;
    else if (seen && f.type === 'transit_start') return null;
  }
  return null;
}

type ActiveTransitLegInfo = {
  startField: any;
  endField: any;
  reimbursement: boolean;
  /** Patrulhamento: mapa segue KML/geometria da OS (`buildRouteCoordsFromTask`). */
  patrol?: boolean;
};

/**
 * Trecho de deslocamento em curso: último início preenchido cujo par de fim ainda está vazio.
 */
function getActiveTransitLegInfo(
  schemaData: any[] | undefined,
  responses: Record<string, unknown>
): ActiveTransitLegInfo | null {
  if (!Array.isArray(schemaData) || !responses || typeof responses !== 'object') return null;
  let pendingStart: { field: any; reimbursement: boolean; patrol: boolean } | null = null;
  for (const f of schemaData) {
    if (!f || typeof f !== 'object') continue;
    if (f.type === 'transit_start') {
      const v = findFieldValueInResponses(responses as any, f.id, schemaData);
      if (v != null && String(v).trim() !== '') {
        pendingStart = {
          field: f,
          reimbursement: f.transitPurpose === 'reimbursement',
          patrol: f.transitPurpose === 'patrol',
        };
      } else {
        pendingStart = null;
      }
    }
    if (f.type === 'transit_end') {
      const v = findFieldValueInResponses(responses as any, f.id, schemaData);
      if (pendingStart && (v == null || String(v).trim() === '')) {
        return {
          startField: pendingStart.field,
          endField: f,
          reimbursement: pendingStart.reimbursement,
          patrol: pendingStart.patrol,
        };
      }
      if (v != null && String(v).trim() !== '') {
        pendingStart = null;
      }
    }
  }
  return null;
}

/**
 * Após um trecho operacional ou de patrulha estar encerrado (`transit_end` com evidência),
 * não permitir novo «Iniciar deslocamento» **operacional** (sem `transitPurpose` especial).
 * O segundo trecho previsto no produto é só `reimbursement` ou `patrol` (novo par no schema).
 */
function shouldBlockTransitStartAfterOperationalDisplacementFinished(
  schemaData: any[] | undefined,
  startField: any,
  responses: Record<string, unknown>,
  scope: SectionRepeatScope | null | undefined
): boolean {
  if (!startField || startField.type !== 'transit_start') return false;
  const purpose = startField.transitPurpose;
  if (purpose === 'reimbursement' || purpose === 'patrol') return false;
  if (!Array.isArray(schemaData)) return false;
  let sawFinishedNonReimbursementLeg = false;
  for (const f of schemaData) {
    if (!f || typeof f !== 'object') continue;
    if (f.id === startField.id && f.type === 'transit_start') {
      return sawFinishedNonReimbursementLeg;
    }
    if (f.type === 'transit_end') {
      const st = findPreviousTransitStartForEnd(schemaData, f.id);
      const endVal = getScopedFieldValue(responses, scope ?? null, f.id);
      const prevPurpose = st?.transitPurpose;
      const isReimbursementOnlyLeg = prevPurpose === 'reimbursement';
      if (isTransitEvidenceNonempty(endVal) && st && !isReimbursementOnlyLeg) {
        sawFinishedNonReimbursementLeg = true;
      }
    }
  }
  return false;
}

/** Reembolso / «apenas registo»: `transitPurpose` no início; o fim herda do início anterior no schema. */
function isReimbursementTransitField(schemaData: any[] | undefined, fieldId: string): boolean {
  if (!fieldId || !Array.isArray(schemaData)) return false;
  const fd = schemaData.find((f: any) => f && f.id === fieldId);
  if (!fd) return false;
  if (fd.type === 'transit_start') return fd.transitPurpose === 'reimbursement';
  if (fd.type === 'transit_end') {
    const st = findPreviousTransitStartForEnd(schemaData, fieldId);
    return st?.transitPurpose === 'reimbursement';
  }
  return false;
}

/** Patrulhamento: mapa com geometria/KML da OS (`transitPurpose === 'patrol'`). */
function isPatrolTransitField(schemaData: any[] | undefined, fieldId: string): boolean {
  if (!fieldId || !Array.isArray(schemaData)) return false;
  const fd = schemaData.find((f: any) => f && f.id === fieldId);
  if (!fd) return false;
  if (fd.type === 'transit_start') return fd.transitPurpose === 'patrol';
  if (fd.type === 'transit_end') {
    const st = findPreviousTransitStartForEnd(schemaData, fieldId);
    return st?.transitPurpose === 'patrol';
  }
  return false;
}

/** IDs de campos incluídos no bloco «resumo para assinatura» (schema). */
function normalizeSignatureSummarySourceIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map((x) => String(x || '').trim()).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** Lê a lista configurada no schema (camelCase ou snake_case). */
function getSignatureSummarySourceFieldIds(field: any): string[] {
  return normalizeSignatureSummarySourceIds(
    field?.summarySourceFieldIds ?? field?.summary_source_field_ids
  );
}

function isSummarySourceValueEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/** URIs de mídia para miniaturas no resumo (foto, carimbo, facial, anexo). */
function collectSummaryThumbnailUris(fieldDef: any | undefined, raw: unknown): string[] {
  if (!fieldDef) return [];
  const t = effectiveSchemaFieldType(fieldDef);
  if (
    t !== 'photo' &&
    t !== 'photo_stamped' &&
    t !== 'facial_recognition' &&
    t !== 'file_upload' &&
    t !== 'image_annotation' &&
    !isVisionSimNaoMediaFieldType(t)
  )
    return [];
  if (t === 'image_annotation') {
    let o: unknown = raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        o = JSON.parse(raw);
      } catch {
        return [];
      }
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return [];
    const u = String((o as Record<string, unknown>).imageUri || (o as Record<string, unknown>).uri || '').trim();
    return u ? [u] : [];
  }
  if (isVisionSimNaoMediaFieldType(t)) {
    const o = parseVisionChecklistStored(raw);
    const u = o?.localUri != null ? String(o.localUri).trim() : '';
    if (u) return [u];
    const slots = o?.gridSlotUris;
    if (Array.isArray(slots)) {
      const first = slots.map((x) => String(x || '').trim()).find(Boolean);
      return first ? [first] : [];
    }
    return [];
  }
  const arr = normalizeResponseArray(raw)
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  if (t !== 'file_upload') return arr;
  return arr.filter((u) => /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i.test(u) || u.startsWith('data:image'));
}

/** Valor para o resumo: mesmo âmbito; na raiz tenta também localizar em linhas repetíveis.
 * Dentro de uma linha repetível, se o campo referenciado estiver na raiz do formulário, usa esse valor. */
function resolveSummarySourceValue(
  responses: Record<string, any>,
  scope: SectionRepeatScope | null | undefined,
  sourceFieldId: string,
  schemaData: any[] | undefined
): unknown {
  const direct = getScopedFieldValue(responses, scope ?? null, sourceFieldId);
  if (!isSummarySourceValueEmpty(direct)) return direct;
  if (scope) {
    const root = responses[sourceFieldId];
    if (!isSummarySourceValueEmpty(root)) return root;
  }
  if (!scope) {
    const found = findFieldValueInResponses(responses, sourceFieldId, schemaData);
    if (!isSummarySourceValueEmpty(found)) return found;
  }
  return direct;
}

/** Resposta trivial (ex.: «.» de regra antiga) não deve esconder o HTML rico do form builder. */
function isLeituraResponseNoise(s: string): boolean {
  if (!s) return true;
  if (s.length === 1 && !/[<>]/.test(s)) return true;
  if (/^[.,;:\s\-–—()[\]'"]+$/u.test(s)) return true;
  return false;
}

/** Evita tratar «3 < 5» ou fragmentos com «<» como HTML. */
function looksLikeHtmlMarkup(s: string): boolean {
  const t = s.trim();
  if (!/[<>]/.test(t)) return false;
  return /<\/?[a-z][a-z0-9]*\b/i.test(t) || /&#?\w+;/.test(t);
}

/** Texto «visível» para comparar HTML do modelo com valor plano vindo da API/rascunho (sem tags). */
function leituraComparablePlain(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * HTML mostrado no bloco Leitura: valor em `responses` (ex.: regra «Definir valor»)
 * substitui o `contentHtml` estático do schema. Texto sem tags vira um `<p>` com entidades escapadas.
 *
 * Se a API gravar o mesmo texto sem marcação que o modelo tem em HTML rico (caso frequente em execuções
 * sincronizadas), mantém o HTML do schema para cores/itálico/etc. no `react-native-render-html`.
 */
function effectiveLeituraContentHtml(responseVal: unknown, schemaContentHtml?: string): string | undefined {
  const schemaRaw = schemaContentHtml != null ? String(schemaContentHtml) : '';
  const schemaTrim = schemaRaw.trim();
  const trimmed = responseVal == null ? '' : String(responseVal).trim();

  if (!trimmed) {
    return schemaTrim ? schemaRaw : undefined;
  }

  if (isLeituraResponseNoise(trimmed)) {
    return schemaTrim ? schemaRaw : undefined;
  }

  if (!/[<>]/.test(trimmed)) {
    const plainFromSchema = leituraComparablePlain(schemaRaw);
    const plainResponse = leituraComparablePlain(trimmed);
    if (
      schemaTrim &&
      looksLikeHtmlMarkup(schemaTrim) &&
      plainFromSchema.length > 0 &&
      plainFromSchema === plainResponse
    ) {
      return schemaRaw;
    }
    const escaped = trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<p>${escaped}</p>`;
  }

  if (!looksLikeHtmlMarkup(trimmed)) {
    const escaped = trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<p>${escaped}</p>`;
  }

  return trimmed;
}

function collectLeituraFieldIds(schemaData: any[] | undefined): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(schemaData)) return ids;
  for (const f of schemaData) {
    if (effectiveSchemaFieldType(f) === 'leitura' && f?.id) ids.add(String(f.id));
  }
  return ids;
}

/**
 * Remove valores de campos «leitura» em `responses` (só costumam existir por regra «Definir valor»).
 * Assim o rascunho local não mostra texto da regra até as condições voltarem a ser avaliadas.
 */
function stripLeituraKeysFromResponsesCopy(
  responses: Record<string, any> | undefined | null,
  schemaData: any[] | undefined
): { out: Record<string, any>; changed: boolean } {
  const src = responses && typeof responses === 'object' && !Array.isArray(responses) ? responses : {};
  const out: Record<string, any> = { ...src };
  let changed = false;
  const leituraIds = collectLeituraFieldIds(schemaData);
  for (const lid of leituraIds) {
    if (Object.prototype.hasOwnProperty.call(out, lid)) {
      delete out[lid];
      changed = true;
    }
  }
  if (!Array.isArray(schemaData)) return { out, changed };
  for (const f of schemaData) {
    if (f?.type !== 'section_break' || !f?.multiple || !f?.id) continue;
    const rkey = sectionRepeatStorageKey(f.id);
    const rows = out[rkey];
    if (!Array.isArray(rows)) continue;
    let rowBlockChanged = false;
    const nextRows = rows.map((row: any) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const nr = { ...row };
      for (const lid of leituraIds) {
        if (Object.prototype.hasOwnProperty.call(nr, lid)) {
          delete nr[lid];
          rowBlockChanged = true;
        }
      }
      return nr;
    });
    if (rowBlockChanged) {
      out[rkey] = nextRows;
      changed = true;
    }
  }
  return { out, changed };
}

function fileNameFromAttachmentUri(u: string): string {
  const noq = u.split('?')[0];
  const seg = noq.split('/').pop() || noq;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** Nomes + URLs curtas dos anexos (resumo para assinatura). */
function formatFileUploadForSignatureSummary(raw: unknown): string {
  const arr = normalizeResponseArray(raw)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!arr.length) return '—';
  const blocks = arr.map((uri, i) => {
    if (uri.startsWith('data:')) {
      const m = /^data:([^;,]{1,80})/i.exec(uri);
      const mime = m?.[1]?.trim() || 'dados';
      return `Anexo inline (${mime})`;
    }
    const name = fileNameFromAttachmentUri(uri);
    const shortUrl = uri.length > 120 ? `${uri.slice(0, 117)}…` : uri;
    if (/^https?:\/\//i.test(uri)) {
      return `${name}\n${shortUrl}`;
    }
    if (uri.startsWith('file://')) {
      return `${name}\n(arquivo local, envie para sincronizar e ver o link no relatório)`;
    }
    return name || shortUrl;
  });
  if (blocks.length === 1) return blocks[0];
  return blocks.map((b, i) => `${i + 1}. ${b}`).join('\n\n');
}

/** Texto só leitura para o resumo (evita HTML e URLs longas). */
function formatFieldValueForSignatureSummary(fieldDef: any | undefined, raw: unknown): string {
  if (!fieldDef) {
    if (raw === undefined || raw === null) return '—';
    return String(raw);
  }
  const t = effectiveSchemaFieldType(fieldDef);
  if (raw === undefined || raw === null) return '—';
  if (typeof raw === 'string' && raw.trim() === '') return '—';
  if (t === 'hidden' || t === 'section_break') return '—';
  if (t === 'checkbox' || t === 'yes_no') {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return 'Sim';
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return 'Não';
    return String(raw);
  }
  if (t === 'rating') {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n <= 0) return String(raw);
    return `${n} estrela(s)`;
  }
  if (t === 'multiselect') {
    const s = Array.isArray(raw) ? raw.join(', ') : String(raw);
    const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }
  if (t === 'photo' || t === 'photo_stamped' || t === 'facial_recognition') {
    return 'Mídia registada (ver relatório completo)';
  }
  if (t === 'file_upload') {
    return formatFileUploadForSignatureSummary(raw);
  }
  if (t === 'image_annotation') {
    return isImageAnnotationAnswerFilled(raw) ? 'Foto com anotações registada' : '—';
  }
  if (t === 'lookup_select') {
    const s = String(raw ?? '').trim();
    return s || '—';
  }
  if (t === 'opinion_scale') {
    const mode = String(fieldDef?.opinionScaleMode || 'nps').toLowerCase() === 'likert' ? 'Likert' : 'NPS';
    const s = String(raw ?? '').trim();
    return s ? `${mode}: ${s}` : '—';
  }
  if (t === 'repeatable_matrix') {
    return formatRepeatableMatrixForSignatureSummary(fieldDef, raw);
  }
  if (isVisionSimNaoMediaFieldType(t)) {
    const o = parseVisionChecklistStored(raw);
    if (!o) return '—';
    if (isVisionPendingAnalysisRecord(o) && visionStoredHasRunnableMedia(fieldDef, o)) {
      return 'Mídia registada, análise IA pendente (envio automático com rede)';
    }
    if (o.status !== 'completed' || !Array.isArray(o.answers)) return '—';
    const parts = o.answers.map((a: any) => {
      const lab = formatVisionIaAnswerLabel(a?.value);
      const c =
        typeof a?.confidence === 'number' && Number.isFinite(a.confidence)
          ? Math.round(a.confidence * 100)
          : null;
      return c != null ? `${lab} (${c}%)` : lab;
    });
    const joined = parts.length ? parts.join(' · ') : '—';
    if (
      t === 'vision_ai_analysis' &&
      fieldDef?.visionRating0To10Enabled === true &&
      typeof (o as any).rating0To10 === 'number' &&
      Number.isFinite((o as any).rating0To10)
    ) {
      const r = Math.max(0, Math.min(10, Math.round((o as any).rating0To10)));
      return joined !== '—' ? `Nota ${r}/10 · ${joined}` : `Nota ${r}/10`;
    }
    return joined;
  }
  if (t === 'signature' || t === 'signature_summary') {
    const s = String(raw);
    if (s.startsWith('SIG_V1|')) return 'Assinatura registrada';
    return s.trim() ? 'Assinatura registrada' : '—';
  }
  if (t === 'location_pick') {
    return summarizeLocationPickValue(raw);
  }
  if (t === 'geofence_check') {
    try {
      const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (j && typeof j === 'object') {
        const addr = (j as any).address || (j as any).addr || (j as any).formattedAddress;
        const inside = !!(j as any).insideZone || !!(j as any).geofence?.insideZone;
        const bits: string[] = [];
        if (addr) bits.push(String(addr));
        bits.push(inside ? 'Validação: dentro da área' : 'Validação: fora da área');
        return bits.join('\n');
      }
    } catch {
      /* ignore */
    }
    return 'Registro de validação de localização (GPS)';
  }
  if (t === 'materials_consumption') {
    const p = parseMaterialsValue(raw);
    const lines = p.lines.filter((l) => l.qty > 0);
    if (!lines.length) return '—';
    return lines
      .map((l) => {
        const namePart = String(l.name || '').trim();
        const skuPart = String(l.sku || '').trim();
        const idPart = String(l.itemId || '').trim();
        const display =
          namePart || skuPart || (idPart ? `Item ${idPart}` : 'Item');
        const skuSuffix = skuPart && skuPart !== namePart ? ` (${skuPart})` : '';
        const unit = l.unit ? ` ${l.unit}` : '';
        return `${display}${skuSuffix}: ${l.qty}${unit}`.trim();
      })
      .join('\n');
  }
  if (t === 'materials_receipt') {
    const pr = parseMaterialsReceiptValue(raw);
    if (pr.version === 2) {
      if (!pr.lines.length) return '—';
      return pr.lines
        .map((l) => {
          const title = String(l.name || '').trim() || 'Item';
          const sku = String(l.sku || '').trim() || '—';
          const base = `${title} (SKU ${sku}): ${l.qty}`;
          if (l.decision === 'accepted') return `${base}, Aceito`;
          if (l.decision === 'rejected') {
            const j = String(l.rejectReason || '').trim();
            return j ? `${base}, Recusado: ${j}` : `${base}, Recusado`;
          }
          return `${base}, Pendente`;
        })
        .join('\n');
    }
    const lines = pr.lines.filter((l) => l.qty > 0);
    if (!lines.length) return '—';
    return lines
      .map((l) => {
        const namePart = String(l.name || '').trim();
        const skuPart = String(l.sku || '').trim();
        const idPart = String(l.itemId || '').trim();
        const display =
          namePart || skuPart || (idPart ? `Item ${idPart}` : 'Item');
        const skuSuffix = skuPart && skuPart !== namePart ? ` (${skuPart})` : '';
        const unit = l.unit ? ` ${l.unit}` : '';
        return `${display}${skuSuffix}: ${l.qty}${unit}`.trim();
      })
      .join('\n');
  }
  if (t === 'technician_finance_revenue') {
    const pr = parseTechnicianRevenueIntegrationValue(raw);
    if (pr.version !== 2 || !pr.lines.length) return '—';
    const cur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    return pr.lines
      .filter((l) => l.amount > 0)
      .map((l) => {
        const amt = cur.format(l.amount);
        const desc = String(l.description || '').trim();
        const fts = l.originFts.length ? ` · FTs: ${l.originFts.join(', ')}` : '';
        const pending = l.decision === 'accepted' ? '' : ', pendente';
        return desc ? `Receita ${amt}, ${desc}${fts}${pending}` : `Receita ${amt}${fts}${pending}`;
      })
      .join('\n');
  }
  if (t === 'technician_finance_expense') {
    const p = parseTechnicianFinanceValue(raw);
    const lines = p.lines.filter((l) => l.amount > 0);
    if (!lines.length) return '—';
    const cur = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    return lines
      .map((l) => {
        const amt = cur.format(l.amount);
        const desc = String(l.description || '').trim();
        return desc ? `Despesa ${amt}, ${desc}` : `Despesa ${amt}`;
      })
      .join('\n');
  }
  if (t === 'voice_note') {
    const p = parseVoiceNoteValue(raw);
    const tr = String(p.transcript || '').trim();
    if (tr) return tr;
    if (voiceNoteHasPendingTranscription(raw)) {
      return 'Nota de voz registada, transcrição pendente (envio automático com rede)';
    }
    if (typeof raw === 'string') return raw.trim() || '—';
    return '—';
  }
  if (t === 'transit_start' || t === 'transit_end') {
    const ev = parseTransitFieldEvidence(raw);
    if (!ev) {
      const s = typeof raw === 'string' ? raw.trim() : '';
      return s ? 'Deslocamento registrado (detalhe indisponível)' : '—';
    }
    const lines = formatTransitEvidenceLines(ev);
    return lines.length ? lines.join('\n') : 'Deslocamento registrado';
  }
  if (t === 'barcode_scan') return String(raw).trim() || '—';
  if (t === 'calculated') return String(raw);
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => String(x)).filter((x) => x.trim());
    return parts.length ? parts.join(' · ') : '—';
  }
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return '—';
    }
  }
  return String(raw);
}

function getScopedTechComment(
  responses: Record<string, any>,
  scope: SectionRepeatScope | null | undefined,
  fieldId: string
) {
  if (!scope) return responses[technicianCommentKey(fieldId)] || '';
  const rows = getRepeatRows(responses, scope.sectionId);
  const row = rows[scope.rowIndex];
  if (!row || typeof row !== 'object') return '';
  const v = row[rowTechnicianCommentKey(fieldId)];
  return v != null ? String(v) : '';
}

/** Legendas/comentários por item de foto ou arquivo (quando allowMediaDescription no template). */
function mediaCaptionStorageKey(fieldId: string) {
  return `__media_cap_${fieldId}`;
}

/** Auditoria JSON guardada por `processFacialImage` após verify-face (mesmo scope que o campo). */
function facialBiometricStorageKey(fieldId: string) {
  return `${fieldId}__biometric`;
}

function parseFacialBiometricAudit(raw: unknown): {
  at?: string;
  /** Momento do obturador (ISO); persiste quando a URL pública já não traz `?capturedAt=`. */
  capturedAt?: string;
  /** GPS/morada da captura (a URL pública após upload perde a query). */
  captureLat?: string;
  captureLng?: string;
  captureAddr?: string;
  engine?: string;
  confidence?: number;
  facialAuthMode?: string;
  identifiedUserId?: string;
  identifiedUser?: { id?: string; name?: string; email?: string; role?: string };
} | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw as any;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o ? (o as any) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function formatFacialConfidencePct(c: unknown): string | null {
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  const pct = c <= 1 ? Math.round(c * 100) : Math.round(Math.min(100, c));
  return `${pct}%`;
}

const FACIAL_NO_FACE_IN_IMAGE_MSG =
  'Nenhum rosto foi detectado na imagem enviada. Posicione o rosto de frente para a câmera, com boa iluminação; fotografias de telas, reflexos ou imagens em papel não serão validadas.';

/** Remove marcas de produto fornecedor de textos vindos da API ou de relatórios antigos. */
function sanitizeFacialUserFacingCopy(text: string | undefined | null): string {
  if (text == null || text === '') return '';
  let s = String(text);
  if (/no face is found in the given image/i.test(s) || /"code"\s*:\s*28\b/i.test(s)) {
    return FACIAL_NO_FACE_IN_IMAGE_MSG;
  }
  s = s.replace(/\bexadel\s+compreface\b/gi, 'servidor');
  s = s.replace(/\bcompreface\b/gi, 'servidor');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

function normalizeFacialEngineForStorage(engine: unknown): string | undefined {
  if (engine == null || engine === '') return undefined;
  const e = String(engine).toLowerCase();
  if (e === 'compreface') return 'server';
  return String(engine);
}

/** Primeira URI de foto (campo simples ou múltiplo). */
function firstFacialMediaUri(val: unknown): string | null {
  if (val == null) return null;
  if (Array.isArray(val)) {
    const u = val.find((x) => x != null && String(x).trim() !== '');
    return u != null ? String(u) : null;
  }
  const s = String(val).trim();
  return s || null;
}

/** Foto com `?live=true&lat=&lng=` mas ainda sem `addr=` — completa morada em segundo plano. */
function parseLatLngFromUriQueryForAddrFill(u: string): { base: string; lat: number; lng: number; search: string } | null {
  const qi = u.indexOf('?');
  if (qi < 0) return null;
  const search = u.slice(qi + 1);
  const params = new URLSearchParams(search);
  const addr = params.get('addr');
  if (addr != null && String(addr).trim() !== '') return null;
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { base: u.slice(0, qi), lat, lng, search };
}

async function mergeAddrIntoMediaUriIfStillCurrent(args: {
  getResponses: () => Record<string, any>;
  applyInput: (fieldId: string, value: any, scope?: SectionRepeatScope | null) => void;
  fieldId: string;
  scope: SectionRepeatScope | null | undefined;
  uriAtCommit: string;
}): Promise<void> {
  const { getResponses, applyInput, fieldId, scope, uriAtCommit } = args;
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected === false) return;
  } catch {
    return;
  }
  const parsed = parseLatLngFromUriQueryForAddrFill(uriAtCommit);
  if (!parsed) return;
  let line = '';
  try {
    const rev = await Location.reverseGeocodeAsync({ latitude: parsed.lat, longitude: parsed.lng });
    if (rev?.length) {
      const r = rev[0];
      line = `${r.street || r.name}, ${r.streetNumber || 'S/N'} - ${r.subregion || r.city || r.district || r.region}`.trim();
    }
  } catch {
    /* Não abortar: sem isto o GPS fica na URI mas o endereço nunca entra no relatório. */
    line = '';
  }
  if (!line) line = 'Endereço indisponível (rede ou mapas).';
  const params = new URLSearchParams(parsed.search);
  params.set('addr', line);
  const newUri = `${parsed.base}?${params.toString()}`;
  const snap = getResponses();
  const cur = getScopedFieldValue(snap, scope ?? null, fieldId);
  let nextVal: unknown = null;
  if (Array.isArray(cur)) {
    const idx = cur.findIndex((x) => String(x) === uriAtCommit);
    if (idx < 0) return;
    const copy = [...cur];
    copy[idx] = newUri;
    nextVal = copy;
  } else if (String(cur) === uriAtCommit) {
    nextVal = newUri;
  } else {
    return;
  }
  applyInput(fieldId, nextVal as string | string[], scope);
  try {
    const bioKey = facialBiometricStorageKey(fieldId);
    const snap2 = getResponses();
    const bioRaw = getScopedFieldValue(snap2, scope ?? null, bioKey);
    const aud = parseFacialBiometricAudit(bioRaw);
    /** Morada assíncrona: gravar em `__biometric` sempre que existir auditoria facial (não só `pending`), senão após validação o PDF perde o endereço quando a URL pública perde a query. */
    if (aud && typeof aud === 'object') {
      const nextBio = {
        ...(aud as Record<string, unknown>),
        captureAddr: line,
      };
      applyInput(bioKey, JSON.stringify(nextBio), scope);
    }
  } catch {
    /* não bloquear morada na URI se o patch da biometria falhar */
  }
}

/**
 * Visão IA: gravar `captureAddr` no objeto JSON quando há lat/lng na URI ou no objeto (reverse geocode).
 * Alinhado a `mergeAddrIntoMediaUriIfStillCurrent` (foto carimbada).
 */
async function mergeAddrIntoVisionFieldIfStillCurrent(args: {
  getResponses: () => Record<string, any>;
  applyInput: (fieldId: string, value: any, scope?: SectionRepeatScope | null) => void;
  fieldId: string;
  scope: SectionRepeatScope | null | undefined;
  uriAtCommit: string;
}): Promise<void> {
  const { getResponses, applyInput, fieldId, scope, uriAtCommit } = args;
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected === false) return;
  } catch {
    return;
  }
  const snap = getResponses();
  const raw = getScopedFieldValue(snap, scope ?? null, fieldId);
  const o = parseVisionChecklistStored(raw);
  if (!o || typeof o !== 'object') return;
  if (typeof o.captureAddr === 'string' && o.captureAddr.trim()) return;

  let latN: number | null = null;
  let lngN: number | null = null;
  const parsed = parseLatLngFromUriQueryForAddrFill(uriAtCommit);
  if (parsed) {
    latN = parsed.lat;
    lngN = parsed.lng;
  } else {
    const la = o.captureLat != null ? parseFloat(String(o.captureLat)) : NaN;
    const ln = o.captureLng != null ? parseFloat(String(o.captureLng)) : NaN;
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      latN = la;
      lngN = ln;
    }
  }
  if (latN == null || lngN == null) return;

  let line = '';
  try {
    const rev = await Location.reverseGeocodeAsync({ latitude: latN, longitude: lngN });
    if (rev?.length) {
      const r = rev[0];
      line = `${r.street || r.name}, ${r.streetNumber || 'S/N'} - ${r.subregion || r.city || r.district || r.region}`.trim();
    }
  } catch {
    line = '';
  }
  if (!line) line = 'Endereço indisponível (rede ou mapas).';

  const snap2 = getResponses();
  const raw2 = getScopedFieldValue(snap2, scope ?? null, fieldId);
  const cur = parseVisionChecklistStored(raw2);
  if (!cur || typeof cur !== 'object') return;
  if (typeof cur.captureAddr === 'string' && cur.captureAddr.trim()) return;
  if (!String(cur.localUri || '').trim()) return;

  const commitBase = uriAtCommit.split('?')[0];
  const curLocal = String(cur.localUri || '').split('?')[0];
  if (curLocal && commitBase && curLocal !== commitBase && String(cur.localUri) !== uriAtCommit) return;

  const next = {
    ...cur,
    captureLat: cur.captureLat != null ? String(cur.captureLat) : String(latN),
    captureLng: cur.captureLng != null ? String(cur.captureLng) : String(lngN),
    captureAddr: line,
  };
  applyInput(fieldId, next, scope ?? null);
}

/**
 * Template/admin pode gravar `requireOnlineValidation` como boolean ou string (`"false"` é truthy em JS — não usar `!!campo` cru).
 * Só exige rede/servidor quando o valor é explicitamente afirmativo.
 */
function schemaFieldRequiresOnlineValidation(field: { requireOnlineValidation?: unknown }): boolean {
  const v = field.requireOnlineValidation;
  if (v === true || v === 1) return true;
  if (v === false || v == null || v === '') return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }
  return false;
}

/**
 * Há foto facial guardada mas a auditoria `{id}__biometric` ainda está `pending` **e** o campo exige validação online.
 * Com `requireOnlineValidation === false` (padrão offline-first), pending não bloqueia conclusão — alinhado ao aviso
 * na UI («validação com o retorno da conexão») e ao flush em `pushSyncQueue` / ecrã do checklist.
 */
function getFirstBlockingPendingFacialFieldLabel(
  res: Record<string, any>,
  schema: any[]
): string | null {
  if (!Array.isArray(schema)) return null;
  let currentSectionId: string | null = null;
  let curSecRepeat = false;
  for (const f of schema) {
    if (f.type === 'section_break') {
      currentSectionId = f.id;
      curSecRepeat = sectionAllowsRepeat(f);
      continue;
    }
    if (f.type !== 'facial_recognition') continue;
    if (!schemaFieldRequiresOnlineValidation(f)) continue;

    const checkScope = (scope: SectionRepeatScope | null): string | null => {
      const bioRaw = getScopedFieldValue(res, scope, facialBiometricStorageKey(f.id));
      const audit = parseFacialBiometricAudit(bioRaw);
      if (!(audit as { pending?: boolean } | null)?.pending) return null;
      const uriRaw = getScopedFieldValue(res, scope, f.id);
      if (!firstFacialMediaUri(uriRaw)) return null;
      return String(f.label || f.id);
    };

    if (!curSecRepeat) {
      const hit = checkScope(null);
      if (hit) return hit;
    } else if (currentSectionId) {
      const rows = getRepeatRows(res, currentSectionId);
      for (let ri = 0; ri < rows.length; ri++) {
        const hit = checkScope({ sectionId: currentSectionId, rowIndex: ri });
        if (hit) return hit;
      }
    }
  }
  return null;
}

/** Visão IA com `requireOnlineValidation`: só concluir OS com análise já feita (não `pending_analysis`). */
function getFirstBlockingVisionPendingRequiringOnline(
  res: Record<string, any>,
  schema: any[],
): string | null {
  if (!Array.isArray(schema)) return null;
  let currentSectionId: string | null = null;
  let curSecRepeat = false;
  for (const f of schema) {
    if (f.type === 'section_break') {
      currentSectionId = f.id;
      curSecRepeat = sectionAllowsRepeat(f);
      continue;
    }
    if (!isVisionSimNaoMediaFieldType(effectiveSchemaFieldType(f))) continue;
    if (!schemaFieldRequiresOnlineValidation(f)) continue;

    const checkScope = (scope: SectionRepeatScope | null): string | null => {
      const raw = getScopedFieldValue(res, scope, f.id);
      const o = parseVisionChecklistStored(raw);
      if (!o || !isVisionPendingAnalysisRecord(o) || !visionStoredHasRunnableMedia(f, o)) return null;
      return String(f.label || f.id);
    };

    if (!curSecRepeat) {
      const hit = checkScope(null);
      if (hit) return hit;
    } else if (currentSectionId) {
      const rows = getRepeatRows(res, currentSectionId);
      for (let ri = 0; ri < rows.length; ri++) {
        const hit = checkScope({ sectionId: currentSectionId, rowIndex: ri });
        if (hit) return hit;
      }
    }
  }
  return null;
}

type VerifyFaceApiResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; kind: 'error_msg'; message: string }
  | { ok: false; kind: 'no_match'; message?: string }
  | { ok: false; kind: 'network' };

async function postVerifyFaceForField(fieldData: any, imgBase64: string): Promise<VerifyFaceApiResult> {
  try {
    const rawResp = await apiFetch('/api/vision/verify-face', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64: imgBase64,
        facialAuthMode: fieldData?.facialAuthMode === 'identify' ? 'identify' : 'self_verify',
      }),
    });
    const apiResp: any = await rawResp.json();
    if (apiResp?.error) {
      const msg = sanitizeFacialUserFacingCopy(String(apiResp.error));
      return { ok: false, kind: 'error_msg', message: msg || 'Erro ao validar a biometria facial.' };
    }
    if (!apiResp?.match) {
      const nm = sanitizeFacialUserFacingCopy(apiResp?.message);
      return { ok: false, kind: 'no_match', message: nm || undefined };
    }
    return { ok: true, data: apiResp };
  } catch {
    return { ok: false, kind: 'network' };
  }
}

function parseMediaUriQuery(uri: string): Record<string, string> {
  const s = String(uri || '');
  const q = s.indexOf('?');
  if (q < 0) return {};
  const out: Record<string, string> = {};
  try {
    const params = new URLSearchParams(s.slice(q + 1));
    params.forEach((v, k) => {
      out[k] = v;
    });
  } catch {
    /* ignore */
  }
  return out;
}

function safeDecodeUriComponent(v: string): string {
  try {
    return decodeURIComponent(String(v).replace(/\+/g, ' '));
  } catch {
    return v;
  }
}

function formatIsoDateTimePt(iso?: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '—' };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
    return {
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  } catch {
    return { date: '—', time: '—' };
  }
}

function getFacialStampIdentity(
  audit: ReturnType<typeof parseFacialBiometricAudit>,
  sessionUser: { id?: string; name?: string; email?: string } | null | undefined
): { fullName: string; loginEmail: string } {
  let fullName = (audit?.identifiedUser?.name || '').trim();
  let loginEmail = (audit?.identifiedUser?.email || '').trim();
  const uid = audit?.identifiedUserId || audit?.identifiedUser?.id || '';
  if (
    sessionUser &&
    uid &&
    String(uid) === String(sessionUser.id) &&
    (!fullName || !loginEmail)
  ) {
    if (!fullName && sessionUser.name) fullName = String(sessionUser.name).trim();
    if (!loginEmail && sessionUser.email) loginEmail = String(sessionUser.email).trim();
  }
  return { fullName, loginEmail };
}

/** Metadados da URI de captura para gravar em `{id}__biometric` (sobrevivem ao upload sem query na URL). */
function facialAuditSnapshotFromCaptureUri(imgUri: string): {
  capturedAt: string;
  captureLat?: string;
  captureLng?: string;
  captureAddr?: string;
} {
  const q = parseMediaUriQuery(imgUri);
  const cap = q.capturedAt ? safeDecodeUriComponent(q.capturedAt) : '';
  const lat = q.lat ? String(q.lat).trim() : '';
  const lng = q.lng ? String(q.lng).trim() : '';
  const addr = q.addr ? safeDecodeUriComponent(q.addr) : '';
  const out: {
    capturedAt: string;
    captureLat?: string;
    captureLng?: string;
    captureAddr?: string;
  } = {
    capturedAt: cap || new Date().toISOString(),
  };
  if (lat && lng) {
    out.captureLat = lat;
    out.captureLng = lng;
  }
  if (addr) out.captureAddr = addr;
  return out;
}

/** GPS/morada na query da URI de captura — mesmo formato que facial/foto carimbada (relatório PDF). */
function visionGeoFieldsFromCaptureUri(uri: string): {
  captureLat?: string;
  captureLng?: string;
  captureAddr?: string;
} {
  const s = facialAuditSnapshotFromCaptureUri(uri);
  const out: { captureLat?: string; captureLng?: string; captureAddr?: string } = {};
  if (s.captureLat && s.captureLng) {
    out.captureLat = s.captureLat;
    out.captureLng = s.captureLng;
  }
  if (s.captureAddr) out.captureAddr = s.captureAddr;
  return out;
}

/** Metadados na URI da captura facial: live, lat, lng, capturedAt (ISO). Morada (`addr`) em segundo plano. */
async function buildFacialCaptureQuerySuffix(): Promise<string> {
  let q = '?live=true';
  q += `&capturedAt=${encodeURIComponent(new Date().toISOString())}`;
  try {
    const loc =
      (await Location.getLastKnownPositionAsync({})) ||
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (loc?.coords) {
      const { latitude, longitude } = loc.coords;
      q += `&lat=${latitude}&lng=${longitude}`;
    }
  } catch {
    /* ignore */
  }
  return q;
}

/**
 * A câmara do ImagePicker grava em cache temporário; ao sair do formulário o SO pode apagar o ficheiro
 * e o rascunho fica com URI morta. Copiamos para `documentDirectory/brspark_facial/` antes de gravar nas respostas.
 */
async function persistFacialCapturePathForDraft(imageUriWithOptionalQuery: string, hintId: string): Promise<string> {
  const full = String(imageUriWithOptionalQuery || '');
  const qIdx = full.indexOf('?');
  const base = qIdx >= 0 ? full.slice(0, qIdx) : full;
  const query = qIdx >= 0 ? full.slice(qIdx) : '';
  if (!base) return full;
  if (base.includes('/brspark_facial/')) return full;

  const root = FileSystem.documentDirectory;
  if (!root) return full;

  const dir = `${root}brspark_facial/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    /* já existe */
  }
  const safe = String(hintId || 'chk').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const dest = `${dir}${safe}_${Date.now()}.jpg`;
  try {
    await FileSystem.copyAsync({ from: base, to: dest });
    return dest + query;
  } catch (e) {
    console.warn('[checklist] persistFacialCapturePathForDraft: copy falhou, mantém URI original', e);
    return full;
  }
}

/** Moldura facial: foto íntegra + rodapé com dados da captura (sem sobrepor o rosto). */
function FacialRecognitionPhotoFrame(props: {
  oneUri: string;
  imageHeight: number;
  success: boolean;
  /** Captura guardada; validação no servidor será feita quando houver rede. */
  pending?: boolean;
  fullName: string;
  loginEmail: string;
  auditAt?: string;
  /** ISO gravado em `{campo}__biometric` quando a URL da foto perde a query `capturedAt`. */
  capturedAtStored?: string;
  /** GPS/morada vindos do JSON `{campo}__biometric` quando a URL já não tem query. */
  captureLat?: string;
  captureLng?: string;
  captureAddr?: string;
}) {
  const q = parseMediaUriQuery(props.oneUri);
  const lat = (props.captureLat && String(props.captureLat).trim()) || q.lat;
  const lng = (props.captureLng && String(props.captureLng).trim()) || q.lng;
  const addrRaw =
    (props.captureAddr && String(props.captureAddr).trim()) ||
    (q.addr ? safeDecodeUriComponent(q.addr) : '');
  const fromUri = q.capturedAt ? safeDecodeUriComponent(q.capturedAt) : '';
  const fromAudit = (props.capturedAtStored && String(props.capturedAtStored).trim()) || '';
  const capturedIso = fromUri || fromAudit;
  const validationIso = props.auditAt ? String(props.auditAt) : '';
  const capFmt = formatIsoDateTimePt(capturedIso);
  const valFmt = formatIsoDateTimePt(validationIso);
  const gpsLine =
    lat && lng
      ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
      : [lat, lng].filter(Boolean).join(' ') || '—';

  const pending = !!props.pending;
  const borderColor = props.success ? '#15803d' : pending ? '#b45309' : '#b91c1c';
  const stampBg = props.success
    ? 'rgba(21, 128, 61, 0.92)'
    : pending
      ? 'rgba(180, 83, 9, 0.92)'
      : 'rgba(185, 28, 28, 0.9)';

  const cleanUri = String(props.oneUri).split('?')[0];

  const stampTitle = props.success
    ? 'RECONHECIMENTO FACIAL, VÁLIDO'
    : pending
      ? 'RECONHECIMENTO FACIAL, PENDENTE'
      : 'RECONHECIMENTO FACIAL, NÃO VALIDADO';

  return (
    <View
      style={{
        width: '100%',
        borderWidth: 8,
        borderColor: borderColor,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 10,
        backgroundColor: '#0f172a',
      }}
    >
      {/* Área só da imagem — nada sobreposta ao rosto */}
      <View style={{ width: '100%', height: props.imageHeight, backgroundColor: '#e2e8f0' }}>
        <Image source={{ uri: cleanUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </View>
      {/* Rodapé contínuo à moldura, abaixo da foto */}
      <View
        style={{
          width: '100%',
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: stampBg,
          borderTopWidth: 2,
          borderTopColor: 'rgba(255,255,255,0.35)',
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontSize: 9,
            fontWeight: '900',
            letterSpacing: 0.6,
            marginBottom: 6,
          }}
        >
          {stampTitle}
        </Text>
        {props.success ? (
          <>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }} numberOfLines={2}>
              {props.fullName || '—'}
            </Text>
            <Text style={{ color: '#fff', fontSize: 10, marginTop: 3, fontWeight: '600' }} numberOfLines={2}>
              Login: {props.loginEmail || '—'}
            </Text>
          </>
        ) : null}
        {pending ? (
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', marginBottom: 4 }} numberOfLines={3}>
            Foto guardada. A validação biométrica corre quando o dispositivo tiver ligação ao servidor.
          </Text>
        ) : null}
        <Text style={{ color: '#fff', fontSize: 10, marginTop: props.success ? 6 : 0, fontWeight: '700' }}>
          Captura:{' '}
          {capturedIso ? `${capFmt.date} · ${capFmt.time}` : '—'}
        </Text>
        <Text style={{ color: '#fff', fontSize: 10, marginTop: 4, fontWeight: '700' }}>
          {pending && !validationIso
            ? 'Validação: pendente (assíncrona no servidor)'
            : validationIso
              ? `Validação: ${valFmt.date} · ${valFmt.time}`
              : 'Validação: —'}
        </Text>
        <Text style={{ color: '#fff', fontSize: 9, marginTop: 3 }} numberOfLines={2}>
          GPS: {gpsLine}
        </Text>
        <Text style={{ color: '#fff', fontSize: 9, marginTop: 2, lineHeight: 13 }} numberOfLines={6}>
          {addrRaw ? `Endereço: ${addrRaw}` : 'Endereço: —'}
        </Text>
      </View>
    </View>
  );
}

function normalizeMediaCaptions(field: any, raw: any, mediaCount: number): string[] {
  if (mediaCount <= 0) return [];
  if (!fieldAllowsMultiple(field)) {
    const s =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw) && raw[0] != null
          ? String(raw[0])
          : '';
    return [s];
  }
  const base = Array.isArray(raw)
    ? raw.map((x) => (x == null ? '' : String(x)))
    : typeof raw === 'string'
      ? [raw]
      : [];
  const out = [...base];
  while (out.length < mediaCount) out.push('');
  if (out.length > mediaCount) out.length = mediaCount;
  return out;
}

function getMediaCaptionAt(field: any, responses: Record<string, any>, index: number): string {
  const ck = mediaCaptionStorageKey(field.id);
  const raw = responses[ck];
  if (!fieldAllowsMultiple(field)) {
    if (index !== 0) return '';
    return typeof raw === 'string' ? raw : '';
  }
  const arr = Array.isArray(raw)
    ? raw.map((x) => (x == null ? '' : String(x)))
    : typeof raw === 'string'
      ? [raw]
      : [];
  return arr[index] != null ? String(arr[index]) : '';
}

function getMediaCaptionAtScoped(
  field: any,
  responses: Record<string, any>,
  scope: SectionRepeatScope | null | undefined,
  index: number
): string {
  if (!scope) return getMediaCaptionAt(field, responses, index);
  const ck = mediaCaptionStorageKey(field.id);
  const rows = getRepeatRows(responses, scope.sectionId);
  const row = rows[scope.rowIndex];
  const synthetic: Record<string, any> = {};
  if (row && typeof row === 'object' && ck in row) synthetic[ck] = row[ck];
  return getMediaCaptionAt(field, synthetic, index);
}

function shapeMediaCaptionStored(field: any, captions: string[]): string | string[] {
  if (captions.length === 0) {
    return fieldAllowsMultiple(field) ? [] : '';
  }
  if (!fieldAllowsMultiple(field)) {
    return captions[0] ?? '';
  }
  return captions;
}

function multiMinItems(field: any): number {
  if (!fieldAllowsMultiple(field)) return field?.required ? 1 : 0;
  const raw = field.minItems;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const m = parseInt(String(raw), 10);
    if (Number.isFinite(m) && m >= 0) return field.required ? Math.max(m, 1) : m;
  }
  return field.required ? 1 : 0;
}

function multiMaxItems(field: any): number | null {
  if (!fieldAllowsMultiple(field)) return null;
  const raw = field.maxItems;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const m = parseInt(String(raw), 10);
  if (Number.isFinite(m) && m > 0) return m;
  return null;
}

function normalizeResponseArray(raw: any): any[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return [...raw];
  return [raw];
}

function isMultiItemFilled(val: any, fieldType: string): boolean {
  if (val === undefined || val === null) return false;
  if (fieldType === 'lookup_select') return String(val ?? '').trim() !== '';
  if (fieldType === 'opinion_scale') {
    const s = String(val ?? '').trim();
    if (!s) return false;
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 && n <= 10;
  }
  if (fieldType === 'image_annotation') return isImageAnnotationAnswerFilled(val);
  if (fieldType === 'repeatable_matrix') {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
    return Object.keys(val as object).some((k) => {
      const v = (val as Record<string, unknown>)[k];
      if (v === true || v === false) return true;
      return v != null && String(v).trim() !== '';
    });
  }
  if (fieldType === 'location_pick') return isLocationPickAnswerValid(val);
  if (fieldType === 'geofence_check') {
    try {
      const j = typeof val === 'string' ? JSON.parse(val || '{}') : val;
      return !!(j && (j.insideZone === true || j.geofence?.insideZone === true));
    } catch {
      return false;
    }
  }
  if (fieldType === 'multiselect' && typeof val === 'string') {
    return val.split(',').some((s) => s.trim() !== '');
  }
  if ((fieldType === 'signature' || fieldType === 'signature_summary') && typeof val === 'string') {
    return val.trim() !== '' && (val.startsWith('SIG_V1|') || val.length > 8);
  }
  if (typeof val === 'string') return val.trim() !== '';
  if (typeof val === 'number') return Number.isFinite(val);
  if (typeof val === 'boolean') return true;
  return true;
}

/** Símbolo exibido no acessório iOS do campo moeda (schema: currencyCode). */
function checklistCurrencySymbol(field: any): string {
  const c = String(field?.currencyCode || 'BRL').toUpperCase();
  if (c === 'USD') return '$';
  if (c === 'EUR') return '€';
  if (c === 'GBP') return '£';
  return 'R$';
}

function parseJsonMatrixRows(raw: unknown): Record<string, unknown>[] {
  if (raw === undefined || raw === null) return [];
  let v: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[];
}

function matrixColumnIdsFromField(field: any): string[] {
  const mc = field?.matrixColumns;
  if (!Array.isArray(mc) || !mc.length) return ['c1', 'c2'];
  return mc
    .map((c: any, i: number) => String(c?.id || `c${i + 1}`).trim() || `c${i + 1}`)
    .slice(0, 8);
}

function matrixColumnsMetaForSignatureSummary(field: any): {
  id: string;
  label: string;
  cellType: 'text' | 'number' | 'yes_no';
}[] {
  const mc = field?.matrixColumns;
  if (!Array.isArray(mc) || !mc.length) {
    return [
      { id: 'c1', label: 'Item', cellType: 'text' },
      { id: 'c2', label: 'Valor', cellType: 'number' },
    ];
  }
  return mc
    .map((c: any, i: number) => {
      const id = String(c?.id || `c${i + 1}`).trim() || `c${i + 1}`;
      const label = String(c?.label || id).trim() || id;
      const ct = String(c?.cellType || 'text').toLowerCase();
      const cellType: 'text' | 'number' | 'yes_no' =
        ct === 'number' || ct === 'yes_no' ? (ct as 'number' | 'yes_no') : 'text';
      return { id, label, cellType };
    })
    .slice(0, 8);
}

function formatRepeatableMatrixForSignatureSummary(fieldDef: any, raw: unknown): string {
  const rows = parseJsonMatrixRows(raw);
  if (!rows.length) return '—';
  const cols = matrixColumnsMetaForSignatureSummary(fieldDef);
  const out: string[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const parts: string[] = [];
    for (const c of cols) {
      const v = row[c.id];
      let cell: string;
      if (c.cellType === 'yes_no') {
        const on = v === true || String(v).toLowerCase() === 'sim' || String(v).toLowerCase() === 'true';
        const off =
          v === false ||
          String(v).toLowerCase() === 'não' ||
          String(v).toLowerCase() === 'nao' ||
          String(v).toLowerCase() === 'false';
        if (on) cell = 'Sim';
        else if (off) cell = 'Não';
        else cell = '';
      } else {
        cell = v != null ? String(v).trim() : '';
      }
      if (cell !== '') parts.push(`${c.label}: ${cell}`);
    }
    if (parts.length) out.push(`Linha ${ri + 1}: ${parts.join(' · ')}`);
  }
  return out.length ? out.join('\n') : '—';
}

function rowObjectHasAnyCell(row: Record<string, unknown>, colIds: string[]): boolean {
  for (const id of colIds) {
    const val = row[id];
    if (val === true || val === false) return true;
    if (val != null && String(val).trim() !== '') return true;
  }
  return false;
}

function isRepeatableMatrixAnswerFilled(raw: unknown, field: any): boolean {
  const required = !!field?.required;
  const minR = (() => {
    const n = parseInt(String(field?.matrixMinRows ?? '0'), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();
  const rows = parseJsonMatrixRows(raw);
  if (rows.length < minR) return false;
  if (rows.length === 0) {
    if (minR > 0) return false;
    return !required;
  }
  const colIds = matrixColumnIdsFromField(field);
  return rows.every((r) => rowObjectHasAnyCell(r, colIds));
}

function isImageAnnotationAnswerFilled(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  let o: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      o = JSON.parse(raw);
    } catch {
      return false;
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const uri = String((o as Record<string, unknown>).imageUri || (o as Record<string, unknown>).uri || '').trim();
  return !!uri;
}

function isOpinionScaleValueFilled(raw: unknown, field: any): boolean {
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim();
  if (!s) return false;
  const mode = String(field?.opinionScaleMode || 'nps').toLowerCase() === 'likert' ? 'likert' : 'nps';
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return false;
  if (mode === 'likert') return n >= 1 && n <= 5;
  return n >= 0 && n <= 10;
}

/** Resposta suficiente para obrigatório / min / max (campos simples ou múltiplos). */
function isFieldAnswerFilled(field: any, raw: any): boolean {
  const ft = effectiveSchemaFieldType(field);
  if (ft === 'leitura' || ft === 'form_complete_button') return true;
  if (ft === 'voice_note') {
    if (!field.required) return true;
    return voiceNoteValueIsFilled(raw);
  }
  if (isVisionSimNaoMediaFieldType(ft)) {
    const o = parseVisionChecklistStored(raw);
    if (!o) return false;
    const st = String(o.status || '').toLowerCase();
    if (st === 'completed') {
      if (!Array.isArray(o.answers) || !o.answers.length) return false;
      const nq = getVisionQuestionsFromField(field).length;
      if (nq > 0 && o.answers.length < nq) return false;
      return true;
    }
    if (st === VISION_STATUS_PENDING_ANALYSIS && visionStoredHasRunnableMedia(field, o)) {
      return true;
    }
    return false;
  }
  if (!fieldAllowsMultiple(field)) {
    if (ft === 'geofence_check') {
      if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        return false;
      }
      try {
        const j = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        const inside = !!(j && (j.insideZone === true || j.geofence?.insideZone === true));
        if (inside) return true;
        const mode = normalizeGeofenceFailMode(field?.geofenceFailMode);
        if (j?.geofence?.validated === true) {
          if (mode === 'allow_warn' || mode === 'record_only') return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    if (ft === 'location_pick') return isLocationPickAnswerValid(raw);
    if (ft === 'lookup_select') return String(raw ?? '').trim() !== '';
    if (ft === 'opinion_scale') return isOpinionScaleValueFilled(raw, field);
    if (ft === 'image_annotation') return isImageAnnotationAnswerFilled(raw);
    if (ft === 'repeatable_matrix') return isRepeatableMatrixAnswerFilled(raw, field);
    if (ft === 'materials_consumption') {
      const p = parseMaterialsValue(raw);
      const hasQty = p.lines.some((l) => l.qty > 0);
      if (field.required) return hasQty;
      return true;
    }
    if (ft === 'materials_receipt') {
      return materialsReceiptFieldIsComplete(raw, !!field.required);
    }
    if (ft === 'technician_finance_revenue') {
      return technicianRevenueFieldIsComplete(raw, !!field.required);
    }
    if (ft === 'technician_finance_expense') {
      const p = parseTechnicianFinanceValue(raw);
      const hasAmt = p.lines.some((l) => l.amount > 0);
      if (field.required) return hasAmt;
      return true;
    }
    if (ft === 'signature' || ft === 'signature_summary') {
      if (typeof raw !== 'string') return false;
      return raw.trim() !== '' && (raw.startsWith('SIG_V1|') || raw.length > 8);
    }
    if (raw === undefined || raw === null) return false;
    if (typeof raw === 'string') return raw.trim() !== '';
    if (typeof raw === 'number') return Number.isFinite(raw);
    return true;
  }
  const arr = normalizeResponseArray(raw);
  const min = multiMinItems(field);
  const filled = arr.filter((x) => isMultiItemFilled(x, ft));
  if (filled.length < min) return false;
  const max = multiMaxItems(field);
  if (max != null && arr.length > max) return false;
  if (field.required && filled.length < 1) return false;
  return true;
}

function normalizeEtaMinutes(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

/**
 * Par [a,b] vindo de polígono: pode ser GeoJSON [lng,lat] ou legado [lat,lng].
 * Heurística para BR: se o 1.º valor parece longitude e o 2.º latitude, troca.
 */
function normalizePolygonPairToLatLng(a: number, b: number): [number, number] {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [a, b];
  const firstLooksLng = a <= -20 && a >= -80;
  const secondLooksLat = b >= -35 && b <= 15;
  if (firstLooksLng && secondLooksLat) return [b, a];
  return [a, b];
}

/** Normaliza modos de falha da cerca (legacy `warn` → allow_warn). */
function normalizeGeofenceFailMode(raw: unknown): 'block' | 'allow_warn' | 'record_only' {
  const s = String(raw || 'block').toLowerCase();
  if (s === 'warn' || s === 'allow_warn') return 'allow_warn';
  if (s === 'record_only') return 'record_only';
  return 'block';
}

/** Destino para OSRM: raiz da execução ou primeiro ponto do polígono/rota */
function getDestFromTaskLike(task: any): { lat: number; lng: number } | null {
  if (!task || typeof task !== 'object') return null;
  const zt = String(task.locationZoneType || '').toLowerCase();
  const meta =
    task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata)
      ? task.metadata
      : {};
  /** Despacho: destino de navegação explícito (ponto separado do KML de validação). */
  const navDest = (meta as { navigationDestination?: { kind?: string; lat?: unknown; lng?: unknown } })
    .navigationDestination;
  if (navDest?.kind === 'point') {
    const la = parseFloat(String(navDest.lat ?? '').replace(',', '.'));
    const ln = parseFloat(String(navDest.lng ?? '').replace(',', '.'));
    if (
      Number.isFinite(la) &&
      Number.isFinite(ln) &&
      la >= -90 &&
      la <= 90 &&
      ln >= -180 &&
      ln <= 180
    ) {
      return { lat: la, lng: ln };
    }
  }
  if (zt === 'segment' && (meta.transitSegmentDestination === 'A' || meta.transitSegmentDestination === 'B')) {
    let poly: any = task.locationPolygon ?? meta.locationPolygon;
    if (typeof poly === 'string') {
      try {
        poly = JSON.parse(poly);
      } catch {
        poly = null;
      }
    }
    if (Array.isArray(poly) && poly.length >= 2) {
      const idx = meta.transitSegmentDestination === 'B' ? 1 : 0;
      const p0 = poly[idx];
      let la: number;
      let ln: number;
      if (Array.isArray(p0)) {
        la = parseFloat(String(p0[0]));
        ln = parseFloat(String(p0[1]));
        [la, ln] = normalizePolygonPairToLatLng(la, ln);
      } else if (p0 && typeof p0 === 'object') {
        la = parseFloat(String((p0 as any).lat));
        ln = parseFloat(String((p0 as any).lng ?? (p0 as any).lon));
      } else {
        la = NaN;
        ln = NaN;
      }
      if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
    }
  }
  const lat0 = task.locationLat ?? task.metadata?.locationLat;
  const lng0 = task.locationLng ?? task.metadata?.locationLng;
  const latN = typeof lat0 === 'number' && Number.isFinite(lat0) ? lat0 : parseFloat(String(lat0 ?? '').trim().replace(',', '.'));
  const lngN = typeof lng0 === 'number' && Number.isFinite(lng0) ? lng0 : parseFloat(String(lng0 ?? '').trim().replace(',', '.'));
  if (
    Number.isFinite(latN) &&
    Number.isFinite(lngN) &&
    latN >= -90 &&
    latN <= 90 &&
    lngN >= -180 &&
    lngN <= 180
  ) {
    return { lat: latN, lng: lngN };
  }
  let poly = task.locationPolygon ?? task.metadata?.locationPolygon;
  if (typeof poly === 'string') {
    try {
      poly = JSON.parse(poly);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(poly) || poly.length === 0) return null;
  const p0 = poly[0];
  let la: number;
  let ln: number;
  if (Array.isArray(p0)) {
    la = parseFloat(String(p0[0]));
    ln = parseFloat(String(p0[1]));
    [la, ln] = normalizePolygonPairToLatLng(la, ln);
  } else if (p0 && typeof p0 === 'object') {
    la = parseFloat(String((p0 as any).lat));
    ln = parseFloat(String((p0 as any).lng ?? (p0 as any).lon));
  } else {
    return null;
  }
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return { lat: la, lng: ln };
}

/** Mesma geometria que o mapa ao vivo (`liveRouteCoordsForMap`) — para OSRM na saída. */
function buildRouteCoordsFromTask(task: any): number[][] {
  const rawPoly = task?.locationPolygon;
  const zt = task?.locationZoneType;
  if ((zt !== 'route' && zt !== 'segment' && zt !== 'polygon') || !rawPoly) return [];
  let parsed: any = typeof rawPoly === 'string' ? null : rawPoly;
  if (!parsed) {
    try {
      parsed = JSON.parse(rawPoly as string);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  if (zt === 'polygon' && parsed.length < 3) return [];
  if ((zt === 'route' || zt === 'segment') && parsed.length < 2) return [];
  return parsed.map((pt: any) => {
    if (Array.isArray(pt)) {
      const a = parseFloat(pt[0]);
      const b = parseFloat(pt[1]);
      return normalizePolygonPairToLatLng(a, b);
    }
    return pt.lat !== undefined ? [parseFloat(pt.lat), parseFloat(pt.lng)] : pt;
  });
}

/** Modo de visualização dentro da etapa (definido no separador de seção no builder). */
function normalizeSectionFillMode(v: any): 'inherit' | 'list' | 'wizard' {
  if (v === 'list' || v === 'wizard') return v;
  return 'inherit';
}

function resolvePageInnerMode(
  page: { sectionFillMode?: string } | null | undefined,
  globalFill: 'full' | 'wizard' | 'hybrid'
): 'list' | 'wizard' {
  const m = normalizeSectionFillMode(page?.sectionFillMode);
  if (m === 'list') return 'list';
  if (m === 'wizard') return 'wizard';
  return globalFill === 'wizard' ? 'wizard' : 'list';
}

function renderSchemaIcon(spec: { icon?: string; iconLibrary?: string; iconColor?: string }, size = 22) {
  const name = String(spec?.icon || '').trim() as any;
  if (!name) return null;
  const lib = String(spec?.iconLibrary || 'Ionicons').trim();
  const color = String(spec?.iconColor || '#64748b').trim() || '#64748b';
  switch (lib) {
    case 'AntDesign':
      return <AntDesign name={name} size={size} color={color} />;
    case 'Entypo':
      return <Entypo name={name} size={size} color={color} />;
    case 'Feather':
      return <Feather name={name} size={size} color={color} />;
    case 'FontAwesome':
      return <FontAwesome name={name} size={size} color={color} />;
    case 'FontAwesome5':
      return <FontAwesome5 name={name} size={size} color={color} />;
    case 'Foundation':
      return <Foundation name={name} size={size} color={color} />;
    case 'MaterialIcons':
      return <MaterialIcons name={name} size={size} color={color} />;
    case 'MaterialCommunityIcons':
      return <MaterialCommunityIcons name={name} size={size} color={color} />;
    case 'Octicons':
      return <Octicons name={name} size={size} color={color} />;
    case 'Ionicons':
    default:
      return <Ionicons name={name} size={size} color={color} />;
  }
}

/** Ícone à direita do rótulo no botão «concluir» do schema — respeita ícone do builder; senão usa checkmark-done. */
function renderFormCompleteButtonGlyph(
  field: { icon?: string; iconLibrary?: string; iconColor?: string },
  size = 22,
  onPrimaryBackground = true
) {
  if (String(field?.icon || '').trim()) {
    const color = onPrimaryBackground ? '#FFFFFF' : String(field.iconColor || '#64748b').trim() || '#64748b';
    return renderSchemaIcon(
      { icon: field.icon, iconLibrary: field.iconLibrary, iconColor: color },
      size
    );
  }
  return <Ionicons name="checkmark-done" size={size} color={onPrimaryBackground ? '#FFF' : '#64748b'} />;
}

/**
 * Modo global no app: se todas as seções estão em "inherit", usa settings.appFillMode (legado).
 * Caso contrário: scroll único quando todas são lista; híbrido se alguma seção for assistente.
 */
function computeEffectiveFillModeFromTemplate(
  schema: any[],
  settings: any
): 'full' | 'wizard' | 'hybrid' {
  const breaks = (schema || []).filter((f: any) => f.type === 'section_break');
  const allInherit = breaks.every(
    (f: any) => !f.sectionFillMode || f.sectionFillMode === 'inherit'
  );
  if (allInherit) {
    const raw = settings?.appFillMode;
    if (raw === 'wizard' || raw === 'hybrid') return raw;
    return 'full';
  }
  return breaks.some((f: any) => f.sectionFillMode === 'wizard') ? 'hybrid' : 'full';
}

/** Raio da cerca global (builder / painel: típico 10–50000 m). */
function clampGlobalGeofenceRadiusMeters(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 10) return 200;
  return Math.min(Math.floor(n), 50000);
}

/** Destino OU geometria na OS — necessário para validar cerca global (OR). */
function taskHasServiceLocationForGlobalGate(t: any): boolean {
  return !!resolveGlobalFenceDestinationCoords(t) || taskHasGeometryForGlobalGate(t);
}

/**
 * OS + cerca global: `locationZoneType` = combined; destino (metadata.navigationDestination ou lat/lng)
 * e geometria (se existir) em `metadata.globalGeofence`. Validação: dentro do raio do destino OU dentro da geometria.
 */
function buildGlobalGeofenceMapTask(task: any, globalRadiusMeters: number): any {
  const r = clampGlobalGeofenceRadiusMeters(globalRadiusMeters);
  const dest = resolveGlobalFenceDestinationCoords(task);
  let poly: any = null;
  try {
    if (task?.locationPolygon != null) {
      poly = typeof task.locationPolygon === 'string' ? JSON.parse(task.locationPolygon) : task.locationPolygon;
    }
  } catch {
    poly = null;
  }
  const ztRaw = String(task?.locationZoneType || '').toLowerCase();
  let zone: string =
    ztRaw === 'route' || ztRaw === 'segment' || ztRaw === 'polygon' ? ztRaw : 'radius';
  if (!ztRaw || ztRaw === 'none') {
    if (Array.isArray(poly) && poly.length >= 3) zone = 'polygon';
    else if (Array.isArray(poly) && poly.length === 2) zone = 'segment';
    else if (task?.locationLat != null && task?.locationLng != null) zone = 'radius';
    else zone = 'radius';
  }

  const hasGeom =
    Array.isArray(poly) &&
    ((zone === 'polygon' && poly.length >= 3) ||
      (zone === 'route' && poly.length >= 2) ||
      (zone === 'segment' && poly.length >= 2));

  const geometry = hasGeom
    ? {
        zoneType: zone,
        locationLat: task.locationLat,
        locationLng: task.locationLng,
        locationRadius:
          task.locationRadius != null && Number.isFinite(Number(task.locationRadius))
            ? Number(task.locationRadius)
            : r,
        locationPolygon: poly,
      }
    : null;

  const centerLat =
    dest?.lat ??
    (task?.locationLat != null && Number.isFinite(Number(task.locationLat))
      ? Number(task.locationLat)
      : poly?.[0]?.[0] != null
        ? Number(poly[0][0])
        : null);
  const centerLng =
    dest?.lng ??
    (task?.locationLng != null && Number.isFinite(Number(task.locationLng))
      ? Number(task.locationLng)
      : poly?.[0]?.[1] != null
        ? Number(poly[0][1])
        : null);

  return {
    ...task,
    locationZoneType: 'combined',
    locationLat: centerLat,
    locationLng: centerLng,
    locationRadius: r,
    metadata: {
      ...(typeof task.metadata === 'object' && task.metadata ? task.metadata : {}),
      globalGeofence: {
        destination: dest,
        destinationRadiusM: r,
        geometry,
      },
    },
  };
}

/**
 * Revestido do quadrado 44px ao lado de cada atividade: fundo e borda alinhados à semântica
 * (pend. / andam. / concl. / pausa) — a cor do ícone do builder passa a ser só no glifo (renderSchemaIcon), inalterada.
 */
function activityFieldIconBadgeByExecutionStatus(
  p: {
    isReadOnly: boolean;
    taskStatus: string;
    serverPaused: boolean;
    formPaused: boolean;
  },
  P: ColorPalette
): { backgroundColor: string; borderColor: string } {
  if (p.isReadOnly) {
    return { backgroundColor: P.status.success.bg, borderColor: P.status.success.border };
  }
  const s = (p.taskStatus || '').toUpperCase();
  const isPaused = p.serverPaused || p.formPaused || s === 'PAUSED';
  if (isPaused) {
    return { backgroundColor: P.status.danger.bg, borderColor: P.status.danger.border };
  }
  if (
    s === 'COMPLETED' ||
    s === 'SYNCED' ||
    s === 'CLOSED' ||
    s === 'ARCHIVED' ||
    s === 'CANCELLED' ||
    s === 'CANCELED' ||
    s === 'DONE'
  ) {
    return { backgroundColor: P.status.success.bg, borderColor: P.status.success.border };
  }
  if (s === 'IN_PROGRESS' || s === 'RECEIVED' || s === 'ACCEPTED' || s === 'DISPATCHED') {
    return { backgroundColor: P.status.warning.bg, borderColor: P.status.warning.border };
  }
  // PENDENTE / vazio
  return { backgroundColor: P.status.info.bg, borderColor: P.status.info.border };
}

export default function ChecklistEngine() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { id, taskId, routineTask, rtNumber } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: C, dark: themeDark } = useTheme();
  const styles = useMemo(() => createChecklistStyles(C), [C]);

  const [template, setTemplate] = useState<any>(null);
  const [responses, setResponses] = useState<any>({});
  const responsesForPauseExitRef = useRef(responses);
  responsesForPauseExitRef.current = responses;
  /** Atualizado a cada render e de forma síncrona em `handleInput` — usado por flush facial e por `submitExecution`. */
  const responsesRefForFacial = useRef(responses);
  const templateRefForFacial = useRef(template);
  /** Preenchimento assíncrono de morada em URIs de foto (`processFacialImage` vem antes da definição de `handleInput`). */
  const handleInputRef = useRef<
    ((fieldId: string, value: any, scope?: SectionRepeatScope | null) => void) | null
  >(null);
  responsesRefForFacial.current = responses;
  templateRefForFacial.current = template;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  /** Campo em que está a correr captura GPS (transit / geofence) — UI de loading e anti duplo toque. */
  const [gpsBusyFieldId, setGpsBusyFieldId] = useState<string | null>(null);
  const gpsCaptureLockRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [wizardIndex, setWizardIndex] = useState(0);
  /** Dentro de uma etapa em modo híbrido com "um campo de cada vez" só nessa etapa */
  const [hybridInnerWizardIndex, setHybridInnerWizardIndex] = useState(0);
  /** Menu de etapas (settings.appSectionStart === 'hub') antes de entrar numa seção */
  const [hubPicking, setHubPicking] = useState(false);
  /** Hub: expandir/recolher rodapé de instâncias por seção repetível. */
  const [hubRepeatCardsExpanded, setHubRepeatCardsExpanded] = useState<Record<string, boolean>>({});
  /** Hub: instância selecionada por seção repetível ao entrar na etapa. */
  const [hubSelectedRepeatRowBySection, setHubSelectedRepeatRowBySection] = useState<Record<string, number>>({});
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Geofence map state (Opção B)
  const [showGeoMap, setShowGeoMap]         = useState(false);
  /** Segunda etapa: cerca global do template (sempre failMode block no ecrã). */
  const [showGlobalGeofenceMap, setShowGlobalGeofenceMap] = useState(false);
  const [globalGeofenceMapTask, setGlobalGeofenceMapTask] = useState<any>(null);
  const pendingGlobalGeofenceAfterRouteRef = useRef(false);
  const globalGeofenceRadiusForNextGateRef = useRef(200);
  const [currentTask, setCurrentTask]       = useState<any>(null);
  /** ETA mostrado no mapa — independente de currentTask, para não ficar preso a `if (!prev) return prev` */
  const [mapEtaMinutes, setMapEtaMinutes]   = useState<number | null>(null);
  /** Deslocamento operacional: até N invocações Google (proxy) por trecho; snapshot para contagem no relógio. */
  const transitEtaLegKeyRef = useRef('');
  const transitEtaGoogleInvocationsRef = useRef(0);
  const transitEtaSnapshotRef = useRef<{ atMs: number; remainingMin: number } | null>(null);
  /** Para enviar `clear` ao servidor uma vez ao sair do deslocamento operacional (link público). */
  const prevHadOperationalTransitRef = useRef(false);
  const publicEtaPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTaskRef = useRef<any>(null);
  const [geoMapChecked, setGeoMapChecked]   = useState(false);
  const [geofenceFailMode, setGeofenceFailMode] = useState<'block' | 'warn'>('warn');
  /** Último estado dentro/fora da zona por campo (transições → telemetria). */
  const geofencePrevInsideRef = useRef<Record<string, boolean>>({});
  /** Revalidação automática após bloqueio com «voltar à zona». */
  const [geofenceUnblockCtx, setGeofenceUnblockCtx] = useState<{
    fieldId: string;
    scope: SectionRepeatScope | null;
  } | null>(null);
  const [segmentDestModal, setSegmentDestModal] = useState<{
    fieldId: string;
    scope: SectionRepeatScope | null;
    pointA: { lat: number; lng: number };
    pointB: { lat: number; lng: number };
  } | null>(null);

  /** Leitor de código de barras / QR no campo `barcode_scan` (expo-camera). */
  const [checklistBarcodeModalOpen, setChecklistBarcodeModalOpen] = useState(false);
  const checklistBarcodeTargetRef = useRef<{
    fieldId: string;
    scope: SectionRepeatScope | null;
  } | null>(null);
  const barcodeScanLockRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // -- Novo Estado de Webhook API --
  const [validatingFieldId, setValidatingFieldId] = useState<string|null>(null);
  const [visionAnalyzeBusyId, setVisionAnalyzeBusyId] = useState<string | null>(null);
  const [visionGridCompose, setVisionGridCompose] = useState<{
    uris: string[];
    cols: number;
    rows: number;
    field: any;
    scope: SectionRepeatScope | null;
    slotUrisForPersist: string[];
  } | null>(null);
  // Live route map state (após Iniciar Deslocamento)
  const [showLiveMap, setShowLiveMap]       = useState(false);
  /** Seção repetível onde foi "Iniciar deslocamento" — o mapa finaliza com o mesmo scope. */
  const lastTransitScopeRef = useRef<SectionRepeatScope | null>(null);
  // Tracking share link state
  const [trackingUrl, setTrackingUrl]       = useState<string|null>(null);

  const [sigModalVisible, setSigModalVisible] = useState(false);
  /** Indicador no ícone: mensagem do gestor mais recente que a última leitura no app. */
  const [opsChatGestorBadge, setOpsChatGestorBadge] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [currentSigField, setCurrentSigField] = useState<string|null>(null);
  const [currentSigScope, setCurrentSigScope] = useState<SectionRepeatScope | null>(null);
  const [currentStrokeState, setCurrentStrokeState] = useState<string>('');
  const currentStrokeRef = React.useRef<string>('');
  const [completedStrokes, setCompletedStrokes] = useState<string[]>([]);

  const resolvedTaskId =
    typeof taskId === 'string' ? taskId : Array.isArray(taskId) ? taskId[0] : String(taskId || '');

  const flushPublicTransitEtaDisplayNow = useCallback(
    (minutes: number | null) => {
      if (!resolvedTaskId || isReadOnly) return;
      if (publicEtaPushTimerRef.current) {
        clearTimeout(publicEtaPushTimerRef.current);
        publicEtaPushTimerRef.current = null;
      }
      const path = `/api/checklists/executions/${encodeURIComponent(String(resolvedTaskId))}/transit-eta-display`;
      if (minutes == null || !Number.isFinite(minutes)) {
        void apiFetch(path, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clear: true }),
        });
        return;
      }
      const atMs = Date.now();
      void apiFetch(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotAt: new Date(atMs).toISOString(),
          remainingMinutes: Math.max(1, Math.round(minutes)),
        }),
      });
    },
    [resolvedTaskId, isReadOnly]
  );

  const commitPublicTrackingEtaFromBadge = useCallback(
    (minutes: number | null) => {
      if (!resolvedTaskId || isReadOnly) return;
      if (publicEtaPushTimerRef.current) clearTimeout(publicEtaPushTimerRef.current);
      publicEtaPushTimerRef.current = setTimeout(() => {
        publicEtaPushTimerRef.current = null;
        flushPublicTransitEtaDisplayNow(minutes);
      }, 450);
    },
    [resolvedTaskId, isReadOnly, flushPublicTransitEtaDisplayNow]
  );

  const resolvedRtNumber =
    typeof rtNumber === 'string'
      ? rtNumber
      : Array.isArray(rtNumber)
        ? String(rtNumber[0] || '')
        : String(rtNumber || '');
  const routineTaskFlag =
    String(Array.isArray(routineTask) ? routineTask[0] : routineTask || '') === '1';
  const isRoutineTaskFlow = routineTaskFlag && !!resolvedTaskId;

  /** Mapa consultivo: mesma construção que o gate de cerca global (destino ∪ geometria). */
  const globalFenceConsultTask = useMemo(() => {
    if (!template?.settings?.requireGlobalGeofence || !currentTask || isReadOnly || isRoutineTaskFlow) {
      return null;
    }
    return buildGlobalGeofenceMapTask(
      currentTask,
      clampGlobalGeofenceRadiusMeters(template.settings.globalGeofenceRadius),
    );
  }, [
    template?.settings?.requireGlobalGeofence,
    template?.settings?.globalGeofenceRadius,
    currentTask,
    isReadOnly,
    isRoutineTaskFlow,
  ]);

  /** `runVisionChecklistAnalyze` usa `[]` em deps — refs para PATCH pós-análise em modo só leitura. */
  const visionPatchAfterAnalyzeRef = useRef({ isReadOnly: false, taskId: '' as string });
  useEffect(() => {
    visionPatchAfterAnalyzeRef.current = {
      isReadOnly: !!isReadOnly,
      taskId: resolvedTaskId ? String(resolvedTaskId) : '',
    };
  }, [isReadOnly, resolvedTaskId]);

  useEffect(() => {
    const tid = String(resolvedTaskId || '').trim();
    if (!tid) {
      setOpsChatGestorBadge(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const viewerLoc = user?.preferredChatLocale?.trim() || i18n.language || null;
        const msgs = await fetchExecutionOpsChat(tid, viewerLoc);
        if (cancelled) return;
        const ackStr = await AsyncStorage.getItem(getOpsChatAckStorageKey(tid));
        const ack = ackStr ? Number(ackStr) : 0;
        const hasGestorNew = msgs.some((m) => {
          if (String(m.senderKind).toUpperCase() !== 'GESTOR') return false;
          const ts = new Date(m.createdAt).getTime();
          return Number.isFinite(ts) && ts > ack;
        });
        setOpsChatGestorBadge(hasGestorNew);
      } catch {
        if (!cancelled) setOpsChatGestorBadge(false);
      }
    };
    void run();
    const iv = setInterval(run, 12000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [resolvedTaskId, user?.preferredChatLocale, i18n.language]);

  const [ruleTick, setRuleTick] = useState(0);
  const fgSegmentStartRef = useRef<number | null>(null);
  /** Próximo número de revisão a enviar em POST /executions (lastSubmittedRevision + 1). */
  const nextSubmissionRevisionRef = useRef(1);
  /** Pausa de sessão ou pausa imposta pelo servidor — não contar tempo em foco. */
  const timersFrozenRef = useRef(false);
  /** Etapa com segmento de cronômetro aberto (no hub/menu deve ficar null). */
  const activeSectionTimingIdRef = useRef<string | null>(null);

  const [serverPausedExecution, setServerPausedExecution] = useState(false);
  const [pauseReasonModalVisible, setPauseReasonModalVisible] = useState(false);
  const [pausePickerStep, setPausePickerStep] = useState<'category' | 'sub'>('category');
  const [pauseSelectedCategory, setPauseSelectedCategory] = useState<PauseCategoryDef | null>(null);
  const [pauseDetailDraft, setPauseDetailDraft] = useState('');
  const [pauseHighlightSubId, setPauseHighlightSubId] = useState<string | null>(null);
  /** Evita dois Alert seguidos ao premir o mesmo fluxo duas vezes muito rápido. */
  const pauseExitAlertGateRef = useRef(0);
  /**
   * Após confirmar "Sair da OS", o router.back() dispara beforeRemove com __form_paused_since ainda true
   * (o estado só limpa depois). Sem isto, o listener mostrava o mesmo Alert outra vez.
   */
  const pauseExitBypassBeforeRemoveUntilRef = useRef(0);

  useEffect(() => {
    if (loading || isReadOnly) return;
    const idInt = setInterval(() => setRuleTick((x) => x + 1), 1000);
    return () => clearInterval(idInt);
  }, [loading, isReadOnly]);

  const draftKeyForForm = resolvedTaskId ? `@draft_tsk_${resolvedTaskId}` : `@draft_chk_${typeof id === 'string' ? id : Array.isArray(id) ? id[0] : String(id || '')}`;

  const flushActiveSectionSegmentToDraft = useCallback(() => {
    const sectionId = activeSectionTimingIdRef.current;
    if (!sectionId) return;
    const current = responsesRefForFacial.current;
    if (!current || typeof current !== 'object') return;
    const keys = getSectionTimingKeys(sectionId);
    const segStartRaw = current[keys.activeStart];
    if (!segStartRaw) {
      activeSectionTimingIdRef.current = null;
      return;
    }
    const nowMs = Date.now();
    const segStartMs = Date.parse(String(segStartRaw));
    let next = current as Record<string, any>;
    if (!Number.isFinite(segStartMs) || nowMs <= segStartMs) {
      next = { ...next, [keys.activeStart]: null };
    } else {
      let segSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      for (const ev of parsePauseHistory(next)) {
        const w = pauseEventWindowMs(ev);
        if (w) segSec -= overlapSeconds(segStartMs, nowMs, w.start, w.end);
      }
      const since = next.__form_paused_since;
      if (since) {
        const pt = Date.parse(String(since));
        if (Number.isFinite(pt)) segSec -= overlapSeconds(segStartMs, nowMs, pt, nowMs);
      }
      const currentBase = Number(next[keys.activeSeconds]);
      const base = Number.isFinite(currentBase) && currentBase > 0 ? Math.floor(currentBase) : 0;
      next = {
        ...next,
        [keys.activeSeconds]: Math.max(0, base + Math.max(0, segSec)),
        [keys.activeStart]: null,
      };
    }
    activeSectionTimingIdRef.current = null;
    responsesRefForFacial.current = next;
    responsesForPauseExitRef.current = next;
    void AsyncStorage.setItem(draftKeyForForm, JSON.stringify(next));
  }, [draftKeyForForm]);

  const flushForegroundSegmentToResponses = useCallback(() => {
    const now = Date.now();
    if (fgSegmentStartRef.current == null) return;
    const delta = Math.floor((now - fgSegmentStartRef.current) / 1000);
    fgSegmentStartRef.current = null;
    if (delta <= 0) return;
    setResponses((prev: any) => {
      const b = Number(prev.__form_active_seconds) || 0;
      const nextTotal = b + delta;
      AsyncStorage.setItem(draftKeyForForm, JSON.stringify({ ...prev, __form_active_seconds: nextTotal })).catch(() => {});
      return { ...prev, __form_active_seconds: nextTotal };
    });
  }, [draftKeyForForm]);

  useEffect(() => {
    if (loading || isReadOnly) return;
    fgSegmentStartRef.current = Date.now();
    const handle = (next: AppStateStatus) => {
      if (timersFrozenRef.current) {
        if (next !== 'active') fgSegmentStartRef.current = null;
        return;
      }
      const now = Date.now();
      if (next === 'active') {
        fgSegmentStartRef.current = now;
      } else if (fgSegmentStartRef.current != null) {
        const delta = Math.floor((now - fgSegmentStartRef.current) / 1000);
        fgSegmentStartRef.current = null;
        if (delta > 0) {
          setResponses((prev: any) => {
            const b = Number(prev.__form_active_seconds) || 0;
            const nextTotal = b + delta;
            AsyncStorage.setItem(draftKeyForForm, JSON.stringify({ ...prev, __form_active_seconds: nextTotal })).catch(() => {});
            return { ...prev, __form_active_seconds: nextTotal };
          });
        }
      }
    };
    const sub = AppState.addEventListener('change', handle);
    return () => sub.remove();
  }, [loading, isReadOnly, draftKeyForForm]);

  useEffect(
    () => () => {
      flushActiveSectionSegmentToDraft();
    },
    [flushActiveSectionSegmentToDraft]
  );

  useEffect(() => {
    const frozen = !!(serverPausedExecution || responses.__form_paused_since);
    timersFrozenRef.current = frozen;
    if (frozen) fgSegmentStartRef.current = null;
  }, [serverPausedExecution, responses.__form_paused_since]);

  const formPausedForIcons = Boolean(responses?.__form_paused_since);
  const activityFieldIconStatusBox = useMemo(
    () =>
      activityFieldIconBadgeByExecutionStatus(
        {
          isReadOnly: !!isReadOnly,
          taskStatus: String(currentTask?.status ?? '').trim(),
          serverPaused: !!serverPausedExecution,
          formPaused: formPausedForIcons,
        },
        C
      ),
    [C, isReadOnly, currentTask?.status, serverPausedExecution, formPausedForIcons]
  );

  useEffect(() => {
    currentTaskRef.current = currentTask;
  }, [currentTask]);

  useEffect(() => {
    setMapEtaMinutes(null);
  }, [resolvedTaskId]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const initial = `M${locationX},${locationY}`;
        currentStrokeRef.current = initial;
        setCurrentStrokeState(initial);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const updated = `${currentStrokeRef.current} L${locationX},${locationY}`;
        currentStrokeRef.current = updated;
        setCurrentStrokeState(updated);
      },
      onPanResponderRelease: () => {
        const strokeToSave = currentStrokeRef.current;
        if (strokeToSave) {
           setCompletedStrokes((prev) => {
             const arr = [...prev, strokeToSave];
             return arr;
           });
        }
        currentStrokeRef.current = '';
        setCurrentStrokeState('');
      },
    })
  ).current;

  const saveSignature = async () => {
      if(completedStrokes.length === 0 && currentStrokeRef.current === '') {
          setSigModalVisible(false);
          return;
      }
      setSavingSignature(true);
      try {
          const allStrk = [...completedStrokes];
          if(currentStrokeRef.current !== '') allStrk.push(currentStrokeRef.current);
          const strokesJoined = allStrk.join('|');
          
          let meta = { lat: 0, lng: 0, address: "Localização Desconhecida", ip: "Desconhecido" };
          try {
             // Forçando api.ipify.org para retornar o IP clássico (IPv4 - ex: 177.34.20.1)
             // Sem o "64" ele não trará o IP de nova geração (IPv6 - com letras e dois pontos)
             const ipReq = await fetch('https://api.ipify.org/?format=json');
             const ipJson = await ipReq.json();
             if (ipJson.ip) meta.ip = ipJson.ip;
          } catch(e) {}

          const sigField = currentSigField as string;
          const sigScope = currentSigScope;

          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
             try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const lat = loc.coords.latitude;
                const lng = loc.coords.longitude;
                const metaPending = { ...meta, lat, lng, address: 'A obter endereço…' };
                const committedFull =
                  'SIG_V1|' + `meta:${JSON.stringify(metaPending)}` + '|' + strokesJoined;
                handleInput(sigField, committedFull, sigScope);
                void (async () => {
                  let line = '';
                  try {
                    const geocoded = await Location.reverseGeocodeAsync({
                      latitude: lat,
                      longitude: lng,
                    });
                    if (geocoded.length > 0) {
                      const g = geocoded[0];
                      line = `${g.street || ''}, ${g.streetNumber || ''} - ${g.city || ''}, ${g.region || ''}`.trim();
                    }
                  } catch {
                    /* ignore */
                  }
                  if (!line) line = 'Endereço indisponível (rede ou mapas).';
                  const hi = handleInputRef.current;
                  if (typeof hi !== 'function') return;
                  const snap = responsesRefForFacial.current;
                  const cur = getScopedFieldValue(snap, sigScope, sigField);
                  if (String(cur) !== committedFull) return;
                  const metaDone = { ...metaPending, address: line };
                  hi(sigField, 'SIG_V1|' + `meta:${JSON.stringify(metaDone)}` + '|' + strokesJoined, sigScope);
                })();
             } catch(e) {
                const metaStr = `meta:${JSON.stringify(meta)}`;
                handleInput(sigField, "SIG_V1|" + metaStr + "|" + strokesJoined, sigScope);
             }
          } else {
            const metaStr = `meta:${JSON.stringify(meta)}`;
            handleInput(sigField, 'SIG_V1|' + metaStr + '|' + strokesJoined, sigScope);
          }
      } catch(e) {
          Alert.alert("Aviso", "A assinatura foi salva sem todos os metadados ativos (GPS lento ou sem rede offline).");
          // Fallback just in case
          const allStrk = [...completedStrokes];
          if(currentStrokeRef.current !== '') allStrk.push(currentStrokeRef.current);
          handleInput(currentSigField as string, "SIG_V1|" + allStrk.join('|'), currentSigScope);
      } finally {
          setSavingSignature(false);
          setSigModalVisible(false);
          setCurrentSigScope(null);
      }
  };

  const ensureOnlineValidation = async (field: any, action: () => void | Promise<void>) => {
    const ft = effectiveSchemaFieldType(field);
    const isVisionDeferredField = ft === 'vision_checklist' || ft === 'vision_ai_analysis';
    /** Visão IA: permite captura offline; a análise no servidor fica pendente até haver rede (submit continua a exigir análise concluída quando `requireOnlineValidation`). */
    if (schemaFieldRequiresOnlineValidation(field) && !isVisionDeferredField) {
      try {
        const netState = await Network.getNetworkStateAsync();
        if (!netState.isConnected) {
          Alert.alert(
            'Validação Online Obrigatória',
            'Esta etapa da OS possui regras de segurança e não pode ser preenchida offline.\n\nPor favor, conecte-se à internet para continuar.',
            [{ text: 'OK' }]
          );
          return;
        }
      } catch {
        Alert.alert('Erro de Conexão', 'Não foi possível verificar a conectividade.');
        return;
      }
    }
    await action();
  };

  const processFacialImage = async (
    fieldId: string,
    imgBase64: string,
    imgUri: string,
    scope?: SectionRepeatScope | null
  ) => {
    const fieldData = template.schemaData.find((f: any) => f.id === fieldId);
    const bioKey = facialBiometricStorageKey(fieldId);
    const strictOnline = fieldData ? schemaFieldRequiresOnlineValidation(fieldData) : false;

    const writeSuccessAudit = (apiResp: any) => {
      try {
        const snap = facialAuditSnapshotFromCaptureUri(imgUri);
        handleInput(
          bioKey,
          JSON.stringify({
            pending: false,
            at: new Date().toISOString(),
            capturedAt: snap.capturedAt,
            ...(snap.captureLat && snap.captureLng
              ? { captureLat: snap.captureLat, captureLng: snap.captureLng }
              : {}),
            ...(snap.captureAddr ? { captureAddr: snap.captureAddr } : {}),
            engine: normalizeFacialEngineForStorage(apiResp.engine),
            confidence: apiResp.confidence,
            facialAuthMode: apiResp.facialAuthMode || fieldData?.facialAuthMode || 'self_verify',
            identifiedUserId: apiResp.identifiedUserId ?? apiResp.identifiedUser?.id,
            identifiedUser: apiResp.identifiedUser,
          }),
          scope
        );
      } catch {
        /* não bloquear captura se JSON falhar */
      }
    };

    const writePendingAudit = () => {
      try {
        const snap = facialAuditSnapshotFromCaptureUri(imgUri);
        handleInput(
          bioKey,
          JSON.stringify({
            pending: true,
            reason: 'offline_or_network',
            capturedAt: snap.capturedAt,
            ...(snap.captureLat && snap.captureLng
              ? { captureLat: snap.captureLat, captureLng: snap.captureLng }
              : {}),
            ...(snap.captureAddr ? { captureAddr: snap.captureAddr } : {}),
            facialAuthMode: fieldData?.facialAuthMode === 'identify' ? 'identify' : 'self_verify',
          }),
          scope
        );
      } catch {
        /* ignore */
      }
    };

    if (strictOnline) {
      const result = await postVerifyFaceForField(fieldData, imgBase64);
      if (result.ok) {
        writeSuccessAudit(result.data as any);
      } else if (result.kind === 'error_msg') {
        Alert.alert('Erro de Reconhecimento', sanitizeFacialUserFacingCopy(result.message) || result.message);
        return false;
      } else if (result.kind === 'no_match') {
        Alert.alert(
          'Rosto não reconhecido',
          sanitizeFacialUserFacingCopy(result.message) ||
            'Não houve correspondência na galeria de rostos do servidor. No painel: Usuários → edite o usuário → Reconhecimento facial → sincronize as fotos de referência (avatar e fotos base). Depois tente novamente.'
        );
        return false;
      } else {
        Alert.alert(
          'Falha no Motor de IA',
          'Não foi possível conectar ao servidor para validação biométrica.'
        );
        return false;
      }
    } else {
      let usePending = false;
      try {
        const netState = await Network.getNetworkStateAsync();
        if (netState.isConnected === false) usePending = true;
      } catch {
        usePending = true;
      }
      if (!usePending) {
        const result = await postVerifyFaceForField(fieldData, imgBase64);
        if (result.ok) {
          writeSuccessAudit(result.data as any);
        } else if (result.kind === 'error_msg') {
          Alert.alert('Erro de Reconhecimento', sanitizeFacialUserFacingCopy(result.message) || result.message);
          return false;
        } else if (result.kind === 'no_match') {
          Alert.alert(
            'Rosto não reconhecido',
            sanitizeFacialUserFacingCopy(result.message) ||
              'Não houve correspondência na galeria de rostos do servidor. No painel: Usuários → edite o usuário → Reconhecimento facial → sincronize as fotos de referência (avatar e fotos base). Depois tente novamente.'
          );
          return false;
        } else {
          usePending = true;
        }
      }
      if (usePending) writePendingAudit();
    }

    const persistedUri = await persistFacialCapturePathForDraft(
      imgUri,
      String(resolvedTaskId || (Array.isArray(id) ? id[0] : id) || '')
    );
    handleInput(fieldId, persistedUri, scope);
    if (fieldData?.allowMediaDescription) {
      handleInput(mediaCaptionStorageKey(fieldId), '', scope);
    }
    void mergeAddrIntoMediaUriIfStillCurrent({
      getResponses: () => responsesRefForFacial.current,
      applyInput: (fid, val, sc) => {
        const hi = handleInputRef.current;
        if (typeof hi === 'function') hi(fid, val, sc);
      },
      fieldId,
      scope,
      uriAtCommit: persistedUri,
    });
    return true;
  };

  // --- Geo Engine: Haversine distance (meters) ---
  const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // --- Geo Engine: Point-in-polygon (Ray Casting) ---
  const pointInPolygon = (lat: number, lng: number, polygon: number[][]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1], yi = polygon[i][0]; // [lat,lng] → use lng as X, lat as Y
      const xj = polygon[j][1], yj = polygon[j][0];
      const intersect =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  /** Distância mínima (m) do ponto à polilinha da rota (projeção por segmento). */
  const nearestDistanceToRouteM = (lat: number, lng: number, route: number[][]): number => {
    let min = Infinity;
    for (let i = 0; i < route.length - 1; i++) {
      const [aL, aG] = route[i];
      const [bL, bG] = route[i + 1];
      const dx = bG - aG;
      const dy = bL - aL;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((lng - aG) * dx + (lat - aL) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = haversineDistance(lat, lng, aL + t * dy, aG + t * dx);
      if (d < min) min = d;
    }
    return min;
  };

  /**
   * Validação do campo geofence_check: modo «destino» (raio ao ponto da OS) vs «geometria» (polígono/rota/trecho do despacho).
   */
  const computeGeofenceCheckInside = (
    lat: number,
    lng: number,
    geoField: any,
    taskLocation: any,
  ): { insideZone: boolean; distanceMeters: number | null; requiredMeters: number | null } => {
    const fieldMode = geoField?.geofenceType || 'radius';
    const fieldRadius = parseInt(String(geoField?.geofenceRadius), 10) || 150;
    const geomTol = parseInt(String(geoField?.geofenceGeometryToleranceM), 10) || fieldRadius;
    const segBuf = parseInt(String(geoField?.geofenceSegmentBufferM), 10) || geomTol;

    const polyRaw = taskLocation?.locationPolygon;
    let polygon: number[][] = [];
    if (polyRaw) {
      try {
        const p = typeof polyRaw === 'string' ? JSON.parse(polyRaw) : polyRaw;
        polygon = Array.isArray(p) ? p : [];
      } catch {
        polygon = [];
      }
    }
    const taskZt = String(taskLocation?.locationZoneType || '').toLowerCase();
    const taskDestLat = Number(taskLocation?.locationLat);
    const taskDestLng = Number(taskLocation?.locationLng);
    const hasTaskPoint = Number.isFinite(taskDestLat) && Number.isFinite(taskDestLng);
    const taskTolRaw = Number(taskLocation?.locationRadius);
    const taskTol = Number.isFinite(taskTolRaw) && taskTolRaw > 0 ? taskTolRaw : NaN;

    if (fieldMode === 'radius') {
      if (!hasTaskPoint) return { insideZone: false, distanceMeters: null, requiredMeters: null };
      const effectiveRadius = Number.isFinite(taskTol) ? taskTol : fieldRadius;
      const d = Math.round(haversineDistance(lat, lng, taskDestLat, taskDestLng));
      return { insideZone: d <= effectiveRadius, distanceMeters: d, requiredMeters: effectiveRadius };
    }

    if (!polygon.length) {
      if (hasTaskPoint) {
        const effectiveRadius = Number.isFinite(taskTol) ? taskTol : geomTol;
        const d = Math.round(haversineDistance(lat, lng, taskDestLat, taskDestLng));
        return { insideZone: d <= effectiveRadius, distanceMeters: d, requiredMeters: effectiveRadius };
      }
      return { insideZone: false, distanceMeters: null, requiredMeters: null };
    }

    if (taskZt === 'polygon' && polygon.length >= 3) {
      const inside = pointInPolygon(lat, lng, polygon);
      return { insideZone: inside, distanceMeters: null, requiredMeters: null };
    }
    if (taskZt === 'route' && polygon.length >= 2) {
      const effTol = Number.isFinite(taskTol) ? taskTol : geomTol;
      const dist = nearestDistanceToRouteM(lat, lng, polygon);
      const d = Math.round(dist);
      return { insideZone: d <= effTol, distanceMeters: d, requiredMeters: effTol };
    }
    if (taskZt === 'segment' && polygon.length >= 2) {
      const effTol = Number.isFinite(taskTol) ? taskTol : segBuf;
      const dA = haversineDistance(lat, lng, polygon[0][0], polygon[0][1]);
      const dB = haversineDistance(lat, lng, polygon[1][0], polygon[1][1]);
      const d = Math.round(Math.min(dA, dB));
      return { insideZone: d <= effTol, distanceMeters: d, requiredMeters: effTol };
    }
    if (polygon.length >= 3) {
      const inside = pointInPolygon(lat, lng, polygon);
      return { insideZone: inside, distanceMeters: null, requiredMeters: null };
    }
    if (hasTaskPoint) {
      const effectiveRadius = Number.isFinite(taskTol) ? taskTol : geomTol;
      const d = Math.round(haversineDistance(lat, lng, taskDestLat, taskDestLng));
      return { insideZone: d <= effectiveRadius, distanceMeters: d, requiredMeters: effectiveRadius };
    }
    return { insideZone: false, distanceMeters: null, requiredMeters: null };
  };

  // --- Location handler (Transit + Geofence) ---
  // --- Tracking Link ──────────────────────────────────────────────
  const generateTrackingLink = async () => {
    const tid = String(resolvedTaskId || '').trim();
    if (!tid) return;
    try {
      const res = await apiFetch(`/api/tracking/start/${encodeURIComponent(tid)}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        setTrackingUrl(data.url);
      } else if (!res.ok) {
        console.warn('[tracking] start falhou', res.status, data?.error || data);
      }
    } catch (e) {
      console.warn('[tracking] could not generate link', e);
    }
  };

  const endTrackingLink = async () => {
    const tid = String(resolvedTaskId || '').trim();
    if (!tid) return;
    try {
      await apiFetch(`/api/tracking/end/${encodeURIComponent(tid)}`, { method: 'POST' });
    } catch (e) {
      console.warn('[tracking] could not end link', e);
    }
  };
  // ───────────────────────────────────────────────────

  const handleTransit = async (
    fieldId: string,
    label: string,
    traversedPath?: number[][],
    scope?: SectionRepeatScope | null
  ) => {
    if (isReadOnly) return;
    /** Usar o ref (actualizado nos `setResponses` de pausa/retoma) — o `responses` do closure pode ficar desactualizado face ao rascunho. */
    const formPausedSince = responsesRefForFacial.current?.__form_paused_since;
    const formPaused =
      formPausedSince != null && String(formPausedSince).trim() !== '' && String(formPausedSince).trim() !== 'null';
    /**
     * `CHEGADA` (ex.: «Finalizar» no mapa) deve fechar o trecho mesmo com pausa de atendimento —
     * o `routeTracker` pode continuar «em rota» enquanto `__form_paused_since` bloqueava tudo e o técnico ficava preso no alerta «Em pausa».
     */
    if (formPaused && label !== 'CHEGADA') {
      Alert.alert(t('common.attention'), t('pause.pausedTitle'));
      return;
    }
    /**
     * `CHEGADA` fecha o deslocamento — alinhar com `handleInput` (transit_* já permitidos).
     * Bloquear também com `serverPausedExecution` órfão impedia finalizar o trecho após retomar a OS
     * quando só o flag React ficava desactualizado em relação ao rascunho.
     */
    if (serverPausedExecution && label !== 'CHEGADA') {
      Alert.alert(t('common.attention'), t('pause.pausedTitle'));
      return;
    }
    if (gpsCaptureLockRef.current) return;

    if (label === 'SAIDA') {
      const startFd = template?.schemaData?.find((x: any) => x && x.id === fieldId);
      if (
        startFd &&
        shouldBlockTransitStartAfterOperationalDisplacementFinished(
          template?.schemaData,
          startFd,
          responses as Record<string, unknown>,
          scope ?? null
        )
      ) {
        Alert.alert(
          'Atenção',
          'Este deslocamento já foi concluído. Não é possível iniciar um novo deslocamento operacional no mesmo formulário.'
        );
        return;
      }
    }

    const existingFieldVal = getScopedFieldValue(responses, scope ?? null, fieldId);
    if (isTransitEvidenceNonempty(existingFieldVal)) {
      Alert.alert(
        'Atenção',
        'Este registo de deslocamento já foi guardado e não pode ser alterado ou refeito.'
      );
      return;
    }
    if (label === 'SAIDA') {
      const endF = findTransitEndFieldAfterStart(template?.schemaData, fieldId);
      if (endF?.id) {
        const endVal = getScopedFieldValue(responses, scope ?? null, endF.id);
        if (isTransitEvidenceNonempty(endVal)) {
          Alert.alert(
            'Atenção',
            'O fim deste deslocamento já foi registado. Não é possível iniciar ou alterar o trecho novamente.'
          );
          return;
        }
      }
    }

    gpsCaptureLockRef.current = true;
    setGpsBusyFieldId(fieldId);
    const isReimbursementTransit = isReimbursementTransitField(template?.schemaData, fieldId);
    const isGeofenceCheck = label === 'VALIDACAO_CERCA';
    try {
      setSubmitting(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      let lat = 0;
      let lng = 0;
      let accuracyMeters: number | undefined;
      let address = "Localização não capturada";
      
      if (status === 'granted') {
          try {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
              lat = loc.coords.latitude;
              lng = loc.coords.longitude;
              const acc = loc.coords.accuracy;
              if (acc != null && Number.isFinite(acc) && acc > 0) {
                accuracyMeters = acc;
              }
              if (label === 'SAIDA' && lat !== 0 && lng !== 0) {
                routeTracker.rebaselineSessionProgress(lat, lng);
              }
              /** Geocodificação reversa síncrona só na cerca; início/fim de deslocamento enriquece em segundo plano. */
              if (isGeofenceCheck) {
                try {
                  const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
                  if (rev && rev.length > 0) {
                    const p = rev[0];
                    address = `${p.street || p.name || ''}, ${p.streetNumber || ''} - ${p.district || p.subregion || ''}, ${p.city || ''} - ${p.region || ''}`;
                  }
                } catch {
                  /* mantém fallback */
                }
              } else {
                address =
                  lat !== 0 && lng !== 0 ? 'A obter endereço…' : 'Localização não capturada';
              }
          } catch(e) {
              address = "Falha ao obter coordenadas do GPS";
          }
      } else {
          address = "Permissão de GPS negada pelo usuário";
      }

      // ── Geofencing Validation Engine ──────────────────────────
      if (isGeofenceCheck && lat !== 0 && lng !== 0) {
        const geoField = template?.schemaData?.find((f: any) => f.id === fieldId);
        const effMode = normalizeGeofenceFailMode(geoField?.geofenceFailMode);
        const customMsg: string = geoField?.geofenceErrorMsg || '';
        const zoneType: string = geoField?.geofenceType || 'radius';
        const unblockOnReentry = geoField?.geofenceUnblockOnReentry === true;

        let taskLocation: any = null;
        try {
          const thisTask = await findCloudTaskById(String(resolvedTaskId || ''));
          if (thisTask) taskLocation = thisTask;
        } catch (e) {}

        const hasTaskPolygon = !!taskLocation?.locationPolygon;
        const taskDestLat = Number(taskLocation?.locationLat);
        const taskDestLng = Number(taskLocation?.locationLng);
        const hasTaskPoint = Number.isFinite(taskDestLat) && Number.isFinite(taskDestLng);

        if (!taskLocation || (!hasTaskPoint && !hasTaskPolygon)) {
          const payload = { action: label, timestamp: new Date().toISOString(), coordinates: { lat, lng }, address, geofence: { validated: false, reason: 'NO_TASK_LOCATION' } };
          handleInput(fieldId, JSON.stringify(payload), scope);
          Alert.alert("⚠️ Localização Registrada", `GPS capturado com sucesso.\n\n📍 ${address}\n\nEsta OS não possui zona de geofencing definida, nenhuma validação aplicada.`);
          return;
        }

        const gf = computeGeofenceCheckInside(lat, lng, geoField, taskLocation);
        const insideZone = gf.insideZone;
        const distanceMeters = gf.distanceMeters;
        const requiredMeters = gf.requiredMeters;

        const prevInside = geofencePrevInsideRef.current[fieldId];
        if (prevInside !== undefined && prevInside !== insideZone) {
          void dataCollectionService.recordEvent('GEOFENCE_FIELD_AUDIT', {
            lat,
            lng,
            accuracy: accuracyMeters,
            fieldId,
            transition: insideZone ? 'ENTER_SERVICE_ZONE' : 'EXIT_SERVICE_ZONE',
            wasInside: prevInside,
            nowInside: insideZone,
          });
        }
        geofencePrevInsideRef.current[fieldId] = insideZone;

        const evidencePayload: any = {
          action: label,
          timestamp: new Date().toISOString(),
          coordinates: { lat, lng },
          address,
          geofence: {
            validated: true,
            mode: effMode,
            insideZone,
            distanceMeters,
            requiredMeters,
            zoneType
          }
        };

        handleInput(fieldId, JSON.stringify(evidencePayload), scope);

        if (insideZone) {
          setGeofenceUnblockCtx(null);
          const distMsg = distanceMeters !== null ? `\n📏 Distância: ${distanceMeters}m (raio: ${requiredMeters}m)` : '';
          Alert.alert("✅ Cerca Eletrônica: APROVADO", `Você está dentro da zona de serviço autorizada.${distMsg}\n\n📍 ${address}`);
        } else {
          const distMsg = distanceMeters !== null
            ? `\n📏 Você está a ${distanceMeters}m do local (máx. ${requiredMeters}m).`
            : '\nVocê está fora do polígono de serviço.';
          const errorMsg = customMsg || `Acesso negado: fora da área de serviço autorizada.${distMsg}`;

          if (effMode === 'block') {
            handleInput(fieldId, '', scope);
            Alert.alert("🚫 Cerca Eletrônica: BLOQUEADO", `${errorMsg}\n\n📍 Sua posição: ${address}`);
            if (unblockOnReentry) {
              setGeofenceUnblockCtx({ fieldId, scope: scope ?? null });
            }
          } else if (effMode === 'record_only') {
            Alert.alert("📋 Cerca — registo", `${errorMsg}\n\nA posição foi registada para auditoria.\n\n📍 ${address}`);
          } else {
            Alert.alert("⚠️ Cerca Eletrônica: ALERTA", `${errorMsg}\n\nO desvio foi registrado como evidência. Você pode continuar.`);
          }
        }
        return;
      }
      // ─────────────────────────────────────────────────────────

      const payload: any = {
         action: label,
         timestamp: new Date().toISOString(),
         coordinates: { lat, lng },
         address: address,
         ...(accuracyMeters != null ? { accuracyMeters } : {}),
      };
      
      if (traversedPath && traversedPath.length > 0) {
          payload.traversedPath = traversedPath;
      }
      if (isReimbursementTransit) {
        payload.transitPurpose = 'reimbursement';
      } else if (label === 'SAIDA') {
        const meta = currentTaskRef.current?.metadata;
        if (meta?.transitSegmentDestination === 'A' || meta?.transitSegmentDestination === 'B') {
          payload.segmentDestination = meta.transitSegmentDestination;
        }
      }

      /** Métricas de rota (OSRM) e morada exacta: em segundo plano após gravar o GPS (ver IIFE no fim). */

      if (label === 'CHEGADA') {
        try {
          const startFieldForPair = findPreviousTransitStartForEnd(template?.schemaData, fieldId);
          const startRaw =
            startFieldForPair != null
              ? getScopedFieldValue(responses, scope ?? null, startFieldForPair.id)
              : undefined;
          let startObj: any = null;
          if (startRaw != null && String(startRaw).trim() !== '') {
            try {
              startObj = typeof startRaw === 'string' ? JSON.parse(startRaw) : startRaw;
            } catch {
              startObj = null;
            }
          }
          const startTs = startObj?.timestamp;
          const endTs = payload.timestamp;
          let durationSeconds: number | null = null;
          if (startTs && endTs) {
            const a = new Date(startTs).getTime();
            const b = new Date(endTs).getTime();
            if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
              durationSeconds = Math.floor((b - a) / 1000);
            }
          }
          const slat = Number(startObj?.coordinates?.lat ?? startObj?.lat);
          const slng = Number(startObj?.coordinates?.lng ?? startObj?.lng);
          const path =
            traversedPath && traversedPath.length > 0 ? traversedPath : undefined;
          let distanceMeters: number | null = null;
          if (path && path.length >= 2) {
            distanceMeters = Math.round(polylineLengthMeters(path));
          } else if (
            Number.isFinite(slat) &&
            Number.isFinite(slng) &&
            lat !== 0 &&
            lng !== 0
          ) {
            distanceMeters = Math.round(haversineMeters(slat, slng, lat, lng));
          }
          if (durationSeconds != null || distanceMeters != null) {
            payload.actualMetrics = {
              ...(durationSeconds != null ? { durationSeconds } : {}),
              ...(distanceMeters != null ? { distanceMeters } : {}),
              pathPointCount: path?.length ?? 0,
            };
          }

          if (!isReimbursementTransit && currentTask?.locationZoneType === 'route') {
            const refPts = buildRouteCoordsFromTask(currentTask);
            const tol = parseInt(String(currentTask?.locationRadius ?? '100'), 10) || 100;
            if (refPts.length >= 2) {
              let patrolSnap = routeTracker.getPatrolComplianceSnapshot(refPts, tol);
              const pathSamples =
                traversedPath && traversedPath.length >= 2
                  ? traversedPath.map(([la, ln]) => ({ lat: la, lng: ln }))
                  : [];
              if (
                (!patrolSnap || patrolSnap.samplesUsed < 2) &&
                pathSamples.length >= 2
              ) {
                patrolSnap = computePatrolCompliance(refPts, pathSamples, {
                  toleranceM: tol,
                  maxAccuracyM: null,
                });
              }
              if (patrolSnap) payload.patrolCompliance = patrolSnap;
            }
          }
        } catch (e) {
          console.warn('[transit] actualMetrics', e);
        }
      }
      
      handleInput(fieldId, JSON.stringify(payload), scope);
      
      // Link público: só no deslocamento operacional (não «apenas registo»)
      if (label === 'CHEGADA' && !isReimbursementTransit) {
          endTrackingLink();
      }

      const timeBr = new Date().toLocaleTimeString('pt-BR');
      const tailMoradaAsync =
        address === 'A obter endereço…'
          ? '\n\nGPS já guardado. O endereço (e, na saída, a estimativa de rota) completa em seguida quando houver rede.'
          : `\n\n📍 ${address}`;

      if (label === 'CHEGADA') {
        if (status !== 'granted' || lat === 0) {
          Alert.alert(
            'Deslocamento finalizado',
            `O deslocamento foi encerrado e registrado às ${timeBr}, mas sem coordenadas GPS utilizáveis.\n\nMotivo: ${address}`
          );
        } else {
          Alert.alert(
            'Deslocamento finalizado',
            `O trecho de deslocamento foi encerrado e o registro foi guardado (início → fim no mapa).\n\nIsto não substitui, por si só, outros passos do formulário que sirvam como prova formal de chegada ao local de serviço, por exemplo, quando existir validação em cerca eletrônica ou campo próprio de confirmação.${tailMoradaAsync}`
          );
        }
      } else if (label === 'SAIDA') {
        if (status !== 'granted' || lat === 0) {
          Alert.alert(
            'Deslocamento iniciado',
            `Saída registrada às ${timeBr}, mas sem rastreamento por GPS.\n\nMotivo: ${address}`
          );
        } else {
          Alert.alert(
            'Deslocamento iniciado',
            `Saída registrada com sucesso às ${timeBr}.${tailMoradaAsync}`
          );
        }
      } else if (status !== 'granted' || lat === 0) {
        Alert.alert('Atenção', `${label} registrado às ${timeBr}, mas sem rastreamento por GPS.\n\nMotivo: ${address}`);
      } else {
        Alert.alert('Sucesso', `${label} registrado com sucesso!\n\n${address}`);
      }

      /** Morada + OSRM: não bloqueiam o loading do GPS (início/fim de deslocamento). */
      if (
        (label === 'SAIDA' || label === 'CHEGADA') &&
        status === 'granted' &&
        lat !== 0 &&
        lng !== 0 &&
        !isGeofenceCheck
      ) {
        const tsCommit = payload.timestamp;
        void (async () => {
          let nextAddress = 'Localização não capturada';
          try {
            const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (rev && rev.length > 0) {
              const p = rev[0];
              nextAddress = `${p.street || p.name || ''}, ${p.streetNumber || ''} - ${p.district || p.subregion || ''}, ${p.city || ''} - ${p.region || ''}`;
            }
          } catch {
            nextAddress = 'Endereço indisponível (rede ou serviço de mapas).';
          }

          let plannedMetrics: {
            durationSeconds?: number | null;
            distanceMeters?: number | null;
            source?: string;
          } | undefined;
          if (label === 'SAIDA' && !isReimbursementTransit) {
            try {
              const task = currentTaskRef.current;
              const routeCoords = buildRouteCoordsFromTask(task);
              const tl = getDestFromTaskLike(task);
              const dest = pickDestinationForOsrm(
                tl ? { lat: tl.lat, lng: tl.lng } : {},
                routeCoords
              );
              if (dest) {
                const google = await fetchGoogleDrivingLegMetricsOrNull(lat, lng, dest.lat, dest.lng);
                const osrm = google?.ok
                  ? {
                      ok: true as const,
                      durationSeconds: google.durationSeconds,
                      distanceMeters: google.distanceMeters,
                    }
                  : await fetchDrivingLegMetrics(lat, lng, dest.lat, dest.lng);
                const straightDist = Math.round(haversineMeters(lat, lng, dest.lat, dest.lng));
                if (osrm.ok && osrm.durationSeconds != null) {
                  const dm =
                    osrm.distanceMeters != null && Number.isFinite(osrm.distanceMeters)
                      ? Math.round(osrm.distanceMeters)
                      : straightDist;
                  plannedMetrics = {
                    durationSeconds: Math.round(osrm.durationSeconds),
                    distanceMeters: dm,
                    source: google?.ok ? 'google_routes' : 'osrm',
                  };
                } else {
                  const etaMin = normalizeEtaMinutes(task?.etaMinutes);
                  if (etaMin != null && etaMin > 0) {
                    plannedMetrics = {
                      durationSeconds: Math.round(etaMin * 60),
                      distanceMeters: straightDist,
                      source: 'task_eta',
                    };
                  } else {
                    plannedMetrics = {
                      durationSeconds: null,
                      distanceMeters: straightDist,
                      source: 'straight_line',
                    };
                  }
                }
              }
            } catch (e) {
              console.warn('[transit] plannedMetrics async', e);
            }
          }

          const hi = handleInputRef.current;
          if (typeof hi !== 'function') return;
          const resSnap = responsesRefForFacial.current;
          const raw = getScopedFieldValue(resSnap, scope ?? null, fieldId);
          if (raw == null || String(raw).trim() === '') return;
          let base: any;
          try {
            base = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch {
            return;
          }
          if (base?.timestamp !== tsCommit) return;

          const merged: Record<string, unknown> = {
            ...base,
            address: nextAddress,
          };
          if (label === 'SAIDA' && plannedMetrics != null) {
            merged.plannedMetrics = plannedMetrics;
          }
          hi(fieldId, JSON.stringify(merged), scope);
        })();
      }
    } catch (e) {
      Alert.alert("Erro Inesperado", "Ocorreu um erro ao tentar processar a operação.");
    } finally {
      gpsCaptureLockRef.current = false;
      setGpsBusyFieldId(null);
      setSubmitting(false);
    }
  };

  /** Após bloqueio de cerca com «libertar ao voltar à zona»: observa GPS até entrada válida e preenche o campo. */
  useEffect(() => {
    if (!geofenceUnblockCtx || !resolvedTaskId) return;
    const { fieldId, scope } = geofenceUnblockCtx;
    const geoField = template?.schemaData?.find((f: any) => f.id === fieldId);
    if (!geoField || geoField.type !== 'geofence_check') {
      setGeofenceUnblockCtx(null);
      return;
    }
    const zoneType: string = geoField?.geofenceType || 'radius';
    const subRef = { current: null as Location.LocationSubscription | null };
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      subRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 12000,
          distanceInterval: 20,
        },
        async (loc) => {
          if (cancelled) return;
          const la = loc.coords.latitude;
          const ln = loc.coords.longitude;
          let taskLocation: any = null;
          try {
            taskLocation = await findCloudTaskById(String(resolvedTaskId));
          } catch {
            return;
          }
          if (!taskLocation) return;
          const gf = computeGeofenceCheckInside(la, ln, geoField, taskLocation);
          const { insideZone, distanceMeters, requiredMeters } = gf;
          if (!insideZone) return;
          let address = 'Localização não capturada';
          try {
            const rev = await Location.reverseGeocodeAsync({ latitude: la, longitude: ln });
            if (rev && rev.length > 0) {
              const p = rev[0];
              address = `${p.street || p.name || ''}, ${p.streetNumber || ''} - ${p.district || p.subregion || ''}, ${p.city || ''} - ${p.region || ''}`;
            }
          } catch {
            /* ignore */
          }
          const hi = handleInputRef.current;
          if (typeof hi !== 'function') return;
          const evidencePayload = {
            action: 'VALIDACAO_CERCA',
            timestamp: new Date().toISOString(),
            coordinates: { lat: la, lng: ln },
            address,
            geofence: {
              validated: true,
              mode: normalizeGeofenceFailMode(geoField?.geofenceFailMode),
              insideZone: true,
              distanceMeters,
              requiredMeters,
              zoneType,
              autoReentry: true,
            },
          };
          hi(fieldId, JSON.stringify(evidencePayload), scope);
          setGeofenceUnblockCtx(null);
          try {
            subRef.current?.remove();
            subRef.current = null;
          } catch {
            /* ignore */
          }
          Alert.alert(
            '✅ Cerca Eletrônica',
            'Voltou à zona permitida. Validação registada automaticamente.'
          );
        }
      );
    })();
    return () => {
      cancelled = true;
      try {
        subRef.current?.remove();
        subRef.current = null;
      } catch {
        /* ignore */
      }
    };
  }, [geofenceUnblockCtx, resolvedTaskId, template]);



    // Sincronização passiva do Kanban (Ping)
  const notifyKanbanStatus = async (status: 'ACCEPTED' | 'IN_PROGRESS') => {
      const tid = String(resolvedTaskId || '').trim();
      if (!tid) return;
      try {
          const key = `@brspark_notified_${tid}_${status}`;
          if (await AsyncStorage.getItem(key)) return;
          
          const ts = new Date().toISOString();
          
          // Gravação local forte para garantir que vai no payload final caso o ping falhe
          try {
            await patchCloudTaskById(tid, (row) => {
              const meta = { ...(row.metadata || {}), ...(status === 'ACCEPTED' ? { acceptedAt: ts } : {}) };
              return { ...row, metadata: meta };
            });
          } catch (err) {}

          await enqueueExecutionStatusPatch(tid, { status, timestamp: ts });
          await AsyncStorage.setItem(key, 'true');
      } catch(e) {}
  };

  useEffect(() => {
      if (resolvedTaskId && !isReadOnly) {
         notifyKanbanStatus('ACCEPTED');
         // Técnico aceitou a OS — GPS no modo leve (aguardando saída)
         AsyncStorage.getItem('@brspark_email').then(email => {
           dataCollectionService.setState('DISPATCHED', {
             executionId: String(resolvedTaskId),
             ownerEmail: email || 'unknown',
           }).catch(() => {});
         });
      }
  }, [resolvedTaskId, isReadOnly]);

  // Ao focar a OS, reassocia executionId aos heartbeats (link público usa telemetria por OS).
  useFocusEffect(
    useCallback(() => {
      if (!resolvedTaskId || isReadOnly) return undefined;
      let cancelled = false;
      AsyncStorage.getItem('@brspark_email').then((email) => {
        if (!cancelled) {
          dataCollectionService.syncExecutionContext(String(resolvedTaskId), email || undefined);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [resolvedTaskId, isReadOnly])
  );

  // Sincronização em tempo real das respostas (Debounced)
  useEffect(() => {
     if (isReadOnly || !resolvedTaskId || Object.keys(responses).length === 0) return;
     
     const timeoutId = setTimeout(() => {
         const body: Record<string, unknown> = { responses };
         if (responses.__form_paused_since) {
           body.status = 'PAUSED';
           body.timestamp = responses.__form_paused_since;
           body.metadata = {
             executionPaused: true,
             lastPauseReasonSummary: getOpenPauseSummaryFromResponses(responses),
             lastPauseAt: responses.__form_paused_since,
           };
         }
         void enqueueExecutionStatusPatch(String(resolvedTaskId), body);
     }, 2000); // 2 second debounce
     
     return () => clearTimeout(timeoutId);
  }, [responses, resolvedTaskId, isReadOnly]);


  useEffect(() => {
    loadTemplate();
    // Stop route tracking when leaving the checklist
    return () => { routeTracker.stop().catch(() => {}); };
  }, [id, resolvedTaskId]);

  const loadTemplate = async () => {
    try {
      const taskIdNorm = String(resolvedTaskId || '').trim();
      const hasTaskId = taskIdNorm.length > 0;
      setShowGlobalGeofenceMap(false);
      setGlobalGeofenceMapTask(null);
      pendingGlobalGeofenceAfterRouteRef.current = false;

      const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
      let execs = [];
      try { execs = JSON.parse(executedStr); } catch(e){}
      if (!Array.isArray(execs)) execs = [];

      /** Cache da execução (GET) — inclui `status`; não depender só da lista de concluídas (pode expirar aos 30 dias). */
      const execStrEarly = hasTaskId
        ? await AsyncStorage.getItem(`@brspark_execution_${taskIdNorm}`)
        : null;
      let snapshotIsTerminal = false;
      if (execStrEarly) {
        try {
          const snap = JSON.parse(execStrEarly);
          if (executionIsViewOnly(snap)) snapshotIsTerminal = true;
        } catch {
          /* ignore */
        }
      }

      const inExecutedList = Boolean(
        hasTaskId && execs.some((e) => (typeof e === 'string' ? e : e.id) === taskIdNorm),
      );
      let cloudTaskTerminal = false;
      if (hasTaskId) {
        try {
          const ct = await findCloudTaskById(taskIdNorm);
          if (ct && executionIsViewOnly(ct)) cloudTaskTerminal = true;
        } catch {
          /* ignore */
        }
      }
      const isCompleted = Boolean(hasTaskId && (inExecutedList || snapshotIsTerminal || cloudTaskTerminal));
      /** Só leitura: lista de concluídas, snapshot local COMPLETED/SYNCED, ou estado terminal na API (sem revisão). */
      let readOnlyMode = Boolean(isCompleted);
      let lastSubmittedRevForNext = 0;

      /** Expo pode expor `id` como `string | string[]` — normalizar para bater com `@brspark_templates`. */
      const resolvedRouteTemplateId =
        typeof id === 'string'
          ? id.trim()
          : Array.isArray(id)
            ? String(id[0] ?? '').trim()
            : String(id ?? '').trim();

      let realTemplateId = resolvedRouteTemplateId;
      let initialRes: any = {};
      let serverPausedFlag = false;
      let shouldSanitizeFreshProgressMeta = false;
      let remotePausedMeta: { lastPauseAt?: string; lastPauseReasonSummary?: string } = {};
      let cloudPausedMeta: { lastPauseAt?: string; lastPauseReasonSummary?: string } = {};
      /** Só preenchidos no ramo editável; usados após o template para reset de cronômetros em revisão. */
      let serverR: Record<string, any> = {};
      let reopenRevisionPending = false;
      let draftRes: Record<string, unknown> = {};

      // PASSO 1: Resolve a Execução PRIMEIRO. Se for um ghost antigo, o ID passado era o taskId e não o templateId. 
      // Ao baixar a execução, extraímos o verdadeiro templateId dela!
      if (isCompleted) {
        const execStr = execStrEarly;
        /** Respostas lidas de `@brspark_execution_*` antes de qualquer GET — evita apagar deslocamento ao fundir com snapshot do servidor atrasado. */
        let cachedResponsesBeforeFetch: Record<string, unknown> = {};
        let cacheStale = !execStr;
        if (execStr) {
          try {
            const cachedObj = JSON.parse(execStr);
            const dl = Number(cachedObj._technicianViewDownloadAt);
            if (!Number.isFinite(dl) || Date.now() - dl > COMPLETED_BODY_LOCAL_TTL_MS) {
              cacheStale = true;
            } else {
              const resp = cachedObj.responses;
              const keys =
                resp && typeof resp === 'object' && !Array.isArray(resp)
                  ? Object.keys(resp).filter((k) => !k.startsWith('__'))
                  : [];
              if (keys.length === 0) cacheStale = true;
            }
          } catch {
            cacheStale = true;
          }
        }

        const applyLocalExecutionCache = (raw: string) => {
          try {
            const cachedObj = JSON.parse(raw || '{}');
            initialRes =
              cachedObj.responses && typeof cachedObj.responses === 'object' && !Array.isArray(cachedObj.responses)
                ? cachedObj.responses
                : {};
            if (cachedObj.templateId) realTemplateId = String(cachedObj.templateId);
          } catch {
            /* mantém initialRes */
          }
        };

        const outboxStr = await AsyncStorage.getItem('@brspark_outbox') || '[]';
        let outbox: any[] = [];
        try {
          outbox = JSON.parse(outboxStr);
        } catch {
          outbox = [];
        }
        if (!Array.isArray(outbox)) outbox = [];
        const outboxMatch = outbox.find((o: any) => String(o.taskId) === taskIdNorm);

        if (outboxMatch) {
          initialRes = outboxMatch.responses || {};
          if (outboxMatch.templateId) realTemplateId = String(outboxMatch.templateId);
        } else {
          if (execStr) {
            applyLocalExecutionCache(execStr);
            try {
              const co = JSON.parse(execStr);
              const wr = co?.responses;
              if (wr && typeof wr === 'object' && !Array.isArray(wr)) {
                cachedResponsesBeforeFetch = wr as Record<string, unknown>;
              }
            } catch {
              /* ignore */
            }
          }

          let blockedWithoutCache = false;
          if (cacheStale) {
            try {
              const res = await apiFetch(`/api/checklists/executions/${taskIdNorm}`);
              if (res.ok) {
                const remoteExec = await res.json();
                const serverOnlyRes =
                  remoteExec.responses &&
                  typeof remoteExec.responses === 'object' &&
                  !Array.isArray(remoteExec.responses)
                    ? remoteExec.responses
                    : {};
                if (remoteExec.templateId) realTemplateId = String(remoteExec.templateId);
                const remoteStatus = String(remoteExec?.status || '').toUpperCase();
                const remoteLastRev = Number(remoteExec?.lastSubmittedRevision) || 0;
                const hasServerAnswers = Object.keys(serverOnlyRes).some((k) => !k.startsWith('__'));
                if (
                  (remoteStatus === 'PENDING' || remoteStatus === 'RECEIVED' || remoteStatus === 'ACCEPTED') &&
                  remoteLastRev === 0 &&
                  !hasServerAnswers
                ) {
                  shouldSanitizeFreshProgressMeta = true;
                }
                lastSubmittedRevForNext = Math.max(
                  lastSubmittedRevForNext,
                  Number(remoteExec.lastSubmittedRevision) || 0
                );
                initialRes = mergeResponsesDraftOverServerPreserveTransitDisplacement(
                  serverOnlyRes as Record<string, unknown>,
                  cachedResponsesBeforeFetch
                );
                if (!executionIsViewOnly(remoteExec)) {
                  const allowEdit = remoteExecAllowsEditAfterLocalCompletion(remoteExec);
                  readOnlyMode = !allowEdit;
                  if (allowEdit) {
                    const rm = remoteExec.metadata;
                    if (rm && typeof rm === 'object') {
                      if (metaRevisionVisitContext(rm)) reopenRevisionPending = true;
                      if (rm.lastPauseAt) remotePausedMeta.lastPauseAt = String(rm.lastPauseAt);
                      if (rm.lastPauseReasonSummary)
                        remotePausedMeta.lastPauseReasonSummary = String(rm.lastPauseReasonSummary);
                    }
                    if (remoteExec.status === 'PAUSED') serverPausedFlag = true;
                    const draftKeyRv = `@draft_tsk_${taskIdNorm}`;
                    const dstrRv = await AsyncStorage.getItem(draftKeyRv);
                    let dmergeRv: Record<string, unknown> = {};
                    try {
                      dmergeRv = dstrRv ? JSON.parse(dstrRv) : {};
                      if (!dmergeRv || typeof dmergeRv !== 'object' || Array.isArray(dmergeRv)) dmergeRv = {};
                    } catch {
                      dmergeRv = {};
                    }
                    initialRes = mergeResponsesDraftOverServerPreserveTransitDisplacement(
                      initialRes as Record<string, unknown>,
                      dmergeRv as Record<string, unknown>
                    );
                  }
                }
                const ts = Date.now();
                const cachePayload = {
                  ...remoteExec,
                  responses: initialRes,
                  _cacheTime: ts,
                  _technicianViewDownloadAt: ts,
                };
                await AsyncStorage.setItem(`@brspark_execution_${taskIdNorm}`, JSON.stringify(cachePayload));
              } else if (res.status === 404) {
                if (!execStr) {
                  initialRes = {};
                }
              } else if (!execStr) {
                blockedWithoutCache = true;
              }
            } catch {
              if (!execStr) {
                blockedWithoutCache = true;
              }
            }
          }

          if (blockedWithoutCache) {
            Alert.alert(
              'Aviso',
              'Esta OS não está guardada neste aparelho. Com internet, abra a OS uma vez para ficar disponível offline.',
            );
            router.back();
            return;
          }
        }

        // Lista/cache local ainda marcam a OS como "concluída", mas o painel pode tê-la reaberto (revisão → PENDING).
        if (hasTaskId && !outboxMatch && readOnlyMode) {
          try {
            const resRv = await apiFetch(`/api/checklists/executions/${taskIdNorm}`);
            if (resRv.ok) {
              const remoteExec = await resRv.json();
              const serverOnlyRes =
                remoteExec.responses &&
                typeof remoteExec.responses === 'object' &&
                !Array.isArray(remoteExec.responses)
                  ? remoteExec.responses
                  : {};
              if (remoteExec.templateId) realTemplateId = String(remoteExec.templateId);
              const remoteStatusRv = String(remoteExec?.status || '').toUpperCase();
              const remoteLastRevRv = Number(remoteExec?.lastSubmittedRevision) || 0;
              const hasServerAnswersRv = Object.keys(serverOnlyRes).some((k) => !k.startsWith('__'));
              if (
                (remoteStatusRv === 'PENDING' || remoteStatusRv === 'RECEIVED' || remoteStatusRv === 'ACCEPTED') &&
                remoteLastRevRv === 0 &&
                !hasServerAnswersRv
              ) {
                shouldSanitizeFreshProgressMeta = true;
              }
              lastSubmittedRevForNext = Math.max(
                lastSubmittedRevForNext,
                Number(remoteExec.lastSubmittedRevision) || 0
              );
              initialRes = mergeResponsesDraftOverServerPreserveTransitDisplacement(
                serverOnlyRes as Record<string, unknown>,
                cachedResponsesBeforeFetch
              );
              if (!executionIsViewOnly(remoteExec)) {
                const allowEdit = remoteExecAllowsEditAfterLocalCompletion(remoteExec);
                readOnlyMode = !allowEdit;
                if (allowEdit) {
                  const rm = remoteExec.metadata;
                  if (rm && typeof rm === 'object') {
                    if (metaRevisionVisitContext(rm)) reopenRevisionPending = true;
                    if (rm.lastPauseAt) remotePausedMeta.lastPauseAt = String(rm.lastPauseAt);
                    if (rm.lastPauseReasonSummary)
                      remotePausedMeta.lastPauseReasonSummary = String(rm.lastPauseReasonSummary);
                  }
                  if (remoteExec.status === 'PAUSED') serverPausedFlag = true;
                  const draftKeyRv = `@draft_tsk_${taskIdNorm}`;
                  const dstrRv = await AsyncStorage.getItem(draftKeyRv);
                  let dmergeRv: Record<string, unknown> = {};
                  try {
                    dmergeRv = dstrRv ? JSON.parse(dstrRv) : {};
                    if (!dmergeRv || typeof dmergeRv !== 'object' || Array.isArray(dmergeRv)) dmergeRv = {};
                  } catch {
                    dmergeRv = {};
                  }
                  initialRes = mergeResponsesDraftOverServerPreserveTransitDisplacement(
                    initialRes as Record<string, unknown>,
                    dmergeRv as Record<string, unknown>
                  );
                }
              }
              const tsRv = Date.now();
              await AsyncStorage.setItem(
                `@brspark_execution_${taskIdNorm}`,
                JSON.stringify({
                  ...remoteExec,
                  responses: initialRes,
                  _cacheTime: tsRv,
                  _technicianViewDownloadAt: tsRv,
                })
              );
            }
          } catch {
            /* offline — mantém só leitura a partir do cache local */
          }
        }
      } else {
         serverR = {};
         reopenRevisionPending = false;

         const draftKey = hasTaskId ? `@draft_tsk_${taskIdNorm}` : `@draft_chk_${id}`;
         const draftStr = await AsyncStorage.getItem(draftKey);
         draftRes = {};
         try {
           draftRes = draftStr ? JSON.parse(draftStr) : {};
           if (!draftRes || typeof draftRes !== 'object' || Array.isArray(draftRes)) draftRes = {};
         } catch {
           draftRes = {};
         }

         // OS em nuvem: servidor tem estado IN_PROGRESS + respostas (debounce PATCH); outro celular
         // não tinha @draft_tsk_* — precisamos puxar GET para continuar a mesma atividade.
         if (hasTaskId) {
           let ctEarly: any = null;
           try {
             try {
               const allEarly = await loadAllCloudTasksForExecutionLookup();
               ctEarly = allEarly.find((t: any) => String(t.id) === taskIdNorm);
             } catch {
               ctEarly = undefined;
             }
             if (ctEarly?.status === 'PAUSED') serverPausedFlag = true;
             if (ctEarly != null && ctEarly.lastSubmittedRevision != null) {
               lastSubmittedRevForNext = Math.max(
                 lastSubmittedRevForNext,
                 Number(ctEarly.lastSubmittedRevision) || 0
               );
             }
             const cm = ctEarly?.metadata;
             if (cm && typeof cm === 'object') {
               if (metaRevisionVisitContext(cm)) reopenRevisionPending = true;
               if (cm.lastPauseAt) cloudPausedMeta.lastPauseAt = String(cm.lastPauseAt);
               if (cm.lastPauseReasonSummary) cloudPausedMeta.lastPauseReasonSummary = String(cm.lastPauseReasonSummary);
             }
           } catch {}

           try {
             const res = await apiFetch(`/api/checklists/executions/${taskIdNorm}`);
             if (res.ok) {
               const remoteExec = await res.json();
               if (executionIsViewOnly(remoteExec)) {
                 readOnlyMode = true;
                 reopenRevisionPending = false;
                 serverR =
                   remoteExec.responses && typeof remoteExec.responses === 'object' && !Array.isArray(remoteExec.responses)
                     ? remoteExec.responses
                     : {};
                 initialRes = { ...serverR };
               } else {
                 const remoteStatusEdit = String(remoteExec?.status || '').toUpperCase();
                 const remoteLastRevEdit = Number(remoteExec?.lastSubmittedRevision) || 0;
                 const hasServerAnswersEdit = Object.keys(serverR).some((k) => !k.startsWith('__'));
                 if (
                   (remoteStatusEdit === 'PENDING' || remoteStatusEdit === 'RECEIVED' || remoteStatusEdit === 'ACCEPTED') &&
                   remoteLastRevEdit === 0 &&
                   !hasServerAnswersEdit
                 ) {
                   shouldSanitizeFreshProgressMeta = true;
                 }
                 if (remoteExec.status === 'PAUSED') serverPausedFlag = true;
                 const rm = remoteExec.metadata;
                 if (rm && typeof rm === 'object') {
                   if (metaRevisionVisitContext(rm)) reopenRevisionPending = true;
                   if (rm.lastPauseAt) remotePausedMeta.lastPauseAt = String(rm.lastPauseAt);
                   if (rm.lastPauseReasonSummary)
                     remotePausedMeta.lastPauseReasonSummary = String(rm.lastPauseReasonSummary);
                 }
                 serverR =
                   remoteExec.responses && typeof remoteExec.responses === 'object' && !Array.isArray(remoteExec.responses)
                     ? remoteExec.responses
                     : {};
                 initialRes = mergeResponsesDraftOverServerPreserveTransitDisplacement(
                   serverR as Record<string, unknown>,
                   draftRes as Record<string, unknown>
                 );
               }
               if (remoteExec.templateId) realTemplateId = remoteExec.templateId;
               lastSubmittedRevForNext = Math.max(
                 lastSubmittedRevForNext,
                 Number(remoteExec.lastSubmittedRevision) || 0
               );
             } else {
               initialRes = draftRes;
             }
           } catch {
             initialRes = draftRes;
           }

           // Offline / GET falhou: cache local diz terminal → manter só leitura como no servidor
           if (!readOnlyMode && ctEarly && executionIsViewOnly(ctEarly)) {
               readOnlyMode = true;
               reopenRevisionPending = false;
               try {
                 const execStr = await AsyncStorage.getItem(`@brspark_execution_${taskIdNorm}`);
                 if (execStr) {
                   const c = JSON.parse(execStr);
                   if (c.responses && typeof c.responses === 'object' && !Array.isArray(c.responses)) {
                     initialRes = { ...c.responses };
                   }
                   if (c.templateId) realTemplateId = c.templateId;
                 }
               } catch {
                 /* mantém initialRes */
               }
           }

           if (lastSubmittedRevForNext === 0 && hasTaskId) {
             try {
               const execStr = await AsyncStorage.getItem(`@brspark_execution_${taskIdNorm}`);
               if (execStr) {
                 const c = JSON.parse(execStr);
                 lastSubmittedRevForNext = Math.max(
                   lastSubmittedRevForNext,
                   Number(c.lastSubmittedRevision) || 0
                 );
               }
             } catch {}
           }
         } else {
           initialRes = draftRes;
         }
      }

      // PASSO 2: Baixa o Template usando o realTemplateId
      const dbStr = await AsyncStorage.getItem('@brspark_templates');
      let db = dbStr ? JSON.parse(dbStr) : {};
      let tmpl = null;
      
      try {
         const res = await apiFetch(
           `/api/checklists/templates/${encodeURIComponent(realTemplateId)}?_t=${Date.now()}`
         );
         if (res.ok) {
            tmpl = await res.json();
            db[realTemplateId] = tmpl;
            await AsyncStorage.setItem('@brspark_templates', JSON.stringify(db));
         } else {
            throw new Error('Fallback Offline'); // Vai pro catch e tenta usar o db[realTemplateId]
         }
      } catch (e) {
         tmpl = db[realTemplateId];
         if (!tmpl) {
            Alert.alert(
              'Aviso',
              isRoutineTaskFlow
                ? 'Este modelo não está guardado neste aparelho. Com internet, abra esta tarefa de rotina uma vez (menu «Mais ações» ou a própria OS) para ficar disponível offline.'
                : 'Você está offline. Para acessar esta atividade você precisa estar online ou já tê-la aberto antes neste aparelho.',
            );
            router.back();
            return;
         }
      }
      
      setTemplate(tmpl);

      if (!readOnlyMode && shouldSanitizeFreshProgressMeta) {
        stripFreshTaskProgressMeta(initialRes, tmpl.schemaData);
      }

      // Rascunho local guardava o texto aplicado por «Definir valor» na Leitura — reaparecia ao abrir antes do gatilho.
      if (!readOnlyMode && Array.isArray(tmpl.schemaData)) {
        const { out: resSemLeitura, changed: leituraDraftSanitized } = stripLeituraKeysFromResponsesCopy(
          initialRes,
          tmpl.schemaData
        );
        if (leituraDraftSanitized) {
          initialRes = resSemLeitura;
          const draftKeySan = hasTaskId ? `@draft_tsk_${taskIdNorm}` : `@draft_chk_${id}`;
          try {
            await AsyncStorage.setItem(draftKeySan, JSON.stringify(initialRes));
          } catch {
            /* ignore */
          }
        }
      }

      // Revisão (metadata): produtividade/timers limpos; assinaturas e deslocamento início/fim anulados; resto do formulário herda a última entrega.
      // NÃO usar "rascunho vazio + rev≥1 + marcadores no servidor" para apagar campos fora do strip de revisão.
      if (hasTaskId && !readOnlyMode && reopenRevisionPending) {
        const resetToken = buildRevisionTimerResetToken(taskIdNorm, lastSubmittedRevForNext);
        const alreadyResetForThisCycle =
          String(initialRes?.[REVISION_TIMER_RESET_TOKEN_KEY] || '').trim() === resetToken;
        if (!alreadyResetForThisCycle) {
          stripFormProductivityTimerFields(initialRes, tmpl.schemaData);
          stripRevisionSessionFieldResponses(initialRes, tmpl.schemaData);
          initialRes[REVISION_TIMER_RESET_TOKEN_KEY] = resetToken;
          void routeTracker.stop().catch(() => {});
          try {
            await AsyncStorage.setItem(`@draft_tsk_${taskIdNorm}`, JSON.stringify(initialRes));
          } catch {}
        }
      }

      // Injetar Default Values (AutoFill) para campos vazios
      const skipDefaultValueTypes = new Set([
        'section_break',
        'photo',
        'photo_stamped',
        'facial_recognition',
        'vision_checklist',
        'vision_ai_analysis',
        'file_upload',
        'signature',
        'signature_summary',
        'geofence_check',
        'location_pick',
        'transit_start',
        'transit_end',
        'hidden',
        'technician_finance_expense',
        'technician_finance_revenue',
        'leitura',
        'voice_note',
        'image_annotation',
        'lookup_select',
        'repeatable_matrix',
        'opinion_scale',
      ]);
      if (!readOnlyMode && tmpl.schemaData) {
        tmpl.schemaData.forEach((f: any) => {
          const dvT = effectiveSchemaFieldType(f);
          if (!initialRes[f.id] && f.defaultValue && !skipDefaultValueTypes.has(dvT)) {
             let auto = String(f.defaultValue);
             auto = auto.replace(/{{date}}/g, new Date().toLocaleDateString('pt-BR'));
             auto = auto.replace(/{{time}}/g, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
             auto = auto.replace(/{{user\.name}}/g, 'Técnico Atual'); // Mock temporário
             initialRes[f.id] = auto;
          }
        });
      }
      if (!readOnlyMode) {
        if (!initialRes.__form_started_at) {
          initialRes.__form_started_at = new Date().toISOString();
        }
        if (initialRes.__form_active_seconds == null || initialRes.__form_active_seconds === '') {
          initialRes.__form_active_seconds = 0;
        }
      }

      if (hasTaskId && !readOnlyMode) {
        let nextRev = lastSubmittedRevForNext + 1;
        try {
          const outboxStr = await AsyncStorage.getItem('@brspark_outbox') || '[]';
          let outbox: any[] = [];
          try {
            outbox = JSON.parse(outboxStr);
          } catch {
            outbox = [];
          }
          if (!Array.isArray(outbox)) outbox = [];
          const match = outbox.find((o: any) => String(o.taskId) === taskIdNorm);
          const obRev = match?.metadata?.submissionRevision;
          if (Number.isFinite(Number(obRev)) && Number(obRev) > 0) {
            nextRev = Number(obRev);
          }
        } catch {}
        nextSubmissionRevisionRef.current = nextRev;
      } else if (!hasTaskId) {
        nextSubmissionRevisionRef.current = 1;
      }

      if (hasTaskId && !readOnlyMode && serverPausedFlag && !initialRes.__form_paused_since) {
        const pauseAt =
          remotePausedMeta.lastPauseAt || cloudPausedMeta.lastPauseAt || new Date().toISOString();
        const summary =
          remotePausedMeta.lastPauseReasonSummary || cloudPausedMeta.lastPauseReasonSummary || '';
        initialRes.__form_paused_since = pauseAt;
        const hist = parsePauseHistory(initialRes);
        const hasOpen = hist.some((ev: any) => ev?.endedAt == null && ev?.startedAt);
        if (!hasOpen) {
          initialRes[PAUSE_HISTORY_KEY] = [
            ...hist,
            {
              id: `hydrated_${Date.now()}`,
              categoryId: '__hydrated__',
              subId: '__hydrated__',
              categoryLabel: '',
              subLabel: summary,
              detail: undefined,
              startedAt: pauseAt,
              endedAt: null,
              durationSec: null,
            },
          ];
        }
      }

      setIsReadOnly(readOnlyMode);
      setResponses(initialRes);
      setServerPausedExecution(!readOnlyMode && hasTaskId && serverPausedFlag);
      if (initialRes.__form_started_at) {
        setStartTime(new Date(initialRes.__form_started_at).getTime());
      } else {
        setStartTime(Date.now());
      }

      // ── Opção B: mapa rota/trecho + cerca global do template (raio em settings) ──────
      const wantGlobalFence =
        !!tmpl?.settings?.requireGlobalGeofence && hasTaskId && !readOnlyMode && !isRoutineTaskFlow;
      const globalRad = clampGlobalGeofenceRadiusMeters(tmpl?.settings?.globalGeofenceRadius);
      globalGeofenceRadiusForNextGateRef.current = globalRad;

      if (hasTaskId && !readOnlyMode) {
        try {
          let thisTask = await findCloudTaskById(taskIdNorm);
          if (!thisTask && isRoutineTaskFlow && resolvedTaskId) {
            const rtNum = resolvedRtNumber?.trim() || '';
            thisTask = {
              id: String(resolvedTaskId),
              osNumber: rtNum || null,
              routineTaskNumber: rtNum || null,
              metadata: { routineTask: true },
              status: 'IN_PROGRESS',
              locationLat: null,
              locationLng: null,
              locationRadius: null,
              locationZoneType: null,
              locationPolygon: null,
              locationAddress: null,
            };
          }
          console.log('[GeoMap] taskId=', taskIdNorm, '| task found=', !!thisTask, '| locationZoneType=', thisTask?.locationZoneType);
          if (thisTask) {
            setCurrentTask(thisTask);
            const geoField = tmpl.schemaData?.find((f: any) => f.type === 'geofence_check');
            const fm = normalizeGeofenceFailMode(geoField?.geofenceFailMode);
            setGeofenceFailMode(fm === 'block' ? 'block' : 'warn');

            if (wantGlobalFence && !taskHasServiceLocationForGlobalGate(thisTask)) {
              Alert.alert(
                'Cerca global',
                'Este formulário exige validação de localização, mas esta OS não tem coordenadas ou zona no mapa. Peça um despacho com local ou desative a cerca global no builder.',
                [{ text: 'OK', onPress: () => router.back() }],
              );
              setLoading(false);
              return;
            }

            const isRouteOrSeg =
              thisTask.locationZoneType === 'route' || thisTask.locationZoneType === 'segment';

            if (isRouteOrSeg) {
              setShowGeoMap(true);
              pendingGlobalGeofenceAfterRouteRef.current =
                !!(wantGlobalFence && taskHasServiceLocationForGlobalGate(thisTask));
              console.log('[GeoMap] ✅ Mostrando mapa para zona (ROTA/SEGMENTO):', thisTask.locationZoneType);
            } else {
              pendingGlobalGeofenceAfterRouteRef.current = false;
              console.log(
                '[GeoMap] ⏭ Tarefa não é rota. Pulando mapa de aceite. locationZoneType=',
                thisTask?.locationZoneType,
              );
              if (wantGlobalFence && taskHasServiceLocationForGlobalGate(thisTask)) {
                setGlobalGeofenceMapTask(buildGlobalGeofenceMapTask(thisTask, globalRad));
                setShowGlobalGeofenceMap(true);
              }
            }
          } else if (wantGlobalFence && !isRoutineTaskFlow) {
            Alert.alert(
              'Cerca global',
              'Não encontramos esta OS no cache do aparelho. Sincronize e tente novamente, ou desative a cerca global no formulário.',
              [{ text: 'OK', onPress: () => router.back() }],
            );
            setLoading(false);
            return;
          } else {
            const n = (await loadAllCloudTasksForExecutionLookup()).length;
            console.log('[GeoMap] ⚠️ Task não encontrada no cache. Total no cache:', n);
          }
        } catch (e) {
          console.error('[GeoMap] erro:', e);
        }
      } else {
        console.log('[GeoMap] sem taskId ou readOnly — taskId=', taskIdNorm, 'readOnlyMode=', readOnlyMode);
      }

      // Dashboard: aba "Em andamento" usa @brspark_inprogress_tasks. Só gravávamos no 1.º handleInput
      // (assíncrono) — offline com rascunho já carregado ou saída rápida deixava a OS em "Pendentes".
      // Revisão ainda não "Aceite" (PENDING/RECEIVED sem id em accepted_tasks): não marcar até o fluxo do modal.
      if (resolvedTaskId && !readOnlyMode) {
        let skipAutoInProgress = false;
        if (reopenRevisionPending) {
          try {
            const allCt = await loadAllCloudTasksForExecutionLookup();
            const ct = allCt.find((t: any) => String(t.id) === String(resolvedTaskId));
            const st = String(ct?.status || '').toUpperCase();
            const accRaw = await AsyncStorage.getItem('@brspark_accepted_tasks') || '[]';
            let acc: string[] = [];
            try {
              acc = JSON.parse(accRaw);
            } catch {
              acc = [];
            }
            if (!Array.isArray(acc)) acc = [];
            const accepted = acc.includes(String(resolvedTaskId));
            if ((st === 'PENDING' || st === 'RECEIVED') && !accepted) {
              skipAutoInProgress = true;
            }
          } catch {
            /* se não der para avaliar, marcar em andamento — comportamento legado */
          }
        }
        if (!skipAutoInProgress) {
          await ensureTaskMarkedInProgressLocally(resolvedTaskId);
        }
      }

      // Only mark loading done after geo state is set — prevents form flash
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const updateLocalCloudTaskFields = useCallback(
    async (tid: string, patch: { status?: string; metadata?: Record<string, unknown> }) => {
      try {
        await patchCloudTaskById(String(tid), (row) => ({
          ...row,
          ...(patch.status ? { status: patch.status } : {}),
          metadata: { ...(row.metadata || {}), ...(patch.metadata || {}) },
        }));
      } catch {}
    },
    []
  );

  const unpauseExecutionFromServer = useCallback(async () => {
    if (!resolvedTaskId) return;
    const ts = new Date().toISOString();
    const cur = responsesRefForFacial.current;
    const rb =
      cur && typeof cur === 'object' && !Array.isArray(cur) ? ({ ...cur } as Record<string, unknown>) : {};
    if (rb.__form_paused_since != null) delete rb.__form_paused_since;
    const hasResp = Object.keys(rb).length > 0;
    await enqueueExecutionStatusPatch(resolvedTaskId, {
      status: 'IN_PROGRESS',
      timestamp: ts,
      metadata: { executionPaused: false, lastResumedAt: ts },
      ...(hasResp ? { responses: rb } : {}),
    });
    await updateLocalCloudTaskFields(resolvedTaskId, {
      status: 'IN_PROGRESS',
      metadata: { executionPaused: false, lastResumedAt: ts },
    });
    setServerPausedExecution(false);
    setCurrentTask((prev: any) => (prev ? { ...prev, status: 'IN_PROGRESS' } : prev));
    fgSegmentStartRef.current = Date.now();
  }, [resolvedTaskId, updateLocalCloudTaskFields]);

  const confirmStartPause = (cat: PauseCategoryDef, subId: string, detail: string) => {
    const sub = cat.subs.find((s) => s.id === subId);
    if (!sub) return;
    if (sub.requiresDetail && detail.trim().length < PAUSE_DETAIL_MIN_LEN) {
      Alert.alert(t('common.attention'), t('pause.validationDetail'));
      return;
    }
    const openLeg = getActiveTransitLegInfo(
      template?.schemaData,
      (responsesRefForFacial.current || responses) as Record<string, unknown>
    );
    if (openLeg) {
      Alert.alert(t('pause.blockOsPauseDuringTransitTitle'), t('pause.blockOsPauseDuringTransitBody'));
      return;
    }
    void routeTracker.pause();

    const catLabel = t(cat.i18nKey);
    const subLabel = t(sub.i18nKey);
    const startedAt = new Date().toISOString();
    const evId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    setResponses((prev: any) => {
      const now = Date.now();
      let base = { ...prev };
      if (fgSegmentStartRef.current != null) {
        const delta = Math.floor((now - fgSegmentStartRef.current) / 1000);
        fgSegmentStartRef.current = null;
        if (delta > 0) {
          const b = Number(base.__form_active_seconds) || 0;
          base.__form_active_seconds = b + delta;
        }
      }
      const hist = parsePauseHistory(base);
      const ev = {
        id: evId,
        categoryId: cat.id,
        subId: sub.id,
        detail: sub.requiresDetail ? detail.trim() : undefined,
        categoryLabel: catLabel,
        subLabel,
        startedAt,
        endedAt: null,
        durationSec: null,
      };
      const next = {
        ...base,
        __form_paused_since: startedAt,
        [PAUSE_HISTORY_KEY]: [...hist, ev],
      };
      void AsyncStorage.setItem(draftKeyForForm, JSON.stringify(next));
      responsesRefForFacial.current = next;
      if (resolvedTaskId) {
        const summary = getOpenPauseSummaryFromResponses(next);
        const tid = resolvedTaskId;
        queueMicrotask(() => {
          void updateLocalCloudTaskFields(tid, {
            status: 'PAUSED',
            metadata: {
              executionPaused: true,
              lastPauseReasonSummary: summary,
              lastPauseAt: startedAt,
            },
          });
          void enqueueExecutionStatusPatch(tid, {
            status: 'PAUSED',
            timestamp: startedAt,
            responses: next,
            metadata: {
              executionPaused: true,
              lastPauseReasonSummary: summary,
              lastPauseAt: startedAt,
            },
          });
          void AsyncStorage.getItem('@brspark_email')
            .then((email) => pushSyncQueue(email || undefined))
            .catch(() => {});
        });
      }
      return next;
    });
    setCurrentTask((prev: any) => (prev ? { ...prev, status: 'PAUSED' } : prev));
    setServerPausedExecution(true);
    setPauseReasonModalVisible(false);
    setPausePickerStep('category');
    setPauseSelectedCategory(null);
    setPauseDetailDraft('');
    setPauseHighlightSubId(null);
  };

  const resumeFromPauseOverlay = () => {
    const endedAt = new Date().toISOString();
    setServerPausedExecution(false);
    setCurrentTask((prev: any) => (prev ? { ...prev, status: 'IN_PROGRESS' } : prev));
    let resumedResponses: Record<string, any> | null = null;
    setResponses((prev: any) => {
      const hist = [...parsePauseHistory(prev)];
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i]?.endedAt == null && hist[i]?.startedAt) {
          const st = new Date(hist[i].startedAt).getTime();
          const en = new Date(endedAt).getTime();
          hist[i] = {
            ...hist[i],
            endedAt,
            durationSec: Math.max(0, Math.floor((en - st) / 1000)),
          };
          break;
        }
      }
      const next: any = { ...prev };
      delete next.__form_paused_since;
      next[PAUSE_HISTORY_KEY] = hist;
      void AsyncStorage.setItem(draftKeyForForm, JSON.stringify(next));
      responsesRefForFacial.current = next;
      resumedResponses = next;
      return next;
    });
    void routeTracker.resume();
    fgSegmentStartRef.current = Date.now();
    if (resolvedTaskId) {
      void (async () => {
        const snap = resumedResponses;
        await enqueueExecutionStatusPatch(resolvedTaskId, {
          status: 'IN_PROGRESS',
          timestamp: endedAt,
          metadata: { executionPaused: false, lastResumedAt: endedAt },
          ...(snap && typeof snap === 'object' ? { responses: snap } : {}),
        });
        await updateLocalCloudTaskFields(resolvedTaskId, {
          status: 'IN_PROGRESS',
          metadata: { executionPaused: false, lastResumedAt: endedAt },
        });
      })();
    }
  };

  const applyPauseExitAndThen = useCallback(
    (navigateAway: () => void) => {
      const endedAt = new Date().toISOString();
      const prev = responsesForPauseExitRef.current;
      const summary = getOpenPauseSummaryFromResponses(prev);
      void AsyncStorage.setItem(draftKeyForForm, JSON.stringify(prev));
      void (async () => {
        try {
          if (resolvedTaskId) {
            await updateLocalCloudTaskFields(resolvedTaskId, {
              status: 'PAUSED',
              metadata: {
                executionPaused: true,
                lastPauseReasonSummary: summary,
                lastPauseAt: endedAt,
              },
            });
            void enqueueExecutionStatusPatch(resolvedTaskId, {
              status: 'PAUSED',
              timestamp: endedAt,
              responses: prev,
              metadata: {
                executionPaused: true,
                lastPauseReasonSummary: summary,
                lastPauseAt: endedAt,
              },
            });
          }
        } finally {
          navigateAway();
        }
      })();
    },
    [draftKeyForForm, resolvedTaskId, updateLocalCloudTaskFields]
  );

  const promptPauseExit = useCallback((onConfirmedExit: () => void) => {
    const now = Date.now();
    if (now - pauseExitAlertGateRef.current < 800) return;
    pauseExitAlertGateRef.current = now;
    const resetGate = () => {
      pauseExitAlertGateRef.current = 0;
    };
    Alert.alert(
      t('pause.exitTitle'),
      t('pause.exitMsg'),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: resetGate },
        {
          text: t('pause.exitBtn'),
          style: 'destructive',
          onPress: () => {
            resetGate();
            pauseExitBypassBeforeRemoveUntilRef.current = Date.now() + 4000;
            onConfirmedExit();
          },
        },
      ],
      Platform.OS === 'android' ? { cancelable: true, onDismiss: resetGate } : undefined
    );
  }, [t]);

  const exitPauseToList = useCallback(() => {
    promptPauseExit(() => applyPauseExitAndThen(() => router.back()));
  }, [promptPauseExit, applyPauseExitAndThen, router]);

  useEffect(() => {
    if (!resolvedTaskId || isReadOnly) return undefined;
    const sub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void; data?: { action: unknown } }) => {
      if (Date.now() < pauseExitBypassBeforeRemoveUntilRef.current) {
        return;
      }
      if (!responses.__form_paused_since) return;
      e.preventDefault();
      const action = e.data?.action;
      promptPauseExit(() =>
        applyPauseExitAndThen(() => {
          if (action != null) {
            navigation.dispatch(action as never);
          } else {
            router.back();
          }
        })
      );
    });
    return sub;
  }, [
    navigation,
    resolvedTaskId,
    isReadOnly,
    responses.__form_paused_since,
    applyPauseExitAndThen,
    router,
    promptPauseExit,
  ]);

  const handleInput = (fieldId: string, value: any, scope?: SectionRepeatScope | null) => {
    if (isReadOnly) {
      // Com OS já concluída no servidor, a visão IA ainda pode estar `pending_analysis` (captura offline).
      // O retry automático ou «Tentar análise agora» precisa gravar `status: completed` mesmo em só leitura.
      if (fieldId.startsWith('__')) return;
      const roField = template?.schemaData?.find((f: any) => f.id === fieldId);
      const roFt = roField ? effectiveSchemaFieldType(roField) : '';
      const roVision = roFt === 'vision_checklist' || roFt === 'vision_ai_analysis';
      const roSt =
        value && typeof value === 'object' && !Array.isArray(value)
          ? String((value as Record<string, unknown>).status || '').toLowerCase()
          : '';
      if (!(roVision && roSt === 'completed')) return;
    }

    const isMetaField = fieldId.startsWith('__');
    const fieldDef = !isMetaField ? template?.schemaData?.find((f: any) => f.id === fieldId) : null;
    const isTransitField =
      fieldDef &&
      (fieldDef.type === 'transit_start' || fieldDef.type === 'transit_end');
    if (serverPausedExecution && !isTransitField) return;
    if (responses.__form_paused_since && !isTransitField) return;

    if (isTransitField && fieldDef) {
      const prevVal = scope
        ? getScopedFieldValue(responses, scope, fieldId)
        : responses[fieldId];
      const clearing =
        value === '' ||
        value === null ||
        value === undefined ||
        (typeof value === 'string' && !String(value).trim());

      if (clearing && isTransitEvidenceNonempty(prevVal)) return;
      if (fieldDef.type === 'transit_end' && !clearing && isTransitEvidenceNonempty(prevVal)) return;

      if (fieldDef.type === 'transit_start') {
        const endF = findTransitEndFieldAfterStart(template?.schemaData, fieldId);
        const endVal = endF?.id
          ? scope
            ? getScopedFieldValue(responses, scope, endF.id)
            : responses[endF.id]
          : undefined;
        if (isTransitEvidenceNonempty(endVal)) return;
        if (
          !clearing &&
          shouldBlockTransitStartAfterOperationalDisplacementFinished(
            template?.schemaData,
            fieldDef,
            responses as Record<string, unknown>,
            scope ?? null
          )
        ) {
          return;
        }
      }
    }

    let stored = value;
    if (fieldDef && fieldAllowsMultiple(fieldDef) && (value === null || value === '')) {
      stored = [];
    }

    const draftKey = resolvedTaskId ? `@draft_tsk_${resolvedTaskId}` : `@draft_chk_${id}`;

    setResponses((prev: any) => {
      if (Object.keys(prev).length === 0) {
        notifyKanbanStatus('IN_PROGRESS');
      }

      if (scope) {
        const rkey = sectionRepeatStorageKey(scope.sectionId);
        const rows = Array.isArray(prev[rkey]) ? [...prev[rkey]] : [];
        while (rows.length <= scope.rowIndex) rows.push({});
        const prevRow = rows[scope.rowIndex] && typeof rows[scope.rowIndex] === 'object' ? rows[scope.rowIndex] : {};
        const row = { ...prevRow, [fieldId]: stored };
        rows[scope.rowIndex] = row;
        const tkey = `__time_${scope.sectionId}_r${scope.rowIndex}_${fieldId}`;
        const newRes = {
          ...prev,
          [rkey]: rows,
          ...(!isMetaField ? { [tkey]: new Date().toISOString() } : {}),
        };
        void AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
        responsesRefForFacial.current = newRes;
        return newRes;
      }

      const timeKey = `__time_${fieldId}`;
      const newRes = {
        ...prev,
        [fieldId]: stored,
        ...(isMetaField ? {} : { [timeKey]: new Date().toISOString() }),
      };
      void AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
      responsesRefForFacial.current = newRes;
      return newRes;
    });

    if (resolvedTaskId) {
      void ensureTaskMarkedInProgressLocally(resolvedTaskId);
    }
  };

  handleInputRef.current = handleInput;

  const closeChecklistBarcodeModal = useCallback(() => {
    checklistBarcodeTargetRef.current = null;
    setChecklistBarcodeModalOpen(false);
  }, []);

  const onChecklistBarcodeScanned = useCallback(({ data }: { data: string }) => {
    if (barcodeScanLockRef.current) return;
    const tgt = checklistBarcodeTargetRef.current;
    if (!tgt) return;
    const s = String(data ?? '').trim();
    if (!s) return;
    barcodeScanLockRef.current = true;
    const hi = handleInputRef.current;
    if (typeof hi === 'function') hi(tgt.fieldId, s, tgt.scope);
    checklistBarcodeTargetRef.current = null;
    setChecklistBarcodeModalOpen(false);
    setTimeout(() => {
      barcodeScanLockRef.current = false;
    }, 1200);
  }, []);

  const runVisionChecklistAnalyze = useCallback(
    async (
      field: any,
      assetUri: string,
      mimeType: string,
      fileName: string,
      scope?: SectionRepeatScope | null,
      opts?: { persistExtras?: Record<string, unknown>; quiet?: boolean },
    ) => {
      const quiet = !!opts?.quiet;
      const qs = getVisionQuestionsFromField(field);
      if (!qs.length) {
        if (!quiet) {
          Alert.alert('Configuração', 'Este campo não tem prompt de análise configurado no modelo.');
        }
        return;
      }
      try {
        const pathOnly = assetUri.split('?')[0];
        const info = await FileSystem.getInfoAsync(pathOnly);
        if (info.exists && typeof info.size === 'number' && info.size > 92 * 1024 * 1024) {
          if (!quiet) {
            Alert.alert('Arquivo grande', 'O arquivo excede ~92 MB. Escolha outro vídeo ou reduza a duração.');
          }
          return;
        }
      } catch {
        /* segue sem tamanho */
      }

      const persistPendingVision = () => {
        const hi0 = handleInputRef.current;
        const ext =
          opts?.persistExtras && typeof opts.persistExtras === 'object' ? opts.persistExtras : {};
        if (typeof hi0 !== 'function') return;
        const geo = visionGeoFieldsFromCaptureUri(assetUri);
        hi0(
          field.id,
          {
            ...ext,
            status: VISION_STATUS_PENDING_ANALYSIS,
            localUri: assetUri,
            mediaMimeType: mimeType,
            mediaFileName: fileName,
            pendingSince: new Date().toISOString(),
            ...geo,
          },
          scope,
        );
        void mergeAddrIntoVisionFieldIfStillCurrent({
          getResponses: () => responsesRefForFacial.current,
          applyInput: (fid, val, sc) => {
            const h = handleInputRef.current;
            if (typeof h === 'function') h(fid, val, sc);
          },
          fieldId: field.id,
          scope,
          uriAtCommit: assetUri,
        });
      };

      try {
        const netState = await Network.getNetworkStateAsync();
        if (netState.isConnected === false) {
          persistPendingVision();
          if (!quiet) {
            Alert.alert(
              'Guardado',
              'Sem ligação à internet. A mídia ficou no rascunho e a análise de visão IA corre automaticamente quando houver rede.',
            );
          }
          return;
        }
      } catch {
        persistPendingVision();
        if (!quiet) {
          Alert.alert(
            'Guardado',
            'Não foi possível confirmar a rede. A mídia ficou no rascunho para análise automática quando houver ligação.',
          );
        }
        return;
      }

      const token = await getToken();
      if (!token) {
        persistPendingVision();
        if (!quiet) {
          Alert.alert(
            'Sessão',
            'Faça login quando houver rede para enviar a análise. A mídia foi mantida no rascunho.',
          );
        }
        return;
      }

      const busyKey = visionAnalyzeBusyKey(field.id, scope ?? null);
      if (!quiet) setVisionAnalyzeBusyId(busyKey);
      /** Só depois de `apiFetch` devolver `Response` — evita tratar `throw new Error(msg do servidor)` como falha de rede. */
      let visionApiReturned = false;
      try {
        /** YOLO (detecção) só aceita imagem: extrair 1.º frame do vídeo antes do multipart. */
        let uploadUri = assetUri;
        let uploadMime = mimeType || 'application/octet-stream';
        let uploadName = fileName || 'upload.jpg';
        if (
          effectiveSchemaFieldType(field) === 'vision_checklist' &&
          String(uploadMime).toLowerCase().startsWith('video/')
        ) {
          try {
            const videoSrc = assetUri.split('?')[0];
            const { uri: frameUri } = await VideoThumbnails.getThumbnailAsync(videoSrc, {
              time: 0,
              quality: 0.88,
            });
            uploadUri = frameUri;
            uploadMime = 'image/jpeg';
            const stem =
              (fileName && String(fileName).replace(/\.[^.]+$/i, '')) ||
              `vision_${String(field?.id || 'campo')
                .replace(/[^\w-]+/g, '_')
                .slice(0, 48)}`;
            uploadName = `${stem}-frame.jpg`;
          } catch {
            if (!quiet) {
              Alert.alert(
                i18n.t('checklistForm.visionYoloVideoFrameTitle'),
                i18n.t('checklistForm.visionYoloVideoFrameBody'),
              );
            }
            return;
          }
        }

        const form = new FormData();
        form.append(
          'engine',
          field.type === 'vision_ai_analysis'
            ? 'google_ai_studio'
            : user?.tenant?.visionDetectionEngine === 'moondream'
              ? 'moondream'
              : 'yolo',
        );
        if (
          (effectiveSchemaFieldType(field) === 'vision_ai_analysis' ||
            effectiveSchemaFieldType(field) === 'vision_checklist') &&
          field.visionRating0To10Enabled === true
        ) {
          form.append('visionRating0To10', '1');
        }
        form.append('questions', JSON.stringify(qs));
        form.append('media', {
          uri: uploadUri,
          type: uploadMime,
          name: uploadName,
        } as any);
        const res = await apiFetch('/api/checklists/vision/analyze', {
          method: 'POST',
          body: form,
          /** Análise Gemini pode demorar; manter ≥ timeout do servidor (`visionStudioAnalyze`). */
          timeoutMs: 360_000,
        });
        visionApiReturned = true;
        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(
            res.status >= 500
              ? 'O servidor devolveu uma resposta inválida (não é JSON). O serviço de visão pode estar em erro, tente mais tarde ou contacte o suporte.'
              : text.slice(0, 280),
          );
        }
        if (res.status === 401) {
          await handleUnauthorizedMaybeSessionInvalidated(res);
        }
        if (!res.ok) {
          const baseErr = String(json?.error || `Erro HTTP ${res.status}`);
          const allow = json?.allow ? ` Métodos permitidos (Allow): ${String(json.allow)}.` : '';
          const det = json?.detail ? String(json.detail).replace(/\s+/g, ' ').trim().slice(0, 240) : '';
          const intT = json?.integrationTarget
            ? `\n\nDestino na integração (painel): ${String(json.integrationTarget)}`
            : '';
          const extra = [allow, det ? `\n\n${det}` : '', intT].join('');
          throw new Error(baseErr + extra);
        }
        if (!Array.isArray(json?.answers)) {
          throw new Error(
            field.type === 'vision_ai_analysis'
              ? 'A resposta do servidor não contém a lista de respostas esperada. Verifique a integração «Google AI Studio» e o modelo configurado.'
              : 'A resposta do servidor não contém a lista de respostas esperada. Verifique o serviço de visão (integrações «Visão IA - YOLO» ou «Visão IA - Moondream» no painel).',
          );
        }
        const hi = handleInputRef.current;
        const extra =
          opts?.persistExtras && typeof opts.persistExtras === 'object' ? opts.persistExtras : {};
        const geo = visionGeoFieldsFromCaptureUri(assetUri);
        const merged = {
          ...json,
          localUri: assetUri,
          mediaMimeType: mimeType,
          mediaFileName: fileName,
          ...extra,
          ...geo,
        };
        if (typeof hi === 'function') hi(field.id, merged, scope);
        void mergeAddrIntoVisionFieldIfStillCurrent({
          getResponses: () => responsesRefForFacial.current,
          applyInput: (fid, val, sc) => {
            const h = handleInputRef.current;
            if (typeof h === 'function') h(fid, val, sc);
          },
          fieldId: field.id,
          scope,
          uriAtCommit: assetUri,
        });
        const { isReadOnly: roVision, taskId: tidVision } = visionPatchAfterAnalyzeRef.current;
        if (roVision && tidVision) {
          queueMicrotask(async () => {
            try {
              const snap = responsesRefForFacial.current;
              if (!snap || typeof snap !== 'object') return;
              await enqueueExecutionStatusPatch(String(tidVision), { responses: snap });
            } catch (err) {
              console.warn('[vision] PATCH responses após análise:', err);
            }
          });
        }
      } catch (e: any) {
        const raw = String(e?.message || e?.cause?.message || e || '').toLowerCase();
        const looksNet =
          !visionApiReturned &&
          (e?.name === 'AbortError' ||
            raw.includes('network request failed') ||
            raw.includes('failed to fetch') ||
            raw.includes('networkerror') ||
            raw.includes('load failed') ||
            (e?.name === 'TypeError' && raw.includes('fetch failed')));
        let msg: string;
        if (!visionApiReturned && (e?.name === 'AbortError' || looksNet)) {
          persistPendingVision();
          msg =
            e?.name === 'AbortError'
              ? 'Tempo esgotado ao enviar. A mídia foi guardada, a análise será tentada de novo automaticamente com rede.'
              : 'Sem ligação ou servidor inacessível. A mídia foi guardada para análise automática quando a rede voltar.';
        } else {
          msg = e?.message || 'Não foi possível analisar a mídia.';
        }
        if (!quiet) Alert.alert('Visão IA', msg);
      } finally {
        if (!quiet) setVisionAnalyzeBusyId(null);
      }
    },
    [],
  );

  const retryVisionPendingAnalysisField = useCallback(
    (field: any, scope?: SectionRepeatScope | null, retryOpts?: { quiet?: boolean }) => {
      const raw = getScopedFieldValue(responsesRefForFacial.current, scope ?? null, field.id);
      const o = parseVisionChecklistStored(raw);
      const pending = !!(o && isVisionPendingAnalysisRecord(o));
      const runnable = !!(o && visionStoredHasRunnableMedia(field, o));
      if (!o || !isVisionPendingAnalysisRecord(o) || !visionStoredHasRunnableMedia(field, o)) return;
      const uri = String(o.localUri || '').trim();
      if (!uri) return;
      const mime = String(o.mediaMimeType || 'application/octet-stream');
      const name = String(
        o.mediaFileName || (String(mime).startsWith('video') ? 'video.mp4' : 'foto.jpg'),
      );
      const layout = getVisionAnalysisGridLayout(field);
      const slots = normalizeVisionGridSlotUris(o.gridSlotUris, layout.count);
      const quiet = !!retryOpts?.quiet;
      const baseOpts = layout.count > 1 ? { persistExtras: { gridSlotUris: slots as string[] }, quiet } : { quiet };
      void runVisionChecklistAnalyze(field, uri, mime, name, scope ?? null, baseOpts);
    },
    [runVisionChecklistAnalyze],
  );

  /** Ao focar o checklist com rede: tenta concluir análises de visão IA ainda `pending_analysis` (sem alertas). */
  useFocusEffect(
    useCallback(() => {
      const tid = setTimeout(() => {
        void (async () => {
          try {
            const net = await Network.getNetworkStateAsync();
            if (net.isConnected !== true) return;
          } catch {
            return;
          }
          const schema = template?.schemaData;
          if (!Array.isArray(schema) || schema.length === 0) return;
          const res = responsesRefForFacial.current;
          if (!res || typeof res !== 'object') return;

          let currentSectionId: string | null = null;
          let curSecRepeat = false;
          let pendingQueued = 0;
          for (const f of schema) {
            if (f.type === 'section_break') {
              currentSectionId = f.id;
              curSecRepeat = sectionAllowsRepeat(f);
              continue;
            }
            if (!isVisionSimNaoMediaFieldType(effectiveSchemaFieldType(f))) continue;

            const runScope = (sc: SectionRepeatScope | null) => {
              const raw = getScopedFieldValue(res, sc, f.id);
              const o = parseVisionChecklistStored(raw);
              if (!o || !isVisionPendingAnalysisRecord(o) || !visionStoredHasRunnableMedia(f, o)) return;
              pendingQueued += 1;
              retryVisionPendingAnalysisField(f, sc, { quiet: true });
            };

            if (!curSecRepeat) {
              runScope(null);
            } else if (currentSectionId) {
              const rows = getRepeatRows(res, currentSectionId);
              for (let ri = 0; ri < rows.length; ri++) {
                runScope({ sectionId: currentSectionId, rowIndex: ri });
              }
            }
          }
        })();
      }, 900);
      return () => clearTimeout(tid);
    }, [template?.schemaData, retryVisionPendingAnalysisField]),
  );

  const openVisionChecklistMedia = (field: any, scope?: SectionRepeatScope | null) => {
    if (isReadOnly) return;
    const qs = getVisionQuestionsFromField(field);
    if (!qs.length) {
      Alert.alert('Modelo', 'Configure o prompt estruturado deste campo no painel.');
      return;
    }
    const gridLayout = getVisionAnalysisGridLayout(field);
    const vft = effectiveSchemaFieldType(field);
    if ((vft === 'vision_ai_analysis' || vft === 'vision_checklist') && gridLayout.count > 1) {
      return;
    }
    void (async () => {
      await ensureOnlineValidation(field, async () => {
        try {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('common.attention'), t('checklistForm.permissionCameraDenied'));
            return;
          }
          const mediaTypes = getVisionCaptureMediaTypes(field);
          const pickerOpts: ImagePicker.ImagePickerOptions = {
            quality: 0.65,
            mediaTypes,
          };
          if (
            mediaTypes === ImagePicker.MediaTypeOptions.All ||
            mediaTypes === ImagePicker.MediaTypeOptions.Videos
          ) {
            pickerOpts.videoMaxDuration = VISION_CAMERA_VIDEO_MAX_SECONDS;
          }
          const res = await ImagePicker.launchCameraAsync(pickerOpts);
          if (res.canceled || !res.assets?.length) return;
          const a = res.assets[0];
          const mime = inferMimeFromVisionCameraAsset(a);
          if (!(await assertVisionCameraVideoWithinMaxSeconds(a, a.uri, mime))) return;
          const pathLower = (a.uri || '').split('?')[0].toLowerCase();
          const defaultVideoName = pathLower.endsWith('.mov') || pathLower.endsWith('.qt')
            ? 'video.mov'
            : 'video.mp4';
          const name =
            a.fileName ||
            (String(mime).startsWith('video') ? defaultVideoName : 'foto.jpg');
          const facialQs = await buildFacialCaptureQuerySuffix();
          const captureUri = (a.uri || '').split('?')[0] + facialQs;
          await runVisionChecklistAnalyze(field, captureUri, mime, name, scope ?? null);
        } catch (err: any) {
          Alert.alert(
            t('checklistForm.cameraUnavailableTitle'),
            err?.message || t('checklistForm.cameraUnavailableBody'),
          );
        }
      });
    })();
  };

  const openVisionAnalysisGridSlot = (field: any, scope: SectionRepeatScope | null | undefined, slotIndex: number) => {
    if (isReadOnly) return;
    const qs = getVisionQuestionsFromField(field);
    if (!qs.length) {
      Alert.alert('Modelo', 'Configure o prompt estruturado deste campo no painel.');
      return;
    }
    const layout = getVisionAnalysisGridLayout(field);
    if (layout.count <= 1 || slotIndex < 0 || slotIndex >= layout.count) return;
    void (async () => {
      await ensureOnlineValidation(field, async () => {
        try {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('common.attention'), t('checklistForm.permissionCameraDenied'));
            return;
          }
          const pickerOpts: ImagePicker.ImagePickerOptions = {
            quality: 0.65,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          };
          const res = await ImagePicker.launchCameraAsync(pickerOpts);
          if (res.canceled || !res.assets?.length) return;
          const a = res.assets[0];
          const facialQs = await buildFacialCaptureQuerySuffix();
          const uri = (a.uri || '').split('?')[0] + facialQs;
          const hi = handleInputRef.current;
          if (typeof hi !== 'function') return;
          const raw = getScopedFieldValue(responsesRefForFacial.current, scope ?? null, field.id);
          const prev = parseVisionChecklistStored(raw);
          const slots = normalizeVisionGridSlotUris(prev?.gridSlotUris, layout.count);
          slots[slotIndex] = uri;
          const nextObj: Record<string, unknown> = {
            gridSlotUris: slots,
            status: 'draft',
          };
          hi(field.id, JSON.stringify(nextObj), scope ?? null);
        } catch (err: any) {
          Alert.alert(
            t('checklistForm.cameraUnavailableTitle'),
            err?.message || t('checklistForm.cameraUnavailableBody'),
          );
        }
      });
    })();
  };

  const startVisionGridAnalyze = (field: any, scope?: SectionRepeatScope | null) => {
    if (visionGridCompose) return;
    const layout = getVisionAnalysisGridLayout(field);
    if (layout.count <= 1) return;
    const raw = getScopedFieldValue(responsesRefForFacial.current, scope ?? null, field.id);
    const prev = parseVisionChecklistStored(raw);
    if (
      prev &&
      isVisionPendingAnalysisRecord(prev) &&
      visionStoredHasRunnableMedia(field, prev)
    ) {
      const uri = String(prev.localUri || '').trim();
      const mime = String(prev.mediaMimeType || 'image/png');
      const name = String(prev.mediaFileName || 'grelha-visao.png');
      const slotsForExtras = normalizeVisionGridSlotUris(prev.gridSlotUris, layout.count);
      void runVisionChecklistAnalyze(field, uri, mime, name, scope ?? null, {
        persistExtras: { gridSlotUris: slotsForExtras },
      });
      return;
    }
    const slots = normalizeVisionGridSlotUris(prev?.gridSlotUris, layout.count);
    if (!slots.every((u) => u.length > 0)) {
      Alert.alert('Fotos em falta', `Capture as ${layout.count} fotos da grelha antes de analisar.`);
      return;
    }
    setVisionGridCompose({
      uris: slots.slice(),
      cols: layout.cols,
      rows: layout.rows,
      field,
      scope: scope ?? null,
      slotUrisForPersist: slots.slice(),
    });
  };

  const facialFlushBusyRef = useRef(false);

  const flushPendingFacialVerifications = useCallback(async () => {
    if (isReadOnly || loading) return;
    if (facialFlushBusyRef.current) return;
    const tmpl = templateRefForFacial.current;
    if (!tmpl?.schemaData?.length) return;
    try {
      const netState = await Network.getNetworkStateAsync();
      if (netState.isConnected === false) return;
    } catch {
      return;
    }
    /** Só depois do await: snapshot antigo antes da rede fazia o flush ignorar ou desalinhar com o rascunho atual. */
    const res = responsesRefForFacial.current;
    facialFlushBusyRef.current = true;
    try {
      let currentSectionId: string | null = null;
      let curSecRepeat = false;
      for (const f of tmpl.schemaData) {
        if (f.type === 'section_break') {
          currentSectionId = f.id;
          curSecRepeat = sectionAllowsRepeat(f);
          continue;
        }
        if (f.type !== 'facial_recognition') continue;
        if (schemaFieldRequiresOnlineValidation(f)) continue;

        const runForScope = async (scope: SectionRepeatScope | null) => {
          const bioRaw = getScopedFieldValue(res, scope, facialBiometricStorageKey(f.id));
          const audit = parseFacialBiometricAudit(bioRaw);
          if (!(audit as { pending?: boolean } | null)?.pending) return;
          const uriRaw = getScopedFieldValue(res, scope, f.id);
          const uri = firstFacialMediaUri(uriRaw);
          if (!uri) return;
          const path = uri.split('?')[0];
          let b64: string;
          try {
            const info = await FileSystem.getInfoAsync(path);
            if (!info.exists) return;
            b64 = await FileSystem.readAsStringAsync(path, { encoding: 'base64' });
          } catch {
            return;
          }
          const result = await postVerifyFaceForField(f, b64);
          const bioKey = facialBiometricStorageKey(f.id);
          const hiFlush = handleInputRef.current;
          if (typeof hiFlush !== 'function') return;
          if (result.ok) {
            const apiResp = result.data as any;
            const prevCap = (audit as { capturedAt?: string })?.capturedAt;
            const prevGeo = audit as {
              captureLat?: string;
              captureLng?: string;
              captureAddr?: string;
            };
            hiFlush(
              bioKey,
              JSON.stringify({
                pending: false,
                at: new Date().toISOString(),
                ...(typeof prevCap === 'string' && prevCap.trim()
                  ? { capturedAt: prevCap.trim() }
                  : {}),
                ...(prevGeo.captureLat && prevGeo.captureLng
                  ? { captureLat: String(prevGeo.captureLat), captureLng: String(prevGeo.captureLng) }
                  : {}),
                ...(prevGeo.captureAddr && String(prevGeo.captureAddr).trim()
                  ? { captureAddr: String(prevGeo.captureAddr).trim() }
                  : {}),
                engine: normalizeFacialEngineForStorage(apiResp.engine),
                confidence: apiResp.confidence,
                facialAuthMode: apiResp.facialAuthMode || f.facialAuthMode || 'self_verify',
                identifiedUserId: apiResp.identifiedUserId ?? apiResp.identifiedUser?.id,
                identifiedUser: apiResp.identifiedUser,
              }),
              scope
            );
          } else if (result.kind === 'no_match') {
            const prevCapNm = (audit as { capturedAt?: string })?.capturedAt;
            const prevGeoNm = audit as {
              captureLat?: string;
              captureLng?: string;
              captureAddr?: string;
            };
            hiFlush(
              bioKey,
              JSON.stringify({
                pending: false,
                deferredValidationFailed: true,
                at: new Date().toISOString(),
                ...(typeof prevCapNm === 'string' && prevCapNm.trim()
                  ? { capturedAt: prevCapNm.trim() }
                  : {}),
                ...(prevGeoNm.captureLat && prevGeoNm.captureLng
                  ? { captureLat: String(prevGeoNm.captureLat), captureLng: String(prevGeoNm.captureLng) }
                  : {}),
                ...(prevGeoNm.captureAddr && String(prevGeoNm.captureAddr).trim()
                  ? { captureAddr: String(prevGeoNm.captureAddr).trim() }
                  : {}),
                facialAuthMode: f.facialAuthMode === 'identify' ? 'identify' : 'self_verify',
                message:
                  sanitizeFacialUserFacingCopy(result.message) ||
                  'Após ligação à rede, o servidor não reconheceu este rosto. Peça ao administrador para atualizar as fotos de referência no painel (Usuários → Reconhecimento facial) ou capture de novo.',
              }),
              scope
            );
          }
        };

        if (!curSecRepeat) {
          await runForScope(null);
        } else if (currentSectionId) {
          const rows = getRepeatRows(res, currentSectionId);
          for (let ri = 0; ri < rows.length; ri++) {
            await runForScope({ sectionId: currentSectionId, rowIndex: ri });
          }
        }
      }
    } finally {
      facialFlushBusyRef.current = false;
    }
  }, [isReadOnly, loading]);

  const visionFlushBusyRef = useRef(false);

  const flushPendingVisionAnalyses = useCallback(async () => {
    if (isReadOnly || loading) return;
    if (visionFlushBusyRef.current) return;
    const tmpl = templateRefForFacial.current;
    if (!tmpl?.schemaData?.length) return;
    try {
      const netState = await Network.getNetworkStateAsync();
      if (netState.isConnected === false) return;
    } catch {
      return;
    }
    const token = await getToken();
    if (!token) return;
    const res = responsesRefForFacial.current;
    visionFlushBusyRef.current = true;
    try {
      let currentSectionId: string | null = null;
      let curSecRepeat = false;
      for (const f of tmpl.schemaData) {
        if (f.type === 'section_break') {
          currentSectionId = f.id;
          curSecRepeat = sectionAllowsRepeat(f);
          continue;
        }
        const ft = effectiveSchemaFieldType(f);
        if (!isVisionSimNaoMediaFieldType(ft)) continue;

        const runForScope = async (scope: SectionRepeatScope | null) => {
          const raw = getScopedFieldValue(res, scope, f.id);
          const o = parseVisionChecklistStored(raw);
          if (!o || !isVisionPendingAnalysisRecord(o) || !visionStoredHasRunnableMedia(f, o)) return;
          const uri = String(o.localUri || '').trim();
          if (!uri) return;
          const pathOnly = uri.split('?')[0];
          try {
            const info = await FileSystem.getInfoAsync(pathOnly);
            if (!info.exists) return;
          } catch {
            return;
          }
          const mime = String(o.mediaMimeType || 'application/octet-stream');
          const name = String(
            o.mediaFileName || (String(mime).startsWith('video') ? 'video.mp4' : 'foto.jpg'),
          );
          const layout = getVisionAnalysisGridLayout(f);
          const slots = normalizeVisionGridSlotUris(o.gridSlotUris, layout.count);
          await runVisionChecklistAnalyze(
            f,
            uri,
            mime,
            name,
            scope,
            layout.count > 1
              ? { persistExtras: { gridSlotUris: slots }, quiet: true }
              : { quiet: true },
          );
        };

        if (!curSecRepeat) {
          await runForScope(null);
        } else if (currentSectionId) {
          const rows = getRepeatRows(res, currentSectionId);
          for (let ri = 0; ri < rows.length; ri++) {
            await runForScope({ sectionId: currentSectionId, rowIndex: ri });
          }
        }
      }
    } finally {
      visionFlushBusyRef.current = false;
    }
  }, [isReadOnly, loading, runVisionChecklistAnalyze]);

  useFocusEffect(
    useCallback(() => {
      if (loading || isReadOnly) return undefined;
      const t = setTimeout(() => {
        void flushPendingFacialVerifications().then(() => {
          void flushPendingVisionAnalyses();
        });
      }, 700);
      return () => clearTimeout(t);
    }, [loading, isReadOnly, flushPendingFacialVerifications, flushPendingVisionAnalyses])
  );

  const mergeMediaUriIntoField = (fieldId: string, uri: string, scope?: SectionRepeatScope | null) => {
    const fieldDef = template?.schemaData?.find((f: any) => f.id === fieldId);
    const capKey = mediaCaptionStorageKey(fieldId);
    const curVal = getScopedFieldValue(responses, scope || null, fieldId);
    const rowForCap =
      scope && responses[sectionRepeatStorageKey(scope.sectionId)]?.[scope.rowIndex];
    const curCapRaw =
      scope && rowForCap && typeof rowForCap === 'object' ? rowForCap[capKey] : responses[capKey];

    if (fieldAllowsMultiple(fieldDef)) {
      const arr = normalizeResponseArray(curVal);
      const max = multiMaxItems(fieldDef);
      if (max != null && arr.length >= max) {
        Alert.alert('Limite', `Máximo de ${max} itens neste campo.`);
        return;
      }
      const next = [...arr, uri];
      handleInput(fieldId, next, scope);
      if (fieldDef?.allowMediaDescription) {
        const caps = normalizeMediaCaptions(fieldDef, curCapRaw, arr.length);
        caps.push('');
        handleInput(capKey, caps, scope);
      }
      return;
    }
    handleInput(fieldId, uri, scope);
    if (fieldDef?.allowMediaDescription) {
      handleInput(capKey, '', scope);
    }
  };

  const handleMediaPicker = async (fieldId: string, type: string, scope?: SectionRepeatScope | null) => {
    if (type === 'file_upload') {
      try {
        const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (res.canceled || !res.assets?.length) return;
        const asset = res.assets[0];
        let sizeBytes: number | undefined =
          typeof asset.size === 'number' && Number.isFinite(asset.size) ? asset.size : undefined;
        if (sizeBytes == null) {
          const info = await FileSystem.getInfoAsync(asset.uri);
          if (info.exists && typeof info.size === 'number') {
            sizeBytes = info.size;
          }
        }
        if (sizeBytes == null || !Number.isFinite(sizeBytes)) {
          Alert.alert(
            'Anexo',
            'Não foi possível verificar o tamanho do arquivo. Tente outro arquivo ou formato.'
          );
          return;
        }
        const gate = checkAttachmentMeta({
          sizeBytes,
          fileName: asset.name ?? null,
          mimeType: asset.mimeType ?? null,
        });
        if (!gate.ok) {
          Alert.alert('Anexo recusado', gate.message);
          return;
        }
        mergeMediaUriIntoField(fieldId, asset.uri, scope);
      } catch (e) {
        Alert.alert('Anexo', 'Não foi possível selecionar o arquivo.');
      }
    } else {
      try {
        if (type === 'photo_stamped' || type === 'facial_recognition') {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted')
              return Alert.alert(t('common.attention'), t('checklistForm.permissionNativeCameraDenied'));

            const res = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
            if (!res.canceled && res.assets && res.assets.length > 0) {
              const imgAsset = res.assets[0];

              let gpsQuery = '?live=true';
              try {
                const loc =
                  (await Location.getLastKnownPositionAsync({})) ||
                  (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
                if (loc && loc.coords) {
                  const { latitude, longitude } = loc.coords;
                  gpsQuery += `&lat=${latitude}&lng=${longitude}`;
                }
              } catch (e) {}

              if (type === 'facial_recognition') {
                const facialQs = await buildFacialCaptureQuerySuffix();
                const ok = await processFacialImage(
                  fieldId,
                  imgAsset.base64 || '',
                  imgAsset.uri.split('?')[0] + facialQs,
                  scope
                );
                if (!ok) return;
              } else {
                const uriCommitted = imgAsset.uri + gpsQuery;
                mergeMediaUriIntoField(fieldId, uriCommitted, scope);
                void mergeAddrIntoMediaUriIfStillCurrent({
                  getResponses: () => responsesRefForFacial.current,
                  applyInput: (fid, val, sc) => {
                    const hi = handleInputRef.current;
                    if (typeof hi === 'function') hi(fid, val, sc);
                  },
                  fieldId,
                  scope,
                  uriAtCommit: uriCommitted,
                });
              }
            }
          } catch (err: any) {
            Alert.alert(
              t('checklistForm.cameraUnavailableTitle'),
              err?.message || t('checklistForm.cameraUnavailableBody')
            );
          }
        } else {
          Alert.alert(t('checklistForm.addPhotoTitle'), t('checklistForm.addPhotoMessage'), [
            {
              text: t('checklistForm.cameraOption'),
              onPress: async () => {
                try {
                  const { status } = await ImagePicker.requestCameraPermissionsAsync();
                  if (status !== 'granted') {
                    Alert.alert(t('common.attention'), t('checklistForm.permissionCameraDenied'));
                    return;
                  }
                  const res = await ImagePicker.launchCameraAsync({ quality: 0.5 });
                  if (!res.canceled && res.assets && res.assets.length > 0) {
                    mergeMediaUriIntoField(fieldId, res.assets[0].uri, scope);
                  }
                } catch (camErr: any) {
                  Alert.alert(
                    t('checklistForm.cameraUnavailableTitle'),
                    camErr?.message || t('checklistForm.cameraSimulatorBody')
                  );
                }
              },
            },
            {
              text: t('checklistForm.galleryOption'),
              onPress: async () => {
                try {
                  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (status !== 'granted') {
                    Alert.alert(t('common.attention'), t('checklistForm.permissionGalleryDenied'));
                    return;
                  }
                  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
                  if (!res.canceled && res.assets && res.assets.length > 0) {
                    mergeMediaUriIntoField(fieldId, res.assets[0].uri, scope);
                  }
                } catch (galErr: any) {
                  Alert.alert(
                    t('checklistForm.galleryUnavailableTitle'),
                    galErr?.message || t('checklistForm.galleryUnavailableBody')
                  );
                }
              },
            },
            { text: t('common.cancel'), style: 'cancel' },
          ]);
        }
      } catch (e: any) {
        Alert.alert(t('common.error'), t('checklistForm.mediaCaptureError'));
      }
    }
  };

  const submitExecution = async () => {
    if (responses.__form_paused_since) {
      Alert.alert(t('common.attention'), t('pause.pausedTitle'));
      return;
    }
    await flushPendingFacialVerifications();
    // Dar tempo ao React aplicar os `setResponses` do flush antes de ler o ref (batching).
    await new Promise<void>((r) => setTimeout(r, 120));
    try {
      const pendingFacialLabel = getFirstBlockingPendingFacialFieldLabel(
        responsesRefForFacial.current,
        template?.schemaData || []
      );
      if (pendingFacialLabel) {
        const netState = await Network.getNetworkStateAsync();
        if (netState.isConnected === false) {
          Alert.alert(
            'Reconhecimento facial pendente',
            `O campo «${pendingFacialLabel}» ainda não foi validado no servidor (captura sem rede ou validação incompleta). Conecte-se à internet, aguarde a validação na própria tela ou capture de novo antes de concluir a OS.`
          );
        } else {
          Alert.alert(
            'Reconhecimento facial pendente',
            `O campo «${pendingFacialLabel}» ainda não foi validado no servidor. Aguarde alguns segundos na tela do formulário, verifique a conexão ou capture de novo. Se o problema continuar, contacte o suporte.`
          );
        }
        return;
      }
    } catch {
      /* se a checagem de rede falhar, segue o fluxo legado */
    }

    await flushPendingVisionAnalyses();
    await new Promise<void>((r) => setTimeout(r, 120));
    try {
      const pendingVisionLabel = getFirstBlockingVisionPendingRequiringOnline(
        responsesRefForFacial.current,
        template?.schemaData || [],
      );
      if (pendingVisionLabel) {
        const netState = await Network.getNetworkStateAsync();
        if (netState.isConnected === false) {
          Alert.alert(
            'Visão IA pendente',
            `O campo «${pendingVisionLabel}» exige análise no servidor antes de concluir. Está sem rede ou a análise ainda não terminou, conecte-se à internet e use «Tentar análise agora» no campo, ou aguarde o envio automático.`,
          );
        } else {
          Alert.alert(
            'Visão IA pendente',
            `O campo «${pendingVisionLabel}» exige análise no servidor antes de concluir. Toque em «Tentar análise agora» no campo ou aguarde alguns segundos. Se o problema continuar, verifique a sessão e a conexão.`,
          );
        }
        return;
      }
    } catch {
      /* segue */
    }

    const schemaAll = template?.schemaData || [];
    const bySection: Record<string, any[]> = {};
    const sectionHeaders: Record<string, any> = {};
    let curSecKey = '__root__';
    for (const f of schemaAll) {
      if (f.type === 'section_break') {
        curSecKey = f.id;
        sectionHeaders[curSecKey] = f;
        continue;
      }
      if (f.type === 'hidden' || !f.id) continue;
      if (!bySection[curSecKey]) bySection[curSecKey] = [];
      bySection[curSecKey].push(f);
    }
    const sectionPhraseForSubmitAlert = (sectionLabel: string | null) =>
      sectionLabel != null && String(sectionLabel).trim() !== ''
        ? `na etapa «${String(sectionLabel).trim()}»`
        : `na «Área Externa»`;

    const validateFlatFields = (fields: any[], sectionLabel: string | null) => {
      const secPh = sectionPhraseForSubmitAlert(sectionLabel);
      for (const f of fields) {
        if (!isFieldVisible(f)) continue;
        if (fieldMustAnswerForProgress(f)) {
          const ans = responses[f.id];
          if (!isFieldAnswerFilled(f, ans)) {
            const fl = String(f.label || f.id || '').trim() || f.id;
            Alert.alert(
              'Atenção',
              f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
                ? `Valide a localização em «${fl}» (dentro da área) ${secPh} antes de concluir.`
                : `O campo «${fl}» ${secPh} é obrigatório antes de concluir.`,
            );
            return false;
          }
        }
      }
      return true;
    };
    for (const [secKey, fields] of Object.entries(bySection)) {
      if (secKey === '__root__') {
        if (!validateFlatFields(fields, null)) return;
        continue;
      }
      const sh = sectionHeaders[secKey];
      const repeat = sh && sectionAllowsRepeat(sh);
      const sectionTitleForMsg = String(sh?.label || '').trim() || secKey;
      if (repeat) {
        const rows = getRepeatRows(responses, secKey);
        const minR = sectionRepeatMinRows(sh);
        const maxR = sectionRepeatMaxRows(sh);
        if (rows.length < minR) {
          Alert.alert(
            'Atenção',
            `A seção "${sh.label || secKey}" exige pelo menos ${minR} preenchimento(s) repetido(s).`
          );
          return;
        }
        if (maxR != null && rows.length > maxR) {
          Alert.alert(
            'Atenção',
            `A seção "${sh.label || secKey}" admite no máximo ${maxR} preenchimento(s).`
          );
          return;
        }
        const n = Math.max(rows.length, minR, 1);
        const secPh = sectionPhraseForSubmitAlert(sectionTitleForMsg);
        for (const f of fields) {
          if (!isFieldVisible(f)) continue;
          for (let ri = 0; ri < n; ri++) {
            const ans = rows[ri]?.[f.id];
            if (fieldMustAnswerForProgress(f) && !isFieldAnswerFilled(f, ans)) {
              const fl = String(f.label || f.id || '').trim() || f.id;
              Alert.alert(
                'Atenção',
                f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
                  ? `Valide a localização em «${fl}» (instância ${ri + 1}, dentro da área) ${secPh} antes de concluir.`
                  : `O campo «${fl}» (instância ${ri + 1}) ${secPh} é obrigatório antes de concluir.`,
              );
              return;
            }
          }
        }
      } else {
        if (!validateFlatFields(fields, sectionTitleForMsg)) return;
      }
    }

    setSubmitting(true);
    try {
      const submitTaskId = String(resolvedTaskId || '').trim();
      const AuthSvc = require('../../src/services/auth').AuthService;
      let uEmail = 'unknown@empresa.com';
      try {
          const u = await AuthSvc.getCurrentUser();
          if (u && u.email) uEmail = u.email;
      } catch(e) {}

      const ownerForStock =
        user?.email && String(user.email).trim() ? String(user.email).trim() : uEmail;

      // Resgatar recebimento ou aceite originais
      let origMeta: any = {};
      let osNumMeta: string | undefined;
      try {
          const origTask = submitTaskId ? await findCloudTaskById(submitTaskId) : null;
          if (origTask && origTask.metadata) {
             origMeta = {
               receivedAt: origTask.metadata.receivedAt,
               acceptedAt: origTask.metadata.acceptedAt
             };
          }
          if (origTask?.osNumber != null && String(origTask.osNumber).trim() !== '') {
            osNumMeta = String(origTask.osNumber).trim();
          }
      } catch(e) {}

      let finalResponses = { ...responses };
      if (!isReadOnly) {
        schemaAll.forEach((f: any) => {
          if (f.type !== 'section_break') return;
          const startK = `__section_start_${f.id}`;
          const endK = `__section_end_${f.id}`;
          if (finalResponses[startK] && !finalResponses[endK]) {
            finalResponses[endK] = new Date().toISOString();
          }
        });
      }

      const nowSubmit = Date.now();
      const formStartIso =
        typeof finalResponses.__form_started_at === 'string' && finalResponses.__form_started_at
          ? finalResponses.__form_started_at
          : new Date(startTime).toISOString();
      const formFillDurationSeconds = Math.max(
        0,
        Math.floor((nowSubmit - new Date(formStartIso).getTime()) / 1000) -
          getTotalPausedSeconds(finalResponses, nowSubmit)
      );
      let formActiveSeconds = Number(finalResponses.__form_active_seconds) || 0;
      if (fgSegmentStartRef.current != null) {
        formActiveSeconds += Math.max(0, Math.floor((nowSubmit - fgSegmentStartRef.current) / 1000));
      }
      finalResponses.__form_completed_at = new Date().toISOString();
      finalResponses.__form_fill_duration_sec = formFillDurationSeconds;
      finalResponses.__form_active_seconds_final = formActiveSeconds;

      if (!isReadOnly) {
        const routineRtNum =
          (currentTask?.routineTaskNumber != null && String(currentTask.routineTaskNumber).trim() !== ''
            ? String(currentTask.routineTaskNumber).trim()
            : undefined) ||
          (resolvedRtNumber && String(resolvedRtNumber).trim() !== ''
            ? String(resolvedRtNumber).trim()
            : undefined);
        const ftForStockHistory =
          (currentTask?.osNumber != null && String(currentTask.osNumber).trim() !== ''
            ? String(currentTask.osNumber).trim()
            : undefined) ??
          osNumMeta ??
          routineRtNum;
        const matRes = await applyMaterialsStockForSubmission({
          schemaAll,
          responses: finalResponses,
          submissionRevision: nextSubmissionRevisionRef.current,
          taskId: submitTaskId,
          templateId: String(id),
          ownerEmail: ownerForStock,
          osNumber: ftForStockHistory,
        });
        if (!matRes.ok) {
          Alert.alert('Estoque', matRes.message);
          setSubmitting(false);
          return;
        }
        const recRes = await applyMaterialsReceiptForSubmission({
          schemaAll,
          responses: finalResponses,
          submissionRevision: nextSubmissionRevisionRef.current,
          taskId: submitTaskId,
          templateId: String(id),
          ownerEmail: ownerForStock,
          osNumber: ftForStockHistory,
        });
        if (!recRes.ok) {
          Alert.alert('Estoque', recRes.message);
          setSubmitting(false);
          return;
        }
        const finRes = await applyTechnicianFinanceForSubmission({
          schemaAll,
          responses: finalResponses,
          submissionRevision: nextSubmissionRevisionRef.current,
          taskId: submitTaskId,
          templateId: String(id),
          ownerEmail: ownerForStock,
        });
        if (!finRes.ok) {
          Alert.alert('Financeiro técnico', finRes.message);
          setSubmitting(false);
          return;
        }
      }

      const payload = {
        templateId: id,
        taskId: submitTaskId,
        ownerEmail: uEmail,
        responses: finalResponses,
        metadata: { 
            ...(origMeta.receivedAt ? { receivedAt: origMeta.receivedAt } : {}),
            ...(origMeta.acceptedAt ? { acceptedAt: origMeta.acceptedAt } : {}),
            submissionRevision: nextSubmissionRevisionRef.current,
            submissionId: newSubmissionId(),
            ...(submitTaskId ? { executionId: submitTaskId } : {}),
            ...(osNumMeta ? { osNumber: osNumMeta } : {}),
            appVersion: '1.0',
            durationSeconds: formFillDurationSeconds,
            formFillDurationSeconds,
            formActiveSeconds,
            devicePlatform: 'AppMovel'
        },
        startedAt: formStartIso,
        completedAt: new Date().toISOString()
      };

      const draftKey = submitTaskId ? `@draft_tsk_${submitTaskId}` : `@draft_chk_${id}`;
      // Salva execução offline completa
      if (submitTaskId) {
         await AsyncStorage.setItem(`@brspark_execution_${submitTaskId}`, JSON.stringify(payload));
      }
      
        console.log("Checklist concluído offline-first. Injetando no Outbox...");
        const payloadIdentityKey = checklistOutboxIdentityKey(payload);
        const payloadTaskId = String(payload?.taskId || '').trim();
        await updateStoredJsonArray<any>('@brspark_outbox', (outbox) => {
          const next = Array.isArray(outbox) ? outbox.filter((item) => {
            if (payloadTaskId) return String(item?.taskId || '').trim() !== payloadTaskId;
            return checklistOutboxIdentityKey(item) !== payloadIdentityKey;
          }) : [];
          next.push(payload);
          return next;
        });
        await AsyncStorage.removeItem(draftKey);

        // Após persistir payload na fila, atualiza estado local de cartão/abas.
        if (submitTaskId) {
          const tid = submitTaskId;
          const completedItem = {
            id: tid,
            refId: String(id),
            title: template?.title || 'OS',
            description: 'OS Concluída com sucesso',
            completedAt: String(payload.completedAt || new Date().toISOString()),
          };
          try {
            await withAsyncStorageKeyLock(`@brspark_finalize_${tid}`, async () => {
              await clearExecutionStatusOutboxForTask(tid);
              await updateStoredJsonArray<any>('@brspark_executed_tasks', (current) => {
                const execs = [...current];
                const existingIdx = execs.findIndex(
                  (e) => (typeof e === 'string' ? e : e?.id) === tid
                );
                if (existingIdx === -1) execs.push(completedItem);
                else execs[existingIdx] = completedItem;
                return execs;
              });
              await updateStoredJsonArray<string>('@brspark_inprogress_tasks', (inprogs) =>
                inprogs.filter((t) => String(t) !== tid)
              );
            });
          } catch (localStateErr) {
            console.warn('[checklist] Falha ao marcar OS como concluída localmente:', localStateErr);
          }

          /** RT/FT: alinhar cache `@brspark_*_cloud_tasks` ao concluir — senão RT fica `IN_PROGRESS` e «Abrir» reutiliza a mesma execução. */
          try {
            await patchCloudTaskById(tid, (row) => ({
              ...row,
              status: 'COMPLETED',
              metadata: { ...(row.metadata || {}), localCompletedAt: String(payload.completedAt || new Date().toISOString()) },
            }));
          } catch {
            /* ignore */
          }
        }
        
        // Aciona explicitamente o Sync Worker em background se possível
        try {
          const { pushSyncQueue } = require('../../src/services/syncService');
          void pushSyncQueue(uEmail).catch(() => {});
        } catch (e) {}

        // Volta ao estado IDLE e dispara cálculo de métricas da OS
        dataCollectionService.setState('IDLE', {
          executionId: submitTaskId,
          ownerEmail: uEmail,
        }).catch(() => {});
        // Métricas calculadas em background — não bloqueia navegação
        if (submitTaskId) {
          apiFetch(`/api/metrics/calculate/${submitTaskId}`, { method: 'POST' }).catch(() => {});
        }

        router.back();
    } catch (err) {
       Alert.alert("Erro Central", "Não foi possível arquivar a execução.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Logic Engine Evaluator (IF/THEN Rules Central) ---
  const evaluateCondition = (condFieldId: string, op: string, condValue: any, dataModel: any = responses) => {
    const nowMs = Date.now();
    const schema = template?.schemaData || [];
    return evaluateBusinessCondition(
      condFieldId,
      op,
      condValue,
      dataModel && typeof dataModel === 'object' ? dataModel : {},
      nowMs,
      schema,
      {
        getFormElapsedSeconds,
        getSectionElapsedSeconds,
        getSectionTimingKeys,
      },
    );
  };

  // --- Central Automations (Side Effects Engine) ---
  const getAllRules = () => {
     const globalRules = template?.settings?.rules || [];
     let fieldRules: any[] = [];
     if (template?.schemaData) {
         template.schemaData.forEach((f: any) => {
             if (f.rules && f.rules.length > 0) {
                 f.rules.forEach((r: any) => {
                     fieldRules.push({
                         ...r,
                         condFieldId: r.condFieldId || f.id,
                         condOperator: r.operator || r.condOperator,
                         condValue: r.value || r.condValue
                     });
                 });
             }
         });
     }
     return [...globalRules, ...fieldRules];
  };

  const handleApiValidation = async (fieldId: string) => {
      const rules = getAllRules();
      const ruleMatchesMonitor = (r: any) =>
          r.condFieldId === fieldId &&
          evaluateCondition(r.condFieldId, r.condOperator, r.condValue, responses);

      const validationRules = rules.filter(
          (r: any) => ruleMatchesMonitor(r) && r.actions?.some((a: any) => a.type === 'API_VALIDATION'),
      );
      for (const rule of validationRules) {
          const apiActions = rule.actions.filter((a: any) => a.type === 'API_VALIDATION');
          for (const action of apiActions) {
              setValidatingFieldId(fieldId);
              try {
                  const netState = await Network.getNetworkStateAsync();
                  if (action.apiAllowOffline && !netState.isConnected) {
                      continue;
                  }

                  const apiRes = await fetch(String(action.apiUrl || '').trim(), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          checklist_id: template?.id,
                          task_id: taskId,
                          responses,
                      }),
                  });
                  const text = await apiRes.text();

                  const expected = action.apiExpectedReturn || '';
                  if (expected && !text.includes(expected) && !new RegExp(expected).test(text)) {
                      throw new Error(
                          action.apiErrorMsg || 'Consulta bloqueada. Verifique os dados e a conexão com a API externa.',
                      );
                  }
              } catch (err: any) {
                  Alert.alert('Bloqueio no sistema externo', err.message);
                  const fd = template?.schemaData?.find((f: any) => f.id === fieldId);
                  handleInput(fieldId, fieldAllowsMultiple(fd) ? [] : '');
              } finally {
                  setValidatingFieldId(null);
              }
          }
      }

      const fetchRules = rules.filter(
          (r: any) => ruleMatchesMonitor(r) && r.actions?.some((a: any) => a.type === 'API_FETCH'),
      );
      for (const rule of fetchRules) {
          const fetchActions = rule.actions.filter((a: any) => a.type === 'API_FETCH');
          for (const action of fetchActions) {
              const targetId = String(action.targetId || '').trim();
              const url = String(action.apiUrl || '').trim();
              if (!targetId || !url) continue;

              const targetDef = template?.schemaData?.find((f: any) => f.id === targetId);
              setValidatingFieldId(targetId);
              try {
                  const netState = await Network.getNetworkStateAsync();
                  if (action.apiAllowOffline && !netState.isConnected) {
                      continue;
                  }

                  const method = String(action.apiMethod || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
                  let text: string;
                  let ok: boolean;
                  if (method === 'GET') {
                      const apiRes = await fetch(url, {
                          method: 'GET',
                          headers: { Accept: 'application/json, text/plain, */*' },
                      });
                      ok = apiRes.ok;
                      text = await apiRes.text();
                  } else {
                      const apiRes = await fetch(url, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                              checklist_id: template?.id,
                              task_id: taskId,
                              responses,
                          }),
                      });
                      ok = apiRes.ok;
                      text = await apiRes.text();
                  }

                  if (!ok) {
                      throw new Error(action.apiErrorMsg || `A API devolveu erro (HTTP).`);
                  }

                  const pathRaw = String(action.apiResponsePath || '').trim();
                  let extracted: string;
                  if (pathRaw) {
                      try {
                          const json = JSON.parse(text);
                          const picked = brsparkJsonPathLookup(json, pathRaw);
                          if (picked == null || picked === undefined) {
                              extracted = '';
                          } else if (typeof picked === 'object') {
                              extracted = JSON.stringify(picked).slice(0, 8000);
                          } else {
                              extracted = String(picked).slice(0, 8000);
                          }
                      } catch {
                          extracted = text.trim().slice(0, 8000);
                      }
                  } else {
                      extracted = text.trim().slice(0, 8000);
                  }

                  let outVal: any = extracted;
                  if (targetDef?.type === 'number') {
                      const n = parseFloat(String(extracted).replace(',', '.'));
                      outVal = Number.isFinite(n) ? String(n) : extracted;
                  }

                  handleInput(targetId, outVal);
              } catch (err: any) {
                  Alert.alert(
                      'Não foi possível obter dados externos',
                      String(err?.message || err || 'Falha na chamada à API.'),
                  );
              } finally {
                  setValidatingFieldId(null);
              }
          }
      }
  };

  useEffect(() => {
     const rules = getAllRules();
     const schemaData = template?.schemaData;
     const leituraIds = collectLeituraFieldIds(schemaData);

     const draftKey = resolvedTaskId ? `@draft_tsk_${resolvedTaskId}` : `@draft_chk_${id}`;

     setResponses((prev: any) => {
        if (Object.keys(prev).length === 0) return prev;

        let hasChanges = false;
        const nextResponses = { ...prev };
        const activeSetValueLeitura = new Set<string>();

        rules.forEach((rule: any) => {
           if (evaluateCondition(rule.condFieldId, rule.condOperator, rule.condValue, nextResponses)) {
              rule.actions?.forEach((action: any) => {
                 if (action.type === 'SET_VALUE' && action.targetId) {
                    const tid = String(action.targetId);
                    if (leituraIds.has(tid)) activeSetValueLeitura.add(tid);
                    const currentVal = nextResponses[action.targetId];
                    const targetVal = action.value || '';
                    if (currentVal !== targetVal) {
                       nextResponses[action.targetId] = targetVal;
                       hasChanges = true;
                    }
                 }
              });
           }
        });

        for (const lid of leituraIds) {
           if (!activeSetValueLeitura.has(lid) && Object.prototype.hasOwnProperty.call(nextResponses, lid)) {
              delete nextResponses[lid];
              hasChanges = true;
           }
        }

        if (!hasChanges) return prev;
        void AsyncStorage.setItem(draftKey, JSON.stringify(nextResponses));
        return nextResponses;
     });
  }, [responses, template, ruleTick, id, resolvedTaskId]);

  const isFieldVisible = (field: any, checkSectionBreak = false) => {
      const visT = effectiveSchemaFieldType(field);
      if (visT === 'section_break' && !checkSectionBreak) return false;
      if (visT === 'hidden') return false;

      const rules = getAllRules();
      
      const showRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'SHOW' && a.targetId === field.id));
      const hideRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'HIDE' && a.targetId === field.id));
      
      // Legacy support for fields built before the Rules Central
      if (field.dependsOnId) {
          if (!evaluateCondition(field.dependsOnId, field.dependsOnOperator || '==', field.dependsOnValue)) return false;
      }
      
      // SHOW Rule Pipeline
      if (showRules.length > 0) {
          const anyShowTrue = showRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (!anyShowTrue) return false;
      }
      
      // HIDE Rule Pipeline
      if (hideRules.length > 0) {
          const anyHideTrue = hideRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (anyHideTrue) return false; // Hide it!
      }

      return true;
  };

  const isFieldRequired = (field: any) => {
      if (
        effectiveSchemaFieldType(field) === 'leitura' ||
        effectiveSchemaFieldType(field) === 'form_complete_button'
      )
        return false;
      let isReq = field.required;
      const rules = getAllRules();
      
      const requireRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'REQUIRE' && a.targetId === field.id));
      if (requireRules.length > 0) {
          const anyReqTrue = requireRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (anyReqTrue) isReq = true;
      }
      
      const optionalRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'OPTIONAL' && a.targetId === field.id));
      if (optionalRules.length > 0) {
          const anyOptTrue = optionalRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (anyOptTrue) isReq = false;
      }
      
      return isReq;
  };

  /** Cerca com modo «bloquear»: exige validação com sucesso antes de avançar, mesmo se o campo não estiver marcado como obrigatório. */
  const geofenceCheckEnforcesProgressGate = (field: any) =>
    effectiveSchemaFieldType(field) === 'geofence_check' &&
    normalizeGeofenceFailMode(field?.geofenceFailMode) === 'block';

  const fieldMustAnswerForProgress = (field: any) =>
    isFieldRequired(field) || geofenceCheckEnforcesProgressGate(field);

  // --- Paginator Chunking Engine ---
  const schema = template?.schemaData || [];
  let rawPages: {
    fields: any[];
    pageTitle: string;
    id: string;
    isVisible: boolean;
    sectionFillMode?: string;
    openingSectionId?: string;
    sectionIcon?: string;
    sectionIconLibrary?: string;
    sectionIconColor?: string;
  }[] = [];
  let _curFields: any[] = [];
  let _globalIndex = 1;
  let _currentSectionTitle = 'Página 1';
  let _currentSectionId = 'page_1';
  let _currentSectionVisible = true;
  let _currentSectionIcon = '';
  let _currentSectionIconLibrary = 'Ionicons';
  let _currentSectionIconColor = '#7c3aed';
  let _openingSectionBreak: any = null;

  schema.forEach((f: any) => {
    const schT = effectiveSchemaFieldType(f);
    if (schT === 'section_break') {
      if (_curFields.length > 0 || rawPages.length > 0) {
        rawPages.push({
          fields: _curFields,
          pageTitle: _currentSectionTitle,
          id: _currentSectionId,
          isVisible: _currentSectionVisible,
          sectionFillMode: _openingSectionBreak?.sectionFillMode,
          openingSectionId: _openingSectionBreak?.id || '__preamble__',
          sectionIcon: _currentSectionIcon,
          sectionIconLibrary: _currentSectionIconLibrary,
          sectionIconColor: _currentSectionIconColor,
        });
      }
      _curFields = [];
      _openingSectionBreak = f;
      _currentSectionTitle = f.label || `Página ${rawPages.length + 1}`;
      _currentSectionId = f.id;
      _currentSectionVisible = isFieldVisible(f, true);
      _currentSectionIcon = String(f.icon || '').trim();
      _currentSectionIconLibrary = String(f.iconLibrary || 'Ionicons').trim() || 'Ionicons';
      _currentSectionIconColor = String(f.iconColor || '#7c3aed').trim() || '#7c3aed';
    } else {
      if (schT === 'leitura' || schT === 'form_complete_button') {
        _curFields.push({ ...f, _globalIdx: undefined });
      } else {
        _curFields.push({ ...f, _globalIdx: _globalIndex++ });
      }
    }
  });
  if (_curFields.length > 0 || rawPages.length === 0) {
    rawPages.push({
      fields: _curFields,
      pageTitle: _currentSectionTitle,
      id: _currentSectionId,
      isVisible: _currentSectionVisible,
      sectionFillMode: _openingSectionBreak?.sectionFillMode,
      openingSectionId: _openingSectionBreak?.id || '__preamble__',
      sectionIcon: _currentSectionIcon,
      sectionIconLibrary: _currentSectionIconLibrary,
      sectionIconColor: _currentSectionIconColor,
    });
  }

  const pages = rawPages.filter(p => p.isVisible);

  /** Hub com menu de etapas: várias páginas OU uma única etapa com seção repetível (precisa do + no card). */
  const schemaDataForHub = template?.schemaData || [];
  const hubStageMenuHasSteps =
    pages.length > 1 ||
    pages.some((p) => {
      const oid = p.openingSectionId;
      if (!oid || oid === '__preamble__' || oid === '__full__' || oid === '__wizard__') return false;
      const sb = schemaDataForHub.find((x: any) => x.id === oid && x.type === 'section_break');
      return !!(sb && sectionAllowsRepeat(sb));
    });

  const fillMode: 'full' | 'wizard' | 'hybrid' = computeEffectiveFillModeFromTemplate(
    schema,
    template?.settings
  );
  const effectiveFillMode = isReadOnly ? 'full' : fillMode;

  const appSectionStart: 'direct' | 'hub' =
    !isReadOnly && template?.settings?.appSectionStart === 'hub' ? 'hub' : 'direct';
  const appHubSectionOrder: 'free' | 'sequential' =
    template?.settings?.appHubSectionOrder === 'sequential' ? 'sequential' : 'free';
  const useSectionHub = appSectionStart === 'hub';

  /** Com hub: botões «concluir» colocados no préâmbulo no builder aparecem só no menu de etapas, não dentro de um cartão. */
  const preambleHubCompleteButtonFields = (() => {
    if (!useSectionHub) return [] as any[];
    const pg = pages.find((p) => p.openingSectionId === '__preamble__');
    if (!pg) return [];
    return (pg.fields || []).filter(
      (f: any) =>
        isFieldVisible(f) && effectiveSchemaFieldType(f) === 'form_complete_button'
    );
  })();
  const preambleHubCompleteFieldIdSet = new Set(
    preambleHubCompleteButtonFields.map((f: any) => f.id)
  );
  const hubPageShowsInStepMenu = (pg: (typeof pages)[number]) => {
    if (pg.openingSectionId !== '__preamble__') return true;
    const visibleFields = (pg.fields || []).filter((f) => isFieldVisible(f));
    const nonComplete = visibleFields.filter(
      (f) => effectiveSchemaFieldType(f) !== 'form_complete_button'
    );
    return nonComplete.length > 0;
  };

  /** Com hub + lista completa, passamos a paginar por seção em vez do scroll único. */
  const paginateSectionsForLayout =
    effectiveFillMode !== 'full' || (useSectionHub && effectiveFillMode === 'full');

  const displayPages = useMemo(() => {
    if (!paginateSectionsForLayout) {
      return [
        {
          fields: pages.flatMap((p) => p.fields),
          pageTitle: template?.title || 'Checklist',
          id: '__full__',
          isVisible: true,
          sectionFillMode: undefined,
          openingSectionId: undefined,
          sectionIcon: '',
          sectionIconLibrary: 'Ionicons',
          sectionIconColor: '#64748b',
        },
      ];
    }
    return pages;
  }, [paginateSectionsForLayout, pages, template?.title]);

  /** Passos do assistente global: cada entrada é um ou vários campos (seção em modo lista agrupa). */
  const wizardSteps = useMemo(() => {
    if (effectiveFillMode !== 'wizard')
      return [] as {
        fields: any[];
        sectionRepeat?: { sectionId: string; sectionField: any };
        sectionOpeningId: string;
      }[];
    const steps: {
      fields: any[];
      sectionRepeat?: { sectionId: string; sectionField: any };
      sectionOpeningId: string;
    }[] = [];
    let buf: any[] = [];
    let opening: any = null;
    const flush = () => {
      if (buf.length === 0) return;
      const vis = buf.filter((x) => isFieldVisible(x));
      if (vis.length === 0) {
        buf = [];
        return;
      }
      const sectionOpeningId = opening?.id || '__preamble__';
      const mode = resolvePageInnerMode({ sectionFillMode: opening?.sectionFillMode }, 'wizard');
      if (mode === 'wizard') {
        vis.forEach((field) =>
          steps.push({ fields: [field], sectionOpeningId })
        );
      } else {
        const sectionRepeat =
          opening && opening.type === 'section_break' && sectionAllowsRepeat(opening)
            ? { sectionId: opening.id, sectionField: opening }
            : undefined;
        steps.push({ fields: vis, sectionRepeat, sectionOpeningId });
      }
      buf = [];
    };
    schema.forEach((f: any) => {
      if (f.type === 'section_break') {
        flush();
        opening = f;
        return;
      }
      if (f.type === 'hidden') return;
      buf.push(f);
    });
    flush();
    return steps;
  }, [effectiveFillMode, schema, ruleTick, responses, template]);

  useEffect(() => {
    setCurrentPage(0);
    setWizardIndex(0);
    setHybridInnerWizardIndex(0);
  }, [id, resolvedTaskId, template?.id]);

  useEffect(() => {
    if (!useSectionHub) {
      setHubPicking(false);
      return;
    }
    setHubPicking(hubStageMenuHasSteps);
  }, [useSectionHub, hubStageMenuHasSteps, id, resolvedTaskId, template?.id]);

  useEffect(() => {
    if (effectiveFillMode !== 'wizard') return;
    const max = Math.max(0, wizardSteps.length - 1);
    setWizardIndex((w) => Math.min(w, max));
  }, [effectiveFillMode, wizardSteps.length]);

  /** Em modo lista completa, agrupa campos por seção para suportar seções repetíveis. */
  const fullRenderChunks = useMemo(() => {
    if (effectiveFillMode !== 'full')
      return null as null | { kind: 'flat' | 'repeat'; sectionField?: any; fields: any[] }[];
    if (useSectionHub && !isReadOnly)
      return null as null | { kind: 'flat' | 'repeat'; sectionField?: any; fields: any[] }[];
    const sch = template?.schemaData || [];
    const chunks: { kind: 'flat' | 'repeat'; sectionField?: any; fields: any[] }[] = [];
    let pendingFields: any[] = [];
    let sectionHeader: any | null = null;
    let g = 1;
    const emit = () => {
      if (pendingFields.length === 0) return;
      const withIdx = pendingFields.map((f) => {
        const t = effectiveSchemaFieldType(f);
        if (t === 'leitura' || t === 'form_complete_button')
          return { ...f, _globalIdx: undefined as number | undefined };
        return { ...f, _globalIdx: g++ };
      });
      if (sectionHeader?.multiple) {
        chunks.push({ kind: 'repeat', sectionField: sectionHeader, fields: withIdx });
      } else {
        chunks.push({ kind: 'flat', fields: withIdx });
      }
      pendingFields = [];
    };
    for (const f of sch) {
      if (f.type === 'section_break') {
        emit();
        sectionHeader = f;
      } else if (f.type !== 'hidden') {
        pendingFields.push(f);
      }
    }
    emit();
    return chunks;
  }, [effectiveFillMode, template?.schemaData, ruleTick, useSectionHub, isReadOnly]);

  /**
   * Visita de revisão: diferenciar progresso desta sessão vs dados herdados da execução anterior.
   * Fonte: metadata da OS (`revisionVisitActive` / `reopenForRevisionPending` / `reopenCount`).
   */
  const isRevisionVisitUi = useMemo(
    () => metaRevisionVisitContext(currentTask?.metadata),
    [currentTask?.metadata]
  );

  const sectionTimingFlagsForPage = (pageIdx: number) => {
    const p = pages[pageIdx];
    if (!p?.id) return { started: false, ended: false };
    const keys = getSectionTimingKeys(p.id);
    const sv = responses?.[keys.start];
    const ev = responses?.[keys.end];
    const started = (typeof sv === 'string' && sv.trim() !== '') || (!!sv && sv !== 0);
    const ended = (typeof ev === 'string' && ev.trim() !== '') || (!!ev && ev !== 0);
    return { started, ended };
  };

  const schemaPageFieldsComplete = (pageIdx: number) => {
    const p = pages[pageIdx];
    if (!p) return false;
    const openingId = p.openingSectionId || '__preamble__';
    const sb =
      openingId !== '__preamble__'
        ? (template?.schemaData || []).find(
            (x: any) => x.id === openingId && x.type === 'section_break'
          )
        : null;
    if (sb && sectionAllowsRepeat(sb)) {
      const rows = getRepeatRows(responses, sb.id);
      const minR = sectionRepeatMinRows(sb);
      const maxR = sectionRepeatMaxRows(sb);
      if (rows.length < minR) return false;
      if (maxR != null && rows.length > maxR) return false;
      const n = Math.max(rows.length, minR, 1);
      for (const f of p.fields || []) {
        if (!isFieldVisible(f)) continue;
        for (let ri = 0; ri < n; ri++) {
          const ans = rows[ri]?.[f.id];
          if (fieldMustAnswerForProgress(f) && !isFieldAnswerFilled(f, ans)) return false;
        }
      }
      return true;
    }
    for (const f of p.fields || []) {
      if (!isFieldVisible(f)) continue;
      if (fieldMustAnswerForProgress(f)) {
        const ans = responses[f.id];
        if (!isFieldAnswerFilled(f, ans)) return false;
      }
    }
    return true;
  };

  const wizardOpeningSectionComplete = (openingId: string) => {
    for (const step of wizardSteps) {
      if (step.sectionOpeningId !== openingId) continue;
      if (step.sectionRepeat?.sectionField) {
        const sb = step.sectionRepeat.sectionField;
        const sid = step.sectionRepeat.sectionId;
        const rows = getRepeatRows(responses, sid);
        const minR = sectionRepeatMinRows(sb);
        const maxR = sectionRepeatMaxRows(sb);
        if (rows.length < minR) return false;
        if (maxR != null && rows.length > maxR) return false;
        const n = Math.max(rows.length, minR, 1);
        for (const f of step.fields) {
          if (!isFieldVisible(f)) continue;
          for (let ri = 0; ri < n; ri++) {
            const ans = rows[ri]?.[f.id];
            if (fieldMustAnswerForProgress(f) && !isFieldAnswerFilled(f, ans)) return false;
          }
        }
      } else {
        for (const f of step.fields) {
          if (!isFieldVisible(f)) continue;
          if (fieldMustAnswerForProgress(f)) {
            const ans = responses[f.id];
            if (!isFieldAnswerFilled(f, ans)) return false;
          }
        }
      }
    }
    return true;
  };

  /** Mínimo de linhas > 0 ou algum campo obrigatório (ou geofence em modo bloquear). */
  const schemaPageHasHardRequirements = (pageIdx: number) => {
    const p = pages[pageIdx];
    if (!p) return false;
    const openingId = p.openingSectionId || '__preamble__';
    const sb =
      openingId !== '__preamble__'
        ? (template?.schemaData || []).find((x: any) => x.id === openingId && x.type === 'section_break')
        : null;
    if (sb && sectionAllowsRepeat(sb)) {
      if (sectionRepeatMinRows(sb) > 0) return true;
    }
    for (const f of p.fields || []) {
      if (!isFieldVisible(f)) continue;
      if (fieldMustAnswerForProgress(f)) return true;
    }
    return false;
  };

  const wizardOpeningSectionHasHardRequirements = (openingId: string) => {
    for (const step of wizardSteps) {
      if (step.sectionOpeningId !== openingId) continue;
      if (step.sectionRepeat?.sectionField) {
        const sb = step.sectionRepeat.sectionField;
        if (sectionRepeatMinRows(sb) > 0) return true;
      }
      for (const f of step.fields) {
        if (!isFieldVisible(f)) continue;
        if (fieldMustAnswerForProgress(f)) return true;
      }
    }
    return false;
  };

  /** Critério de validação (bloqueio sequencial / regras) — sem exigir «tocou» em secções só opcionais. */
  const hubSectionValidationComplete = (pageIdx: number) => {
    if (isRevisionVisitUi) {
      return sectionTimingFlagsForPage(pageIdx).ended;
    }
    if (effectiveFillMode === 'wizard') {
      const oid = pages[pageIdx]?.openingSectionId || '__preamble__';
      return wizardOpeningSectionComplete(oid);
    }
    return schemaPageFieldsComplete(pageIdx);
  };

  /** Preenchimento real ou janela de tempo de secção (sem depender do estado «concluído» do hub). */
  const hubSectionHasUserProgress = (pageIdx: number) => {
    const p = pages[pageIdx];
    if (!p) return false;
    const timing = sectionTimingFlagsForPage(pageIdx);
    if (isRevisionVisitUi) return timing.started && !timing.ended;
    if (timing.started && !timing.ended) return true;
    const openingId = p.openingSectionId || '__preamble__';
    const sb =
      openingId !== '__preamble__'
        ? (template?.schemaData || []).find(
            (x: any) => x.id === openingId && x.type === 'section_break'
          )
        : null;
    if (sb && sectionAllowsRepeat(sb)) {
      const rows = getRepeatRows(responses, sb.id);
      for (let ri = 0; ri < rows.length; ri++) {
        for (const f of p.fields || []) {
          if (!isFieldVisible(f)) continue;
          const ans = rows[ri]?.[f.id];
          if (isFieldAnswerFilled(f, ans)) return true;
        }
      }
      return false;
    }
    for (const f of p.fields || []) {
      if (!isFieldVisible(f)) continue;
      const ans = responses[f.id];
      if (isFieldAnswerFilled(f, ans)) return true;
    }
    return false;
  };

  /**
   * Legado / só leitura: «concluída» por validação de campos (execuções antigas sem `__section_end_*`).
   * Em edição, o menu do hub usa só marcadores de tempo — ver `sectionTimingFlagsForPage`.
   */
  const hubSectionSatisfied = (pageIdx: number) => {
    if (isRevisionVisitUi) {
      return sectionTimingFlagsForPage(pageIdx).ended;
    }
    if (!hubSectionValidationComplete(pageIdx)) return false;
    const hasHard =
      effectiveFillMode === 'wizard'
        ? wizardOpeningSectionHasHardRequirements(pages[pageIdx]?.openingSectionId || '__preamble__')
        : schemaPageHasHardRequirements(pageIdx);
    if (!hasHard) {
      return hubSectionHasUserProgress(pageIdx);
    }
    return true;
  };

  /** Ordem sequencial: só desbloqueia após «Concluir etapa» na anterior (`__section_end_*`). */
  const hubSectionUnlocked = (pageIdx: number) => {
    if (isReadOnly) return true;
    if (appHubSectionOrder !== 'sequential') return true;
    for (let j = 0; j < pageIdx; j++) {
      if (!sectionTimingFlagsForPage(j).ended) return false;
    }
    return true;
  };

  const hubSectionStarted = (pageIdx: number) => {
    const f = sectionTimingFlagsForPage(pageIdx);
    if (isRevisionVisitUi) return f.started;
    return f.started || f.ended;
  };

  /** Etapa iniciada mas ainda não satisfaz validação (para o hub estilo “em andamento”). */
  const hubSectionHasPartialProgress = (pageIdx: number) => {
    if (hubSectionSatisfied(pageIdx)) return false;
    return hubSectionHasUserProgress(pageIdx);
  };

  const openHubSection = (pageIdx: number, opts?: { repeatRowIndex?: number }) => {
    if (!hubSectionUnlocked(pageIdx)) {
      Alert.alert(
        'Ordem das etapas',
        'Complete as etapas anteriores (campos obrigatórios) antes de abrir esta.'
      );
      return;
    }
    const repeatField = hubRepeatSectionField(pageIdx);
    if (repeatField && opts?.repeatRowIndex != null && Number.isFinite(Number(opts.repeatRowIndex))) {
      const rows = getRepeatRows(responses, repeatField.id);
      const maxIdx = Math.max(0, rows.length - 1);
      const nextIdx = Math.max(0, Math.min(Number(opts.repeatRowIndex), maxIdx));
      setHubSelectedRepeatRowBySection((prev) => ({ ...prev, [String(repeatField.id)]: nextIdx }));
    }
    setCurrentPage(pageIdx);
    setHybridInnerWizardIndex(0);
    if (effectiveFillMode === 'wizard') {
      const oid = pages[pageIdx]?.openingSectionId || '__preamble__';
      const ix = wizardSteps.findIndex((s) => s.sectionOpeningId === oid);
      setWizardIndex(ix >= 0 ? ix : 0);
    }
    setHubPicking(false);
  };

  const hubRepeatSectionField = (pageIdx: number) => {
    const openingId = pages[pageIdx]?.openingSectionId || '__preamble__';
    if (
      !openingId ||
      openingId === '__preamble__' ||
      openingId === '__full__' ||
      openingId === '__wizard__'
    ) {
      return null;
    }
    const sb = (template?.schemaData || []).find(
      (x: any) => x.id === openingId && x.type === 'section_break'
    );
    return sb && sectionAllowsRepeat(sb) ? sb : null;
  };

  const hubRepeatRowStats = (pageIdx: number) => {
    const sb = hubRepeatSectionField(pageIdx);
    if (!sb) {
      return {
        enabled: false,
        sectionId: '',
        minRows: 0,
        maxRows: null as number | null,
        rawRows: [] as Record<string, any>[],
        visibleRows: [] as Record<string, any>[],
        completedRows: 0,
        startedRows: 0,
      };
    }
    const minRows = sectionRepeatMinRows(sb);
    const maxRows = sectionRepeatMaxRows(sb);
    const rawRows = getRepeatRows(responses, sb.id);
    const visibleLen = Math.max(rawRows.length, minRows, 1);
    const visibleRows = Array.from({ length: visibleLen }, (_, i) => rawRows[i] || {});
    const doneKey = sectionRepeatCompletedStorageKey(sb.id);
    const doneFlags = Array.isArray((responses as any)?.[doneKey]) ? ((responses as any)[doneKey] as unknown[]) : [];
    const visibleFields = (pages[pageIdx]?.fields || []).filter((f: any) => isFieldVisible(f));
    const completedRows = visibleRows.reduce((acc, _row, idx) => {
      return acc + (doneFlags[idx] === true ? 1 : 0);
    }, 0);
    const startedRows = visibleRows.reduce((acc, row) => {
      const started = visibleFields.some((f: any) => isFieldAnswerFilled(f, row?.[f.id]));
      return acc + (started ? 1 : 0);
    }, 0);
    return {
      enabled: true,
      sectionId: String(sb.id),
      minRows,
      maxRows,
      rawRows,
      visibleRows,
      doneFlags,
      completedRows,
      startedRows,
    };
  };

  const repeatRowIsCompletedForSectionFields = (sectionFields: any[], row: Record<string, any>) => {
    const requiredFields = (sectionFields || []).filter(
      (f: any) => isFieldVisible(f) && fieldMustAnswerForProgress(f)
    );
    if (requiredFields.length === 0) return true;
    return requiredFields.every((f: any) => isFieldAnswerFilled(f, row?.[f.id]));
  };

  const ensureCanAppendRepeatInstance = (
    sectionLabel: string,
    sectionId: string,
    rows: Record<string, any>[]
  ) => {
    if (!Array.isArray(rows) || rows.length === 0) return true;
    const k = sectionRepeatCompletedStorageKey(sectionId);
    const doneFlags = Array.isArray((responses as any)?.[k]) ? ((responses as any)[k] as unknown[]) : [];
    if (doneFlags[rows.length - 1] === true) return true;
    Alert.alert(
      'Instância anterior pendente',
      `Conclua a instância anterior em «${sectionLabel || 'Seção'}» pelo botão "Concluir" antes de adicionar uma nova.`
    );
    return false;
  };

  const addHubRepeatInstance = (pageIdx: number) => {
    if (!hubSectionUnlocked(pageIdx)) {
      Alert.alert(
        'Ordem das etapas',
        'Complete as etapas anteriores (campos obrigatórios) antes de abrir esta.'
      );
      return;
    }
    const rep = hubRepeatRowStats(pageIdx);
    if (!rep.enabled) {
      openHubSection(pageIdx);
      return;
    }
    if (rep.maxRows != null && rep.rawRows.length >= rep.maxRows) {
      Alert.alert('Limite de instâncias', `Máximo de ${rep.maxRows} instância(s) nesta seção.`);
      return;
    }
    const sectionLabel = String(pages[pageIdx]?.pageTitle || 'Seção');
    if (!ensureCanAppendRepeatInstance(sectionLabel, rep.sectionId, rep.rawRows)) return;
    const rkey = sectionRepeatStorageKey(rep.sectionId);
    setResponses((prev: any) => {
      const rows = Array.isArray(prev[rkey]) ? [...prev[rkey]] : [];
      rows.push({});
      const next = { ...prev, [rkey]: rows };
      void AsyncStorage.setItem(draftKeyForForm, JSON.stringify(next));
      return next;
    });
    setHubSelectedRepeatRowBySection((prev) => ({
      ...prev,
      [String(rep.sectionId)]: Math.max(0, rep.rawRows.length),
    }));
    setCurrentPage(pageIdx);
    setHybridInnerWizardIndex(0);
    if (effectiveFillMode === 'wizard') {
      const oid = pages[pageIdx]?.openingSectionId || '__preamble__';
      const ix = wizardSteps.findIndex((s) => s.sectionOpeningId === oid);
      setWizardIndex(ix >= 0 ? ix : 0);
    }
    setHubPicking(false);
  };

  // Focus Section Tracking + cronômetro exclusivo por etapa (sem contagem simultânea)
  useEffect(() => {
    const draftKey = resolvedTaskId ? `@draft_tsk_${resolvedTaskId}` : `@draft_chk_${id}`;
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);

    const nextActiveSectionId = (() => {
      if (isReadOnly) return null;
      if (effectiveFillMode === 'wizard') return null;
      if (useSectionHub && hubPicking) return null;
      const currentSectionData = displayPages[currentPage];
      if (!currentSectionData || !currentSectionData.id || currentSectionData.id === '__full__') return null;
      return String(currentSectionData.id);
    })();

    const prevActiveSectionId = activeSectionTimingIdRef.current;
    if (prevActiveSectionId === nextActiveSectionId) return;
    activeSectionTimingIdRef.current = nextActiveSectionId;

    setResponses((prev: any) => {
      let next = prev;
      let changed = false;

      const closeActiveSegment = (sectionId: string) => {
        const keys = getSectionTimingKeys(sectionId);
        const segStartRaw = next?.[keys.activeStart];
        if (!segStartRaw) return;
        const segStartMs = Date.parse(String(segStartRaw));
        if (!Number.isFinite(segStartMs) || !Number.isFinite(nowMs) || nowMs <= segStartMs) {
          if (next?.[keys.activeStart] != null) {
            next = { ...next, [keys.activeStart]: null };
            changed = true;
          }
          return;
        }
        let segSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
        for (const ev of parsePauseHistory(next)) {
          const w = pauseEventWindowMs(ev);
          if (w) segSec -= overlapSeconds(segStartMs, nowMs, w.start, w.end);
        }
        const since = next?.__form_paused_since;
        if (since) {
          const pt = Date.parse(String(since));
          if (Number.isFinite(pt)) segSec -= overlapSeconds(segStartMs, nowMs, pt, nowMs);
        }
        const currentBase = Number(next?.[keys.activeSeconds]);
        const base = Number.isFinite(currentBase) && currentBase > 0 ? Math.floor(currentBase) : 0;
        next = {
          ...next,
          [keys.activeSeconds]: Math.max(0, base + Math.max(0, segSec)),
          [keys.activeStart]: null,
        };
        changed = true;
      };

      if (prevActiveSectionId && prevActiveSectionId !== nextActiveSectionId) {
        closeActiveSegment(prevActiveSectionId);
      }

      if (nextActiveSectionId) {
        const keys = getSectionTimingKeys(nextActiveSectionId);
        const hasStartMarker =
          (typeof next?.[keys.start] === 'string' && String(next[keys.start]).trim() !== '') || !!next?.[keys.start];
        const hasActiveSegment =
          (typeof next?.[keys.activeStart] === 'string' && String(next[keys.activeStart]).trim() !== '') ||
          !!next?.[keys.activeStart];
        if (!hasStartMarker || !hasActiveSegment) {
          next = {
            ...next,
            ...(hasStartMarker ? null : { [keys.start]: nowIso }),
            ...(hasActiveSegment ? null : { [keys.activeStart]: nowIso }),
          };
          changed = true;
        }
      }

      if (!changed) return prev;
      void AsyncStorage.setItem(draftKey, JSON.stringify(next));
      return next;
    });
  }, [effectiveFillMode, useSectionHub, hubPicking, displayPages, currentPage, isReadOnly, resolvedTaskId, id]);

  /** Referência estável — deve rodar em todo render (não pode ficar após return loading/geo). */
  const liveRouteCoordsForMap = useMemo(
    () => buildRouteCoordsFromTask(currentTask),
    [currentTask?.locationPolygon, currentTask?.locationZoneType],
  );

  const activeTransitLeg = useMemo(
    () => getActiveTransitLegInfo(template?.schemaData, responses as Record<string, unknown>),
    [template?.schemaData, responses],
  );

  /** Sincronização leve: link de tracking + ETA do servidor quando não há deslocamento operacional ativo (sem disputar o relógio local). */
  useEffect(() => {
    if (!resolvedTaskId || isReadOnly) return;

    const persistEta = async (cloudTasks: any[], minutes: number) => {
      const updatedTasks = cloudTasks.map((t: any) =>
        String(t.id) === String(resolvedTaskId) ? { ...t, etaMinutes: minutes } : t
      );
      await savePartitionedFromUnifiedList(updatedTasks);
    };

    const run = async () => {
      try {
        let cloudTasks: any[] = [];
        try {
          cloudTasks = await loadAllCloudTasksForExecutionLookup();
        } catch {
          cloudTasks = [];
        }

        const cachedTask = cloudTasks.find((t: any) => String(t.id) === String(resolvedTaskId));
        const cachedNorm = normalizeEtaMinutes(cachedTask?.etaMinutes);
        const inOpTransit = activeTransitLeg && !activeTransitLeg.reimbursement;

        if (cachedNorm !== null && !inOpTransit) {
          setMapEtaMinutes(cachedNorm);
          setCurrentTask((prev: any) => {
            if (!prev || prev.etaMinutes === cachedNorm) return prev;
            return { ...prev, etaMinutes: cachedNorm };
          });
        }

        const res = await apiFetch(`/api/checklists/executions/${resolvedTaskId}`);
        if (!res.ok) return;
        const data: any = await res.json();

        const tUrl =
          data?.trackingUrl ??
          (data?.metadata && typeof data.metadata === 'object' ? data.metadata.trackingUrl : null);
        if (tUrl) setTrackingUrl(String(tUrl));

        const finalEta = normalizeEtaMinutes(data?.etaMinutes);
        if (finalEta !== null && !inOpTransit) {
          await persistEta(cloudTasks, finalEta);
          setMapEtaMinutes(finalEta);
          setCurrentTask((prev: any) => (prev ? { ...prev, etaMinutes: finalEta } : prev));
        }
      } catch {
        /* ignore */
      }
    };

    void run();
    const interval = setInterval(run, 120000);
    return () => clearInterval(interval);
  }, [resolvedTaskId, isReadOnly, activeTransitLeg, responses, template?.schemaData]);

  /**
   * Deslocamento operacional: ETA com Google (máx. 5 chamadas ao proxy por trecho), refresco a cada 7 min;
   * entre chamadas o valor desce com o relógio.
   */
  useEffect(() => {
    if (!resolvedTaskId || isReadOnly) return;

    const op = activeTransitLeg && !activeTransitLeg.reimbursement;

    if (!op || !activeTransitLeg) {
      if (prevHadOperationalTransitRef.current && resolvedTaskId) {
        void apiFetch(
          `/api/checklists/executions/${encodeURIComponent(String(resolvedTaskId))}/transit-eta-display`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clear: true }),
          }
        ).catch(() => {});
      }
      prevHadOperationalTransitRef.current = false;
      transitEtaLegKeyRef.current = '';
      transitEtaSnapshotRef.current = null;
      return;
    }

    prevHadOperationalTransitRef.current = true;

    const schema = template?.schemaData || [];
    const startId = activeTransitLeg.startField.id;
    const rawStart = findFieldValueInResponses(responses as Record<string, unknown>, startId, schema);
    let startTs = '';
    try {
      const o = typeof rawStart === 'string' ? JSON.parse(rawStart) : rawStart;
      startTs = String(o?.timestamp || '');
    } catch {
      startTs = '';
    }
    const legKey = `${startId}:${startTs}`;
    if (legKey !== transitEtaLegKeyRef.current) {
      transitEtaLegKeyRef.current = legKey;
      transitEtaGoogleInvocationsRef.current = 0;
      transitEtaSnapshotRef.current = null;
    }

    const task = currentTaskRef.current || {};
    const tl = getDestFromTaskLike(task);
    const routeCoords = buildRouteCoordsFromTask(task);
    const destPt = pickDestinationForOsrm(tl ? { lat: tl.lat, lng: tl.lng } : {}, routeCoords);
    if (!destPt) return;

    const applySnapshot = (remainingMin: number) => {
      const rm = Math.max(1, Math.round(remainingMin));
      const atMs = Date.now();
      transitEtaSnapshotRef.current = { atMs, remainingMin: rm };
      setMapEtaMinutes(rm);
      /** Imediato: novo valor Google/OSRM (ex. salto 20→35); o link público não pode ficar só no OSRM da BD. */
      flushPublicTransitEtaDisplayNow(rm);
    };

    const persistEta = async (minutes: number) => {
      let cloudTasks: any[] = [];
      try {
        cloudTasks = await loadAllCloudTasksForExecutionLookup();
      } catch {
        cloudTasks = [];
      }
      const updatedTasks = cloudTasks.map((t: any) =>
        String(t.id) === String(resolvedTaskId) ? { ...t, etaMinutes: minutes } : t
      );
      await savePartitionedFromUnifiedList(updatedTasks);
      setCurrentTask((prev: any) => (prev ? { ...prev, etaMinutes: minutes } : prev));
    };

    const fetchRouteEtaSnapshot = async () => {
      if (transitEtaGoogleInvocationsRef.current >= TRANSIT_ETA_GOOGLE_MAX_CALLS_PER_TRIP) {
        return;
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const oLat = pos.coords.latitude;
        const oLng = pos.coords.longitude;

        transitEtaGoogleInvocationsRef.current += 1;
        let minutes: number | null = null;
        const google = await fetchGoogleDrivingLegMetricsOrNull(oLat, oLng, destPt.lat, destPt.lng);
        if (google?.ok && google.durationSeconds != null) {
          minutes = Math.max(1, Math.round(google.durationSeconds / 60));
        } else {
          const osrm = await fetchDrivingLegEtaMinutes(oLat, oLng, destPt.lat, destPt.lng);
          if (osrm.ok && osrm.minutes != null) minutes = osrm.minutes;
        }

        if (minutes == null) return;
        applySnapshot(minutes);
        await persistEta(minutes);
      } catch {
        /* ignore */
      }
    };

    void fetchRouteEtaSnapshot();

    const refreshIv = setInterval(() => {
      void fetchRouteEtaSnapshot();
    }, TRANSIT_ETA_GOOGLE_REFRESH_MS);

    const tickIv = setInterval(() => {
      const snap = transitEtaSnapshotRef.current;
      if (!snap) return;
      const m = computeTickingEtaMinutes(snap.atMs, snap.remainingMin, Date.now());
      setMapEtaMinutes(m);
      flushPublicTransitEtaDisplayNow(m);
    }, TRANSIT_ETA_TICK_MS);

    return () => {
      clearInterval(refreshIv);
      clearInterval(tickIv);
    };
  }, [
    resolvedTaskId,
    isReadOnly,
    activeTransitLeg,
    responses,
    template?.schemaData,
    flushPublicTransitEtaDisplayNow,
  ]);

  /** Deve rodar antes de qualquer return antecipado (loading / mapa), senão viola as regras dos hooks. */
  const sessionPauseOpenEvent = useMemo(() => {
    const active = Boolean(responses.__form_paused_since) && !!resolvedTaskId && !isReadOnly;
    if (!active) return null;
    const hist = parsePauseHistory(responses);
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i]?.endedAt == null && hist[i]?.startedAt) return hist[i];
    }
    return null;
  }, [responses, resolvedTaskId, isReadOnly]);

  const validateCurrentPageBeforeSectionExit = (pageData: any, actionLabel: string) => {
    if (!pageData || !Array.isArray(pageData.fields)) return false;
    for (const f of pageData.fields) {
      if (!isFieldVisible(f)) continue;
      if (!fieldMustAnswerForProgress(f)) continue;
      const ans = responses[f.id];
      if (!isFieldAnswerFilled(f, ans)) {
        Alert.alert(
          'Atenção',
          f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
            ? `Valide a localização em «${f.label}» (dentro da área) antes de ${actionLabel}.`
            : `O campo '${f.label}' é obrigatório.`,
        );
        return false;
      }
    }
    return true;
  };

  const closeCurrentSectionAsCompleted = (pageData: any) => {
    if (!pageData || !pageData.id || pageData.id === '__full__' || isReadOnly) return;
    const endKey = `__section_end_${pageData.id}`;
    const draftKey = resolvedTaskId ? `@draft_tsk_${resolvedTaskId}` : `@draft_chk_${id}`;
    setResponses((prev: any) => {
      let newRes = { ...prev, [endKey]: new Date().toISOString() } as Record<string, any>;
      const openingId = String(pageData?.openingSectionId || '').trim();
      const repeatSection =
        openingId &&
        openingId !== '__preamble__' &&
        openingId !== '__full__' &&
        openingId !== '__wizard__'
          ? (template?.schemaData || []).find(
              (x: any) => x.id === openingId && x.type === 'section_break' && sectionAllowsRepeat(x)
            )
          : null;
      if (repeatSection?.id) {
        const sid = String(repeatSection.id);
        const rows = getRepeatRows(newRes, sid);
        if (rows.length > 0) {
          const selectedRaw = hubSelectedRepeatRowBySection[sid];
          const selected = Number.isFinite(Number(selectedRaw)) ? Number(selectedRaw) : rows.length - 1;
          const rowIdx = Math.max(0, Math.min(selected, rows.length - 1));
          const doneKey = sectionRepeatCompletedStorageKey(sid);
          const done = Array.isArray(newRes[doneKey]) ? [...newRes[doneKey]] : [];
          while (done.length < rows.length) done.push(false);
          done[rowIdx] = true;
          newRes = { ...newRes, [doneKey]: done };
        }
      }
      void AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
      return newRes;
    });
  };

  const handleCompleteSectionToHub = () => {
    const currentPageData = displayPages[currentPage];
    if (!validateCurrentPageBeforeSectionExit(currentPageData, 'concluir')) return;
    closeCurrentSectionAsCompleted(currentPageData);
    setHybridInnerWizardIndex(0);
    setHubPicking(true);
  };

  const handleNextPage = () => {
    const currentPageData = displayPages[currentPage];
    if (!validateCurrentPageBeforeSectionExit(currentPageData, 'avançar')) return;
    if (currentPage >= displayPages.length - 1) return;
    closeCurrentSectionAsCompleted(currentPageData);
    setCurrentPage((p) => p + 1);
    setHybridInnerWizardIndex(0);
  };

  const handleWizardNext = () => {
    const step = wizardSteps[wizardIndex];
    if (!step || !step.fields.length) return;
    if (step.sectionRepeat?.sectionField) {
      const sb = step.sectionRepeat.sectionField;
      const sid = step.sectionRepeat.sectionId;
      const rows = getRepeatRows(responses, sid);
      const minR = sectionRepeatMinRows(sb);
      const maxR = sectionRepeatMaxRows(sb);
      if (rows.length < minR) {
        Alert.alert(
          'Atenção',
          `A seção "${sb.label || ''}" exige pelo menos ${minR} preenchimento(s).`
        );
        return;
      }
      if (maxR != null && rows.length > maxR) {
        Alert.alert('Atenção', `Máximo de ${maxR} instâncias nesta seção.`);
        return;
      }
      const n = Math.max(rows.length, minR, 1);
      for (const f of step.fields) {
        if (!isFieldVisible(f)) continue;
        for (let ri = 0; ri < n; ri++) {
          const ans = rows[ri]?.[f.id];
          if (fieldMustAnswerForProgress(f) && !isFieldAnswerFilled(f, ans)) {
            Alert.alert(
              'Atenção',
              f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
                ? `Valide a localização em «${f.label || f.id}» (instância ${ri + 1}, dentro da área) antes de avançar.`
                : `O campo '${f.label || f.id}' (instância ${ri + 1}) é obrigatório.`,
            );
            return;
          }
        }
      }
    } else {
      for (const f of step.fields) {
        if (!isFieldVisible(f)) continue;
        if (fieldMustAnswerForProgress(f)) {
          const ans = responses[f.id];
          if (!isFieldAnswerFilled(f, ans)) {
            Alert.alert(
              'Atenção',
              f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
                ? `Valide a localização em «${f.label}» (dentro da área) antes de avançar.`
                : `O campo '${f.label}' é obrigatório.`,
            );
            return;
          }
        }
      }
    }
    if (wizardIndex < wizardSteps.length - 1) {
      setWizardIndex((w) => w + 1);
    }
  };

  const handleWizardPrev = () => {
    if (wizardIndex > 0) setWizardIndex((w) => w - 1);
  };

  const handleHybridInnerNext = () => {
    const page = displayPages[currentPage];
    if (!page) return;
    const vis = (page.fields || []).filter((x: any) => isFieldVisible(x));
    const cur = vis[hybridInnerWizardIndex];
    if (!cur) return;
    if (fieldMustAnswerForProgress(cur)) {
      const ans = responses[cur.id];
      if (!isFieldAnswerFilled(cur, ans)) {
        Alert.alert(
          'Atenção',
          cur.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(cur)
            ? `Valide a localização em «${cur.label}» (dentro da área) antes de avançar.`
            : `O campo '${cur.label}' é obrigatório.`,
        );
        return;
      }
    }
    if (hybridInnerWizardIndex < vis.length - 1) {
      setHybridInnerWizardIndex((i) => i + 1);
    } else if (currentPage < displayPages.length - 1) {
      handleNextPage();
    }
  };

  const handleHybridPagePrev = () => {
    const page = displayPages[currentPage];
    const inner = page ? resolvePageInnerMode(page, 'hybrid') : 'list';
    if (useSectionHub && !hubPicking) {
      if (inner === 'wizard' && hybridInnerWizardIndex > 0) {
        setHybridInnerWizardIndex((i) => i - 1);
        return;
      }
      setHybridInnerWizardIndex(0);
      setHubPicking(true);
      return;
    }
    if (inner === 'wizard' && hybridInnerWizardIndex > 0) {
      setHybridInnerWizardIndex((i) => i - 1);
      return;
    }
    if (currentPage <= 0) return;
    const newPage = currentPage - 1;
    const pp = displayPages[newPage];
    setCurrentPage(newPage);
    const pm = pp ? resolvePageInnerMode(pp, 'hybrid') : 'list';
    if (pm === 'wizard') {
      const nv = (pp?.fields || []).filter((x: any) => isFieldVisible(x)).length;
      setHybridInnerWizardIndex(Math.max(0, nv - 1));
    } else {
      setHybridInnerWizardIndex(0);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;

  // ── Cerca global (template): raio `globalGeofenceRadius`, sempre bloqueia fora da zona (exc. tipo rota no mapa). ──
  if (showGlobalGeofenceMap && globalGeofenceMapTask) {
    return (
      <GeofenceMapScreen
        task={globalGeofenceMapTask}
        failMode="block"
        onCancel={() => router.back()}
        onProceed={async () => {
          setShowGlobalGeofenceMap(false);
          setGlobalGeofenceMapTask(null);
          setGeoMapChecked(true);
          const t = currentTaskRef.current;
          if (t?.locationZoneType === 'route' && t?.locationPolygon) {
            const poly =
              typeof t.locationPolygon === 'string' ? JSON.parse(t.locationPolygon) : t.locationPolygon;
            const tolerance = t.locationRadius || 100;
            routeTracker.start(poly, tolerance).catch(() => {});
          }
        }}
      />
    );
  }

  // ── Opção B: Tela de Mapa de Confirmação (rota/trecho) ───────────────────────
  if (showGeoMap && currentTask) {
    return (
      <GeofenceMapScreen
        task={currentTask}
        failMode={geofenceFailMode}
        onCancel={() => router.back()}
        onProceed={async () => {
          setShowGeoMap(false);
          if (
            pendingGlobalGeofenceAfterRouteRef.current &&
            currentTaskRef.current &&
            taskHasServiceLocationForGlobalGate(currentTaskRef.current)
          ) {
            pendingGlobalGeofenceAfterRouteRef.current = false;
            const gr = globalGeofenceRadiusForNextGateRef.current;
            setGlobalGeofenceMapTask(buildGlobalGeofenceMapTask(currentTaskRef.current, gr));
            setShowGlobalGeofenceMap(true);
            return;
          }
          pendingGlobalGeofenceAfterRouteRef.current = false;
          setGeoMapChecked(true);
          // Start route tracking if it's a route (Opção D)
          if (currentTask?.locationZoneType === 'route' && currentTask?.locationPolygon) {
            const poly = typeof currentTask.locationPolygon === 'string'
              ? JSON.parse(currentTask.locationPolygon)
              : currentTask.locationPolygon;
            const tolerance = currentTask.locationRadius || 100; // metros configuráveis
            routeTracker.start(poly, tolerance).catch(() => {});
          }
        }}
      />
    );
  }

  const hybridPage = displayPages[currentPage] || null;
  const hybridInnerMode =
    effectiveFillMode === 'hybrid' && hybridPage
      ? resolvePageInnerMode(hybridPage, 'hybrid')
      : 'list';
  const hybridVisibleFields =
    effectiveFillMode === 'hybrid' && hybridPage
      ? (hybridPage.fields || []).filter((x: any) => isFieldVisible(x))
      : [];

  const basePageData = displayPages[currentPage] || { fields: [], pageTitle: 'Checklist', id: '' };

  const currentPageData =
    effectiveFillMode === 'wizard'
      ? {
          fields: wizardSteps[wizardIndex]?.fields || [],
          pageTitle: template?.title || 'Checklist',
          id: '__wizard__',
        }
      : basePageData;

  const currentFieldsToRender =
    effectiveFillMode === 'wizard'
      ? wizardSteps[wizardIndex]?.fields || []
      : effectiveFillMode === 'hybrid' && hybridInnerMode === 'wizard'
        ? hybridVisibleFields[hybridInnerWizardIndex]
          ? [hybridVisibleFields[hybridInnerWizardIndex]]
          : []
        : basePageData.fields;

  const nowClock = Date.now();
  const formElapsedDisp = getFormElapsedSeconds(responses, nowClock);
  const activeDisp = getFormActiveDisplaySeconds(responses, fgSegmentStartRef.current, nowClock);
  const sectionElapsedDisp =
    currentPageData.id &&
    currentPageData.id !== '__full__' &&
    currentPageData.id !== '__wizard__' &&
    !isReadOnly
      ? getSectionElapsedSeconds(responses, currentPageData.id, nowClock)
      : null;

  const sectionElapsedBadge =
    currentPageData.id &&
    currentPageData.id !== '__full__' &&
    currentPageData.id !== '__wizard__'
      ? getSectionElapsedSeconds(responses, currentPageData.id, nowClock)
      : null;
  const showSectionTimerInFooter =
    !(useSectionHub && hubPicking) &&
    !!currentPageData.id &&
    currentPageData.id !== '__full__' &&
    currentPageData.id !== '__wizard__';

  void ruleTick;

  const headerPageTitle =
    effectiveFillMode === 'wizard'
      ? template?.title || 'Checklist'
      : currentPageData.pageTitle !== 'Página 1'
        ? currentPageData.pageTitle
        : template?.title || 'Checklist';

  const displayHeaderTitle =
    useSectionHub && hubPicking ? template?.title || 'Checklist' : headerPageTitle;
  const displayHeaderSectionIcon =
    !(
      useSectionHub &&
      hubPicking
    ) &&
    String((currentPageData as any)?.sectionIcon || '').trim()
      ? {
          icon: String((currentPageData as any)?.sectionIcon || '').trim(),
          iconLibrary: String((currentPageData as any)?.sectionIconLibrary || 'Ionicons').trim() || 'Ionicons',
          iconColor: String((currentPageData as any)?.sectionIconColor || '#ffffff').trim() || '#ffffff',
        }
      : null;

  const sessionPauseActive =
    Boolean(responses.__form_paused_since) && !!resolvedTaskId && !isReadOnly;
  const pauseSecondsLive = sessionPauseActive ? getActivePauseSeconds(responses, nowClock) : 0;

  const pageOpeningSectionId = (currentPageData as { openingSectionId?: string }).openingSectionId;
  const openingSectionBreakField =
    pageOpeningSectionId &&
    pageOpeningSectionId !== '__preamble__' &&
    pageOpeningSectionId !== '__full__' &&
    pageOpeningSectionId !== '__wizard__'
      ? template?.schemaData?.find(
          (x: any) => x.id === pageOpeningSectionId && x.type === 'section_break'
        )
      : null;

  const paginatedSectionRepeatEnabled =
    effectiveFillMode !== 'full' &&
    effectiveFillMode !== 'wizard' &&
    !!openingSectionBreakField &&
    sectionAllowsRepeat(openingSectionBreakField);

  const currentRepeatRawRows =
    paginatedSectionRepeatEnabled && openingSectionBreakField
      ? getRepeatRows(responses, openingSectionBreakField.id)
      : [];
  const currentRepeatMinRows = openingSectionBreakField ? sectionRepeatMinRows(openingSectionBreakField) : 0;
  const currentRepeatVisibleLen = paginatedSectionRepeatEnabled
    ? Math.max(currentRepeatRawRows.length, currentRepeatMinRows, 1)
    : 0;

  const wizardStepSectionRepeat =
    effectiveFillMode === 'wizard' ? wizardSteps[wizardIndex]?.sectionRepeat : undefined;

  return (
    <View style={styles.container}>
      {visionGridCompose ? (
        <ChecklistVisionGridComposeRunner
          key={visionGridCompose.uris.join('|')}
          uris={visionGridCompose.uris}
          cols={visionGridCompose.cols}
          rows={visionGridCompose.rows}
          onDone={async (b64) => {
            const job = visionGridCompose;
            if (!job) return;
            try {
              const base = FileSystem.cacheDirectory;
              if (!base) throw new Error('Cache do dispositivo indisponível.');
              const out = `${base}vision_grid_${Date.now()}.png`;
              await FileSystem.writeAsStringAsync(out, b64, { encoding: 'base64' });
              setVisionGridCompose(null);
              let uploadUri = out;
              let uploadMime = 'image/png';
              let uploadName = 'grelha-visao.png';
              try {
                const jpeg = await ImageManipulator.manipulateAsync(
                  out,
                  [{ resize: { width: 1600 } }],
                  { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
                );
                if (jpeg?.uri) {
                  uploadUri = jpeg.uri;
                  uploadMime = 'image/jpeg';
                  uploadName = 'grelha-visao.jpg';
                }
              } catch {
                /* mantém PNG composto (já limitado no runner) */
              }
              const facialQs = await buildFacialCaptureQuerySuffix();
              const captureCompositeUri = uploadUri.split('?')[0] + facialQs;
              await runVisionChecklistAnalyze(
                job.field,
                captureCompositeUri,
                uploadMime,
                uploadName,
                job.scope,
                { persistExtras: { gridSlotUris: job.slotUrisForPersist } },
              );
            } catch (e: any) {
              setVisionGridCompose(null);
              Alert.alert('Visão IA', e?.message || 'Não foi possível preparar a grelha.');
            }
          }}
          onError={(e) => {
            setVisionGridCompose(null);
            Alert.alert('Visão IA', e.message);
          }}
        />
      ) : null}
      <LinearGradient 
        colors={[C.primary, C.branding]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingBottom: 16 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <TouchableOpacity
            onPress={() => {
              if (taskId && !isReadOnly && responses.__form_paused_since) {
                exitPauseToList();
                return;
              }
              router.back();
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          {useSectionHub && hubStageMenuHasSteps && !isReadOnly ? (
            <TouchableOpacity
              onPress={() => {
                if (!hubPicking) setHubPicking(true);
              }}
              disabled={hubPicking}
              style={{ padding: 4, opacity: hubPicking ? 0.4 : 1 }}
              accessibilityLabel="Menu de etapas"
            >
              <Ionicons name="grid-outline" size={22} color="#FFF" />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {displayHeaderSectionIcon ? (
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {renderSchemaIcon(displayHeaderSectionIcon, 15)}
              </View>
            ) : null}
            <Text style={[styles.headerTitle, { flexShrink: 1 }]} numberOfLines={2}>
              {displayHeaderTitle}
            </Text>
          </View>
          {taskId ? (
            <Text
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontSize: 12,
                fontWeight: '700',
                marginTop: 4,
                letterSpacing: 0.2,
              }}
              numberOfLines={1}
            >
              {taskOsLabel({
                id: String(taskId),
                osNumber: currentTask?.osNumber ?? null,
              })}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 40 }}>
          {resolvedTaskId ? (
            <TouchableOpacity
              onPress={() => {
                const tid = String(resolvedTaskId || '').trim();
                if (!tid) return;
                const label = taskOsLabel({
                  id: tid,
                  osNumber: currentTask?.osNumber ?? null,
                  routineTaskNumber: currentTask?.routineTaskNumber ?? null,
                });
                router.push({
                  pathname: '/chat/[id]',
                  params: {
                    id: tid,
                    ops: '1',
                    name: `Gestor · ${label}`,
                    color: '#1d4ed8',
                  },
                } as never);
              }}
              accessibilityLabel="Mensagens do gestor sobre esta FT"
              style={{ position: 'relative' }}
            >
              <Ionicons name="chatbubbles-outline" size={26} color="#FFF" />
              {opsChatGestorBadge ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: -2,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: '#EF4444',
                    borderWidth: 2,
                    borderColor: 'rgba(255,255,255,0.95)',
                  }}
                />
              ) : null}
            </TouchableOpacity>
          ) : null}
          {taskId && !isReadOnly && !responses.__form_paused_since && !activeTransitLeg ? (
            <TouchableOpacity
              onPress={() => {
                setPausePickerStep('category');
                setPauseSelectedCategory(null);
                setPauseDetailDraft('');
                setPauseHighlightSubId(null);
                setPauseReasonModalVisible(true);
              }}
              accessibilityLabel={t('pause.pausedTitle')}
            >
              <Ionicons name="pause-circle" size={28} color="#FFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>
      
      {/* Opção A: Status bar em tempo real */}
      <GeofenceStatusBar task={globalFenceConsultTask ?? currentTask} />

      {globalFenceConsultTask && !loading && !showGlobalGeofenceMap && !showGeoMap ? (
        <GlobalGeofenceConsultMap task={globalFenceConsultTask} visible />
      ) : null}

      <SegmentDestinationPickerModal
        visible={segmentDestModal != null}
        pointA={segmentDestModal?.pointA ?? { lat: 0, lng: 0 }}
        pointB={segmentDestModal?.pointB ?? { lat: 0, lng: 0 }}
        onCancel={() => setSegmentDestModal(null)}
        onSelect={async (which) => {
          const pending = segmentDestModal;
          setSegmentDestModal(null);
          if (!pending) return;
          const tid = String(resolvedTaskId || '').trim();
          if (tid) {
            try {
              await enqueueExecutionStatusPatch(tid, {
                metadata: { transitSegmentDestination: which },
              });
              await updateLocalCloudTaskFields(tid, {
                metadata: { transitSegmentDestination: which },
              });
              setCurrentTask((prev: any) =>
                prev && prev.id === tid
                  ? {
                      ...prev,
                      metadata: { ...(prev.metadata || {}), transitSegmentDestination: which },
                    }
                  : prev
              );
              if (currentTaskRef.current?.id === tid) {
                currentTaskRef.current = {
                  ...currentTaskRef.current,
                  metadata: {
                    ...(currentTaskRef.current.metadata || {}),
                    transitSegmentDestination: which,
                  },
                };
              }
            } catch {
              /* ignore */
            }
          }
          await handleTransit(pending.fieldId, 'SAIDA', undefined, pending.scope);
          const email = await AsyncStorage.getItem('@brspark_email');
          const schSel = template?.schemaData || [];
          const reimbSel = isReimbursementTransitField(schSel, pending.fieldId);
          lastTransitScopeRef.current = pending.scope ?? null;
          dataCollectionService.setState('IN_TRANSIT', {
            executionId: String(taskId || ''),
            ownerEmail: email || 'unknown',
          }).catch(() => {});
          if (!reimbSel) {
            await generateTrackingLink();
          }
          if (
            reimbSel ||
            isPatrolTransitField(schSel, pending.fieldId) ||
            currentTask?.locationZoneType === 'route' ||
            currentTask?.locationZoneType === 'segment' ||
            currentTask?.locationZoneType === 'polygon'
          ) {
            setShowLiveMap(true);
          }
        }}
      />

      {/* Opção D: % = progresso ao longo da linha desde o início desta sessão de GPS (ver routeTrackingService). */}
      <RouteProgressBar />

      {/* Mapa ao vivo durante deslocamento de rota/ponto */}
      {(() => {
        const schema = template?.schemaData || [];
        const hasTransit = schema.some((f: any) => f.type === 'transit_start');
        if (
          !hasTransit &&
          currentTask?.locationZoneType !== 'route' &&
          currentTask?.locationZoneType !== 'segment' &&
          currentTask?.locationZoneType !== 'polygon'
        ) {
          return null;
        }

        const routeCoords = liveRouteCoordsForMap;

        const activeStartField = activeTransitLeg?.startField;
        const activeEndField = activeTransitLeg?.endField;
        const reimbursementMode = !!activeTransitLeg?.reimbursement;
        const patrolMode = !!activeTransitLeg?.patrol;

        const startVal =
          activeStartField &&
          findFieldValueInResponses(responses, activeStartField.id, schema);

        const isVisible = showLiveMap || activeTransitLeg != null;
        /** Só montar o mapa quando visível — evita alternar «wrapper vazio» vs árvore com hooks (Rules of Hooks no dev). */
        if (!isVisible) return null;

        const routeDest = getDestFromTaskLike(currentTask || {});
        const routeEndCoord =
          routeCoords.length > 0
            ? {
                lat: routeCoords[routeCoords.length - 1][0],
                lng: routeCoords[routeCoords.length - 1][1],
              }
            : null;
        const mergedEta =
          reimbursementMode
            ? undefined
            : mapEtaMinutes ?? normalizeEtaMinutes(currentTask?.etaMinutes);

        const targetForMap =
          reimbursementMode
            ? null
            : routeDest ||
              routeEndCoord ||
              (() => {
                const la = currentTask?.locationLat;
                const ln = currentTask?.locationLng;
                const latN = typeof la === 'number' ? la : parseFloat(String(la ?? '').replace(',', '.'));
                const lngN = typeof ln === 'number' ? ln : parseFloat(String(ln ?? '').replace(',', '.'));
                if (
                  Number.isFinite(latN) &&
                  Number.isFinite(lngN) &&
                  latN >= -90 &&
                  latN <= 90 &&
                  lngN >= -180 &&
                  lngN <= 180
                ) {
                  return { lat: latN, lng: lngN };
                }
                return null;
              })();

        const corridorTol =
          currentTask?.locationZoneType === 'route'
            ? parseInt(String(currentTask?.locationRadius ?? '100'), 10) || 100
            : undefined;

        let transitStartedAtIso: string | null = null;
        if (startVal != null && String(startVal).trim() !== '') {
          try {
            const o = typeof startVal === 'string' ? JSON.parse(startVal) : startVal;
            const ts = o?.timestamp;
            if (typeof ts === 'string' && ts.trim()) transitStartedAtIso = ts.trim();
          } catch {
            /* ignore */
          }
        }

        const keepScreenAwake = activeStartField?.transitKeepScreenAwake !== false;
        const routeForCard = reimbursementMode ? [] : routeCoords;

        return <LiveRouteMapCard 
                  route={routeForCard} 
                  visible={isVisible}
                  keepScreenAwake={keepScreenAwake}
                  zoneType={currentTask?.locationZoneType}
                  corridorToleranceM={corridorTol}
                  reimbursementMode={reimbursementMode}
                  patrolMode={patrolMode}
                  onPublicTrackingEtaChange={commitPublicTrackingEtaFromBadge}
                  targetLoc={
                    targetForMap
                      ? { lat: targetForMap.lat, lng: targetForMap.lng }
                      : undefined
                  }
                  etaMinutes={typeof mergedEta === 'number' && Number.isFinite(mergedEta) ? mergedEta : undefined}
                  transitStartedAtIso={transitStartedAtIso}
                  taskId={reimbursementMode ? undefined : resolvedTaskId || undefined}
                  endTransitLoading={activeEndField ? gpsBusyFieldId === activeEndField.id : false}
                  onEndTransit={activeEndField ? async () => {
                      const hasValue = !!findFieldValueInResponses(
                        responses,
                        activeEndField.id,
                        template?.schemaData
                      );
                      if (hasValue) return;
                      const path = routeTracker.getTraversedPath();
                      await handleTransit(
                        activeEndField.id,
                        'CHEGADA',
                        path,
                        lastTransitScopeRef.current
                      );
                      lastTransitScopeRef.current = null;
                      setShowLiveMap(false);
                  } : undefined}
               />;
      })()}

      {!(useSectionHub && hubPicking) &&
      effectiveFillMode === 'wizard' &&
      wizardSteps.length > 0 ? (
        <View style={styles.progressBarWrapper}>
          {basePageData?.sectionIcon ? (
            <View
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {renderSchemaIcon(
                {
                  icon: basePageData.sectionIcon,
                  iconLibrary: basePageData.sectionIconLibrary,
                  iconColor: basePageData.sectionIconColor,
                },
                15
              )}
            </View>
          ) : null}
          <View
            style={[
              styles.progressBarFill,
              { width: `${((wizardIndex + 1) / wizardSteps.length) * 100}%` },
            ]}
          />
          <Text style={styles.progressText}>
            Passo {wizardIndex + 1} de {wizardSteps.length}
          </Text>
        </View>
      ) : !(useSectionHub && hubPicking) &&
        effectiveFillMode === 'hybrid' &&
        hybridInnerMode === 'wizard' &&
        hybridVisibleFields.length > 0 ? (
        <View style={styles.progressBarWrapper}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${((hybridInnerWizardIndex + 1) / hybridVisibleFields.length) * 100}%`,
              },
            ]}
          />
          <Text style={styles.progressText}>
            Campo {hybridInnerWizardIndex + 1} de {hybridVisibleFields.length} · {basePageData.pageTitle || 'Etapa'}
          </Text>
        </View>
      ) : !(useSectionHub && hubPicking) &&
        effectiveFillMode === 'hybrid' &&
        displayPages.length > 1 ? (
        <View style={styles.progressBarWrapper}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${((currentPage + 1) / displayPages.length) * 100}%` },
            ]}
          />
          <Text style={styles.progressText}>
            Página {currentPage + 1} de {displayPages.length}
          </Text>
        </View>
      ) : !(useSectionHub && hubPicking) &&
        useSectionHub &&
        paginateSectionsForLayout &&
        displayPages.length > 1 ? (
        <View style={styles.progressBarWrapper}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${((currentPage + 1) / displayPages.length) * 100}%` },
            ]}
          />
          <Text style={styles.progressText}>
            Etapa {currentPage + 1} de {displayPages.length}
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.scroll,
          {
            /** Rodapé (badges + «Fim do relatório») sobrepõe o scroll — evitar cortar mapa / «Dados coletados». */
            paddingBottom: Math.max(32, insets.bottom + 120),
          },
        ]}
      >
        {isReadOnly && (
            <View style={{backgroundColor: '#EFF6FF', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                <Ionicons name="information-circle" size={24} color="#3B82F6" style={{marginRight: 8}}/>
                <Text style={{flex: 1, color: '#1E3A8A', fontWeight: '600', fontSize: 13}}>Esta OS já foi concluída e os campos estão bloqueados para alteração.</Text>
            </View>
        )}
        <View style={{ gap: 16 }}>
        {useSectionHub && hubPicking && hubStageMenuHasSteps ? (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.slate, letterSpacing: -0.3 }}>
                Etapas do formulário
              </Text>
              <Text style={{ fontSize: 14, color: C.textLight, lineHeight: 20 }}>
                {appHubSectionOrder === 'sequential'
                  ? 'Conclua cada etapa por ordem para desbloquear a seguinte.'
                  : 'Toque na etapa que quiser preencher, em qualquer ordem.'}
              </Text>
            </View>
            {pages.map((pg, idx) => {
              if (!hubPageShowsInStepMenu(pg)) return null;
              const timing = sectionTimingFlagsForPage(idx);
              /** Azul: nunca abriu · Amarelo: abriu (`__section_start_*`) e ainda não concluiu · Verde: botão concluir (`__section_end_*`). Só leitura: fallback por validação. */
              const stageCompleted = isReadOnly ? hubSectionSatisfied(idx) : timing.ended;
              const unlocked = hubSectionUnlocked(idx);
              const repeatStats = hubRepeatRowStats(idx);
              const isRepeatSection = repeatStats.enabled;
              const repeatCardKey = repeatStats.sectionId || String(pg.id || idx);
              const repeatVisibleFields = (pg.fields || []).filter((f: any) => isFieldVisible(f));
              const createdRows = repeatStats.rawRows
                .map((row: any, ri: number) => {
                  const started = repeatVisibleFields.some((f: any) => isFieldAnswerFilled(f, row?.[f.id]));
                  const doneRow = repeatStats.doneFlags?.[ri] === true;
                  return { rowIndex: ri, started, done: doneRow, row };
                });
              const repeatMenuExpanded = !!hubRepeatCardsExpanded[repeatCardKey];
              /** Amarelo (edição): entrou na etapa pelo menos uma vez e não clicou em concluir. */
              const stageInProgressActive =
                !stageCompleted &&
                unlocked &&
                (isReadOnly
                  ? hubSectionHasPartialProgress(idx) ||
                    hubSectionStarted(idx) ||
                    (isRepeatSection && repeatStats.rawRows.length > 0)
                  : timing.started && !timing.ended);
              const hubCardStatus: 'completed' | 'in_progress' | 'not_started' = stageCompleted
                ? 'completed'
                : !unlocked
                  ? 'not_started'
                  : stageInProgressActive
                    ? 'in_progress'
                    : 'not_started';
              /** Verde / âmbar / azul (pendentes) — alinhado às cores da lista de OS; não usar warning.fg em bolinhas pequenas. */
              const hubStatusFg =
                hubCardStatus === 'completed'
                  ? C.status.success.fg
                  : hubCardStatus === 'in_progress'
                    ? MEDIA_TAG_COLORS.DURING
                    : MEDIA_TAG_COLORS.BEFORE;
              const hubStatusBg =
                hubCardStatus === 'completed'
                  ? C.status.success.bg
                  : hubCardStatus === 'in_progress'
                    ? `${MEDIA_TAG_COLORS.DURING}18`
                    : `${MEDIA_TAG_COLORS.BEFORE}14`;
              const lockedHub = appHubSectionOrder === 'sequential' && !unlocked;
              const iconTint = hubStatusFg;
              const iconBoxBg = hubStatusBg;
              const statusDotColor = hubStatusFg;
              const hubCardShadow = Platform.select({
                ios: {
                  shadowColor: C.slate,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: themeDark ? 0.28 : 0.07,
                  shadowRadius: 10,
                },
                android: { elevation: 3 },
                default: {},
              });
              return (
                <View
                  key={String(pg.id || idx)}
                  style={{
                    gap: 10,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor:
                      hubCardStatus === 'completed'
                        ? C.status.success.border
                        : hubCardStatus === 'in_progress'
                          ? `${MEDIA_TAG_COLORS.DURING}55`
                          : `${MEDIA_TAG_COLORS.BEFORE}50`,
                    backgroundColor: C.cardWhite,
                    ...hubCardShadow,
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => openHubSection(idx)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                    }}
                  >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: iconBoxBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {lockedHub ? (
                      <Ionicons name="lock-closed-outline" size={24} color={iconTint} />
                    ) : pg.sectionIcon ? (
                      renderSchemaIcon(
                        {
                          icon: pg.sectionIcon,
                          iconLibrary: pg.sectionIconLibrary,
                          iconColor: iconTint,
                        },
                        22
                      )
                    ) : (
                      renderSchemaIcon(
                        {
                          icon: isRepeatSection ? 'layers-outline' : 'albums-outline',
                          iconLibrary: 'Ionicons',
                          iconColor: iconTint,
                        },
                        22
                      )
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.slate }} numberOfLines={2}>
                      {pg.pageTitle || `Etapa ${idx + 1}`}
                    </Text>
                    {stageCompleted || stageInProgressActive ? (
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          marginTop: 6,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: stageCompleted ? C.status.success.bg : hubStatusBg,
                        }}
                      >
                        {stageCompleted ? (
                          <Ionicons name="checkmark" size={13} color={C.status.success.fg} />
                        ) : (
                          <View
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 4,
                              backgroundColor: hubStatusFg,
                            }}
                          />
                        )}
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            letterSpacing: 0.6,
                            color: stageCompleted ? C.status.success.fg : hubStatusFg,
                          }}
                        >
                          {stageCompleted ? 'CONCLUÍDO' : 'EM ANDAMENTO'}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={{ fontSize: 12, color: C.textLight, marginTop: stageCompleted || stageInProgressActive ? 6 : 4 }}>
                      {isRepeatSection
                        ? `${repeatStats.rawRows.length} instância(s) criada(s)`
                        : `${(pg.fields || []).filter((x: any) => isFieldVisible(x)).length} campo(s) visível(eis)`}
                    </Text>
                    {isRepeatSection ? (
                      <Text style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>
                        {repeatStats.maxRows == null
                          ? `Mínimo ${repeatStats.minRows} · sem limite máximo`
                          : `Mínimo ${repeatStats.minRows} · máximo ${repeatStats.maxRows}`}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: statusDotColor,
                      }}
                    />
                    <Ionicons name="chevron-forward" size={20} color={C.textLight} />
                  </View>
                  </TouchableOpacity>
                  {isRepeatSection && !isReadOnly ? (
                    <View
                      style={{
                        marginTop: 2,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: C.border,
                        paddingTop: 10,
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity
                          onPress={() =>
                            setHubRepeatCardsExpanded((prev) => ({
                              ...prev,
                              [repeatCardKey]: !prev[repeatCardKey],
                            }))
                          }
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        >
                          <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: '800' }}>
                            {createdRows.length}
                          </Text>
                          <Ionicons
                            name={repeatMenuExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={C.textLight}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => addHubRepeatInstance(idx)}
                          disabled={
                            !unlocked ||
                            (repeatStats.maxRows != null && repeatStats.rawRows.length >= repeatStats.maxRows)
                          }
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: unlocked ? C.status.warning.border : C.border,
                            backgroundColor: unlocked ? C.status.warning.bg : C.surfaceLow,
                            opacity:
                              !unlocked ||
                              (repeatStats.maxRows != null && repeatStats.rawRows.length >= repeatStats.maxRows)
                                ? 0.55
                                : 1,
                          }}
                        >
                          <Ionicons name="add" size={20} color={unlocked ? C.accent : C.textLight} />
                        </TouchableOpacity>
                      </View>
                      {repeatMenuExpanded ? (
                        createdRows.length > 0 ? (
                          <View style={{ gap: 8 }}>
                            {createdRows.map((row) => {
                              const childBg = row.done
                                ? C.status.success.bg
                                : row.started
                                  ? `${MEDIA_TAG_COLORS.DURING}18`
                                  : `${MEDIA_TAG_COLORS.BEFORE}12`;
                              const childBorder = row.done
                                ? C.status.success.border
                                : row.started
                                  ? `${MEDIA_TAG_COLORS.DURING}55`
                                  : `${MEDIA_TAG_COLORS.BEFORE}40`;
                              const childDotColor = row.done
                                ? C.status.success.fg
                                : row.started
                                  ? MEDIA_TAG_COLORS.DURING
                                  : MEDIA_TAG_COLORS.BEFORE;
                              const childIconTint = childDotColor;
                              return (
                              <TouchableOpacity
                                key={`filled_${repeatCardKey}_${row.rowIndex}`}
                                onPress={() => openHubSection(idx, { repeatRowIndex: row.rowIndex })}
                                style={{
                                  marginLeft: 8,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 12,
                                  padding: 12,
                                  borderRadius: 12,
                                  borderWidth: StyleSheet.hairlineWidth,
                                  borderColor: childBorder,
                                  backgroundColor: childBg,
                                }}
                              >
                                <View
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    backgroundColor: C.surfaceLow,
                                    borderWidth: StyleSheet.hairlineWidth,
                                    borderColor: C.border,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {pg.sectionIcon ? (
                                    renderSchemaIcon(
                                      {
                                        icon: pg.sectionIcon,
                                        iconLibrary: pg.sectionIconLibrary,
                                        iconColor: childIconTint,
                                      },
                                      16
                                    )
                                  ) : (
                                    <Ionicons name="layers-outline" size={16} color={childIconTint} />
                                  )}
                                </View>
                                <Text
                                  style={{
                                    flex: 1,
                                    fontSize: 14,
                                    fontWeight: '800',
                                    color: C.slate,
                                  }}
                                >
                                  {pg.pageTitle || `Etapa ${idx + 1}`}
                                </Text>
                                <View
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 5,
                                    backgroundColor: childDotColor,
                                  }}
                                />
                                <Ionicons name="chevron-forward" size={18} color={C.textLight} />
                              </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={{ color: C.textLight, fontSize: 12, fontWeight: '700' }}>
                            Nenhuma instância criada ainda.
                          </Text>
                        )
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {preambleHubCompleteButtonFields.length > 0 ? (
              <View style={{ marginTop: 6, gap: 10 }}>
                {preambleHubCompleteButtonFields.map((field: any) =>
                  !isReadOnly ? (
                    <TouchableOpacity
                      key={String(field.id)}
                      style={[styles.submitBtn, { marginTop: 0 }]}
                      onPress={() => {
                        if (submitting) return;
                        void submitExecution();
                      }}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={String(field.label || '').trim() || 'Concluir'}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                          }}
                        >
                          <Text style={styles.submitText}>
                            {String(field.label || '').trim() || 'CONCLUIR'}
                          </Text>
                          {renderFormCompleteButtonGlyph(field, 22, true)}
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View
                      key={String(field.id)}
                      style={{
                        padding: 14,
                        alignItems: 'center',
                        backgroundColor: '#F8FAFC',
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 13 }}>
                        {String(field.label || '').trim() || 'Concluir'}
                      </Text>
                    </View>
                  )
                )}
              </View>
            ) : null}
          </View>
        ) : null}
        {!(useSectionHub && hubPicking && hubStageMenuHasSteps)
          ? (() => {
          const primaryFooterButtonLabel = () => {
            if (effectiveFillMode === 'wizard') {
              return wizardIndex < wizardSteps.length - 1 ? 'Próximo >' : 'CONCLUIR';
            }
            if (effectiveFillMode === 'hybrid' && hybridInnerMode === 'wizard') {
              if (hybridInnerWizardIndex < hybridVisibleFields.length - 1) return 'Próximo >';
              if (currentPage < displayPages.length - 1) return useSectionHub ? 'Concluir' : 'Avançar >';
              return 'CONCLUIR';
            }
            if (currentPage < displayPages.length - 1) return useSectionHub ? 'Concluir' : 'Avançar >';
            return 'CONCLUIR';
          };
          const runPrimaryFooterAction = () => {
            if (isReadOnly || submitting) return;
            if (effectiveFillMode === 'wizard') {
              if (wizardIndex < wizardSteps.length - 1) handleWizardNext();
              else void submitExecution();
              return;
            }
            if (effectiveFillMode === 'hybrid' && hybridInnerMode === 'wizard') {
              if (hybridInnerWizardIndex < hybridVisibleFields.length - 1) {
                handleHybridInnerNext();
              } else if (currentPage < displayPages.length - 1) {
                if (useSectionHub) handleCompleteSectionToHub();
                else handleNextPage();
              } else {
                void submitExecution();
              }
              return;
            }
            if (currentPage < displayPages.length - 1) {
              if (useSectionHub) handleCompleteSectionToHub();
              else handleNextPage();
            } else {
              void submitExecution();
            }
          };
          const renderFieldList = (fields: any[], scope: SectionRepeatScope | null) =>
            fields.map((fieldArg: any) => {
          const effFormT = effectiveSchemaFieldType(fieldArg);
          /** Não usar `effFormT ? … : fieldArg`: `''` é falsy e deixa `type` indefinido → só o rótulo renderiza. */
          const field = { ...fieldArg, type: effFormT || fieldArg?.type || '' };
          const fieldTextMask = String(field.textMask ?? field.text_mask ?? '').trim();
          /** Com máscara em campo número: iOS → number-pad (só dígitos; o valor continua a mostrar R$); Android → default. */
          const numberKeyboardWithMask = !fieldTextMask ? 'numeric' : Platform.OS === 'ios' ? 'number-pad' : 'default';
          const vv = (fid: string) => getScopedFieldValue(responses, scope, fid);
          const hi = (fid: string, v: any) => handleInput(fid, v, scope);
          if (!isFieldVisible(field)) return null;
          if (useSectionHub && preambleHubCompleteFieldIdSet.has(field.id)) return null;

          const renderFieldIcon = (f: any) => {
            return renderSchemaIcon(f, 24);
          };

          const showLeadingFieldIcon =
            !!field.icon && field.type !== 'form_complete_button';
          return (
            <View
              key={field.id}
              style={[
                styles.card,
                {
                  flexDirection: showLeadingFieldIcon ? 'row' : 'column',
                  alignItems: showLeadingFieldIcon ? 'flex-start' : 'stretch',
                },
              ]}
            >
              {showLeadingFieldIcon ? (
                 <View
                   style={[
                     { width: 44, height: 44, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 2 },
                     activityFieldIconStatusBox,
                   ]}
                 >
                     {renderFieldIcon(field)}
                 </View>
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                  {field.type === 'form_complete_button' ? null : (
                  <Text
                    style={[
                      styles.label,
                      {
                        marginBottom:
                          field.type !== 'leitura' &&
                          field.description?.trim() &&
                          isFieldInstructionsVisible(field) &&
                          !String(field.helpHtml || '').trim()
                            ? 6
                            : 12,
                        fontSize: 15,
                        color: '#0F172A',
                        fontWeight: '800',
                      },
                    ]}
                  >
                      {field.icon
                        ? ''
                        : field.type === 'leitura' || field._globalIdx == null
                          ? ''
                          : `${field._globalIdx}. `}
                      {field.label}
                      {fieldMustAnswerForProgress(field) ? (
                        <Text style={{ color: '#EF4444' }}> *</Text>
                      ) : null}
                  </Text>
                  )}
                  {field.type !== 'leitura' && isFieldInstructionsVisible(field) ? (
                    <FieldHelpInstructions
                      plainDescription={field.description}
                      helpHtml={field.helpHtml}
                      capturedPreviewUri={helpInstructionCapturePreviewUri(field, vv(field.id))}
                    />
                  ) : null}

                  {field.type === 'leitura' ? (
                    <LeituraBlock
                      contentHtml={effectiveLeituraContentHtml(
                        vv(field.id),
                        field.contentHtml ?? field.content_html
                      )}
                    />
                  ) : null}

                  {field.type === 'form_complete_button' && !isReadOnly ? (
                    <TouchableOpacity
                      style={[styles.submitBtn, { marginTop: 4 }]}
                      onPress={runPrimaryFooterAction}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={String(field.label || '').trim() || primaryFooterButtonLabel()}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <Text style={styles.submitText}>
                            {String(field.label || '').trim() || primaryFooterButtonLabel()}
                          </Text>
                          {renderFormCompleteButtonGlyph(field, 22, true)}
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : field.type === 'form_complete_button' && isReadOnly ? (
                    <View
                      style={{
                        padding: 14,
                        alignItems: 'center',
                        backgroundColor: '#F8FAFC',
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {renderFormCompleteButtonGlyph(field, 20, false)}
                        <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 13 }}>
                          {String(field.label || '').trim() || primaryFooterButtonLabel()}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  
                  {validatingFieldId === field.id && (
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', padding: 8, borderRadius: 6, marginBottom: 12}}>
                          <ActivityIndicator size="small" color="#0284c7" style={{marginRight: 8}} />
                          <Text style={{color: '#0284c7', fontSize: 12, fontWeight: '700'}}>Consultando sistema remoto...</Text>
                      </View>
                  )}
              
              {(field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'date') &&
                (fieldAllowsMultiple(field) ? (
                  <View style={{ gap: 10 }}>
                    {(() => {
                      const base = normalizeResponseArray(vv(field.id));
                      const rows = base.length > 0 ? base : [''];
                      const maxM = multiMaxItems(field);
                      const canAdd = maxM == null || rows.length < maxM;
                      return (
                        <>
                          {rows.map((rowVal: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder={field.type === 'date' ? 'DD/MM/YYYY' : 'Sua resposta...'}
                                keyboardType={
                                  field.type === 'email' ? 'email-address' : field.type === 'phone' ? 'phone-pad' : 'default'
                                }
                                value={String(rowVal ?? '')}
                                editable={!isReadOnly && validatingFieldId !== field.id}
                                focusable={!isReadOnly && validatingFieldId !== field.id}
                                showSoftInputOnFocus={!isReadOnly && validatingFieldId !== field.id}
                                pointerEvents={!isReadOnly && validatingFieldId !== field.id ? 'auto' : 'none'}
                                onChangeText={(val) => {
                                  const masked = applyChecklistTextMask(
                                    uiValueForChecklistMask(val, field.textMask ?? field.text_mask, effectiveSchemaFieldType(fieldArg)),
                                    field.textMask ?? field.text_mask,
                                    effectiveSchemaFieldType(fieldArg),
                                  );
                                  const next = [...rows];
                                  next[idx] = masked;
                                  hi(field.id, next);
                                }}
                                onEndEditing={() => handleApiValidation(field.id)}
                              />
                              {rows.length > 1 ? (
                                <TouchableOpacity
                                  onPress={() => {
                                    const next = rows.filter((_: any, j: number) => j !== idx);
                                    hi(field.id, next.length ? next : []);
                                  }}
                                >
                                  <Ionicons name="remove-circle" size={28} color="#dc2626" />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ))}
                          {canAdd ? (
                            <TouchableOpacity
                              onPress={() => hi(field.id, [...rows, ''])}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                            >
                              <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>Adicionar linha</Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <TextInput
                    style={styles.input}
                    placeholder={field.type === 'date' ? 'DD/MM/YYYY' : 'Sua resposta...'}
                    keyboardType={field.type === 'email' ? 'email-address' : field.type === 'phone' ? 'phone-pad' : 'default'}
                    value={vv(field.id) || ''}
                    editable={!isReadOnly && validatingFieldId !== field.id}
                    focusable={!isReadOnly && validatingFieldId !== field.id}
                    showSoftInputOnFocus={!isReadOnly && validatingFieldId !== field.id}
                    pointerEvents={!isReadOnly && validatingFieldId !== field.id ? 'auto' : 'none'}
                    onChangeText={(val) => hi(field.id, applyChecklistTextMask(
                                    uiValueForChecklistMask(val, field.textMask ?? field.text_mask, effectiveSchemaFieldType(fieldArg)),
                                    field.textMask ?? field.text_mask,
                                    effectiveSchemaFieldType(fieldArg),
                                  ))}
                    onEndEditing={() => handleApiValidation(field.id)}
                  />
                ))}
              {(field.type === 'number' || field.type === 'currency') &&
                (fieldAllowsMultiple(field) ? (
                  <View style={{ gap: 10 }}>
                    {(() => {
                      const base = normalizeResponseArray(vv(field.id));
                      const rows = base.length > 0 ? base : [''];
                      const maxM = multiMaxItems(field);
                      const canAdd = maxM == null || rows.length < maxM;
                      return (
                        <>
                          {rows.map((rowVal: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              {field.type === 'currency' ? (
                                <ValueInput
                                  style={[styles.input, { flex: 1 }]}
                                  placeholder="0,00"
                                  value={String(rowVal ?? '')}
                                  editable={!isReadOnly && validatingFieldId !== field.id}
                                  currency
                                  currencySymbol={checklistCurrencySymbol(field)}
                                  onChangeText={(v) => {
                                    const next = [...rows];
                                    next[idx] = v;
                                    hi(field.id, next);
                                  }}
                                  onEditingStateChange={(editing) => {
                                    if (!editing) void handleApiValidation(field.id);
                                  }}
                                />
                              ) : (
                              <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="0"
                                keyboardType={numberKeyboardWithMask}
                                autoCapitalize="none"
                                autoCorrect={false}
                                value={String(rowVal ?? '')}
                                editable={!isReadOnly && validatingFieldId !== field.id}
                                focusable={!isReadOnly && validatingFieldId !== field.id}
                                showSoftInputOnFocus={!isReadOnly && validatingFieldId !== field.id}
                                pointerEvents={!isReadOnly && validatingFieldId !== field.id ? 'auto' : 'none'}
                                onChangeText={(val) => {
                                  const masked = applyChecklistTextMask(
                                    uiValueForChecklistMask(val, field.textMask ?? field.text_mask, effectiveSchemaFieldType(fieldArg)),
                                    field.textMask ?? field.text_mask,
                                    effectiveSchemaFieldType(fieldArg),
                                  );
                                  const next = [...rows];
                                  next[idx] = masked;
                                  hi(field.id, next);
                                }}
                                onEndEditing={() => handleApiValidation(field.id)}
                              />
                              )}
                              {rows.length > 1 ? (
                                <TouchableOpacity
                                  onPress={() => {
                                    const next = rows.filter((_: any, j: number) => j !== idx);
                                    hi(field.id, next.length ? next : []);
                                  }}
                                >
                                  <Ionicons name="remove-circle" size={28} color="#dc2626" />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ))}
                          {canAdd ? (
                            <TouchableOpacity
                              onPress={() => hi(field.id, [...rows, ''])}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                            >
                              <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>Adicionar valor</Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : field.type === 'currency' ? (
                  <ValueInput
                    style={styles.input}
                    placeholder="0,00"
                    value={vv(field.id) || ''}
                    editable={!isReadOnly && validatingFieldId !== field.id}
                    currency
                    currencySymbol={checklistCurrencySymbol(field)}
                    onChangeText={(v) => hi(field.id, v)}
                    onEditingStateChange={(editing) => {
                      if (!editing) void handleApiValidation(field.id);
                    }}
                  />
                ) : (
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType={numberKeyboardWithMask}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={vv(field.id) || ''}
                    editable={!isReadOnly && validatingFieldId !== field.id}
                    focusable={!isReadOnly && validatingFieldId !== field.id}
                    showSoftInputOnFocus={!isReadOnly && validatingFieldId !== field.id}
                    pointerEvents={!isReadOnly && validatingFieldId !== field.id ? 'auto' : 'none'}
                    onChangeText={(val) => hi(field.id, applyChecklistTextMask(
                                    uiValueForChecklistMask(val, field.textMask ?? field.text_mask, effectiveSchemaFieldType(fieldArg)),
                                    field.textMask ?? field.text_mask,
                                    effectiveSchemaFieldType(fieldArg),
                                  ))}
                    onEndEditing={() => handleApiValidation(field.id)}
                  />
                ))}
              {field.type === 'dropdown' &&
                (fieldAllowsMultiple(field) ? (
                  <View style={{ gap: 10 }}>
                    {(() => {
                      const base = normalizeResponseArray(vv(field.id));
                      const rows = base.length > 0 ? base : [''];
                      const maxM = multiMaxItems(field);
                      const canAdd = maxM == null || rows.length < maxM;
                      return (
                        <>
                          {rows.map((rowVal: any, idx: number) => (
                            <View key={idx} style={{ gap: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', minWidth: 28 }}>
                                  {idx + 1}.
                                </Text>
                                <View style={{ flex: 1, gap: 8 }}>
                                  {(field.options || '').split(',').map((opt: string, i: number) => {
                                    const val = opt.trim();
                                    if (!val) return null;
                                    const active = String(rowVal ?? '') === val;
                                    return (
                                      <TouchableOpacity
                                        key={i}
                                        onPress={() => {
                                          const next = [...rows];
                                          next[idx] = val;
                                          hi(field.id, next);
                                        }}
                                        style={{
                                          padding: 12,
                                          borderRadius: 8,
                                          backgroundColor: active ? C.primary : '#f8fafc',
                                          borderWidth: 1,
                                          borderColor: active ? C.primary : '#cbd5e1',
                                        }}
                                      >
                                        <Text
                                          style={{
                                            color: active ? '#FFF' : '#475569',
                                            fontWeight: active ? '800' : '600',
                                          }}
                                        >
                                          {val}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                                {rows.length > 1 ? (
                                  <TouchableOpacity
                                    onPress={() => {
                                      const next = rows.filter((_: any, j: number) => j !== idx);
                                      hi(field.id, next.length ? next : []);
                                    }}
                                  >
                                    <Ionicons name="remove-circle" size={28} color="#dc2626" />
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            </View>
                          ))}
                          {canAdd ? (
                            <TouchableOpacity
                              onPress={() => hi(field.id, [...rows, ''])}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                            >
                              <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>
                                Adicionar linha
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {(field.options || '').split(',').map((opt: string, i: number) => {
                      const val = opt.trim();
                      if (!val) return null;
                      const active = vv(field.id) === val;
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => hi(field.id, val)}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            backgroundColor: active ? C.primary : '#f8fafc',
                            borderWidth: 1,
                            borderColor: active ? C.primary : '#cbd5e1',
                          }}
                        >
                          <Text style={{ color: active ? '#FFF' : '#475569', fontWeight: active ? '800' : '600' }}>
                            {val}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              {field.type === 'multiselect' &&
                (fieldAllowsMultiple(field) ? (
                  <View style={{ gap: 10 }}>
                    {(() => {
                      const base = normalizeResponseArray(vv(field.id));
                      const rows = base.length > 0 ? base : [''];
                      const maxM = multiMaxItems(field);
                      const canAdd = maxM == null || rows.length < maxM;
                      return (
                        <>
                          {rows.map((rowVal: any, idx: number) => {
                            const currentStr = String(rowVal ?? '');
                            const activeArray = currentStr
                              .split(',')
                              .map((s: string) => s.trim())
                              .filter((s: string) => s);
                            return (
                              <View key={idx} style={{ gap: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', marginTop: 10 }}>
                                    {idx + 1}.
                                  </Text>
                                  <View style={{ flex: 1, gap: 8 }}>
                                    {(field.options || '').split(',').map((opt: string, i: number) => {
                                      const val = opt.trim();
                                      if (!val) return null;
                                      const isActive = activeArray.includes(val);
                                      const toggle = () => {
                                        let newArr = [...activeArray];
                                        if (isActive) newArr = newArr.filter((x) => x !== val);
                                        else newArr.push(val);
                                        const next = [...rows];
                                        next[idx] = newArr.join(', ');
                                        hi(field.id, next);
                                      };
                                      return (
                                        <TouchableOpacity
                                          key={i}
                                          onPress={toggle}
                                          style={{
                                            padding: 14,
                                            borderRadius: 8,
                                            backgroundColor: isActive ? '#f0fdf4' : '#f8fafc',
                                            borderWidth: 1,
                                            borderColor: isActive ? C.primary : '#cbd5e1',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                          }}
                                        >
                                          <Ionicons
                                            name={isActive ? 'checkbox' : 'square-outline'}
                                            size={22}
                                            color={isActive ? C.primary : '#94a3b8'}
                                            style={{ marginRight: 10 }}
                                          />
                                          <Text
                                            style={{
                                              color: isActive ? C.primary : '#475569',
                                              fontWeight: isActive ? '800' : '600',
                                            }}
                                          >
                                            {val}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                  {rows.length > 1 ? (
                                    <TouchableOpacity
                                      onPress={() => {
                                        const next = rows.filter((_: any, j: number) => j !== idx);
                                        hi(field.id, next.length ? next : []);
                                      }}
                                      style={{ marginTop: 8 }}
                                    >
                                      <Ionicons name="remove-circle" size={28} color="#dc2626" />
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                          {canAdd ? (
                            <TouchableOpacity
                              onPress={() => hi(field.id, [...rows, ''])}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                            >
                              <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>
                                Adicionar linha
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {(field.options || '').split(',').map((opt: string, i: number) => {
                      const val = opt.trim();
                      if (!val) return null;
                      const currentStr = vv(field.id) || '';
                      const activeArray = currentStr
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter((s: string) => s);
                      const isActive = activeArray.includes(val);
                      const toggle = () => {
                        let newArr = [...activeArray];
                        if (isActive) newArr = newArr.filter((x) => x !== val);
                        else newArr.push(val);
                        hi(field.id, newArr.join(', '));
                      };
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={toggle}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            backgroundColor: isActive ? '#f0fdf4' : '#f8fafc',
                            borderWidth: 1,
                            borderColor: isActive ? C.primary : '#cbd5e1',
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Ionicons
                            name={isActive ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={isActive ? C.primary : '#94a3b8'}
                            style={{ marginRight: 10 }}
                          />
                          <Text
                            style={{ color: isActive ? C.primary : '#475569', fontWeight: isActive ? '800' : '600' }}
                          >
                            {val}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              {field.type === 'rating' &&
                (fieldAllowsMultiple(field) ? (
                  <View style={{ gap: 10 }}>
                    {(() => {
                      const base = normalizeResponseArray(vv(field.id));
                      const rows = base.length > 0 ? base : [0];
                      const maxM = multiMaxItems(field);
                      const canAdd = maxM == null || rows.length < maxM;
                      return (
                        <>
                          {rows.map((rowVal: any, idx: number) => {
                            const num = Number(rowVal);
                            const cur = Number.isFinite(num) ? num : 0;
                            return (
                              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', minWidth: 28 }}>
                                  {idx + 1}.
                                </Text>
                                <View style={{ flex: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', paddingVertical: 6 }}>
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <TouchableOpacity
                                      key={star}
                                      onPress={() => {
                                        const next = [...rows];
                                        next[idx] = star;
                                        hi(field.id, next);
                                      }}
                                    >
                                      <Ionicons
                                        name={cur >= star ? 'star' : 'star-outline'}
                                        size={36}
                                        color={cur >= star ? '#f59e0b' : '#cbd5e1'}
                                      />
                                    </TouchableOpacity>
                                  ))}
                                </View>
                                {rows.length > 1 ? (
                                  <TouchableOpacity
                                    onPress={() => {
                                      const next = rows.filter((_: any, j: number) => j !== idx);
                                      hi(field.id, next.length ? next : []);
                                    }}
                                  >
                                    <Ionicons name="remove-circle" size={28} color="#dc2626" />
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            );
                          })}
                          {canAdd ? (
                            <TouchableOpacity
                              onPress={() => hi(field.id, [...rows, 0])}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                            >
                              <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>
                                Adicionar avaliação
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', paddingVertical: 10 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity key={star} onPress={() => hi(field.id, star)}>
                        <Ionicons
                          name={vv(field.id) >= star ? 'star' : 'star-outline'}
                          size={42}
                          color={vv(field.id) >= star ? '#f59e0b' : '#cbd5e1'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              {field.type === 'lookup_select' && (
                <ChecklistLookupSelectField
                  field={field}
                  value={vv(field.id)}
                  onChange={(s) => hi(field.id, s)}
                  readOnly={isReadOnly}
                  strictOnline={schemaFieldRequiresOnlineValidation(field)}
                />
              )}
              {field.type === 'repeatable_matrix' && (
                <ChecklistRepeatableMatrixField
                  field={field}
                  value={vv(field.id)}
                  onChange={(s) => hi(field.id, s)}
                  readOnly={isReadOnly}
                />
              )}
              {field.type === 'opinion_scale' && (
                <ChecklistOpinionScaleField
                  field={field}
                  value={vv(field.id)}
                  onChange={(s) => hi(field.id, s)}
                  readOnly={isReadOnly}
                />
              )}
              {field.type === 'image_annotation' && (
                <ChecklistImageAnnotationField
                  value={vv(field.id)}
                  onChange={(s) => hi(field.id, s)}
                  readOnly={isReadOnly}
                  penColor={String(field.annotationPenColor || '#dc2626')}
                  strokeWidth={Math.min(
                    24,
                    Math.max(1, parseInt(String(field.annotationStrokeWidth ?? 4), 10) || 4),
                  )}
                />
              )}
              {field.type === 'calculated' && (() => {
                 let rawFormula = field.calcFormula || '';
                 Object.keys(responses).forEach(key => {
                     let valObj = responses[key];
                     let val = parseFloat(Array.isArray(valObj) ? valObj[0] : valObj);
                     if(isNaN(val)) val = 0;
                     rawFormula = rawFormula.split(key).join(val.toString());
                 });
                 let result = 0;
                 try { result = eval(rawFormula); } catch(e){}
                 
                 if(vv(field.id) !== result) {
                     setTimeout(() => hi(field.id, result), 0);
                 }
                 const dispMode = resolveCalcDisplayMode(field, field.calcFormula || '', schema);
                 const displayText = formatCalculatedResultDisplay(result, dispMode);
                 
                 return (
                   <View style={[styles.input, {backgroundColor:'#f5f3ff', borderColor:'#c4b5fd'}]}>
                      <Text style={{color:'#7c3aed', fontFamily:'monospace', fontWeight:'bold'}}>Resultado: {displayText}</Text>
                   </View>
                 );
              })()}
              {(field.type === 'checkbox' || field.type === 'yes_no') &&
                (fieldAllowsMultiple(field) ? (
                  <View style={{ gap: 10 }}>
                    {(() => {
                      const base = normalizeResponseArray(vv(field.id));
                      const rows = base.length > 0 ? base : [''];
                      const maxM = multiMaxItems(field);
                      const canAdd = maxM == null || rows.length < maxM;
                      return (
                        <>
                          {rows.map((rowVal: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', minWidth: 22 }}>
                                {idx + 1}.
                              </Text>
                              <View style={[styles.radioGroup, { flex: 1 }]}>
                                <TouchableOpacity
                                  style={[styles.radio, String(rowVal) === 'Sim' && styles.radioActive]}
                                  onPress={() => {
                                    const next = [...rows];
                                    next[idx] = 'Sim';
                                    hi(field.id, next);
                                  }}
                                >
                                  <Text style={[styles.radioText, String(rowVal) === 'Sim' && { color: '#FFF' }]}>
                                    Sim
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.radio, String(rowVal) === 'Não' && styles.radioActive]}
                                  onPress={() => {
                                    const next = [...rows];
                                    next[idx] = 'Não';
                                    hi(field.id, next);
                                  }}
                                >
                                  <Text style={[styles.radioText, String(rowVal) === 'Não' && { color: '#FFF' }]}>
                                    Não
                                  </Text>
                                </TouchableOpacity>
                              </View>
                              {rows.length > 1 ? (
                                <TouchableOpacity
                                  onPress={() => {
                                    const next = rows.filter((_: any, j: number) => j !== idx);
                                    hi(field.id, next.length ? next : []);
                                  }}
                                >
                                  <Ionicons name="remove-circle" size={28} color="#dc2626" />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ))}
                          {canAdd ? (
                            <TouchableOpacity
                              onPress={() => hi(field.id, [...rows, ''])}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                            >
                              <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>
                                Adicionar resposta
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={styles.radioGroup}>
                    <TouchableOpacity
                      style={[styles.radio, vv(field.id) === 'Sim' && styles.radioActive]}
                      onPress={() => hi(field.id, 'Sim')}
                    >
                      <Text style={[styles.radioText, vv(field.id) === 'Sim' && { color: '#FFF' }]}>Sim</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.radio, vv(field.id) === 'Não' && styles.radioActive]}
                      onPress={() => hi(field.id, 'Não')}
                    >
                      <Text style={[styles.radioText, vv(field.id) === 'Não' && { color: '#FFF' }]}>Não</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              {(field.type === 'vision_checklist' || field.type === 'vision_ai_analysis') && (
                <View style={{ marginTop: 6 }}>
                  {(() => {
                    const useGeminiAnalysis = field.type === 'vision_ai_analysis';
                    const showAiResponseInForm = visionAiShowsResponseInForm(field);
                    const stored = parseVisionChecklistStored(vv(field.id));
                    const busy = visionAnalyzeBusyId === visionAnalyzeBusyKey(field.id, scope ?? null);
                    const isVideo =
                      stored?.mediaMimeType != null && String(stored.mediaMimeType).startsWith('video');
                    const thumbUri =
                      stored?.localUri != null ? String(stored.localUri).split('?')[0] : '';
                    const gridLayout = getVisionAnalysisGridLayout(field);
                    const multiVisionGrid = gridLayout.count > 1;
                    const analysisDone =
                      stored?.status === 'completed' && Array.isArray(stored?.answers) && stored.answers.length > 0;
                    const pendingAnalysis = Boolean(
                      stored &&
                        isVisionPendingAnalysisRecord(stored) &&
                        visionStoredHasRunnableMedia(field, stored),
                    );
                    const slotUris = normalizeVisionGridSlotUris(stored?.gridSlotUris, gridLayout.count);
                    const sc = scope ?? null;
                    const composingThisField = Boolean(
                      visionGridCompose &&
                        visionGridCompose.field?.id === field.id &&
                        ((!visionGridCompose.scope && !sc) ||
                          (visionGridCompose.scope &&
                            sc &&
                            visionGridCompose.scope.sectionId === sc.sectionId &&
                            visionGridCompose.scope.rowIndex === sc.rowIndex)),
                    );
                    /** Detecção: cartão «Detectar»; análise: «Analisar». Só enquanto não há mídia; com foto/vídeo a pré-visualização abaixo substitui o bloco. */
                    const showVisionCaptureHero =
                      !thumbUri &&
                      !isReadOnly &&
                      !(multiVisionGrid && !analysisDone) &&
                      !pendingAnalysis;

                    return (
                      <>
                        {showVisionCaptureHero ? (
                          <TouchableOpacity
                            onPress={() => openVisionChecklistMedia(field, scope)}
                            disabled={busy}
                            activeOpacity={0.88}
                            style={{
                              borderRadius: 20,
                              overflow: 'hidden',
                              shadowColor: '#020617',
                              shadowOffset: { width: 0, height: 10 },
                              shadowOpacity: 0.22,
                              shadowRadius: 18,
                              elevation: 10,
                            }}
                          >
                            <LinearGradient
                              colors={
                                useGeminiAnalysis
                                  ? ['#1c0a0a', '#450a0a', '#7f1d1d']
                                  : ['#0b1220', '#0f172a', '#134e4a']
                              }
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={{
                                paddingVertical: 22,
                                paddingHorizontal: 18,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: useGeminiAnalysis
                                  ? 'rgba(248, 113, 113, 0.35)'
                                  : 'rgba(56, 189, 248, 0.28)',
                              }}
                            >
                              {busy ? (
                                <View style={{ paddingVertical: 18 }}>
                                  <ActivityIndicator
                                    color={useGeminiAnalysis ? '#fecaca' : '#7dd3fc'}
                                    size="large"
                                  />
                                  <Text style={{ marginTop: 12, fontSize: 13, fontWeight: '600', color: '#94a3b8' }}>
                                    Analisando…
                                  </Text>
                                </View>
                              ) : (
                                <>
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      alignSelf: 'center',
                                      gap: 6,
                                      paddingHorizontal: 12,
                                      paddingVertical: 5,
                                      borderRadius: 999,
                                      backgroundColor: useGeminiAnalysis
                                        ? 'rgba(248, 113, 113, 0.15)'
                                        : 'rgba(56, 189, 248, 0.12)',
                                      borderWidth: 1,
                                      borderColor: useGeminiAnalysis
                                        ? 'rgba(254, 202, 202, 0.45)'
                                        : 'rgba(125, 211, 252, 0.35)',
                                      marginBottom: 16,
                                    }}
                                  >
                                    <Ionicons
                                      name="sparkles"
                                      size={15}
                                      color={useGeminiAnalysis ? '#fca5a5' : '#7dd3fc'}
                                    />
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: '800',
                                        color: useGeminiAnalysis ? '#fecaca' : '#e0f2fe',
                                        letterSpacing: 0.6,
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      {useGeminiAnalysis ? (
                                        <Text>
                                          <Text style={{ color: '#fecaca' }}>Visão IA </Text>
                                          <Text style={{ color: '#ef4444', fontWeight: '900' }}>Análise</Text>
                                        </Text>
                                      ) : (
                                        <Text>
                                          <Text style={{ color: '#e0f2fe' }}>Visão de IA </Text>
                                          <Text style={{ color: '#38bdf8', fontWeight: '900' }}>Detecção</Text>
                                        </Text>
                                      )}
                                    </Text>
                                  </View>
                                  <View
                                    style={{
                                      width: 76,
                                      height: 76,
                                      borderRadius: 38,
                                      padding: 3,
                                      marginBottom: 14,
                                      backgroundColor: 'rgba(15, 23, 42, 0.65)',
                                      borderWidth: 1,
                                      borderColor: 'rgba(148, 163, 184, 0.25)',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <LinearGradient
                                      colors={
                                        useGeminiAnalysis ? ['#f87171', '#b91c1c'] : ['#22d3ee', '#6366f1']
                                      }
                                      start={{ x: 0, y: 0 }}
                                      end={{ x: 1, y: 1 }}
                                      style={{
                                        width: 70,
                                        height: 70,
                                        borderRadius: 35,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <Ionicons name={visionCaptureModeHeroIcon(field)} size={34} color="#fff" />
                                    </LinearGradient>
                                  </View>
                                  <Text
                                    style={{
                                      fontSize: 17,
                                      fontWeight: '800',
                                      color: '#f8fafc',
                                      letterSpacing: -0.3,
                                      textAlign: 'center',
                                    }}
                                  >
                                    {useGeminiAnalysis ? 'Analisar' : 'Detectar'}
                                  </Text>
                                  <Text
                                    style={{
                                      marginTop: 4,
                                      fontSize: 13,
                                      fontWeight: '700',
                                      color: useGeminiAnalysis ? '#fecaca' : '#7dd3fc',
                                      textAlign: 'center',
                                    }}
                                  >
                                    Abrir a câmera
                                  </Text>
                                  <Text
                                    style={{
                                      marginTop: 10,
                                      fontSize: 12,
                                      lineHeight: 17,
                                      color: '#94a3b8',
                                      textAlign: 'center',
                                      fontWeight: '500',
                                      paddingHorizontal: 4,
                                    }}
                                  >
                                    {visionCaptureModeSubtitle(field)}
                                  </Text>
                                </>
                              )}
                            </LinearGradient>
                          </TouchableOpacity>
                        ) : null}
                        {!isReadOnly && multiVisionGrid && !analysisDone ? (
                          <View style={{ marginTop: 10 }}>
                            {pendingAnalysis ? (
                              <View
                                style={{
                                  marginBottom: 12,
                                  padding: 12,
                                  backgroundColor: '#fff7ed',
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: '#fed7aa',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 13,
                                    color: '#9a3412',
                                    fontWeight: '700',
                                    lineHeight: 18,
                                  }}
                                >
                                  Análise pendente: a mídia está guardada e será enviada automaticamente quando houver
                                  rede. Também pode forçar o envio agora.
                                </Text>
                                <TouchableOpacity
                                  onPress={() => retryVisionPendingAnalysisField(field, scope)}
                                  disabled={busy}
                                  activeOpacity={0.88}
                                  style={{
                                    marginTop: 10,
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    backgroundColor: busy ? '#cbd5e1' : C.accent,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                                    Tentar análise agora
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                            <Text
                              style={{
                                fontSize: 12,
                                color: '#64748b',
                                marginBottom: 10,
                                lineHeight: 17,
                              }}
                            >
                              Grelha {gridLayout.cols}×{gridLayout.rows}: são necessárias{' '}
                              <Text style={{ fontWeight: '800', color: '#0f172a' }}>{gridLayout.count} fotos</Text> pela
                              câmera (sem galeria). Junte todas antes de tocar em «Analisar com IA».
                            </Text>
                            {Array.from({ length: gridLayout.rows }).map((_, rowIdx) => (
                              <View
                                key={`vr_${rowIdx}`}
                                style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}
                              >
                                {Array.from({ length: gridLayout.cols }).map((__, colIdx) => {
                                  const cellIdx = rowIdx * gridLayout.cols + colIdx;
                                  const cellUri = slotUris[cellIdx] || '';
                                  return (
                                    <TouchableOpacity
                                      key={`vc_${cellIdx}`}
                                      onPress={() => openVisionAnalysisGridSlot(field, scope, cellIdx)}
                                      disabled={busy || composingThisField}
                                      activeOpacity={0.88}
                                      style={{
                                        flex: 1,
                                        aspectRatio: 1,
                                        borderRadius: 12,
                                        overflow: 'hidden',
                                        borderWidth: 2,
                                        borderColor: cellUri ? '#fecaca' : '#e2e8f0',
                                        backgroundColor: cellUri ? '#fff' : '#f8fafc',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {cellUri ? (
                                        <Image
                                          source={{ uri: cellUri.split('?')[0] }}
                                          style={{ width: '100%', height: '100%' }}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <>
                                          <Ionicons name="camera-outline" size={28} color="#94a3b8" />
                                          <Text
                                            style={{
                                              marginTop: 4,
                                              fontSize: 11,
                                              fontWeight: '700',
                                              color: '#64748b',
                                            }}
                                          >
                                            Foto {cellIdx + 1}
                                          </Text>
                                        </>
                                      )}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            ))}
                            <TouchableOpacity
                              onPress={() => startVisionGridAnalyze(field, scope)}
                              disabled={busy || composingThisField || !slotUris.every(Boolean)}
                              activeOpacity={0.88}
                              style={{
                                marginTop: 6,
                                paddingVertical: 14,
                                paddingHorizontal: 16,
                                borderRadius: 14,
                                backgroundColor:
                                  !slotUris.every(Boolean) || composingThisField ? '#cbd5e1' : '#dc2626',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {composingThisField || busy ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <ActivityIndicator color="#fff" />
                                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                                    {composingThisField ? 'A preparar grelha…' : 'Analisando…'}
                                  </Text>
                                </View>
                              ) : (
                                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
                                  Analisar com IA
                                </Text>
                              )}
                            </TouchableOpacity>
                            {slotUris.some(Boolean) ? (
                              <TouchableOpacity
                                onPress={() => hi(field.id, null)}
                                style={{
                                  marginTop: 10,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  paddingVertical: 8,
                                }}
                              >
                                <Ionicons name="trash-outline" size={20} color="#dc2626" />
                                <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 13 }}>
                                  Limpar fotos da grelha
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                        {stored?.localUri ? (
                          <View
                            style={{
                              marginTop: 12,
                              borderRadius: 12,
                              overflow: 'hidden',
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                            }}
                          >
                            {!isVideo && thumbUri ? (
                              <Image
                                source={{ uri: thumbUri }}
                                style={{ width: '100%', height: 220 }}
                                resizeMode="contain"
                              />
                            ) : (
                              <View
                                style={{
                                  height: 120,
                                  backgroundColor: '#0f172a',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Ionicons name="film-outline" size={40} color="#bae6fd" />
                                <Text style={{ color: '#e2e8f0', marginTop: 8, fontSize: 12 }}>Vídeo anexado</Text>
                              </View>
                            )}
                            {stored.status === 'completed' && Array.isArray(stored.answers) ? (
                              <View style={{ padding: 12, backgroundColor: '#f8fafc' }}>
                                {(useGeminiAnalysis ||
                                  effectiveSchemaFieldType(field) === 'vision_checklist') &&
                                !showAiResponseInForm ? (
                                  <View>
                                    <Text style={{ fontSize: 13, color: '#334155', fontWeight: '800' }}>
                                      Análise concluída.
                                    </Text>
                                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                                      Os detalhes da resposta da IA estão ocultos neste modelo.
                                    </Text>
                                  </View>
                                ) : (
                                  <>
                                    {((useGeminiAnalysis ||
                                      effectiveSchemaFieldType(field) === 'vision_checklist') &&
                                      field.visionRating0To10Enabled === true) ? (
                                      <View
                                        style={{
                                          marginBottom: 12,
                                          paddingVertical: 10,
                                          paddingHorizontal: 12,
                                          borderRadius: 10,
                                          backgroundColor: '#fff7ed',
                                          borderWidth: 1,
                                          borderColor: '#fed7aa',
                                        }}
                                      >
                                        <Text style={{ fontSize: 11, color: '#9a3412', fontWeight: '800' }}>
                                          Classificação (0–10)
                                        </Text>
                                        {typeof (stored as any).rating0To10 === 'number' &&
                                        Number.isFinite((stored as any).rating0To10) ? (
                                          <Text
                                            style={{ fontSize: 20, color: '#7c2d12', fontWeight: '900', marginTop: 2 }}
                                          >
                                            {Math.max(0, Math.min(10, Math.round((stored as any).rating0To10)))}
                                            <Text style={{ fontSize: 14, color: '#b45309', fontWeight: '700' }}>/10</Text>
                                          </Text>
                                        ) : (
                                          <Text
                                            style={{ fontSize: 12, color: '#92400e', marginTop: 4, fontStyle: 'italic' }}
                                          >
                                            A IA não atribuiu nota nesta análise.
                                          </Text>
                                        )}
                                      </View>
                                    ) : null}
                                    {stored.answers.map((a: any, ai: number) => {
                                      const vl = formatVisionIaAnswerLabel(a?.value);
                                      const pct =
                                        typeof a?.confidence === 'number' && Number.isFinite(a.confidence)
                                          ? Math.round(a.confidence * 100)
                                          : null;
                                      const answerHeading =
                                        Array.isArray(stored.answers) && stored.answers.length === 1
                                          ? 'Resultado da análise'
                                          : String(a?.question || a?.questionId || `Critério ${ai + 1}`);
                                      return (
                                        <View key={ai} style={{ marginBottom: 10 }}>
                                          <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700' }}>
                                            {answerHeading}
                                          </Text>
                                          <Text
                                            style={{ fontSize: 14, color: '#0f172a', fontWeight: '700', marginTop: 2 }}
                                          >
                                            {vl}
                                            {pct != null ? ` · confiança ${pct}%` : ''}
                                          </Text>
                                          {a?.rationale ? (
                                            <Text
                                              style={{
                                                fontSize: 11,
                                                color: '#475569',
                                                marginTop: 4,
                                                fontStyle: 'italic',
                                              }}
                                            >
                                              {String(a.rationale).slice(0, 400)}
                                            </Text>
                                          ) : (
                                            <Text
                                              style={{
                                                fontSize: 11,
                                                color: '#94a3b8',
                                                marginTop: 4,
                                                fontStyle: 'italic',
                                              }}
                                            >
                                              Sem texto explicativo da IA. Volte a analisar ou confira no modelo se «Mostrar
                                              detalhes da resposta da IA» está ativo.
                                            </Text>
                                          )}
                                        </View>
                                      );
                                    })}
                                  </>
                                )}
                              </View>
                            ) : stored ? (
                              <View style={{ padding: 10, backgroundColor: '#fffbeb' }}>
                                <Text style={{ fontSize: 12, color: '#92400e' }}>
                                  {pendingAnalysis
                                    ? 'Análise pendente: a mídia está no dispositivo e será enviada com rede (ou use o botão abaixo).'
                                    : 'Análise ainda não concluída ou incompleta.'}
                                </Text>
                                {pendingAnalysis && !isReadOnly && !multiVisionGrid ? (
                                  <TouchableOpacity
                                    onPress={() => retryVisionPendingAnalysisField(field, scope)}
                                    disabled={busy}
                                    activeOpacity={0.88}
                                    style={{
                                      marginTop: 10,
                                      paddingVertical: 12,
                                      paddingHorizontal: 14,
                                      borderRadius: 12,
                                      backgroundColor: busy ? '#cbd5e1' : C.accent,
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                                      Tentar análise agora
                                    </Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            ) : null}
                            {!isReadOnly ? (
                              <TouchableOpacity
                                onPress={() => hi(field.id, null)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: 10,
                                  gap: 6,
                                }}
                              >
                                <Ionicons name="trash-outline" size={20} color="#dc2626" />
                                <Text style={{ color: '#dc2626', fontWeight: '700' }}>Remover</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    );
                  })()}
                </View>
              )}
              {field.type === 'voice_note' && (
                <View style={{ marginTop: 6 }}>
                  <ChecklistVoiceNoteField
                    value={vv(field.id)}
                    readOnly={isReadOnly}
                    transcribeLanguage={String(field.voiceTranscribeLanguage || 'pt-br').slice(0, 12)}
                    onChange={(next) => hi(field.id, next)}
                  />
                </View>
              )}
              {(field.type === 'photo' || field.type === 'photo_stamped' || field.type === 'facial_recognition' || field.type === 'file_upload') && (
                <View>
                  {field.type === 'facial_recognition' ? (
                    (() => {
                      const urisNow = fieldAllowsMultiple(field)
                        ? normalizeResponseArray(vv(field.id))
                        : vv(field.id)
                          ? [vv(field.id)]
                          : [];
                      const hasPhoto = urisNow.length > 0;
                      if (hasPhoto && !fieldAllowsMultiple(field)) {
                        return null;
                      }
                      if (hasPhoto && fieldAllowsMultiple(field)) {
                        return (
                          <TouchableOpacity
                            onPress={() =>
                              ensureOnlineValidation(field, () => handleMediaPicker(field.id, field.type, scope))
                            }
                            activeOpacity={0.85}
                            style={[styles.cameraBox, { borderColor: '#fda4af', backgroundColor: '#fff1f2' }]}
                          >
                            <Ionicons name="scan" size={28} color="#e11d48" />
                            <Text style={[styles.cameraText, { color: '#9f1239' }]}>
                              Adicionar outra validação facial
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <TouchableOpacity
                          onPress={() =>
                            ensureOnlineValidation(field, () => handleMediaPicker(field.id, field.type, scope))
                          }
                          activeOpacity={0.8}
                          style={{
                            borderRadius: 16,
                            overflow: 'hidden',
                            marginVertical: 4,
                            shadowColor: '#e11d48',
                            shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.25,
                            shadowRadius: 10,
                            elevation: 6,
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: '#fda4af',
                          }}
                        >
                          <LinearGradient
                            colors={['#fff1f2', '#ffe4e6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <View
                              style={{
                                width: 68,
                                height: 68,
                                borderRadius: 34,
                                backgroundColor: '#f43f5e',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 16,
                                shadowColor: '#9f1239',
                                shadowOpacity: 0.3,
                                shadowRadius: 8,
                                shadowOffset: { width: 0, height: 4 },
                              }}
                            >
                              <Ionicons name="scan" size={40} color="#fff" />
                              <View style={{ position: 'absolute' }}>
                                <Ionicons name="person" size={20} color="#fff" style={{ marginTop: 2 }} />
                              </View>
                            </View>
                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight: '900',
                                color: '#881337',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                              }}
                            >
                              Validar Biometria
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                color: '#be123c',
                                fontWeight: '500',
                                marginTop: 4,
                                textAlign: 'center',
                              }}
                            >
                              Toque para escanear a face do operador e autenticar esta operação.
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      );
                    })()
                  ) : (
                     <TouchableOpacity 
                        style={[styles.cameraBox]} 
                        onPress={() => ensureOnlineValidation(field, () => handleMediaPicker(field.id, field.type, scope))}
                     >
                       <Ionicons name={field.type === 'file_upload' ? "document-attach" : "camera"} size={32} color={field.type === 'photo_stamped' ? "#d97706" : "#64748b"} />
                       <Text style={[styles.cameraText, field.type === 'photo_stamped' && {color: "#d97706"}]}>
                         {field.type === 'photo_stamped'
                           ? fieldAllowsMultiple(field) && normalizeResponseArray(vv(field.id)).length > 0
                             ? 'Adicionar outra foto (GPS)'
                             : 'FOTOGRAFAR (GPS OBRIGATÓRIO)'
                           : field.type === 'file_upload'
                             ? fieldAllowsMultiple(field) && normalizeResponseArray(vv(field.id)).length > 0
                               ? 'Anexar outro arquivo'
                               : 'Anexar Arquivo'
                             : fieldAllowsMultiple(field) && normalizeResponseArray(vv(field.id)).length > 0
                               ? 'Adicionar outra foto...'
                               : 'Adicionar Foto...'}
                       </Text>
                     </TouchableOpacity>
                  )}
                   {(() => {
                    const mediaUris = fieldAllowsMultiple(field)
                      ? normalizeResponseArray(vv(field.id))
                      : vv(field.id)
                        ? [vv(field.id)]
                        : [];
                    if (mediaUris.length === 0) return null;
                    const frAudit =
                      field.type === 'facial_recognition'
                        ? parseFacialBiometricAudit(vv(facialBiometricStorageKey(field.id)))
                        : null;
                    const frConfStr =
                      field.type === 'facial_recognition'
                        ? formatFacialConfidencePct(frAudit?.confidence)
                        : null;
                    const frDeferFailed =
                      field.type === 'facial_recognition' &&
                      !!frAudit &&
                      (frAudit as { deferredValidationFailed?: boolean }).deferredValidationFailed === true;
                    const frSuccess =
                      field.type === 'facial_recognition' &&
                      !!frAudit &&
                      !frDeferFailed &&
                      !!(frAudit.at || frAudit.engine || frConfStr);
                    const frReqOnlineField =
                      field.type === 'facial_recognition' && schemaFieldRequiresOnlineValidation(field);
                    const frExplicitPending =
                      !!(frAudit as { pending?: boolean } | null)?.pending;
                    /** Sem match no servidor ainda: explícito (JSON) ou modo “validar depois” (não exige online na captura). */
                    const frPending =
                      field.type === 'facial_recognition' &&
                      !frSuccess &&
                      !frDeferFailed &&
                      (!frReqOnlineField || frExplicitPending);
                    const frId =
                      field.type === 'facial_recognition'
                        ? getFacialStampIdentity(frAudit, user)
                        : { fullName: '', loginEmail: '' };
                    return (
                    <View style={{ marginTop: 10, gap: 10 }}>
                      {field.type === 'facial_recognition' &&
                        (() => {
                          const audit = parseFacialBiometricAudit(
                            vv(facialBiometricStorageKey(field.id))
                          );
                          const reqOnline = schemaFieldRequiresOnlineValidation(field);
                          const confStr = formatFacialConfidencePct(audit?.confidence);
                          if (audit && (audit as { deferredValidationFailed?: boolean }).deferredValidationFailed) {
                            return (
                              <View
                                style={{
                                  padding: 12,
                                  borderRadius: 12,
                                  backgroundColor: '#fef2f2',
                                  borderWidth: 1,
                                  borderColor: '#fecaca',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                  <Ionicons name="close-circle-outline" size={22} color="#b91c1c" />
                                  <Text style={{ flex: 1, fontSize: 12, color: '#991b1b', lineHeight: 17 }}>
                                    {sanitizeFacialUserFacingCopy((audit as { message?: string }).message) ||
                              'Após ligação à rede, o servidor não reconheceu este rosto. Peça ao administrador para atualizar as fotos de referência no painel (Usuários → Reconhecimento facial) ou capture de novo.'}
                                  </Text>
                                </View>
                              </View>
                            );
                          }
                          /* Sucesso biométrico: sem badge extra — nome, login e estado vêm na moldura/rodapé da foto. */
                          if (audit && (audit.at || audit.engine || confStr)) {
                            return null;
                          }
                          if (reqOnline) {
                            return (
                              <View
                                style={{
                                  padding: 12,
                                  borderRadius: 12,
                                  backgroundColor: '#fffbeb',
                                  borderWidth: 1,
                                  borderColor: '#fcd34d',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                  <Ionicons name="alert-circle-outline" size={22} color="#b45309" />
                                  <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 }}>
                                    Foto registrada, mas sem registro de verificação no servidor. Confirme a rede e
                                    peça ao administrador para sincronizar o reconhecimento facial no painel (Usuários
                                    → Reconhecimento facial → Sincronizar). Depois capture de novo.
                                  </Text>
                                </View>
                              </View>
                            );
                          }
                          return (
                            <View
                              style={{
                                padding: 12,
                                borderRadius: 12,
                                backgroundColor: '#fffbeb',
                                borderWidth: 1,
                                borderColor: '#fcd34d',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                <Ionicons name="time-outline" size={22} color="#b45309" />
                                <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 }}>
                                  Validação pendente.{'\n'}
                                  Pode concluir a atividade, pois a validação será realizada com o retorno da conexão.
                                </Text>
                              </View>
                            </View>
                          );
                        })()}
                      {mediaUris.map((oneUri: any, midx: number) => (
                    <View key={midx} style={{padding:10, backgroundColor:'#f8fafc', borderRadius:8, borderWidth: 1, borderColor: '#e2e8f0'}}>
                       {(field.type === 'photo' || field.type === 'photo_stamped' || field.type === 'facial_recognition') &&
                          (field.type === 'facial_recognition' ? (
                            <FacialRecognitionPhotoFrame
                              oneUri={String(oneUri)}
                              imageHeight={300}
                              success={!!frSuccess}
                              pending={!!frPending}
                              fullName={frId.fullName}
                              loginEmail={frId.loginEmail}
                              auditAt={frAudit?.at}
                              capturedAtStored={frAudit?.capturedAt}
                              captureLat={frAudit?.captureLat != null ? String(frAudit.captureLat) : undefined}
                              captureLng={frAudit?.captureLng != null ? String(frAudit.captureLng) : undefined}
                              captureAddr={frAudit?.captureAddr != null ? String(frAudit.captureAddr) : undefined}
                            />
                          ) : (
                            <View
                              style={{
                                width: '100%',
                                height: field.type === 'photo_stamped' ? 280 : 240,
                                borderRadius: 6,
                                overflow: 'hidden',
                                marginBottom: 10,
                                backgroundColor: '#e2e8f0',
                              }}
                            >
                              <Image
                                source={{ uri: String(oneUri).split('?')[0] }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                              />
                            </View>
                          ))}
                       <View style={{flexDirection:'row', alignItems:'center'}}>
                           <Ionicons
                             name={
                               field.type === 'facial_recognition'
                                 ? 'image-outline'
                                 : 'checkmark-circle'
                             }
                             size={24}
                             color={field.type === 'facial_recognition' ? '#64748b' : '#15803d'}
                             style={{marginRight:8}}
                           />
                           <Text
                             style={{
                               color: field.type === 'facial_recognition' ? '#475569' : '#15803d',
                               flex:1,
                               fontSize:12,
                             }}
                             numberOfLines={1}
                           >
                             {String(oneUri).split('/').pop()}
                           </Text>
                           <TouchableOpacity onPress={() => {
                             const ck = mediaCaptionStorageKey(field.id);
                             const rowForCap =
                               scope && responses[sectionRepeatStorageKey(scope.sectionId)]?.[scope.rowIndex];
                             const capRaw =
                               scope && rowForCap && typeof rowForCap === 'object'
                                 ? rowForCap[ck]
                                 : responses[ck];
                             if (field.type === 'facial_recognition') {
                               hi(facialBiometricStorageKey(field.id), null);
                             }
                             if (fieldAllowsMultiple(field)) {
                               const uris = normalizeResponseArray(vv(field.id));
                               const next = uris.filter((_: any, j: number) => j !== midx);
                               hi(field.id, next.length ? next : []);
                               if (field.allowMediaDescription) {
                                 const caps = normalizeMediaCaptions(field, capRaw, uris.length);
                                 caps.splice(midx, 1);
                                 hi(ck, shapeMediaCaptionStored(field, caps));
                               }
                             } else {
                               hi(field.id, null);
                               if (field.allowMediaDescription) {
                                 hi(ck, '');
                               }
                             }
                           }}>
                               <Ionicons name="trash" size={24} color="#dc2626" />
                           </TouchableOpacity>
                       </View>
                       {field.allowMediaDescription ? (
                         <View style={{ marginTop: 10 }}>
                           <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                             Comentários{' '}
                             <Text style={{ fontWeight: '500', color: '#94a3b8' }}>(opcional)</Text>
                           </Text>
                           {isReadOnly ? (
                             getMediaCaptionAtScoped(field, responses, scope, midx).trim() ? (
                               <Text style={{ fontSize: 13, color: '#334155', fontStyle: 'italic', lineHeight: 20 }}>
                                 {getMediaCaptionAtScoped(field, responses, scope, midx)}
                               </Text>
                             ) : (
                               <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sem comentário por item.</Text>
                             )
                           ) : (
                             <TextInput
                               style={[styles.input, { minHeight: 44, paddingVertical: 8, textAlignVertical: 'top' }]}
                               placeholder="Opcional, notas sobre este item…"
                               value={getMediaCaptionAtScoped(field, responses, scope, midx)}
                               onChangeText={(t) => {
                                 const ck = mediaCaptionStorageKey(field.id);
                                 const rowForCap =
                                   scope && responses[sectionRepeatStorageKey(scope.sectionId)]?.[scope.rowIndex];
                                 const capRaw =
                                   scope && rowForCap && typeof rowForCap === 'object'
                                     ? rowForCap[ck]
                                     : responses[ck];
                                 const caps = normalizeMediaCaptions(field, capRaw, mediaUris.length);
                                 caps[midx] = t;
                                 hi(ck, shapeMediaCaptionStored(field, caps));
                               }}
                               maxLength={500}
                               multiline
                             />
                           )}
                         </View>
                       ) : null}
                    </View>
                      ))}
                    </View>
                    );
                   })()}
                </View>
              )}
              {field.type === 'barcode_scan' &&
                (isReadOnly ? (
                  <View
                    style={[
                      styles.cameraBox,
                      { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
                    ]}
                  >
                    <Ionicons name="barcode-outline" size={28} color="#64748b" />
                    <Text
                      style={[styles.cameraText, { color: '#334155', fontSize: 14 }]}
                      selectable
                    >
                      {String(vv(field.id) ?? '').trim() || '—'}
                    </Text>
                  </View>
                ) : (
                  <View>
                    {!!String(vv(field.id) ?? '').trim() && (
                      <View
                        style={{
                          marginBottom: 10,
                          padding: 12,
                          borderRadius: 10,
                          backgroundColor: '#ecfdf5',
                          borderWidth: 1,
                          borderColor: '#a7f3d0',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#047857', marginBottom: 4 }}>
                          Código lido
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#065f46' }} selectable>
                          {String(vv(field.id)).trim()}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.cameraBox,
                        { borderColor: '#0284c7', backgroundColor: '#f0f9ff' },
                      ]}
                      onPress={() =>
                        ensureOnlineValidation(field, async () => {
                          if (!cameraPermission?.granted) {
                            const res = await requestCameraPermission();
                            if (!res.granted) {
                              Alert.alert(t('common.accessDenied'), t('common.allowCamera'));
                              return;
                            }
                          }
                          checklistBarcodeTargetRef.current = { fieldId: field.id, scope };
                          setChecklistBarcodeModalOpen(true);
                        })
                      }
                    >
                      <Ionicons name="barcode" size={32} color="#0284c7" />
                      <Text style={[styles.cameraText, { color: '#0284c7' }]}>
                        LER CÓDIGO DO EQUIPAMENTO
                      </Text>
                    </TouchableOpacity>
                    {!!String(vv(field.id) ?? '').trim() && (
                      <TouchableOpacity
                        onPress={() => hi(field.id, '')}
                        style={{ marginTop: 10, alignSelf: 'flex-start' }}
                      >
                        <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '700' }}>
                          Limpar código
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              {(field.type === 'transit_start' || field.type === 'transit_end') && (() => {
                 let isBlocked = false;
                 let startForEnd: ReturnType<typeof findPreviousTransitStartForEnd> = null;
                 if (field.type === 'transit_end') {
                     startForEnd = findPreviousTransitStartForEnd(template?.schemaData || [], field.id);
                     const startVal = startForEnd
                       ? getScopedFieldValue(responses, scope, startForEnd.id)
                       : undefined;
                     if (
                       startForEnd &&
                       (!startVal || (typeof startVal === 'string' && startVal.trim() === ''))
                     ) {
                         isBlocked = true;
                     }
                 }

                 const hasValue = !!vv(field.id);
                 /** Não iniciar outro trecho enquanto houver deslocamento aberto (início feito, fim por finalizar). */
                 const startBlockedAnotherLeg =
                   field.type === 'transit_start' &&
                   !hasValue &&
                   activeTransitLeg != null;
                 const startBlockedAfterDisplacementFinished =
                   field.type === 'transit_start' &&
                   !hasValue &&
                   shouldBlockTransitStartAfterOperationalDisplacementFinished(
                     template?.schemaData,
                     field,
                     responses as Record<string, unknown>,
                     scope ?? null
                   );
                 if (startBlockedAnotherLeg) {
                   isBlocked = true;
                 }
                 if (startBlockedAfterDisplacementFinished) {
                   isBlocked = true;
                 }
                 let transitLegFinalizedLock = false;
                 if (field.type === 'transit_start') {
                   const endF = findTransitEndFieldAfterStart(template?.schemaData, field.id);
                   if (endF?.id) {
                     const endRaw = getScopedFieldValue(responses, scope, endF.id);
                     transitLegFinalizedLock = isTransitEvidenceNonempty(endRaw);
                   }
                 } else if (field.type === 'transit_end') {
                   transitLegFinalizedLock = isTransitEvidenceNonempty(vv(field.id));
                 }
                 if (transitLegFinalizedLock) {
                   isBlocked = true;
                 }
                 const transitEvidence = hasValue ? parseTransitFieldEvidence(vv(field.id)) : null;
                 const transitEvidenceLines = transitEvidence ? formatTransitEvidenceLines(transitEvidence) : [];
                 const metricsLabels =
                   field.type === 'transit_end' && transitEvidence?.actualMetrics
                     ? transitActualMetricsLabels(transitEvidence.actualMetrics)
                     : { durationLabel: null as string | null, distanceLabel: null as string | null };
                 const completedTransitMapPath: number[][] | null =
                   field.type === 'transit_end' && hasValue
                     ? (() => {
                         const rawObj = coerceTransitEvidenceObject(vv(field.id));
                         const endLat =
                           transitEvidence?.lat ??
                           (rawObj
                             ? Number(
                                 (rawObj.coordinates as Record<string, unknown> | undefined)?.lat ??
                                   (rawObj.coordinates as Record<string, unknown> | undefined)?.latitude ??
                                   rawObj.lat ??
                                   rawObj.latitude
                               )
                             : NaN);
                         const endLng =
                           transitEvidence?.lng ??
                           (rawObj
                             ? Number(
                                 (rawObj.coordinates as Record<string, unknown> | undefined)?.lng ??
                                   (rawObj.coordinates as Record<string, unknown> | undefined)?.longitude ??
                                   (rawObj.coordinates as Record<string, unknown> | undefined)?.lon ??
                                   rawObj.lng ??
                                   rawObj.longitude
                               )
                             : NaN);
                         const tp =
                           transitEvidence?.traversedPath ??
                           (rawObj
                             ? normalizeStoredTraversedPathForTransit(rawObj.traversedPath) ??
                               normalizeStoredTraversedPathForTransit(rawObj.gpsTrack) ??
                               normalizeStoredTraversedPathForTransit(rawObj.track)
                             : null);
                         if (tp && tp.length >= 2) {
                           const fin = finalizeTransitPreviewPolyline(tp);
                           if (fin) return fin;
                         }
                         if (
                           tp &&
                           tp.length === 1 &&
                           Number.isFinite(endLat) &&
                           Number.isFinite(endLng)
                         ) {
                           const fin = finalizeTransitPreviewPolyline([
                             [tp[0][0], tp[0][1]],
                             [endLat, endLng],
                           ]);
                           if (fin) return fin;
                         }
                         if (startForEnd) {
                           let startRaw = getScopedFieldValue(responses, scope, startForEnd.id);
                           if (startRaw == null || (typeof startRaw === 'string' && startRaw.trim() === '')) {
                             startRaw = findFieldValueInResponses(
                               responses,
                               startForEnd.id,
                               template?.schemaData || []
                             );
                           }
                           const startEv = parseTransitFieldEvidence(startRaw);
                           if (
                             startEv?.lat != null &&
                             startEv?.lng != null &&
                             Number.isFinite(endLat) &&
                             Number.isFinite(endLng)
                           ) {
                             const fin = finalizeTransitPreviewPolyline([
                               [startEv.lat, startEv.lng],
                               [endLat, endLng],
                             ]);
                             if (fin) return fin;
                           }
                         }
                         return null;
                       })()
                     : null;
                 const buttonColor = hasValue ? '#10b981' : (isBlocked ? '#cbd5e1' : (field.type === 'transit_start' ? C.primary : C.accent));
                 const labelWhenClicked = field.type === 'transit_start' ? 'DESLOCAMENTO INICIADO' : 'DESLOCAMENTO FINALIZADO';
                 const labelWhenEmpty = field.type === 'transit_start' ? 'INICIAR DESLOCAMENTO' : 'FINALIZAR DESLOCAMENTO';
                 
                 const gpsBusyHere = gpsBusyFieldId === field.id;
                 const gpsBusyAny = gpsBusyFieldId != null;
                 return (
                    <View>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: buttonColor,
                          flexDirection: 'row',
                          gap: 8,
                          opacity: gpsBusyAny && !gpsBusyHere ? 0.55 : 1,
                        },
                      ]}
                      disabled={isReadOnly || isBlocked || hasValue || gpsBusyAny}
                      onPress={async () => {
                       if (isBlocked) {
                           Alert.alert(
                             'Atenção',
                             startBlockedAfterDisplacementFinished
                               ? 'Este deslocamento já foi concluído. O registo é definitivo e não pode ser reiniciado.'
                               : startBlockedAnotherLeg
                                 ? 'Finalise o deslocamento em curso («Finalizar deslocamento») antes de iniciar outro trecho.'
                                 : "O Técnico deve primeiro 'Iniciar Deslocamento' antes de finalizá-lo."
                           );
                           return;
                       }
                       if (hasValue) {
                           Alert.alert("Aviso", "Esta ação já foi registrada.");
                           return;
                       }
                       const sch = template?.schemaData || [];
                       const reimbField = isReimbursementTransitField(sch, field.id);
                       const patrolField = isPatrolTransitField(sch, field.id);
                       if (field.type === 'transit_start' && !reimbField) {
                         const ct = currentTaskRef.current;
                         const zt = String(ct?.locationZoneType || '').toLowerCase();
                         if (zt === 'segment') {
                           let poly: any = ct?.locationPolygon;
                           if (typeof poly === 'string') {
                             try {
                               poly = JSON.parse(poly);
                             } catch {
                               poly = null;
                             }
                           }
                           const meta =
                             ct?.metadata && typeof ct.metadata === 'object' && !Array.isArray(ct.metadata)
                               ? ct.metadata
                               : {};
                           if (
                             Array.isArray(poly) &&
                             poly.length >= 2 &&
                             !meta.transitSegmentDestination
                           ) {
                             const parseSegPt = (p: any): { lat: number; lng: number } | null => {
                               if (Array.isArray(p) && p.length >= 2) {
                                 const a = parseFloat(String(p[0]));
                                 const b = parseFloat(String(p[1]));
                                 const [la, ln] = normalizePolygonPairToLatLng(a, b);
                                 if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
                               }
                               if (p && typeof p === 'object') {
                                 const la = parseFloat(String((p as any).lat));
                                 const ln = parseFloat(String((p as any).lng ?? (p as any).lon));
                                 if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
                               }
                               return null;
                             };
                             const pointA = parseSegPt(poly[0]);
                             const pointB = parseSegPt(poly[1]);
                             if (pointA && pointB) {
                               setSegmentDestModal({
                                 fieldId: field.id,
                                 scope: scope ?? null,
                                 pointA,
                                 pointB,
                               });
                               return;
                             }
                           }
                         }
                       }
                       await handleTransit(
                         field.id,
                         field.type === 'transit_start' ? 'SAIDA' : 'CHEGADA',
                         field.type === 'transit_end' ? routeTracker.getTraversedPath() : undefined,
                         scope
                       );
                       const email = await AsyncStorage.getItem('@brspark_email');
                       if (field.type === 'transit_start') {
                         lastTransitScopeRef.current = scope ?? null;
                         dataCollectionService.setState('IN_TRANSIT', {
                           executionId: String(taskId || ''),
                           ownerEmail: email || 'unknown',
                         }).catch(() => {});
                         if (!reimbField) {
                           await generateTrackingLink();
                         }
                         // Mapa + routeTracker: o LiveRouteMapCard inicia o tracker ao ficar visível (evita corrida com start([]))
                         if (
                           reimbField ||
                           patrolField ||
                           currentTask?.locationZoneType === 'route' ||
                           currentTask?.locationZoneType === 'segment' ||
                           currentTask?.locationZoneType === 'polygon'
                         ) {
                           setShowLiveMap(true);
                         }
                       } else {
                         lastTransitScopeRef.current = null;
                         if (reimbField) {
                           dataCollectionService
                             .setState('IN_SERVICE', {
                               executionId: String(taskId || ''),
                               ownerEmail: email || 'unknown',
                             })
                             .catch(() => {});
                         } else {
                           const taskDest = getDestFromTaskLike(currentTask);
                           dataCollectionService.setState('ARRIVED', {
                             executionId: String(taskId || ''),
                             ownerEmail: email || 'unknown',
                             lat: taskDest?.lat,
                             lng: taskDest?.lng,
                           }).catch(() => {});
                         }
                         setShowLiveMap(false);
                         routeTracker.stop();
                       }
                    }}>
                       {gpsBusyHere ? (
                         <ActivityIndicator color="#fff" size="small" />
                       ) : (
                         <Ionicons name={hasValue ? 'checkmark-circle' : (field.type === 'transit_start' ? 'play' : 'stop')} size={20} color="#FFF" />
                       )}
                       <Text style={{color: '#FFF', fontWeight: 'bold', fontSize:15}}>
                         {gpsBusyHere ? 'A obter localização…' : (hasValue ? labelWhenClicked : labelWhenEmpty)}
                       </Text>
                    </TouchableOpacity>
                    {gpsBusyHere ? (
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8, paddingHorizontal: 4 }}>
                        O GPS pode demorar em campo ou com sinal fraco. Aguarde.
                      </Text>
                    ) : null}
                    {field.type === 'transit_end' &&
                    hasValue &&
                    completedTransitMapPath &&
                    completedTransitMapPath.length >= 2 ? (
                      <TransitCompletedSummaryMap
                        pathLatLng={completedTransitMapPath}
                        durationLabel={metricsLabels.durationLabel}
                        distanceLabel={metricsLabels.distanceLabel}
                      />
                    ) : null}
                    {hasValue ? (
                      <View
                        style={{
                          marginTop: 12,
                          padding: 12,
                          backgroundColor: '#f1f5f9',
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 }}>
                          Dados coletados
                        </Text>
                        {transitEvidenceLines.length > 0 ? (
                          transitEvidenceLines.map((line, i) => (
                            <Text
                              key={`${field.id}-te-${i}`}
                              style={{
                                fontSize: 13,
                                color: '#475569',
                                lineHeight: 20,
                                marginTop: i > 0 ? 4 : 0,
                              }}
                            >
                              {line}
                            </Text>
                          ))
                        ) : (
                          <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 20 }}>
                            Registro efetuado; não foi possível ler os detalhes salvos (formato antigo ou
                            incompleto).
                          </Text>
                        )}
                      </View>
                    ) : null}
                    </View>
                 );
              })()}
              {field.type === 'location_pick' && (
                <ChecklistLocationPickField
                  value={vv(field.id)}
                  onChange={(json) => hi(field.id, json || '')}
                  disabled={isReadOnly}
                  primaryColor={C.primary}
                  requireOnlineValidation={schemaFieldRequiresOnlineValidation(field)}
                />
              )}
              {field.type === 'geofence_check' && (() => {
                const geoBusyHere = gpsBusyFieldId === field.id;
                const geoBusyAny = gpsBusyFieldId != null;
                return (
                <View style={{ gap: 12 }}>
                  <GeofenceCheckFieldMap
                    geoField={field}
                    task={currentTask}
                    savedValueJson={vv(field.id)}
                    liveGps={!isReadOnly}
                    primaryColor={C.primary}
                  />
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: '#e2e8f0',
                        borderColor: '#cbd5e1',
                        borderWidth: 1,
                        flexDirection: 'row',
                        gap: 8,
                        opacity: geoBusyAny && !geoBusyHere ? 0.55 : 1,
                      },
                    ]}
                    disabled={isReadOnly || geoBusyAny}
                    onPress={() => ensureOnlineValidation(field, async () => {
                     await handleTransit(field.id, 'VALIDACAO_CERCA', undefined, scope);
                     // GPS chega na cerca eletrônica — modo IN_SERVICE
                     const resultStr = vv(field.id);
                     let insideZone = false;
                     try { insideZone = JSON.parse(resultStr || '{}').geofence?.insideZone; } catch {}
                     if (insideZone) {
                       const email = await AsyncStorage.getItem('@brspark_email');
                       const taskDest = getDestFromTaskLike(currentTask);
                       dataCollectionService.setState('IN_SERVICE', {
                         executionId: String(taskId || ''),
                         ownerEmail: email || 'unknown',
                         lat: taskDest?.lat,
                         lng: taskDest?.lng,
                       }).catch(() => {});
                     }
                  })}>
                     {geoBusyHere ? (
                       <ActivityIndicator color={C.primary} size="small" />
                     ) : (
                       <Ionicons name="location" size={20} color={C.primary} />
                     )}
                     <Text style={{color: C.primary, fontWeight: '700', fontSize:14}}>
                       {geoBusyHere ? 'A obter localização…' : 'VALIDAR LOCALIZAÇÃO (GPS)'}
                     </Text>
                  </TouchableOpacity>
                </View>
                );
              })()}
              {field.type === 'signature' && (
                 <TouchableOpacity 
                   onPress={() => ensureOnlineValidation(field, () => {
                       setCurrentSigField(field.id);
                       setCurrentSigScope(scope);
                       
                       // Try to retrieve previous strokes if they exist
                       const existingVal = vv(field.id);
                       if (existingVal && existingVal.startsWith('SIG_V1|')) {
                          const strokes = existingVal.replace('SIG_V1|', '').split('|').filter((s: string) => !s.startsWith('meta:') && s.trim().length > 0);
                          setCompletedStrokes(strokes);
                       } else {
                          setCompletedStrokes([]);
                       }
                       
                       currentStrokeRef.current = '';
                       setCurrentStrokeState('');
                       setSigModalVisible(true);
                   })}
                   style={{ 
                     height: vv(field.id) ? 160 : 120, 
                     borderWidth: 2, 
                     borderColor: vv(field.id) ? '#10b981' : '#cbd5e1', 
                     borderRadius: 12, 
                     borderStyle: vv(field.id) ? 'solid' : 'dashed', 
                     backgroundColor: vv(field.id) ? '#fff' : '#f8fafc', 
                     justifyContent: 'center', 
                     alignItems: 'center',
                     overflow: 'hidden'
                   }}
                 >
                   {vv(field.id) && vv(field.id).startsWith('SIG_V1|') ? (
                       <View style={{flex: 1, width: '100%', padding: 8}}>
                         <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 350 400" preserveAspectRatio="xMidYMid meet">
                           {vv(field.id).replace('SIG_V1|', '').split('|')
                             .filter((path: string) => !path.startsWith('meta:') && path.trim().length > 0)
                             .map((path: string, index: number) => (
                             <Path key={index} d={path} stroke="#0f172a" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                           ))}
                         </Svg>
                         <View style={{position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}>
                            <Ionicons name="checkmark" size={12} color="#15803d" />
                            <Text style={{color: '#15803d', fontSize: 10, fontWeight: '700', marginLeft: 4}}>Assinado</Text>
                         </View>
                       </View>
                   ) : vv(field.id) ? (
                       <>
                         <Ionicons name="checkmark-circle" size={32} color="#10b981" />
                         <Text style={{color: '#10b981', fontWeight: '700', marginTop: 8}}>Assinado Digitalmente</Text>
                       </>
                   ) : (
                       <>
                          <Ionicons name="pencil" size={32} color="#94a3b8" />
                          <Text style={{color: '#94a3b8', marginTop: 8, fontWeight: '600'}}>Toque para Desenhar Assinatura</Text>
                       </>
                   )}
                 </TouchableOpacity>
              )}
              {field.type === 'signature_summary' && (() => {
                const summaryIds = getSignatureSummarySourceFieldIds(field);
                const schemaList = template?.schemaData || [];
                const byId = new Map<string, any>(schemaList.map((x: any) => [x.id, x]));
                const openSig = () =>
                  ensureOnlineValidation(field, () => {
                    setCurrentSigField(field.id);
                    setCurrentSigScope(scope);
                    const existingVal = vv(field.id);
                    if (existingVal && existingVal.startsWith('SIG_V1|')) {
                      const strokes = existingVal
                        .replace('SIG_V1|', '')
                        .split('|')
                        .filter((s: string) => !s.startsWith('meta:') && s.trim().length > 0);
                      setCompletedStrokes(strokes);
                    } else {
                      setCompletedStrokes([]);
                    }
                    currentStrokeRef.current = '';
                    setCurrentStrokeState('');
                    setSigModalVisible(true);
                  });
                return (
                  <View style={{ gap: 14 }}>
                    <View
                      style={{
                        backgroundColor: '#fff',
                        borderRadius: 12,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 10 }}>
                        Conteúdo para conferência antes de assinar
                      </Text>
                      {summaryIds.length === 0 ? (
                        <Text style={{ color: '#94a3b8', fontSize: 14, lineHeight: 20 }}>
                          Nenhum campo foi selecionado para este resumo. Configure no painel de formulários
                          (propriedades do bloco «Resumo para assinatura»).
                        </Text>
                      ) : (
                        summaryIds.map((sid, sidx) => {
                          const def = byId.get(sid);
                          const raw = resolveSummarySourceValue(responses, scope, sid, schemaList);
                          const line = formatFieldValueForSignatureSummary(def, raw);
                          const thumbUris = collectSummaryThumbnailUris(def, raw);
                          const isGenericMediaLine =
                            typeof line === 'string' &&
                            (line.includes('Mídia registada') || line.includes('Mídia ou anexo registado'));
                          const showValueText = thumbUris.length === 0 || !isGenericMediaLine;
                          const isLast = sidx === summaryIds.length - 1;
                          return (
                            <View
                              key={sid}
                              style={{
                                marginBottom: isLast ? 0 : 12,
                                paddingBottom: isLast ? 0 : 12,
                                borderBottomWidth: isLast ? 0 : 1,
                                borderBottomColor: '#f1f5f9',
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                                {def?.label || sid}
                              </Text>
                              {thumbUris.length > 0 ? (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    flexWrap: 'wrap',
                                    gap: 8,
                                    marginTop: 8,
                                  }}
                                >
                                  {thumbUris.map((u, ii) => (
                                    <Image
                                      key={`${sid}_sum_${ii}`}
                                      source={{ uri: String(u).split('?')[0] }}
                                      style={{
                                        width: 76,
                                        height: 76,
                                        borderRadius: 10,
                                        backgroundColor: '#e2e8f0',
                                        borderWidth: 1,
                                        borderColor: '#e2e8f0',
                                      }}
                                      resizeMode="cover"
                                    />
                                  ))}
                                </View>
                              ) : null}
                              {showValueText ? (
                                <Text
                                  style={{
                                    fontSize: 15,
                                    color: '#0f172a',
                                    marginTop: thumbUris.length > 0 ? 8 : 6,
                                    lineHeight: 22,
                                    fontWeight: '600',
                                  }}
                                >
                                  {line}
                                </Text>
                              ) : (
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: '#64748b',
                                    marginTop: 8,
                                    fontWeight: '600',
                                  }}
                                >
                                  {thumbUris.length === 1
                                    ? '1 imagem no formulário'
                                    : `${thumbUris.length} imagens no formulário`}
                                </Text>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => openSig()}
                      disabled={isReadOnly}
                      style={{
                        height: vv(field.id) ? 160 : 120,
                        borderWidth: 2,
                        borderColor: vv(field.id) ? '#10b981' : '#cbd5e1',
                        borderRadius: 12,
                        borderStyle: vv(field.id) ? 'solid' : 'dashed',
                        backgroundColor: vv(field.id) ? '#fff' : '#f8fafc',
                        justifyContent: 'center',
                        alignItems: 'center',
                        overflow: 'hidden',
                        opacity: isReadOnly ? 0.65 : 1,
                      }}
                    >
                      {vv(field.id) && vv(field.id).startsWith('SIG_V1|') ? (
                        <View style={{ flex: 1, width: '100%', padding: 8 }}>
                          <Svg
                            style={StyleSheet.absoluteFillObject}
                            viewBox="0 0 350 400"
                            preserveAspectRatio="xMidYMid meet"
                          >
                            {vv(field.id)
                              .replace('SIG_V1|', '')
                              .split('|')
                              .filter((path: string) => !path.startsWith('meta:') && path.trim().length > 0)
                              .map((path: string, index: number) => (
                                <Path
                                  key={index}
                                  d={path}
                                  stroke="#0f172a"
                                  strokeWidth={5}
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              ))}
                          </Svg>
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 8,
                              right: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: '#dcfce7',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                            }}
                          >
                            <Ionicons name="checkmark" size={12} color="#15803d" />
                            <Text style={{ color: '#15803d', fontSize: 10, fontWeight: '700', marginLeft: 4 }}>
                              Assinado
                            </Text>
                          </View>
                        </View>
                      ) : vv(field.id) ? (
                        <>
                          <Ionicons name="checkmark-circle" size={32} color="#10b981" />
                          <Text style={{ color: '#10b981', fontWeight: '700', marginTop: 8 }}>
                            Assinado digitalmente
                          </Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="pencil" size={32} color="#94a3b8" />
                          <Text style={{ color: '#94a3b8', marginTop: 8, fontWeight: '600' }}>
                            Toque para assinar (após ler o resumo acima)
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })()}
              {field.type === 'materials_consumption' && (
                <ChecklistMaterialsConsumptionField
                  value={vv(field.id)}
                  onChange={(json) => hi(field.id, json)}
                  readOnly={isReadOnly}
                  userEmail={user?.email}
                />
              )}
              {field.type === 'materials_receipt' && (
                <ChecklistMaterialsReceiptField
                  value={vv(field.id)}
                  onChange={(json) => hi(field.id, json)}
                  readOnly={isReadOnly}
                  userEmail={user?.email}
                />
              )}
              {effectiveSchemaFieldType(field) === 'technician_finance_revenue' && (
                <ChecklistTechnicianRevenueField
                  value={vv(field.id)}
                  onChange={(json) => hi(field.id, json)}
                  readOnly={isReadOnly}
                />
              )}
              {effectiveSchemaFieldType(field) === 'technician_finance_expense' && (
                <ChecklistTechnicianFinanceField
                  value={vv(field.id)}
                  onChange={(json) => hi(field.id, json)}
                  readOnly={isReadOnly}
                  mode="expense"
                />
              )}
              {field.type !== 'hidden' && field.type !== 'leitura' && field.allowTechnicianComment ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 }}>
                    Comentário do técnico <Text style={{ fontWeight: '500', color: '#94a3b8' }}>(opcional)</Text>
                  </Text>
                  {isReadOnly ? (
                    getScopedTechComment(responses, scope, field.id).trim() ? (
                      <View
                        style={{
                          padding: 12,
                          backgroundColor: '#fffbeb',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#fde68a',
                        }}
                      >
                        <Text style={{ fontSize: 14, color: '#422006', lineHeight: 20 }}>
                          {getScopedTechComment(responses, scope, field.id)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sem comentário.</Text>
                    )
                  ) : (
                    <TextInput
                      style={[styles.input, { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]}
                      placeholder="Notas, observações ou contexto adicional…"
                      multiline
                      maxLength={2000}
                      value={getScopedTechComment(responses, scope, field.id)}
                      onChangeText={(t) =>
                        scope
                          ? hi(rowTechnicianCommentKey(field.id), t)
                          : handleInput(technicianCommentKey(field.id), t)
                      }
                    />
                  )}
                </View>
              ) : null}
              </View>
            </View>
          );
        });

          const emptyNote = (fl: any[]) =>
            fl.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#64748b', marginVertical: 32 }}>
                Nenhum campo nesta etapa.
              </Text>
            ) : null;

          const draftKLocal = resolvedTaskId ? `@draft_tsk_${resolvedTaskId}` : `@draft_chk_${id}`;

          if (paginatedSectionRepeatEnabled && openingSectionBreakField) {
            const sb = openingSectionBreakField;
            const minR = currentRepeatMinRows;
            const maxR = sectionRepeatMaxRows(sb);
            const rs = currentRepeatRawRows;
            const n = currentRepeatVisibleLen;
            const selectedIdxRaw = hubSelectedRepeatRowBySection[String(sb.id)];
            const selectedIdx = Number.isFinite(Number(selectedIdxRaw))
              ? Math.max(0, Math.min(Number(selectedIdxRaw), Math.max(0, n - 1)))
              : 0;
            const idxs =
              useSectionHub && !hubPicking
                ? [selectedIdx]
                : Array.from({ length: n }, (_, i) => i);
            return (
              <>
                {emptyNote(currentFieldsToRender)}
                {idxs.map((ri) => (
                  <View
                    key={`psrep_${sb.id}_${ri}`}
                    style={{
                      marginBottom: 14,
                      padding: 12,
                      backgroundColor: '#f8fafc',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ fontWeight: '800', color: '#4f46e5' }}>
                        {sb.label || 'Seção'} · {ri + 1}
                      </Text>
                      {!isReadOnly && rs.length > minR ? (
                        <TouchableOpacity
                          onPress={() => {
                            const rkey = sectionRepeatStorageKey(sb.id);
                            const doneKey = sectionRepeatCompletedStorageKey(sb.id);
                            setResponses((prev: any) => {
                              const rows = Array.isArray(prev[rkey]) ? [...prev[rkey]] : [];
                              const done = Array.isArray(prev[doneKey]) ? [...prev[doneKey]] : [];
                              rows.splice(ri, 1);
                              if (done.length > ri) done.splice(ri, 1);
                              const nr = { ...prev, [rkey]: rows, [doneKey]: done };
                              void AsyncStorage.setItem(draftKLocal, JSON.stringify(nr));
                              return nr;
                            });
                          }}
                        >
                          <Text style={{ color: '#dc2626', fontWeight: '700' }}>Remover</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {renderFieldList(currentFieldsToRender, { sectionId: sb.id, rowIndex: ri })}
                  </View>
                ))}
                {!isReadOnly && !useSectionHub && (maxR == null || rs.length < maxR) ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (!ensureCanAppendRepeatInstance(sb.label || 'Seção', sb.id, rs)) return;
                      const rkey = sectionRepeatStorageKey(sb.id);
                      setResponses((prev: any) => {
                        const rows = Array.isArray(prev[rkey]) ? [...prev[rkey]] : [];
                        rows.push({});
                        const nr = { ...prev, [rkey]: rows };
                        void AsyncStorage.setItem(draftKLocal, JSON.stringify(nr));
                        return nr;
                      });
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingVertical: 6 }}
                  >
                    <Ionicons name="add-circle-outline" size={24} color={C.primary} />
                    <Text style={{ color: C.primary, fontWeight: '700' }}>Adicionar instância</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            );
          }

          if (effectiveFillMode === 'full' && fullRenderChunks && fullRenderChunks.length > 0) {
            return (
              <>
                {fullRenderChunks.map((chunk, ci) => {
                  if (chunk.kind === 'repeat' && chunk.sectionField) {
                    const sb = chunk.sectionField;
                    const minR = sectionRepeatMinRows(sb);
                    const maxR = sectionRepeatMaxRows(sb);
                    const rs = getRepeatRows(responses, sb.id);
                    const n = Math.max(rs.length, minR, 1);
                    const idxs = Array.from({ length: n }, (_, i) => i);
                    return (
                      <View key={`fcrep_${sb.id}_${ci}`} style={{ marginBottom: 20 }}>
                        {chunk.fields.length > 0 ? (
                          <Text style={{ fontWeight: '800', fontSize: 15, marginBottom: 10, color: '#0f172a' }}>
                            {sb.label || 'Seção'}
                          </Text>
                        ) : null}
                        {idxs.map((ri) => (
                          <View
                            key={`fcrep_${ci}_${ri}`}
                            style={{
                              marginBottom: 14,
                              padding: 12,
                              backgroundColor: '#f8fafc',
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                            }}
                          >
                            <Text style={{ fontWeight: '800', color: '#4f46e5', marginBottom: 10 }}>
                              Instância {ri + 1}
                            </Text>
                            {renderFieldList(chunk.fields, { sectionId: sb.id, rowIndex: ri })}
                          </View>
                        ))}
                        {!isReadOnly && !useSectionHub && (maxR == null || rs.length < maxR) ? (
                          <TouchableOpacity
                            onPress={() => {
                              if (!ensureCanAppendRepeatInstance(sb.label || 'Seção', sb.id, rs)) return;
                              const rkey = sectionRepeatStorageKey(sb.id);
                              setResponses((prev: any) => {
                                const rows = Array.isArray(prev[rkey]) ? [...prev[rkey]] : [];
                                rows.push({});
                                const nr = { ...prev, [rkey]: rows };
                                void AsyncStorage.setItem(draftKLocal, JSON.stringify(nr));
                                return nr;
                              });
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}
                          >
                            <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                            <Text style={{ color: C.primary, fontWeight: '700' }}>Adicionar instância</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  }
                  return (
                    <React.Fragment key={`fcflat_${ci}`}>{renderFieldList(chunk.fields, null)}</React.Fragment>
                  );
                })}
              </>
            );
          }

          if (wizardStepSectionRepeat && wizardStepSectionRepeat.sectionField) {
            const sb = wizardStepSectionRepeat.sectionField;
            const minR = sectionRepeatMinRows(sb);
            const maxR = sectionRepeatMaxRows(sb);
            const rs = getRepeatRows(responses, sb.id);
            const n = Math.max(rs.length, minR, 1);
            const idxs = Array.from({ length: n }, (_, i) => i);
            return (
              <>
                {emptyNote(currentFieldsToRender)}
                {idxs.map((ri) => (
                  <View
                    key={`wsrep_${ri}`}
                    style={{
                      marginBottom: 14,
                      padding: 12,
                      backgroundColor: '#f8fafc',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: '#4f46e5', marginBottom: 10 }}>
                      {sb.label || 'Seção'} · {ri + 1}
                    </Text>
                    {renderFieldList(currentFieldsToRender, { sectionId: sb.id, rowIndex: ri })}
                  </View>
                ))}
                {!isReadOnly && !useSectionHub && (maxR == null || rs.length < maxR) ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (!ensureCanAppendRepeatInstance(sb.label || 'Seção', sb.id, rs)) return;
                      const rkey = sectionRepeatStorageKey(sb.id);
                      setResponses((prev: any) => {
                        const rows = Array.isArray(prev[rkey]) ? [...prev[rkey]] : [];
                        rows.push({});
                        const nr = { ...prev, [rkey]: rows };
                        void AsyncStorage.setItem(draftKLocal, JSON.stringify(nr));
                        return nr;
                      });
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                    <Text style={{ color: C.primary, fontWeight: '700' }}>Adicionar instância</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            );
          }

          return (
            <>
              {emptyNote(currentFieldsToRender)}
              {renderFieldList(currentFieldsToRender, null)}
            </>
          );
        })()
          : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.checklistBottomDock,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        {!isReadOnly ? (
          <View style={styles.timeBadgesRow}>
            <View style={styles.timeBadge}>
              <Text style={styles.timeBadgeLabel}>Total</Text>
              <Text style={styles.timeBadgeValue}>{formatDurationClock(formElapsedDisp)}</Text>
            </View>
            <View style={styles.timeBadge}>
              <Text style={styles.timeBadgeLabel}>Foco</Text>
              <Text style={styles.timeBadgeValue}>{formatDurationClock(activeDisp)}</Text>
            </View>
            {showSectionTimerInFooter ? (
              <View style={styles.timeBadge}>
                <Text style={styles.timeBadgeLabel}>Etapa</Text>
                <Text style={styles.timeBadgeValue}>
                  {sectionElapsedDisp != null ? formatDurationClock(sectionElapsedDisp) : '—'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : typeof responses.__form_fill_duration_sec === 'number' ? (
          <View style={styles.timeBadgesRow}>
            <View style={styles.timeBadge}>
              <Text style={styles.timeBadgeLabel}>Total</Text>
              <Text style={styles.timeBadgeValue}>
                {formatDurationClock(responses.__form_fill_duration_sec)}
              </Text>
            </View>
            <View style={styles.timeBadge}>
              <Text style={styles.timeBadgeLabel}>Foco</Text>
              <Text style={styles.timeBadgeValue}>
                {formatDurationClock(Number(responses.__form_active_seconds_final) || 0)}
              </Text>
            </View>
            {showSectionTimerInFooter ? (
              <View style={styles.timeBadge}>
                <Text style={styles.timeBadgeLabel}>Etapa</Text>
                <Text style={styles.timeBadgeValue}>
                  {sectionElapsedBadge != null ? formatDurationClock(sectionElapsedBadge) : '—'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {!(useSectionHub && hubPicking) ? (
        <View style={styles.footerNav}>
          {effectiveFillMode === 'wizard' ? (
            <>
              {wizardIndex > 0 ? (
                <TouchableOpacity style={styles.navBtnPrev} onPress={handleWizardPrev}>
                  <Text style={styles.navBtnTextBlack}>{"< Voltar"}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {wizardIndex < wizardSteps.length - 1 ? (
                <TouchableOpacity style={styles.navBtnNext} onPress={handleWizardNext}>
                  <Text style={styles.navBtnText}>{"Próximo >"}</Text>
                </TouchableOpacity>
              ) : !isReadOnly ? (
                <TouchableOpacity style={styles.submitBtn} onPress={submitExecution} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Text style={styles.submitText}>CONCLUIR</Text>
                      <Ionicons name="checkmark-done" size={24} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    flex: 1,
                    padding: 18,
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Fim do Relatório
                  </Text>
                </View>
              )}
            </>
          ) : effectiveFillMode === 'hybrid' && hybridInnerMode === 'wizard' ? (
            <>
              {currentPage > 0 || hybridInnerWizardIndex > 0 || (useSectionHub && !hubPicking) ? (
                <TouchableOpacity style={styles.navBtnPrev} onPress={handleHybridPagePrev}>
                  <Text style={styles.navBtnTextBlack}>{"< Voltar"}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {hybridInnerWizardIndex < hybridVisibleFields.length - 1 ? (
                <TouchableOpacity style={styles.navBtnNext} onPress={handleHybridInnerNext}>
                  <Text style={styles.navBtnText}>{"Próximo >"}</Text>
                </TouchableOpacity>
              ) : currentPage < displayPages.length - 1 ? (
                <TouchableOpacity
                  style={styles.navBtnNext}
                  onPress={useSectionHub ? handleCompleteSectionToHub : handleNextPage}
                >
                  <Text style={styles.navBtnText}>{useSectionHub ? 'Concluir' : 'Avançar >'}</Text>
                </TouchableOpacity>
              ) : !isReadOnly ? (
                <TouchableOpacity style={styles.submitBtn} onPress={submitExecution} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Text style={styles.submitText}>CONCLUIR</Text>
                      <Ionicons name="checkmark-done" size={24} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    flex: 1,
                    padding: 18,
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Fim do Relatório
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {currentPage > 0 || (useSectionHub && !hubPicking) ? (
                <TouchableOpacity style={styles.navBtnPrev} onPress={handleHybridPagePrev}>
                  <Text style={styles.navBtnTextBlack}>{"< Voltar"}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              {currentPage < displayPages.length - 1 ? (
                <TouchableOpacity
                  style={styles.navBtnNext}
                  onPress={useSectionHub ? handleCompleteSectionToHub : handleNextPage}
                >
                  <Text style={styles.navBtnText}>{useSectionHub ? 'Concluir' : 'Avançar >'}</Text>
                </TouchableOpacity>
              ) : !isReadOnly ? (
                <TouchableOpacity style={styles.submitBtn} onPress={submitExecution} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Text style={styles.submitText}>CONCLUIR</Text>
                      <Ionicons name="checkmark-done" size={24} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    flex: 1,
                    padding: 18,
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Fim do Relatório
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
        ) : null}
      </View>

      {sigModalVisible && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.8)', justifyContent:'center', padding:20}}>
            <View style={{backgroundColor:'#FFF', borderRadius:16, overflow:'hidden', minHeight:400}}>
              {/* C.accent (não C.primary): no dark mode primary é quase branco e anula contraste com texto #FFF */}
              <View style={{backgroundColor:C.accent, padding:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={{color:'#FFF', fontWeight:'bold', fontSize:16}}>Assine Abaixo</Text>
                <TouchableOpacity onPress={() => setCompletedStrokes([])}><Text style={{color:'#FFF', opacity:0.9}}>Limpar Painel</Text></TouchableOpacity>
              </View>
              <View style={{flex:1, backgroundColor:'#f8fafc'}} {...panResponder.panHandlers}>
                <Svg style={StyleSheet.absoluteFillObject}>
                  {completedStrokes.map((path, index) => (
                    <Path key={index} d={path} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {currentStrokeState ? <Path d={currentStrokeState} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
                </Svg>
              </View>
              <View style={{flexDirection:'row', backgroundColor:'#FFF', padding:16, borderTopWidth:1, borderColor:'#e2e8f0'}}>
                <TouchableOpacity style={{flex:1, padding:16, marginRight:8, borderRadius:8, backgroundColor:'#e2e8f0', alignItems:'center'}} onPress={() => {setSigModalVisible(false);}}>
                  <Text style={{fontWeight:'700', color:'#475569'}}>CANCELAR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{flex:1, padding:16, borderRadius:8, backgroundColor:C.accent, alignItems:'center'}} onPress={saveSignature} disabled={savingSignature}>
                  {savingSignature ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{fontWeight:'700', color:'#FFF'}}>SALVAR</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      <Modal
        visible={checklistBarcodeModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeChecklistBarcodeModal}
      >
        <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: insets.top + 8,
              paddingHorizontal: 16,
              paddingBottom: 10,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>
              {t('stock.scannerTitle')}
            </Text>
            <TouchableOpacity onPress={closeChecklistBarcodeModal} hitSlop={12} accessibilityLabel="Fechar">
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text
            style={{
              color: 'rgba(255,255,255,0.88)',
              paddingHorizontal: 16,
              paddingBottom: 12,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {t('stock.scanHint')}
          </Text>
          <View
            style={{
              flex: 1,
              marginHorizontal: 14,
              marginBottom: Math.max(insets.bottom, 12) + 8,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: '#000',
            }}
          >
            {checklistBarcodeModalOpen ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
                }}
                onBarcodeScanned={onChecklistBarcodeScanned}
              />
            ) : null}
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
            >
              <View
                style={{
                  width: '78%',
                  maxWidth: 300,
                  aspectRatio: 1.65,
                  borderWidth: 2,
                  borderColor: '#38bdf8',
                  borderRadius: 12,
                  backgroundColor: 'transparent',
                }}
              />
            </View>
          </View>
          <TouchableOpacity
            onPress={closeChecklistBarcodeModal}
            style={{
              marginHorizontal: 16,
              marginBottom: Math.max(insets.bottom, 16),
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Modals removed: Tracking modal was removed (handled by backoffice) */}

      <Modal visible={pauseReasonModalVisible} animationType="slide" onRequestClose={() => setPauseReasonModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#EEF2F6' }}>
          <LinearGradient
            colors={[C.primary, C.branding]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: insets.top + 10,
              paddingBottom: 18,
              paddingHorizontal: 18,
              borderBottomLeftRadius: 22,
              borderBottomRightRadius: 22,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {pausePickerStep === 'sub' ? (
                <TouchableOpacity
                  onPress={() => {
                    setPausePickerStep('category');
                    setPauseSelectedCategory(null);
                    setPauseHighlightSubId(null);
                    setPauseDetailDraft('');
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="chevron-back" size={26} color="#fff" />
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="pause-circle" size={22} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.4, lineHeight: 28 }}>
                  {pausePickerStep === 'category' ? t('pause.pickCategory') : t('pause.pickSub')}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: 'rgba(255,255,255,0.9)',
                    lineHeight: 18,
                    marginTop: 8,
                  }}
                >
                  {pausePickerStep === 'category' ? t('pause.modalLeadCategory') : t('pause.modalLeadSub')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPauseReasonModalVisible(false)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
            showsVerticalScrollIndicator={false}
          >
            {pausePickerStep === 'category'
              ? PAUSE_CATEGORIES.map((cat) => {
                  const c = cat.id === 'operational' ? C.accent : PAUSE_PICKER_CAT_COLOR[cat.id] || C.primary;
                  const ic = PAUSE_PICKER_CAT_ICON[cat.id] || 'folder-outline';
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      activeOpacity={0.88}
                      onPress={() => {
                        setPauseSelectedCategory(cat);
                        setPausePickerStep('sub');
                        setPauseHighlightSubId(null);
                        setPauseDetailDraft('');
                      }}
                      style={{
                        backgroundColor: '#fff',
                        borderRadius: 18,
                        marginBottom: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 14,
                        paddingHorizontal: 14,
                        borderWidth: 1,
                        borderColor: '#F1F5F9',
                        shadowColor: '#0f172a',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.07,
                        shadowRadius: 14,
                        elevation: 4,
                      }}
                    >
                      <View
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 16,
                          backgroundColor: `${c}18`,
                          borderWidth: 1,
                          borderColor: `${c}35`,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginRight: 14,
                        }}
                      >
                        <Ionicons name={ic} size={26} color={c} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', lineHeight: 22 }}>{t(cat.i18nKey)}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#94a3b8', marginTop: 3 }}>
                          {t('pause.optionCount', { count: cat.subs.length })}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: '#F8FAFC',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                      </View>
                    </TouchableOpacity>
                  );
                })
              : pauseSelectedCategory
                ? (() => {
                    const subAccent =
                      pauseSelectedCategory.id === 'operational'
                        ? C.accent
                        : PAUSE_PICKER_CAT_COLOR[pauseSelectedCategory.id] || C.primary;
                    return pauseSelectedCategory.subs.map((sub) => {
                      const selected = pauseHighlightSubId === sub.id;
                      return (
                        <TouchableOpacity
                          key={sub.id}
                          activeOpacity={0.88}
                          onPress={() => {
                            if (sub.requiresDetail) {
                              setPauseHighlightSubId(sub.id);
                              setPauseDetailDraft('');
                            } else if (pauseSelectedCategory) {
                              confirmStartPause(pauseSelectedCategory, sub.id, '');
                            }
                          }}
                          style={{
                            backgroundColor: selected ? '#FFFBEB' : '#fff',
                            borderRadius: 16,
                            marginBottom: 10,
                            paddingVertical: 14,
                            paddingHorizontal: 14,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? subAccent : '#EEF2F6',
                            flexDirection: 'row',
                            alignItems: 'center',
                            shadowColor: '#0f172a',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: selected ? 0.1 : 0.05,
                            shadowRadius: 10,
                            elevation: selected ? 3 : 2,
                          }}
                        >
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: subAccent,
                              marginRight: 14,
                              opacity: selected ? 1 : 0.45,
                            }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a', lineHeight: 20 }}>{t(sub.i18nKey)}</Text>
                            {sub.requiresDetail ? (
                              <View
                                style={{
                                  alignSelf: 'flex-start',
                                  marginTop: 6,
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 8,
                                  backgroundColor: '#FFEDD5',
                                  borderWidth: 1,
                                  borderColor: '#FDBA74',
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#C2410C', letterSpacing: 0.2 }}>
                                  {t('pause.subNeedsDescription')}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Ionicons
                            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                            size={24}
                            color={selected ? subAccent : '#E2E8F0'}
                          />
                        </TouchableOpacity>
                      );
                    });
                  })()
                : null}

            {pausePickerStep === 'sub' && pauseHighlightSubId && pauseSelectedCategory ? (
              <View
                style={{
                  marginTop: 8,
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.06,
                  shadowRadius: 16,
                  elevation: 3,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#475569', marginBottom: 8 }}>{t('pause.otherDetail')}</Text>
                <TextInput
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: '#E2E8F0',
                    padding: 14,
                    minHeight: 112,
                    textAlignVertical: 'top',
                    fontSize: 15,
                    color: '#0f172a',
                  }}
                  multiline
                  placeholder={t('pause.otherDetailHint')}
                  placeholderTextColor="#94A3B8"
                  value={pauseDetailDraft}
                  onChangeText={setPauseDetailDraft}
                  maxLength={500}
                />
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={{ marginTop: 14, borderRadius: 16, overflow: 'hidden' }}
                  onPress={() => {
                    if (pauseSelectedCategory && pauseHighlightSubId) {
                      confirmStartPause(pauseSelectedCategory, pauseHighlightSubId, pauseDetailDraft);
                    }
                  }}
                >
                  <LinearGradient
                    colors={[C.accent, '#DC2626']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                  >
                    <Ionicons name="pause-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{t('pause.confirmPause')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={sessionPauseActive} transparent animationType="fade">
        <LinearGradient
          colors={['#0c0a09', '#1c1917', '#292524']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingHorizontal: 20,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 20,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderRadius: 28,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
                paddingVertical: 26,
                paddingHorizontal: 22,
                width: '100%',
                maxWidth: 420,
                alignSelf: 'center',
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 18 }}>
                <LinearGradient
                  colors={[C.primary, C.accent, '#dc2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: C.accent,
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.4,
                    shadowRadius: 18,
                    elevation: 10,
                  }}
                >
                  <Ionicons name="pause" size={34} color="#fff" />
                </LinearGradient>
              </View>
              <Text
                style={{
                  color: '#fafaf9',
                  fontSize: 22,
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: -0.3,
                }}
              >
                {t('pause.pausedTitle')}
              </Text>
              <Text
                style={{
                  color: '#a8a29e',
                  fontSize: 14,
                  textAlign: 'center',
                  marginTop: 8,
                  lineHeight: 20,
                  paddingHorizontal: 4,
                }}
              >
                {t('pause.pausedHint')}
              </Text>

              {sessionPauseOpenEvent ? (
                <View
                  style={{
                    marginTop: 20,
                    backgroundColor: 'rgba(0,0,0,0.22)',
                    borderRadius: 16,
                    padding: 14,
                    borderLeftWidth: 3,
                    borderLeftColor: C.accent,
                  }}
                >
                  <Text style={{ color: '#78716c', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {t('pause.overlayReasonLabel')}
                  </Text>
                  <Text style={{ color: '#e7e5e4', fontSize: 16, fontWeight: '700', marginTop: 6, lineHeight: 22 }}>
                    {String(sessionPauseOpenEvent.categoryLabel || sessionPauseOpenEvent.subLabel || '')}
                  </Text>
                  {sessionPauseOpenEvent.categoryLabel && sessionPauseOpenEvent.subLabel ? (
                    <Text style={{ color: '#a8a29e', fontSize: 13, marginTop: 4 }}>{String(sessionPauseOpenEvent.subLabel)}</Text>
                  ) : null}
                  {sessionPauseOpenEvent.detail ? (
                    <Text
                      style={{ color: '#d6d3d1', fontSize: 13, marginTop: 10, lineHeight: 18 }}
                      numberOfLines={6}
                    >
                      {String(sessionPauseOpenEvent.detail)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View
                style={{
                  marginTop: 22,
                  marginBottom: 22,
                  backgroundColor: 'rgba(0,0,0,0.28)',
                  borderRadius: 18,
                  paddingVertical: 16,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  <Ionicons name="time-outline" size={17} color="#fca5a5" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#fca5a5', fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>
                    {t('pause.pauseClock')}
                  </Text>
                </View>
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 44,
                    fontWeight: '800',
                    textAlign: 'center',
                    fontVariant: ['tabular-nums'],
                    ...(Platform.OS === 'android' ? { fontFamily: 'monospace' } : {}),
                  }}
                >
                  {formatDurationClock(pauseSecondsLive)}
                </Text>
              </View>

              <TouchableOpacity activeOpacity={0.92} onPress={resumeFromPauseOverlay} style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
                <LinearGradient
                  colors={[C.primary, C.accent, '#dc2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    paddingVertical: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="play" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{t('pause.continueBtn')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={exitPauseToList}
                style={{
                  paddingVertical: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.22)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
              >
                <Text style={{ color: '#e7e5e4', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>{t('pause.exitBtn')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={serverPausedExecution && !isReadOnly && !responses.__form_paused_since}
        transparent
        animationType="fade"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            justifyContent: 'center',
            padding: 24,
            paddingTop: insets.top + 20,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
            {t('pause.blockedTitle')}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
            {t('pause.blockedHint')}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: C.accent, paddingVertical: 18, borderRadius: 16 }}
            onPress={() => void unpauseExecutionFromServer()}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, textAlign: 'center' }}>{t('pause.unpauseBtn')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

function createChecklistStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width:0, height:2 },
    shadowOpacity: 0.15,
    shadowRadius: 8
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  label: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#f8fafc' },
  radioGroup: { flexDirection: 'row', gap: 12 },
  radio: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#f1f5f9' },
  radioActive: { backgroundColor: C.accent },
  radioText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  cameraBox: { height: 100, borderRadius: 8, borderWidth: 2, borderColor: '#cbd5e1', borderStyle: 'dashed', backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cameraText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  actionBtn: { padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  submitBtn: { backgroundColor: C.accent, padding: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flex: 1, marginLeft: 6, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  submitText: { color: '#FFF', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  progressBarWrapper: {
      height: 24,
      backgroundColor: '#e2e8f0',
      position: 'relative',
      overflow: 'hidden',
  },
  progressBarFill: {
      position: 'absolute',
      left: 0, top: 0, bottom: 0,
      backgroundColor: C.primary,
      opacity: 0.3
  },
  progressText: {
      textAlign: 'center',
      lineHeight: 24,
      fontSize: 10,
      fontWeight: 'bold',
      color: '#475569',
      zIndex: 2
  },
  checklistBottomDock: {
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    paddingHorizontal: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 12,
  },
  timeBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    gap: 6,
  },
  timeBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timeBadgeValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
  },
  footerNav: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 0
  },
  navBtnPrev: {
      padding: 18,
      backgroundColor: '#FFF',
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      flex: 1,
      marginRight: 6
  },
  navBtnTextBlack: {
      fontWeight: '900',
      color: '#64748B',
      fontSize: 14,
      textTransform: 'uppercase',
      letterSpacing: 0.5
  },
  navBtnNext: {
      padding: 18,
      backgroundColor: C.primary,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
      flex: 1,
      marginLeft: 6
  },
  navBtnText: {
      fontWeight: '900',
      color: '#FFF',
      fontSize: 15,
      textTransform: 'uppercase',
      letterSpacing: 1
  }
});
}
