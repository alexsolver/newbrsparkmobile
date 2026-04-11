/**
 * SyncService — orquestrador de sincronização BrSpark Cloud
 *
 * Estratégia offline-first:
 *   1. Mutações → salvas no AsyncStorage local
 *   2. Ao puxar a tela → push dos dados locais → pull dos dados do servidor
 *   3. Merge inteligente: servidor vence, dados locais-only são preservados
 *
 * Módulos: financeiro, seguros, estoque, vault, mídia, documentos, manutenção
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { apiFetch, getToken } from './auth';
import { 
  getSyncQueue, clearSyncQueueItem, 
  saveStockItemLocal,
  saveStockMovementLocal,
  saveTechStockItemLocal,
  saveTechStockMovementLocal,
  getLocalStockItems,
  getLocalStockMovements,
  getLocalTechStockItems,
  getLocalTechStockMovements,
  getLocalTechFinanceEntries,
  saveTechFinanceEntryLocal,
  getLocalAssetNotesForSync,
  upsertAssetNoteFromSync,
} from '../database';
import { AuthService } from './auth';
import { ensureTechnicianStockLegacyMigration } from './technicianStockMigration';
import { uploadFile } from './storageService';
import { ensureTechFinanceAttachmentsUploaded } from './technicianFinanceAttachmentSync';
import { pushTrackingSyncQueue } from './trackingSyncQueue';

// ── Push fila offline de assets ───────────────────────────────────────────────

let isSyncing = false;

const EXECUTION_STATUS_OUTBOX_KEY = '@brspark_execution_status_outbox';

/** Prefixo das cópias locais do corpo da execução (respostas) — OS concluídas só devem persistir após visualização e com TTL curto. */
const EXECUTION_CACHE_PREFIX = '@brspark_execution_';

/**
 * Tempo máximo que o técnico mantém no aparelho o corpo (respostas) de uma OS já concluída na nuvem,
 * após a última visualização com download bem-sucedido.
 */
export const COMPLETED_BODY_LOCAL_TTL_MS = 2 * 60 * 60 * 1000;

/** Alinhar a `EXEC_VIEW_ONLY_STATUSES` do checklist: só estas execuções são alvo de purge por TTL. */
const TERMINAL_EXEC_CACHE_STATUSES = new Set([
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
 * Remove `@brspark_execution_*` de OS terminais na nuvem quando o download para visualização expirou
 * ou nunca foi marcado (instalações antigas). Preserva: fila de submissão pendente e estados não terminais.
 */
export async function purgeExpiredCompletedExecutionCaches(): Promise<void> {
  try {
    const outboxRaw = await AsyncStorage.getItem('@brspark_outbox');
    let outbox: unknown[] = [];
    try {
      outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
    } catch {
      outbox = [];
    }
    if (!Array.isArray(outbox)) outbox = [];
    const outboxTaskIds = new Set(
      outbox.map((o: any) => (o?.taskId != null ? String(o.taskId) : '')).filter(Boolean)
    );

    const allKeys = await AsyncStorage.getAllKeys();
    const execKeys = allKeys.filter((k) => k.startsWith(EXECUTION_CACHE_PREFIX));
    const now = Date.now();

    for (const key of execKeys) {
      const id = key.slice(EXECUTION_CACHE_PREFIX.length);
      if (!id || outboxTaskIds.has(id)) continue;

      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!obj || typeof obj !== 'object') continue;

      const st = String(obj.status || '').toUpperCase();
      if (!TERMINAL_EXEC_CACHE_STATUSES.has(st)) continue;

      const dl = Number(obj._technicianViewDownloadAt);
      if (!Number.isFinite(dl) || now - dl > COMPLETED_BODY_LOCAL_TTL_MS) {
        await AsyncStorage.removeItem(key);
        console.log(`[SYNC] Cache de corpo concluído removido (expirado ou sem marcação): ${id}`);
      }
    }
  } catch (e) {
    console.warn('[SYNC] purgeExpiredCompletedExecutionCaches:', e);
  }
}

export type ExecutionStatusPatchBody = Record<string, unknown>;

/**
 * PATCH /api/checklists/executions/:taskId/status — tenta já; se falhar, guarda para o próximo pushSyncQueue.
 */
export async function enqueueExecutionStatusPatch(
  taskId: string,
  body: ExecutionStatusPatchBody
): Promise<void> {
  if (!taskId || typeof taskId !== 'string') return;
  try {
    const res = await apiFetch(`/api/checklists/executions/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return;
  } catch {
    /* offline */
  }
  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: unknown[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      arr = [];
    }
    if (!Array.isArray(arr)) arr = [];
    arr.push({ taskId, body, queuedAt: Date.now() });
    await AsyncStorage.setItem(EXECUTION_STATUS_OUTBOX_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('[SYNC] Falha ao enfileirar PATCH de estado da OS:', e);
  }
}

async function pushExecutionStatusOutbox(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    if (!raw) return;
    let arr: { taskId: string; body: ExecutionStatusPatchBody }[] = [];
    try {
      arr = JSON.parse(raw);
    } catch {
      await AsyncStorage.removeItem(EXECUTION_STATUS_OUTBOX_KEY);
      return;
    }
    if (!Array.isArray(arr) || arr.length === 0) return;

    const remaining: typeof arr = [];
    for (const item of arr) {
      if (!item?.taskId || !item.body) continue;
      try {
        const res = await apiFetch(`/api/checklists/executions/${item.taskId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
        });
        if (!res.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(EXECUTION_STATUS_OUTBOX_KEY);
    } else {
      await AsyncStorage.setItem(EXECUTION_STATUS_OUTBOX_KEY, JSON.stringify(remaining));
    }
  } catch (e) {
    console.warn('[SYNC] pushExecutionStatusOutbox:', e);
  }
}

export async function pushSyncQueue(ownerEmail?: string): Promise<void> {
  if (isSyncing) {
    console.log('[SYNC] Sincronização já em andamento, ignorando...');
    return;
  }
  isSyncing = true;
  try {
    // 0. Enviar eventos de telemetria primeiro (dados de coleta)
    await pushTelemetryBatch();

    // 0b. Pausa/retomada do link público (enfileirado offline no mapa ao vivo)
    await pushTrackingSyncQueue();

    // 0c. PATCH de estado de execução (ex.: PAUSED / IN_PROGRESS) enfileirado offline
    await pushExecutionStatusOutbox();

    // 1. Prioridade: Enviar checklists concluídos offline
    await pushChecklistOutbox();

    // 2. Fila genérica
    const queue = getSyncQueue(ownerEmail);
    if (queue.length === 0) return;

    try {
      const res = await apiFetch('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify({ queue }),
        headers: ownerEmail ? { 'x-owner-email': ownerEmail } : {},
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[SYNC] Push de ${data.processed}/${queue.length} itens genéricos concluído.`);
        const processedIds = data.processedIds || [];
        for (const item of queue) {
           if (processedIds.includes((item as any).id || (item as any).payload?.id)) {
             clearSyncQueueItem((item as any).id);
           }
        }
      } else {
        console.warn(`[SYNC] Push genérico não-OK (${res.status}), fila com ${queue.length} itens.`);
      }
    } catch (e) {
      console.warn('[SYNC] Falha de conexão durante o push genérico.', e);
    }
  } finally {
    isSyncing = false;
  }
}

// ── Helpers genéricos ─────────────────────────────────────────────────────────

/** Linhas de secção repetível — mídia aqui estava fora do upload (só a raiz era percorrida). */
const SECTION_REPEAT_KEY_PREFIX = '__section_repeat_';

/** URIs locais que precisam de upload antes do POST da execução (não enviar file:// / content:// ao servidor). */
function isLocalMediaUri(val: unknown): val is string {
  if (typeof val !== 'string' || !val.trim()) return false;
  const base = val.split('?')[0].trim().toLowerCase();
  if (base.startsWith('http://') || base.startsWith('https://')) return false;
  if (base.startsWith('file://')) return true;
  if (base.startsWith('content://')) return true;
  if (base.startsWith('ph://') || base.startsWith('assets-library://')) return true;
  return false;
}

function guessExtFromUri(uri: string): string {
  const pathOnly = uri.split('?')[0];
  const m = pathOnly.match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return 'jpg';
}

/**
 * Garante caminho file:// legível por readAsStringAsync (Android content://, iOS ph://, etc.).
 */
async function ensureUploadableFileUri(uri: string): Promise<string> {
  const withoutQuery = uri.split('?')[0];
  if (withoutQuery.startsWith('file://')) return withoutQuery;
  if (
    withoutQuery.startsWith('content://') ||
    withoutQuery.startsWith('ph://') ||
    withoutQuery.startsWith('assets-library://')
  ) {
    const ext = guessExtFromUri(withoutQuery);
    const dest = `${FileSystem.cacheDirectory}chk_sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    await FileSystem.copyAsync({ from: withoutQuery, to: dest });
    return dest;
  }
  return withoutQuery;
}

/** Reanexa à URL pública os parâmetros úteis da URI local (captura/GPS) perdidos no upload. */
function appendPreservedMediaQuery(publicUrl: string, originalLocalUri: string): string {
  if (!publicUrl || typeof originalLocalUri !== 'string') return publicUrl;
  const qi = originalLocalUri.indexOf('?');
  if (qi < 0) return publicUrl;
  const rawQ = originalLocalUri.slice(qi + 1);
  if (!rawQ.trim()) return publicUrl;
  try {
    const sp = new URLSearchParams(rawQ);
    const qp = new URLSearchParams();
    for (const k of ['live', 'capturedAt', 'lat', 'lng', 'addr']) {
      const v = sp.get(k);
      if (v != null && String(v).trim() !== '') qp.set(k, v);
    }
    if ([...qp.keys()].length === 0) return publicUrl;
    const frag = qp.toString();
    const sep = publicUrl.includes('?') ? '&' : '?';
    return `${publicUrl}${sep}${frag}`;
  } catch {
    return publicUrl;
  }
}

async function uploadOneLocalMediaField(
  localUriWithMaybeQuery: string,
  payload: { taskId?: string; templateId?: string; ownerEmail?: string },
  fieldKey: string,
  indexSuffix: string
): Promise<string | null> {
  const emailSafe = (payload.ownerEmail || 'anon').replace(/[^a-zA-Z0-9]/g, '_');
  const readable = await ensureUploadableFileUri(localUriWithMaybeQuery);
  const ext = guessExtFromUri(readable) || 'jpg';
  const remotePath = `checklists/${emailSafe}/${payload.taskId || payload.templateId}_${fieldKey}${indexSuffix}_${Date.now()}.${ext}`;
  console.log(`[SYNC] Upload mídia checklist: ${readable.slice(0, 80)}… → ${remotePath}`);
  const upRes = await uploadFile(readable, remotePath);
  return upRes?.url || null;
}

/** Upload de mídia local num mapa plano de respostas (raiz ou uma linha de secção repetível). */
async function uploadLocalMediaInFlatResponseRecord(
  record: Record<string, unknown>,
  payload: { taskId?: string; templateId?: string; ownerEmail?: string }
): Promise<void> {
  for (const key of Object.keys(record)) {
    if (key.startsWith('__')) continue;

    const val = record[key];

    if (typeof val === 'string' && isLocalMediaUri(val)) {
      try {
        const url = await uploadOneLocalMediaField(val, payload, key, '');
        if (url) {
          record[key] = appendPreservedMediaQuery(url, val);
          console.log(`[SYNC] Campo ${key} → URL remota`);
        }
      } catch (e: any) {
        console.warn(`[SYNC] Falha upload mídia campo ${key}:`, e?.message || e);
      }
      continue;
    }

    if (Array.isArray(val)) {
      let anyChange = false;
      const next: unknown[] = [];
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (typeof item === 'string' && isLocalMediaUri(item)) {
          try {
            const url = await uploadOneLocalMediaField(item, payload, key, `_i${i}`);
            if (url) {
              next.push(appendPreservedMediaQuery(url, item));
              anyChange = true;
              continue;
            }
          } catch (e: any) {
            console.warn(`[SYNC] Falha upload mídia ${key}[${i}]:`, e?.message || e);
          }
        }
        next.push(item);
      }
      if (anyChange) record[key] = next;
    }
  }
}

/** Conta URIs de mídia local na raiz e em todas as linhas `__section_repeat_*`. */
function countLocalMediaUrisInResponsesTree(responses: Record<string, unknown>): number {
  let n = 0;
  const bump = (flat: Record<string, unknown>) => {
    for (const key of Object.keys(flat)) {
      if (key.startsWith('__')) continue;
      const v = flat[key];
      if (typeof v === 'string' && isLocalMediaUri(v)) n += 1;
      else if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'string' && isLocalMediaUri(item)) n += 1;
        }
      }
    }
  };
  bump(responses);
  for (const k of Object.keys(responses)) {
    if (!k.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    const rows = responses[k];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === 'object' && !Array.isArray(row)) bump(row as Record<string, unknown>);
    }
  }
  return n;
}

/** Substitui file:// / content:// / arrays de URIs por URLs públicas antes de POST /executions (raiz + secções repetíveis). */
async function uploadLocalMediaInChecklistPayload(payload: any): Promise<void> {
  if (!payload?.responses || typeof payload.responses !== 'object') return;
  const responses = payload.responses as Record<string, unknown>;

  await uploadLocalMediaInFlatResponseRecord(responses, payload);

  for (const key of Object.keys(responses)) {
    if (!key.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    const rows = responses[key];
    if (!Array.isArray(rows)) continue;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      await uploadLocalMediaInFlatResponseRecord(row as Record<string, unknown>, payload);
    }
  }
}

function formatReverseGeocodeLine(p: Location.LocationGeocodedAddress): string {
  return `${p.street || p.name || ''}, ${p.streetNumber || ''} - ${p.district || p.subregion || ''}, ${p.city || ''} - ${p.region || ''}`;
}

function transitNeedsOfflineAddressFill(o: Record<string, unknown>): boolean {
  const action = String(o.action || '');
  if (action !== 'SAIDA' && action !== 'CHEGADA') return false;
  if (o.geofence != null) return false;
  const c = o.coordinates as { lat?: unknown; lng?: unknown } | undefined;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return false;
  const addr = String(o.address || '').trim();
  if (addr === 'A obter endereço…' || addr === 'A obter endereço...') return true;
  if (!addr) return true;
  return false;
}

/**
 * Antes do POST da outbox (com rede): preenche moradas de SAIDA/CHEGADA que ficaram em «A obter endereço…»
 * quando a conclusão foi offline — mesmo raciocínio do IIFE no checklist, mas aplicado ao payload em fila.
 */
async function maybeEnrichTransitJsonString(raw: string): Promise<string | null> {
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (!transitNeedsOfflineAddressFill(o)) return null;
  const c = o.coordinates as { lat?: unknown; lng?: unknown };
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  try {
    const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (rev?.length) {
      const line = formatReverseGeocodeLine(rev[0]).trim();
      if (!line) return null;
      return JSON.stringify({ ...o, address: line });
    }
  } catch {
    return null;
  }
  return null;
}

function locationPickNeedsAddressFill(o: Record<string, unknown>): boolean {
  if (o.version !== 1) return false;
  const gps = o.gps as { lat?: unknown; lng?: unknown } | undefined;
  const pin = o.pin as { lat?: unknown; lng?: unknown } | undefined;
  if (!gps || !pin) return false;
  const gl = Number(gps.lat);
  const gg = Number(gps.lng);
  const pl = Number(pin.lat);
  const pg = Number(pin.lng);
  if (![gl, gg, pl, pg].every((n) => Number.isFinite(n))) return false;
  const pend = (s: string) =>
    !s.trim() || s.trim() === 'A obter endereço…' || s.trim() === 'A obter endereço...';
  return pend(String(o.addressGps ?? '')) || pend(String(o.addressPin ?? ''));
}

async function maybeEnrichLocationPickJsonString(raw: string): Promise<string | null> {
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (!locationPickNeedsAddressFill(o)) return null;
  const gps = o.gps as { lat: number; lng: number };
  const pin = o.pin as { lat: number; lng: number };
  const prevG = String(o.addressGps ?? '').trim();
  const prevP = String(o.addressPin ?? '').trim();
  const pend = (s: string) =>
    !s || s === 'A obter endereço…' || s === 'A obter endereço...';
  const fallback = 'Endereço indisponível (rede ou mapas).';
  let lineG: string | null = null;
  let lineP: string | null = null;
  try {
    const [r1, r2] = await Promise.all([
      pend(prevG) ? Location.reverseGeocodeAsync({ latitude: gps.lat, longitude: gps.lng }) : Promise.resolve(null),
      pend(prevP) ? Location.reverseGeocodeAsync({ latitude: pin.lat, longitude: pin.lng }) : Promise.resolve(null),
    ]);
    if (r1?.length) {
      const ln = formatReverseGeocodeLine(r1[0]).trim();
      if (ln) lineG = ln;
    }
    if (r2?.length) {
      const ln = formatReverseGeocodeLine(r2[0]).trim();
      if (ln) lineP = ln;
    }
  } catch {
    /* mantém nulls */
  }
  const nextG = pend(prevG) ? lineG || fallback : prevG;
  const nextP = pend(prevP) ? lineP || fallback : prevP;
  return JSON.stringify({ ...o, addressGps: nextG, addressPin: nextP });
}

async function maybeEnrichGpsBackedJsonString(raw: string): Promise<string | null> {
  const t = await maybeEnrichTransitJsonString(raw);
  if (t != null) return t;
  return maybeEnrichLocationPickJsonString(raw);
}

async function enrichGpsDerivedAddressesInResponsesTree(responses: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (const k of Object.keys(responses)) {
    if (k.startsWith('__') && !k.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    const v = responses[k];
    if (typeof v === 'string') {
      const next = await maybeEnrichGpsBackedJsonString(v);
      if (next != null) {
        responses[k] = next;
        n++;
      }
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const row = v[i];
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          n += await enrichGpsDerivedAddressesInResponsesTree(row as Record<string, unknown>);
        }
      }
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      n += await enrichGpsDerivedAddressesInResponsesTree(v as Record<string, unknown>);
    }
  }
  return n;
}

async function enrichPendingGpsDerivedAddressesInOutbox(outbox: any[]): Promise<number> {
  try {
    const netState = await Network.getNetworkStateAsync();
    if (netState.isConnected !== true) return 0;
  } catch {
    return 0;
  }
  let total = 0;
  for (const payload of outbox) {
    const r = payload?.responses;
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    total += await enrichGpsDerivedAddressesInResponsesTree(r as Record<string, unknown>);
  }
  return total;
}

const FACIAL_BIOMETRIC_KEY_SUFFIX = '__biometric';
const FACIAL_ADDR_FALLBACK_SYNC = 'Endereço indisponível (rede ou mapas).';

function parseLatLngFromUriQueryForFacialSync(uri: string): { lat: number; lng: number } | null {
  const qi = uri.indexOf('?');
  if (qi < 0) return null;
  try {
    const sp = new URLSearchParams(uri.slice(qi + 1));
    const lat = Number(sp.get('lat'));
    const lng = Number(sp.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function facialLineFromGeocodeEntry(r: Location.LocationGeocodedAddress): string {
  return `${r.street || r.name}, ${r.streetNumber || 'S/N'} - ${r.subregion || r.city || r.district || r.region}`.trim();
}

function applyFacialAddrToLocalMediaUri(uri: string, line: string, lat: number, lng: number): string {
  const qi = uri.indexOf('?');
  const base = qi >= 0 ? uri.slice(0, qi) : uri;
  let params: URLSearchParams;
  try {
    params = qi >= 0 ? new URLSearchParams(uri.slice(qi + 1)) : new URLSearchParams();
  } catch {
    return uri;
  }
  params.set('addr', line);
  const curLat = params.get('lat');
  const curLng = params.get('lng');
  if (curLat == null || String(curLat).trim() === '') params.set('lat', String(lat));
  if (curLng == null || String(curLng).trim() === '') params.set('lng', String(lng));
  return `${base}?${params.toString()}`;
}

/**
 * Antes do upload: preenche `captureAddr` em `{campo}__biometric` e `addr=` na URI local quando há lat/lng
 * (corrida com `mergeAddrIntoMediaUriIfStillCurrent` ou falha silenciosa do reverse geocode na UI).
 */
async function enrichFacialBiometricAddressesInFlatRecord(record: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (const key of Object.keys(record)) {
    if (key.startsWith('__') && !key.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    if (!key.endsWith(FACIAL_BIOMETRIC_KEY_SUFFIX)) continue;
    const raw = record[key];
    if (typeof raw !== 'string' || !raw.trim().startsWith('{')) continue;
    let bio: Record<string, unknown>;
    try {
      bio = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!bio || typeof bio !== 'object' || Array.isArray(bio)) continue;
    if (bio.captureAddr != null && String(bio.captureAddr).trim() !== '') continue;

    let lat = Number(bio.captureLat);
    let lng = Number(bio.captureLng);
    const fieldId = key.slice(0, -FACIAL_BIOMETRIC_KEY_SUFFIX.length);
    const mediaVal = record[fieldId];

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const candidates: string[] = [];
      if (typeof mediaVal === 'string' && mediaVal) candidates.push(mediaVal);
      else if (Array.isArray(mediaVal)) {
        for (const it of mediaVal) {
          if (typeof it === 'string' && it) candidates.push(it);
        }
      }
      let parsed: { lat: number; lng: number } | null = null;
      for (const u of candidates) {
        parsed = parseLatLngFromUriQueryForFacialSync(u);
        if (parsed) break;
      }
      if (!parsed) continue;
      lat = parsed.lat;
      lng = parsed.lng;
    }

    let line = '';
    try {
      const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (rev?.length) line = facialLineFromGeocodeEntry(rev[0]!);
    } catch {
      line = '';
    }
    if (!line) line = FACIAL_ADDR_FALLBACK_SYNC;

    record[key] = JSON.stringify({
      ...bio,
      captureLat: String(lat),
      captureLng: String(lng),
      captureAddr: line,
    });

    if (typeof mediaVal === 'string' && isLocalMediaUri(mediaVal)) {
      record[fieldId] = applyFacialAddrToLocalMediaUri(mediaVal, line, lat, lng);
    } else if (Array.isArray(mediaVal)) {
      record[fieldId] = mediaVal.map((it) =>
        typeof it === 'string' && isLocalMediaUri(it) ? applyFacialAddrToLocalMediaUri(it, line, lat, lng) : it
      );
    }
    n += 1;
  }
  return n;
}

async function enrichFacialBiometricAddressesInResponsesTree(responses: Record<string, unknown>): Promise<number> {
  let n = await enrichFacialBiometricAddressesInFlatRecord(responses);
  for (const k of Object.keys(responses)) {
    if (!k.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    const rows = responses[k];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        n += await enrichFacialBiometricAddressesInFlatRecord(row as Record<string, unknown>);
      }
    }
  }
  return n;
}

async function enrichFacialBiometricAddressesInOutbox(outbox: any[]): Promise<number> {
  try {
    const netState = await Network.getNetworkStateAsync();
    if (netState.isConnected !== true) return 0;
  } catch {
    return 0;
  }
  let total = 0;
  for (const payload of outbox) {
    const r = payload?.responses;
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    total += await enrichFacialBiometricAddressesInResponsesTree(r as Record<string, unknown>);
  }
  return total;
}

async function pushChecklistOutbox() {
  try {
     const raw = await AsyncStorage.getItem('@brspark_outbox');
     if (!raw) return;
     let outbox: any[] = [];
     try {
       outbox = JSON.parse(raw);
       if (!Array.isArray(outbox)) outbox = [];
     } catch (parseErr) {
       const backupKey = `@brspark_outbox_corrupt_${Date.now()}`;
       try {
         await AsyncStorage.setItem(backupKey, raw);
         await AsyncStorage.removeItem('@brspark_outbox');
         console.error(
           '[SYNC] Outbox JSON inválido — cópia em',
           backupKey,
           '; chave principal limpa para não bloquear sync (recuperar payload com suporte se necessário).',
           parseErr
         );
       } catch (backupErr) {
         console.error('[SYNC] Outbox corrompida e falha ao gravar backup:', backupErr, parseErr);
       }
       return;
     }

     if (outbox.length === 0) return;

     const gpsAddrFilled = await enrichPendingGpsDerivedAddressesInOutbox(outbox);
     const facialAddrFilled = await enrichFacialBiometricAddressesInOutbox(outbox);
     if (gpsAddrFilled > 0 || facialAddrFilled > 0) {
       await AsyncStorage.setItem('@brspark_outbox', JSON.stringify(outbox));
       for (const p of outbox) {
         if (p?.taskId) {
           try {
             await AsyncStorage.setItem(`@brspark_execution_${p.taskId}`, JSON.stringify(p));
           } catch {
             /* ignore */
           }
         }
       }
       if (gpsAddrFilled > 0) {
         console.log(
           `[SYNC] Moradas (deslocamento / mapa) pendentes enriquecidas na outbox (${gpsAddrFilled}) antes do POST (rede disponível).`
         );
       }
       if (facialAddrFilled > 0) {
         console.log(
           `[SYNC] Moradas faciais (biometria + URI local) enriquecidas na outbox (${facialAddrFilled}) antes do POST.`
         );
       }
     }

     const syncedIds: any[] = [];
     for (const payload of outbox) {
         try {
             await uploadLocalMediaInChecklistPayload(payload);
             // #region agent log
             void (() => {
               try {
                 const r = payload?.responses;
                 if (!r || typeof r !== 'object') return;
                 const left = countLocalMediaUrisInResponsesTree(r as Record<string, unknown>);
                 fetch('http://127.0.0.1:7648/ingest/3c4839dc-67e2-4b6c-bba8-db6b907bdf66', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd3da5' },
                   body: JSON.stringify({
                     sessionId: 'fd3da5',
                     hypothesisId: 'H1-H6-repeat-upload',
                     location: 'syncService.ts:pushChecklistOutbox',
                     message: 'after uploadLocalMediaInChecklistPayload',
                     data: {
                       taskId: payload.taskId,
                       localMediaRemaining: left,
                       facialAddrPrefill: facialAddrFilled,
                     },
                     timestamp: Date.now(),
                   }),
                 }).catch(() => {});
               } catch {
                 /* ignore */
               }
             })();
             // #endregion

             const res = await apiFetch('/api/checklists/executions', {
                 method: 'POST',
                 body: JSON.stringify(payload),
                 headers: { 'Content-Type': 'application/json' }
             });
             
             if (res.ok || res.status === 409) { // 409 se já foi recebido antes
                 syncedIds.push(payload.taskId || payload.templateId);
                 // Delete the heavy local payload since it's now archived in the cloud
                 if (payload.taskId) {
                     await AsyncStorage.removeItem(`@brspark_execution_${payload.taskId}`);
                 }
             } else {
                 console.warn(`[SYNC] Outbox falhou: ${res.status}`);
             }
         } catch (netErr) {
             console.warn('[SYNC] Outbox rede falhou (offline)', netErr);
             break; // Pare de tentar se a rede caiu
         }
     }
     
     if (syncedIds.length > 0) {
         const newOutbox = outbox.filter((item: any) => !syncedIds.includes(item.taskId || item.templateId));
         await AsyncStorage.setItem('@brspark_outbox', JSON.stringify(newOutbox));
         console.log(`[SYNC] ✅ ${syncedIds.length} tarefas sincronizadas (concluídas). Faltam: ${newOutbox.length}`);
     }
  } catch (e) {
     console.warn('[SYNC] Erro critico lendo outbox', e);
  }
}

/** Faz push dos dados locais para o servidor */
async function pushModule(endpoint: string, storageKey: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return;
    let data: any[] = [];
    try {
      data = JSON.parse(raw);
      if (!Array.isArray(data)) data = [];
    } catch {
      console.warn(`[SYNC] Dados corrompidos em ${storageKey}, ignorando push.`);
      return;
    }
    if (data.length === 0) return;
    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.warn(`[SYNC] Push falhou para ${storageKey}:`, e);
  }
}

/** Faz pull do servidor e merge com dados locais (servidor vence por ID) */
async function pullModule<T>(
  endpoint: string,
  storageKey: string,
  merge?: (remote: T[], local: T[]) => T[]
): Promise<void> {
  try {
    const res = await apiFetch(endpoint);
    if (!res.ok) return;
    const remote: T[] = await res.json();
    if (remote.length === 0 && !merge) return;

    const localRaw = await AsyncStorage.getItem(storageKey);
    let local: T[] = [];
    if (localRaw) {
      try {
        local = JSON.parse(localRaw);
        if (!Array.isArray(local)) local = [];
      } catch {
        console.warn(`[SYNC] Dados locais corrompidos em ${storageKey}. Substituindo pelo remoto.`);
        local = [];
      }
    }

    if (merge) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(merge(remote, local)));
    } else {
      const remoteIds = new Set(remote.map((r: any) => (r as any).id));
      const localOnly = local.filter((l: any) => !remoteIds.has(l.id));
      await AsyncStorage.setItem(storageKey, JSON.stringify([...remote, ...localOnly]));
    }
  } catch (e) {
    console.warn(`[SYNC] Pull falhou para ${storageKey}:`, e);
  }
}

// ── PUSH + PULL por módulo ─────────────────────────────────────────────────────

export async function pullCosts(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  const modules = [
    { path: '/costs/expenses', key: 'costs_expenses' },
    { path: '/costs/recurring', key: 'costs_recurring' },
    { path: '/costs/budgets', key: 'costs_budgets' },
  ];
  await Promise.all(modules.map(m => pushModule(`/api/sync${m.path}${q}`, AuthService.getUserKey(m.key, ownerEmail))));
  await Promise.all(modules.map(m => pullModule(`/api/sync${m.path}${q}`, AuthService.getUserKey(m.key, ownerEmail))));
}

export async function pullInsurance(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/insurance${q}`, AuthService.getUserKey('insurance_policies', ownerEmail));
  await pullModule(`/api/sync/insurance${q}`, AuthService.getUserKey('insurance_policies', ownerEmail));
}

export async function pullVault(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const safeEmail = ownerEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const vaultKeys = allKeys.filter(k => k.includes('vault:') && k.includes(safeEmail));
    const entries = await Promise.all(
      vaultKeys.map(async k => {
        const raw = await AsyncStorage.getItem(k);
        const assetId = k.split('vault:').pop() || k;
        let entries = [];
        if (raw) {
          try { entries = JSON.parse(raw); } catch {}
        }
        return { assetId, entries };
      })
    );
    if (entries.length > 0) {
      await apiFetch(`/api/sync/vault${q}`, {
        method: 'POST',
        body: JSON.stringify(entries),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await apiFetch(`/api/sync/vault${q}`);
    if (!res.ok) return;
    const remoteEntries: Array<{ assetId: string; entries: any[] }> = await res.json();
    await Promise.all(
      remoteEntries.map(({ assetId, entries }) =>
        AsyncStorage.setItem(AuthService.getUserKey(`vault:${assetId}`, ownerEmail), JSON.stringify(entries))
      )
    );
  } catch { /* offline */ }
}

export async function pullMediaMetadata(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/media${q}`, AuthService.getUserKey('media_remote_index', ownerEmail));
  await pullModule(`/api/sync/media${q}`, AuthService.getUserKey('media_remote_index', ownerEmail));
}

export async function pullAssetDocs(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/asset_docs${q}`, AuthService.getUserKey('asset_docs', ownerEmail));
  await pullModule(`/api/sync/asset_docs${q}`, AuthService.getUserKey('asset_docs', ownerEmail));
}

export async function pullStock(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    const localItems = getLocalStockItems(ownerEmail);
    if (localItems.length > 0) {
      await apiFetch(`/api/sync/stock/items${q}`, {
        method: 'POST', body: JSON.stringify(localItems), headers: { 'Content-Type': 'application/json' },
      });
    }

    const localMoves = getLocalStockMovements(ownerEmail);
    if (localMoves.length > 0) {
      await apiFetch(`/api/sync/stock/movements${q}`, {
        method: 'POST', body: JSON.stringify(localMoves), headers: { 'Content-Type': 'application/json' },
      });
    }

    const resItems = await apiFetch(`/api/sync/stock/items${q}`);
    if (resItems.ok) {
      const items = await resItems.json();
      items.forEach((it: any) => saveStockItemLocal(it, ownerEmail));
    }
    const resMoves = await apiFetch(`/api/sync/stock/movements${q}`);
    if (resMoves.ok) {
      const moves = await resMoves.json();
      moves.forEach((m: any) => saveStockMovementLocal(m, ownerEmail));
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar estoque:', e);
  }
}

export async function pullTechStock(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    const localItems = getLocalTechStockItems(ownerEmail);
    if (localItems.length > 0) {
      await apiFetch(`/api/sync/tech-stock/items${q}`, {
        method: 'POST',
        body: JSON.stringify(localItems),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const localMoves = getLocalTechStockMovements(ownerEmail);
    if (localMoves.length > 0) {
      await apiFetch(`/api/sync/tech-stock/movements${q}`, {
        method: 'POST',
        body: JSON.stringify(localMoves),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resItems = await apiFetch(`/api/sync/tech-stock/items${q}`);
    if (resItems.ok) {
      const items = await resItems.json();
      items.forEach((it: any) => saveTechStockItemLocal(it, ownerEmail));
    }
    const resMoves = await apiFetch(`/api/sync/tech-stock/movements${q}`);
    if (resMoves.ok) {
      const moves = await resMoves.json();
      moves.forEach((m: any) => saveTechStockMovementLocal(m, ownerEmail));
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar estoque do técnico:', e);
  }
}

export async function pullTechFinance(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    let localRows = getLocalTechFinanceEntries(ownerEmail);
    if (ownerEmail && localRows.length > 0) {
      const prepared: any[] = [];
      for (const row of localRows) {
        prepared.push(await ensureTechFinanceAttachmentsUploaded(row, ownerEmail));
      }
      localRows = prepared;
    }
    if (localRows.length > 0) {
      await apiFetch(`/api/sync/tech-finance/entries${q}`, {
        method: 'POST',
        body: JSON.stringify(localRows),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await apiFetch(`/api/sync/tech-finance/entries${q}`);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        rows.forEach((it: any) => {
          if (!it || !it.id) return;
          saveTechFinanceEntryLocal(
            {
              ...it,
              owner_email: it.owner_email || ownerEmail || null,
            },
            ownerEmail
          );
        });
      }
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar financeiro do técnico:', e);
  }
}

export async function pullMaintenances(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  const key = ownerEmail ? AuthService.getUserKey('maintenances', ownerEmail) : 'maintenances';
  await pushModule(`/api/sync/maintenances${q}`, key);
  await pullModule(`/api/sync/maintenances${q}`, key);
}

export async function pullAgenda(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/agenda/events${q}`, AuthService.getUserKey('agenda_events', ownerEmail));
  await pullModule(`/api/sync/agenda/events${q}`, AuthService.getUserKey('agenda_events', ownerEmail));
}

export async function pullAssetNotes(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    const localRows = getLocalAssetNotesForSync(ownerEmail);
    if (ownerEmail && localRows.length > 0) {
      await apiFetch(`/api/sync/asset-notes${q}`, {
        method: 'POST',
        body: JSON.stringify(localRows),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await apiFetch(`/api/sync/asset-notes${q}`);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && ownerEmail) {
        for (const it of rows) {
          if (!it?.id || !it?.assetId || it._isShared) continue;
          upsertAssetNoteFromSync(
            {
              id: String(it.id),
              assetId: String(it.assetId),
              title: String(it.title ?? ''),
              content: String(it.content ?? ''),
              createdBy: String(it.createdBy ?? ''),
              createdAt: Number(it.createdAt) || Date.now(),
              updatedAt: Number(it.updatedAt) || Date.now(),
              synced: 1,
            },
            ownerEmail
          );
        }
      }
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar notas de ativos:', e);
  }
}

/** metadata vindo como objeto ou string JSON (legado / cópias) */
function parseTaskMetadata(meta: unknown): Record<string, unknown> {
  if (meta == null) return {};
  if (typeof meta === 'string') {
    try {
      const o = JSON.parse(meta);
      return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof meta === 'object') return meta as Record<string, unknown>;
  return {};
}

function isPausedLikeTask(t: any): boolean {
  const raw = String(t?.status || '').toUpperCase();
  if (raw === 'PAUSED') return true;
  const m = parseTaskMetadata(t?.metadata);
  const ep = m.executionPaused;
  return ep === true || ep === 'true' || String(ep || '').toLowerCase() === 'true';
}

function isResumedLocalSnapshot(t: any): boolean {
  const raw = String(t?.status || '').toUpperCase();
  if (raw !== 'IN_PROGRESS') return false;
  const m = parseTaskMetadata(t?.metadata);
  const ep = m.executionPaused;
  return ep === false || ep === 'false' || String(ep || '').toLowerCase() === 'false';
}

/**
 * Evita apagar pausa/retomada local ao puxar lista: o servidor pode ainda não refletir o último PATCH.
 */
function pickOsNumber(remote: any, prev: any | undefined): string | null | undefined {
  const r = remote?.osNumber != null && String(remote.osNumber).trim() !== '' ? String(remote.osNumber).trim() : null;
  const p = prev?.osNumber != null && String(prev.osNumber).trim() !== '' ? String(prev.osNumber).trim() : null;
  return r ?? p ?? remote?.osNumber ?? prev?.osNumber ?? null;
}

function pickLastSubmittedRevision(remote: any, prev: any | undefined): number {
  const r = Number(remote?.lastSubmittedRevision);
  const p = Number(prev?.lastSubmittedRevision);
  const rn = Number.isFinite(r) ? r : 0;
  const pn = Number.isFinite(p) ? p : 0;
  return Math.max(rn, pn);
}

function remoteHasReopenRevisionPending(rMeta: Record<string, unknown>): boolean {
  return (
    rMeta.reopenForRevisionPending === true ||
    rMeta.reopenForRevisionPending === 'true' ||
    String(rMeta.reopenForRevisionPending || '').toLowerCase() === 'true'
  );
}

function remoteHasRevisionVisitActive(rMeta: Record<string, unknown>): boolean {
  return (
    rMeta.revisionVisitActive === true ||
    rMeta.revisionVisitActive === 'true' ||
    String(rMeta.revisionVisitActive || '').toLowerCase() === 'true'
  );
}

function taskMetadataIndicatesAdminRevisionCycle(m: Record<string, unknown>): boolean {
  if (remoteHasReopenRevisionPending(m) || remoteHasRevisionVisitActive(m)) return true;
  const rc = Number(m.reopenCount);
  return Number.isFinite(rc) && rc > 0;
}

/**
 * O servidor em PENDING (nova despacho ou reabertura) é a verdade — não deixar PATCH antigo
 * IN_PROGRESS/PAUSED na outbox sobrepor o estado ao fazer pull (senão o cartão some da aba Pendentes).
 */
async function stripExecutionStatusOutboxForPendingServerTasks(remoteTasks: any[]): Promise<void> {
  const pendingIds = new Set<string>();
  for (const t of remoteTasks) {
    if (String(t?.status || '').toUpperCase() !== 'PENDING') continue;
    if (t?.id != null) pendingIds.add(String(t.id));
  }
  if (pendingIds.size === 0) return;
  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    if (!raw) return;
    let arr: { taskId?: string; body?: ExecutionStatusPatchBody }[] = [];
    try {
      arr = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(arr) || arr.length === 0) return;
    const next = arr.filter((item) => item?.taskId == null || !pendingIds.has(String(item.taskId)));
    if (next.length === arr.length) return;
    if (next.length === 0) await AsyncStorage.removeItem(EXECUTION_STATUS_OUTBOX_KEY);
    else await AsyncStorage.setItem(EXECUTION_STATUS_OUTBOX_KEY, JSON.stringify(next));
    console.log(
      `[pullTasks] Outbox de estado da execução limpa para ${arr.length - next.length} OS(s) em PENDING no servidor`
    );
  } catch (e) {
    console.warn('[pullTasks] stripExecutionStatusOutboxForPendingServerTasks:', e);
  }
}

/** Revisão reaberta pelo admin: tirar id de inprogress local para voltar a Pendentes até novo aceite/início. */
async function stripInProgressLocalForRevisionPendingTasks(remoteTasks: any[]): Promise<void> {
  const ids = new Set<string>();
  for (const t of remoteTasks) {
    const st = String(t?.status || '').toUpperCase();
    if (st !== 'PENDING' && st !== 'RECEIVED') continue;
    const m = parseTaskMetadata(t?.metadata);
    if (!taskMetadataIndicatesAdminRevisionCycle(m)) continue;
    if (t?.id != null) ids.add(String(t.id));
  }
  if (ids.size === 0) return;
  try {
    const raw = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
    let arr: string[] = [];
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
    if (!Array.isArray(arr) || arr.length === 0) return;
    const next = arr.filter((id) => !ids.has(String(id)));
    if (next.length === arr.length) return;
    await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(next));
    console.log(
      `[pullTasks] @brspark_inprogress_tasks: removidos ${arr.length - next.length} id(s) de ciclo de revisão`
    );
  } catch (e) {
    console.warn('[pullTasks] stripInProgressLocalForRevisionPendingTasks:', e);
  }
}

/** Não reintroduzir metadados de revisão que o servidor já limpou (após sync / nova conclusão). */
function stripStaleReopenFromMergedMetadata(
  rMeta: Record<string, unknown>,
  merged: Record<string, unknown>
): void {
  if (!remoteHasReopenRevisionPending(rMeta)) delete merged.reopenForRevisionPending;
  if (!remoteHasRevisionVisitActive(rMeta)) delete merged.revisionVisitActive;
}

function pickExpectedFormDurationFromTask(task: any): number | null {
  const v = task?.expectedFormDurationMinutes;
  if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return null;
  return Math.floor(Number(v));
}

function mergeDurationEtaPreserve(remote: any, prev: any, base: Record<string, unknown>): Record<string, unknown> {
  const expPrev = pickExpectedFormDurationFromTask(prev);
  const expRemote = pickExpectedFormDurationFromTask(remote);
  const etaR = remote?.etaMinutes;
  const etaP = prev?.etaMinutes;
  const hasEtaRemote = etaR != null && Number.isFinite(Number(etaR));
  const hasEtaPrev = etaP != null && Number.isFinite(Number(etaP));
  return {
    ...base,
    ...(expRemote == null && expPrev != null ? { expectedFormDurationMinutes: expPrev } : {}),
    ...(!hasEtaRemote && hasEtaPrev ? { etaMinutes: Math.floor(Number(etaP)) } : {}),
  };
}

function mergeRemoteCloudTaskWithPrevious(remote: any, prev: any | undefined): any {
  const rMeta = parseTaskMetadata(remote?.metadata);
  const lsr = pickLastSubmittedRevision(remote, prev);
  if (!prev) {
    return { ...remote, metadata: { ...rMeta }, osNumber: pickOsNumber(remote, prev), lastSubmittedRevision: lsr };
  }
  const pMeta = parseTaskMetadata(prev.metadata);

  if (isResumedLocalSnapshot(prev) && isPausedLikeTask(remote)) {
    const mergedMeta = {
      ...rMeta,
      ...pMeta,
      executionPaused: false,
    };
    stripStaleReopenFromMergedMetadata(rMeta, mergedMeta);
    return mergeDurationEtaPreserve(remote, prev, {
      ...remote,
      osNumber: pickOsNumber(remote, prev),
      lastSubmittedRevision: lsr,
      status: 'IN_PROGRESS',
      metadata: mergedMeta,
    });
  }

  if (isPausedLikeTask(prev) && !isPausedLikeTask(remote)) {
    const rs = String(remote.status || '').toUpperCase();
    if (rs === 'IN_PROGRESS' || rs === 'RECEIVED' || rs === 'PENDING' || rs === 'ACCEPTED') {
      const mergedMeta = {
        ...rMeta,
        executionPaused: true,
        lastPauseAt: pMeta.lastPauseAt ?? rMeta.lastPauseAt,
        lastPauseReasonSummary: pMeta.lastPauseReasonSummary ?? rMeta.lastPauseReasonSummary,
      };
      stripStaleReopenFromMergedMetadata(rMeta, mergedMeta);
      return mergeDurationEtaPreserve(remote, prev, {
        ...remote,
        osNumber: pickOsNumber(remote, prev),
        lastSubmittedRevision: lsr,
        status: 'PAUSED',
        metadata: mergedMeta,
      });
    }
  }

  return mergeDurationEtaPreserve(remote, prev, {
    ...remote,
    metadata: { ...rMeta },
    osNumber: pickOsNumber(remote, prev),
    lastSubmittedRevision: lsr,
  });
}

/** PATCH de execução ainda na fila (offline ou falha): deve vencer sobre o GET /tasks até sincronizar. */
export async function overlayExecutionStatusOutboxOnTasks(tasks: any[]): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: { taskId?: string; body?: ExecutionStatusPatchBody }[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      return tasks;
    }
    if (!Array.isArray(arr) || arr.length === 0) return tasks;

    const lastBodyByTask = new Map<string, ExecutionStatusPatchBody>();
    for (const item of arr) {
      if (!item?.taskId || !item.body) continue;
      const st = String(item.body.status || '').toUpperCase();
      if (!st) continue;
      lastBodyByTask.set(String(item.taskId), item.body);
    }
    if (lastBodyByTask.size === 0) return tasks;

    return tasks.map((t) => {
      const body = lastBodyByTask.get(String(t.id));
      if (!body) return t;
      const st = String(body.status || '').toUpperCase();
      if (st !== 'PAUSED' && st !== 'IN_PROGRESS') return t;
      const m = parseTaskMetadata(t.metadata);
      const bm = parseTaskMetadata(body.metadata);
      if (st === 'PAUSED') {
        return {
          ...t,
          status: 'PAUSED',
          metadata: { ...m, executionPaused: true, ...bm },
        };
      }
      return {
        ...t,
        status: 'IN_PROGRESS',
        metadata: { ...m, executionPaused: false, ...bm },
      };
    });
  } catch {
    return tasks;
  }
}

/**
 * IDs com último PATCH pendente IN_PROGRESS ou PAUSED (fila offline).
 * Usado no dashboard para não perder a aba "Em andamento" quando o pull ainda não gravou o estado no cache.
 */
export async function getTaskIdsWithPendingExecutionStatusOutbox(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: { taskId?: string; body?: ExecutionStatusPatchBody }[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
    if (!Array.isArray(arr) || arr.length === 0) return [];

    const lastStatusByTask = new Map<string, string>();
    for (const item of arr) {
      if (!item?.taskId || !item.body) continue;
      const st = String(item.body.status || '').toUpperCase();
      if (st) lastStatusByTask.set(String(item.taskId), st);
    }
    const ids: string[] = [];
    for (const [id, st] of lastStatusByTask) {
      if (st === 'IN_PROGRESS' || st === 'PAUSED') ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * OS com itens na fila que o `pushSyncQueue` envia: `@brspark_outbox` e `@brspark_execution_status_outbox`.
 *
 * **Não** inclui `@draft_tsk_*`: rascunho do checklist só sobe após conclusão (entra na outbox);
 * marcar rascunho aqui deixava a nuvem “pendente” para sempre com rede boa, sem sync automático possível.
 */
export async function getTaskIdsWithPendingLocalSyncOverlay(): Promise<Set<string>> {
  const ids = new Set<string>();

  try {
    const outboxRaw = await AsyncStorage.getItem('@brspark_outbox');
    let outbox: unknown[] = [];
    try {
      outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
    } catch {
      outbox = [];
    }
    if (Array.isArray(outbox)) {
      for (const o of outbox) {
        const tid = (o as { taskId?: unknown })?.taskId;
        if (tid != null && String(tid).trim()) ids.add(String(tid));
      }
    }
  } catch (e) {
    console.warn('[SYNC] getTaskIdsWithPendingLocalSyncOverlay outbox:', e);
  }

  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: { taskId?: string; body?: unknown }[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      arr = [];
    }
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item?.taskId != null && String(item.taskId).trim()) ids.add(String(item.taskId));
      }
    }
  } catch (e) {
    console.warn('[SYNC] getTaskIdsWithPendingLocalSyncOverlay execution status:', e);
  }

  return ids;
}

const ACTIVE_TASK_STATUSES = new Set(['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED']);

/**
 * OS reaberta para revisão: o mesmo id pode ainda estar em "aceitos" do ciclo anterior.
 * Limpa só accepted_tasks para voltar a exigir "Aceitar".
 *
 * Não limpar @brspark_inprogress_tasks aqui: enquanto reopenForRevisionPending vier do GET
 * (até RECEIVED/ACCEPTED/IN_PROGRESS no servidor), apagar inprogress a cada pullTasks
 * desfaz o "Iniciar" e a OS nunca fica na aba Em andamento.
 * (revisionVisitActive mantém-se na visita; não entra nesta limpeza.)
 */
async function clearLocalAcceptedTasksForRevisionReopen(tasks: any[]): Promise<void> {
  if (!Array.isArray(tasks) || tasks.length === 0) return;
  const idSet = new Set<string>();
  for (const t of tasks) {
    if (t?.id == null) continue;
    const m = parseTaskMetadata(t.metadata);
    const rp =
      m.reopenForRevisionPending === true ||
      m.reopenForRevisionPending === 'true' ||
      String(m.reopenForRevisionPending || '').toLowerCase() === 'true';
    if (rp) idSet.add(String(t.id));
  }
  if (idSet.size === 0) return;
  try {
    const accRaw = await AsyncStorage.getItem('@brspark_accepted_tasks');
    let acc: string[] = [];
    try {
      acc = accRaw ? JSON.parse(accRaw) : [];
    } catch {
      acc = [];
    }
    if (!Array.isArray(acc)) acc = [];
    const accNext = acc.filter((id) => !idSet.has(String(id)));
    if (accNext.length !== acc.length) {
      const removed = acc.filter((id) => idSet.has(String(id)));
      await AsyncStorage.setItem('@brspark_accepted_tasks', JSON.stringify(accNext));
      console.log(`[pullTasks] revisão: removidos de accepted_tasks: ${removed.join(', ')}`);
    }
  } catch {
    /* ignore */
  }
}

/** Admin reabriu a OS: tirar o id de @brspark_executed_tasks para o cartão e o checklist voltarem a editáveis. */
async function removeExecutedCacheEntriesForActiveRemoteTasks(remoteTasks: any[]): Promise<void> {
  if (!Array.isArray(remoteTasks) || remoteTasks.length === 0) return;
  const activeIds = new Set<string>();
  for (const t of remoteTasks) {
    const st = String(t?.status || '').toUpperCase();
    if (ACTIVE_TASK_STATUSES.has(st) && t?.id != null) activeIds.add(String(t.id));
  }
  if (activeIds.size === 0) return;
  try {
    const raw = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
    let arr: any[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      return;
    }
    if (!Array.isArray(arr) || arr.length === 0) return;
    const next = arr.filter((e) => {
      const id = typeof e === 'string' ? e : e?.id;
      if (id == null) return true;
      return !activeIds.has(String(id));
    });
    if (next.length !== arr.length) {
      await AsyncStorage.setItem('@brspark_executed_tasks', JSON.stringify(next));
      console.log(`[pullTasks] Cache executed_tasks limpo para ${arr.length - next.length} OS(s) ativas no servidor`);
    }
  } catch {
    /* ignore */
  }
}

export async function pullTasks(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  console.log(`[pullTasks] 🔄 Iniciando para email: "${ownerEmail}" | URL: /api/sync/tasks${q}`);
  try {
    const res = await apiFetch(`/api/sync/tasks${q}`);
    console.log(`[pullTasks] HTTP status: ${res.status}`);
    if (res.ok) {
        const remoteTasks = await res.json();
        console.log(`[pullTasks] ✅ Recebidas ${remoteTasks.length} OS(s) do servidor`);
        if (remoteTasks.length > 0) {
          console.log(`[pullTasks] Primeira OS: id=${remoteTasks[0].id} | title=${remoteTasks[0].title}`);
        }

        await removeExecutedCacheEntriesForActiveRemoteTasks(remoteTasks);
        await stripExecutionStatusOutboxForPendingServerTasks(remoteTasks);
        await stripInProgressLocalForRevisionPendingTasks(remoteTasks);

        let existingList: any[] = [];
        try {
          const exRaw = await AsyncStorage.getItem('@brspark_cloud_tasks');
          const ex = exRaw ? JSON.parse(exRaw) : [];
          existingList = Array.isArray(ex) ? ex : [];
        } catch {
          existingList = [];
        }
        const prevById = new Map(existingList.map((t: any) => [String(t.id), t]));

        const hadPriorTasksPull =
          (await AsyncStorage.getItem('@brspark_pull_tasks_ever')) === '1';

        const mergedRemote = remoteTasks.map((remote: any) =>
          mergeRemoteCloudTaskWithPrevious(remote, prevById.get(String(remote.id)))
        );

        let processedTasks = await overlayExecutionStatusOutboxOnTasks(mergedRemote);

        await clearLocalAcceptedTasksForRevisionReopen(processedTasks);

        // Add receivedAt timestamp so the server knows when the phone got it
        processedTasks = processedTasks.map((t: any) => {
            if (t.metadata && t.metadata.receivedAt) return t; // Already has it
            return {
                ...t,
                metadata: {
                    ...(t.metadata || {}),
                    receivedAt: new Date().toISOString()
                }
            };
        });
        
        await AsyncStorage.setItem('@brspark_cloud_tasks', JSON.stringify(processedTasks));
        
        // Notify backend we RECEIVED them (sends ping to Kanban that it arrived at the phone: Aguardando Aceite)
        const unreceived = remoteTasks.filter((t: any) => t.status === 'PENDING' && !t.metadata?.receivedAt);
        if (unreceived.length > 0) {
            Promise.all(unreceived.map((t: any) => apiFetch(`/api/checklists/executions/${t.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'RECEIVED', timestamp: new Date().toISOString() })
            }))).catch(() => {});
        }

        // Igual ao chat: aviso local quando a sync traz OS novas (push remoto do painel é independente).
        if (hadPriorTasksPull) {
          const newTasks = remoteTasks.filter((t: any) => {
            const id = String(t.id);
            if (prevById.has(id)) return false;
            const st = String(t.status || '').toUpperCase();
            return st === 'PENDING' || st === 'RECEIVED';
          });
          if (newTasks.length === 1) {
            const t0 = newTasks[0];
            const osTitle = String(t0.title || 'Nova OS').slice(0, 120);
            const m0 = parseTaskMetadata(t0.metadata);
            const formName = String(t0.templateTitle ?? m0.templateTitle ?? '')
              .trim()
              .slice(0, 200);
            Notifications.scheduleNotificationAsync({
              content: {
                title: osTitle,
                body: formName || 'Nova atividade na sua lista.',
                sound: 'default',
              },
              trigger: null,
            }).catch(() => {});
          } else if (newTasks.length > 1) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Novas OS designadas',
                body: `${newTasks.length} novas atividades na sua lista.`,
                sound: 'default',
              },
              trigger: null,
            }).catch(() => {});
          }
        }

        await AsyncStorage.setItem('@brspark_pull_tasks_ever', '1');
        await purgeExpiredCompletedExecutionCaches();
        console.log(`[pullTasks] 💾 Cache @brspark_cloud_tasks atualizado`);
    } else {
        const err = await res.text();
        console.warn(`[pullTasks] ❌ Servidor retornou ${res.status}: ${err}`);
        // Offline-first: never block the user with an alert
    }
  } catch(e) { 
      console.warn('[pullTasks] ❌ Servidor inalcançável (modo offline):', e);
      // Offline-first: silent fail — data already exists locally
  }
}

// ── Telemetria offline-first ───────────────────────────────────────────────────────

/**
 * Envia o lote de eventos de telemetria armazenados offline.
 * Chamado por pushSyncQueue antes de qualquer outro dado.
 */
export async function pushTelemetryBatch(): Promise<void> {
  const TELEMETRY_KEY = '@brspark_telemetry_outbox';
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_KEY);
    if (!raw) return;
    const events = JSON.parse(raw);
    if (!Array.isArray(events) || events.length === 0) return;

    const BATCH_SIZE = 100;
    let sent = 0;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      try {
        const user = await AuthService.getUser().catch(() => null);
        const ownerEmail = user?.email || 'unknown';
        const res = await apiFetch('/api/telemetry/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch, ownerEmail }),
        });
        if (res.ok || res.status === 400) {
          // 400 significa batch inválido mas enviado — remove mesmo assim para não travar
          sent += batch.length;
        } else if (res.status >= 500) {
          break; // servidor indisponível — para e tenta depois
        }
      } catch {
        break; // rede caíu — para
      }
    }

    if (sent > 0) {
      const remaining = events.slice(sent);
      await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(remaining));
      console.log(`[SYNC] 📡 ${sent} eventos de telemetria enviados. Restam: ${remaining.length}`);
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao enviar telemetria:', e);
  }
}

/**
 * Baixa e salva localmente a CollectionPolicy efetiva do tenant.
 */
export async function pullCollectionPolicy(tenantId?: string): Promise<void> {
  try {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const res = await apiFetch(`/api/collection-policy/effective${qs}`);
    if (res.ok) {
      const policy = await res.json();
      await AsyncStorage.setItem('@brspark_collection_policy', JSON.stringify(policy));
      console.log('[SYNC] ✅ CollectionPolicy atualizada');
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao baixar CollectionPolicy:', e);
  }
}

// ── Full sync (chamado no login + pull-to-refresh) ────────────────────────────

/**
 * Polling: servidor marca OS em tracking sem GPS há 5+ min → notificação local (dedupe por executionId+alertAt).
 */
export async function pollStaleGpsReminders(): Promise<void> {
  try {
    const token = await getToken();
    if (!token) return;
    const res = await apiFetch('/api/telemetry/stale-reminders');
    if (!res.ok) return;
    const data = await res.json();
    const reminders = Array.isArray(data.reminders) ? data.reminders : [];
    for (const r of reminders) {
      if (!r?.executionId || !r?.alertAt) continue;
      const key = `@brspark_stale_gps_shown_${r.executionId}_${r.alertAt}`;
      const already = await AsyncStorage.getItem(key);
      if (already) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Sem sinal de GPS',
          body: r.title
            ? `A OS "${String(r.title).slice(0, 80)}" está sem atualização de localização há vários minutos.`
            : 'Uma OS em deslocamento está sem atualização de GPS.',
        },
        trigger: null,
      });
      await AsyncStorage.setItem(key, '1');
    }
  } catch (e) {
    console.warn('[SYNC] stale-reminders:', e);
  }
}

export async function fullSync(ownerEmail?: string): Promise<void> {
  if (!ownerEmail) return;
  await ensureTechnicianStockLegacyMigration(ownerEmail);
  await pushSyncQueue(ownerEmail); // já inclui pushTelemetryBatch
  await Promise.all([
    pullTasks(ownerEmail),
    pullCollectionPolicy(), // sem tenantId — pega a política global
    pullCosts(ownerEmail),
    pullInsurance(ownerEmail),
    pullStock(ownerEmail),
    pullTechStock(ownerEmail),
    pullTechFinance(ownerEmail),
    pullMaintenances(ownerEmail),
    pullVault(ownerEmail),
    pullMediaMetadata(ownerEmail),
    pullAssetDocs(ownerEmail),
    pullAgenda(ownerEmail),
    pullAssetNotes(ownerEmail),
  ]);
  await pollStaleGpsReminders();
}
