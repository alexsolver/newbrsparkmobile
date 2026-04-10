/**
 * Onboarding — consentimento por persona (CLIENT vs TECHNICIAN).
 *
 * Cliente: fluxo mais curto, sem localização em segundo plano nem copy de campo.
 * Prestador: 5 passos com GPS em primeiro/segundo plano, retenção operacional.
 *
 * Toggles gravam ConsentRecord via /api/compliance/accept.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, isTechnicianProfileActive } from '../../src/services/auth';
import { dataCollectionService } from '../../src/services/dataCollectionService';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/theme/ThemeContext';
import { ThemedSwitch } from '../../src/components/ThemedSwitch';

interface ConsentState {
  LOCATION_BACKGROUND: boolean;
  LOCATION_FOREGROUND: boolean;
  DEVICE_TELEMETRY: boolean;
  DATA_RETENTION: boolean;
}

const SLIDES_TECH = ['WELCOME', 'LOCATION', 'DEVICE', 'RETENTION', 'CONFIRM'] as const;
const SLIDES_CLIENT = ['WELCOME', 'LOCATION', 'DEVICE', 'RETENTION', 'CONFIRM'] as const;
type SlideTech = typeof SLIDES_TECH[number];
type SlideClient = typeof SLIDES_CLIENT[number];
type Slide = SlideTech;

function defaultConsents(isTechnician: boolean): ConsentState {
  return {
    LOCATION_BACKGROUND: false,
    LOCATION_FOREGROUND: isTechnician,
    DEVICE_TELEMETRY: false,
    DATA_RETENTION: false,
  };
}

function ConsentToggleRow({
  consentKey,
  title,
  description,
  icon,
  consents,
  setConsents,
}: {
  consentKey: keyof ConsentState;
  title: string;
  description: string;
  icon: string;
  consents: ConsentState;
  setConsents: React.Dispatch<React.SetStateAction<ConsentState>>;
}) {
  const { colors: C } = useTheme();
  return (
    <View style={[s.toggleRow, { backgroundColor: C.cardWhite, borderColor: C.border }]}>
      <View style={[s.toggleIcon, { backgroundColor: C.surfaceLow }]}>
        <Ionicons name={icon as any} size={22} color={C.accent} />
      </View>
      <View style={s.toggleContent}>
        <Text style={[s.toggleTitle, { color: C.slate }]}>{title}</Text>
        <Text style={[s.toggleDesc, { color: C.textSecondary }]}>{description}</Text>
      </View>
      <ThemedSwitch
        value={consents[consentKey]}
        onValueChange={(val) => setConsents((c) => ({ ...c, [consentKey]: val }))}
      />
    </View>
  );
}

async function requestOsLocationPermissions(isTechnician: boolean, consents: ConsentState): Promise<void> {
  try {
    if (consents.LOCATION_FOREGROUND) {
      await Location.requestForegroundPermissionsAsync();
    }
    if (isTechnician && consents.LOCATION_BACKGROUND) {
      await Location.requestBackgroundPermissionsAsync();
    }
  } catch (e) {
    console.warn('[Onboarding] Permissão de localização:', e);
  }
}

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { colors: C } = useTheme();
  const isTechnician = useMemo(
    () => userRole === 'TECHNICIAN' && isTechnicianProfileActive(user),
    [user, userRole]
  );

  const slides = useMemo(() => (isTechnician ? SLIDES_TECH : SLIDES_CLIENT), [isTechnician]);

  const [slideIndex, setSlideIndex] = useState(0);
  const [consents, setConsents] = useState<ConsentState>(() => defaultConsents(false));
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    setConsents(defaultConsents(isTechnician));
    setSlideIndex(0);
  }, [isTechnician]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@brspark_collection_policy');
        if (raw) setPolicy(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  const currentSlide: Slide = slides[slideIndex] as Slide;

  const goNext = useCallback(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setSlideIndex(i => Math.min(i + 1, slides.length - 1));
  }, [fadeAnim, slides.length]);

  const goBack = useCallback(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setSlideIndex(i => Math.max(i - 1, 0));
  }, [fadeAnim]);

  const consentEntriesForApi = useCallback((): [keyof ConsentState, boolean][] => {
    if (isTechnician) {
      return Object.entries(consents) as [keyof ConsentState, boolean][];
    }
    return (Object.entries(consents) as [keyof ConsentState, boolean][]).filter(
      ([k]) => k !== 'LOCATION_BACKGROUND'
    ).concat([['LOCATION_BACKGROUND', false] as [keyof ConsentState, boolean]]);
  }, [consents, isTechnician]);

  const confirm = useCallback(async () => {
    setLoading(true);
    try {
      const ownerEmail = await AsyncStorage.getItem('@brspark_email') || '';
      const policyId = policy?.id || null;
      const tenantId = policy?.tenantId || null;
      const appVersion = '1.0';

      const types = consentEntriesForApi();
      await Promise.allSettled(
        types.map(([consentType, accepted]) =>
          apiFetch('/api/compliance/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ownerEmail,
              tenantId,
              policyId,
              consentType,
              accepted,
              appVersion,
            }),
          })
        )
      );

      await requestOsLocationPermissions(isTechnician, consents);
      await dataCollectionService.onSessionOpen(ownerEmail, tenantId || undefined, isTechnician);
      await AsyncStorage.setItem('@brspark_onboarding_done', '1');
    } catch (e) {
      console.warn('[Onboarding] Erro ao salvar consentimentos:', e);
    } finally {
      setLoading(false);
      router.replace('/(tabs)');
    }
  }, [consents, policy, isTechnician, consentEntriesForApi]);

  const skipAll = useCallback(async () => {
    await AsyncStorage.setItem('@brspark_onboarding_done', '1');
    router.replace('/(tabs)');
  }, []);

  const legalBasis = policy?.legalBasis || 'LGPD';

  const summaryRows: [keyof ConsentState, string, string][] = useMemo(() => {
    if (isTechnician) {
      return [
        ['LOCATION_BACKGROUND', t('consentFlow.sumBgGps'), 'navigate-outline'],
        ['LOCATION_FOREGROUND', t('consentFlow.sumFgGps'), 'locate-outline'],
        ['DEVICE_TELEMETRY', t('consentFlow.sumDevice'), 'hardware-chip-outline'],
        ['DATA_RETENTION', t('consentFlow.sumRetention'), 'time-outline'],
      ];
    }
    return [
      ['LOCATION_FOREGROUND', t('consentFlow.sumFgGpsClient'), 'locate-outline'],
      ['DEVICE_TELEMETRY', t('consentFlow.sumDevice'), 'hardware-chip-outline'],
      ['DATA_RETENTION', t('consentFlow.sumRetention'), 'time-outline'],
    ];
  }, [isTechnician, t]);

  const renderSlide = () => {
    switch (currentSlide) {
      case 'WELCOME':
        if (isTechnician) {
          return (
            <View style={s.slideContent}>
              <View style={s.heroLogoWrap}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={s.heroLogoImg}
                  resizeMode="contain"
                  accessibilityLabel={t('consentFlow.a11yLogo')}
                />
              </View>
              <Text style={s.heroTitle}>{t('consentFlow.welcomeTitle')}</Text>
              <Text style={s.heroSubtitle}>{t('consentFlow.welcomeTechBody')}</Text>
              <View style={s.collectGrid}>
                {[
                  ['location-outline', 'techCollectGpsTitle', 'techCollectGpsDesc'],
                  ['phone-portrait-outline', 'techCollectDeviceTitle', 'techCollectDeviceDesc'],
                  ['shield-outline', 'techCollectFraudTitle', 'techCollectFraudDesc'],
                  ['time-outline', 'techCollectHistoryTitle', '__HISTORY__'],
                ].map(([icon, titleKey, descKey]) => {
                  const desc =
                    descKey === '__HISTORY__'
                      ? t('consentFlow.techCollectHistoryDesc', {
                          years: policy?.retentionEventsYears || 5,
                          legal: legalBasis,
                        })
                      : t(`consentFlow.${descKey}`);
                  return (
                    <View style={s.collectItem} key={String(titleKey)}>
                      <Ionicons name={icon as any} size={20} color="#EA580C" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.collectTitle}>{t(`consentFlow.${titleKey}`)}</Text>
                        <Text style={s.collectDesc}>{desc}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }
        return (
          <View style={s.slideContent}>
            <View style={s.heroLogoWrap}>
              <Image
                source={require('../../assets/logo.png')}
                style={s.heroLogoImg}
                resizeMode="contain"
                accessibilityLabel={t('consentFlow.a11yLogo')}
              />
            </View>
            <Text style={s.heroTitle}>{t('consentFlow.welcomeTitle')}</Text>
            <Text style={s.heroSubtitle}>{t('consentFlow.welcomeClientBody')}</Text>
            <View style={s.collectGrid}>
              {[
                ['grid-outline', 'clientCollectCatalogTitle', 'clientCollectCatalogDesc'],
                ['home-outline', 'clientCollectAssetsTitle', 'clientCollectAssetsDesc'],
                ['locate-outline', 'clientCollectLocTitle', 'clientCollectLocDesc'],
                ['hardware-chip-outline', 'clientCollectDeviceTitle', 'clientCollectDeviceDesc'],
              ].map(([icon, titleKey, descKey]) => (
                <View style={s.collectItem} key={String(titleKey)}>
                  <Ionicons name={icon as any} size={20} color="#EA580C" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.collectTitle}>{t(`consentFlow.${titleKey}`)}</Text>
                    <Text style={s.collectDesc}>{t(`consentFlow.${descKey}`)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );

      case 'LOCATION':
        if (isTechnician) {
          return (
            <View style={s.slideContent}>
              <View style={s.slideHeader}>
                <Ionicons name="location" size={36} color="#EA580C" />
                <Text style={s.slideTitle}>{t('consentFlow.locTitleTech')}</Text>
                <Text style={s.slideDesc}>{t('consentFlow.locDescTech')}</Text>
              </View>
              <ConsentToggleRow consents={consents} setConsents={setConsents}
                consentKey="LOCATION_BACKGROUND"
                icon="navigate-outline"
                title={t('consentFlow.locBgTitle')}
                description={t('consentFlow.locBgDesc', {
                  meters: policy?.locationDistanceFilterMeters || 200,
                })}
              />
              <ConsentToggleRow consents={consents} setConsents={setConsents}
                consentKey="LOCATION_FOREGROUND"
                icon="locate-outline"
                title={t('consentFlow.locFgTitleTech')}
                description={t('consentFlow.locFgDescTech')}
              />
              <View style={s.warnBox}>
                <Ionicons name="warning-outline" size={16} color="#d97706" />
                <Text style={s.warnText}>{t('consentFlow.locWarnTech')}</Text>
              </View>
            </View>
          );
        }
        return (
          <View style={s.slideContent}>
            <View style={s.slideHeader}>
              <Ionicons name="location" size={36} color="#EA580C" />
              <Text style={s.slideTitle}>{t('consentFlow.locTitleClient')}</Text>
              <Text style={s.slideDesc}>
                {t('consentFlow.locClientBefore')}
                <Text style={{ fontWeight: '800' }}>{t('consentFlow.locClientBold')}</Text>
                {t('consentFlow.locClientAfter')}
              </Text>
            </View>
            <ConsentToggleRow consents={consents} setConsents={setConsents}
              consentKey="LOCATION_FOREGROUND"
              icon="locate-outline"
              title={t('consentFlow.locFgTitleClient')}
              description={t('consentFlow.locFgDescClient')}
            />
            <View style={s.warnBox}>
              <Ionicons name="information-circle-outline" size={16} color="#d97706" />
              <Text style={s.warnText}>{t('consentFlow.locInfoClient')}</Text>
            </View>
          </View>
        );

      case 'DEVICE':
        if (isTechnician) {
          return (
            <View style={s.slideContent}>
              <View style={s.slideHeader}>
                <Ionicons name="phone-portrait" size={36} color="#EA580C" />
                <Text style={s.slideTitle}>{t('consentFlow.deviceTitleTech')}</Text>
                <Text style={s.slideDesc}>{t('consentFlow.deviceDescTech')}</Text>
              </View>
              <ConsentToggleRow consents={consents} setConsents={setConsents}
                consentKey="DEVICE_TELEMETRY"
                icon="hardware-chip-outline"
                title={t('consentFlow.deviceToggleTitleTech')}
                description={t('consentFlow.deviceToggleDescTech')}
              />
              <View style={s.infoCard}>
                <Ionicons name="shield-half-outline" size={18} color="#10b981" />
                <Text style={s.infoText}>
                  {t('consentFlow.deviceInfoTech')}
                  <Text style={{ fontWeight: '700' }}>{t('consentFlow.deviceInfoTechBold')}</Text>
                  {t('consentFlow.deviceInfoTechSuffix')}
                </Text>
              </View>
            </View>
          );
        }
        return (
          <View style={s.slideContent}>
            <View style={s.slideHeader}>
              <Ionicons name="phone-portrait" size={36} color="#EA580C" />
              <Text style={s.slideTitle}>{t('consentFlow.deviceTitleClient')}</Text>
              <Text style={s.slideDesc}>{t('consentFlow.deviceDescClient')}</Text>
            </View>
            <ConsentToggleRow consents={consents} setConsents={setConsents}
              consentKey="DEVICE_TELEMETRY"
              icon="hardware-chip-outline"
              title={t('consentFlow.deviceToggleTitleClient')}
              description={t('consentFlow.deviceToggleDescClient')}
            />
            <View style={s.infoCard}>
              <Ionicons name="shield-half-outline" size={18} color="#10b981" />
              <Text style={s.infoText}>
                {t('consentFlow.deviceInfoClient', {
                  legal: legalBasis,
                  path: t('consentFlow.profilePrivacyPath'),
                })}
              </Text>
            </View>
          </View>
        );

      case 'RETENTION':
        if (isTechnician) {
          return (
            <View style={s.slideContent}>
              <View style={s.slideHeader}>
                <Ionicons name="time" size={36} color="#EA580C" />
                <Text style={s.slideTitle}>{t('consentFlow.retentionTitleTech')}</Text>
                <Text style={s.slideDesc}>
                  {t('consentFlow.retentionSubtitleTech', { legal: legalBasis })}
                </Text>
              </View>
              {[
                ['retRowGpsLive', t('consentFlow.periodDays', { count: policy?.retentionGpsRawDays || 15 }), 'retRowGpsLiveDesc', '#f59e0b'],
                ['retRowOps', t('consentFlow.periodDays', { count: policy?.retentionAuditDays || 180 }), 'retRowOpsDesc', '#3b82f6'],
                ['retRowForms', t('consentFlow.periodYears', { count: policy?.retentionEventsYears || 5 }), 'retRowFormsDesc', '#10b981'],
                ['retRowMetrics', t('consentFlow.retRowMetricsPeriod'), 'retRowMetricsDesc', '#8b5cf6'],
              ].map(([labelKey, period, descKey, color]) => (
                <View style={s.retentionRow} key={String(labelKey)}>
                  <View style={[s.retentionDot, { backgroundColor: color + '20' }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.retentionLabel}>{t(`consentFlow.${labelKey}`)}</Text>
                    <Text style={s.retentionDesc}>{t(`consentFlow.${descKey}`)}</Text>
                  </View>
                  <Text style={[s.retentionPeriod, { color }]}>{period}</Text>
                </View>
              ))}
              <ConsentToggleRow consents={consents} setConsents={setConsents}
                consentKey="DATA_RETENTION"
                icon="checkmark-circle-outline"
                title={t('consentFlow.retentionToggleTitle', { legal: legalBasis })}
                description={t('consentFlow.retentionToggleDescTech')}
              />
            </View>
          );
        }
        return (
          <View style={s.slideContent}>
            <View style={s.slideHeader}>
              <Ionicons name="time" size={36} color="#EA580C" />
              <Text style={s.slideTitle}>{t('consentFlow.retentionTitleClient')}</Text>
              <Text style={s.slideDesc}>
                {t('consentFlow.retentionSubtitleClient', { legal: legalBasis })}
              </Text>
            </View>
            {[
              ['retClientUsage', t('consentFlow.periodDays', { count: policy?.retentionAuditDays || 180 }), 'retClientUsageDesc', '#3b82f6'],
              ['retClientAccount', t('consentFlow.periodYears', { count: policy?.retentionEventsYears || 5 }), 'retClientAccountDesc', '#10b981'],
              ['retClientLoc', t('consentFlow.periodDays', { count: policy?.retentionGpsRawDays || 15 }), 'retClientLocDesc', '#f59e0b'],
            ].map(([labelKey, period, descKey, color]) => (
              <View style={s.retentionRow} key={String(labelKey)}>
                <View style={[s.retentionDot, { backgroundColor: color + '20' }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.retentionLabel}>{t(`consentFlow.${labelKey}`)}</Text>
                  <Text style={s.retentionDesc}>{t(`consentFlow.${descKey}`)}</Text>
                </View>
                <Text style={[s.retentionPeriod, { color }]}>{period}</Text>
              </View>
            ))}
            <ConsentToggleRow consents={consents} setConsents={setConsents}
              consentKey="DATA_RETENTION"
              icon="checkmark-circle-outline"
              title={t('consentFlow.retentionToggleTitle', { legal: legalBasis })}
              description={t('consentFlow.retentionToggleDescClient')}
            />
          </View>
        );

      case 'CONFIRM':
        return (
          <View style={s.slideContent}>
            <View style={s.heroIcon}>
              <Ionicons name="checkmark-circle" size={56} color="#10b981" />
            </View>
            <Text style={s.heroTitle}>{t('consentFlow.confirmTitle')}</Text>
            <Text style={s.heroSubtitle}>{t('consentFlow.confirmSubtitle')}</Text>
            {summaryRows.map(([key, label, icon]) => (
              <View style={s.summaryRow} key={key}>
                <Ionicons name={icon as any} size={18} color={consents[key] ? '#10b981' : '#94a3b8'} />
                <Text style={[s.summaryLabel, { color: consents[key] ? '#1e293b' : '#94a3b8' }]}>{label}</Text>
                <Ionicons
                  name={consents[key] ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={consents[key] ? '#10b981' : '#cbd5e1'}
                />
              </View>
            ))}
            <View style={s.infoCard}>
              <Ionicons name="settings-outline" size={18} color="#64748b" />
              <Text style={s.infoText}>
                {t('consentFlow.confirmInfo')}
                <Text style={{ fontWeight: '800' }}>{t('consentFlow.confirmInfoBold')}</Text>
                {t('consentFlow.confirmInfoEnd')}
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const isLastSlide = slideIndex === slides.length - 1;

  if (authLoading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: C.background }]}>
      <View style={s.progressBar}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              i === slideIndex
                ? { width: 20, borderRadius: 3, backgroundColor: C.accent }
                : { backgroundColor: C.border },
            ]}
          />
        ))}
      </View>

      <TouchableOpacity style={s.skipBtn} onPress={skipAll}>
        <Text style={[s.skipText, { color: C.textLight }]}>{t('consentFlow.skip')}</Text>
      </TouchableOpacity>

      <Animated.View style={[s.slide, { opacity: fadeAnim }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {renderSlide()}
        </ScrollView>
      </Animated.View>

      <View style={[s.navRow, { backgroundColor: C.cardWhite, borderTopColor: C.border }]}>
        {slideIndex > 0 ? (
          <TouchableOpacity style={[s.btnBack, { backgroundColor: C.surfaceLow }]} onPress={goBack}>
            <Ionicons name="arrow-back" size={18} color={C.textSecondary} />
            <Text style={[s.btnBackText, { color: C.textSecondary }]}>Voltar</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <TouchableOpacity
          style={[
            s.btnNext,
            { backgroundColor: C.accent },
            isLastSlide && { backgroundColor: C.connectivity.online },
          ]}
          onPress={isLastSlide ? confirm : goNext}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={C.cardWhite} />
          ) : (
            <>
              <Text style={[s.btnNextText, { color: C.cardWhite }]}>
                {isLastSlide ? t('consentFlow.confirmEnter') : t('consentFlow.continue')}
              </Text>
              {!isLastSlide && <Ionicons name="arrow-forward" size={18} color={C.cardWhite} />}
              {isLastSlide && <Ionicons name="checkmark" size={18} color={C.cardWhite} />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  progressBar: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e2e8f0' },
  dotActive: { width: 20, backgroundColor: '#EA580C' },
  skipBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, right: 20, zIndex: 10, padding: 8 },
  skipText: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  slide: { flex: 1 },
  slideContent: { padding: 24 },
  slideHeader: { alignItems: 'center', marginBottom: 28, gap: 10 },
  slideTitle: { fontSize: 22, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  slideDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },

  /** Logo no slide «Bem-vindo» — sem caixa nem fundo (só a imagem). */
  heroLogoWrap: {
    alignSelf: 'center',
    marginBottom: 20,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogoImg: { width: 220, height: 72 },
  /** Ícone circular (ex.: confirmação final). */
  heroIcon: { width: 96, height: 96, borderRadius: 28, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20, marginTop: 16, shadowColor: '#EA580C', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 10 },
  heroSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  infoCard: { flexDirection: 'row', gap: 10, backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  infoText: { flex: 1, fontSize: 12, color: '#1d4ed8', lineHeight: 18 },

  warnBox: { flexDirection: 'row', gap: 10, backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#fde68a' },
  warnText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 },

  collectGrid: { gap: 10, marginTop: 8 },
  collectItem: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  collectTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  collectDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, gap: 12, borderWidth: 1, borderColor: '#f1f5f9', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  toggleIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  toggleContent: { flex: 1 },
  toggleTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 3 },
  toggleDesc: { fontSize: 11, color: '#64748b', lineHeight: 16 },

  retentionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  retentionDot: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  retentionLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  retentionDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
  retentionPeriod: { fontSize: 12, fontWeight: '900' },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  navRow: { flexDirection: 'row', gap: 10, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  btnBack: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 14 },
  btnBackText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  btnNext: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EA580C', borderRadius: 14, paddingVertical: 14 },
  btnConfirm: { backgroundColor: '#10b981' },
  btnNextText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
