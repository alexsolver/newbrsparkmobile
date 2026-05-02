import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { ProviderAffiliationsApi, ProviderAffiliation } from '../../src/services/providerAffiliations';

const DED_WD_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Vínculos com empresa operacional na app (não OWNER). Inclui legado PARTNER e tipo vazio (default BD). */
function isOperationalCompanyAffiliation(a: ProviderAffiliation) {
  const rt = String(a.relationshipType || '').toUpperCase();
  if (rt === 'OWNER') return false;
  return rt === 'DEDICATED' || rt === 'PARTNER' || rt === '';
}

function cardAccent(a: ProviderAffiliation) {
  if (isOperationalCompanyAffiliation(a)) return { bg: '#FFF7ED', border: '#FDBA74', title: '#9A3412', chipBg: '#FB923C' };
  return { bg: '#F8FAFC', border: '#E2E8F0', title: '#0F172A', chipBg: '#64748B' };
}

function statusKey(a: ProviderAffiliation): string {
  return String(a.status || '').toUpperCase() || '—';
}

function dedicatedWeekdayLabel(t: (k: string) => string, weekday: string): string {
  const w = String(weekday || '')
    .toLowerCase()
    .slice(0, 3);
  if (!DED_WD_KEYS.includes(w as (typeof DED_WD_KEYS)[number])) return w || '—';
  return t(`profile.affiliationsDedDay_${w}`);
}

export default function ProviderAffiliationsScreen() {
  const { colors: C } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<ProviderAffiliation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const firstFocusRef = useRef(true);

  const load = useCallback(async () => {
    setLoadError(null);
    const j = await ProviderAffiliationsApi.getMeStatus();
    setRows(j.affiliations || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const isFirst = firstFocusRef.current;
      if (isFirst) setLoading(true);
      firstFocusRef.current = false;
      load()
        .catch((e: unknown) => {
          if (!cancelled) {
            setRows([]);
            const msg = e instanceof Error ? e.message : String(e);
            setLoadError(msg || t('common.error'));
          }
        })
        .finally(() => {
          if (!cancelled && isFirst) setLoading(false);
        });
      return () => {
        cancelled = true;
        if (isFirst) setLoading(false);
      };
    }, [load, t])
  );

  const dedicated = useMemo(() => {
    return rows
      .filter((r) => isOperationalCompanyAffiliation(r))
      .sort((a, b) => String(b.activatedAt || b.invitedAt || '').localeCompare(String(a.activatedAt || a.invitedAt || '')));
  }, [rows]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const runAction = useCallback(
    async (affiliationId: string, op: string, fn: () => Promise<unknown>) => {
      setPendingKey(`${affiliationId}:${op}`);
      try {
        await fn();
        await load();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(t('common.error'), msg);
      } finally {
        setPendingKey(null);
      }
    },
    [load, t]
  );

  const anyPending = pendingKey !== null;

  const showConsentAndAccept = useCallback(
    (affiliationId: string) => {
      Alert.alert(t('profile.affiliationsConsentTitle'), t('profile.affiliationsConsentBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.affiliationsConsentConfirm'),
          onPress: () =>
            void runAction(affiliationId, 'accept', () => ProviderAffiliationsApi.acceptByAffiliationId(affiliationId)),
        },
      ]);
    },
    [runAction, t]
  );

  const confirmDecline = useCallback(
    (a: ProviderAffiliation) => {
      const name = a.tenant?.name || '—';
      Alert.alert(t('profile.affiliationsDeclineConfirmTitle'), t('profile.affiliationsDeclineConfirmBody', { name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.affiliationsActionDecline'),
          style: 'destructive',
          onPress: () => void runAction(a.id, 'decline', () => ProviderAffiliationsApi.declineByAffiliationId(a.id)),
        },
      ]);
    },
    [runAction, t]
  );

  const confirmEnd = useCallback(
    (a: ProviderAffiliation) => {
      Alert.alert(t('profile.affiliationsEndConfirmTitle'), t('profile.affiliationsEndConfirmBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text:
            String(a.status).toUpperCase() === 'REQUESTED'
              ? t('profile.affiliationsActionEndPending')
              : t('profile.affiliationsActionEnd'),
          style: 'destructive',
          onPress: () => void runAction(a.id, 'end', () => ProviderAffiliationsApi.endByAffiliationId(a.id)),
        },
      ]);
    },
    [runAction, t]
  );

  const ChipButton = useCallback(
    ({
      label,
      onPress,
      disabled,
      variant = 'default',
    }: {
      label: string;
      onPress: () => void;
      disabled: boolean;
      variant?: 'default' | 'primary' | 'danger';
    }) => {
      const bg = variant === 'primary' ? C.primary : variant === 'danger' ? '#FEF2F2' : '#F1F5F9';
      const border = variant === 'danger' ? '#FECACA' : '#E2E8F0';
      const color = variant === 'primary' ? '#fff' : variant === 'danger' ? '#B91C1C' : '#0F172A';
      return (
        <TouchableOpacity
          onPress={onPress}
          disabled={disabled}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: border,
          }}
        >
          <Text style={{ fontWeight: '800', fontSize: 12, color }}>{label}</Text>
        </TouchableOpacity>
      );
    },
    [C.primary]
  );

  const AffiliationCard = useCallback(
    (a: ProviderAffiliation) => {
      const col = cardAccent(a);
      const st = String(a.status || '').toUpperCase();
      const statusLabel = t(`profile.affiliationsStatus${statusKey(a)}`, { defaultValue: st || '—' });
      const cardBusy = pendingKey?.startsWith(`${a.id}:`) ?? false;
      const cardStyle = {
        backgroundColor: col.bg,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: col.border,
      };

      const actions = ((): ReactNode => {
        if (st === 'INVITED') {
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <ChipButton
                label={t('profile.affiliationsActionAccept')}
                onPress={() => showConsentAndAccept(a.id)}
                disabled={anyPending}
                variant="primary"
              />
              <ChipButton
                label={t('profile.affiliationsActionDecline')}
                onPress={() => confirmDecline(a)}
                disabled={anyPending}
                variant="danger"
              />
              {cardBusy ? <ActivityIndicator size="small" color={C.accent} /> : null}
            </View>
          );
        }
        if (st === 'REQUESTED') {
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <ChipButton
                label={t('profile.affiliationsActionEndPending')}
                onPress={() => confirmEnd(a)}
                disabled={anyPending}
                variant="danger"
              />
              {cardBusy ? <ActivityIndicator size="small" color={C.accent} /> : null}
            </View>
          );
        }
        if (st === 'ACTIVE') {
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <ChipButton
                label={t('profile.affiliationsActionSuspend')}
                onPress={() => void runAction(a.id, 'suspend', () => ProviderAffiliationsApi.suspendByAffiliationId(a.id))}
                disabled={anyPending}
                variant="default"
              />
              <ChipButton
                label={t('profile.affiliationsActionEnd')}
                onPress={() => confirmEnd(a)}
                disabled={anyPending}
                variant="danger"
              />
              {cardBusy ? <ActivityIndicator size="small" color={C.accent} /> : null}
            </View>
          );
        }
        if (st === 'SUSPENDED') {
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <ChipButton
                label={t('profile.affiliationsActionResume')}
                onPress={() => void runAction(a.id, 'resume', () => ProviderAffiliationsApi.resumeByAffiliationId(a.id))}
                disabled={anyPending}
                variant="primary"
              />
              <ChipButton
                label={t('profile.affiliationsActionEnd')}
                onPress={() => confirmEnd(a)}
                disabled={anyPending}
                variant="danger"
              />
              {cardBusy ? <ActivityIndicator size="small" color={C.accent} /> : null}
            </View>
          );
        }
        return null;
      })();

      return (
        <View key={a.id} style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: col.title }} numberOfLines={1}>
                {a.tenant?.name || '—'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{statusLabel}</Text>
            </View>
            <View style={{ backgroundColor: col.chipBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>
                {t('profile.affiliationsChipDedicated')}
              </Text>
            </View>
          </View>

          {a.note ? (
            <Text style={{ fontSize: 12, color: '#334155', marginTop: 10, lineHeight: 18 }}>{a.note}</Text>
          ) : null}

          {a.dedicatedExclusive?.weeklyWindows?.length ? (
            <View
              style={{
                marginTop: 10,
                backgroundColor: '#FFFBEB',
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: '#FDE68A',
              }}
            >
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '900' }}>
                {t('profile.affiliationsDedicatedWindowsTitle')}
              </Text>
              <Text style={{ fontSize: 11, color: '#A16207', marginTop: 4, lineHeight: 16 }}>
                {t('profile.affiliationsDedicatedWindowsHint')}
              </Text>
              <Text style={{ fontSize: 11, color: '#713F12', marginTop: 6, fontWeight: '700' }}>
                {t('profile.affiliationsDedicatedWindowsTimezone', { tz: a.dedicatedExclusive.timezone })}
              </Text>
              <View style={{ marginTop: 8, gap: 4 }}>
                {a.dedicatedExclusive.weeklyWindows.map((w, i) => (
                  <Text key={`${w.weekday}-${w.start}-${w.end}-${i}`} style={{ fontSize: 12, color: '#422006', lineHeight: 18 }}>
                    {t('profile.affiliationsDedicatedSlot', {
                      day: dedicatedWeekdayLabel(t, w.weekday),
                      start: w.start,
                      end: w.end,
                    })}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {st === 'REQUESTED' ? (
            <View
              style={{
                marginTop: 10,
                backgroundColor: '#EFF6FF',
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: '#BFDBFE',
              }}
            >
              <Text style={{ fontSize: 12, color: '#1D4ED8', fontWeight: '900' }}>{t('profile.affiliationsNextStep')}</Text>
              <Text style={{ fontSize: 12, color: '#1E3A8A', marginTop: 4, lineHeight: 18 }}>
                {t('profile.affiliationsNextStepRequested')}
              </Text>
            </View>
          ) : null}

          {st === 'INVITED' ? (
            <View
              style={{
                marginTop: 10,
                backgroundColor: '#FEFCE8',
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: '#FDE68A',
              }}
            >
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '900' }}>{t('profile.affiliationsInvitePendingTitle')}</Text>
              <Text style={{ fontSize: 12, color: '#78350F', marginTop: 4, lineHeight: 18 }}>
                {t('profile.affiliationsInviteTapHint')}
              </Text>
            </View>
          ) : null}

          {actions}
        </View>
      );
    },
    [C.accent, ChipButton, anyPending, confirmDecline, confirmEnd, pendingKey, runAction, showConsentAndAccept, t]
  );

  const Section = useCallback(
    ({ title, hint, items }: { title: string; hint: string; items: ProviderAffiliation[] }) => {
      return (
        <View style={{ marginBottom: 18 }}>
          <Text style={{ fontSize: 12, fontWeight: '900', color: '#64748B', letterSpacing: 0.6 }}>{title.toUpperCase()}</Text>
          <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6, lineHeight: 17 }}>{hint}</Text>

          <View style={{ marginTop: 12, gap: 10 }}>
            {items.length === 0 ? (
              <View
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
              >
                <Text style={{ color: '#64748B', fontWeight: '700' }}>{t('profile.affiliationsEmpty')}</Text>
              </View>
            ) : (
              items.map((a) => AffiliationCard(a))
            )}
          </View>
        </View>
      );
    },
    [AffiliationCard, t]
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.cardWhite }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.primary }}>{t('profile.affiliationsCardTitle')}</Text>
        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 18 }}>{t('profile.affiliationsPageIntro')}</Text>
        {loadError ? (
          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#FEF2F2',
              borderWidth: 1,
              borderColor: '#FECACA',
            }}
          >
            <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '700', lineHeight: 18 }}>{loadError}</Text>
            <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 6, lineHeight: 16 }}>{t('profile.affiliationsLoadErrorHint')}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        >
          <Section
            title={t('profile.affiliationsSectionDedicated')}
            hint={t('profile.affiliationsSectionDedicatedHint')}
            items={dedicated}
          />

          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ color: '#64748B', fontWeight: '800' }}>{t('common.back')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}
