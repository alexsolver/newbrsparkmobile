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
import { TechnicianFinanceService } from '../../src/services/technicianFinanceService';
import type { TechnicianFinanceEntry } from '../../src/types/technicianFinance';
import { useAuth } from '../../src/hooks/useAuth';
import { useManualSync } from '../../src/hooks/useManualSync';

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

export default function TechnicianFinanceScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<TechnicianFinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [taskById, setTaskById] = useState<Map<string, { title?: string; osNumber?: string | null }>>(
    () => new Map()
  );

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

  const { refreshing, onRefresh } = useManualSync(async () => {
    await load();
  });

  useFocusEffect(
    useCallback(() => {
      load();
      loadTaskMap();
    }, [load, loadTaskMap])
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((x) => x.kind === filter);
  }, [items, filter]);

  const totals = useMemo(() => {
    let exp = 0;
    let rev = 0;
    for (const x of items) {
      if (x.kind === 'expense') exp += x.amount;
      else rev += x.amount;
    }
    return { exp, rev, net: rev - exp };
  }, [items]);

  const renderItem = ({ item }: { item: TechnicianFinanceEntry }) => {
    const task = item.taskId ? taskById.get(String(item.taskId)) : undefined;
    const osHint =
      task?.osNumber != null && String(task.osNumber).trim() !== ''
        ? `OS ${String(task.osNumber).trim()}`
        : task?.title
          ? String(task.title).slice(0, 48)
          : item.taskId
            ? `Execução ${String(item.taskId).slice(0, 8)}…`
            : null;
    return (
      <View style={[styles.card, { borderLeftColor: item.kind === 'revenue' ? '#10b981' : '#ef4444' }]}>
        <View style={styles.cardTop}>
          <View
            style={[
              styles.badge,
              { backgroundColor: item.kind === 'revenue' ? '#d1fae5' : '#fee2e2' },
            ]}
          >
            <Text style={styles.badgeTxt}>{item.kind === 'revenue' ? 'Receita' : 'Despesa'}</Text>
          </View>
          <Text style={styles.amt}>{formatBrl(item.amount)}</Text>
        </View>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatWhen(item.createdAt)}</Text>
          {item.source === 'checklist' && osHint ? (
            <Text style={styles.metaOs} numberOfLines={1}>
              · {osHint}
            </Text>
          ) : item.source === 'manual' ? (
            <Text style={styles.metaOs}> · Manual</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Financeiro técnico" leftIcon="arrow-back" onLeftPress={() => router.back()} />

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
          data={filtered}
          keyExtractor={(it) => it.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => onRefresh()} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={40} color="#94a3b8" />
              <Text style={styles.emptyTxt}>Nenhum lançamento</Text>
              <Text style={styles.emptySub}>Use + para registar ou preencha o campo no formulário da OS.</Text>
            </View>
          }
          renderItem={renderItem}
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
  amt: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  desc: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
  meta: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  metaOs: { fontSize: 11, color: '#64748b', fontWeight: '700', flex: 1, minWidth: 120 },
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
