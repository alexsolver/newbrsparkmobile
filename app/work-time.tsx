import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { usePersona } from '../src/context/PersonaContext';
import { getPersonaHomeHref } from '../src/navigation/personaRouting';
import { collectPunchInputs, isLikelyOnline, type CollectedPunch } from '../src/lib/workTimePunchCollect';
import { computeJourneyUiState, type WorkTimeJourneyPhase } from '../src/lib/workTimeJourney';
import {
  enqueueWorkTimePunch,
  getWorkTimeOutboxForDisplay,
  pushWorkTimePunchOutbox,
} from '../src/services/workTimePunchOutbox';
import {
  fetchWorkTimeMe,
  fetchWorkTimePunchesWithLocalFallback,
  isConnectivityFailure,
  postWorkTimePunch,
  WorkTimePunchRequestError,
  type WorkTimeMeOk,
  type WorkTimePunchCreated,
  type WorkTimePunchRow,
  type WorkTimePunchType,
} from '../src/services/workTimeService';
import { mergePendingWithServerPunches } from '../src/services/workTimePunchesCache';
import { MODE_SEGMENT_COLORS } from '../src/theme/colors';
import type { ColorPalette } from '../src/theme/colors';
import { fontSize, fontWeight, radius, space } from '../src/theme/layout';
import type { User } from '../src/services/auth';
import { userHasCapability } from '../src/services/auth';
import {
  deriveEmployeeMatriculaFromUser,
  formatDeviceSummaryFromSnapshot,
  formatGpsLine,
} from '../src/lib/workTimePunchDisplay';
import {
  accumulatedWorkedMsAtPunchLocalDay,
  formatWorkedHm,
  punchRecordStatusTone,
} from '../src/lib/workTimeDayWorked';
import { emitWorkTimeJourneyChanged } from '../src/lib/workTimeJourneyEvents';
import {
  clearWorkTimeMeCache,
  readWorkTimeMeCacheForUser,
  writeWorkTimeMeCache,
} from '../src/services/workTimeMeCache';

function isWorkTimeMeAuthFailureMessage(err: string): boolean {
  const s = String(err || '');
  return /401|403|SESSION|Unauthorized|Não autorizado|não autorizado|TOKEN|token expir/i.test(s);
}

const PUNCH_ICONS: Record<WorkTimePunchType, keyof typeof Ionicons.glyphMap> = {
  CLOCK_IN: 'log-in-outline',
  CLOCK_OUT: 'log-out-outline',
  BREAK_START: 'cafe-outline',
  BREAK_END: 'checkmark-done-outline',
};

function punchAccent(type: WorkTimePunchType, C: ColorPalette): string {
  switch (type) {
    case 'CLOCK_IN':
      return C.status.success.fg;
    case 'CLOCK_OUT':
      return C.textSecondary;
    case 'BREAK_START':
      return C.status.warning.fg;
    case 'BREAK_END':
      return C.status.info.fg;
    default:
      return MODE_SEGMENT_COLORS.PROVIDER;
  }
}

/** Relógio do cabeçalho: em intervalo (`on_break`), amarelo mais forte que o accent de marca. */
function headerClockAccentForPhase(phase: WorkTimeJourneyPhase, C: ColorPalette, themeDark: boolean): string {
  if (phase !== 'on_break') return C.accent;
  return themeDark ? '#FDE047' : '#CA8A04';
}

function punchCardDisplayFields(p: WorkTimePunchRow, sessionUser: User | null) {
  const name = (p.employeeFullName && String(p.employeeFullName).trim()) || sessionUser?.name || '—';
  const mat =
    (p.employeeMatricula && String(p.employeeMatricula).trim()) || deriveEmployeeMatriculaFromUser(sessionUser);
  const rawLogin =
    p.rawPayload && typeof p.rawPayload === 'object'
      ? (p.rawPayload as { appUserLogin?: unknown }).appUserLogin
      : undefined;
  const login =
    (typeof rawLogin === 'string' && rawLogin.trim()) ||
    (p.employeeEmail && String(p.employeeEmail).trim()) ||
    (sessionUser?.email && String(sessionUser.email).trim()) ||
    '—';
  const device =
    (p.deviceSummary && String(p.deviceSummary).trim()) ||
    formatDeviceSummaryFromSnapshot(p.validationSnapshot, p.rawPayload) ||
    '—';
  const gps = (p.gpsLine && String(p.gpsLine).trim()) || formatGpsLine(p.lat, p.lng, p.accuracy) || '—';
  const addr = (p.formattedAddress && String(p.formattedAddress).trim()) || '—';
  return { name, mat, login, device, gps, addr };
}

function punchFaceValidatedLine(p: WorkTimePunchRow, t: (k: string) => string): string {
  const id = p.faceVerificationId && String(p.faceVerificationId).trim();
  if (id) return t('workTime.detailFaceValidatedYes');
  if (p.syncPending) return t('workTime.detailFaceValidatedPending');
  return t('workTime.detailFaceValidatedNo');
}

/** `ideals.face` no snapshot do servidor: regra de face do tenant cumprida nesta batida. */
function punchSnapshotIdealFaceOk(p: WorkTimePunchRow): boolean | null {
  const s = p.validationSnapshot;
  if (!s || typeof s !== 'object') return null;
  const ideals = (s as { ideals?: unknown }).ideals;
  if (!ideals || typeof ideals !== 'object') return null;
  const face = (ideals as { face?: unknown }).face;
  return typeof face === 'boolean' ? face : null;
}

/**
 * «Exceção» no backend = falhou alguma exigência ideal do tenant (GPS, morada e/ou face).
 * O texto antigo falava sempre em «sem biometria», o que conflita quando a exceção foi só GPS/morada
 * ou quando há `faceVerificationId`.
 */
function punchExceptionDetailBlock(
  p: WorkTimePunchRow,
  t: (k: string) => string
): { primary: string; justification?: string } {
  if (!p.exceptionRegistration) {
    return { primary: t('workTime.detailExceptionNotApplicable') };
  }
  const just = p.exceptionJustification && String(p.exceptionJustification).trim();
  const faceId = p.faceVerificationId && String(p.faceVerificationId).trim();
  const idealFaceOk = punchSnapshotIdealFaceOk(p);
  const faceEvidenceOnPunch = !!faceId || idealFaceOk === true;
  return {
    primary: faceEvidenceOnPunch
      ? t('workTime.detailExceptionBodyWithFaceVerified')
      : t('workTime.detailExceptionNoBiometricBody'),
    justification: just || undefined,
  };
}

/** Erro da fila / API quando não há rosto na foto — mostramos bloco unificado (pt-BR no JSON). */
function isPendingSyncNoFaceError(msg: string | null | undefined): boolean {
  if (msg == null || typeof msg !== 'string') return false;
  const s = msg.toLowerCase();
  return s.includes('nenhum rosto') || s.includes('no face is found') || s.includes('no face');
}

function formatPunchWhen(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
    return {
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  } catch {
    return { date: '—', time: '—' };
  }
}

async function persistPunchToOutbox(
  type: WorkTimePunchType,
  collected: CollectedPunch,
  opts: { exception: boolean; justification?: string },
  appUserLogin?: string | null
): Promise<void> {
  const ts = new Date().toISOString();
  const loginTrim = appUserLogin != null && String(appUserLogin).trim() ? String(appUserLogin).trim() : undefined;
  await enqueueWorkTimePunch({
    clientPunchUuid: collected.clientPunchUuid,
    type,
    deviceTimestamp: ts,
    offlineQueuedAt: ts,
    exceptionRegistration: opts.exception,
    exceptionJustification: opts.justification,
    deviceInfo: collected.deviceInfo,
    lat: collected.lat,
    lng: collected.lng,
    accuracy: collected.accuracy,
    faceVerificationId: collected.faceVerificationId,
    faceScore: collected.faceScore,
    faceEngine: collected.faceEngine,
    faceImagePendingUpload: collected.faceImagePendingUpload,
    appUserLogin: loginTrim,
    collectionNotes: collected.collectionNotes,
  });
}

export default function WorkTimeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors: C, dark: themeDark } = useTheme();
  const styles = useMemo(() => createStyles(C, themeDark), [C, themeDark]);
  const { user } = useAuth();
  const { activePersona } = usePersona();
  const accountRole = String(user?.role || '').toUpperCase();
  const canAccessWorkTime = userHasCapability(user, 'mobile.workTime.access');
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<WorkTimeMeOk | null>(null);
  const dayJourneyTitleKey: 'workTime.dayJourneyTitleBrPj' | 'workTime.dayJourneyTitle' =
    me?.workTimeBrazilRegime === 'PJ' ? 'workTime.dayJourneyTitleBrPj' : 'workTime.dayJourneyTitle';
  const [usingOfflineWorkTimeConfig, setUsingOfflineWorkTimeConfig] = useState(false);
  const [punches, setPunches] = useState<WorkTimePunchRow[]>([]);
  const [submitting, setSubmitting] = useState<WorkTimePunchType | null>(null);
  const [exceptionModal, setExceptionModal] = useState<{
    visible: boolean;
    punchType: WorkTimePunchType | null;
    summaryText: string;
    justification: string;
  }>({ visible: false, punchType: null, summaryText: '', justification: '' });
  const pendingCollectRef = useRef<CollectedPunch | null>(null);

  React.useEffect(() => {
    if (canAccessWorkTime) return;
    router.replace(getPersonaHomeHref(activePersona) as any);
  }, [canAccessWorkTime, activePersona, router]);

  const loadAll = useCallback(async () => {
    try {
      try {
        await pushWorkTimePunchOutbox();
      } catch (e) {
        console.warn('[work-time] fila de ponto (envio):', e);
      }
      const pending = await getWorkTimeOutboxForDisplay();
      const session = user ? { id: user.id, tenantId: user.tenantId } : null;

      let meFetchThrew = false;
      let eff: Awaited<ReturnType<typeof fetchWorkTimeMe>> = null;
      try {
        eff = await fetchWorkTimeMe();
      } catch {
        meFetchThrew = true;
        eff = null;
      }

      const punchesMergedNetOrCache = async () => {
        try {
          const rows = await fetchWorkTimePunchesWithLocalFallback(session, 31);
          return mergePendingWithServerPunches(pending, rows);
        } catch (e) {
          console.warn('[work-time] batidas (rede/cache):', e);
          return mergePendingWithServerPunches(pending, []);
        }
      };

      const applyMeAndPunches = async (m: WorkTimeMeOk) => {
        try {
          setMe(m);
          setPunches(await punchesMergedNetOrCache());
        } catch (e) {
          console.warn('[work-time] aplicar /me + batidas:', e);
          setMe(m);
          setPunches(mergePendingWithServerPunches(pending, []));
        }
      };

      if (eff && eff.ok) {
        setUsingOfflineWorkTimeConfig(false);
        await writeWorkTimeMeCache(eff);
        await applyMeAndPunches(eff);
        return;
      }

      if (meFetchThrew) {
        const cached = await readWorkTimeMeCacheForUser(session);
        if (cached) {
          setUsingOfflineWorkTimeConfig(true);
          await applyMeAndPunches(cached);
          return;
        }
        setUsingOfflineWorkTimeConfig(false);
        setMe(null);
        setPunches(await punchesMergedNetOrCache());
        return;
      }

      if (eff && !eff.ok) {
        if (isWorkTimeMeAuthFailureMessage(eff.error)) {
          try {
            await clearWorkTimeMeCache();
          } catch {
            /* ignore */
          }
          setUsingOfflineWorkTimeConfig(false);
          setMe(null);
          setPunches(await punchesMergedNetOrCache());
          return;
        }
        const cached = await readWorkTimeMeCacheForUser(session);
        if (cached) {
          setUsingOfflineWorkTimeConfig(true);
          await applyMeAndPunches(cached);
          return;
        }
        setUsingOfflineWorkTimeConfig(false);
        setMe(null);
        setPunches(await punchesMergedNetOrCache());
        return;
      }

      try {
        await clearWorkTimeMeCache();
      } catch {
        /* ignore */
      }
      setUsingOfflineWorkTimeConfig(false);
      setMe(null);
      setPunches(await punchesMergedNetOrCache());
    } finally {
      try {
        emitWorkTimeJourneyChanged();
      } catch {
        /* ignore */
      }
    }
  }, [user?.id, user?.tenantId]);

  const onMount = useCallback(async () => {
    setLoading(true);
    try {
      await loadAll();
    } finally {
      setLoading(false);
    }
  }, [loadAll]);

  React.useEffect(() => {
    void onMount().catch((e) => console.warn('[work-time] onMount:', e));
  }, [onMount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } catch (e) {
      console.warn('[work-time] onRefresh:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  if (!canAccessWorkTime) {
    return null;
  }

  const punchLabel = (type: string) => {
    const k = `workTime.punchTypes.${type}` as const;
    const v = t(k);
    return v === k ? type : v;
  };

  const postWithCollected = useCallback(
    async (
      type: WorkTimePunchType,
      collected: CollectedPunch,
      opts: { exception: boolean; justification?: string }
    ): Promise<WorkTimePunchCreated> => {
      const appUserLogin = user?.email && String(user.email).trim() ? String(user.email).trim() : undefined;
      return postWorkTimePunch({
        type,
        deviceTimestamp: new Date().toISOString(),
        lat: collected.lat,
        lng: collected.lng,
        accuracy: collected.accuracy,
        faceVerificationId: collected.faceVerificationId,
        faceScore: collected.faceScore,
        faceEngine: collected.faceEngine,
        deviceInfo: collected.deviceInfo,
        exceptionRegistration: opts.exception,
        exceptionJustification: opts.justification,
        rawPayload: appUserLogin ? { appUserLogin } : undefined,
      });
    },
    [user?.email]
  );

  const submitPunch = async (type: WorkTimePunchType) => {
    if (!me?.ok) return;
    if (!computeJourneyUiState(punches).enabled[type]) return;
    setSubmitting(type);
    try {
      const collected = await collectPunchInputs(me.settings, user?.id);

      if (!(await isLikelyOnline())) {
        await persistPunchToOutbox(type, collected, { exception: false }, user?.email);
        Alert.alert(t('common.success'), t('workTime.punchQueuedOffline'));
        await loadAll();
        return;
      }

      const tryNormal = async () => {
        return postWithCollected(type, collected, { exception: false });
      };

      try {
        const created = await tryNormal();
        if (created.exceptionRegistration) {
          Alert.alert(t('common.success'), t('workTime.punchSavedException'));
        } else if (created.faceEnrollmentInvalid) {
          Alert.alert(t('common.success'), t('workTime.punchSavedFaceInvalid'));
        } else {
          Alert.alert(t('common.success'), t('workTime.punchSaved'));
        }
        await loadAll();
        return;
      } catch (err) {
        const isReq = err instanceof WorkTimePunchRequestError;
        const code = isReq ? err.code : undefined;
        const recoverable =
          code === 'GPS_REQUIRED' ||
          code === 'GPS_ACCURACY' ||
          code === 'ADDRESS_REQUIRED' ||
          code === 'FACE_REQUIRED';

        if (!recoverable) {
          if (isConnectivityFailure(err)) {
            await persistPunchToOutbox(type, collected, { exception: false }, user?.email);
            Alert.alert(t('common.success'), t('workTime.punchQueuedOffline'));
            await loadAll();
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          Alert.alert(t('common.error'), msg);
          return;
        }

        const serverMsg = err instanceof Error ? err.message : String(err);
        const detail = [serverMsg, ...collected.collectionNotes].filter(Boolean).join('\n\n');

        Alert.alert(t('workTime.validationFailedTitle'), detail, [
          { text: t('common.cancel'), style: 'cancel', onPress: () => {} },
          {
            text: t('workTime.tryAgain'),
            onPress: () => void submitPunch(type),
          },
          {
            text: t('workTime.registerWithJustification'),
            style: 'destructive',
            onPress: () => {
              pendingCollectRef.current = collected;
              setExceptionModal({
                visible: true,
                punchType: type,
                summaryText: detail,
                justification: '',
              });
            },
          },
        ]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('common.error'), msg);
    } finally {
      setSubmitting(null);
    }
  };

  const closeExceptionModal = () => {
    pendingCollectRef.current = null;
    setExceptionModal({ visible: false, punchType: null, summaryText: '', justification: '' });
  };

  const confirmExceptionPunch = async () => {
    const j = exceptionModal.justification.trim();
    if (j.length < 10) {
      Alert.alert(t('common.attention'), t('workTime.exceptionJustificationMin'));
      return;
    }
    const type = exceptionModal.punchType;
    const collected = pendingCollectRef.current;
    if (!type || !collected) {
      closeExceptionModal();
      return;
    }
    setSubmitting(type);
    try {
      if (!(await isLikelyOnline())) {
        await persistPunchToOutbox(type, collected, { exception: true, justification: j }, user?.email);
        closeExceptionModal();
        Alert.alert(t('common.success'), t('workTime.punchQueuedOffline'));
        await loadAll();
        return;
      }
      const created = await postWithCollected(type, collected, { exception: true, justification: j });
      closeExceptionModal();
      if (created.exceptionRegistration) {
        Alert.alert(t('common.success'), t('workTime.punchSavedException'));
      } else if (created.faceEnrollmentInvalid) {
        Alert.alert(t('common.success'), t('workTime.punchSavedFaceInvalid'));
      } else {
        Alert.alert(t('common.success'), t('workTime.punchSaved'));
      }
      await loadAll();
    } catch (e: unknown) {
      if (isConnectivityFailure(e)) {
        await persistPunchToOutbox(type, collected, { exception: true, justification: j }, user?.email);
        closeExceptionModal();
        Alert.alert(t('common.success'), t('workTime.punchQueuedOffline'));
        await loadAll();
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('common.error'), msg);
    } finally {
      setSubmitting(null);
    }
  };

  const headerBack = (
    <Pressable onPress={() => router.back()} hitSlop={14} style={styles.headerBackBtn} accessibilityRole="button">
      <Ionicons name="chevron-back" size={26} color={C.slate} />
    </Pressable>
  );

  if (accountRole === 'USER') {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.headerRowPlain}>
          {headerBack}
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>{t('workTime.title')}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
        <View style={{ padding: space.lg }}>
          <View style={[styles.messageCard, { borderColor: C.status.info.border, backgroundColor: C.status.info.bg }]}>
            <Ionicons name="information-circle-outline" size={28} color={C.status.info.fg} style={{ marginBottom: space.sm }} />
            <Text style={[styles.messageBody, { color: C.status.info.fg }]}>{t('workTime.clientAccountNoAccess')}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const showActions = me?.ok && me.showWorkTimeInApp && me.canRegisterPunch;
  const notice = me?.ok && me.settings.employeeNoticeMarkdown ? String(me.settings.employeeNoticeMarkdown).trim() : '';
  const actionTypes: WorkTimePunchType[] = ['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END'];

  const journeyUi = useMemo(() => computeJourneyUiState(punches), [punches]);
  const headerClockAccent = headerClockAccentForPhase(journeyUi.phase, C, themeDark);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <Modal visible={exceptionModal.visible} animationType="slide" transparent onRequestClose={closeExceptionModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => { Keyboard.dismiss(); closeExceptionModal(); }} />
          <View style={[styles.modalSheet, { backgroundColor: C.cardWhite, borderColor: C.status.warning.border }]}>
            <View style={[styles.modalGrab, { backgroundColor: C.border }]} />
            <Text style={[styles.modalTitle, { color: C.slate }]}>{t('workTime.exceptionModalTitle')}</Text>
            <Text style={[styles.modalHint, { color: C.textSecondary }]}>{t('workTime.exceptionModalHint')}</Text>
            <ScrollView
              style={styles.modalScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.modalSummary, { color: C.textLight }]}>{exceptionModal.summaryText}</Text>
            </ScrollView>
            <TextInput
              value={exceptionModal.justification}
              onChangeText={(txt) => setExceptionModal((m) => ({ ...m, justification: txt }))}
              placeholder={t('workTime.exceptionJustificationPlaceholder')}
              placeholderTextColor={C.textLight}
              multiline
              numberOfLines={4}
              style={[styles.modalInput, { borderColor: C.divider, color: C.slate, backgroundColor: C.surfaceLow }]}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={closeExceptionModal} style={[styles.modalBtnSecondary, { backgroundColor: C.surfaceLow }]}>
                <Text style={[styles.modalBtnSecondaryText, { color: C.textSecondary }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmExceptionPunch()}
                disabled={submitting !== null}
                style={[
                  styles.modalBtnPrimary,
                  { backgroundColor: C.primary, opacity: submitting ? 0.65 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={C.filledButtonFg} />
                ) : (
                  <Text style={[styles.modalBtnPrimaryText, { color: C.filledButtonFg }]}>{t('workTime.confirmExceptionPunch')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <LinearGradient
        colors={themeDark ? [`${C.primary}33`, C.background] : [`${C.primary}14`, C.background]}
        locations={[0, 1]}
        style={styles.heroGradient}
      >
        <View style={styles.headerRow}>
          {headerBack}
          <View style={styles.headerTitles}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.titleIconWrap,
                  { backgroundColor: themeDark ? `${headerClockAccent}38` : `${headerClockAccent}22` },
                ]}
              >
                <Ionicons name="time" size={22} color={headerClockAccent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {t('workTime.title')}
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            onPress={() => void onRefresh()}
            style={styles.refreshBtn}
            disabled={loading || refreshing}
            accessibilityRole="button"
            accessibilityLabel={t('workTime.refreshA11y')}
          >
            <Ionicons name="refresh" size={22} color={loading || refreshing ? C.textLight : C.accent} />
          </Pressable>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}>
          <View style={[styles.loadingCard, themeDark ? styles.cardDark : styles.cardLight]}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.mainColumn}>
          {showActions ? (
            <View
              style={[
                styles.stickyActionsTop,
                {
                  backgroundColor: C.background,
                  borderBottomColor: C.divider,
                },
              ]}
            >
              {!me.faceEnrollmentOk ? (
                <View
                  style={[
                    styles.bannerRow,
                    { backgroundColor: C.status.warning.bg, borderColor: C.status.warning.border, marginBottom: space.sm },
                  ]}
                >
                  <Ionicons name="alert-circle-outline" size={22} color={C.status.warning.fg} style={{ marginRight: space.sm }} />
                  <Text style={[styles.bannerText, { color: C.status.warning.fg }]}>
                    {t('workTime.dashboardEntryHintMatriculaPending')}
                  </Text>
                </View>
              ) : null}
              {me.faceReenrollmentWindowOpen ? (
                <View
                  style={[
                    styles.bannerRow,
                    { backgroundColor: C.status.info.bg, borderColor: C.status.info.border, marginBottom: space.sm },
                  ]}
                >
                  <Ionicons name="camera-outline" size={22} color={C.status.info.fg} style={{ marginRight: space.sm }} />
                  <Text style={[styles.bannerText, { color: C.status.info.fg }]}>
                    {t('workTime.faceReenrollmentBanner')}
                  </Text>
                </View>
              ) : null}
              <View style={styles.actionGrid}>
                {actionTypes.map((pt) => {
                  const accent = punchAccent(pt, C);
                  const busy = submitting !== null;
                  const isThis = submitting === pt;
                  const allowed = journeyUi.enabled[pt];
                  const disabled = busy || !allowed;
                  return (
                    <Pressable
                      key={pt}
                      onPress={() => void submitPunch(pt)}
                      disabled={disabled}
                      style={({ pressed }) => [
                        styles.actionTile,
                        themeDark ? styles.cardDark : styles.cardLight,
                        { borderLeftWidth: 4, borderLeftColor: accent },
                        pressed && !disabled ? { opacity: 0.92, transform: [{ scale: 0.98 }] } : null,
                        disabled ? { opacity: 0.4 } : null,
                        busy && !isThis ? styles.actionTileDim : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={punchLabel(pt)}
                      accessibilityState={{ disabled }}
                    >
                      {isThis ? (
                        <ActivityIndicator color={accent} style={{ marginBottom: space.xs }} />
                      ) : (
                        <Ionicons name={PUNCH_ICONS[pt]} size={28} color={accent} style={{ marginBottom: space.xs }} />
                      )}
                      <Text style={[styles.actionLabel, { color: C.slate }]} numberOfLines={2}>
                        {punchLabel(pt)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, space.lg) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          >
          {usingOfflineWorkTimeConfig && me?.ok ? (
            <View
              style={[
                styles.bannerRow,
                {
                  backgroundColor: C.status.info.bg,
                  borderColor: C.status.info.border,
                  marginBottom: space.md,
                },
              ]}
            >
              <Ionicons name="cloud-offline-outline" size={22} color={C.status.info.fg} style={{ marginRight: space.sm }} />
              <Text style={[styles.bannerText, { color: C.status.info.fg }]}>{t('workTime.offlineCachedConfigBanner')}</Text>
            </View>
          ) : null}

          {!me?.ok ? (
            <View style={[styles.messageCard, { borderColor: C.border, backgroundColor: C.surfaceLow }]}>
              <Ionicons name="cloud-offline-outline" size={28} color={C.textSecondary} style={{ marginBottom: space.sm }} />
              <Text style={[styles.messageTitle, { color: C.slate }]}>{t('workTime.unavailable')}</Text>
              <Text style={[styles.messageBody, { color: C.textSecondary, marginTop: space.xs }]}>
                {t('workTime.offlineNoMeCacheHint')}
              </Text>
            </View>
          ) : null}

          {me?.ok && !me.showWorkTimeInApp ? (
            <View style={[styles.messageCard, { borderColor: C.status.warning.border, backgroundColor: C.status.warning.bg }]}>
              <Ionicons name="lock-closed-outline" size={26} color={C.status.warning.fg} style={{ marginBottom: space.sm }} />
              <Text style={[styles.messageTitle, { color: C.status.warning.fg }]}>{t('workTime.moduleOffTitle')}</Text>
              <Text style={[styles.messageBody, { color: C.status.warning.fg, marginTop: space.xs }]}>
                {!me.featureFlagEnabled
                  ? t('workTime.hintFlagOff')
                  : !me.settings.moduleEnabled
                    ? t('workTime.hintTenantModuleOff')
                    : !me.userWorkTimeEnabled
                      ? t('workTime.hintUserOff')
                      : t('workTime.hintRoleClient')}
              </Text>
            </View>
          ) : null}

          {notice ? (
            <View style={[styles.noticeCard, { backgroundColor: C.status.info.bg, borderColor: C.status.info.border }]}>
              <View style={styles.noticeHeader}>
                <Ionicons name="document-text-outline" size={18} color={C.status.info.fg} />
                <Text style={[styles.noticeTitle, { color: C.status.info.fg }]}>{t('workTime.noticeTitle')}</Text>
              </View>
              <Text style={[styles.noticeBody, { color: C.slate }]}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.historyHeaderRow}>
              <Text style={[styles.sectionTitle, { color: C.slate, marginBottom: 0 }]}>{t('workTime.historyTitle')}</Text>
              {punches.length > 0 ? (
                <View style={[styles.countChip, { backgroundColor: C.surfaceLow, borderColor: C.border }]}>
                  <Text style={[styles.countChipText, { color: C.textSecondary }]}>{punches.length}</Text>
                </View>
              ) : null}
            </View>

            {punches.length === 0 ? (
              <View style={[styles.emptyHistory, { borderColor: C.border, backgroundColor: C.cardWhite }]}>
                <Ionicons name="calendar-outline" size={40} color={C.textLight} />
                <Text style={[styles.emptyHistoryText, { color: C.textSecondary }]}>{t('workTime.historyEmpty')}</Text>
              </View>
            ) : (
              <View style={{ gap: space.md }}>
                {punches.map((p) => {
                  const { date, time } = formatPunchWhen(p.deviceTimestamp);
                  const accent = punchAccent(p.type as WorkTimePunchType, C);
                  const d = punchCardDisplayFields(p, user);
                  return (
                    <View
                      key={p.id}
                      style={[
                        styles.punchHistoryCard,
                        themeDark ? styles.cardDark : styles.cardLight,
                        { borderLeftWidth: 4, borderLeftColor: accent },
                      ]}
                    >
                      <View style={styles.punchCardHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <View style={[styles.punchCardIconWrap, { backgroundColor: `${accent}22` }]}>
                            <Ionicons name={PUNCH_ICONS[p.type as WorkTimePunchType]} size={22} color={accent} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.punchCardTitle, { color: C.slate }]} numberOfLines={2}>
                              {punchLabel(p.type)}
                            </Text>
                            <Text style={[styles.punchCardDate, { color: C.textLight }]}>{date}</Text>
                          </View>
                        </View>
                        <Text style={[styles.punchCardTime, { color: C.textSecondary }]}>{time}</Text>
                      </View>

                      {(() => {
                        const tone = punchRecordStatusTone(p);
                        const ok = tone === 'success';
                        const dotColor = ok ? '#22c55e' : '#eab308';
                        const label = ok ? t('workTime.punchStatusSuccess') : t('workTime.punchStatusCaution');
                        return (
                          <View
                            style={styles.punchStatusRow}
                            accessibilityRole="text"
                            accessibilityLabel={label}
                          >
                            <View style={[styles.punchStatusDot, { backgroundColor: dotColor }]} />
                            <Text style={[styles.punchStatusText, { color: ok ? '#166534' : '#854d0e' }]}>{label}</Text>
                          </View>
                        );
                      })()}

                      {(() => {
                        const dayMs = accumulatedWorkedMsAtPunchLocalDay(punches, p);
                        if (p.syncPending && dayMs === 0) return null;
                        return (
                          <View style={styles.punchDetailBlock}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <Ionicons name="time-outline" size={16} color={C.textLight} />
                              <Text style={[styles.punchDetailLabel, { color: C.textLight, marginBottom: 0 }]}>
                                {t(dayJourneyTitleKey)}
                              </Text>
                            </View>
                            <Text style={[styles.punchDetailValue, { color: C.slate }]}>
                              {t('workTime.dayJourneyWorked', {
                                time: formatWorkedHm(dayMs),
                              })}
                            </Text>
                          </View>
                        );
                      })()}

                      <View style={[styles.punchCardDivider, { backgroundColor: C.divider }]} />

                      <View style={styles.punchDetailBlock}>
                        <Text style={[styles.punchDetailLabel, { color: C.textLight }]}>{t('workTime.detailName')}</Text>
                        <Text style={[styles.punchDetailValue, { color: C.slate }]}>{d.name}</Text>
                      </View>
                      <View style={styles.punchDetailBlock}>
                        <Text style={[styles.punchDetailLabel, { color: C.textLight }]}>{t('workTime.detailMatricula')}</Text>
                        <Text style={[styles.punchDetailValueMono, { color: C.textSecondary }]} selectable>
                          {d.mat}
                        </Text>
                      </View>
                      <View style={styles.punchDetailBlock}>
                        <Text style={[styles.punchDetailLabel, { color: C.textLight }]}>{t('workTime.detailAppLogin')}</Text>
                        <Text style={[styles.punchDetailValueMono, { color: C.textSecondary }]} selectable>
                          {d.login}
                        </Text>
                      </View>

                      <View style={[styles.punchCardDivider, { backgroundColor: C.divider }]} />

                      <View style={styles.punchDetailBlock}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Ionicons name="hardware-chip-outline" size={16} color={C.textLight} />
                          <Text style={[styles.punchDetailLabel, { color: C.textLight, marginBottom: 0 }]}>
                            {t('workTime.detailDevice')}
                          </Text>
                        </View>
                        <Text style={[styles.punchDetailValue, { color: C.slate }]}>{d.device}</Text>
                      </View>
                      <View style={styles.punchDetailBlock}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Ionicons name="navigate-outline" size={16} color={C.textLight} />
                          <Text style={[styles.punchDetailLabel, { color: C.textLight, marginBottom: 0 }]}>
                            {t('workTime.detailGps')}
                          </Text>
                        </View>
                        <Text style={[styles.punchDetailValueMono, { color: C.slate }]} selectable>
                          {d.gps}
                        </Text>
                      </View>
                      <View style={styles.punchDetailBlock}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Ionicons name="location-outline" size={16} color={C.textLight} />
                          <Text style={[styles.punchDetailLabel, { color: C.textLight, marginBottom: 0 }]}>
                            {t('workTime.detailAddress')}
                          </Text>
                        </View>
                        <Text style={[styles.punchDetailValue, { color: C.slate }]}>{d.addr}</Text>
                      </View>

                      <View style={[styles.punchCardDivider, { backgroundColor: C.divider }]} />

                      <View style={styles.punchDetailBlock}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Ionicons name="scan-outline" size={16} color={C.textLight} />
                          <Text style={[styles.punchDetailLabel, { color: C.textLight, marginBottom: 0 }]}>
                            {t('workTime.detailBiometricFaceLabel')}
                          </Text>
                        </View>
                        <Text style={[styles.punchDetailValue, { color: C.slate }]}>{punchFaceValidatedLine(p, t)}</Text>
                      </View>
                      {p.exceptionRegistration ? (
                        <View style={styles.punchDetailBlock}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="document-text-outline" size={16} color={C.textLight} />
                            <Text style={[styles.punchDetailLabel, { color: C.textLight, marginBottom: 0 }]}>
                              {t('workTime.detailExceptionLabel')}
                            </Text>
                          </View>
                          {(() => {
                            const ex = punchExceptionDetailBlock(p, t);
                            return (
                              <>
                                <Text style={[styles.punchDetailValue, { color: C.slate }]}>{ex.primary}</Text>
                                {ex.justification ? (
                                  <View style={{ marginTop: 6 }}>
                                    <Text style={[styles.punchDetailLabel, { color: C.textLight, marginBottom: 2 }]}>
                                      {t('workTime.detailExceptionJustificationLabel')}
                                    </Text>
                                    <Text style={[styles.punchDetailValue, { color: C.textSecondary }]} selectable>
                                      {ex.justification}
                                    </Text>
                                  </View>
                                ) : null}
                              </>
                            );
                          })()}
                        </View>
                      ) : null}

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.sm }}>
                        {p.syncPending && p.syncPendingError && isPendingSyncNoFaceError(p.syncPendingError) ? (
                          <Text
                            style={[styles.punchDetailValue, { color: C.status.warning.fg, flexBasis: '100%', lineHeight: 22 }]}
                            selectable
                          >
                            {t('workTime.pendingSyncNoFaceBlock')}
                          </Text>
                        ) : (
                          <>
                            {p.syncPending ? (
                              <View style={[styles.warnChip, { backgroundColor: `${C.accent}18`, borderColor: `${C.accent}55` }]}>
                                <Ionicons name="cloud-upload-outline" size={14} color={C.accent} />
                                <Text style={[styles.warnChipText, { color: C.accent }]}>{t('workTime.historyPendingSync')}</Text>
                              </View>
                            ) : null}
                            {p.syncPending && p.syncPendingError ? (
                              <Text
                                style={[styles.punchDetailValue, { color: C.status.warning.fg, flexBasis: '100%', lineHeight: 22 }]}
                                numberOfLines={8}
                                selectable
                              >
                                {p.syncPendingError}
                              </Text>
                            ) : null}
                          </>
                        )}
                        {p.exceptionRegistration ? (
                          <View style={[styles.warnChip, { backgroundColor: C.status.warning.bg, borderColor: C.status.warning.border }]}>
                            <Ionicons name="warning-outline" size={14} color={C.status.warning.fg} />
                            <Text style={[styles.warnChipText, { color: C.status.warning.fg }]}>{t('workTime.historyExceptionBadge')}</Text>
                          </View>
                        ) : null}
                        {p.faceEnrollmentInvalid ? (
                          <View style={[styles.warnChip, { backgroundColor: C.status.warning.bg, borderColor: C.status.warning.border }]}>
                            <Ionicons name="finger-print-outline" size={14} color={C.status.warning.fg} />
                            <Text style={[styles.warnChipText, { color: C.status.warning.fg }]}>{t('workTime.historyMatriculaNaoValidada')}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(C: ColorPalette, themeDark: boolean) {
  const cardShadow =
    !themeDark && Platform.OS === 'ios'
      ? {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.07,
          shadowRadius: 14,
        }
      : !themeDark && Platform.OS === 'android'
        ? { elevation: 4 }
        : {};

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    heroGradient: {
      paddingBottom: space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.divider,
    },
    headerRowPlain: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.xs,
      paddingTop: 4,
      minHeight: 52,
      backgroundColor: C.cardWhite,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.divider,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.xs,
      paddingTop: 4,
      minHeight: 52,
    },
    headerBackBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitles: { flex: 1, minWidth: 0, paddingRight: space.xs },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    titleIconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.black,
      color: C.slate,
      letterSpacing: -0.3,
    },
    refreshBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.lg },
    loadingCard: {
      paddingVertical: space.lg * 2,
      paddingHorizontal: space.lg * 2,
      borderRadius: radius.lg,
      alignItems: 'center',
      minWidth: 200,
    },
    loadingText: {
      marginTop: space.md,
      color: C.textSecondary,
      fontWeight: fontWeight.bold,
      fontSize: fontSize.sm,
    },
    /** Coluna principal: ações fixas no topo + lista a rolar. */
    mainColumn: { flex: 1 },
    scrollFlex: { flex: 1 },
    stickyActionsTop: {
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: space.md,
      borderBottomWidth: StyleSheet.hairlineWidth * 2,
    },
    scrollContent: { padding: space.md, paddingTop: space.sm },
    messageCard: {
      padding: space.md,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      marginBottom: space.md,
    },
    messageTitle: { fontSize: fontSize.md, fontWeight: fontWeight.black, lineHeight: 24 },
    messageBody: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, lineHeight: 22 },
    bannerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: space.md,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      marginBottom: space.md,
    },
    bannerText: { flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.bold, lineHeight: 18 },
    noticeCard: {
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      padding: space.md,
      marginBottom: space.md,
    },
    noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.xs },
    noticeTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.black, textTransform: 'uppercase', letterSpacing: 0.4 },
    noticeBody: { fontSize: fontSize.sm, lineHeight: 22, fontWeight: fontWeight.medium },
    section: { marginBottom: space.lg },
    sectionTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.black,
      marginBottom: 6,
      letterSpacing: -0.2,
    },
    sectionHint: { fontSize: fontSize.xs, marginBottom: space.md, lineHeight: 17, fontWeight: fontWeight.medium },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    actionTile: {
      flex: 1,
      minWidth: '47%',
      minHeight: 100,
      paddingVertical: space.md,
      paddingHorizontal: space.sm,
      borderRadius: radius.lg,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      ...cardShadow,
    },
    actionTileDim: { opacity: 0.45 },
    actionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.black, textAlign: 'center', lineHeight: 17 },
    historyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    countChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
    },
    countChipText: { fontSize: fontSize.xs, fontWeight: fontWeight.black },
    emptyHistory: {
      alignItems: 'center',
      paddingVertical: space.lg * 2,
      paddingHorizontal: space.md,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    emptyHistoryText: {
      marginTop: space.sm,
      fontSize: fontSize.sm,
      textAlign: 'center',
      lineHeight: 22,
      fontWeight: fontWeight.medium,
    },
    cardLight: { backgroundColor: C.cardWhite },
    cardDark: { backgroundColor: C.cardWhite, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
    punchHistoryCard: {
      borderRadius: radius.lg,
      padding: space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      ...cardShadow,
    },
    punchCardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: space.sm,
    },
    punchStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: space.sm,
      marginBottom: 2,
    },
    punchStatusDot: { width: 12, height: 12, borderRadius: 6 },
    punchStatusText: { fontSize: fontSize.sm, fontWeight: fontWeight.black, flex: 1 },
    punchCardIconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    punchCardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.black, letterSpacing: -0.2 },
    punchCardDate: { fontSize: fontSize.xs, marginTop: 2, fontWeight: fontWeight.medium },
    punchCardTime: { fontSize: fontSize.xs, fontWeight: fontWeight.black, fontVariant: ['tabular-nums'] },
    punchCardDivider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
    punchDetailBlock: { marginBottom: space.sm },
    punchDetailLabel: {
      fontSize: 10,
      fontWeight: fontWeight.black,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    punchDetailValue: { fontSize: fontSize.sm, lineHeight: 20, fontWeight: fontWeight.medium },
    punchDetailValueMono: { fontSize: fontSize.sm, lineHeight: 20, fontWeight: fontWeight.bold, fontVariant: ['tabular-nums'] },
    warnChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginTop: 0,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
    },
    warnChipText: { fontSize: 11, fontWeight: fontWeight.bold, flexShrink: 1 },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' },
    modalSheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: 28,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
    },
    modalGrab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: space.sm },
    modalTitle: { fontSize: fontSize.md, fontWeight: fontWeight.black },
    modalHint: { fontSize: fontSize.xs, marginTop: space.xs, lineHeight: 18, fontWeight: fontWeight.medium },
    modalScroll: { maxHeight: 120, marginTop: space.sm },
    modalSummary: { fontSize: 11, lineHeight: 16, fontWeight: fontWeight.medium },
    modalInput: {
      marginTop: space.sm,
      minHeight: 100,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.md,
      padding: space.sm,
      fontSize: fontSize.sm,
      textAlignVertical: 'top',
    },
    modalActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
    modalBtnSecondary: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' },
    modalBtnSecondaryText: { fontWeight: fontWeight.black },
    modalBtnPrimary: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    modalBtnPrimaryText: { fontWeight: fontWeight.black },
  });
}
