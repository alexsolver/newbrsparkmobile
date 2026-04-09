import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../src/services/auth';

type Summary = {
  averageTotal: number | null;
  trend: 'up' | 'down' | 'flat';
  categoryAverages: Record<string, number | null>;
  criticalCount: number;
  criticalPendingAckCount: number;
  respondedCount: number;
};

type InstanceRow = {
  id: string;
  status: string;
  createdAt: string;
  template: { name: string; type: string };
  osNumber: string | null;
  score: { totalScore: number; classification: string } | null;
};

export default function ProductivityIndexScreen() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<InstanceRow[]>([]);
  const [sort, setSort] = useState<'critical' | 'neutral' | 'positive'>('critical');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        apiFetch('/api/evaluations/me/summary'),
        apiFetch(`/api/evaluations/me/instances?sort=${encodeURIComponent(sort)}`),
      ]);
      if (!r1.ok) throw new Error((await r1.json().catch(() => ({}))).error || 'summary');
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || 'instances');
      setSummary(await r1.json());
      const j2 = await r2.json();
      setItems(j2.items || []);
    } catch (e: any) {
      setError(e?.message || t('productivity.loadError'));
    } finally {
      setLoading(false);
    }
  }, [sort, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  useEffect(() => {
    setLoading(true);
    load();
  }, [sort]);

  const trendIcon =
    summary?.trend === 'up' ? 'trending-up' : summary?.trend === 'down' ? 'trending-down' : 'remove';

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { borderBottomColor: C.divider, paddingTop: 8 + insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={C.accent} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.slate }]}>{t('productivity.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && !summary ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}
        >
          {error ? (
            <Text style={{ color: C.destructive, marginBottom: 12 }}>{error}</Text>
          ) : null}

          <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
            <Text style={[styles.cardTitle, { color: C.textSecondary }]}>{t('productivity.average')}</Text>
            <View style={styles.rowCenter}>
              <Text style={[styles.bigNum, { color: C.slate }]}>
                {summary?.averageTotal != null ? summary.averageTotal.toFixed(1) : '—'}
              </Text>
              {summary?.averageTotal != null ? (
                <Ionicons
                  name={trendIcon as any}
                  size={28}
                  color={summary.trend === 'up' ? '#16a34a' : summary.trend === 'down' ? C.destructive : C.textLight}
                  style={{ marginLeft: 8 }}
                />
              ) : null}
            </View>
            <Text style={[styles.muted, { color: C.textLight }]}>
              {t('productivity.respondedCount', { count: summary?.respondedCount ?? 0 })}
            </Text>
          </View>

          {(summary?.criticalPendingAckCount ?? 0) > 0 ? (
            <View style={[styles.alertBanner, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
              <Ionicons name="warning" size={20} color={C.destructive} />
              <Text style={[styles.alertText, { color: '#991b1b' }]}>
                {t('productivity.criticalAckBanner', { count: summary!.criticalPendingAckCount })}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t('productivity.categories')}</Text>
          <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
            {['qualidade', 'prazo', 'atendimento'].map((k) => (
              <View key={k} style={styles.catRow}>
                <Text style={{ color: C.slate, fontWeight: '700' }}>{t(`productivity.cat.${k}`)}</Text>
                <Text style={{ color: C.accent, fontWeight: '800' }}>
                  {summary?.categoryAverages?.[k] != null ? `${summary.categoryAverages[k]}` : '—'}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.sortRow}>
            {(['critical', 'neutral', 'positive'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                onPress={() => setSort(k)}
                style={[
                  styles.sortChip,
                  { borderColor: sort === k ? C.accent : C.divider, backgroundColor: sort === k ? `${C.accent}18` : C.cardWhite },
                ]}
              >
                <Text style={{ color: sort === k ? C.accent : C.textSecondary, fontWeight: '800', fontSize: 12 }}>
                  {t(`productivity.sort.${k}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t('productivity.listTitle')}</Text>
          {items.length === 0 ? (
            <Text style={{ color: C.textLight }}>{t('productivity.emptyList')}</Text>
          ) : (
            items.map((it) => (
              <TouchableOpacity
                key={it.id}
                onPress={() => router.push(`/productivity/${it.id}` as any)}
                style={[styles.listItem, { backgroundColor: C.cardWhite, borderColor: C.divider }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.slate, fontWeight: '800' }} numberOfLines={1}>
                    {it.template?.name || '—'}
                  </Text>
                  <Text style={{ color: C.textLight, fontSize: 12, marginTop: 4 }}>
                    {it.osNumber ? `${it.osNumber} · ` : ''}
                    {new Date(it.createdAt).toLocaleString()}
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: 11, marginTop: 2 }}>{it.status}</Text>
                </View>
                {it.score ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: C.accent, fontWeight: '900', fontSize: 18 }}>
                      {Math.round(it.score.totalScore)}
                    </Text>
                    <Text style={{ fontSize: 10, color: C.textLight }}>{it.score.classification}</Text>
                  </View>
                ) : (
                  <Ionicons name="time-outline" size={22} color={C.textLight} />
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '900' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  bigNum: { fontSize: 36, fontWeight: '900' },
  muted: { marginTop: 8, fontSize: 13 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  alertText: { flex: 1, fontWeight: '700', fontSize: 13 },
  sectionLabel: { fontWeight: '800', marginBottom: 8, marginTop: 4 },
  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
});
