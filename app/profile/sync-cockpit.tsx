import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ApiService } from '../../src/services/api';
import { getLocalSyncHealthSnapshot } from '../../src/services/syncService';
import { useAuth } from '../../src/hooks/useAuth';
import { useConnectivity } from '../../src/hooks/useConnectivity';

export default function SyncCockpitScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [snap, setSnap] = useState<Awaited<ReturnType<typeof getLocalSyncHealthSnapshot>> | null>(
    null,
  );

  const load = useCallback(
    async (soft = false) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      try {
        const s = await getLocalSyncHealthSnapshot(user?.email || undefined);
        setSnap(s);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.email],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const ok = await ApiService.sync(user?.email || undefined);
      if (ok) {
        Alert.alert(t('profile.syncSuccess'));
      } else {
        Alert.alert(t('profile.syncFailed'));
      }
      await load(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('common.error'), msg);
    } finally {
      setSyncing(false);
    }
  }, [load, t, user?.email]);

  const netLabel =
    isOnline === null
      ? t('profile.syncCockpitChecking')
      : isOnline
        ? t('profile.syncCockpitOnline')
        : t('profile.syncCockpitOffline');

  const lastSyncText =
    snap?.lastFullSyncAtMs != null
      ? new Date(snap.lastFullSyncAtMs).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : t('profile.syncCockpitNever');

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color="#1e293b" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('profile.syncCockpitTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#15803D" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <View style={s.card}>
            <Text style={s.cardTitle}>{t('profile.syncCockpitSubtitle')}</Text>
            <Row label={t('profile.syncCockpitNetwork')} value={netLabel} />
            <Row label={t('profile.syncCockpitLastFullSync')} value={lastSyncText} />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>{t('profile.syncCockpitQueues')}</Text>
            <Row label={t('profile.syncCockpitChecklistOutbox')} value={String(snap?.checklistOutboxCount ?? 0)} />
            <Row label={t('profile.syncCockpitConflicts')} value={String(snap?.conflictCount ?? 0)} />
            <Row label={t('profile.syncCockpitGenericQueue')} value={String(snap?.genericQueueCount ?? 0)} />
            <Row
              label={t('profile.syncCockpitExecutionStatus')}
              value={String(snap?.executionStatusOutboxCount ?? 0)}
            />
            <Row label={t('profile.syncCockpitTelemetry')} value={String(snap?.telemetryPendingCount ?? 0)} />
          </View>

          <View style={s.actions}>
            <TouchableOpacity
              style={[s.btnPrimary, syncing ? s.btnDisabled : null]}
              disabled={syncing}
              onPress={() => void onSyncNow()}
            >
              <Text style={s.btnPrimaryText}>
                {syncing ? t('profile.connecting') : t('profile.syncCockpitSyncNow')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnSecondary} onPress={() => router.push('/profile/sync-conflicts' as any)}>
              <Text style={s.btnSecondaryText}>{t('profile.syncCockpitOpenConflicts')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.hint}>{t('profile.syncCockpitHint')}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: '#0F172A', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  rowLabel: { flex: 1, fontSize: 12, color: '#64748B', fontWeight: '600' },
  rowValue: { fontSize: 12, color: '#0F172A', fontWeight: '700', maxWidth: '48%', textAlign: 'right' },
  actions: { marginHorizontal: 16, marginTop: 20, gap: 10 },
  btnPrimary: {
    backgroundColor: '#15803D',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSecondary: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#0F172A', fontWeight: '800', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  hint: {
    marginHorizontal: 20,
    marginTop: 16,
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
  },
});
