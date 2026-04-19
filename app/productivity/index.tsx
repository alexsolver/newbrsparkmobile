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
import { apiFetch } from '../../src/services/auth';
import { ScreenSubheader } from '../../src/components/ScreenSubheader';
import { TechnicianEvaluationsDashboard } from '../../src/components/TechnicianEvaluationsDashboard';
import { EvaluationBadge } from '../../src/components/EvaluationBadge';
import { instanceStatusTone, scoreBandTone } from '../../src/utils/evaluationDisplay';
import { trInstanceStatus, trScoreBand } from '../../src/utils/evaluationLabelsI18n';

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
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<InstanceRow[]>([]);
  const [sort, setSort] = useState<'critical' | 'neutral' | 'positive'>('critical');
  const [tab, setTab] = useState<'panel' | 'list'>('panel');
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

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenSubheader
        title={t('productivity.title')}
        subtitle={t('productivity.screenSubtitle')}
        onBack={() => router.back()}
        onRightPress={() => void load()}
        rightLoading={loading}
      />

      {loading && !summary ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={[styles.tabBar, { borderColor: C.divider, backgroundColor: C.cardWhite }]}>
              <TouchableOpacity
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'panel' }}
                onPress={() => setTab('panel')}
                style={[
                  styles.tabBtn,
                  tab === 'panel' && { borderBottomColor: C.accent, backgroundColor: `${C.accent}14` },
                ]}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: 14,
                    color: tab === 'panel' ? C.accent : C.textSecondary,
                  }}
                >
                  {t('productivity.tabPanel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === 'list' }}
                onPress={() => setTab('list')}
                style={[
                  styles.tabBtn,
                  tab === 'list' && { borderBottomColor: C.accent, backgroundColor: `${C.accent}14` },
                ]}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: 14,
                    color: tab === 'list' ? C.accent : C.textSecondary,
                  }}
                >
                  {t('productivity.tabList')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {error ? (
            <Text style={{ color: C.destructive, marginBottom: 12, paddingHorizontal: 16 }}>{error}</Text>
          ) : null}

          {tab === 'panel' ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {summary ? (
                <TechnicianEvaluationsDashboard colors={C} summary={summary} items={items} />
              ) : null}
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {(summary?.criticalPendingAckCount ?? 0) > 0 ? (
                <View style={[styles.alertBanner, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                  <Ionicons name="warning" size={20} color={C.destructive} />
                  <Text style={[styles.alertText, { color: '#991b1b' }]}>
                    {t('productivity.criticalAckBanner', { count: summary?.criticalPendingAckCount ?? 0 })}
                  </Text>
                </View>
              ) : null}

              <View style={styles.sortRow}>
                {(['critical', 'neutral', 'positive'] as const).map((k) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setSort(k)}
                    style={[
                      styles.sortChip,
                      {
                        borderColor: sort === k ? C.accent : C.divider,
                        backgroundColor: sort === k ? `${C.accent}18` : C.cardWhite,
                      },
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
                        {it.osNumber ? `OS ${it.osNumber} · ` : ''}
                        {new Date(it.createdAt).toLocaleString()}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <EvaluationBadge
                          label={trInstanceStatus(t, it.status)}
                          tone={instanceStatusTone(it.status)}
                          size="sm"
                        />
                        {it.score ? (
                          <EvaluationBadge
                            label={trScoreBand(t, it.score.classification)}
                            tone={scoreBandTone(it.score.classification)}
                            size="sm"
                          />
                        ) : null}
                      </View>
                    </View>
                    {it.score ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: C.accent, fontWeight: '900', fontSize: 22 }}>
                          {Math.round(it.score.totalScore)}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.textLight, fontWeight: '600' }}>
                          {t('productivity.scoreLevel')}
                        </Text>
                      </View>
                    ) : (
                      <Ionicons name="time-outline" size={22} color={C.textLight} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
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
