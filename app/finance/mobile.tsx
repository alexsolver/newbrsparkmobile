import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { ScreenSubheader } from '../../src/components/ScreenSubheader';
import { TechnicianFinanceDashboard } from '../../src/components/TechnicianFinanceDashboard';
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
import { loadFtCloudTasks } from '../../src/lib/cloudTasksBuckets';
import {
  loadTechnicianExpenseCategoryCatalog,
  labelForTechnicianExpenseCategory,
  type TechnicianExpenseCategoryRow,
} from '../../src/utils/technicianExpenseCategoryCatalog';

function formatBrl(n: number, localeTag: string) {
  const loc = localeTag.replace('_', '-');
  return (Number(n) || 0).toLocaleString(loc, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function formatWhen(iso: string, localeTag: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const loc = localeTag.replace('_', '-');
    return d.toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string, localeTag: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const loc = localeTag.replace('_', '-');
    return d.toLocaleDateString(loc, { dateStyle: 'short' });
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
  const { t } = useTranslation();
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
              <Text style={styles.osDetailLbl}>{t('technicianMobile.financeOsRequester')} </Text>
              {inf.requester}
            </Text>
          ) : null}
          {inf.location ? (
            <Text style={styles.osDetailLine} numberOfLines={2}>
              <Text style={styles.osDetailLbl}>{t('technicianMobile.financeOsLocation')} </Text>
              {inf.location}
            </Text>
          ) : null}
          {inf.activityTitle ? (
            <Text style={styles.osDetailLine} numberOfLines={2}>
              <Text style={styles.osDetailLbl}>{t('technicianMobile.financeOsActivity')} </Text>
              {inf.activityTitle}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.osDetailMissing}>{t('technicianMobile.financeOsDetailMissing')}</Text>
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

/** Índice da parte a partir da descrição "(rateio i/n)". */
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

function ExpenseCategoryRow({
  catalog,
  categoryKey,
}: {
  catalog: TechnicianExpenseCategoryRow[];
  categoryKey?: string | null;
}) {
  if (!categoryKey || String(categoryKey).trim() === '') return null;
  const lbl = labelForTechnicianExpenseCategory(catalog, categoryKey);
  if (!lbl) return null;
  const meta = catalog.find((c) => c.id === categoryKey);
  const col = meta?.color || '#64748b';
  return (
    <View style={styles.expenseCatRow}>
      {meta?.icon ? (
        <Ionicons name={meta.icon as any} size={15} color={col} style={{ marginRight: 6 }} />
      ) : null}
      <Text style={[styles.expenseCatTxt, { color: col }]} numberOfLines={2}>
        {lbl}
      </Text>
    </View>
  );
}

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
  const { t, i18n } = useTranslation();
  const localeTag = i18n.language || 'pt-BR';
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const pagerRef = useRef<PagerView>(null);
  const [items, setItems] = useState<TechnicianFinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [financePage, setFinancePage] = useState(0);
  const [taskById, setTaskById] = useState<Map<string, CloudTaskFinanceInfo>>(() => new Map());
  const [cloudTasksRaw, setCloudTasksRaw] = useState<any[]>([]);
  const [expenseCatCatalog, setExpenseCatCatalog] = useState<TechnicianExpenseCategoryRow[]>(() =>
    loadTechnicianExpenseCategoryCatalog()
  );
  /** Detalhes do rateio por grupo (cartão principal compacto; rateio em menu retrátil). */
  const [splitRateioOpen, setSplitRateioOpen] = useState<Record<string, boolean>>({});
  const [confirmingRevId, setConfirmingRevId] = useState<string | null>(null);

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
      const list = await loadFtCloudTasks();
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
      setExpenseCatCatalog(loadTechnicianExpenseCategoryCatalog());
      load();
      loadTaskMap();
    }, [load, loadTaskMap])
  );

  const confirmRevenueReceived = useCallback(
    async (id: string) => {
      try {
        setConfirmingRevId(id);
        await TechnicianFinanceService.markRevenueAsReceived(id, user?.email || undefined);
        await load();
      } catch (e: any) {
        Alert.alert(
          t('common.error'),
          e?.message || t('technicianMobile.financeConfirmReceiptError'),
        );
      } finally {
        setConfirmingRevId(null);
      }
    },
    [load, user?.email, t]
  );

  const listRowsExpense = useMemo(
    () => buildFinanceListRows(items.filter((x) => x.kind === 'expense'), user?.email),
    [items, user?.email],
  );
  const listRowsRevenue = useMemo(
    () => buildFinanceListRows(items.filter((x) => x.kind === 'revenue'), user?.email),
    [items, user?.email],
  );

  const goFinancePage = useCallback((index: number) => {
    const i = Math.max(0, Math.min(2, index));
    setFinancePage(i);
    pagerRef.current?.setPage(i);
  }, []);

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
      if (!title) title = t('technicianMobile.financeDefaultExpenseTitle');
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
      const rateioOpen = splitRateioOpen[row.groupId] === true;
      const toggleRateio = () =>
        setSplitRateioOpen((m) => ({ ...m, [row.groupId]: !m[row.groupId] }));
      const splitInner = (
        <>
          <View style={styles.cardTop}>
            <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
              <Text style={styles.badgeTxt}>{t('technicianMobile.financeKindExpense')}</Text>
            </View>
            <View style={styles.totalBlock}>
              <Text style={styles.totalLbl}>{t('technicianMobile.financeTotalLabel')}</Text>
              <Text style={styles.amt}>{formatBrl(total, localeTag)}</Text>
            </View>
          </View>
          <ExpenseCategoryRow catalog={expenseCatCatalog} categoryKey={parts[0]?.categoryKey} />
          <Text style={styles.desc} numberOfLines={3}>
            {title}
          </Text>
          <Text style={styles.rateioPrincipalHint}>
            {parts.length === 1
              ? t('technicianMobile.financeRateioPrincipalOne')
              : t('technicianMobile.financeRateioPrincipalMany', { count: parts.length })}
          </Text>
          <TouchableOpacity
            style={styles.rateioToggle}
            onPress={toggleRateio}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ expanded: rateioOpen }}
            accessibilityLabel={
              rateioOpen
                ? t('technicianMobile.financeRateioToggleHideA11y')
                : t('technicianMobile.financeRateioToggleShowA11y')
            }
          >
            <Text style={styles.rateioToggleTxt}>
              {rateioOpen ? t('technicianMobile.financeRateioToggleHide') : t('technicianMobile.financeRateioToggleShow')}
            </Text>
            <Ionicons name={rateioOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#475569" />
          </TouchableOpacity>
          {rateioOpen ? (
            <View style={styles.detailsSection}>
              <Text style={styles.detailsSectionTitle}>{t('technicianMobile.financeRateioSectionTitle')}</Text>
              <Text style={styles.detailsSectionSub}>
                {t('technicianMobile.financeRateioSectionSub', { count: parts.length })}
              </Text>
              {parts.map((p, si) => {
                const tid = p.taskId ? String(p.taskId) : '';
                if (!tid) {
                  return (
                    <View key={p.id} style={[si === parts.length - 1 && { marginBottom: 0 }]}>
                      <Text style={styles.splitLineAmt}>{formatBrl(p.amount, localeTag)}</Text>
                    </View>
                  );
                }
                return (
                  <View key={p.id} style={{ marginBottom: si === parts.length - 1 ? 0 : 12 }}>
                    <OsLinkedDetailsBlock
                      taskId={tid}
                      taskById={taskById}
                      amountRight={formatBrl(p.amount, localeTag)}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}
          {attachCount > 0 ? (
            <View style={styles.attachRow}>
              <Ionicons name="attach-outline" size={14} color="#64748b" />
              <Text style={styles.attachMeta}>
                {attachCount === 1
                  ? t('technicianMobile.financeAttachmentSingular', { count: attachCount })
                  : t('technicianMobile.financeAttachmentPlural', { count: attachCount })}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatWhen(createdAt, localeTag)}</Text>
            <Text style={styles.metaOs} numberOfLines={1}>
              {t('technicianMobile.financeMetaManualRateio', { count: parts.length })}
            </Text>
          </View>
          {splitUnlocked ? (
            <View style={styles.editHintRow}>
              <Ionicons name="shield-checkmark-outline" size={15} color="#b45309" />
              <Text style={[styles.editHint, { color: '#b45309' }]}>
                {t('technicianMobile.financeReturnedReviewSplit')}
              </Text>
            </View>
          ) : splitEditable ? (
            <View style={styles.editHintRow}>
              <Ionicons name="create-outline" size={15} color="#0f766e" />
              <Text style={styles.editHint}>{t('technicianMobile.financeAdjustSplitOnDevice')}</Text>
            </View>
          ) : (
            <Text style={styles.editHintMuted}>{t('technicianMobile.financeAdjustSingleSync')}</Text>
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
            <Text style={styles.badgeTxt}>
              {item.kind === 'revenue'
                ? t('technicianMobile.financeKindRevenue')
                : t('technicianMobile.financeKindExpense')}
            </Text>
          </View>
          {item.kind === 'expense' ? (
            <View style={styles.totalBlock}>
              <Text style={styles.totalLbl}>{t('technicianMobile.financeTotalLabel')}</Text>
              <Text style={styles.amt}>{formatBrl(item.amount, localeTag)}</Text>
            </View>
          ) : (
            <Text style={styles.amt}>{formatBrl(item.amount, localeTag)}</Text>
          )}
        </View>
        {item.kind === 'revenue' ? (
          <View style={styles.revenueStatusBlock}>
            {item.source === 'checklist' && !item.receiptRealizedAt ? (
              <>
                <View style={[styles.revStatusBadge, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
                  <Ionicons name="time-outline" size={16} color="#92400e" />
                  <Text style={[styles.revStatusBadgeTxt, { color: '#92400e' }]} numberOfLines={2}>
                    {t('technicianMobile.financeRevenueStatusBooked')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.revConfirmBtn}
                  onPress={() => confirmRevenueReceived(item.id)}
                  disabled={confirmingRevId === item.id}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={t('technicianMobile.financeRevenueConfirm')}
                >
                  {confirmingRevId === item.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="cash-outline" size={18} color="#fff" />
                      <Text style={styles.revConfirmBtnTxt}>{t('technicianMobile.financeRevenueConfirm')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={[styles.revStatusBadge, { backgroundColor: '#ecfdf5', borderColor: '#86efac' }]}>
                <Ionicons name="checkmark-circle" size={16} color="#047857" />
                <Text style={[styles.revStatusBadgeTxt, { color: '#065f46' }]} numberOfLines={3}>
                  {t('technicianMobile.financeRevenueStatusRealized')}
                  {item.receiptRealizedAt
                    ? ` · ${formatDateShort(item.receiptRealizedAt, localeTag)}`
                    : item.source === 'manual'
                      ? ` · ${formatDateShort(item.createdAt, localeTag)}`
                      : ''}
                </Text>
              </View>
            )}
          </View>
        ) : null}
        <ExpenseCategoryRow
          catalog={expenseCatCatalog}
          categoryKey={item.kind === 'expense' ? item.categoryKey : null}
        />
        {item.description ? (
          <Text style={styles.desc} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        {hasOs ? (
          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionTitle}>
              {osIds.length > 1
                ? t('technicianMobile.financeOsDetailsMulti')
                : t('technicianMobile.financeOsDetailsSingle')}
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
              {item.attachments.length === 1
                ? t('technicianMobile.financeAttachmentSingular', { count: item.attachments.length })
                : t('technicianMobile.financeAttachmentPlural', { count: item.attachments.length })}
            </Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatWhen(item.createdAt, localeTag)}</Text>
          {item.source === 'checklist' && hasOs ? (
            <Text style={styles.metaOs} numberOfLines={1}>
              {t('technicianMobile.financeMetaOsChecklist', { count: osIds.length })}
            </Text>
          ) : item.source === 'manual' && hasOs ? (
            <Text style={styles.metaOs} numberOfLines={1}>
              {t('technicianMobile.financeMetaOsManual', { count: osIds.length })}
            </Text>
          ) : item.source === 'manual' ? (
            <Text style={styles.metaOs}>{t('technicianMobile.financeMetaManualOnly')}</Text>
          ) : item.source === 'checklist' ? (
            <Text style={styles.metaOs}>{t('technicianMobile.financeMetaChecklistOnly')}</Text>
          ) : null}
        </View>
        {item.source === 'checklist' && item.kind !== 'revenue' ? (
          <Text style={styles.editHintMuted}>{t('technicianMobile.financeEditOnChecklist')}</Text>
        ) : item.source === 'checklist' && item.kind === 'revenue' ? (
          <Text style={styles.editHintMuted}>
            {t('technicianMobile.financeRevenueChecklistHint')}
          </Text>
        ) : item.source === 'manual' && item.kind === 'expense' && hasOs && singleUnlocked ? (
          <View style={styles.editHintRow}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#b45309" />
            <Text style={[styles.editHint, { color: '#b45309' }]}>
              {t('technicianMobile.financeReturnedReviewSingle')}
            </Text>
          </View>
        ) : item.source === 'manual' && item.kind === 'expense' && hasOs ? (
          <View style={styles.editHintRow}>
            <Ionicons name="create-outline" size={15} color="#0f766e" />
            <Text style={styles.editHint}>
              {onDevice ? t('technicianMobile.financeAdjustOsOnDevice') : t('technicianMobile.financeAdjustOsSync')}
            </Text>
          </View>
        ) : item.source === 'manual' ? (
          <View style={styles.editHintRow}>
            <Ionicons name="create-outline" size={15} color="#0f766e" />
            <Text style={styles.editHint}>{t('technicianMobile.financeEditTap')}</Text>
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
      <ScreenSubheader
        title={t('technicianMobile.financeScreenTitle')}
        subtitle={t('technicianMobile.financeScreenSubtitle')}
        onBack={() => router.back()}
        onRightPress={() => onRefresh()}
        rightLoading={refreshing}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0f766e" />
        </View>
      ) : (
        <>
          <View style={[styles.tabBar, { borderColor: C.border, backgroundColor: C.cardWhite }]}>
            {(
              [
                { i: 0, label: t('technicianMobile.financeTabDashboard') },
                { i: 1, label: t('technicianMobile.financeTabExpenses') },
                { i: 2, label: t('technicianMobile.financeTabRevenue') },
              ] as const
            ).map(({ i, label }) => {
              const on = financePage === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.tabCell,
                    on && { borderBottomColor: C.accent, backgroundColor: `${C.accent}12` },
                  ]}
                  onPress={() => goFinancePage(i)}
                  activeOpacity={0.85}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.tabLabel, { color: on ? C.accent : C.textSecondary }]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <PagerView
            ref={pagerRef}
            style={styles.pager}
            initialPage={0}
            onPageSelected={(e) => setFinancePage(e.nativeEvent.position)}
          >
            <View key="dash" style={styles.page} collapsable={false}>
              <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh()} />}
                contentContainerStyle={styles.tabScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.summary, { backgroundColor: C.surfaceLow, borderColor: C.border }]}>
                  <View style={styles.sumCol}>
                    <Text style={[styles.sumLbl, { color: C.textSecondary }]}>
                      {t('technicianMobile.financeSummaryExpenses')}
                    </Text>
                    <Text style={[styles.sumVal, { color: '#b91c1c' }]}>{formatBrl(totals.exp, localeTag)}</Text>
                  </View>
                  <View style={styles.sumCol}>
                    <Text style={[styles.sumLbl, { color: C.textSecondary }]}>
                      {t('technicianMobile.financeSummaryRevenue')}
                    </Text>
                    <Text style={[styles.sumVal, { color: '#047857' }]}>{formatBrl(totals.rev, localeTag)}</Text>
                  </View>
                  <View style={styles.sumCol}>
                    <Text style={[styles.sumLbl, { color: C.textSecondary }]}>
                      {t('technicianMobile.financeSummaryBalance')}
                    </Text>
                    <Text style={[styles.sumVal, { color: totals.net >= 0 ? '#047857' : '#b91c1c' }]}>
                      {formatBrl(totals.net, localeTag)}
                    </Text>
                  </View>
                </View>
                <TechnicianFinanceDashboard items={items} expenseCatCatalog={expenseCatCatalog} />
                <Text style={[styles.disclaimer, { color: C.textLight }]}>
                  {t('technicianMobile.financeDisclaimer')}
                </Text>
              </ScrollView>
            </View>

            <View key="exp" style={styles.page} collapsable={false}>
              <FlatList
                data={listRowsExpense}
                keyExtractor={(row) => (row.kind === 'single' ? row.entry.id : `split-${row.groupId}`)}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh()} />}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="trending-down-outline" size={40} color="#94a3b8" />
                    <Text style={styles.emptyTxt}>{t('technicianMobile.financeEmptyExpensesTitle')}</Text>
                    <Text style={styles.emptySub}>{t('technicianMobile.financeEmptyExpensesBody')}</Text>
                  </View>
                }
                renderItem={renderRow}
              />
            </View>

            <View key="rev" style={styles.page} collapsable={false}>
              <FlatList
                data={listRowsRevenue}
                keyExtractor={(row) => (row.kind === 'single' ? row.entry.id : `split-${row.groupId}`)}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh()} />}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="trending-up-outline" size={40} color="#94a3b8" />
                    <Text style={styles.emptyTxt}>{t('technicianMobile.financeEmptyRevenueTitle')}</Text>
                    <Text style={styles.emptySub}>{t('technicianMobile.financeEmptyRevenueBody')}</Text>
                  </View>
                }
                renderItem={renderRow}
              />
            </View>
          </PagerView>
        </>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/finance/mobile/new' as any)} activeOpacity={0.9}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabScrollContent: { padding: 16, paddingBottom: 100 },
  summary: {
    flexDirection: 'row',
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  sumCol: { flex: 1, minWidth: 0 },
  sumLbl: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
  sumVal: { fontSize: 14, fontWeight: '900', marginTop: 4 },
  disclaimer: {
    fontSize: 11,
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
  revenueStatusBlock: { marginTop: 10, gap: 10 },
  revStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  revStatusBadgeTxt: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  revConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#047857',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  revConfirmBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
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
  expenseCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  expenseCatTxt: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
  desc: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 20 },
  rateioPrincipalHint: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 17,
  },
  rateioToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rateioToggleTxt: { fontSize: 13, fontWeight: '800', color: '#334155' },
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
