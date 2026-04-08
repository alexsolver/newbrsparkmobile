import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import {
  TechnicianFinanceService,
  isManualSplitRateioEditableInMemory,
  manualFinanceLinkedTasksOnDevice,
} from '../../src/services/technicianFinanceService';
import type { TechnicianFinanceEntry } from '../../src/types/technicianFinance';
import { useAuth } from '../../src/hooks/useAuth';
import { useManualSync } from '../../src/hooks/useManualSync';
import {
  type CloudTaskFinanceInfo,
  cloudTaskToFinanceInfo,
  formatOsHeadline,
} from '../../src/utils/cloudTaskFinanceContext';

type FilterKey = 'all' | 'expense' | 'revenue';

function formatBrl(n: number) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function linkedTaskIdsForEntry(item: TechnicianFinanceEntry): string[] {
  if (item.linkedTaskIds && item.linkedTaskIds.length > 0) {
    return [...new Set(item.linkedTaskIds.map((id) => String(id).trim()).filter(Boolean))];
  }
  if (item.taskId) return [String(item.taskId)];
  return [];
}

function OsLinkedDetailsBlock({
  taskId,
  taskById,
  amountRight,
}: {
  taskId: string;
  taskById: Map<string, CloudTaskFinanceInfo>;
  amountRight?: string;
}) {
  const inf = taskById.get(String(taskId));
  const head = formatOsHeadline(taskId, inf);
  return (
    <View style={styles.osDetailCard}>
      <View style={styles.osDetailHeadRow}>
        <Text style={styles.osDetailHead} numberOfLines={2}>
          {head}
        </Text>
        {amountRight != null ? <Text style={styles.osDetailAmt}>{amountRight}</Text> : null}
      </View>
      {inf ? (
        <>
          {inf.requester ? (
            <Text style={styles.osDetailLine} numberOfLines={2}>
              <Text style={styles.osDetailLbl}>Solicitante: </Text>
              {inf.requester}
            </Text>
          ) : null}
          {inf.location ? (
            <Text style={styles.osDetailLine} numberOfLines={2}>
              <Text style={styles.osDetailLbl}>Local: </Text>
              {inf.location}
            </Text>
          ) : null}
          {inf.activityTitle ? (
            <Text style={styles.osDetailLine} numberOfLines={2}>
              <Text style={styles.osDetailLbl}>Atividade: </Text>
              {inf.activityTitle}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.osDetailMissing}>Abra ou sincronize a OS para carregar detalhes.</Text>
      )}
    </View>
  );
}

/** Id de lote legado: `tech_fin_<ms>_<índice>_<random>` (quando ainda não havia `split_group_id`). */
function manualExpenseSplitBatchKey(id: string): string | null {
  const parts = String(id).split('_');
  if (parts.length < 5) return null;
  if (parts[0] !== 'tech' || parts[1] !== 'fin') return null;
  const t0 = parts[2];
  const ix = parts[3];
  if (!/^\d+$/.test(t0) || !/^\d+$/.test(ix)) return null;
  return `batch:${t0}`;
}

function baseDescriptionWithoutRateio(desc?: string): string {
  if (!desc) return '';
  return desc.replace(/\s*\(rateio\s+\d+\s*\/\s*\d+\)\s*$/i, '').trim();
}

/** Índice da parte a partir da descrição «(rateio i/n)». */
function rateioPartIndexFromDescription(desc?: string): number | null {
  const m = String(desc || '').match(/\(rateio\s+(\d+)\s*\/\s*\d+\)\s*$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Agrupa linhas antigas/sincronizadas sem `splitGroupId` mas com texto de rateio e mesmo minuto + descrição base.
 */
function heuristicSplitBatchKey(e: TechnicianFinanceEntry, ownerEmail?: string): string | null {
  if (e.source !== 'manual' || e.kind !== 'expense') return null;
  const m = String(e.description || '').match(/\(rateio\s+\d+\s*\/\s*(\d+)\)\s*$/i);
  if (!m) return null;
  const totalParts = Number(m[1]);
  if (!Number.isFinite(totalParts) || totalParts < 2) return null;
  const base = baseDescriptionWithoutRateio(e.description);
  const t = new Date(e.createdAt).getTime();
  if (!Number.isFinite(t)) return null;
  const minute = Math.floor(t / 60000);
  const own = String(ownerEmail || '').trim().toLowerCase();
  return `heur:${own}:${minute}:${totalParts}:${base.slice(0, 200)}`;
}

function sortManualSplitParts(arr: TechnicianFinanceEntry[]) {
  arr.sort((a, b) => {
    const ia = rateioPartIndexFromDescription(a.description);
    const ib = rateioPartIndexFromDescription(b.description);
    if (ia != null && ib != null && ia !== ib) return ia - ib;
    const pa = String(a.id).split('_');
    const pb = String(b.id).split('_');
    const na = Number(pa[3]);
    const nb = Number(pb[3]);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a.taskId || '').localeCompare(String(b.taskId || ''));
  });
}

type FinanceListRow =
  | { kind: 'single'; entry: TechnicianFinanceEntry }
  | { kind: 'split'; groupId: string; parts: TechnicianFinanceEntry[] };

function buildFinanceListRows(entries: TechnicianFinanceEntry[], ownerEmail?: string): FinanceListRow[] {
  const splitMap = new Map<string, TechnicianFinanceEntry[]>();
  const consumed = new Set<string>();

  const addToSplit = (key: string, e: TechnicianFinanceEntry) => {
    const arr = splitMap.get(key) || [];
    arr.push(e);
    splitMap.set(key, arr);
    consumed.add(e.id);
  };

  for (const e of entries) {
    if (e.source !== 'manual' || e.kind !== 'expense') continue;
    const gid = e.splitGroupId != null ? String(e.splitGroupId).trim() : '';
    if (gid) {
      addToSplit(`gid:${gid}`, e);
      continue;
    }
    const bk = manualExpenseSplitBatchKey(e.id);
    if (bk) {
      addToSplit(bk, e);
    }
  }

  const heurBuckets = new Map<string, TechnicianFinanceEntry[]>();
  for (const e of entries) {
    if (consumed.has(e.id)) continue;
    if (e.source !== 'manual' || e.kind !== 'expense') continue;
    const hk = heuristicSplitBatchKey(e, ownerEmail);
    if (!hk) continue;
    const arr = heurBuckets.get(hk) || [];
    arr.push(e);
    heurBuckets.set(hk, arr);
  }
  for (const [hk, arr] of heurBuckets) {
    if (arr.length < 2) continue;
    splitMap.set(hk, arr);
    for (const x of arr) consumed.add(x.id);
  }

  const rows: FinanceListRow[] = [];

  for (const e of entries) {
    if (consumed.has(e.id)) continue;
    rows.push({ kind: 'single', entry: e });
  }

  for (const [k, arr] of splitMap) {
    sortManualSplitParts(arr);
    if (arr.length > 1) {
      rows.push({ kind: 'split', groupId: k, parts: arr });
    } else if (arr.length === 1) {
      rows.push({ kind: 'single', entry: arr[0] });
    }
  }

  rows.sort((a, b) => {
    const t = (r: FinanceListRow) =>
      r.kind === 'single' ? r.entry.createdAt : r.parts[0]?.createdAt || '';
    return new Date(t(b)).getTime() - new Date(t(a)).getTime();
  });
  return rows;
}

export default function TechnicianFinanceScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<TechnicianFinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [taskById, setTaskById] = useState<Map<string, CloudTaskFinanceInfo>>(() => new Map());
  const [cloudTasksRaw, setCloudTasksRaw] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await TechnicianFinanceService.getEntries(user?.email || undefined);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  const loadTaskMap = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('@brspark_cloud_tasks');
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      setCloudTasksRaw(list);
      const m = new Map<string, CloudTaskFinanceInfo>();
      for (const t of list) {
        if (t?.id) {
          m.set(String(t.id), cloudTaskToFinanceInfo(t));
        }
      }
      setTaskById(m);
    } catch {
      setTaskById(new Map());
      setCloudTasksRaw([]);
    }
  }, []);

  const { refreshing, onRefresh } = useManualSync(async () => {
    await load();
  });

  useFocusEffect(
    useCallback(() => {
      load();
      loadTaskMap();
    }, [load, loadTaskMap])
  );

  const listRows = useMemo(() => {
    const base = filter === 'all' ? items : items.filter((x) => x.kind === filter);
    return buildFinanceListRows(base, user?.email);
  }, [items, filter, user?.email]);

  const totals = useMemo(() => {
    let exp = 0;
    let rev = 0;
    for (const x of items) {
      if (x.kind === 'expense') exp += x.amount;
      else rev += x.amount;
    }
    return { exp, rev, net: rev - exp };
  }, [items]);

  const renderRow = ({ item: row }: { item: FinanceListRow }) => {
    if (row.kind === 'split') {
      const { parts } = row;
      const total = parts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      let title = '';
      for (const p of parts) {
        const b = baseDescriptionWithoutRateio(p.description);
        if (b && (!title || b.length > title.length)) title = b;
      }
      if (!title) title = 'Despesa';
      const seenUri = new Set<string>();
      const attachCount = parts.reduce((n, p) => {
        for (const a of p.attachments || []) {
          const u = String(a.uri || '');
          if (u && !seenUri.has(u)) {
            seenUri.add(u);
            n += 1;
          }
        }
        return n;
      }, 0);
      const createdAt = parts[0]?.createdAt || '';
      const splitEditable = isManualSplitRateioEditableInMemory(parts, cloudTasksRaw);
      const splitUnlocked = parts.length > 0 && parts.every((p) => p.financeValueUnlocked === true);
      const splitIds = parts.map((p) => encodeURIComponent(p.id)).join(',');
      const splitInner = (
        <>
          <View style={styles.cardTop}>
            <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
              <Text style={styles.badgeTxt}>Despesa</Text>
            </View>
            <View style={styles.totalBlock}>
              <Text style={styles.totalLbl}>Total</Text>
              <Text style={styles.amt}>{formatBrl(total)}</Text>
            </View>
          </View>
          <Text style={styles.desc} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionTitle}>Detalhes do rateio</Text>
            <Text style={styles.detailsSectionSub}>{parts.length} OS · valor por ordem abaixo</Text>
            {parts.map((p, si) => {
              const tid = p.taskId ? String(p.taskId) : '';
              if (!tid) {
                return (
                  <View key={p.id} style={[si === parts.length - 1 && { marginBottom: 0 }]}>
                    <Text style={styles.splitLineAmt}>{formatBrl(p.amount)}</Text>
                  </View>
                );
              }
              return (
                <View key={p.id} style={{ marginBottom: si === parts.length - 1 ? 0 : 12 }}>
                  <OsLinkedDetailsBlock taskId={tid} taskById={taskById} amountRight={formatBrl(p.amount)} />
                </View>
              );
            })}
          </View>
          {attachCount > 0 ? (
            <View style={styles.attachRow}>
              <Ionicons name="attach-outline" size={14} color="#64748b" />
              <Text style={styles.attachMeta}>
                {attachCount} anexo{attachCount === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatWhen(createdAt)}</Text>
            <Text style={styles.metaOs} numberOfLines={1}>
              · {parts.length} OS · Manual (rateio)
            </Text>
          </View>
          {splitUnlocked ? (
            <View style={styles.editHintRow}>
              <Ionicons name="shield-checkmark-outline" size={15} color="#b45309" />
              <Text style={[styles.editHint, { color: '#b45309' }]}>
                Devolvido para revisão: toque para corrigir valor, descrição ou rateio (todas as OS no telemóvel).
              </Text>
            </View>
          ) : splitEditable ? (
            <View style={styles.editHintRow}>
              <Ionicons name="create-outline" size={15} color="#0f766e" />
              <Text style={styles.editHint}>Toque para ajustar o rateio (OS). Valor e anexos estão fechados.</Text>
            </View>
          ) : (
            <Text style={styles.editHintMuted}>
              Sincronize todas as OS deste rateio neste telemóvel para poder incluir ou remover OS.
            </Text>
          )}
        </>
      );
      return splitEditable || splitUnlocked ? (
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.card, { borderLeftColor: '#ef4444' }]}
          onPress={() => router.push(`/finance/mobile/edit?ids=${splitIds}` as any)}
        >
          {splitInner}
        </TouchableOpacity>
      ) : (
        <View style={[styles.card, { borderLeftColor: '#ef4444' }]}>{splitInner}</View>
      );
    }

    const item = row.entry;
    const osIds = linkedTaskIdsForEntry(item);
    const hasOs = osIds.length > 0;
    const onDevice = manualFinanceLinkedTasksOnDevice(item, cloudTasksRaw);
    const singleUnlocked = item.financeValueUnlocked === true;
    const singleInner = (
      <>
        <View style={styles.cardTop}>
          <View
            style={[
              styles.badge,
              { backgroundColor: item.kind === 'revenue' ? '#d1fae5' : '#fee2e2' },
            ]}
          >
            <Text style={styles.badgeTxt}>{item.kind === 'revenue' ? 'Receita' : 'Despesa'}</Text>
          </View>
          {item.kind === 'expense' ? (
            <View style={styles.totalBlock}>
              <Text style={styles.totalLbl}>Total</Text>
              <Text style={styles.amt}>{formatBrl(item.amount)}</Text>
            </View>
          ) : (
            <Text style={styles.amt}>{formatBrl(item.amount)}</Text>
          )}
        </View>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        {hasOs ? (
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionTitle}>
              {osIds.length > 1 ? 'Detalhes (OS ligadas)' : 'Detalhes da OS'}
            </Text>
            <View style={styles.osDetailsWrap}>
              {osIds.map((tid, oi) => (
                <View key={tid} style={{ marginBottom: oi === osIds.length - 1 ? 0 : 10 }}>
                  <OsLinkedDetailsBlock taskId={tid} taskById={taskById} />
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {item.attachments && item.attachments.length > 0 ? (
          <View style={styles.attachRow}>
            <Ionicons name="attach-outline" size={14} color="#64748b" />
            <Text style={styles.attachMeta}>
              {item.attachments.length} anexo{item.attachments.length === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatWhen(item.createdAt)}</Text>
          {item.source === 'checklist' && hasOs ? (
            <Text style={styles.metaOs} numberOfLines={1}>
              · {osIds.length} OS · Checklist
            </Text>
          ) : item.source === 'manual' && hasOs ? (
            <Text style={styles.metaOs} numberOfLines={1}>
              · {osIds.length} OS · Manual
            </Text>
          ) : item.source === 'manual' ? (
            <Text style={styles.metaOs}> · Manual</Text>
          ) : item.source === 'checklist' ? (
            <Text style={styles.metaOs}> · Checklist</Text>
          ) : null}
        </View>
        {item.source === 'checklist' ? (
          <Text style={styles.editHintMuted}>Altere no formulário da OS.</Text>
        ) : item.source === 'manual' && item.kind === 'expense' && hasOs && singleUnlocked ? (
          <View style={styles.editHintRow}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#b45309" />
            <Text style={[styles.editHint, { color: '#b45309' }]}>
              Devolvido para revisão: toque para corrigir (todas as OS no telemóvel).
            </Text>
          </View>
        ) : item.source === 'manual' && item.kind === 'expense' && hasOs ? (
          <View style={styles.editHintRow}>
            <Ionicons name="create-outline" size={15} color="#0f766e" />
            <Text style={styles.editHint}>
              {onDevice
                ? 'Toque para ajustar a OS (rateio). Valor e anexos estão fechados.'
                : 'Sincronize a OS neste telemóvel para ajustar o vínculo.'}
            </Text>
          </View>
        ) : item.source === 'manual' ? (
          <View style={styles.editHintRow}>
            <Ionicons name="create-outline" size={15} color="#0f766e" />
            <Text style={styles.editHint}>Toque para editar</Text>
          </View>
        ) : null}
      </>
    );
    const singleManualTappable =
      item.source === 'manual' &&
      (item.kind !== 'expense' || !hasOs || onDevice || singleUnlocked);
    return singleManualTappable ? (
      <TouchableOpacity
        activeOpacity={0.88}
        style={[styles.card, { borderLeftColor: item.kind === 'revenue' ? '#10b981' : '#ef4444' }]}
        onPress={() => router.push(`/finance/mobile/edit?ids=${encodeURIComponent(item.id)}` as any)}
      >
        {singleInner}
      </TouchableOpacity>
    ) : (
      <View style={[styles.card, { borderLeftColor: item.kind === 'revenue' ? '#10b981' : '#ef4444' }]}>
        {singleInner}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Financeiro" leftIcon="arrow-back" onLeftPress={() => router.back()} />

      <View style={styles.summary}>
        <View style={styles.sumCol}>
          <Text style={styles.sumLbl}>Despesas</Text>
          <Text style={[styles.sumVal, { color: '#b91c1c' }]}>{formatBrl(totals.exp)}</Text>
        </View>
        <View style={styles.sumCol}>
          <Text style={styles.sumLbl}>Receitas</Text>
          <Text style={[styles.sumVal, { color: '#047857' }]}>{formatBrl(totals.rev)}</Text>
        </View>
        <View style={styles.sumCol}>
          <Text style={styles.sumLbl}>Saldo</Text>
          <Text style={[styles.sumVal, { color: totals.net >= 0 ? '#047857' : '#b91c1c' }]}>
            {formatBrl(totals.net)}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        {(['all', 'expense', 'revenue'] as FilterKey[]).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.chip, filter === k && styles.chipOn]}
            onPress={() => setFilter(k)}
          >
            <Text style={[styles.chipTxt, filter === k && styles.chipTxtOn]}>
              {k === 'all' ? 'Tudo' : k === 'expense' ? 'Despesas' : 'Receitas'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.disclaimer}>
        Separado dos bens e do financeiro de ativos. Sincroniza com a sua conta ao atualizar.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0f766e" />
        </View>
      ) : (
        <FlatList
          data={listRows}
          keyExtractor={(row) => (row.kind === 'single' ? row.entry.id : `split-${row.groupId}`)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh()} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={40} color="#94a3b8" />
              <Text style={styles.emptyTxt}>Nenhum lançamento</Text>
              <Text style={styles.emptySub}>Use + para registar ou preencha o campo no formulário da OS.</Text>
            </View>
          }
          renderItem={renderRow}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/finance/mobile/new' as any)} activeOpacity={0.9}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  sumCol: { flex: 1, minWidth: 0 },
  sumLbl: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
  sumVal: { fontSize: 14, fontWeight: '900', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipOn: { backgroundColor: '#ccfbf1', borderColor: '#99f6e4' },
  chipTxt: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  chipTxtOn: { color: '#0f766e' },
  disclaimer: {
    fontSize: 11,
    color: '#94a3b8',
    paddingHorizontal: 16,
    marginTop: 10,
    lineHeight: 16,
  },
  listContent: { padding: 16, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTxt: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
  totalBlock: { alignItems: 'flex-end' },
  totalLbl: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  amt: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  desc: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 20 },
  osDetailsWrap: { marginTop: 10 },
  osDetailCard: {
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  osDetailHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  osDetailHead: { flex: 1, fontSize: 13, fontWeight: '800', color: '#0f172a' },
  osDetailAmt: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  osDetailLine: { fontSize: 12, color: '#475569', lineHeight: 17, marginTop: 4 },
  osDetailLbl: { fontWeight: '700', color: '#64748b' },
  osDetailMissing: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 },
  detailsSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailsSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 4,
  },
  detailsSectionSub: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 10,
  },
  splitLineAmt: { fontSize: 13, fontWeight: '800', color: '#0f172a', paddingVertical: 4 },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  attachMeta: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
  meta: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  metaOs: { fontSize: 11, color: '#64748b', fontWeight: '700', flex: 1, minWidth: 120 },
  editHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  editHint: { fontSize: 12, fontWeight: '800', color: '#0f766e' },
  editHintMuted: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 8, lineHeight: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTxt: { marginTop: 12, fontSize: 16, fontWeight: '800', color: '#64748b' },
  emptySub: { marginTop: 6, fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 24 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
});
