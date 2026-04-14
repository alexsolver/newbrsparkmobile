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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Network from 'expo-network';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanResponder } from 'react-native';
import { type ColorPalette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons, AntDesign, Entypo, Feather, FontAwesome, FontAwesome5, Foundation, MaterialIcons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { apiFetch, getToken, handleUnauthorizedMaybeSessionInvalidated } from '../../src/services/auth';
import { fetchDrivingLegEtaMinutes, fetchDrivingLegMetrics } from '../../src/services/osrmClient';
import { haversineMeters, polylineLengthMeters } from '../../src/utils/polylineMetrics';
import { LinearGradient } from 'expo-linear-gradient';
import GeofenceStatusBar from './GeofenceStatusBar';
import GeofenceMapScreen from './GeofenceMapScreen';
import RouteProgressBar from './RouteProgressBar';
import LiveRouteMapCard, { pickDestinationForOsrm } from './LiveRouteMapCard';
import { routeTracker } from '../../src/services/routeTrackingService';
import { computePatrolCompliance } from '../../src/services/patrolRouteMetrics';
import { dataCollectionService } from '../../src/services/dataCollectionService';
import { FieldHelpInstructions, isFieldInstructionsVisible } from '../../src/components/FieldHelpInstructions';
import { LeituraBlock } from '../../src/components/LeituraBlock';
import { ChecklistImageAnnotationField } from '../../src/components/ChecklistImageAnnotationField';
import {
  ChecklistLookupSelectField,
  ChecklistOpinionScaleField,
  ChecklistRepeatableMatrixField,
} from '../../src/components/ChecklistExtendedFieldWidgets';
import { ChecklistVisionGridComposeRunner } from '../../src/components/ChecklistVisionGridComposeRunner';
import { ChecklistVoiceNoteField, voiceNoteValueIsFilled } from '../../src/components/ChecklistVoiceNoteField';
import { ChecklistLocationPickField, isLocationPickAnswerValid } from '../../src/components/ChecklistLocationPickField';
import { checkAttachmentMeta } from '../../src/utils/safeAttachment';
import { taskOsLabel } from '../../src/utils/taskOsLabel';
import { PAUSE_CATEGORIES, PAUSE_DETAIL_MIN_LEN, type PauseCategoryDef } from '../../src/checklist/pauseCatalog';
import {
  enqueueExecutionStatusPatch,
  pushSyncQueue,
  COMPLETED_BODY_LOCAL_TTL_MS,
} from '../../src/services/syncService';
import {
  findCloudTaskById,
  loadAllCloudTasksForExecutionLookup,
  savePartitionedFromUnifiedList,
  patchCloudTaskById,
} from '../../src/lib/cloudTasksBuckets';
import { applyMaterialsStockForSubmission, parseMaterialsValue } from '../../src/checklist/applyMaterialsStockOnSubmit';
import { applyMaterialsReceiptForSubmission } from '../../src/checklist/applyMaterialsReceiptOnSubmit';
import {
  applyTechnicianFinanceForSubmission,
  parseTechnicianFinanceValue,
} from '../../src/checklist/applyTechnicianFinanceOnSubmit';
import { ChecklistMaterialsConsumptionField } from '../../src/components/ChecklistMaterialsConsumptionField';
import { ChecklistMaterialsReceiptField } from '../../src/components/ChecklistMaterialsReceiptField';
import { useAuth } from '../../src/hooks/useAuth';
import { evaluateBusinessCondition } from '../../src/lib/businessRuleCondition';

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
  operational: '#EA580C',
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

/** Evidência guardada em transit_start / transit_end (JSON no mapa de respostas). */
function parseTransitFieldEvidence(raw: unknown): {
  timestamp?: string;
  address?: string;
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
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
    const o =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : (JSON.parse(String(raw)) as Record<string, unknown>);
    if (!o || typeof o !== 'object') return null;
    const coords = o.coordinates as Record<string, unknown> | undefined;
    const latRaw = coords?.lat ?? o.lat;
    const lngRaw = coords?.lng ?? o.lng;
    const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw));
    const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw));
    const accRaw = o.accuracyMeters ?? o.accuracy;
    const accuracyMeters =
      accRaw != null && Number.isFinite(Number(accRaw)) ? Number(accRaw) : undefined;
    return {
      timestamp: typeof o.timestamp === 'string' ? o.timestamp : undefined,
      address: typeof o.address === 'string' ? o.address : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      accuracyMeters,
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
    start: `__section_start_${sectionId}`,
    end: `__section_end_${sectionId}`,
  };
}

const PAUSE_HISTORY_KEY = '__pause_history';

function metaRevisionVisitContext(m: unknown): boolean {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  const tk = (x: unknown) => x === true || x === 'true' || String(x ?? '').toLowerCase() === 'true';
  if (tk(r.reopenForRevisionPending) || tk(r.revisionVisitActive)) return true;
  const rc = Number(r.reopenCount);
  return Number.isFinite(rc) && rc > 0;
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

const REVISION_SESSION_FIELD_TYPES = new Set([
  'signature',
  'signature_summary',
  'transit_start',
  'transit_end',
  'geofence_check',
  'facial_recognition',
  'vision_checklist',
  'vision_ai_analysis',
  'image_annotation',
  'lookup_select',
  'repeatable_matrix',
  'opinion_scale',
]);

/**
 * Tipo canónico do campo no schema.
 * Importante: alguns fluxos legados / exportações podem guardar o tipo semântico em `fieldType`
 * enquanto `type` fica genérico (ex.: `text`) — nesse caso o 1.º `??` quebrava widgets como
 * `signature_summary` (cartão só com rótulo, sem controlo).
 */
function effectiveSchemaFieldType(f: any): string {
  const keys = ['type', 'fieldType', 'kind', 'component', 'controlType'] as const;
  const normalized: string[] = [];
  for (const k of keys) {
    const raw = f?.[k];
    if (raw == null || raw === '') continue;
    const t = String(raw)
      .trim()
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
    if (t) normalized.push(t);
  }
  const preferFirst = ['signature_summary', 'signature'] as const;
  for (const p of preferFirst) {
    if (normalized.includes(p)) return p;
  }
  return normalized[0] || '';
}

/** Campos de mídia + prompt estruturado (sim/não) analisados no servidor (YOLO ou Gemini). */
function isVisionSimNaoMediaFieldType(t: string): boolean {
  return t === 'vision_checklist' || t === 'vision_ai_analysis';
}

/** Assinatura, deslocamento, geofence facial, etc. — não reaproveitar na nova sessão de revisão. */
function stripRevisionSessionFieldResponses(res: Record<string, any>, schemaData: any[] | undefined): void {
  if (!Array.isArray(schemaData)) return;
  for (const f of schemaData) {
    if (!f?.id) continue;
    if (REVISION_SESSION_FIELD_TYPES.has(effectiveSchemaFieldType(f))) {
      delete res[f.id];
      if (effectiveSchemaFieldType(f) === 'facial_recognition') {
        delete res[`${f.id}__biometric`];
      }
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
    const raw = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
    let arr: string[] = [];
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
    if (!Array.isArray(arr)) arr = [];
    if (arr.includes(id)) return;
    arr.push(id);
    await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

/** Resumo do motivo da pausa ainda aberta (sem fechar o intervalo). */
function getOpenPauseSummaryFromResponses(prev: Record<string, any>): string {
  const hist = parsePauseHistory(prev);
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i]?.endedAt == null && hist[i]?.startedAt) {
      return [hist[i].categoryLabel, hist[i].subLabel, hist[i].detail].filter(Boolean).join(' — ');
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
  const { start, end } = getSectionTimingKeys(sectionId);
  const s = responses[start];
  if (!s) return null;
  const startMs = new Date(s).getTime();
  if (Number.isNaN(startMs)) return null;
  const e = responses[end];
  const endMs = e ? new Date(e).getTime() : nowMs;
  if (Number.isNaN(endMs)) return null;
  let sec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  for (const ev of parsePauseHistory(responses)) {
    const w = pauseEventWindowMs(ev);
    if (w) sec -= overlapSeconds(startMs, endMs, w.start, w.end);
  }
  const since = responses.__form_paused_since;
  if (since) {
    const pt = new Date(since).getTime();
    if (!Number.isNaN(pt)) {
      sec -= overlapSeconds(startMs, endMs, pt, nowMs);
    }
  }
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
  if (structured) {
    return [{ id: 'q1', text: structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS) }];
  }
  const vq =
    field?.visionQuestions ??
    field?.vision_questions ??
    (cfg?.visionQuestions as unknown[] | undefined);
  if (!Array.isArray(vq) || !vq.length) return [];
  const parts: string[] = [];
  for (let i = 0; i < vq.length; i++) {
    const x = vq[i];
    if (!x || typeof x !== 'object') continue;
    const text = String((x as any).text || (x as any).question || '').trim();
    if (!text) continue;
    parts.push(text);
  }
  if (!parts.length) return [];
  const joined = parts.join('\n\n').slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
  return [{ id: 'q1', text: joined }];
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

/** Visão IA Análise: mostrar texto/confiança/nota no formulário (padrão: sim). */
function visionAiShowsResponseInForm(field: any): boolean {
  if (effectiveSchemaFieldType(field) !== 'vision_ai_analysis') return true;
  return field?.visionShowAiResponseInForm !== false;
}

/** `visionCaptureMode` definido no Form Builder. */
function getVisionCaptureMediaTypes(field: any): ImagePicker.MediaTypeOptions {
  const m = String(field?.visionCaptureMode ?? field?.vision_capture_mode ?? '').trim();
  if (m === 'photo_only') return ImagePicker.MediaTypeOptions.Images;
  if (m === 'video_only') return ImagePicker.MediaTypeOptions.Videos;
  return ImagePicker.MediaTypeOptions.All;
}

function visionCaptureModeSubtitle(field: any): string {
  const m = String(field?.visionCaptureMode ?? field?.vision_capture_mode ?? '').trim();
  if (m === 'photo_only') {
    return 'Só foto pela câmera.';
  }
  if (m === 'video_only') {
    return 'Só vídeo pela câmera (até ~1 min).';
  }
  return 'Foto ou vídeo curto pela câmera (até ~1 min).';
}

/** Ícone principal do cartão de captura (modo definido no builder). */
function visionCaptureModeHeroIcon(field: any): keyof typeof Ionicons.glyphMap {
  const m = String(field?.visionCaptureMode ?? field?.vision_capture_mode ?? '').trim();
  if (m === 'photo_only') return 'camera-outline';
  if (m === 'video_only') return 'videocam-outline';
  return 'scan-outline';
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

/** Grelha só para `vision_ai_analysis` (Gemini): 1 foto ou 2×2 (4 fotos). */
function getVisionAnalysisGridLayout(field: any): { key: VisionAnalysisGridKey; cols: number; rows: number; count: number } {
  if (effectiveSchemaFieldType(field) !== 'vision_ai_analysis') {
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
  'technician_finance',
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

/**
 * HTML mostrado no bloco Leitura: valor em `responses` (ex.: regra «Definir valor»)
 * substitui o `contentHtml` estático do schema. Texto sem tags vira um `<p>` com entidades escapadas.
 */
function effectiveLeituraContentHtml(responseVal: unknown, schemaContentHtml?: string): string | undefined {
  const trimmed = responseVal == null ? '' : String(responseVal).trim();
  if (trimmed) {
    if (/[<>]/.test(trimmed)) return trimmed;
    const escaped = trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<p>${escaped}</p>`;
  }
  return schemaContentHtml;
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
  if (t === 'photo' || t === 'photo_stamped' || t === 'facial_recognition' || t === 'file_upload') {
    return 'Mídia ou anexo registado (ver relatório completo)';
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
    const n = parseJsonMatrixRows(raw).length;
    return n ? `${n} linha(s) na matriz` : '—';
  }
  if (isVisionSimNaoMediaFieldType(t)) {
    const o = parseVisionChecklistStored(raw);
    if (!o) return '—';
    if (isVisionPendingAnalysisRecord(o) && visionStoredHasRunnableMedia(fieldDef, o)) {
      return 'Mídia registada — análise IA pendente (envio automático com rede)';
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
    if (s.startsWith('SIG_V1|')) return 'Assinatura registada';
    return s.trim() ? 'Assinatura registada' : '—';
  }
  if (t === 'location_pick' || t === 'geofence_check') {
    try {
      const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (j && typeof j === 'object') {
        const addr = (j as any).address || (j as any).addr || (j as any).formattedAddress;
        if (addr) return String(addr);
      }
    } catch {
      /* ignore */
    }
    return 'Registo de localização';
  }
  if (t === 'materials_consumption' || t === 'materials_receipt') {
    const p = parseMaterialsValue(raw);
    const n = p.lines.filter((l) => l.qty > 0).length;
    return `${n} linha(s) de materiais`;
  }
  if (t === 'technician_finance') {
    const p = parseTechnicianFinanceValue(raw);
    const n = p.lines.filter((l) => l.amount > 0).length;
    return `${n} lançamento(s) financeiros`;
  }
  if (t === 'voice_note') {
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s) return '—';
      try {
        const j = JSON.parse(s);
        const tr = j && typeof j === 'object' ? String((j as any).transcript || '').trim() : '';
        return tr || '—';
      } catch {
        return s;
      }
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const tr = String((raw as any).transcript || '').trim();
      return tr || '—';
    }
    return '—';
  }
  if (t === 'transit_start' || t === 'transit_end') {
    return 'Registo de deslocamento';
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
      if (!isVisionPendingAnalysisRecord(o) || !visionStoredHasRunnableMedia(f, o)) return null;
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
    ? 'RECONHECIMENTO FACIAL — VÁLIDO'
    : pending
      ? 'RECONHECIMENTO FACIAL — PENDENTE'
      : 'RECONHECIMENTO FACIAL — NÃO VALIDADO';

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
  if (ft === 'leitura') return true;
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
        const mode = String(field?.geofenceFailMode || 'block').toLowerCase();
        if (mode === 'warn' && j?.geofence?.validated === true) return true;
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
    if (ft === 'materials_consumption' || ft === 'materials_receipt') {
      const p = parseMaterialsValue(raw);
      const hasQty = p.lines.some((l) => l.qty > 0);
      if (field.required) return hasQty;
      return true;
    }
    if (ft === 'technician_finance') {
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

/** Destino para OSRM: raiz da execução ou primeiro ponto do polígono/rota */
function getDestFromTaskLike(task: any): { lat: number; lng: number } | null {
  if (!task || typeof task !== 'object') return null;
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

/** Geometria na OS suficiente para o mapa de cerca global (ponto, polígono, trecho ou rota). */
function taskHasServiceLocationForGlobalGate(t: any): boolean {
  if (!t || typeof t !== 'object') return false;
  const lat = t.locationLat;
  const lng = t.locationLng;
  if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return true;
  }
  if (t.locationPolygon == null) return false;
  try {
    const parsed =
      typeof t.locationPolygon === 'string' ? JSON.parse(t.locationPolygon) : t.locationPolygon;
    return Array.isArray(parsed) && parsed.length >= 2;
  } catch {
    return false;
  }
}

/**
 * Clona a OS para o GeofenceMapScreen com `locationRadius` = raio global (tolerância única da cerca global).
 * Rota/trecho: o ecrã de mapa não bloqueia fora da linha em modo `route`; para a cerca global usamos disco
 * no ponto de referência (início da rota ou meio do trecho) para o bloqueio fazer efeito.
 */
function buildGlobalGeofenceMapTask(task: any, globalRadiusMeters: number): any {
  const r = clampGlobalGeofenceRadiusMeters(globalRadiusMeters);
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

  if (zone === 'route' && Array.isArray(poly) && poly.length >= 1) {
    const lat0 = Number(poly[0][0]);
    const lng0 = Number(poly[0][1]);
    if (Number.isFinite(lat0) && Number.isFinite(lng0)) {
      return {
        ...task,
        locationLat: lat0,
        locationLng: lng0,
        locationZoneType: 'radius',
        locationRadius: r,
        locationPolygon: null,
      };
    }
  }
  if (zone === 'segment' && Array.isArray(poly) && poly.length >= 2) {
    const a0 = Number(poly[0][0]);
    const a1 = Number(poly[0][1]);
    const b0 = Number(poly[1][0]);
    const b1 = Number(poly[1][1]);
    if ([a0, a1, b0, b1].every((x) => Number.isFinite(x))) {
      return {
        ...task,
        locationLat: (a0 + b0) / 2,
        locationLng: (a1 + b1) / 2,
        locationZoneType: 'radius',
        locationRadius: r,
        locationPolygon: null,
      };
    }
  }

  if (zone === 'polygon' && Array.isArray(poly) && poly.length >= 3) {
    return { ...task, locationRadius: r, locationZoneType: 'polygon' };
  }

  return { ...task, locationRadius: r, locationZoneType: 'radius' };
}

export default function ChecklistEngine() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id, taskId, routineTask, rtNumber } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
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
  const currentTaskRef = useRef<any>(null);
  const [geoMapChecked, setGeoMapChecked]   = useState(false);
  const [geofenceFailMode, setGeofenceFailMode] = useState<'block'|'warn'>('warn');
  
  // Scanner Modal & Virtual Camera State
  
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
  const [savingSignature, setSavingSignature] = useState(false);
  const [currentSigField, setCurrentSigField] = useState<string|null>(null);
  const [currentSigScope, setCurrentSigScope] = useState<SectionRepeatScope | null>(null);
  const [currentStrokeState, setCurrentStrokeState] = useState<string>('');
  const currentStrokeRef = React.useRef<string>('');
  const [completedStrokes, setCompletedStrokes] = useState<string[]>([]);

  const resolvedTaskId =
    typeof taskId === 'string' ? taskId : Array.isArray(taskId) ? taskId[0] : String(taskId || '');

  const resolvedRtNumber =
    typeof rtNumber === 'string'
      ? rtNumber
      : Array.isArray(rtNumber)
        ? String(rtNumber[0] || '')
        : String(rtNumber || '');
  const routineTaskFlag =
    String(Array.isArray(routineTask) ? routineTask[0] : routineTask || '') === '1';
  const isRoutineTaskFlow = routineTaskFlag && !!resolvedTaskId;

  const [ruleTick, setRuleTick] = useState(0);
  const fgSegmentStartRef = useRef<number | null>(null);
  /** Próximo número de revisão a enviar em POST /executions (lastSubmittedRevision + 1). */
  const nextSubmissionRevisionRef = useRef(1);
  /** Pausa de sessão ou pausa imposta pelo servidor — não contar tempo em foco. */
  const timersFrozenRef = useRef(false);

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

  useEffect(() => {
    const frozen = !!(serverPausedExecution || responses.__form_paused_since);
    timersFrozenRef.current = frozen;
    if (frozen) fgSegmentStartRef.current = null;
  }, [serverPausedExecution, responses.__form_paused_since]);

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

  // --- Location handler (Transit + Geofence) ---
  // --- Tracking Link ──────────────────────────────────────────────
  const generateTrackingLink = async () => {
    if (!taskId) return;
    try {
      const res = await apiFetch(`/api/tracking/start/${taskId}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.url) setTrackingUrl(data.url);
    } catch (e) {
      console.warn('[tracking] could not generate link', e);
    }
  };

  const endTrackingLink = async () => {
    if (!taskId) return;
    try { await apiFetch(`/api/tracking/end/${taskId}`, { method: 'POST' }); }
    catch(e) { console.warn('[tracking] could not end link', e); }
  };
  // ───────────────────────────────────────────────────

  const handleTransit = async (
    fieldId: string,
    label: string,
    traversedPath?: number[][],
    scope?: SectionRepeatScope | null
  ) => {
    if (serverPausedExecution || responses.__form_paused_since) {
      Alert.alert(t('common.attention'), t('pause.pausedTitle'));
      return;
    }
    if (gpsCaptureLockRef.current) return;
    gpsCaptureLockRef.current = true;
    setGpsBusyFieldId(fieldId);
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
        // Resolve the field config for fail mode / error message / radius override
        const geoField = template?.schemaData?.find((f: any) => f.id === fieldId);
        const failMode: string = geoField?.geofenceFailMode || 'block';
        const customMsg: string = geoField?.geofenceErrorMsg || '';
        const fieldRadius: number = parseInt(geoField?.geofenceRadius) || 150;
        const zoneType: string = geoField?.geofenceType || 'radius';

        // Load task location from cloudTasks cache
        let taskLocation: any = null;
        try {
          const thisTask = await findCloudTaskById(String(taskId));
          if (thisTask) taskLocation = thisTask;
        } catch (e) {}

        if (!taskLocation || (!taskLocation.locationLat && !taskLocation.locationPolygon)) {
          // No location on task — just record GPS evidence, do NOT block
          const payload = { action: label, timestamp: new Date().toISOString(), coordinates: { lat, lng }, address, geofence: { validated: false, reason: 'NO_TASK_LOCATION' } };
          handleInput(fieldId, JSON.stringify(payload), scope);
          Alert.alert("⚠️ Localização Registrada", `GPS capturado com sucesso.\n\n📍 ${address}\n\nEsta OS não possui zona de geofencing definida — nenhuma validação aplicada.`);
          return;
        }

        let insideZone = false;
        let distanceMeters: number | null = null;
        let requiredMeters: number | null = null;

        if (zoneType === 'polygon' && taskLocation.locationPolygon) {
          // Ray-casting para polígono
          const polygon: number[][] = typeof taskLocation.locationPolygon === 'string'
            ? JSON.parse(taskLocation.locationPolygon)
            : taskLocation.locationPolygon;
          insideZone = pointInPolygon(lat, lng, polygon);
        } else if (taskLocation.locationLat && taskLocation.locationLng) {
          // Haversine para ponto + raio
          const destLat = parseFloat(taskLocation.locationLat);
          const destLng = parseFloat(taskLocation.locationLng);
          const effectiveRadius = taskLocation.locationRadius || fieldRadius;
          distanceMeters = Math.round(haversineDistance(lat, lng, destLat, destLng));
          requiredMeters = effectiveRadius;
          insideZone = distanceMeters <= effectiveRadius;
        }

        const evidencePayload: any = {
          action: label,
          timestamp: new Date().toISOString(),
          coordinates: { lat, lng },
          address,
          geofence: {
            validated: true,
            mode: failMode,
            insideZone,
            distanceMeters,
            requiredMeters,
            zoneType
          }
        };

        handleInput(fieldId, JSON.stringify(evidencePayload), scope);

        if (insideZone) {
          const distMsg = distanceMeters !== null ? `\n📏 Distância: ${distanceMeters}m (raio: ${requiredMeters}m)` : '';
          Alert.alert("✅ Cerca Eletrônica: APROVADO", `Você está dentro da zona de serviço autorizada.${distMsg}\n\n📍 ${address}`);
        } else {
          const distMsg = distanceMeters !== null
            ? `\n📏 Você está a ${distanceMeters}m do local (máx. ${requiredMeters}m).`
            : '\nVocê está fora do polígono de serviço.';
          const errorMsg = customMsg || `Acesso negado: fora da área de serviço autorizada.${distMsg}`;

          if (failMode === 'block') {
            // Remove a resposta para bloquear o avanço
            handleInput(fieldId, '', scope);
            Alert.alert("🚫 Cerca Eletrônica: BLOQUEADO", `${errorMsg}\n\n📍 Sua posição: ${address}`);
          } else {
            // Modo warn: registra desvio mas permite continuar
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

      /** Métricas de rota (OSRM) e morada exacta: em segundo plano após gravar o GPS (ver IIFE no fim). */

      if (label === 'CHEGADA') {
        try {
          const startField = template?.schemaData?.find((f: any) => f.type === 'transit_start');
          const startRaw =
            startField != null ? getScopedFieldValue(responses, scope ?? null, startField.id) : undefined;
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

          if (currentTask?.locationZoneType === 'route') {
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
      
      // Auto-encerrar o public link se for evento de CHEGADA
      if (label === 'CHEGADA') {
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
            `O trecho de deslocamento foi encerrado (não indica chegada ao local de serviço).${tailMoradaAsync}`
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
          if (label === 'SAIDA') {
            try {
              const task = currentTaskRef.current;
              const routeCoords = buildRouteCoordsFromTask(task);
              const tl = getDestFromTaskLike(task);
              const dest = pickDestinationForOsrm(
                tl ? { lat: tl.lat, lng: tl.lng } : {},
                routeCoords
              );
              if (dest) {
                const osrm = await fetchDrivingLegMetrics(lat, lng, dest.lat, dest.lng);
                const straightDist = Math.round(haversineMeters(lat, lng, dest.lat, dest.lng));
                if (osrm.ok && osrm.durationSeconds != null) {
                  const dm =
                    osrm.distanceMeters != null && Number.isFinite(osrm.distanceMeters)
                      ? Math.round(osrm.distanceMeters)
                      : straightDist;
                  plannedMetrics = {
                    durationSeconds: Math.round(osrm.durationSeconds),
                    distanceMeters: dm,
                    source: 'osrm',
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



    // Sincronização passiva do Kanban (Ping)
  const notifyKanbanStatus = async (status: 'ACCEPTED' | 'IN_PROGRESS') => {
      if (!taskId) return;
      try {
          const key = `@brspark_notified_${taskId}_${status}`;
          if (await AsyncStorage.getItem(key)) return;
          
          const ts = new Date().toISOString();
          
          // Gravação local forte para garantir que vai no payload final caso o ping falhe
          try {
            await patchCloudTaskById(String(taskId), (row) => {
              const meta = { ...(row.metadata || {}), ...(status === 'ACCEPTED' ? { acceptedAt: ts } : {}) };
              return { ...row, metadata: meta };
            });
          } catch (err) {}

          apiFetch(`/api/checklists/executions/${taskId}/status`, {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ status, timestamp: ts })
          }).then(() => AsyncStorage.setItem(key, 'true')).catch(() => {});
      } catch(e) {}
  };

  useEffect(() => {
      if (taskId && !isReadOnly) {
         notifyKanbanStatus('ACCEPTED');
         // Técnico aceitou a OS — GPS no modo leve (aguardando saída)
         AsyncStorage.getItem('@brspark_email').then(email => {
           dataCollectionService.setState('DISPATCHED', {
             executionId: String(taskId),
             ownerEmail: email || 'unknown',
           }).catch(() => {});
         });
      }
  }, [taskId, isReadOnly]);

  // Ao focar a OS, reassocia executionId aos heartbeats (link público usa telemetria por OS).
  useFocusEffect(
    useCallback(() => {
      if (!taskId || isReadOnly) return undefined;
      let cancelled = false;
      AsyncStorage.getItem('@brspark_email').then((email) => {
        if (!cancelled) {
          dataCollectionService.syncExecutionContext(String(taskId), email || undefined);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [taskId, isReadOnly])
  );

  // Sincronização em tempo real das respostas (Debounced)
  useEffect(() => {
     if (isReadOnly || !taskId || Object.keys(responses).length === 0) return;
     
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
         apiFetch(`/api/checklists/executions/${taskId}/status`, {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(body)
         }).catch(() => {});
     }, 2000); // 2 second debounce
     
     return () => clearTimeout(timeoutId);
  }, [responses, taskId, isReadOnly]);


  // Poller to update ETA em tempo real + estado dedicado (mapEtaMinutes) para o badge não depender só de currentTask
  useEffect(() => {
    if (!resolvedTaskId || isReadOnly) return;

    const fetchLocalOsrmEtaMinutes = async (
      destLat: number,
      destLng: number
    ): Promise<number | null> => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return null;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const oLng = pos.coords.longitude;
        const oLat = pos.coords.latitude;
        const res = await fetchDrivingLegEtaMinutes(oLat, oLng, destLat, destLng);
        return res.ok && res.minutes != null ? res.minutes : null;
      } catch {
        return null;
      }
    };

    const persistEta = async (cloudTasks: any[], minutes: number) => {
      const updatedTasks = cloudTasks.map((t: any) =>
        String(t.id) === String(resolvedTaskId) ? { ...t, etaMinutes: minutes } : t
      );
      await savePartitionedFromUnifiedList(updatedTasks);
    };

    const fetchEta = async () => {
      try {
        let cloudTasks: any[] = [];
        try {
          cloudTasks = await loadAllCloudTasksForExecutionLookup();
        } catch {
          cloudTasks = [];
        }

        const cachedTask = cloudTasks.find((t: any) => String(t.id) === String(resolvedTaskId));
        const cachedNorm = normalizeEtaMinutes(cachedTask?.etaMinutes);
        if (cachedNorm !== null) {
          setMapEtaMinutes(cachedNorm);
          setCurrentTask((prev: any) => {
            if (!prev || prev.etaMinutes === cachedNorm) return prev;
            return { ...prev, etaMinutes: cachedNorm };
          });
        }

        const destFallback =
          getDestFromTaskLike(cachedTask || {}) ||
          getDestFromTaskLike(currentTaskRef.current || {});

        const res = await apiFetch(`/api/checklists/executions/${resolvedTaskId}`);
        if (!res.ok) {
          if (destFallback) {
            const localEta = await fetchLocalOsrmEtaMinutes(destFallback.lat, destFallback.lng);
            const n = normalizeEtaMinutes(localEta);
            if (n !== null) {
              setMapEtaMinutes(n);
              await persistEta(cloudTasks, n);
            }
          }
          return;
        }

        const data: any = await res.json();

        const tUrl =
          data?.trackingUrl ??
          (data?.metadata && typeof data.metadata === 'object' ? data.metadata.trackingUrl : null);
        if (tUrl) setTrackingUrl(String(tUrl));

        let finalEta = normalizeEtaMinutes(data?.etaMinutes);
        const dest =
          getDestFromTaskLike(data) || destFallback || getDestFromTaskLike(currentTaskRef.current || {});

        if (finalEta === null && dest) {
          const localEta = await fetchLocalOsrmEtaMinutes(dest.lat, dest.lng);
          finalEta = normalizeEtaMinutes(localEta);
        }

        if (finalEta !== null) {
          await persistEta(cloudTasks, finalEta);
          setMapEtaMinutes(finalEta);
          setCurrentTask((prev: any) => (prev ? { ...prev, etaMinutes: finalEta } : prev));
        }
      } catch {
        const dest = getDestFromTaskLike(currentTaskRef.current || {});
        if (dest) {
          const localEta = await fetchLocalOsrmEtaMinutes(dest.lat, dest.lng);
          const n = normalizeEtaMinutes(localEta);
          if (n !== null) setMapEtaMinutes(n);
        }
      }
    };

    fetchEta();
    const interval = setInterval(fetchEta, 15000);
    return () => clearInterval(interval);
  }, [resolvedTaskId, isReadOnly]);


  useEffect(() => {
    loadTemplate();
    // Stop route tracking when leaving the checklist
    return () => { routeTracker.stop().catch(() => {}); };
  }, [id, resolvedTaskId]);

  const loadTemplate = async () => {
    try {
      setShowGlobalGeofenceMap(false);
      setGlobalGeofenceMapTask(null);
      pendingGlobalGeofenceAfterRouteRef.current = false;

      const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
      let execs = [];
      try { execs = JSON.parse(executedStr); } catch(e){}
      if (!Array.isArray(execs)) execs = [];

      /** Cache da execução (GET) — inclui `status`; não depender só da lista de concluídas (pode expirar aos 30 dias). */
      const execStrEarly = taskId ? await AsyncStorage.getItem(`@brspark_execution_${taskId}`) : null;
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
        taskId && execs.some((e) => (typeof e === 'string' ? e : e.id) === String(taskId)),
      );
      let cloudTaskTerminal = false;
      if (taskId) {
        try {
          const ct = await findCloudTaskById(String(taskId));
          if (ct && executionIsViewOnly(ct)) cloudTaskTerminal = true;
        } catch {
          /* ignore */
        }
      }
      const isCompleted = Boolean(taskId && (inExecutedList || snapshotIsTerminal || cloudTaskTerminal));
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
        const outboxMatch = outbox.find((o: any) => String(o.taskId) === String(taskId));

        if (outboxMatch) {
          initialRes = outboxMatch.responses || {};
          if (outboxMatch.templateId) realTemplateId = String(outboxMatch.templateId);
        } else {
          if (execStr) {
            applyLocalExecutionCache(execStr);
          }

          let blockedWithoutCache = false;
          if (cacheStale) {
            try {
              const res = await apiFetch(`/api/checklists/executions/${taskId}`);
              if (res.ok) {
                const remoteExec = await res.json();
                const serverOnlyRes =
                  remoteExec.responses &&
                  typeof remoteExec.responses === 'object' &&
                  !Array.isArray(remoteExec.responses)
                    ? remoteExec.responses
                    : {};
                if (remoteExec.templateId) realTemplateId = String(remoteExec.templateId);
                lastSubmittedRevForNext = Math.max(
                  lastSubmittedRevForNext,
                  Number(remoteExec.lastSubmittedRevision) || 0
                );
                initialRes = serverOnlyRes;
                if (!executionIsViewOnly(remoteExec)) {
                  readOnlyMode = false;
                  const rm = remoteExec.metadata;
                  if (rm && typeof rm === 'object') {
                    if (metaRevisionVisitContext(rm)) reopenRevisionPending = true;
                    if (rm.lastPauseAt) remotePausedMeta.lastPauseAt = String(rm.lastPauseAt);
                    if (rm.lastPauseReasonSummary)
                      remotePausedMeta.lastPauseReasonSummary = String(rm.lastPauseReasonSummary);
                  }
                  if (remoteExec.status === 'PAUSED') serverPausedFlag = true;
                  const draftKeyRv = `@draft_tsk_${taskId}`;
                  const dstrRv = await AsyncStorage.getItem(draftKeyRv);
                  let dmergeRv: Record<string, unknown> = {};
                  try {
                    dmergeRv = dstrRv ? JSON.parse(dstrRv) : {};
                    if (!dmergeRv || typeof dmergeRv !== 'object' || Array.isArray(dmergeRv)) dmergeRv = {};
                  } catch {
                    dmergeRv = {};
                  }
                  initialRes = { ...serverOnlyRes, ...dmergeRv };
                }
                const ts = Date.now();
                const cachePayload = {
                  ...remoteExec,
                  responses: serverOnlyRes,
                  _cacheTime: ts,
                  _technicianViewDownloadAt: ts,
                };
                await AsyncStorage.setItem(`@brspark_execution_${taskId}`, JSON.stringify(cachePayload));
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
        if (taskId && !outboxMatch && readOnlyMode) {
          try {
            const resRv = await apiFetch(`/api/checklists/executions/${taskId}`);
            if (resRv.ok) {
              const remoteExec = await resRv.json();
              const serverOnlyRes =
                remoteExec.responses &&
                typeof remoteExec.responses === 'object' &&
                !Array.isArray(remoteExec.responses)
                  ? remoteExec.responses
                  : {};
              if (remoteExec.templateId) realTemplateId = String(remoteExec.templateId);
              lastSubmittedRevForNext = Math.max(
                lastSubmittedRevForNext,
                Number(remoteExec.lastSubmittedRevision) || 0
              );
              if (!executionIsViewOnly(remoteExec)) {
                readOnlyMode = false;
                const rm = remoteExec.metadata;
                if (rm && typeof rm === 'object') {
                  if (metaRevisionVisitContext(rm)) reopenRevisionPending = true;
                  if (rm.lastPauseAt) remotePausedMeta.lastPauseAt = String(rm.lastPauseAt);
                  if (rm.lastPauseReasonSummary)
                    remotePausedMeta.lastPauseReasonSummary = String(rm.lastPauseReasonSummary);
                }
                if (remoteExec.status === 'PAUSED') serverPausedFlag = true;
                const draftKeyRv = `@draft_tsk_${taskId}`;
                const dstrRv = await AsyncStorage.getItem(draftKeyRv);
                let dmergeRv: Record<string, unknown> = {};
                try {
                  dmergeRv = dstrRv ? JSON.parse(dstrRv) : {};
                  if (!dmergeRv || typeof dmergeRv !== 'object' || Array.isArray(dmergeRv)) dmergeRv = {};
                } catch {
                  dmergeRv = {};
                }
                initialRes = { ...serverOnlyRes, ...dmergeRv };
              } else {
                initialRes = serverOnlyRes;
              }
              const tsRv = Date.now();
              await AsyncStorage.setItem(
                `@brspark_execution_${taskId}`,
                JSON.stringify({
                  ...remoteExec,
                  responses: serverOnlyRes,
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

         const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
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
         if (taskId) {
           let ctEarly: any = null;
           try {
             try {
               const allEarly = await loadAllCloudTasksForExecutionLookup();
               ctEarly = allEarly.find((t: any) => String(t.id) === String(taskId));
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
             const res = await apiFetch(`/api/checklists/executions/${taskId}`);
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
                 initialRes = { ...serverR, ...draftRes };
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
                 const execStr = await AsyncStorage.getItem(`@brspark_execution_${taskId}`);
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

           if (lastSubmittedRevForNext === 0 && taskId) {
             try {
               const execStr = await AsyncStorage.getItem(`@brspark_execution_${taskId}`);
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

      // Rascunho local guardava o texto aplicado por «Definir valor» na Leitura — reaparecia ao abrir antes do gatilho.
      if (!readOnlyMode && Array.isArray(tmpl.schemaData)) {
        const { out: resSemLeitura, changed: leituraDraftSanitized } = stripLeituraKeysFromResponsesCopy(
          initialRes,
          tmpl.schemaData
        );
        if (leituraDraftSanitized) {
          initialRes = resSemLeitura;
          const draftKeySan = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
          try {
            await AsyncStorage.setItem(draftKeySan, JSON.stringify(initialRes));
          } catch {
            /* ignore */
          }
        }
      }

      // Nova visita de revisão explícita (metadata): zerar cronômetros e limpar assinatura/deslocamento/geofence dessa sessão.
      // NÃO usar "rascunho vazio + rev≥1 + marcadores no servidor" — apagava transit_start/end em execuções ainda ativas
      // (ex.: PATCH atrasado, outro dispositivo, cache) e o relatório ficava sem deslocamento.
      if (taskId && !readOnlyMode && reopenRevisionPending) {
        stripFormProductivityTimerFields(initialRes, tmpl.schemaData);
        stripRevisionSessionFieldResponses(initialRes, tmpl.schemaData);
        void routeTracker.stop().catch(() => {});
        try {
          await AsyncStorage.setItem(`@draft_tsk_${taskId}`, JSON.stringify(initialRes));
        } catch {}
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
        'technician_finance',
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

      if (taskId && !readOnlyMode) {
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
          const match = outbox.find((o: any) => o.taskId === taskId);
          const obRev = match?.metadata?.submissionRevision;
          if (Number.isFinite(Number(obRev)) && Number(obRev) > 0) {
            nextRev = Number(obRev);
          }
        } catch {}
        nextSubmissionRevisionRef.current = nextRev;
      } else if (!taskId) {
        nextSubmissionRevisionRef.current = 1;
      }

      if (taskId && !readOnlyMode && serverPausedFlag && !initialRes.__form_paused_since) {
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
      setServerPausedExecution(!readOnlyMode && !!taskId && serverPausedFlag);
      if (initialRes.__form_started_at) {
        setStartTime(new Date(initialRes.__form_started_at).getTime());
      } else {
        setStartTime(Date.now());
      }

      // ── Opção B: mapa rota/trecho + cerca global do template (raio em settings) ──────
      const wantGlobalFence =
        !!tmpl?.settings?.requireGlobalGeofence && !!taskId && !readOnlyMode && !isRoutineTaskFlow;
      const globalRad = clampGlobalGeofenceRadiusMeters(tmpl?.settings?.globalGeofenceRadius);
      globalGeofenceRadiusForNextGateRef.current = globalRad;

      if (taskId && !readOnlyMode) {
        try {
          let thisTask = await findCloudTaskById(String(taskId));
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
          console.log('[GeoMap] taskId=', taskId, '| task found=', !!thisTask, '| locationZoneType=', thisTask?.locationZoneType);
          if (thisTask) {
            setCurrentTask(thisTask);
            const geoField = tmpl.schemaData?.find((f: any) => f.type === 'geofence_check');
            const fm = geoField?.geofenceFailMode || 'warn';
            setGeofenceFailMode(fm as 'block' | 'warn');

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
        console.log('[GeoMap] sem taskId ou readOnly — taskId=', taskId, 'readOnlyMode=', readOnlyMode);
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

  const applyMask = (rawValue: string, mask?: string) => {
    if (!mask) return rawValue;
    const clean = String(rawValue).replace(/[^A-Za-z0-9]/g, '');
    let result = '';
    let cleanIdx = 0;
    for (let i = 0; i < mask.length; i++) {
        if (cleanIdx >= clean.length) break;
        if (mask[i] === '#') {
           result += clean[cleanIdx];
           cleanIdx++;
        } else {
           result += mask[i];
        }
    }
    return result;
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
    await enqueueExecutionStatusPatch(resolvedTaskId, {
      status: 'IN_PROGRESS',
      timestamp: ts,
      metadata: { executionPaused: false, lastResumedAt: ts },
    });
    await updateLocalCloudTaskFields(resolvedTaskId, {
      status: 'IN_PROGRESS',
      metadata: { executionPaused: false, lastResumedAt: ts },
    });
    setServerPausedExecution(false);
    fgSegmentStartRef.current = Date.now();
  }, [resolvedTaskId, updateLocalCloudTaskFields]);

  const confirmStartPause = (cat: PauseCategoryDef, subId: string, detail: string) => {
    const sub = cat.subs.find((s) => s.id === subId);
    if (!sub) return;
    if (sub.requiresDetail && detail.trim().length < PAUSE_DETAIL_MIN_LEN) {
      Alert.alert(t('common.attention'), t('pause.validationDetail'));
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
    setPauseReasonModalVisible(false);
    setPausePickerStep('category');
    setPauseSelectedCategory(null);
    setPauseDetailDraft('');
    setPauseHighlightSubId(null);
  };

  const resumeFromPauseOverlay = () => {
    const endedAt = new Date().toISOString();
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
      return next;
    });
    void routeTracker.resume();
    fgSegmentStartRef.current = Date.now();
    if (resolvedTaskId) {
      void (async () => {
        await enqueueExecutionStatusPatch(resolvedTaskId, {
          status: 'IN_PROGRESS',
          timestamp: endedAt,
          metadata: { executionPaused: false, lastResumedAt: endedAt },
        });
        await updateLocalCloudTaskFields(resolvedTaskId, {
          status: 'IN_PROGRESS',
          metadata: { executionPaused: false, lastResumedAt: endedAt },
        });
        setServerPausedExecution(false);
      })();
    } else {
      setServerPausedExecution(false);
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
    if (!taskId || isReadOnly) return undefined;
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
    taskId,
    isReadOnly,
    responses.__form_paused_since,
    applyPauseExitAndThen,
    router,
    promptPauseExit,
  ]);

  const handleInput = (fieldId: string, value: any, scope?: SectionRepeatScope | null) => {
    if (isReadOnly) return;

    const isMetaField = fieldId.startsWith('__');
    const fieldDef = !isMetaField ? template?.schemaData?.find((f: any) => f.id === fieldId) : null;
    const isTransitField =
      fieldDef &&
      (fieldDef.type === 'transit_start' || fieldDef.type === 'transit_end');
    if (serverPausedExecution && !isTransitField) return;
    if (responses.__form_paused_since && !isTransitField) return;

    let stored = value;
    if (fieldDef && fieldAllowsMultiple(fieldDef) && (value === null || value === '')) {
      stored = [];
    }

    const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;

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
        hi0(
          field.id,
          {
            ...ext,
            status: VISION_STATUS_PENDING_ANALYSIS,
            localUri: assetUri,
            mediaMimeType: mimeType,
            mediaFileName: fileName,
            pendingSince: new Date().toISOString(),
          },
          scope,
        );
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
        const form = new FormData();
        form.append(
          'engine',
          field.type === 'vision_ai_analysis' ? 'google_ai_studio' : 'yolo',
        );
        if (
          effectiveSchemaFieldType(field) === 'vision_ai_analysis' &&
          field.visionRating0To10Enabled === true
        ) {
          form.append('visionRating0To10', '1');
        }
        form.append('questions', JSON.stringify(qs));
        form.append('media', {
          uri: assetUri,
          type: mimeType || 'application/octet-stream',
          name: fileName || 'upload.jpg',
        } as any);
        const res = await apiFetch('/api/checklists/vision/analyze', {
          method: 'POST',
          body: form,
          timeoutMs: 180_000,
        });
        visionApiReturned = true;
        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(
            res.status >= 500
              ? 'O servidor devolveu uma resposta inválida (não é JSON). O serviço de visão pode estar em erro — tente mais tarde ou contacte o suporte.'
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
              : 'A resposta do servidor não contém a lista de respostas esperada. Verifique o serviço de visão (integração «Visão IA - YOLO»).',
          );
        }
        const hi = handleInputRef.current;
        const extra =
          opts?.persistExtras && typeof opts.persistExtras === 'object' ? opts.persistExtras : {};
        const merged = {
          ...json,
          localUri: assetUri,
          mediaMimeType: mimeType,
          mediaFileName: fileName,
          ...extra,
        };
        if (typeof hi === 'function') hi(field.id, merged, scope);
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
              ? 'Tempo esgotado ao enviar. A mídia foi guardada — a análise será tentada de novo automaticamente com rede.'
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
    (field: any, scope?: SectionRepeatScope | null) => {
      const raw = getScopedFieldValue(responsesRefForFacial.current, scope ?? null, field.id);
      const o = parseVisionChecklistStored(raw);
      if (!o || !isVisionPendingAnalysisRecord(o) || !visionStoredHasRunnableMedia(field, o)) return;
      const uri = String(o.localUri || '').trim();
      if (!uri) return;
      const mime = String(o.mediaMimeType || 'application/octet-stream');
      const name = String(
        o.mediaFileName || (String(mime).startsWith('video') ? 'video.mp4' : 'foto.jpg'),
      );
      const layout = getVisionAnalysisGridLayout(field);
      const slots = normalizeVisionGridSlotUris(o.gridSlotUris, layout.count);
      void runVisionChecklistAnalyze(
        field,
        uri,
        mime,
        name,
        scope ?? null,
        layout.count > 1 ? { persistExtras: { gridSlotUris: slots } } : undefined,
      );
    },
    [runVisionChecklistAnalyze],
  );

  const openVisionChecklistMedia = (field: any, scope?: SectionRepeatScope | null) => {
    if (isReadOnly) return;
    const qs = getVisionQuestionsFromField(field);
    if (!qs.length) {
      Alert.alert('Modelo', 'Configure o prompt estruturado deste campo no painel.');
      return;
    }
    const gridLayout = getVisionAnalysisGridLayout(field);
    if (effectiveSchemaFieldType(field) === 'vision_ai_analysis' && gridLayout.count > 1) {
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
            pickerOpts.videoMaxDuration = 60;
          }
          const res = await ImagePicker.launchCameraAsync(pickerOpts);
          if (res.canceled || !res.assets?.length) return;
          const a = res.assets[0];
          const mime =
            a.mimeType ||
            (a.type === 'video'
              ? 'video/mp4'
              : a.type === 'image'
                ? 'image/jpeg'
                : 'application/octet-stream');
          const name = a.fileName || (String(mime).startsWith('video') ? 'video.mp4' : 'foto.jpg');
          await runVisionChecklistAnalyze(field, a.uri, mime, name, scope ?? null);
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
          const uri = a.uri;
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
            `O campo «${pendingVisionLabel}» exige análise no servidor antes de concluir. Está sem rede ou a análise ainda não terminou — conecte-se à internet e use «Tentar análise agora» no campo, ou aguarde o envio automático.`,
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
      if (f.type === 'hidden' || f.type === 'technician_finance' || !f.id) continue;
      if (!bySection[curSecKey]) bySection[curSecKey] = [];
      bySection[curSecKey].push(f);
    }
    const validateFlatFields = (fields: any[]) => {
      for (const f of fields) {
        if (!isFieldVisible(f)) continue;
        if (fieldMustAnswerForProgress(f)) {
          const ans = responses[f.id];
          if (!isFieldAnswerFilled(f, ans)) {
            Alert.alert(
              'Atenção',
              f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
                ? `Valide a localização em «${f.label || f.id}» (dentro da área) antes de concluir.`
                : `O campo '${f.label || f.id}' é obrigatório antes de concluir.`,
            );
            return false;
          }
        }
      }
      return true;
    };
    for (const [secKey, fields] of Object.entries(bySection)) {
      if (secKey === '__root__') {
        if (!validateFlatFields(fields)) return;
        continue;
      }
      const sh = sectionHeaders[secKey];
      const repeat = sh && sectionAllowsRepeat(sh);
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
        for (const f of fields) {
          if (!isFieldVisible(f)) continue;
          for (let ri = 0; ri < n; ri++) {
            const ans = rows[ri]?.[f.id];
            if (fieldMustAnswerForProgress(f) && !isFieldAnswerFilled(f, ans)) {
              Alert.alert(
                'Atenção',
                f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
                  ? `Valide a localização em «${f.label || f.id}» (instância ${ri + 1}, dentro da área) antes de concluir.`
                  : `O campo '${f.label || f.id}' (instância ${ri + 1}) é obrigatório antes de concluir.`,
              );
              return;
            }
          }
        }
      } else {
        if (!validateFlatFields(fields)) return;
      }
    }

    setSubmitting(true);
    try {
      // Registrar que a tarefa (OS) foi executada para mover para 'Concluídas'
      if (taskId) {
          const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
          let execs = [];
          try { execs = JSON.parse(executedStr); } catch(e) {}
          if (!Array.isArray(execs)) execs = [];
          
          const existingIdx = execs.findIndex(e => (typeof e === 'string' ? e : e.id) === String(taskId));
          const completedItem = { id: String(taskId), refId: String(id), title: template?.title || 'OS', description: 'OS Concluída com sucesso', completedAt: new Date().toISOString() };
          
          if (existingIdx === -1) {
             execs.push(completedItem);
          } else {
             execs[existingIdx] = completedItem;
          }
          await AsyncStorage.setItem('@brspark_executed_tasks', JSON.stringify(execs));
          
          // Remover status de "Em Andamento" se existia
          const inprogStr = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
          let inprogs = [];
          try { inprogs = JSON.parse(inprogStr); } catch(e) {}
          if (!Array.isArray(inprogs)) inprogs = [];
          
          inprogs = inprogs.filter((t: string) => t !== String(taskId));
          await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(inprogs));

          /** RT/FT: alinhar cache `@brspark_*_cloud_tasks` ao concluir — senão RT fica `IN_PROGRESS` e «Abrir» reutiliza a mesma execução. */
          try {
            await patchCloudTaskById(String(taskId), (row) => ({
              ...row,
              status: 'COMPLETED',
              metadata: { ...(row.metadata || {}), localCompletedAt: new Date().toISOString() },
            }));
          } catch {
            /* ignore */
          }
      }

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
          const origTask = await findCloudTaskById(String(taskId));
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
          taskId: String(taskId || ''),
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
          taskId: String(taskId || ''),
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
          taskId: String(taskId || ''),
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
        taskId: taskId || '',
        ownerEmail: uEmail,
        responses: finalResponses,
        metadata: { 
            ...(origMeta.receivedAt ? { receivedAt: origMeta.receivedAt } : {}),
            ...(origMeta.acceptedAt ? { acceptedAt: origMeta.acceptedAt } : {}),
            submissionRevision: nextSubmissionRevisionRef.current,
            submissionId: newSubmissionId(),
            ...(taskId ? { executionId: String(taskId) } : {}),
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

      const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
      // Salva execução offline completa
      if (taskId) {
         await AsyncStorage.setItem(`@brspark_execution_${taskId}`, JSON.stringify(payload));
      }
      
        console.log("Checklist concluído offline-first. Injetando no Outbox...");
        const outboxStr = await AsyncStorage.getItem('@brspark_outbox') || '[]';
        let outbox = [];
        try { outbox = JSON.parse(outboxStr); } catch(e){}
        if (!Array.isArray(outbox)) outbox = [];
        
        // Evita duplicar no Outbox e injeta
        outbox = outbox.filter(item => item.taskId !== taskId);
        outbox.push(payload);
        
        await AsyncStorage.setItem('@brspark_outbox', JSON.stringify(outbox));
        await AsyncStorage.removeItem(draftKey);
        
        // Aciona explicitamente o Sync Worker em background se possível
        try {
          const { pushSyncQueue } = require('../../src/services/syncService');
          void pushSyncQueue(uEmail).catch(() => {});
        } catch (e) {}

        // Volta ao estado IDLE e dispara cálculo de métricas da OS
        dataCollectionService.setState('IDLE', {
          executionId: String(taskId || ''),
          ownerEmail: uEmail,
        }).catch(() => {});
        // Métricas calculadas em background — não bloqueia navegação
        apiFetch(`/api/metrics/calculate/${taskId}`, { method: 'POST' }).catch(() => {});

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
     if (rules.length === 0) return;

     const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;

     setResponses((prev: any) => {
        if (Object.keys(prev).length === 0) return prev;

        let hasChanges = false;
        const nextResponses = { ...prev };

        rules.forEach((rule: any) => {
           if (evaluateCondition(rule.condFieldId, rule.condOperator, rule.condValue, nextResponses)) {
              rule.actions?.forEach((action: any) => {
                 if (action.type === 'SET_VALUE' && action.targetId) {
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

        if (!hasChanges) return prev;
        void AsyncStorage.setItem(draftKey, JSON.stringify(nextResponses));
        return nextResponses;
     });
  }, [responses, template, ruleTick]);

  const isFieldVisible = (field: any, checkSectionBreak = false) => {
      const visT = effectiveSchemaFieldType(field);
      if (visT === 'section_break' && !checkSectionBreak) return false;
      if (visT === 'hidden') return false;
      /** Custos do técnico: só por API/rascunho/sync — nunca na tela de execução. */
      if (visT === 'technician_finance') return false;
      
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
      if (effectiveSchemaFieldType(field) === 'leitura') return false;
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
    String(field?.geofenceFailMode || 'block').toLowerCase() !== 'warn';

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
  }[] = [];
  let _curFields: any[] = [];
  let _globalIndex = 1;
  let _currentSectionTitle = 'Página 1';
  let _currentSectionId = 'page_1';
  let _currentSectionVisible = true;
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
        });
      }
      _curFields = [];
      _openingSectionBreak = f;
      _currentSectionTitle = f.label || `Página ${rawPages.length + 1}`;
      _currentSectionId = f.id;
      _currentSectionVisible = isFieldVisible(f, true);
    } else if (schT !== 'technician_finance') {
      if (schT === 'leitura') {
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
    });
  }

  const pages = rawPages.filter(p => p.isVisible);

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
      if (f.type === 'hidden' || f.type === 'technician_finance') return;
      buf.push(f);
    });
    flush();
    return steps;
  }, [effectiveFillMode, schema, ruleTick, responses, template]);

  useEffect(() => {
    setCurrentPage(0);
    setWizardIndex(0);
    setHybridInnerWizardIndex(0);
  }, [id, taskId, template?.id]);

  useEffect(() => {
    if (!useSectionHub) {
      setHubPicking(false);
      return;
    }
    setHubPicking(pages.length > 1);
  }, [useSectionHub, pages.length, id, taskId, template?.id]);

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
        if (t === 'leitura') return { ...f, _globalIdx: undefined as number | undefined };
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
      } else if (f.type !== 'hidden' && f.type !== 'technician_finance') {
        pendingFields.push(f);
      }
    }
    emit();
    return chunks;
  }, [effectiveFillMode, template?.schemaData, ruleTick, useSectionHub, isReadOnly]);

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

  const hubSectionSatisfied = (pageIdx: number) => {
    if (effectiveFillMode === 'wizard') {
      const oid = pages[pageIdx]?.openingSectionId || '__preamble__';
      return wizardOpeningSectionComplete(oid);
    }
    return schemaPageFieldsComplete(pageIdx);
  };

  const hubSectionUnlocked = (pageIdx: number) => {
    if (appHubSectionOrder !== 'sequential') return true;
    for (let j = 0; j < pageIdx; j++) {
      if (!hubSectionSatisfied(j)) return false;
    }
    return true;
  };

  const openHubSection = (pageIdx: number) => {
    if (!hubSectionUnlocked(pageIdx)) {
      Alert.alert(
        'Ordem das etapas',
        'Complete as etapas anteriores (campos obrigatórios) antes de abrir esta.'
      );
      return;
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

  // Focus Section Tracking
  useEffect(() => {
    if (effectiveFillMode === 'wizard') return;
    if (useSectionHub && hubPicking) return;
    const currentSectionData = displayPages[currentPage];
    if (
      !currentSectionData ||
      !currentSectionData.id ||
      currentSectionData.id === '__full__' ||
      isReadOnly ||
      Object.keys(responses).length === 0
    ) {
      return;
    }
    const startKey = `__section_start_${currentSectionData.id}`;
    if (!responses[startKey]) {
      setResponses((prev: any) => {
        if (prev[startKey]) return prev;
        const newRes = { ...prev, [startKey]: new Date().toISOString() };
        const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
        AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
        return newRes;
      });
    }
  }, [
    effectiveFillMode,
    currentPage,
    isReadOnly,
    displayPages,
    responses,
    taskId,
    id,
    useSectionHub,
    hubPicking,
  ]);

  /** Referência estável — deve rodar em todo render (não pode ficar após return loading/geo). */
  const liveRouteCoordsForMap = useMemo(
    () => buildRouteCoordsFromTask(currentTask),
    [currentTask?.locationPolygon, currentTask?.locationZoneType],
  );

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

  const handleNextPage = () => {
     const currentPageData = displayPages[currentPage];
     let isValid = true;
     for (const f of currentPageData.fields) {
         if (!isFieldVisible(f)) continue;
         if (fieldMustAnswerForProgress(f)) {
             const ans = responses[f.id];
             if (!isFieldAnswerFilled(f, ans)) {
                 isValid = false;
                 Alert.alert(
                   'Atenção',
                   f.type === 'geofence_check' && geofenceCheckEnforcesProgressGate(f)
                     ? `Valide a localização em «${f.label}» (dentro da área) antes de avançar.`
                     : `O campo '${f.label}' é obrigatório.`,
                 );
                 break;
             }
         }
     }

     if (isValid && currentPage < displayPages.length - 1) {
         if (currentPageData && currentPageData.id && currentPageData.id !== '__full__' && !isReadOnly) {
            const endKey = `__section_end_${currentPageData.id}`;
            const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
            setResponses((prev: any) => {
               const newRes = { ...prev, [endKey]: new Date().toISOString() };
               void AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
               return newRes;
            });
         }
         setCurrentPage(p => p + 1);
         setHybridInnerWizardIndex(0);
     }
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

  void ruleTick;

  const headerPageTitle =
    effectiveFillMode === 'wizard'
      ? template?.title || 'Checklist'
      : currentPageData.pageTitle !== 'Página 1'
        ? currentPageData.pageTitle
        : template?.title || 'Checklist';

  const displayHeaderTitle =
    useSectionHub && hubPicking ? template?.title || 'Checklist' : headerPageTitle;

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
              await runVisionChecklistAnalyze(
                job.field,
                uploadUri,
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
        colors={['#EA580C', '#F97316']}
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
          {useSectionHub && pages.length > 1 && !isReadOnly ? (
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
          <Text style={styles.headerTitle} numberOfLines={2}>
            {displayHeaderTitle}
          </Text>
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
        <View style={{ width: 40, alignItems: 'flex-end' }}>
          {taskId && !isReadOnly && !responses.__form_paused_since ? (
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
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      </LinearGradient>
      
      {/* Opção A: Status bar em tempo real */}
      <GeofenceStatusBar task={currentTask} />

      {/* Opção D: Barra de progresso de rota (visível só para rotas ativas) */}
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

        const endField = schema.find((f: any) => f.type === 'transit_end');
        const startField = schema.find((f: any) => f.type === 'transit_start');

        const startVal =
          startField &&
          findFieldValueInResponses(responses, startField.id, schema);
        const endVal =
          endField && findFieldValueInResponses(responses, endField.id, schema);

        const isTransitFinished = !!endVal;
        const isTransitStarted = !!startVal;
        
        const isVisible = showLiveMap || (isTransitStarted && !isTransitFinished);
        const routeDest = getDestFromTaskLike(currentTask || {});
        const routeEndCoord =
          routeCoords.length > 0
            ? {
                lat: routeCoords[routeCoords.length - 1][0],
                lng: routeCoords[routeCoords.length - 1][1],
              }
            : null;
        const mergedEta = mapEtaMinutes ?? normalizeEtaMinutes(currentTask?.etaMinutes);

        const targetForMap =
          routeDest ||
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

        return <LiveRouteMapCard 
                  route={routeCoords} 
                  visible={isVisible}
                  zoneType={currentTask?.locationZoneType}
                  corridorToleranceM={corridorTol}
                  targetLoc={
                    targetForMap
                      ? { lat: targetForMap.lat, lng: targetForMap.lng }
                      : undefined
                  }
                  etaMinutes={typeof mergedEta === 'number' && Number.isFinite(mergedEta) ? mergedEta : undefined}
                  transitStartedAtIso={transitStartedAtIso}
                  taskId={resolvedTaskId || undefined}
                  endTransitLoading={endField ? gpsBusyFieldId === endField.id : false}
                  onEndTransit={endField ? async () => {
                      const hasValue = !!findFieldValueInResponses(
                        responses,
                        endField.id,
                        template?.schemaData
                      );
                      if (hasValue) return;
                      const path = routeTracker.getTraversedPath();
                      await handleTransit(
                        endField.id,
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingBottom: 12 }]}>
        {isReadOnly && (
            <View style={{backgroundColor: '#EFF6FF', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                <Ionicons name="information-circle" size={24} color="#3B82F6" style={{marginRight: 8}}/>
                <Text style={{flex: 1, color: '#1E3A8A', fontWeight: '600', fontSize: 13}}>Esta OS já foi concluída e os campos estão bloqueados para alteração.</Text>
            </View>
        )}
        <View pointerEvents={isReadOnly ? "none" : "auto"} style={{ gap: 16 }}>
        {useSectionHub && hubPicking && pages.length > 1 ? (
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
              Etapas do formulário
            </Text>
            <Text style={{ fontSize: 13, color: '#64748b', marginTop: -6 }}>
              {appHubSectionOrder === 'sequential'
                ? 'Conclua cada etapa por ordem para desbloquear a seguinte.'
                : 'Toque na etapa que quiser preencher — em qualquer ordem.'}
            </Text>
            {pages.map((pg, idx) => {
              const done = hubSectionSatisfied(idx);
              const unlocked = hubSectionUnlocked(idx);
              return (
                <TouchableOpacity
                  key={String(pg.id || idx)}
                  activeOpacity={0.85}
                  onPress={() => openHubSection(idx)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: done ? '#86efac' : unlocked ? '#e2e8f0' : '#cbd5e1',
                    backgroundColor: unlocked ? '#fff' : '#f8fafc',
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: done ? '#dcfce7' : '#f1f5f9',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {done ? (
                      <Ionicons name="checkmark-circle" size={26} color="#16a34a" />
                    ) : appHubSectionOrder === 'sequential' && !unlocked ? (
                      <Ionicons name="lock-closed-outline" size={22} color="#94a3b8" />
                    ) : (
                      <Text style={{ fontWeight: '800', color: '#64748b' }}>{idx + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }} numberOfLines={2}>
                      {pg.pageTitle || `Etapa ${idx + 1}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      {(pg.fields || []).filter((x: any) => isFieldVisible(x)).length}{' '}
                      campo(s) visível(eis)
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {!(useSectionHub && hubPicking && pages.length > 1)
          ? (() => {
          const renderFieldList = (fields: any[], scope: SectionRepeatScope | null) =>
            fields.map((fieldArg: any) => {
          const effFormT = effectiveSchemaFieldType(fieldArg);
          const field = effFormT ? { ...fieldArg, type: effFormT } : fieldArg;
          const vv = (fid: string) => getScopedFieldValue(responses, scope, fid);
          const hi = (fid: string, v: any) => handleInput(fid, v, scope);
          if (!isFieldVisible(field)) return null;

          const renderFieldIcon = (f: any) => {
            const lib = f.iconLibrary || 'Ionicons';
            const name = f.icon as any;
            const color = f.iconColor || "#0F172A";
            const size = 24;
            switch(lib) {
               case 'AntDesign': return <AntDesign name={name} size={size} color={color} />;
               case 'Entypo': return <Entypo name={name} size={size} color={color} />;
               case 'Feather': return <Feather name={name} size={size} color={color} />;
               case 'FontAwesome': return <FontAwesome name={name} size={size} color={color} />;
               case 'FontAwesome5': return <FontAwesome5 name={name} size={size} color={color} />;
               case 'Foundation': return <Foundation name={name} size={size} color={color} />;
               case 'MaterialIcons': return <MaterialIcons name={name} size={size} color={color} />;
               case 'MaterialCommunityIcons': return <MaterialCommunityIcons name={name} size={size} color={color} />;
               case 'Octicons': return <Octicons name={name} size={size} color={color} />;
               case 'Ionicons':
               default:
                  return <Ionicons name={name} size={size} color={color} />;
            }
          };

          return (
            <View key={field.id} style={[styles.card, { flexDirection: field.icon ? 'row' : 'column', alignItems: field.icon ? 'flex-start' : 'stretch' }]}>
              {field.icon && (
                 <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 2 }}>
                     {renderFieldIcon(field)}
                 </View>
              )}
              <View style={{ flex: 1 }}>
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
                  {field.type !== 'leitura' && isFieldInstructionsVisible(field) ? (
                    <FieldHelpInstructions
                      plainDescription={field.description}
                      helpHtml={field.helpHtml}
                    />
                  ) : null}

                  {field.type === 'leitura' ? (
                    <LeituraBlock contentHtml={effectiveLeituraContentHtml(vv(field.id), field.contentHtml)} />
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
                                editable={validatingFieldId !== field.id}
                                onChangeText={(val) => {
                                  const masked = applyMask(val, field.textMask);
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
                    editable={validatingFieldId !== field.id}
                    onChangeText={(val) => hi(field.id, applyMask(val, field.textMask))}
                    onEndEditing={() => handleApiValidation(field.id)}
                  />
                ))}
              {field.type === 'number' &&
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
                                placeholder="0"
                                keyboardType="numeric"
                                value={String(rowVal ?? '')}
                                editable={validatingFieldId !== field.id}
                                onChangeText={(val) => {
                                  const masked = applyMask(val, field.textMask);
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
                              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>Adicionar valor</Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : (
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={vv(field.id) || ''}
                    editable={validatingFieldId !== field.id}
                    onChangeText={(val) => hi(field.id, applyMask(val, field.textMask))}
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
                 
                 return (
                   <View style={[styles.input, {backgroundColor:'#f5f3ff', borderColor:'#c4b5fd'}]}>
                      <Text style={{color:'#7c3aed', fontFamily:'monospace', fontWeight:'bold'}}>Resultado: {result}</Text>
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
                    const multiGeminiGrid = useGeminiAnalysis && gridLayout.count > 1;
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
                    return (
                      <>
                        {!isReadOnly && !(multiGeminiGrid && !analysisDone) && !pendingAnalysis && (
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
                                        'Visão computacional'
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
                                    Capturar para análise
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
                        )}
                        {!isReadOnly && multiGeminiGrid && !analysisDone ? (
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
                                    backgroundColor: busy ? '#cbd5e1' : '#ea580c',
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
                                {useGeminiAnalysis && !showAiResponseInForm ? (
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
                                    {useGeminiAnalysis &&
                                    effectiveSchemaFieldType(field) === 'vision_ai_analysis' &&
                                    field.visionRating0To10Enabled === true ? (
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
                                          ) : null}
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
                                {pendingAnalysis && !isReadOnly && !multiGeminiGrid ? (
                                  <TouchableOpacity
                                    onPress={() => retryVisionPendingAnalysisField(field, scope)}
                                    disabled={busy}
                                    activeOpacity={0.88}
                                    style={{
                                      marginTop: 10,
                                      paddingVertical: 12,
                                      paddingHorizontal: 14,
                                      borderRadius: 12,
                                      backgroundColor: busy ? '#cbd5e1' : '#ea580c',
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
                    transcribeLanguage={String(field.voiceTranscribeLanguage || 'pt').slice(0, 12)}
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
                               placeholder="Opcional — notas sobre este item…"
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
              {field.type === 'barcode_scan' && (
                <TouchableOpacity style={[styles.cameraBox, {borderColor: '#0284c7', backgroundColor: '#f0f9ff'}]} onPress={() => ensureOnlineValidation(field, () => {
                  Alert.alert("Scanner", "Iniciando Expo Barcode Scanner...");
                })}>
                  <Ionicons name="barcode" size={32} color="#0284c7" />
                  <Text style={[styles.cameraText, {color: '#0284c7'}]}>LER CÓDIGO DO EQUIPAMENTO</Text>
                </TouchableOpacity>
              )}
              {(field.type === 'transit_start' || field.type === 'transit_end') && (() => {
                 let isBlocked = false;
                 if (field.type === 'transit_end') {
                     const startField = template?.schemaData?.find((f: any) => f.type === 'transit_start');
                     const startVal = startField
                       ? getScopedFieldValue(responses, scope, startField.id)
                       : undefined;
                     if (
                       startField &&
                       (!startVal || (typeof startVal === 'string' && startVal.trim() === ''))
                     ) {
                         isBlocked = true;
                     }
                 }
                 
                 const hasValue = !!vv(field.id);
                 const transitEvidence = hasValue ? parseTransitFieldEvidence(vv(field.id)) : null;
                 const transitEvidenceLines = transitEvidence ? formatTransitEvidenceLines(transitEvidence) : [];
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
                           Alert.alert("Atenção", "O Técnico deve primeiro 'Iniciar Deslocamento' antes de finalizá-lo.");
                           return;
                       }
                       if (hasValue) {
                           Alert.alert("Aviso", "Esta ação já foi registrada.");
                           return;
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
                         // Mapa + routeTracker: o LiveRouteMapCard inicia o tracker ao ficar visível (evita corrida com start([]))
                         if (
                           currentTask?.locationZoneType === 'route' ||
                           currentTask?.locationZoneType === 'segment' ||
                           currentTask?.locationZoneType === 'polygon'
                         ) {
                           setShowLiveMap(true);
                         }
                         void generateTrackingLink();
                       } else {
                         lastTransitScopeRef.current = null;
                         dataCollectionService.setState('ARRIVED', {
                           executionId: String(taskId || ''),
                           ownerEmail: email || 'unknown',
                           lat: currentTask?.locationLat ? parseFloat(String(currentTask.locationLat)) : undefined,
                           lng: currentTask?.locationLng ? parseFloat(String(currentTask.locationLng)) : undefined,
                         }).catch(() => {});
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
                     dataCollectionService.setState('IN_SERVICE', {
                       executionId: String(taskId || ''),
                       ownerEmail: email || 'unknown',
                       lat: currentTask?.locationLat ? parseFloat(currentTask.locationLat) : undefined,
                       lng: currentTask?.locationLng ? parseFloat(currentTask.locationLng) : undefined,
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
                            typeof line === 'string' && line.includes('Mídia ou anexo registado');
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

          const draftKLocal = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;

          if (paginatedSectionRepeatEnabled && openingSectionBreakField) {
            const sb = openingSectionBreakField;
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
                            setResponses((prev: any) => {
                              const rows = Array.isArray(prev[rkey]) ? [...prev[rkey]] : [];
                              rows.splice(ri, 1);
                              const nr = { ...prev, [rkey]: rows };
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
                {!isReadOnly && (maxR == null || rs.length < maxR) ? (
                  <TouchableOpacity
                    onPress={() => {
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
                        {!isReadOnly && (maxR == null || rs.length < maxR) ? (
                          <TouchableOpacity
                            onPress={() => {
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
                {!isReadOnly && (maxR == null || rs.length < maxR) ? (
                  <TouchableOpacity
                    onPress={() => {
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
            {currentPageData.id &&
            currentPageData.id !== '__full__' &&
            currentPageData.id !== '__wizard__' ? (
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
            {currentPageData.id &&
            currentPageData.id !== '__full__' &&
            currentPageData.id !== '__wizard__' ? (
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
                      <Text style={styles.submitText}>CONCLUIR OS</Text>
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
              {currentPage > 0 || hybridInnerWizardIndex > 0 ? (
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
                <TouchableOpacity style={styles.navBtnNext} onPress={handleNextPage}>
                  <Text style={styles.navBtnText}>{"Avançar >"}</Text>
                </TouchableOpacity>
              ) : !isReadOnly ? (
                <TouchableOpacity style={styles.submitBtn} onPress={submitExecution} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Text style={styles.submitText}>CONCLUIR OS</Text>
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
              {currentPage > 0 ? (
                <TouchableOpacity style={styles.navBtnPrev} onPress={handleHybridPagePrev}>
                  <Text style={styles.navBtnTextBlack}>{"< Voltar"}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              {currentPage < displayPages.length - 1 ? (
                <TouchableOpacity style={styles.navBtnNext} onPress={handleNextPage}>
                  <Text style={styles.navBtnText}>{"Avançar >"}</Text>
                </TouchableOpacity>
              ) : !isReadOnly ? (
                <TouchableOpacity style={styles.submitBtn} onPress={submitExecution} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Text style={styles.submitText}>CONCLUIR OS</Text>
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

      {/* Modals removed: Tracking modal was removed (handled by backoffice) */}

      <Modal visible={pauseReasonModalVisible} animationType="slide" onRequestClose={() => setPauseReasonModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#EEF2F6' }}>
          <LinearGradient
            colors={['#EA580C', '#F97316']}
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
                  const c = PAUSE_PICKER_CAT_COLOR[cat.id] || C.primary;
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
                    const subAccent = PAUSE_PICKER_CAT_COLOR[pauseSelectedCategory.id] || C.primary;
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
                    colors={['#EA580C', '#DC2626']}
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
                  colors={['#fb923c', '#ea580c', '#dc2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#ea580c',
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
                    borderLeftColor: '#f97316',
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
                  colors={['#f97316', '#ea580c', '#dc2626']}
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
            style={{ backgroundColor: '#f97316', paddingVertical: 18, borderRadius: 16 }}
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
