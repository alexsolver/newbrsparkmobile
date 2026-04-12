import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DatePickerButton from '../src/components/DatePickerButton';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import {
  loadProviderOsSearchRows,
  type ProviderOsSearchRow,
} from '../src/services/providerOsSearchData';
import { MEDIA_TAG_COLORS } from '../src/theme/colors';

type DateBasis = 'RECEIPT' | 'SCHEDULE' | 'DUE' | 'CREATED';

function normalize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function basisMs(r: ProviderOsSearchRow, b: DateBasis): number {
  switch (b) {
    case 'RECEIPT':
      return r.receivedMs || r.createdMs;
    case 'SCHEDULE':
      return r.startMs;
    case 'DUE':
      return r.dueMs || r.startMs;
    default:
      return r.createdMs;
  }
}

function ymdStartMs(ymd: string): number | null {
  if (!ymd || ymd.length < 10) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  const t = dt.getTime();
  return Number.isFinite(t) ? t : null;
}

function ymdEndMs(ymd: string): number | null {
  if (!ymd || ymd.length < 10) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(23, 59, 59, 999);
  const t = dt.getTime();
  return Number.isFinite(t) ? t : null;
}

function wordsMatch(haystackNorm: string, queryRaw: string): boolean {
  const q = normalize(queryRaw);
  if (!q) return true;
  const words = q.split(/\s+/).filter(Boolean);
  return words.every((w) => haystackNorm.includes(w));
}

function rowAccent(status: string, C: { connectivity: { online: string; offline: string }; textLight: string }) {
  if (status === 'COMPLETED') return C.connectivity.online;
  if (status === 'PAUSED') return C.connectivity.offline;
  if (status === 'IN_PROGRESS') return MEDIA_TAG_COLORS.DURING;
  return C.textLight;
}

function toIsoDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Mesmo contrato que o dashboard: rota `id` = formulário (ref/template), `taskId` = execução na nuvem. */
function resolveChecklistRouteParams(item: ProviderOsSearchRow): { formId: string | null; taskId: string } {
  const raw = item.raw as Record<string, unknown> | undefined;
  const ref =
    item.refId != null && String(item.refId).trim() !== '' && String(item.refId) !== 'null'
      ? String(item.refId).trim()
      : null;
  const tpl =
    raw?.templateId != null && String(raw.templateId).trim() !== '' && String(raw.templateId) !== 'null'
      ? String(raw.templateId).trim()
      : null;
  const rawRef =
    raw?.refId != null && String(raw.refId).trim() !== '' && String(raw.refId) !== 'null'
      ? String(raw.refId).trim()
      : null;
  const formId = ref || tpl || rawRef;
  return { formId: formId || null, taskId: item.id };
}

export default function ProviderOsSearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user, userRole } = useAuth();

  const [rows, setRows] = useState<ProviderOsSearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [dateBasis, setDateBasis] = useState<DateBasis>('RECEIPT');
  const [includeCompleted, setIncludeCompleted] = useState(true);

  const email = user?.email || '';

  const reload = useCallback(async () => {
    if (!email) {
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const next = await loadProviderOsSearchRows(email);
      setRows(next);
    } catch (e) {
      console.warn('[ProviderOsSearch]', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [email]);

  const onRefresh = useCallback(async () => {
    if (!email) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const next = await loadProviderOsSearchRows(email);
      setRows(next);
    } finally {
      setRefreshing(false);
    }
  }, [email]);

  React.useEffect(() => {
    if (userRole !== 'TECHNICIAN') {
      router.replace('/(tabs)' as any);
      return;
    }
    reload();
  }, [userRole, reload, router]);

  const haystackPrepared = useMemo(() => {
    return rows.map((r) => ({
      row: r,
      hay: normalize(r.searchIndex),
    }));
  }, [rows]);

  const filtered = useMemo(() => {
    const fromMs = dateFrom ? ymdStartMs(dateFrom) : null;
    const toMs = dateTo ? ymdEndMs(dateTo) : null;
    return haystackPrepared
      .filter(({ row, hay }) => {
        if (!includeCompleted && row.statusEff === 'COMPLETED') return false;
        const ms = basisMs(row, dateBasis);
        if (fromMs != null && ms < fromMs) return false;
        if (toMs != null && ms > toMs) return false;
        return wordsMatch(hay, query);
      })
      .map(({ row }) => row);
  }, [haystackPrepared, dateFrom, dateTo, dateBasis, includeCompleted, query]);

  const basisOptions: { key: DateBasis; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'RECEIPT', label: t('providerOsSearch.dateBasis.receipt'), icon: 'download-outline' },
    { key: 'SCHEDULE', label: t('providerOsSearch.dateBasis.schedule'), icon: 'calendar-outline' },
    { key: 'DUE', label: t('providerOsSearch.dateBasis.due'), icon: 'hourglass-outline' },
    { key: 'CREATED', label: t('providerOsSearch.dateBasis.created'), icon: 'sparkles-outline' },
  ];

  const setQuickRangeDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setDateFrom(toIsoDate(start));
    setDateTo(toIsoDate(end));
  };

  const clearPeriod = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const statusLabel = (s: string) => {
    const k = `providerOsSearch.status.${s}` as const;
    const v = t(k);
    return v === k ? s : v;
  };

  const ListHeader = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
      <LinearGradient
        colors={[`${C.accent}18`, `${C.accent}05`, C.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          padding: 18,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: C.divider,
        }}
      >
        <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20, fontWeight: '600' }}>
          {t('providerOsSearch.hero')}
        </Text>
      </LinearGradient>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: C.cardWhite,
          borderRadius: 14,
          paddingHorizontal: 14,
          minHeight: 48,
          borderWidth: 1,
          borderColor: C.divider,
          marginBottom: 14,
        }}
      >
        <Ionicons name="search" size={22} color={C.accent} style={{ marginRight: 10 }} />
        <TextInput
          style={{ flex: 1, fontSize: 15, fontWeight: '600', color: C.slate, paddingVertical: 10 }}
          placeholder={t('providerOsSearch.queryPlaceholder')}
          placeholderTextColor={C.textLight}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={12}>
            <Ionicons name="close-circle" size={22} color={C.border} />
          </Pressable>
        )}
      </View>

      <Text style={{ fontSize: 12, fontWeight: '800', color: C.textSecondary, marginBottom: 8, letterSpacing: 0.4 }}>
        {t('providerOsSearch.quickRanges')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { days: 7, label: t('providerOsSearch.range7d') },
          { days: 30, label: t('providerOsSearch.range30d') },
        ].map((x) => (
          <Pressable
            key={x.days}
            onPress={() => setQuickRangeDays(x.days)}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: pressed ? C.surfaceLow : C.background,
              borderWidth: 1,
              borderColor: C.divider,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.slate }}>{x.label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={clearPeriod}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: pressed ? C.status.warning.bg : 'transparent',
            borderWidth: 1,
            borderColor: C.border,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.textSecondary }}>
            {t('providerOsSearch.clearPeriod')}
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 12, fontWeight: '800', color: C.textSecondary, marginBottom: 8 }}>
        {t('providerOsSearch.periodTitle')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <DatePickerButton label={t('providerOsSearch.dateFrom')} value={dateFrom} onChange={setDateFrom} accentColor={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <DatePickerButton label={t('providerOsSearch.dateTo')} value={dateTo} onChange={setDateTo} accentColor={C.accent} />
        </View>
      </View>

      <Text style={{ fontSize: 12, fontWeight: '800', color: C.textSecondary, marginTop: 8, marginBottom: 8 }}>
        {t('providerOsSearch.dateBasisTitle')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {basisOptions.map((opt) => {
          const on = dateBasis === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setDateBasis(opt.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: on ? C.status.warning.bg : C.background,
                borderWidth: 1,
                borderColor: on ? C.accent : C.divider,
              }}
            >
              <Ionicons name={opt.icon} size={16} color={on ? C.accent : C.textLight} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 11, fontWeight: on ? '900' : '700', color: on ? C.accent : C.textLight }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 4,
          marginBottom: 8,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.slate }}>{t('providerOsSearch.includeCompleted')}</Text>
          <Text style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>{t('providerOsSearch.includeCompletedHint')}</Text>
        </View>
        <Switch value={includeCompleted} onValueChange={setIncludeCompleted} trackColor={{ false: C.border, true: `${C.accent}88` }} thumbColor={includeCompleted ? C.accent : C.cardWhite} />
      </View>

      <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 12 }}>
        {t('providerOsSearch.resultsCount', { count: filtered.length })}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: ProviderOsSearchRow }) => {
    const accent = rowAccent(item.statusEff, C);
    return (
      <Pressable
        onPress={() => {
          const { formId, taskId } = resolveChecklistRouteParams(item);
          if (!formId) {
            Alert.alert(t('common.attention'), t('providerOsSearch.missingFormLink'));
            return;
          }
          router.push({
            pathname: '/checklist/[id]',
            params: { id: formId, taskId },
          } as any);
        }}
        style={{ paddingHorizontal: 16, marginBottom: 12 }}
      >
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: accent,
            backgroundColor: `${accent}14`,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '900', color: C.slate, paddingRight: 8 }} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={{ backgroundColor: `${accent}33`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: C.slate }}>{statusLabel(item.statusEff)}</Text>
            </View>
          </View>
          {item.formTemplateTitle ? (
            <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '700', color: C.textSecondary }} numberOfLines={1}>
              {item.formTemplateTitle}
            </Text>
          ) : null}
          {item.locationAddress ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Ionicons name="location-outline" size={14} color={C.textLight} style={{ marginRight: 4 }} />
              <Text style={{ flex: 1, fontSize: 12, color: C.textLight }} numberOfLines={2}>
                {item.locationAddress}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', marginTop: 10, alignItems: 'center' }}>
            <Ionicons name="chevron-forward" size={16} color={C.accent} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.accent }}>{t('providerOsSearch.openOs')}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (userRole !== 'TECHNICIAN') {
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: C.divider,
          backgroundColor: C.cardWhite,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={14} style={{ padding: 8, marginRight: 4 }}>
          <Ionicons name="arrow-back" size={24} color={C.slate} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: C.slate }}>{t('providerOsSearch.title')}</Text>
          <Text style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>{t('providerOsSearch.subtitle')}</Text>
        </View>
        <Pressable onPress={() => reload()} style={{ padding: 8 }} disabled={loading}>
          <Ionicons name="refresh" size={22} color={loading ? C.border : C.accent} />
        </Pressable>
      </View>

      {loading && rows.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ marginTop: 12, color: C.textSecondary, fontWeight: '600' }}>{t('common.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: 32, paddingTop: 24, alignItems: 'center' }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: C.status.warning.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Ionicons name="file-tray-outline" size={36} color={C.accent} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: C.slate, textAlign: 'center', marginBottom: 8 }}>
                {t('providerOsSearch.emptyTitle')}
              </Text>
              <Text style={{ fontSize: 14, color: C.textLight, textAlign: 'center', lineHeight: 22 }}>
                {t('providerOsSearch.emptyBody')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
