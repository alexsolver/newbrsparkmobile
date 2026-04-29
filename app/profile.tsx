import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, Image, Dimensions, Switch, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager, Linking } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { ColorPalette } from '../src/theme/colors';
import { useTheme } from '../src/theme/ThemeContext';
import { Header } from '../src/components/Header';
import { ApiService } from '../src/services/api';
import { Ionicons } from '@expo/vector-icons';
import { getSyncQueue } from '../src/database';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/hooks/useAuth';
import { useResolvedAvatarUri } from '../src/hooks/useResolvedAvatarUri';
import {
  AuthService,
  API_BASE,
  getToken,
  isTechnicianProfileActive,
  isTechnicianAvatarLocked,
  isFaceReenrollmentWindowOpen,
  isFieldTaskEligibleRole,
  canUseFieldWorkAppRole,
  canUseProviderMode,
  userHasCapability,
  isB2CConsumerUser,
} from '../src/services/auth';
import { writeAvatarFromBase64 } from '../src/services/avatarLocalCache';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { setLanguage, getDeviceRegion } from '../src/i18n';
import { clearLocalDatabase } from '../src/database';
import { passwordChecks } from '../src/lib/appPasswordPolicy';
import {
  getChecklistOutboxConflicts,
  requeueChecklistOutboxConflicts,
  clearChecklistOutboxConflicts,
} from '../src/services/syncService';
import { isImperial, setUnitSystem, setNumberFormat, getNumberFormat, loadNumberFormatPreference, NumberFormatPrefs } from '../src/i18n/formatters';
import { shareUserLocalDataJson } from '../src/utils/exportUserLocalData';
import { getPersonaHomeHref } from '../src/navigation/personaRouting';
import { isProviderOnboardingComplete } from '../src/lib/onboardingPrefs';
import { usePersona } from '../src/context/PersonaContext';
import { ProviderAffiliationsApi } from '../src/services/providerAffiliations';

const REGION_KEY   = '@brspark_region';
const LANGUAGE_KEY = '@brspark_language';
const PREF_PUSH_ENABLED_KEY = '@pref_push_enabled';

async function readPushEnabledPreference(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PREF_PUSH_ENABLED_KEY);
    if (raw === null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

// Idiomas do app (interface)
const LANGUAGES = [
  { code: 'pt-BR' as const, label: 'Português', short: 'PT' },
  { code: 'en-US' as const, label: 'English',   short: 'EN' },
  { code: 'es-ES' as const, label: 'Español',   short: 'ES' },
  { code: 'de-DE' as const, label: 'Deutsch',   short: 'DE' },
];

// Regiões / Países (conformidade, moeda, fuso)
const REGIONS = [
  { code: 'BR', label: 'Brasil',    detail: 'LGPD · R$' },
  { code: 'US', label: 'USA',       detail: 'CCPA · $' },
  { code: 'ES', label: 'España',    detail: 'GDPR · €' },
  { code: 'AR', label: 'Argentina', detail: 'LGPD · $' },
  { code: 'DE', label: 'Deutschland', detail: 'DSGVO · €' },
];

const { width: SCREEN_W } = Dimensions.get('window');

/** Cópia da foto oficial na galeria FaceMatch (materialização do cadastro) — não conta como uma das 4 biométricas. */
const REGISTRATION_PRIMARY_FACE_ID = 'fe_reg_primary';
const MIN_FACE_REENROLLMENT_BIOMETRIC = 4;

function countBiometricFaceEnrollmentPhotos(photos: { id?: string }[] | undefined | null): number {
  if (!Array.isArray(photos)) return 0;
  return photos.filter((p) => p && p.id && p.id !== REGISTRATION_PRIMARY_FACE_ID).length;
}

const BRSPARK_COMPANY_SIGNUP_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BRSPARK_COMPANY_SIGNUP_URL) ||
  'https://www.brspark.com/empresa';

type ProfileTab = 'conta' | 'trabalho' | 'config' | 'sync';

export default function ProfileScreen() {
  const router = useRouter();
  const { activePersona } = usePersona();
  const { user, userRole, setUserRole, logout, deleteAccount, patchUser, switchWorkspace, createWorkspace, refreshUser } =
    useAuth();
  const displayAvatarUri = useResolvedAvatarUri(user);
  const { dark: darkMode, colors: C, toggleDarkMode, appDisplayName, appTagline } = useTheme();
  const styles = useMemo(() => createProfileStyles(C), [C]);

  const { t, i18n } = useTranslation();

  const tenantKindUpper = String(user?.tenant?.kind || '').toUpperCase();
  /** Em tenants CLIENT/PROVIDER o destaque do toggle segue o espaço actual (não só o papel em memória). */
  const personaRoleForUi = useMemo(() => {
    if (tenantKindUpper === 'CLIENT') return 'CLIENT' as const;
    if (tenantKindUpper === 'PROVIDER') return 'TECHNICIAN' as const;
    return userRole;
  }, [tenantKindUpper, userRole]);

  /** Papel e tenant efectivos do JWT — detalhes técnicos da sessão (aba Sincronização). */
  const syncTabSessionDetails = useMemo(() => {
    if (!user) return null;
    const r =
      String(user.role || 'USER')
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '') || 'USER';
    const roleLabel = t(`profile.serverRoles.${r}`, { defaultValue: r });
    const tenantIdStr = String(user.tenantId || '').trim();
    const osHintConsumer = !isFieldTaskEligibleRole(user.role);

    return (
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: C.surfaceLow,
          borderWidth: 1,
          borderColor: C.border,
          maxWidth: SCREEN_W - 32,
          alignSelf: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: '800',
            color: C.textSecondary,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {t('profile.cloudAccountTitle')}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.slate }}>{roleLabel}</Text>
        <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 8, lineHeight: 18 }}>
          {osHintConsumer ? t('profile.osSyncHintUser') : t('profile.osSyncHintEligible')}
        </Text>
        {tenantIdStr ? (
          <Text
            selectable
            style={{
              fontSize: 10,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              color: C.textLight,
              marginTop: 10,
              lineHeight: 15,
            }}
          >
            {t('profile.sessionTenantId', { id: tenantIdStr })}
          </Text>
        ) : null}
      </View>
    );
  }, [user, t, C.surfaceLow, C.border, C.textSecondary, C.slate, C.textLight]);

  const [queueCount, setQueueCount] = useState(0);
  const [syncConflictCount, setSyncConflictCount] = useState(0);
  const [syncConflictsBusy, setSyncConflictsBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [selectedRegion, setSelectedRegion]   = useState<string>('BR');
  const [selectedLang,   setSelectedLang]     = useState<string>('pt-BR');
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const [privacyDropdownOpen, setPrivacyDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('conta');
  const [useImperial,    setUseImperial]      = useState<boolean>(false);
  const [numberFmt,      setNumberFmtState]   = useState<NumberFormatPrefs>({ decimals: 2, style: 'dot-comma' });
  const [showPwdModal,   setShowPwdModal]     = useState(false);
  const [oldPwd,         setOldPwd]           = useState('');
  const [newPwd,         setNewPwd]           = useState('');
  const [changingPwd,    setChangingPwd]      = useState(false);
  const [showAvatarModal,setShowAvatarModal]  = useState(false);
  // ─── 2FA State ──────────────────────────────────────────────────────────────
  const [twoFaEnabled,   setTwoFaEnabled]     = useState(false);
  const [twoFaLoading,   setTwoFaLoading]     = useState(false);
  const [show2FaModal,   setShow2FaModal]     = useState(false);
  const [tfaChallenge,   setTfaChallenge]     = useState<string | null>(null);
  const [tfaOtp,         setTfaOtp]           = useState('');
  const [tfaDisableOtp,  setTfaDisableOtp]    = useState('');
  const [tfa2Action,     setTfa2Action]       = useState<'enable' | 'disable'>('enable');

  /** Evita martelar `/api/me` em navegações rápidas entre abas. */
  const lastProfileFocusRefreshRef = useRef(0);

  /** Estado da candidatura: em aberto (token), já enviada, ou ainda sem registo (fluxo antigo). */
  const [techRegResume, setTechRegResume] = useState<{
    open: boolean;
    inviteToken?: string;
    submittedAwaitingReview?: boolean;
    status?: string;
    revisionNote?: string | null;
  } | null>(null);

  /** Quando o backend indica DEDICATED+ACTIVE, esconde o CTA «Quero ser prestador». */
  const [skipSelfServiceOnboarding, setSkipSelfServiceOnboarding] = useState(false);

  const canManageDirectoryHero = userHasCapability(user, 'mobile.admin.quickActions');

  const [dirHeroLoading, setDirHeroLoading] = useState(false);
  const [dirHeroSaving, setDirHeroSaving] = useState(false);
  const [dirHero, setDirHero] = useState<{
    skipped?: boolean;
    linked?: boolean;
    hero_image_url: string | null;
    logo_url: string | null;
    company_name: string | null;
    hint?: string | null;
  } | null>(null);
  const [heroUrlDraft, setHeroUrlDraft] = useState('');

  const applyDirectoryHeroPutResponse = (data: {
    hero_image_url?: string | null;
    company_name?: string | null;
  }) => {
    setDirHero((prev) =>
      prev
        ? {
            ...prev,
            linked: true,
            skipped: false,
            hero_image_url: data.hero_image_url ?? null,
            company_name: data.company_name ?? prev.company_name,
          }
        : {
            linked: true,
            skipped: false,
            hero_image_url: data.hero_image_url ?? null,
            logo_url: null,
            company_name: data.company_name ?? null,
          },
    );
    setHeroUrlDraft(
      typeof data.hero_image_url === 'string' ? data.hero_image_url : '',
    );
  };

  const putDirectoryHeroRemote = async (heroImageUrl: string | null) => {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/me/directory-hero`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ heroImageUrl: heroImageUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || t('profile.directoryHeroSaveError'));
    }
    return data as { hero_image_url?: string | null; company_name?: string | null };
  };

  const loadDirectoryHero = useCallback(async () => {
    if (!user || !canManageDirectoryHero) return;
    setDirHeroLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/me/directory-hero`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t('profile.directoryHeroLoadError'));
      }
      setDirHero({
        skipped: data.skipped,
        linked: data.linked,
        hero_image_url: data.hero_image_url ?? null,
        logo_url: data.logo_url ?? null,
        company_name: data.company_name ?? null,
        hint: data.hint ?? null,
      });
      setHeroUrlDraft(
        typeof data.hero_image_url === 'string' ? data.hero_image_url : '',
      );
    } catch {
      setDirHero(null);
      setHeroUrlDraft('');
    } finally {
      setDirHeroLoading(false);
    }
  }, [canManageDirectoryHero, user, t]);

  const saveDirectoryHeroUrl = async (url: string | null) => {
    if (!user) return;
    setDirHeroSaving(true);
    try {
      const data = await putDirectoryHeroRemote(url);
      applyDirectoryHeroPutResponse(data);
      Alert.alert(t('common.success'), t('profile.directoryHeroSaved'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('profile.directoryHeroSaveError'));
    } finally {
      setDirHeroSaving(false);
    }
  };

  const uploadDirectoryHeroFromAsset = async (asset: {
    uri?: string;
    base64?: string | null;
  }) => {
    if (!user) return;
    setDirHeroSaving(true);
    try {
      let fileBase64 = asset.base64 as string | undefined;
      if (!fileBase64 && asset.uri) {
        try {
          fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: 'base64',
          });
        } catch {
          /* ignore */
        }
      }
      if (!fileBase64) {
        throw new Error(t('profile.directoryHeroReadError'));
      }
      const ext =
        asset.uri?.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      const remotePath = `directory-hero/${user.id}_${Date.now()}.${ext}`;
      const token = await getToken();
      const storageRes = await fetch(`${API_BASE}/api/storage/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileBase64,
          mimeType: mime,
          name: `banner.${ext}`,
          path: remotePath,
        }),
      });
      if (!storageRes.ok) {
        throw new Error(`Storage HTTP ${storageRes.status}`);
      }
      const storageData = await storageRes.json();
      const finalUrl = storageData.url;
      if (!finalUrl) {
        throw new Error(t('profile.directoryHeroUploadError'));
      }
      const putData = await putDirectoryHeroRemote(finalUrl);
      applyDirectoryHeroPutResponse(putData);
      Alert.alert(t('common.success'), t('profile.directoryHeroSaved'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('profile.directoryHeroUploadError'));
    } finally {
      setDirHeroSaving(false);
    }
  };

  const pickDirectoryHeroImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('profile.permDenied'), t('profile.cameraPermDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 6],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await uploadDirectoryHeroFromAsset(result.assets[0]);
  };

  const loadTechRegResume = useCallback(async () => {
    if (!user?.technicianProfile || isTechnicianProfileActive(user)) {
      setTechRegResume(null);
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/me/technician-registration`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data?.open && data.inviteToken) {
        setTechRegResume({
          open: true,
          inviteToken: data.inviteToken,
          submittedAwaitingReview: false,
          status: data.status != null ? String(data.status) : undefined,
          revisionNote: data.revisionNote != null ? String(data.revisionNote) : null,
        });
      } else {
        setTechRegResume({
          open: false,
          submittedAwaitingReview: !!(data && data.submittedAwaitingReview),
        });
      }
    } catch {
      setTechRegResume({ open: false, submittedAwaitingReview: false });
    }
  }, [user]);

  const refreshSkipSelfServiceOnboarding = useCallback(async () => {
    if (!user?.id) {
      setSkipSelfServiceOnboarding(false);
      return;
    }
    try {
      const s = await ProviderAffiliationsApi.getMeStatus();
      setSkipSelfServiceOnboarding(!!s.skipSelfServiceOnboarding);
    } catch {
      setSkipSelfServiceOnboarding(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshSkipSelfServiceOnboarding();
  }, [refreshSkipSelfServiceOnboarding]);

  useFocusEffect(
    useCallback(() => {
      void refreshSkipSelfServiceOnboarding();
    }, [refreshSkipSelfServiceOnboarding]),
  );

  const [profile, setProfile] = useState({
    name: user?.name || 'User',
    email: user?.email || '',
    phone: '',
    role: '',
    avatar: null as string | null,
    avatarLocalUri: null as string | null,
  });

  useEffect(() => {
    // Priority 1: Official user from context
    if (user) {
      setProfile(prev => ({
        ...prev,
        name: user.name,
        email: user.email,
        role: user.role || prev.role
      }));
    }

    const loadProfile = async () => {
      // Priority 2: Local customizations (photo, phone)
      const saved = await AsyncStorage.getItem('@user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only merge if the saved profile email matches current user email
        // This prevents "ghost" data from previous users
        if (parsed.email === user?.email) {
          setProfile(prev => ({ ...prev, ...parsed }));
        }
      }
      
      setPushEnabled(await readPushEnabledPreference());
      const region = await AsyncStorage.getItem(REGION_KEY);
      setSelectedRegion(region || getDeviceRegion());
      const lang = await AsyncStorage.getItem(LANGUAGE_KEY);
      setSelectedLang(lang || i18n.language || 'pt-BR');
      await loadNumberFormatPreference();
      setNumberFmtState(getNumberFormat());
    };
    loadProfile();
    setUseImperial(isImperial());
    // Carrega status do 2FA
    AuthService.getTwoFactorStatus().then(setTwoFaEnabled);
  }, [user]);

  const refreshSyncIndicators = useCallback(async () => {
    try {
      setQueueCount(getSyncQueue().length);
    } catch {
      setQueueCount(0);
    }
    try {
      const conflicts = await getChecklistOutboxConflicts();
      setSyncConflictCount(conflicts.length);
    } catch {
      setSyncConflictCount(0);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refreshSyncIndicators();
      let cancelled = false;
      (async () => {
        const on = await readPushEnabledPreference();
        if (!cancelled) setPushEnabled(on);
      })();
      return () => {
        cancelled = true;
      };
    }, [refreshSyncIndicators]),
  );

  useFocusEffect(
    React.useCallback(() => {
      loadTechRegResume();
    }, [loadTechRegResume]),
  );

  useFocusEffect(
    React.useCallback(() => {
      if (canManageDirectoryHero && user) {
        void loadDirectoryHero();
      }
    }, [canManageDirectoryHero, user, loadDirectoryHero]),
  );

  const togglePush = async (val: boolean) => {
    if (val) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permDenied'), t('profile.permDeniedMsg'));
        return;
      }
    }
    await AsyncStorage.setItem(PREF_PUSH_ENABLED_KEY, JSON.stringify(val));
    setPushEnabled(val);
    if (val) Alert.alert(t('profile.alertsEnabled'), t('profile.alertsEnabledMsg'));
  };

  const saveProfile = async () => {
    await AsyncStorage.setItem('@user_profile', JSON.stringify(profile));
    setIsEditing(false);
    Alert.alert(t('profile.profileUpdated'), t('profile.profileUpdatedMsg'));
  };

  const handleSync = async () => {
    setSyncing(true);
    const success = await ApiService.sync();
    await refreshSyncIndicators();
    setSyncing(false);
    if (success) {
      // Reload formats from server if needed (future)
    }
    Alert.alert(
      success ? t('common.success') : t('common.attention'),
      success ? t('profile.syncSuccess') : t('profile.syncFailed'),
    );
  };

  const handleRequeueSyncConflicts = async () => {
    if (syncConflictsBusy) return;
    setSyncConflictsBusy(true);
    try {
      const res = await requeueChecklistOutboxConflicts();
      await refreshSyncIndicators();
      Alert.alert(
        t('profile.syncConflictsRequeuedTitle'),
        t('profile.syncConflictsRequeuedBody', { count: res.requeued, remaining: res.remaining }),
      );
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('profile.requeueConflictsFailed'));
    } finally {
      setSyncConflictsBusy(false);
    }
  };

  const handleClearSyncConflicts = async () => {
    if (syncConflictsBusy) return;
    Alert.alert(
      t('profile.syncConflictsClearTitle'),
      t('profile.syncConflictsClearBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.syncConflictsClearConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              setSyncConflictsBusy(true);
              await clearChecklistOutboxConflicts();
              await refreshSyncIndicators();
            } finally {
              setSyncConflictsBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleExportLocalData = useCallback(() => {
    Alert.alert(t('profile.exportData'), t('profile.exportDataConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.exportBtn'),
        onPress: async () => {
          try {
            await shareUserLocalDataJson({ dialogTitle: t('profile.exportShareTitle') });
            Alert.alert(t('profile.exportSuccess'), t('profile.exportSuccessMsg'));
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert(t('common.exportError'), `${t('profile.exportFailedMsg')}\n\n${msg}`);
          }
        },
      },
    ]);
  }, [t]);

  const handleBecomeTechnician = async () => {
    try {
      setSyncing(true);
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/me/technician`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t('profile.becomeTechRequestError'));
      }
      const profile = data as {
        id: string;
        status: string;
        score?: number;
        techRegistrationInviteToken?: string | null;
        techRegistrationStatus?: string;
      };
      await patchUser({
        technicianProfile: {
          id: profile.id,
          status: profile.status,
          score: typeof profile.score === 'number' ? profile.score : 5,
        },
      });
      if (String(profile.status || '').toUpperCase() === 'ACTIVE') {
        await setUserRole('TECHNICIAN');
        router.push('/auth/onboarding' as any);
        return;
      }
      const invite = profile.techRegistrationInviteToken;
      if (invite) {
        await loadTechRegResume();
        router.push({ pathname: '/auth/tech-registration', params: { token: invite } } as any);
        return;
      }
      if (String(profile.techRegistrationStatus || '').toUpperCase() === 'SUBMITTED') {
        Alert.alert(
          t('profile.becomeTechApplicationSentTitle'),
          t('profile.becomeTechApplicationSentBody'),
        );
        return;
      }
      Alert.alert(
        t('profile.becomeTechRequestRegisteredTitle'),
        t('profile.becomeTechRequestRegisteredBody'),
      );
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSyncing(false);
    }
  };

  const openHorariosERegioes = async () => {
    if (isTechnicianProfileActive(user)) {
      router.push('/profile/schedule-regions' as any);
      return;
    }
    const go = (tok: string) => {
      router.push({ pathname: '/auth/tech-registration', params: { token: tok } } as any);
    };
    const resumeTok = techRegResume?.open ? techRegResume.inviteToken : undefined;
    if (resumeTok) {
      go(resumeTok);
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/me/technician-registration`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data?.open && data.inviteToken) {
        go(String(data.inviteToken));
        return;
      }
    } catch {
      /* ignore */
    }
    if (user?.technicianProfile && !isTechnicianProfileActive(user)) {
      await handleBecomeTechnician();
      return;
    }
    Alert.alert(t('profile.workScheduleNoTechTitle'), t('profile.workScheduleNoTechBody'));
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) return Alert.alert(t('common.attention'), t('profile.fillAllFields'));
    const pc = passwordChecks(newPwd);
    if (!pc.len || !pc.upper || !pc.lower || !pc.num) {
      const parts: string[] = [];
      if (!pc.len) parts.push(t('auth.registerFlow.reqMin8'));
      if (!pc.upper) parts.push(t('auth.registerFlow.reqUpper'));
      if (!pc.lower) parts.push(t('auth.registerFlow.reqLower'));
      if (!pc.num) parts.push(t('auth.registerFlow.reqNumber'));
      return Alert.alert(
        t('common.attention'),
        `${t('auth.registerFlow.securityRequirements')}:\n${parts.join('\n')}`,
      );
    }

    setChangingPwd(true);
    try {
      await AuthService.changePassword(oldPwd, newPwd);
      Alert.alert(t('common.success'), t('profile.passwordChangedSuccess'));
      setShowPwdModal(false);
      setOldPwd('');
      setNewPwd('');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('profile.passwordChangeError'));
    } finally {
      setChangingPwd(false);
    }
  };

  const handle2FaToggle = async () => {
    if (twoFaEnabled) {
      setTwoFaLoading(true);
      try {
        await AuthService.requestDisableTwoFactor();
        setTfa2Action('disable');
        setTfaDisableOtp('');
        setShow2FaModal(true);
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message || t('profile.activationRequestError'));
      } finally {
        setTwoFaLoading(false);
      }
    } else {
      // Ativar: solicita envio de OTP por e-mail
      setTwoFaLoading(true);
      try {
        const { challengeToken } = await AuthService.requestEnableTwoFactor();
        setTfaChallenge(challengeToken);
        setTfaOtp('');
        setTfa2Action('enable');
        setShow2FaModal(true);
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message || t('profile.activationRequestError'));
      } finally {
        setTwoFaLoading(false);
      }
    }
  };

  const handle2FaConfirm = async () => {
    setTwoFaLoading(true);
    try {
      if (tfa2Action === 'enable' && tfaChallenge) {
        await AuthService.confirmEnableTwoFactor(tfaChallenge, tfaOtp);
        setTwoFaEnabled(await AuthService.getTwoFactorStatus());
        Alert.alert(t('profile.twoFaEnabledTitle'), t('profile.twoFaEnabledBody'));
      } else if (tfa2Action === 'disable') {
        await AuthService.disableTwoFactor(tfaDisableOtp);
        setTwoFaEnabled(await AuthService.getTwoFactorStatus());
        Alert.alert(t('profile.twoFaDisabledTitle'), t('profile.twoFaDisabledBody'));
      }
      setShow2FaModal(false);
    } catch (e: any) {
      Alert.alert(t('profile.invalid2FACodeTitle'), e.message || t('profile.invalid2FACodeBody'));
    } finally {
      setTwoFaLoading(false);
    }
  };

  const uploadAvatar = async (asset: any) => {
    try {
      if (user && isTechnicianAvatarLocked(user)) {
        Alert.alert(t('profile.avatarLockedTitle'), t('profile.avatarLockedBody'));
        return;
      }
      setSyncing(true);
      const token = await getToken();

      let fileBase64 = asset.base64 as string | undefined;
      if (!fileBase64 && asset.uri) {
        try {
          fileBase64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
        } catch {
          /* ignore */
        }
      }
      if (!fileBase64) {
        throw new Error(t('profile.avatarReadError'));
      }

      const ext = asset.uri.split('.').pop() || 'jpg';
      const remotePath = `avatars/${user?.id}_${Date.now()}.${ext}`;
      
      const storageRes = await fetch(`${API_BASE}/api/storage/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fileBase64,
          mimeType: `image/${ext.toLowerCase() === 'png' ? 'png' : 'jpeg'}`,
          name: `avatar.${ext}`,
          path: remotePath,
        })
      });

      if (!storageRes.ok) {
        throw new Error(`Storage API HTTP ${storageRes.status}: ${await storageRes.text()}`);
      }

      const storageData = await storageRes.json();
      const finalUrl = storageData.url || asset.uri;

      const userRes = await fetch(`${API_BASE}/api/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: finalUrl })
      });

      if (!userRes.ok) {
        const errText = await userRes.text();
        let errJson: { code?: string; error?: string } = {};
        try {
          errJson = JSON.parse(errText);
        } catch {
          /* ignore */
        }
        if (userRes.status === 403 && errJson.code === 'TECH_IDENTITY_LOCKED') {
          Alert.alert(t('profile.avatarLockedTitle'), t('profile.avatarLockedBody'));
          return;
        }
        throw new Error(`Profile API HTTP ${userRes.status}: ${errText}`);
      }

      let localUri: string | undefined;
      if (user?.id) {
        localUri = await writeAvatarFromBase64(user.id, fileBase64, ext);
      }
      await patchUser({
        avatarUrl: finalUrl,
        ...(localUri ? { avatarLocalUri: localUri } : {}),
      });

      const np = {
        ...profile,
        avatar: finalUrl,
        ...(localUri ? { avatarLocalUri: localUri } : {}),
      };
      setProfile(np);
      AsyncStorage.setItem('@user_profile', JSON.stringify(np));
      
      Alert.alert(t('common.success'), t('profile.photoUpdatedSuccess'));
    } catch (err: any) {
      Alert.alert(t('common.error'), t('profile.photoUpdateFailed', { message: err.message }));
    } finally {
      setSyncing(false);
    }
  };

  const pickAvatar = () => {
    if (user && isTechnicianAvatarLocked(user)) {
      Alert.alert(t('profile.avatarLockedTitle'), t('profile.avatarLockedBody'));
      return;
    }
    setShowAvatarModal(true);
  };

  const [faceGalleryBusy, setFaceGalleryBusy] = useState(false);
  /** Passo 1 (foto oficial + IA) concluído nesta janela — exige refazer quando abre nova janela. */
  const [faceReenrollOfficialOk, setFaceReenrollOfficialOk] = useState(false);
  const faceReenrollWindowKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = user?.technicianProfile?.faceReenrollmentUntil ?? null;
    if (!key) return;
    if (faceReenrollWindowKeyRef.current !== key) {
      faceReenrollWindowKeyRef.current = key;
      setFaceReenrollOfficialOk(false);
    }
  }, [user?.technicianProfile?.faceReenrollmentUntil]);

  const captureOfficialAvatarSelfieForReenroll = async () => {
    if (!user || !isFaceReenrollmentWindowOpen(user)) return;
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert(t('profile.permDenied'), t('profile.faceReenrollCameraPerm'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.88,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${asset.base64}`;
    setFaceGalleryBusy(true);
    try {
      const token = await getToken();
      const valRes = await fetch(`${API_BASE}/api/me/validate-technician-profile-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      const valData = await valRes.json().catch(() => ({}));
      if (!valRes.ok) {
        Alert.alert(t('common.error'), String(valData.error || `HTTP ${valRes.status}`));
        return;
      }
      if (!valData.approved) {
        const reasons = Array.isArray(valData.rejectReasonsPtBr)
          ? valData.rejectReasonsPtBr.filter(Boolean).join('\n• ')
          : '';
        Alert.alert(
          t('profile.faceReenrollAiRejectTitle'),
          reasons ? `• ${reasons}` : String(valData.userMessagePtBr || t('profile.faceReenrollAiRejectBody')),
        );
        return;
      }
      const ext = mime.includes('png') ? 'png' : 'jpg';
      await uploadAvatar({
        base64: asset.base64,
        uri: `official-reenroll.${ext}`,
        mimeType: mime,
      });
      setFaceReenrollOfficialOk(true);
      await refreshUser();
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setFaceGalleryBusy(false);
    }
  };

  const addFaceEnrollmentSelfieForReenroll = async () => {
    if (!user || !isFaceReenrollmentWindowOpen(user)) return;
    if (!faceReenrollOfficialOk) {
      Alert.alert(t('profile.faceReenrollStep1FirstTitle'), t('profile.faceReenrollStep1FirstBody'));
      return;
    }
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert(t('profile.permDenied'), t('profile.faceReenrollCameraPerm'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const fileBase64 = asset.base64;
    const mimeType = asset.mimeType || 'image/jpeg';
    setFaceGalleryBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/me/face-enrollment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileBase64, mimeType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'RE_ENROLL_OFFICIAL_REQUIRED') {
          Alert.alert(t('common.attention'), t('profile.faceReenrollOfficialRequiredError'));
          return;
        }
        Alert.alert(t('common.error'), String(data.error || `HTTP ${res.status}`));
        return;
      }
      await refreshUser();
      const nextList = Array.isArray(data.photos) ? data.photos : [];
      const n = countBiometricFaceEnrollmentPhotos(nextList);
      if (n >= MIN_FACE_REENROLLMENT_BIOMETRIC) {
        Alert.alert(t('common.success'), t('profile.faceReenrollBiometricComplete'));
      } else {
        Alert.alert(t('common.success'), t('profile.faceReenrollOk'));
      }
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setFaceGalleryBusy(false);
    }
  };

  const removeFaceEnrollmentPhoto = useCallback(
    async (photoId: string) => {
      if (!user || !isFaceReenrollmentWindowOpen(user)) return;
      Alert.alert(t('profile.faceReenrollRemoveTitle'), t('profile.faceReenrollRemoveConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setFaceGalleryBusy(true);
              const token = await getToken();
              const res = await fetch(
                `${API_BASE}/api/me/face-enrollment/${encodeURIComponent(photoId)}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert(t('common.error'), String(data.error || `HTTP ${res.status}`));
                return;
              }
              await refreshUser();
            } catch (e: unknown) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
            } finally {
              setFaceGalleryBusy(false);
            }
          },
        },
      ]);
    },
    [user, refreshUser, t],
  );

  const { showProviderModeToggles, showBecomeProviderCta } = useMemo(() => {
    const b2c = isB2CConsumerUser(user);
    const k = String(user?.tenant?.kind || 'COMPANY').toUpperCase();
    const tenantIsWorkspaceSplit = k === 'CLIENT' || k === 'PROVIDER';
    return {
      showBecomeProviderCta: b2c && !tenantIsWorkspaceSplit && !skipSelfServiceOnboarding,
      showProviderModeToggles:
        tenantIsWorkspaceSplit ||
        (!b2c &&
          (isFieldTaskEligibleRole(user?.role) ||
            isTechnicianProfileActive(user) ||
            canUseProviderMode(user))),
    };
  }, [user, skipSelfServiceOnboarding]);

  const faceReenrollBioCount = useMemo(
    () => countBiometricFaceEnrollmentPhotos(user?.faceEnrollmentPhotos),
    [user?.faceEnrollmentPhotos],
  );

  const visibleProfileTabs = useMemo(() => {
    const rows: [ProfileTab, string][] = [
      ['conta', 'profile.tabConta'],
      ['config', 'profile.tabConfiguracoes'],
      ['trabalho', 'profile.tabTrabalho'],
      ['sync', 'profile.tabSincronizacao'],
    ];
    if (personaRoleForUi === 'CLIENT') return rows.filter(([id]) => id !== 'trabalho');
    return rows;
  }, [personaRoleForUi]);

  useEffect(() => {
    if (personaRoleForUi === 'CLIENT' && activeTab === 'trabalho') {
      setActiveTab('conta');
    }
  }, [personaRoleForUi, activeTab]);

  /** Ao focar o perfil: actualizar estado do servidor (habilitação prestador, capabilities) sem depender só do throttle do AppState. */
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const now = Date.now();
      if (now - lastProfileFocusRefreshRef.current < 25_000) return;
      lastProfileFocusRefreshRef.current = now;
      void refreshUser();
    }, [user, refreshUser]),
  );

  /** Cliente/Prestador = troca de tenant (CLIENT vs PROVIDER); cria o espaço em falta com o mesmo e-mail. */
  const ensurePersonaWorkspace = useCallback(
    async (target: 'CLIENT' | 'PROVIDER') => {
      if (!user) return;
      const targetKind = target === 'CLIENT' ? 'CLIENT' : 'PROVIDER';

      try {
        setSyncing(true);

        /** Sincronizar com `/api/me` antes de validar capability e `technicianProfile` (evita estado obsoleto após aprovação no painel). */
        const refreshed = await refreshUser();
        const effectiveUser = refreshed ?? user;

        const currentKind = String(effectiveUser.tenant?.kind || '').toUpperCase();

        if (currentKind === targetKind) {
          if (target === 'PROVIDER') {
            if (!canUseProviderMode(effectiveUser)) {
              Alert.alert(t('profile.providerUnavailableTitle'), t('profile.providerUnavailableBody'));
              return;
            }
            const providerOnboardingDone = await isProviderOnboardingComplete();
            if (!providerOnboardingDone) {
              router.push('/auth/onboarding' as any);
              return;
            }
          }
          await setUserRole(target === 'CLIENT' ? 'CLIENT' : 'TECHNICIAN');
          router.replace(getPersonaHomeHref(target === 'CLIENT' ? 'client' : 'provider') as any);
          return;
        }

        const workspaces = await AuthService.listSiblingWorkspaces();
        const match = workspaces.find((w) => String(w.kind || '').toUpperCase() === targetKind);

        let sessionUser = effectiveUser;
        if (match?.id && match.id !== effectiveUser.tenantId) {
          sessionUser = await switchWorkspace(match.id);
        } else if (!match) {
          sessionUser = await createWorkspace(targetKind as 'CLIENT' | 'PROVIDER');
        }

        if (target === 'PROVIDER') {
          if (!canUseProviderMode(sessionUser)) {
            Alert.alert(t('profile.providerUnavailableTitle'), t('profile.providerUnavailableBody'));
            return;
          }
          const providerOnboardingDone = await isProviderOnboardingComplete();
          if (!providerOnboardingDone) {
            router.push('/auth/onboarding' as any);
            return;
          }
        }

        // Após switchWorkspace/createWorkspace o RouteGuard pode ainda ver persona antiga; alinhar papel e dar um frame ao React antes do replace.
        await setUserRole(target === 'CLIENT' ? 'CLIENT' : 'TECHNICIAN');
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        router.replace(getPersonaHomeHref(target === 'CLIENT' ? 'client' : 'provider') as any);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(t('common.error'), msg || t('profile.switchWorkspaceError'));
      } finally {
        setSyncing(false);
      }
    },
    [user, refreshUser, switchWorkspace, createWorkspace, setUserRole, router, t],
  );

  // ── Guest Mode ──────────────────────────────────────────────
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <View style={styles.guestIcon}><Ionicons name="person-outline" size={48} color={C.textLight} /></View>
          <Text style={[styles.guestTitle, { color: C.primary }]}>{t('profile.title')}</Text>
          <Text style={[styles.guestSub, { color: C.textSecondary }]}>{t('profile.guestMsg')}</Text>
          <TouchableOpacity style={styles.guestBtn} onPress={() => router.replace('/auth/login' as any)}>
            <Text style={styles.guestBtnText}>{t('profile.createOrLogin')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main Profile ────────────────────────────────────────────
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ─── Profile Summary Card ─── */}
        <View style={styles.profileHeaderCard}>
          {activePersona !== 'provider' ? (
            <>
              <Text style={[styles.headerBrandName, { color: C.accent }]}>{appDisplayName}</Text>
              {appTagline ? <Text style={[styles.headerBrandTagline, { color: C.textSecondary }]}>{appTagline}</Text> : null}
            </>
          ) : null}
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} style={styles.headerAvatarWrap}>
            {displayAvatarUri ? (
              <Image
                source={{ uri: displayAvatarUri }}
                style={styles.headerAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.headerAvatarPlaceholder, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="person" size={40} color={C.textLight} />
              </View>
            )}
            <View style={[styles.headerAvatarEdit, user && isTechnicianAvatarLocked(user) ? { opacity: 0.85 } : null]}>
              <Ionicons
                name={user && isTechnicianAvatarLocked(user) ? 'lock-closed' : 'camera'}
                size={14}
                color="#fff"
              />
            </View>
          </TouchableOpacity>
          
          <Text style={[styles.headerName, { color: '#191C1D' }]}>{profile.name}</Text>
          <Text style={[styles.headerSub, { color: C.textSecondary }]}>{profile.email}</Text>

          {user.technicianProfile && !isTechnicianProfileActive(user) ? (
            <View style={[styles.listCard, { marginHorizontal: 16, marginTop: 12, maxWidth: SCREEN_W - 32, alignSelf: 'center', width: '100%', padding: 16 }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 6 }}>
                Prestador, aguardando habilitação
              </Text>
              <Text style={{ fontSize: 13, color: '#64748B', lineHeight: 20 }}>
                {String(user.technicianProfile.status || '').toUpperCase() === 'PENDING'
                  ? techRegResume?.submittedAwaitingReview
                    ? 'Sua documentação já foi enviada e está em análise. Até ser aprovada, você não receberá ordens de serviço e o modo prestador permanece indisponível.'
                    : techRegResume?.open &&
                        String(techRegResume.status || '').toUpperCase() === 'NEEDS_REVISION'
                      ? 'A equipe pediu ajustes no seu cadastro. Corrija os dados no formulário (nome, telefone, endereço, documentos, etc.) e reenvie. Use o botão verde abaixo — é o mesmo ecrã onde preencheu o cadastro; lá aparece também a mensagem completa da revisão.'
                      : techRegResume?.open
                        ? 'Complete o cadastro de prestador (dados, documentos, horários e fotos). Depois do envio, a equipe analisa e aprova. Até lá, o modo prestador permanece indisponível.'
                        : 'Falta preencher o cadastro completo de prestador. Toque no botão abaixo para abrir o formulário. Depois do envio, a equipe analisa e aprova.'
                  : 'Sua conta de prestador não está ativa. Você não receberá novas ordens de serviço até a equipe reativar o acesso.'}
              </Text>
              {String(user.technicianProfile.status || '').toUpperCase() === 'PENDING' &&
              techRegResume?.open &&
              String(techRegResume.status || '').toUpperCase() === 'NEEDS_REVISION' &&
              techRegResume.revisionNote ? (
                <View
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: '#fff7ed',
                    borderWidth: 1,
                    borderColor: '#fdba74',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#9a3412', marginBottom: 6 }}>
                    Mensagem da equipe (ajustes pedidos)
                  </Text>
                  <Text style={{ fontSize: 13, color: '#431407', lineHeight: 20 }}>{techRegResume.revisionNote}</Text>
                </View>
              ) : null}
              {String(user.technicianProfile.status || '').toUpperCase() === 'PENDING' &&
              !techRegResume?.submittedAwaitingReview ? (
                techRegResume?.open && techRegResume.inviteToken ? (
                  <TouchableOpacity
                    style={{
                      marginTop: 12,
                      backgroundColor: '#0F766E',
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: 'center',
                    }}
                    onPress={() =>
                      router.push({
                        pathname: '/auth/tech-registration',
                        params: { token: techRegResume.inviteToken },
                      } as any)
                    }
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                      {String(techRegResume.status || '').toUpperCase() === 'NEEDS_REVISION'
                        ? 'Corrigir dados e reenviar cadastro'
                        : 'Continuar cadastro de prestador'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{
                      marginTop: 12,
                      backgroundColor: '#D97706',
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: 'center',
                    }}
                    onPress={handleBecomeTechnician}
                    disabled={syncing}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                      {syncing ? 'A abrir…' : 'Abrir formulário de cadastro'}
                    </Text>
                  </TouchableOpacity>
                )
              ) : null}
            </View>
          ) : null}

          {user && isTechnicianProfileActive(user) && isFaceReenrollmentWindowOpen(user) ? (
            <View
              style={{
                marginTop: 12,
                marginHorizontal: 16,
                maxWidth: SCREEN_W - 32,
                alignSelf: 'center',
                width: '100%',
                padding: 14,
                borderRadius: 12,
                backgroundColor: '#ecfeff',
                borderWidth: 1,
                borderColor: '#67e8f9',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0e7490', marginBottom: 6 }}>
                {t('profile.faceReenrollBannerTitle')}
              </Text>
              <Text style={{ fontSize: 12, color: '#155e75', marginBottom: 8 }}>
                {t('profile.faceReenrollBannerUntil', {
                  date: user.technicianProfile?.faceReenrollmentUntil
                    ? new Date(user.technicianProfile.faceReenrollmentUntil).toLocaleString(i18n.language)
                    : '—',
                })}
              </Text>
              {user.technicianProfile?.faceReenrollmentNote ? (
                <Text style={{ fontSize: 13, color: '#164e63', lineHeight: 20, marginBottom: 10 }}>
                  {user.technicianProfile.faceReenrollmentNote}
                </Text>
              ) : null}
              <Text style={{ fontSize: 12, color: '#155e75', marginBottom: 10, lineHeight: 18 }}>
                {t('profile.faceReenrollFlowHint')}
              </Text>
              <TouchableOpacity
                onPress={() => void captureOfficialAvatarSelfieForReenroll()}
                disabled={faceGalleryBusy}
                style={{
                  backgroundColor: faceReenrollOfficialOk ? '#fff' : '#0f766e',
                  borderWidth: faceReenrollOfficialOk ? 2 : 0,
                  borderColor: '#0f766e',
                  paddingVertical: 11,
                  borderRadius: 10,
                  alignItems: 'center',
                  marginBottom: 8,
                  opacity: faceGalleryBusy ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: faceReenrollOfficialOk ? '#0f766e' : '#fff',
                    fontWeight: '800',
                    fontSize: 13,
                  }}
                >
                  {faceReenrollOfficialOk ? `✓ ${t('profile.faceReenrollStep1Done')}` : `1. ${t('profile.faceReenrollStep1Button')}`}
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: '#0e7490', fontWeight: '600', marginBottom: 8 }}>
                {t('profile.faceReenrollStep2Progress', {
                  current: faceReenrollBioCount,
                  min: MIN_FACE_REENROLLMENT_BIOMETRIC,
                })}
              </Text>
              <TouchableOpacity
                onPress={() => void addFaceEnrollmentSelfieForReenroll()}
                disabled={
                  faceGalleryBusy ||
                  !faceReenrollOfficialOk ||
                  faceReenrollBioCount >= MIN_FACE_REENROLLMENT_BIOMETRIC
                }
                style={{
                  backgroundColor:
                    !faceReenrollOfficialOk || faceReenrollBioCount >= MIN_FACE_REENROLLMENT_BIOMETRIC
                      ? '#cbd5e1'
                      : '#0e7490',
                  paddingVertical: 11,
                  borderRadius: 10,
                  alignItems: 'center',
                  marginBottom: 10,
                  opacity: faceGalleryBusy ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                  {faceGalleryBusy
                    ? '…'
                    : faceReenrollBioCount >= MIN_FACE_REENROLLMENT_BIOMETRIC
                      ? `2. ${t('profile.faceReenrollStep2Done')}`
                      : `2. ${t('profile.faceReenrollStep2Button', {
                          slot: faceReenrollBioCount + 1,
                          min: MIN_FACE_REENROLLMENT_BIOMETRIC,
                        })}`}
                </Text>
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {(Array.isArray(user.faceEnrollmentPhotos) ? user.faceEnrollmentPhotos : []).map((ph) => (
                    <View key={ph.id} style={{ width: 72, alignItems: 'center', marginRight: 10 }}>
                      <Image source={{ uri: ph.url }} style={{ width: 64, height: 64, borderRadius: 10 }} />
                      <TouchableOpacity onPress={() => void removeFaceEnrollmentPhoto(ph.id)} style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 11, color: '#b91c1c', fontWeight: '700' }}>
                          {t('profile.faceReenrollRemove')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}

          {showProviderModeToggles ? (
            <View style={{ marginTop: 12, marginHorizontal: 16, maxWidth: SCREEN_W - 32, alignSelf: 'center', width: '100%' }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  color: C.textSecondary,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  textAlign: 'center',
                }}
              >
                {t('profile.usageModeTitle')}
              </Text>
              <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '500', textAlign: 'center', marginBottom: 10, lineHeight: 16 }}>
                {isTechnicianProfileActive(user)
                  ? t('profile.usageModeHintTechnician')
                  : t('profile.usageModeHintInternal')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: '#E2E8F0',
                  borderRadius: 14,
                  padding: 4,
                  borderWidth: 1,
                  borderColor: C.border,
                }}
              >
                <TouchableOpacity
                  onPress={() => ensurePersonaWorkspace('CLIENT')}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: personaRoleForUi === 'CLIENT' ? '#fff' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: personaRoleForUi === 'CLIENT' ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: personaRoleForUi === 'CLIENT' ? 0.06 : 0,
                    shadowRadius: 2,
                    elevation: personaRoleForUi === 'CLIENT' ? 2 : 0,
                  }}
                >
                  <Text style={{ color: personaRoleForUi === 'CLIENT' ? '#059669' : '#64748B', fontWeight: '800', fontSize: 14 }}>
                    {t('profile.personaClient')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => ensurePersonaWorkspace('PROVIDER')}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: personaRoleForUi === 'TECHNICIAN' ? '#fff' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: personaRoleForUi === 'TECHNICIAN' ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: personaRoleForUi === 'TECHNICIAN' ? 0.06 : 0,
                    shadowRadius: 2,
                    elevation: personaRoleForUi === 'TECHNICIAN' ? 2 : 0,
                  }}
                >
                  <Text style={{ color: personaRoleForUi === 'TECHNICIAN' ? '#C2410C' : '#64748B', fontWeight: '800', fontSize: 14 }}>
                    {t('profile.personaProvider')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : showBecomeProviderCta ? (
            <View style={{ marginTop: 12, marginBottom: 0, marginHorizontal: 16, maxWidth: SCREEN_W - 32, alignSelf: 'center', width: '100%' }}>
              <TouchableOpacity onPress={handleBecomeTechnician} style={{ backgroundColor: '#D97706', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Quero ser um Prestador</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.editInfoBtn, { backgroundColor: C.surfaceLow }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActiveTab('conta');
              setIsEditing((v) => !v);
            }}
          >
            <Ionicons name={isEditing ? 'close' : 'create-outline'} size={14} color={C.slate} style={{ marginRight: 6 }} />
            <Text style={styles.editInfoBtnText}>{isEditing ? t('profile.closeEditBtn') : t('profile.editBtn')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, marginBottom: 4 }}
          contentContainerStyle={{
            paddingHorizontal: 6,
            paddingVertical: 4,
            gap: 8,
            alignItems: 'center',
          }}
        >
          {visibleProfileTabs.map(([id, k]) => {
            const sel = activeTab === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setActiveTab(id);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: sel ? C.accent : '#E2E8F0',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: sel ? '#fff' : '#475569' }}>{t(k)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {activeTab === 'conta' && isEditing && (
          <View style={[styles.editFormCard, { backgroundColor: '#fff' }]}>
            <Text style={styles.formTitle}>Editar Dados</Text>
            <TextInput 
              style={styles.simpleInput} 
              placeholder="Nome" 
              value={profile.name} 
              onChangeText={v => setProfile({ ...profile, name: v })} 
            returnKeyType="done"
                      />
            <TextInput 
              style={styles.simpleInput} 
              placeholder="Email" 
              value={profile.email} 
              onChangeText={v => setProfile({ ...profile, email: v })} 
            returnKeyType="done"
                      />
            <TouchableOpacity style={styles.saveSubmitBtn} onPress={saveProfile}>
              <Text style={styles.saveSubmitBtnText}>Salvar Alterações</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'trabalho' && (
          <>
            {showProviderModeToggles || user?.technicianProfile || isTechnicianProfileActive(user) || showBecomeProviderCta ? (
              <>
                {showProviderModeToggles && personaRoleForUi === 'TECHNICIAN' ? (
                  <View style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 10 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#FFF7ED',
                        borderRadius: 14,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: '#FDBA74',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onPress={() => router.push('/profile/affiliations' as any)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: '#FB923C',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="business" size={18} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: '#9A3412' }}>
                            {t('profile.affiliationsCardTitle')}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#C2410C', marginTop: 2 }}>{t('profile.affiliationsCardSub')}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#C2410C" />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#F0F9FF',
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: '#BFDBFE',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onPress={openHorariosERegioes}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: '#0284C7',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="calendar-outline" size={18} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#0369A1' }}>{t('profile.workScheduleCardTitle')}</Text>
                        <Text style={{ fontSize: 11, color: '#0C4A6E', marginTop: 2 }}>
                          {skipSelfServiceOnboarding
                            ? t('profile.workScheduleCardSubDedicated')
                            : t('profile.workScheduleCardSub')}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#0369A1" />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={{ marginHorizontal: 20, marginTop: 8, fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>
                {t('profile.workTabConsumerHint')}
              </Text>
            )}
          </>
        )}

        {activeTab === 'config' && (
        <>
        <View style={[styles.sectionHeaderWrap, { flexDirection: 'row', alignItems: 'center', marginTop: 4 }]}>
          <Ionicons name="business-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
          <Text style={styles.sectionHeaderLabel}>{(t('profile.companySignupTitle') || 'Empresa').toUpperCase()}</Text>
        </View>
        <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
          <View style={[styles.listCard, { padding: 16 }]}>
            <Text style={{ fontSize: 13, color: '#64748B', lineHeight: 20, marginBottom: 12 }}>
              {t('profile.companySignupHint')}
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
              onPress={async () => {
                try {
                  const can = await Linking.canOpenURL(BRSPARK_COMPANY_SIGNUP_URL);
                  if (can) await Linking.openURL(BRSPARK_COMPANY_SIGNUP_URL);
                  else Alert.alert('', t('profile.companySignupOpenError'));
                } catch {
                  Alert.alert('', t('profile.companySignupOpenError'));
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('profile.companySignupCta')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.sectionHeaderWrap, {flexDirection: 'row', alignItems: 'center'}]}>
          <Ionicons name="language" size={14} color="#64748B" style={{marginRight: 6}} />
          <Text style={styles.sectionHeaderLabel}>{(t('profile.selectLanguage') || 'Idioma').toUpperCase()}</Text>
        </View>
        <View style={{ paddingHorizontal: 4, marginBottom: 8, marginTop: -6 }}>
          <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '500' }}>{t('profile.languageInterfaceHint')}</Text>
        </View>
        <View style={[styles.listCard, { paddingVertical: 0, paddingHorizontal: 0, flexDirection: 'column', alignItems: 'stretch' }]}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}
            activeOpacity={0.7}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setLangDropdownOpen(!langDropdownOpen);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="language" size={24} color="#191C1D" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#191C1D' }}>{LANGUAGES.find(l => l.code === selectedLang)?.label}</Text>
            </View>
            <Ionicons name={langDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#94A3B8" />
          </TouchableOpacity>

          {langDropdownOpen && (
            <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              {LANGUAGES.map((lang, idx) => {
                const isActive = selectedLang === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={async () => {
                      setSelectedLang(lang.code);
                      await setLanguage(lang.code);
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setLangDropdownOpen(false);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: isActive ? '#F0F9FF' : '#fff', borderBottomWidth: idx === LANGUAGES.length - 1 ? 0 : 1, borderBottomColor: '#F1F5F9' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: isActive ? '800' : '500', color: isActive ? '#0369A1' : '#475569', marginLeft: 6 }}>{lang.label}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark-circle" size={20} color="#0284C7" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ─── País / Região (conformidade, moeda, fuso) ─── */}
        <View style={[styles.sectionHeaderWrap, {flexDirection: 'row', alignItems: 'center'}]}>
          <Ionicons name="globe" size={14} color="#64748B" style={{marginRight: 6}} />
          <Text style={styles.sectionHeaderLabel}>{t('profile.regionSectionTitle').toUpperCase()}</Text>
        </View>
        <View style={{ paddingHorizontal: 4, marginBottom: 8, marginTop: -6 }}>
          <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '500' }}>{t('profile.regionHint')}</Text>
        </View>
        <View style={[styles.listCard, { paddingVertical: 0, paddingHorizontal: 0, flexDirection: 'column', alignItems: 'stretch' }]}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}
            activeOpacity={0.7}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setRegionDropdownOpen(!regionDropdownOpen);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="globe" size={24} color="#191C1D" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#191C1D' }}>{REGIONS.find(r => r.code === selectedRegion)?.label || 'Selecione..'}</Text>
            </View>
            <Ionicons name={regionDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#94A3B8" />
          </TouchableOpacity>

          {regionDropdownOpen && (
            <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              {REGIONS.map((r, idx) => {
                const isActive = selectedRegion === r.code;
                return (
                  <TouchableOpacity
                    key={r.code}
                    onPress={async () => {
                      setSelectedRegion(r.code);
                      await AsyncStorage.setItem(REGION_KEY, r.code);
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setRegionDropdownOpen(false);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: isActive ? '#F0F9FF' : '#fff', borderBottomWidth: idx === REGIONS.length - 1 ? 0 : 1, borderBottomColor: '#F1F5F9' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ marginLeft: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: isActive ? '800' : '500', color: isActive ? '#0369A1' : '#475569' }}>{r.label}</Text>
                        <Text style={{ fontSize: 10, color: isActive ? '#0284C7' : '#94A3B8', marginTop: 2 }}>{r.detail}</Text>
                      </View>
                    </View>
                    {isActive && <Ionicons name="checkmark-circle" size={20} color="#0284C7" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ─── Main Settings List ─── */}
        <View style={[styles.sectionHeaderWrap, {flexDirection: 'row', alignItems: 'center'}]}>
          <Ionicons name="color-palette" size={14} color="#64748B" style={{marginRight: 6}} />
          <Text style={styles.sectionHeaderLabel}>{(t('profile.globalInterface') || 'Interface Global').toUpperCase()}</Text>
        </View>
        <View style={styles.listCard}>
          <View style={styles.listItem}>
            <View style={[styles.listIconBox, { backgroundColor: '#F0F9FF' }]}>
              <Ionicons name="moon" size={18} color="#0369A1" />
            </View>
            <Text style={styles.listItemText}>{t('profile.darkMode')}</Text>
            <Switch value={darkMode} onValueChange={toggleDarkMode} trackColor={{ false: '#E2E8F0', true: '#BFDBFE' }} thumbColor={darkMode ? '#3B82F6' : '#fff'} />
          </View>
          
          <View style={styles.listSeparator} />

          <View style={styles.listItem}>
            <View style={[styles.listIconBox, { backgroundColor: '#FDF2F8' }]}>
              <Ionicons name="notifications" size={18} color="#BE185D" />
            </View>
            <Text style={styles.listItemText}>{t('profile.alerts')}</Text>
            <Switch value={pushEnabled} onValueChange={togglePush} trackColor={{ false: '#E2E8F0', true: '#FBCFE8' }} thumbColor={pushEnabled ? '#DB2777' : '#fff'} />
          </View>
        </View>
        </>
        )}

        {activeTab === 'conta' && (
        <>
        {/* ─── Segurança ─── */}
        <View style={[styles.sectionHeaderWrap, {flexDirection: 'row', alignItems: 'center'}]}>
          <Ionicons name="shield-checkmark" size={14} color="#64748B" style={{marginRight: 6}} />
          <Text style={styles.sectionHeaderLabel}>{t('profile.securitySectionTitle').toUpperCase()}</Text>
        </View>
        <View style={styles.listCard}>
          <TouchableOpacity style={styles.listItem} onPress={() => setShowPwdModal(true)}>
            <View style={[styles.listIconBox, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="key-outline" size={18} color="#475569" />
            </View>
            <Text style={styles.listItemText}>Alterar Senha</Text>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </TouchableOpacity>

          <View style={styles.listSeparator} />

          {/* Toggle 2FA */}
          <View style={[styles.listItem, { paddingVertical: 14 }]}>
            <View style={[styles.listIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listItemText}>Verificação em 2 etapas</Text>
              <Text style={styles.listItemSub}>{twoFaEnabled ? 'Ativado · Código enviado por e-mail' : 'Desativado'}</Text>
            </View>
            <Switch
              value={twoFaEnabled}
              onValueChange={handle2FaToggle}
              disabled={twoFaLoading}
              trackColor={{ false: '#E2E8F0', true: C.accent + '88' }}
              thumbColor={twoFaEnabled ? C.accent : '#CBD5E1'}
            />
          </View>
        </View>

        {/* ─── Danger Zone ─── */}
        <View style={[styles.sectionHeaderWrap, {flexDirection: 'row', alignItems: 'center'}]}>
          <Ionicons name="warning" size={14} color="#64748B" style={{marginRight: 6}} />
          <Text style={styles.sectionHeaderLabel}>{t('profile.dangerZoneTitle').toUpperCase()}</Text>
        </View>
        <View style={styles.listCard}>
          <TouchableOpacity 
            style={styles.listItem} 
            onPress={() => {
              Alert.alert(t('profile.logoutTitle'), t('profile.logoutConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('auth.logout'), style: 'destructive', onPress: async () => { await logout(); router.replace('/auth/login' as any); } },
              ]);
            }}
          >
            <View style={[styles.listIconBox, { backgroundColor: '#FFF7ED' }]}>
              <Ionicons name="log-out" size={18} color="#C2410C" />
            </View>
            <Text style={[styles.listItemText, { color: '#C2410C' }]}>{t('profile.logoutBtn')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionHeaderWrap, { flexDirection: 'row', alignItems: 'center' }]}>
          <Ionicons name="finger-print-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
          <Text style={styles.sectionHeaderLabel}>{t('profile.privacySectionTitle').toUpperCase()}</Text>
        </View>
        <View
          style={[
            styles.listCard,
            { paddingVertical: 0, paddingHorizontal: 0, flexDirection: 'column', alignItems: 'stretch' },
          ]}
        >
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}
            activeOpacity={0.7}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setPrivacyDropdownOpen((v) => !v);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.listIconBox, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="lock-closed-outline" size={18} color="#475569" />
              </View>
              <Text style={styles.listItemText}>{t('profile.privacySectionTitle')}</Text>
            </View>
            <Ionicons name={privacyDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#94A3B8" />
          </TouchableOpacity>

          {privacyDropdownOpen ? (
            <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 16 }}>
              <TouchableOpacity style={styles.listItem} onPress={handleExportLocalData}>
                <View style={[styles.listIconBox, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="download-outline" size={18} color="#6D28D9" />
                </View>
                <Text style={styles.listItemText}>{t('profile.exportDataBtn')}</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              <View style={styles.listSeparator} />

              <TouchableOpacity
                style={styles.listItem}
                onPress={() => {
                  Alert.alert(t('profile.deleteAccountTitle'), t('profile.deleteAccountMsg'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('profile.deleteForever'),
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteAccount();
                          router.replace('/auth/login' as any);
                        } catch (e: unknown) {
                          Alert.alert(
                            t('common.error'),
                            e instanceof Error ? e.message : t('auth.errorConnection'),
                          );
                        }
                      },
                    },
                  ]);
                }}
              >
                <View style={[styles.listIconBox, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="trash" size={18} color="#B91C1C" />
                </View>
                <Text style={[styles.listItemText, { color: '#B91C1C' }]}>{t('profile.deleteAccountBtn')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        </>
        )}

        {activeTab === 'sync' && (
        <>
        {syncTabSessionDetails}
        {/* ─── Cloud & Data ─── */}
        <View style={[styles.sectionHeaderWrap, { flexDirection: 'row', alignItems: 'center' }]}>
          <Ionicons name="cloud" size={14} color="#64748B" style={{ marginRight: 6 }} />
          <Text style={styles.sectionHeaderLabel}>{(t('profile.backendMonitor') || 'Monitor do Backend').toUpperCase()}</Text>
        </View>
        <View style={styles.listCard}>
          <TouchableOpacity style={styles.listItem} onPress={handleSync} disabled={syncing}>
            <View style={[styles.listIconBox, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="cloud-upload" size={18} color="#15803D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listItemText}>{t('profile.forceSync')}</Text>
              <Text style={styles.listItemSub}>
                {queueCount} {t('profile.pendingActions')}
                {syncConflictCount > 0 ? ` · ${syncConflictCount} conflito(s)` : ''}
              </Text>
            </View>
            {syncing ? <Text style={{ fontSize: 12, color: '#A1A1AA' }}>Sincronizando...</Text> : <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />}
          </TouchableOpacity>

          <View style={styles.listSeparator} />
          <TouchableOpacity style={styles.listItem} onPress={() => router.push('/profile/sync-cockpit' as any)}>
            <View style={[styles.listIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="analytics-outline" size={18} color="#1D4ED8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listItemText}>{t('profile.syncCockpitTitle')}</Text>
              <Text style={styles.listItemSub}>{t('profile.syncCockpitRow')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </TouchableOpacity>

          <View style={styles.listSeparator} />
          <View style={[styles.listItem, { alignItems: 'flex-start', paddingVertical: 12 }]}>
            <View style={[styles.listIconBox, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="warning-outline" size={18} color="#B45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listItemText}>Conflitos de sincronização</Text>
              <Text style={styles.listItemSub}>
                {syncConflictCount > 0
                  ? `Existem ${syncConflictCount} item(ns) em quarentena por conflito de revisão.`
                  : 'Nenhum conflito no momento. Você pode abrir os detalhes para monitorar.'}
              </Text>
              <TouchableOpacity onPress={() => router.push('/profile/sync-conflicts' as any)} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                <Text style={{ color: '#B45309', fontSize: 12, fontWeight: '800' }}>Ver detalhes</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={handleRequeueSyncConflicts}
                  disabled={syncConflictsBusy || syncConflictCount === 0}
                  style={{
                    backgroundColor: '#B45309',
                    borderRadius: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    opacity: syncConflictsBusy || syncConflictCount === 0 ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                    {syncConflictsBusy ? 'Processando...' : 'Reenfileirar'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearSyncConflicts}
                  disabled={syncConflictsBusy || syncConflictCount === 0}
                  style={{
                    backgroundColor: '#FEE2E2',
                    borderRadius: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    opacity: syncConflictsBusy || syncConflictCount === 0 ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 12 }}>
                    Limpar conflitos
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.listSeparator} />

          <TouchableOpacity
            style={styles.listItem}
            onPress={() => {
              Alert.alert(t('profile.resetLocalDataTitle'), t('profile.resetLocalDataMessage'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.confirm'),
                  style: 'destructive',
                  onPress: async () => {
                    clearLocalDatabase();
                    await handleSync();
                  },
                },
              ]);
            }}
          >
            <View style={[styles.listIconBox, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="refresh-circle" size={18} color="#B91C1D" />
            </View>
            <Text style={[styles.listItemText, { color: '#B91C1D' }]}>Limpar Cache & Reset</Text>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </TouchableOpacity>
        </View>
        </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal 2FA — fora do ScrollView para persistir ao mudar de aba */}
      {show2FaModal && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 1001 },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexGrow: 0, maxHeight: '82%' }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          >
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 28 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: C.primary, marginBottom: 6 }}>
                {tfa2Action === 'enable' ? 'Confirmar ativação do 2FA' : 'Desativar 2FA'}
              </Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16 }}>
                {tfa2Action === 'enable'
                  ? t('profile.twoFaModalEnableHint')
                  : t('profile.twoFaModalDisableHint')}
              </Text>
              <TextInput
                style={[
                  { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: C.accent, paddingVertical: 16, paddingHorizontal: 16 },
                  { fontSize: 28, letterSpacing: 10, textAlign: 'center', fontWeight: '900', color: C.primary },
                ]}
                value={tfa2Action === 'enable' ? tfaOtp : tfaDisableOtp}
                onChangeText={(v) =>
                  tfa2Action === 'enable'
                    ? setTfaOtp(v.replace(/[^0-9]/g, '').slice(0, 6))
                    : setTfaDisableOtp(v.replace(/[^0-9]/g, '').slice(0, 6))
                }
                keyboardType="number-pad"
                maxLength={6}
                placeholder="------"
                placeholderTextColor="#CBD5E1"
                autoFocus
              />
              <TouchableOpacity
                style={[
                  { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 8, marginTop: 12 },
                  { opacity: twoFaLoading ? 0.6 : 1 },
                ]}
                onPress={handle2FaConfirm}
                disabled={twoFaLoading}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
                  {twoFaLoading ? 'Verificando...' : tfa2Action === 'enable' ? 'Ativar 2FA' : 'Desativar 2FA'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: 'center', paddingTop: 12 }} onPress={() => setShow2FaModal(false)}>
                <Text style={{ fontSize: 13, color: C.textSecondary, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ─── Change Password Modal ─── */}
      {showPwdModal && (
        <View style={styles.modalOverlay}>
           <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                 <Text style={styles.modalTitle}>Alterar Senha</Text>
                 <TouchableOpacity onPress={() => setShowPwdModal(false)}>
                    <Ionicons name="close" size={24} color="#64748B" />
                 </TouchableOpacity>
              </View>
              
              <TextInput
                style={styles.simpleInput}
                placeholder="Senha Atual"
                secureTextEntry
                value={oldPwd}
                onChangeText={setOldPwd}
               returnKeyType="done"/>
              <TextInput
                style={styles.simpleInput}
                placeholder="Nova Senha"
                secureTextEntry
                value={newPwd}
                onChangeText={setNewPwd}
               returnKeyType="done"/>
              
              <TouchableOpacity 
                style={[styles.saveSubmitBtn, changingPwd && { opacity: 0.7 }]} 
                onPress={handleChangePassword}
                disabled={changingPwd}
              >
                <Text style={styles.saveSubmitBtnText}>
                  {changingPwd ? "Atualizando..." : "Atualizar Senha"}
                </Text>
              </TouchableOpacity>
           </View>
        </View>
      )}

      {/* ─── Avatar Modal ─── */}
      {showAvatarModal && (
        <View style={styles.modalOverlay}>
           <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                 <Text style={styles.modalTitle}>{t('profile.avatarTitle')}</Text>
                 <TouchableOpacity onPress={() => setShowAvatarModal(false)}>
                    <Ionicons name="close" size={24} color="#64748B" />
                 </TouchableOpacity>
              </View>

              <View style={styles.avatarModalPreviewWrap}>
                {displayAvatarUri ? (
                  <Image
                    source={{ uri: displayAvatarUri }}
                    style={styles.avatarModalPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.avatarModalPreview, styles.avatarModalPreviewPlaceholder]}>
                    <Ionicons name="person" size={48} color={C.textLight} />
                  </View>
                )}
              </View>
              
              <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20 }}>
                {t('profile.avatarMsg')}
              </Text>
              
              <TouchableOpacity 
                style={[styles.listItem, { backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 12, paddingVertical: 16 }]} 
                onPress={async () => {
                  setShowAvatarModal(false);
                  try {
                    const perm = await ImagePicker.requestCameraPermissionsAsync();
                    if (perm.granted) {
                      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.5, aspect: [1, 1], base64: true });
                      if (!result.canceled) await uploadAvatar(result.assets[0]);
                    } else {
                      Alert.alert(t('common.error'), t('profile.cameraPermDenied'));
                    }
                  } catch (e: any) {
                    Alert.alert(t('common.error'), t('profile.cameraUnavailable', { message: e.message }));
                  }
                }}
              >
                <View style={[styles.listIconBox, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="camera" size={18} color="#3B82F6" />
                </View>
                <Text style={[styles.listItemText, { fontWeight: '700' }]}>{t('profile.takePhoto')}</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.listItem, { backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 16, paddingVertical: 16 }]} 
                onPress={async () => {
                  setShowAvatarModal(false);
                  try {
                    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.5, aspect: [1, 1], base64: true });
                    if (!result.canceled) await uploadAvatar(result.assets[0]);
                  } catch (e: any) {
                    Alert.alert(t('common.error'), t('profile.galleryOpenError', { message: e.message }));
                  }
                }}
              >
                <View style={[styles.listIconBox, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="images" size={18} color="#8B5CF6" />
                </View>
                <Text style={[styles.listItemText, { fontWeight: '700' }]}>{t('profile.cameraRoll')}</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>
           </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function createProfileStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },

  // ─── Guest ───
  guestIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  guestTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  guestSub: { fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18, fontWeight: '500' },
  guestBtn: { backgroundColor: C.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginTop: 24, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  guestBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  // ─── Profile Header ───
  profileHeaderCard: { alignItems: 'center', paddingVertical: 32, marginBottom: 8 },
  headerBrandName: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.65, marginBottom: 4 },
  headerBrandTagline: { fontSize: 12, fontWeight: '700', marginBottom: 14 },
  headerAvatarWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  headerAvatar: { width: 90, height: 90, borderRadius: 45 },
  headerAvatarPlaceholder: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center' },
  headerAvatarEdit: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#191C1D', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  headerName: { fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  headerSub: { fontSize: 13, fontWeight: '500', opacity: 0.7, marginTop: 2 },
  editInfoBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 14 },
  editInfoBtnText: { fontSize: 11, fontWeight: '800', color: C.slate },

  // ─── Sections ───
  sectionHeaderWrap: { marginTop: 20, marginBottom: 10, paddingLeft: 4 },
  sectionHeaderLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, color: '#64748B' },

  // ─── Integrated List Card ───
  listCard: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  listIconBox: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  listItemText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#191C1D' },
  listItemSub: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '500' },
  listSeparator: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 50 },

  // ─── Language Selector ───
  langSelectorRow: { flexDirection: 'row', paddingVertical: 8, gap: 10 },
  langPill: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#F1F5F9' },
  langPillActive: { backgroundColor: '#191C1D' },
  langText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  langTextActive: { color: '#fff' },

  // ─── Edit Form ───
  editFormCard: { borderRadius: 20, padding: 20, marginTop: -10, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  formTitle: { fontSize: 16, fontWeight: '900', color: '#191C1D', marginBottom: 16 },
  simpleInput: { backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, fontSize: 14, fontWeight: '600', color: '#191C1D' },
  saveSubmitBtn: { backgroundColor: '#191C1D', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveSubmitBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  // ─── Modal ───
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20 },
  avatarModalPreviewWrap: {
    alignSelf: 'center',
    width: 128,
    height: 128,
    borderRadius: 64,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#F1F5F9',
  },
  avatarModalPreview: { width: 128, height: 128, borderRadius: 64 },
  avatarModalPreviewPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#191C1D' },
  });
}
