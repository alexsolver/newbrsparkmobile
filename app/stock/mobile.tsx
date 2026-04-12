import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { TechnicianStockService } from '../../src/services/technicianStockService';
import {
  fetchTechStockMovementSearch,
  TechStockMovementSearchRow,
} from '../../src/services/technicianStockHistoryApi';
import { StockItem, StockMovement } from '../../src/types/stock';
import { useAuth } from '../../src/hooks/useAuth';
import { useManualSync } from '../../src/hooks/useManualSync';
import { labelForTechStockMovement, parseTechStockReason } from '../../src/utils/techStockReason';
import { loadFtCloudTasks } from '../../src/lib/cloudTasksBuckets';

const OFFLINE_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
/** Janelas consultadas no servidor (cada salto = estes dias). */
const SERVER_WINDOW_DAYS = 30;

type TabKey = 'items' | 'history';

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function todayEndLocal(): Date {
  return endOfLocalDay(new Date());
}

function defaultServerThirtyDayWindow(): { fromMs: number; toMs: number } {
  const to = todayEndLocal();
  const from = startOfLocalDay(new Date(to));
  from.setDate(from.getDate() - (SERVER_WINDOW_DAYS - 1));
  return { fromMs: from.getTime(), toMs: to.getTime() };
}

function formatRangePtBR(fromMs: number, toMs: number): string {
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const o = { day: '2-digit' as const, month: '2-digit' as const, year: 'numeric' as const };
  return `${from.toLocaleDateString('pt-BR', o)} — ${to.toLocaleDateString('pt-BR', o)}`;
}

function typeLabel(t: string) {
  switch (String(t).toUpperCase()) {
    case 'IN':
      return 'Entrada';
    case 'OUT':
      return 'Saída';
    case 'ADJUST':
      return 'Ajuste';
    default:
      return t;
  }
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

export default function TechnicianStockScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('items');
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [localMoves30, setLocalMoves30] = useState<StockMovement[]>([]);
  const [itemsById, setItemsById] = useState<Record<string, StockItem>>({});
  const [taskById, setTaskById] = useState<Map<string, { title?: string; osNumber?: string | null }>>(
    () => new Map(),
  );
  /** Filtro texto só no modo offline (últimos 30 dias locais). */
  const [localQuery, setLocalQuery] = useState('');
  const [online, setOnline] = useState(true);
  const [serverWindow, setServerWindow] = useState(defaultServerThirtyDayWindow);
  const [serverRows, setServerRows] = useState<TechStockMovementSearchRow[]>([]);
  const [serverTruncated, setServerTruncated] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await TechnicianStockService.getItems(user?.email || undefined);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  const loadTaskMap = useCallback(async () => {
    try {
      const arr = await loadFtCloudTasks();
      const m = new Map<string, { title?: string; osNumber?: string | null }>();
      if (Array.isArray(arr)) {
        for (const t of arr) {
          if (t?.id) {
            m.set(String(t.id), {
              title: t.title,
              osNumber: t.osNumber ?? t.os_number ?? null,
            });
          }
        }
      }
      setTaskById(m);
    } catch {
      setTaskById(new Map());
    }
  }, []);

  const loadHistoryLocal = useCallback(async () => {
    if (!user?.email) {
      setLocalMoves30([]);
      setItemsById({});
      return;
    }
    const all = await TechnicianStockService.getMovements(user.email);
    const cutoff = Date.now() - OFFLINE_HISTORY_MS;
    const recent = all.filter((m) => {
      const ts = new Date(m.timestamp).getTime();
      return !Number.isNaN(ts) && ts >= cutoff;
    });
    setLocalMoves30(recent);
    const inv = await TechnicianStockService.getItems(user.email);
    setItemsById(Object.fromEntries(inv.map((i) => [i.id, i])));
  }, [user?.email]);

  const refreshOnlineState = useCallback(async () => {
    try {
      const s = await Network.getNetworkStateAsync();
      setOnline(!!s.isConnected && s.isInternetReachable !== false);
    } catch {
      setOnline(false);
    }
  }, []);

  const loadServerHistory = useCallback(async () => {
    if (!user?.email || !online) return;
    setServerLoading(true);
    setServerError(null);
    try {
      const data = await fetchTechStockMovementSearch(
        user.email,
        new Date(serverWindow.fromMs).toISOString(),
        new Date(serverWindow.toMs).toISOString(),
      );
      setServerRows(data.items);
      setServerTruncated(data.truncated);
    } catch (e: any) {
      let msg = e?.message || 'Falha ao carregar o período';
      try {
        const j = JSON.parse(msg);
        if (j?.error) msg = String(j.error);
      } catch {
        /* texto plano */
      }
      setServerError(msg);
      setServerRows([]);
      setServerTruncated(false);
    } finally {
      setServerLoading(false);
    }
  }, [user?.email, online, serverWindow.fromMs, serverWindow.toMs]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadTaskMap();
      refreshOnlineState();
    }, [load, loadTaskMap, refreshOnlineState]),
  );

  useFocusEffect(
    useCallback(() => {
      if (tab === 'history') {
        loadHistoryLocal();
      }
    }, [tab, loadHistoryLocal]),
  );

  useEffect(() => {
    if (tab !== 'history' || !online || !user?.email) return;
    loadServerHistory();
  }, [tab, online, user?.email, serverWindow.fromMs, serverWindow.toMs, loadServerHistory]);

  const canGoForwardServer = useMemo(() => {
    const cap = todayEndLocal().getTime();
    return serverWindow.toMs < cap - 400;
  }, [serverWindow.toMs]);

  const goPrevServerWindow = useCallback(() => {
    setServerWindow((prev) => {
      const from = new Date(prev.fromMs);
      const to = new Date(prev.toMs);
      from.setDate(from.getDate() - SERVER_WINDOW_DAYS);
      to.setDate(to.getDate() - SERVER_WINDOW_DAYS);
      return {
        fromMs: startOfLocalDay(from).getTime(),
        toMs: endOfLocalDay(to).getTime(),
      };
    });
  }, []);

  const goNextServerWindow = useCallback(() => {
    setServerWindow((prev) => {
      const cap = todayEndLocal().getTime();
      if (prev.toMs >= cap - 400) return prev;
      const from = new Date(prev.fromMs);
      const to = new Date(prev.toMs);
      from.setDate(from.getDate() + SERVER_WINDOW_DAYS);
      to.setDate(to.getDate() + SERVER_WINDOW_DAYS);
      let toMs = endOfLocalDay(to).getTime();
      let fromMs = startOfLocalDay(from).getTime();
      if (toMs > cap) {
        toMs = cap;
        const f = startOfLocalDay(new Date(toMs));
        f.setDate(f.getDate() - (SERVER_WINDOW_DAYS - 1));
        fromMs = f.getTime();
      }
      return { fromMs, toMs };
    });
  }, []);

  const resetServerWindowToLatest = useCallback(() => {
    setServerWindow(defaultServerThirtyDayWindow());
  }, []);

  const filteredLocal = useMemo(() => {
    const q = localQuery.trim().toLowerCase();
    if (!q) return localMoves30;
    return localMoves30.filter((m) => {
      const item = itemsById[m.itemId];
      const osLine = labelForTechStockMovement(m.reason, taskById);
      const hay = [
        m.reason,
        m.type,
        String(m.quantity),
        item?.name,
        item?.sku,
        osLine,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [localMoves30, localQuery, itemsById, taskById]);

  const onPullRefresh = useCallback(async () => {
    await refreshOnlineState();
    let isOn = online;
    try {
      const s = await Network.getNetworkStateAsync();
      isOn = !!s.isConnected && s.isInternetReachable !== false;
      setOnline(isOn);
    } catch {
      isOn = false;
      setOnline(false);
    }
    await load();
    if (tab === 'history') {
      await loadHistoryLocal();
      if (isOn && user?.email) await loadServerHistory();
    }
  }, [refreshOnlineState, load, tab, loadHistoryLocal, loadServerHistory, user?.email, online]);

  const { refreshing, onRefresh } = useManualSync(onPullRefresh);

  const renderHistoryCard = (
    type: string,
    quantity: number,
    timestamp: string,
    reason: string | null | undefined,
    materialName: string,
    materialSku: string,
    unitLabel: string,
  ) => {
    const p = parseTechStockReason(reason);
    const adj = p.isAdjustment ? ' (ajuste)' : '';
    const osLine = labelForTechStockMovement(reason ?? null, taskById);
    return (
      <View style={[styles.card, { backgroundColor: C.surfaceLow, borderColor: C.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: C.slate }]} numberOfLines={2}>
            {materialName}
          </Text>
          <Text style={styles.meta}>
            {materialSku} · {typeLabel(type)}
            {adj}
          </Text>
          <Text style={[styles.meta, { marginTop: 6 }]} numberOfLines={2}>
            FT: {osLine}
          </Text>
          {reason && !p.taskId ? (
            <Text style={[styles.reasonRaw, { color: '#94a3b8' }]} numberOfLines={2}>
              {reason}
            </Text>
          ) : null}
          <Text style={[styles.when, { color: '#94a3b8' }]}>{formatWhen(timestamp)}</Text>
        </View>
        <View style={styles.stockCol}>
          <Text style={[styles.stockVal, { color: C.slate }]}>{quantity}</Text>
          <Text style={styles.stockUnit}>{unitLabel}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Estoque técnico" leftIcon="arrow-back" onLeftPress={() => router.back()} />

      <View style={[styles.tabs, { borderColor: C.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'items' && styles.tabBtnActive]}
          onPress={() => setTab('items')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, { color: tab === 'items' ? '#0369a1' : '#64748b' }]}>Materiais</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'history' && styles.tabBtnActive]}
          onPress={() => setTab('history')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, { color: tab === 'history' ? '#0369a1' : '#64748b' }]}>Histórico</Text>
        </TouchableOpacity>
      </View>

      {tab === 'items' ? (
        <>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => router.push('/stock/mobile/new' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text style={styles.newBtnText}>Novo material</Text>
          </TouchableOpacity>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.accent || '#0369a1'} />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(it) => it.id}
              contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh(true)} />}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Ionicons name="cube-outline" size={48} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>Sem materiais</Text>
                  <Text style={styles.emptySub}>
                    Este inventário é só seu: não usa bens nem locais do portfólio. Toque em "Novo material" para
                    começar.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.card, { backgroundColor: C.surfaceLow, borderColor: C.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, { color: C.slate }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {item.sku} · {item.category}
                    </Text>
                  </View>
                  <View style={styles.stockCol}>
                    <Text style={[styles.stockVal, { color: C.slate }]}>{item.currentStock}</Text>
                    <Text style={styles.stockUnit}>{item.unit}</Text>
                  </View>
                </View>
              )}
            />
          )}
        </>
      ) : (
        <View style={{ flex: 1 }}>
          {online ? (
            <View style={[styles.onlinePeriodCard, { borderColor: C.border, backgroundColor: C.surfaceLow }]}>
              <Text style={[styles.periodFieldLabel, { color: '#64748b' }]}>Período no servidor (30 dias)</Text>
              <Text style={[styles.periodFieldValue, { color: C.slate }]} selectable>
                {formatRangePtBR(serverWindow.fromMs, serverWindow.toMs)}
              </Text>
              <View style={styles.periodNavRow}>
                <TouchableOpacity
                  style={[styles.periodNavBtn, { borderColor: C.border }]}
                  onPress={goPrevServerWindow}
                  activeOpacity={0.85}
                >
                  <Ionicons name="chevron-back" size={22} color="#0369a1" />
                  <Text style={styles.periodNavBtnText}>30 dias</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.periodTodayBtn, { backgroundColor: 'rgba(3, 105, 161, 0.12)' }]}
                  onPress={resetServerWindowToLatest}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.periodTodayBtnText, { color: '#0369a1' }]}>Últimos 30 dias</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.periodNavBtn,
                    { borderColor: C.border },
                    !canGoForwardServer && styles.periodNavBtnDisabled,
                  ]}
                  onPress={goNextServerWindow}
                  disabled={!canGoForwardServer}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.periodNavBtnText, !canGoForwardServer && { color: '#94a3b8' }]}>30 dias</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={canGoForwardServer ? '#0369a1' : '#cbd5e1'}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.periodHint}>
                " retrocede 30 dias; " avança em direção a hoje (máx. 30 dias por pedido).
              </Text>
            </View>
          ) : (
            <View style={[styles.searchWrap, { borderColor: C.border, backgroundColor: C.surfaceLow }]}>
              <Ionicons name="search-outline" size={20} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: C.slate }]}
                placeholder="Filtrar últimos 30 dias neste aparelho…"
                placeholderTextColor="#94a3b8"
                value={localQuery}
                onChangeText={setLocalQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {localQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setLocalQuery('')} hitSlop={12}>
                  <Ionicons name="close-circle" size={22} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <View style={styles.banner}>
            <Ionicons name={online ? 'cloud-done-outline' : 'cloud-offline-outline'} size={18} color="#64748b" />
            <Text style={styles.bannerText}>
              {online
                ? 'Online: consulta por janelas de 30 dias no servidor. Offline: até 30 dias só no celular.'
                : 'Sem conexão: mostrando até 30 dias de movimentos guardados neste aparelho. Use o campo acima para filtrar.'}
            </Text>
          </View>

          {serverError && online ? (
            <Text style={styles.errorText}>{serverError}</Text>
          ) : null}

          {serverTruncated && online ? (
            <Text style={styles.warnText}>
              Mostrando as primeiras 5000 movimentações deste período. Afinar o intervalo se precisar de tudo.
            </Text>
          ) : null}

          {online ? (
            <>
              {serverLoading && serverRows.length === 0 ? (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color={C.accent || '#0369a1'} />
                </View>
              ) : (
                <FlatList
                  data={serverRows}
                  keyExtractor={(r) => r.id}
                  contentContainerStyle={serverRows.length === 0 ? styles.emptyList : styles.list}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh(true)} />}
                  ListEmptyComponent={
                    !serverLoading ? (
                      <View style={styles.emptyBox}>
                        <Ionicons name="file-tray-outline" size={48} color="#94a3b8" />
                        <Text style={styles.emptyTitle}>Nenhuma movimentação</Text>
                        <Text style={styles.emptySub}>
                          Não há registros sincronizados neste intervalo de datas. Volte 30 dias com o botão acima ou
                          sincronize.
                        </Text>
                      </View>
                    ) : null
                  }
                  renderItem={({ item: r }) =>
                    renderHistoryCard(
                      r.type,
                      r.quantity,
                      r.timestamp,
                      r.reason,
                      r.itemName || itemsById[r.itemId]?.name || 'Material',
                      r.itemSku || itemsById[r.itemId]?.sku || r.itemId.slice(0, 8),
                      itemsById[r.itemId]?.unit || 'un.',
                    )
                  }
                />
              )}
            </>
          ) : (
            <FlatList
              data={filteredLocal}
              keyExtractor={(m) => m.id}
              contentContainerStyle={filteredLocal.length === 0 ? styles.emptyList : styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh(true)} />}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Ionicons name="time-outline" size={48} color="#94a3b8" />
                  <Text style={styles.emptyTitle}>Sem movimentos recentes</Text>
                  <Text style={styles.emptySub}>
                    Neste dispositivo guardamos as movimentações dos últimos 30 dias para consulta offline.
                  </Text>
                </View>
              }
              renderItem={({ item: m }) => {
                const it = itemsById[m.itemId];
                return renderHistoryCard(
                  m.type,
                  m.quantity,
                  m.timestamp,
                  m.reason,
                  it?.name || 'Material',
                  it?.sku || m.itemId.slice(0, 8),
                  it?.unit || 'un.',
                );
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: 'transparent' },
  tabBtnActive: { backgroundColor: 'rgba(3, 105, 161, 0.08)' },
  tabText: { fontWeight: '800', fontSize: 14 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0369a1',
  },
  newBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16, paddingBottom: 32 },
  emptyList: { flexGrow: 1, padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  reasonRaw: { fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  when: { fontSize: 11, marginTop: 6 },
  stockCol: { alignItems: 'flex-end', marginLeft: 12 },
  stockVal: { fontSize: 20, fontWeight: '800' },
  stockUnit: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '800', color: '#475569' },
  emptySub: { marginTop: 8, fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 24 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  onlinePeriodCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  periodFieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  periodFieldValue: { fontSize: 16, fontWeight: '800', marginTop: 6 },
  periodNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  periodNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  periodNavBtnDisabled: { opacity: 0.55 },
  periodNavBtnText: { fontSize: 13, fontWeight: '800', color: '#0369a1' },
  periodTodayBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 0,
  },
  periodTodayBtnText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  periodHint: { fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 15 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  bannerText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 17 },
  errorText: { color: '#b91c1c', fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  warnText: { color: '#b45309', fontSize: 12, marginHorizontal: 16, marginBottom: 8, lineHeight: 16 },
});
