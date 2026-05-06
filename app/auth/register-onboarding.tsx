import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  ActionSheetIOS,
  Linking,
  FlatList,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorPalette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { BrandingLogoImage } from '../../src/components/BrandingLogoImage';
import { FlagIsoImage } from '../../src/components/FlagIsoImage';
import { AuthService, beginPublicAuthFlow, resetPublicAuthFlow } from '../../src/services/auth';
import { API_BASE } from '../../src/services/appApiBase';
import { complianceDocFallbackUrl } from '../../src/constants/legalPublicUrls';
import { passwordChecks } from '../../src/lib/appPasswordPolicy';
import { setLanguage, getDeviceRegion } from '../../src/i18n';
import { resetUnitPreference, setUnitSystem } from '../../src/i18n/formatters';
import { useAuth } from '../../src/hooks/useAuth';
import { getPersonaHomeHref } from '../../src/navigation/personaRouting';
import {
  PHONE_DIAL_ENTRIES,
  PHONE_DIAL_FAVORITES_ISO,
  type PhoneDialEntry,
  getDefaultDialForAppRegion,
  buildE164Phone,
} from '../../src/constants/phoneDialCodes';

const REGION_KEY = '@aria_region';

const COUNTRIES = [
  { code: 'BR', label: 'Brasil', lang: 'pt-BR' as const },
  { code: 'US', label: 'USA', lang: 'en-US' as const },
  { code: 'ES', label: 'España', lang: 'es-ES' as const },
  { code: 'AR', label: 'Argentina', lang: 'es-ES' as const },
  { code: 'DE', label: 'Deutschland', lang: 'de-DE' as const },
];

type Step = 1 | 2 | 3;

type DialListRow =
  | { type: 'header'; key: string; title: string }
  | { type: 'country'; key: string; entry: PhoneDialEntry };

function createRegisterStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.cardWhite },
    container: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },
    logoBlock: { width: '100%', alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
    logoImage: {
      alignSelf: 'center',
      width: '94%',
      maxWidth: 320,
      aspectRatio: 220 / 80,
      marginBottom: 6,
    },
    logoSub: { fontSize: 12, color: C.textSecondary, fontWeight: '600', letterSpacing: 0.5 },
    tabs: {
      flexDirection: 'row',
      backgroundColor: C.divider,
      borderRadius: 14,
      padding: 4,
      marginBottom: 22,
    },
    tab: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    tabActive: {
      backgroundColor: C.cardWhite,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    tabT: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
    tabTActive: { color: C.primary, fontWeight: '900' },
    stepTitle: { fontSize: 22, fontWeight: '900', color: C.primary, marginBottom: 8 },
    stepSub: { fontSize: 14, color: C.textSecondary, marginBottom: 20, lineHeight: 22 },
    fieldG: { marginBottom: 16 },
    fieldL: {
      fontSize: 10,
      fontWeight: '900',
      color: C.textLight,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    fieldIcon: { marginRight: 10 },
    fieldInput: { flex: 1, fontSize: 15, color: C.primary, fontWeight: '600', paddingVertical: 12 },
    otpInput: {
      fontSize: 28,
      fontWeight: '900',
      letterSpacing: 8,
      textAlign: 'center',
      backgroundColor: C.background,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: C.accent,
      paddingVertical: 16,
      color: C.primary,
    },
    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: C.status.info.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.status.info.border,
      padding: 14,
      marginBottom: 12,
      marginTop: 8,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: C.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 1,
      flexShrink: 0,
    },
    checkboxActive: { backgroundColor: C.accent, borderColor: C.accent },
    consentText: { flex: 1, fontSize: 13, color: C.textSecondary, fontWeight: '500', lineHeight: 20 },
    link: { color: C.accent, fontWeight: '700', textDecorationLine: 'underline' },
    reqBox: {
      backgroundColor: C.background,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 12,
    },
    reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    reqDot: { width: 8, height: 8, borderRadius: 4 },
    reqDotOk: { backgroundColor: C.accent },
    reqDotNo: { backgroundColor: C.divider },
    reqTxt: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
    reqTxtOk: { color: C.primary },
    cta: {
      backgroundColor: C.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 18,
      borderRadius: 18,
      gap: 10,
      marginTop: 12,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    ctaDisabled: { opacity: 0.55 },
    ctaText: { color: C.cardWhite, fontWeight: '900', fontSize: 16 },
    backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    backT: { fontSize: 14, fontWeight: '700', color: C.accent, marginLeft: 4 },
    footerLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
      gap: 8,
    },
    footerLink: { fontSize: 12, color: C.accent, fontWeight: '700' },
    footerDivider: { color: C.textLight },
    gdprBadge: {
      textAlign: 'center',
      fontSize: 10,
      color: C.textLight,
      marginTop: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    docModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    docModalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: C.primary, marginRight: 12 },
    docCloseBtn: { padding: 6, borderRadius: 20, backgroundColor: C.divider },
    docContent: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 22,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    localeBlock: { marginBottom: 18, alignItems: 'flex-start' },
    localeMicroCaption: {
      fontSize: 10,
      fontWeight: '800',
      color: C.textLight,
      marginBottom: 6,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    localeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexShrink: 1,
      maxWidth: '100%',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 11,
      borderRadius: 999,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    localeChipMain: {
      fontSize: 14,
      fontWeight: '800',
      color: C.accent,
      flexShrink: 1,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    dialBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRightWidth: 1,
      borderRightColor: C.border,
      flexShrink: 0,
      flexGrow: 0,
    },
    dialBtnCode: { fontSize: 15, fontWeight: '800', color: C.primary, minWidth: 36 },
    phoneInputOnly: {
      flex: 1,
      fontSize: 15,
      color: C.primary,
      fontWeight: '600',
      paddingVertical: 11,
      paddingHorizontal: 12,
      minHeight: 44,
    },
    dialModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    dialModalTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: C.primary,
      flex: 1,
    },
    dialSectionTitle: {
      fontSize: 11,
      fontWeight: '900',
      color: C.textLight,
      letterSpacing: 0.6,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
      backgroundColor: C.divider,
    },
    dialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    dialRowActive: { backgroundColor: C.status.info.bg },
  });
}

export default function RegisterOnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ techRegToken?: string }>();
  const techRegToken =
    typeof params.techRegToken === 'string' && params.techRegToken.trim()
      ? params.techRegToken.trim()
      : undefined;
  const { t, i18n } = useTranslation();
  const { colors: C, appTagline } = useTheme();
  const styles = useMemo(() => createRegisterStyles(C), [C]);
  const { completeRegisterAfterOtpSetup, clearSessionForRegistrationFlow } = useAuth();

  /**
   * Login pode já ter chamado `beginPublicAuthFlow` antes do push; aqui incrementamos outra vez.
   * Cleanup com `resetPublicAuthFlow` evita depth preso se o utilizador voltar atrás.
   */
  useLayoutEffect(() => {
    beginPublicAuthFlow();
    void clearSessionForRegistrationFlow();
    return () => {
      resetPublicAuthFlow();
    };
  }, [clearSessionForRegistrationFlow]);

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedDial, setSelectedDial] = useState<PhoneDialEntry>(() => getDefaultDialForAppRegion('BR'));
  const [phoneNational, setPhoneNational] = useState('');
  const [dialPickerOpen, setDialPickerOpen] = useState(false);
  const [country, setCountry] = useState<string>(() => String(getDeviceRegion() || 'BR'));
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const setupTokenRef = useRef<string | null>(null);
  const [docModal, setDocModal] = useState<{ title: string; content: string } | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const stored = await AsyncStorage.getItem(REGION_KEY);
      if (cancel) return;
      const ok = ['BR', 'US', 'ES', 'AR', 'DE'];
      if (stored && ok.includes(stored)) setCountry(stored);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    setSelectedDial(getDefaultDialForAppRegion(country));
  }, [country]);

  const dialListData = useMemo((): DialListRow[] => {
    const favSet = new Set<string>([...PHONE_DIAL_FAVORITES_ISO]);
    const fav = PHONE_DIAL_FAVORITES_ISO.map((iso) => PHONE_DIAL_ENTRIES.find((e) => e.iso === iso)).filter(
      (e): e is PhoneDialEntry => Boolean(e),
    );
    const rest = PHONE_DIAL_ENTRIES.filter((e) => !favSet.has(e.iso))
      .slice()
      .sort((a, b) =>
        String(t(`auth.dialCountries.${a.iso}`, { defaultValue: a.iso })).localeCompare(
          String(t(`auth.dialCountries.${b.iso}`, { defaultValue: b.iso })),
        ),
      );
    return [
      { type: 'header', key: 'h-fav', title: t('auth.registerFlow.dialFavorites') },
      ...fav.map((e) => ({ type: 'country' as const, key: e.iso, entry: e })),
      { type: 'header', key: 'h-rest', title: t('auth.registerFlow.dialMore') },
      ...rest.map((e) => ({ type: 'country' as const, key: e.iso, entry: e })),
    ];
  }, [t, i18n.language]);

  const selectedCountry = useMemo(
    () => COUNTRIES.find((c) => c.code === country) || COUNTRIES[0],
    [country],
  );

  const applyCountryAndLanguage = async (c: (typeof COUNTRIES)[number]) => {
    setCountry(c.code);
    await AsyncStorage.setItem(REGION_KEY, c.code);
    if (c.code === 'US') await setUnitSystem(true);
    else await resetUnitPreference();
    await setLanguage(c.lang);
  };

  const openCountryLanguagePicker = () => {
    const title = t('auth.selectCountryTitle');
    const message = t('auth.countryHint');
    const cancelLabel = t('common.cancel');
    if (Platform.OS === 'ios') {
      const options = [
        ...COUNTRIES.map((c) => String(t(`auth.regions.${c.code}`, { defaultValue: c.label }))),
        cancelLabel,
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: COUNTRIES.length, title, message },
        (idx) => {
          if (idx === undefined || idx === COUNTRIES.length) return;
          void applyCountryAndLanguage(COUNTRIES[idx]);
        },
      );
      return;
    }
    Alert.alert(title, message, [
      ...COUNTRIES.map((c) => ({
        text: String(t(`auth.regions.${c.code}`, { defaultValue: c.label })),
        onPress: () => void applyCountryAndLanguage(c),
      })),
      { text: cancelLabel, style: 'cancel' },
    ]);
  };

  const openDoc = async (type: 'TERMS_OF_USE' | 'PRIVACY_POLICY') => {
    setDocLoading(true);
    try {
      const loc = encodeURIComponent(i18n.language || 'pt-BR');
      const res = await fetch(`${API_BASE}/api/compliance/active/${type}?locale=${loc}`);
      if (res.ok) {
        const doc = await res.json();
        setDocModal({ title: doc.title, content: doc.content });
      } else {
        Linking.openURL(complianceDocFallbackUrl(type));
      }
    } catch {
      Linking.openURL(complianceDocFallbackUrl(type));
    } finally {
      setDocLoading(false);
    }
  };

  const goToTechRegistrationAfterAuth = useCallback(() => {
    if (!techRegToken) return;
    router.replace({ pathname: '/auth/tech-registration', params: { token: techRegToken } } as any);
  }, [router, techRegToken]);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const allReq = checks.len && checks.upper && checks.lower && checks.num;
  const passMatch = password.length > 0 && password === confirmPass;

  const sendCode = async () => {
    if (!name.trim() || !email.trim() || !phoneNational.trim()) {
      Alert.alert('', t('auth.registerFlow.alertFillAllStep1'));
      return;
    }
    const emailNorm = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      Alert.alert('', t('auth.registerFlow.alertInvalidEmail'));
      return;
    }
    const natDigits = phoneNational.replace(/\D/g, '');
    if (natDigits.length < 8) {
      Alert.alert('', t('auth.registerFlow.alertPhoneTooShort'));
      return;
    }
    const e164 = buildE164Phone(selectedDial, phoneNational);
    if (e164.length < 11) {
      Alert.alert('', t('auth.registerFlow.alertInvalidPhone'));
      return;
    }
    setLoading(true);
    try {
      const out = await AuthService.startOtpAuth({
        identifier: emailNorm,
        purpose: 'register',
        name: name.trim(),
        phone: e164,
      });
      if (out.devCode && __DEV__) {
        console.log('[OTP dev register]', out.devCode);
      }
      setChallengeId(out.challengeId);
      setOtp('');
      setStep(2);
    } catch (e: unknown) {
      Alert.alert(t('auth.errorOtpSendTitle'), e instanceof Error ? e.message : t('auth.errorConnection'));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length < 6 || !challengeId) return;
    setLoading(true);
    try {
      const { setupToken } = await AuthService.verifyRegisterOtpPhase1({
        challengeId,
        code: otp,
        name: name.trim(),
      });
      setupTokenRef.current = setupToken;
      setPassword('');
      setConfirmPass('');
      setStep(3);
    } catch (e: unknown) {
      Alert.alert(t('auth.errorRegister'), e instanceof Error ? e.message : t('auth.errorConnection'));
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const finalize = async () => {
    const token = setupTokenRef.current;
    if (!token || !allReq || !passMatch || !consent) {
      if (!consent) Alert.alert('', t('auth.alertConsentRequired'));
      return;
    }
    setLoading(true);
    try {
      await completeRegisterAfterOtpSetup({ setupToken: token, password, consent: true });
      if (techRegToken) {
        goToTechRegistrationAfterAuth();
      } else {
        const done = await AsyncStorage.getItem('@aria_onboarding_done');
        router.replace((done ? getPersonaHomeHref('client') : '/auth/onboarding') as any);
      }
    } catch (e: unknown) {
      Alert.alert(t('auth.errorRegister'), e instanceof Error ? e.message : t('auth.errorConnection'));
    } finally {
      setLoading(false);
    }
  };

  const onBack = () => {
    if (step === 1) {
      router.replace('/auth/login' as any);
      return;
    }
    if (step === 2) {
      setStep(1);
      setChallengeId('');
      setOtp('');
      return;
    }
    Alert.alert(t('common.attention'), t('auth.registerFlow.leavePasswordStep'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.login'), onPress: () => router.replace('/auth/login' as any) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Modal visible={!!docModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.cardWhite }} edges={['top', 'bottom']}>
          <View style={styles.docModalHeader}>
            <Text style={styles.docModalTitle} numberOfLines={1}>
              {docModal?.title}
            </Text>
            <TouchableOpacity onPress={() => setDocModal(null)} style={styles.docCloseBtn}>
              <Ionicons name="close" size={22} color={C.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.docContent}>{docModal?.content}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={dialPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDialPickerOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.cardWhite }} edges={['top', 'bottom']}>
          <View style={styles.dialModalHeader}>
            <Text style={styles.dialModalTitle}>{t('auth.registerFlow.selectDialTitle')}</Text>
            <TouchableOpacity onPress={() => setDialPickerOpen(false)} hitSlop={12} style={styles.docCloseBtn}>
              <Ionicons name="close" size={22} color={C.primary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={dialListData}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return <Text style={styles.dialSectionTitle}>{item.title}</Text>;
              }
              const active = item.entry.iso === selectedDial.iso;
              return (
                <TouchableOpacity
                  style={[styles.dialRow, active && styles.dialRowActive]}
                  onPress={() => {
                    setSelectedDial(item.entry);
                    setDialPickerOpen(false);
                  }}
                  activeOpacity={0.75}
                >
                  <FlagIsoImage iso={item.entry.iso} width={30} height={21} borderColor={C.border} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: C.primary }}>
                      {t(`auth.dialCountries.${item.entry.iso}`, { defaultValue: item.entry.iso })}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '600', marginTop: 2 }}>
                      +{item.entry.dial}
                    </Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={C.accent} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backRow} onPress={onBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={C.accent} />
            <Text style={styles.backT}>{t('common.back')}</Text>
          </TouchableOpacity>

          <View style={styles.logoBlock}>
            <BrandingLogoImage variant="login" style={styles.logoImage} resizeMode="contain" />
            {appTagline ? <Text style={styles.logoSub}>{appTagline}</Text> : null}
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity style={styles.tab} onPress={() => router.replace('/auth/login' as any)}>
              <Text style={styles.tabT}>{t('auth.login')}</Text>
            </TouchableOpacity>
            <View style={[styles.tab, styles.tabActive]}>
              <Text style={[styles.tabT, styles.tabTActive]}>{t('auth.createAccount')}</Text>
            </View>
          </View>

          {step === 1 && (
            <>
              <Text style={styles.stepTitle}>{t('auth.registerFlow.step1Title')}</Text>
              <Text style={styles.stepSub}>{t('auth.registerFlow.step1Subtitle')}</Text>

              <View style={styles.localeBlock}>
                <Text style={styles.localeMicroCaption}>{t('auth.registerFlow.appLocaleCaption')}</Text>
                <TouchableOpacity
                  style={styles.localeChip}
                  onPress={openCountryLanguagePicker}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.registerFlow.appLocaleA11y', {
                    region: String(t(`auth.regions.${selectedCountry.code}`, { defaultValue: selectedCountry.label })),
                    lang: selectedCountry.lang,
                    code: selectedCountry.code,
                  })}
                >
                  <FlagIsoImage iso={selectedCountry.code} width={26} height={18} borderColor={C.border} />
                  <Text style={styles.localeChipMain} numberOfLines={1}>
                    {selectedCountry.lang}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color={C.textLight} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldG}>
                <Text style={styles.fieldL}>{(t('auth.fullName') + ' *').toUpperCase()}</Text>
                <View style={styles.fieldRow}>
                  <Ionicons name="person-outline" size={18} color={C.textLight} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    value={name}
                    onChangeText={setName}
                    placeholder={t('auth.fullNamePlaceholder')}
                    placeholderTextColor={C.textLight}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.fieldG}>
                <Text style={styles.fieldL}>{(t('auth.email') + ' *').toUpperCase()}</Text>
                <View style={styles.fieldRow}>
                  <Ionicons name="mail-outline" size={18} color={C.textLight} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.registerFlow.emailPlaceholder')}
                    placeholderTextColor={C.textLight}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
              </View>

              <View style={styles.fieldG}>
                <Text style={styles.fieldL}>{(t('auth.registerFlow.phoneLabel') + ' *').toUpperCase()}</Text>
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={styles.dialBtn}
                    onPress={() => setDialPickerOpen(true)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.registerFlow.dialPickerA11y', {
                      country: String(t(`auth.dialCountries.${selectedDial.iso}`, { defaultValue: selectedDial.iso })),
                      dial: selectedDial.dial,
                    })}
                  >
                    <FlagIsoImage iso={selectedDial.iso} width={26} height={18} borderColor={C.border} />
                    <Text style={styles.dialBtnCode}>+{selectedDial.dial}</Text>
                    <Ionicons name="chevron-down" size={15} color={C.textLight} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.phoneInputOnly}
                    value={phoneNational}
                    onChangeText={setPhoneNational}
                    placeholder={t('auth.registerFlow.phoneNationalPlaceholder')}
                    placeholderTextColor={C.textLight}
                    autoCapitalize="none"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <Text style={[styles.stepSub, { fontSize: 12, marginTop: -8 }]}>
                {t('auth.registerFlow.codeSentHint')}
              </Text>

              <TouchableOpacity
                style={[
                  styles.cta,
                  (loading || !name.trim() || !email.trim() || !phoneNational.trim()) && styles.ctaDisabled,
                ]}
                onPress={sendCode}
                disabled={loading || !name.trim() || !email.trim() || !phoneNational.trim()}
              >
                {loading ? (
                  <ActivityIndicator color={C.cardWhite} />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={20} color={C.cardWhite} />
                    <Text style={styles.ctaText}>{t('auth.registerFlow.sendCodeCta')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.stepTitle}>{t('auth.registerFlow.step2Title')}</Text>
              <Text style={styles.stepSub}>
                {t('auth.registerFlow.step2SubtitleEmail', { email: email.trim().toLowerCase() })}
              </Text>
              <TextInput
                style={styles.otpInput}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                placeholder="------"
                placeholderTextColor={C.border}
              />
              <TouchableOpacity
                style={[styles.cta, (otp.length < 6 || loading) && styles.ctaDisabled]}
                onPress={verifyOtp}
                disabled={otp.length < 6 || loading}
              >
                {loading ? (
                  <ActivityIndicator color={C.cardWhite} />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={20} color={C.cardWhite} />
                    <Text style={styles.ctaText}>{t('auth.registerFlow.validateCta')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.stepTitle}>{t('auth.registerFlow.step3Title')}</Text>
              <Text style={styles.stepSub}>{t('auth.registerFlow.step3Subtitle')}</Text>

              <View style={styles.fieldG}>
                <Text style={styles.fieldL}>{(t('auth.password') + ' *').toUpperCase()}</Text>
                <View style={styles.fieldRow}>
                  <Ionicons name="lock-closed-outline" size={18} color={C.textLight} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor={C.textLight}
                    secureTextEntry={!showPass}
                  />
                  <TouchableOpacity onPress={() => setShowPass((p) => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showPass ? 'eye-off' : 'eye'} size={18} color={C.textLight} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldG}>
                <Text style={styles.fieldL}>{(t('auth.registerFlow.confirmPassword') + ' *').toUpperCase()}</Text>
                <View style={styles.fieldRow}>
                  <Ionicons name="lock-closed-outline" size={18} color={C.textLight} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    value={confirmPass}
                    onChangeText={setConfirmPass}
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor={C.textLight}
                    secureTextEntry={!showPass2}
                  />
                  <TouchableOpacity onPress={() => setShowPass2((p) => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showPass2 ? 'eye-off' : 'eye'} size={18} color={C.textLight} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.reqBox}>
                <Text style={[styles.fieldL, { marginBottom: 10 }]}>{t('auth.registerFlow.securityRequirements')}</Text>
                {(
                  [
                    ['len', t('auth.registerFlow.reqMin8')] as const,
                    ['upper', t('auth.registerFlow.reqUpper')] as const,
                    ['lower', t('auth.registerFlow.reqLower')] as const,
                    ['num', t('auth.registerFlow.reqNumber')] as const,
                  ] as const
                ).map(([k, label]) => (
                  <View key={k} style={styles.reqRow}>
                    <View style={[styles.reqDot, checks[k] ? styles.reqDotOk : styles.reqDotNo]} />
                    <Text style={[styles.reqTxt, checks[k] && styles.reqTxtOk]}>{label}</Text>
                  </View>
                ))}
                {confirmPass.length > 0 && !passMatch ? (
                  <Text style={{ fontSize: 12, color: C.status.danger.fg, fontWeight: '700', marginTop: 4 }}>
                    {t('auth.registerFlow.passwordsMismatch')}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity style={styles.consentRow} onPress={() => setConsent((c) => !c)} activeOpacity={0.8}>
                <View style={[styles.checkbox, consent && styles.checkboxActive]}>
                  {consent ? <Ionicons name="checkmark" size={13} color={C.cardWhite} /> : null}
                </View>
                <Text style={styles.consentText}>
                  {t('auth.consentText')}{' '}
                  <Text style={styles.link} onPress={() => openDoc('TERMS_OF_USE')}>
                    {t('auth.termsOfUse')}
                  </Text>
                  {' '}
                  {t('auth.and')}{' '}
                  <Text style={styles.link} onPress={() => openDoc('PRIVACY_POLICY')}>
                    {t('auth.privacyPolicy')}
                  </Text>
                  {' '}({t('auth.consentRequired')})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.cta,
                  (loading || !allReq || !passMatch || !consent || docLoading) && styles.ctaDisabled,
                ]}
                onPress={finalize}
                disabled={loading || !allReq || !passMatch || !consent || docLoading}
              >
                {loading ? (
                  <ActivityIndicator color={C.cardWhite} />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={20} color={C.cardWhite} />
                    <Text style={styles.ctaText}>{t('auth.registerFlow.finalizeCta')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => openDoc('PRIVACY_POLICY')}>
              <Text style={styles.footerLink}>🔒 {t('auth.privacyPolicy')}</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>·</Text>
            <TouchableOpacity onPress={() => openDoc('TERMS_OF_USE')}>
              <Text style={styles.footerLink}>{t('auth.termsOfUse')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.gdprBadge}>{t('auth.lgpdBadge')}</Text>
        </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
