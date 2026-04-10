import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Linking, Image, Modal, ActionSheetIOS,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/hooks/useAuth';
import {
  API_BASE,
  TwoFactorRequired,
  MultipleAccountsError,
  type LoginTenantOption,
} from '../../src/services/auth';
import { setLanguage, getDeviceRegion } from '../../src/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from '../../src/services/api';

const REGION_KEY = '@brspark_region';

const COUNTRIES = [
  { code: 'BR', label: 'Brasil',    lang: 'pt-BR' as const },
  { code: 'US', label: 'USA',       lang: 'en-US' as const },
  { code: 'ES', label: 'España',    lang: 'es-ES' as const },
  { code: 'AR', label: 'Argentina', lang: 'es-ES' as const },
];

type Mode = 'LOGIN' | 'REGISTER';

function createLoginStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.cardWhite },
    container: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },

    logoBlock: { alignItems: 'center', paddingTop: 40, paddingBottom: 36 },
    logoImage: { width: 220, height: 80, marginBottom: 8 },
    logoSub: {
      fontSize: 12, color: C.textSecondary, fontWeight: '600',
      letterSpacing: 0.5,
    },


    tabs: {
      flexDirection: 'row', backgroundColor: C.divider,
      borderRadius: 14, padding: 4, marginBottom: 28,
    },
    tab: {
      flex: 1, paddingVertical: 12, borderRadius: 12,
      alignItems: 'center',
    },
    tabActive: { backgroundColor: C.cardWhite, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
    tabT: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
    tabTActive: { color: C.primary, fontWeight: '900' },

    form: { gap: 4 },
    fieldG: { marginBottom: 16 },
    fieldL: { fontSize: 10, fontWeight: '900', color: C.textLight, marginBottom: 8, letterSpacing: 0.5 },
    fieldRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.background, borderRadius: 12,
      borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 14, paddingVertical: 4,
    },
    fieldIcon: { marginRight: 10 },
    fieldInput: {
      flex: 1, fontSize: 15, color: C.primary, fontWeight: '600',
      paddingVertical: 12,
    },

    consentRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: C.status.info.bg, borderRadius: 12,
      borderWidth: 1, borderColor: C.status.info.border,
      padding: 14, marginBottom: 8,
    },
    checkbox: {
      width: 20, height: 20, borderRadius: 6,
      borderWidth: 2, borderColor: C.accent,
      justifyContent: 'center', alignItems: 'center',
      marginTop: 1, flexShrink: 0,
    },
    checkboxActive: { backgroundColor: C.accent, borderColor: C.accent },
    consentText: {
      flex: 1, fontSize: 13, color: C.textSecondary,
      fontWeight: '500', lineHeight: 20,
    },
    link: { color: C.accent, fontWeight: '700', textDecorationLine: 'underline' },

    cta: {
      backgroundColor: C.accent, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 18, borderRadius: 18, gap: 10,
      marginTop: 12,
      shadowColor: C.accent, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
    },
    ctaText: { color: C.cardWhite, fontWeight: '900', fontSize: 16 },

    footerLinks: {
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      marginTop: 28, gap: 8,
    },
    footerLink: { fontSize: 12, color: C.accent, fontWeight: '700' },
    footerDivider: { color: C.textLight },

    gdprBadge: {
      textAlign: 'center', fontSize: 10, color: C.textLight,
      marginTop: 12, fontWeight: '500', lineHeight: 16,
    },

    demoBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.accent + '12', borderRadius: 10,
      borderWidth: 1, borderColor: C.accent + '40',
      paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4,
    },
    demoBtnT: { fontSize: 12, color: C.accent, fontWeight: '700', flex: 1 },

    guestLink: { alignItems: 'center', marginTop: 16, paddingVertical: 8 },
    guestLinkText: { fontSize: 14, fontWeight: '700', color: C.textSecondary },

    // Compliance doc modal
    docModalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    docModalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: C.primary, marginRight: 12 },
    docCloseBtn: { padding: 6, borderRadius: 20, backgroundColor: C.divider },
    docContent: { fontSize: 13, color: C.textSecondary, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    footerLinkTouch: { padding: 4 },

    // Country / language (register) — uma linha compacta + modal
    countryRow: { marginBottom: 4, marginTop: 2 },
    countrySelectTitle: {
      fontSize: 15, color: C.primary, fontWeight: '700',
      paddingVertical: 2,
    },
    countrySelectSub: {
      fontSize: 12, color: C.textLight, fontWeight: '600', marginTop: 2,
    },
  });
}

type LoginStyles = ReturnType<typeof createLoginStyles>;

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  icon: any;
  secure?: boolean;
  toggle?: () => void;
  keyboardType?: any;
  showPass?: boolean;
  C: ColorPalette;
  formStyles: LoginStyles;
}

function Field({ label, value, onChangeText, placeholder, icon, secure, toggle, keyboardType = 'default', showPass, C, formStyles }: FieldProps) {
  return (
    <View style={formStyles.fieldG}>
      <Text style={formStyles.fieldL}>{label}</Text>
      <View style={formStyles.fieldRow}>
        <Ionicons name={icon} size={18} color={C.textLight} style={formStyles.fieldIcon} />
        <TextInput
          style={formStyles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textLight}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoCapitalize="none"
        returnKeyType="done"
                      />
        {toggle && (
          <TouchableOpacity onPress={toggle} style={{ padding: 4 }}>
            <Ionicons name={showPass ? 'eye-off' : 'eye'} size={18} color={C.textLight} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}


export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ techRegToken?: string }>();
  const techRegToken =
    typeof params.techRegToken === 'string' && params.techRegToken.trim()
      ? params.techRegToken.trim()
      : undefined;
  const { login, register, logout, completeLoginWithOtp, user, loading: authBoot } = useAuth();
  const { t, i18n } = useTranslation();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createLoginStyles(C), [C]);

  const [mode, setMode] = useState<Mode>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [country, setCountry] = useState<string>(() => getDeviceRegion());

  // País: preferir valor guardado no perfil; senão região/idioma do sistema (getDeviceRegion).
  useEffect(() => {
    let cancel = false;
    (async () => {
      const stored = await AsyncStorage.getItem(REGION_KEY);
      if (cancel) return;
      const ok = ['BR', 'US', 'ES', 'AR'];
      if (stored && ok.includes(stored)) setCountry(stored);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Compliance doc viewer
  const [docModal, setDocModal] = useState<{ title: string; content: string } | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  // Legal basis from policy (LGPD, GDPR, etc.)
  const [legalBasis, setLegalBasis] = useState('LGPD');

  useEffect(() => {
    AsyncStorage.getItem('@brspark_collection_policy').then(raw => {
      if (raw) {
        try { setLegalBasis(JSON.parse(raw).legalBasis || 'LGPD'); } catch {}
      }
    });
  }, []);

  useEffect(() => {
    if (authBoot || !user || !techRegToken) return;
    router.replace({
      pathname: '/auth/tech-registration',
      params: { token: techRegToken },
    } as any);
  }, [authBoot, user, techRegToken, router]);

  // ─── 2FA State ───────────────────────────────────────────────────────────────
  const [twoFaVisible, setTwoFaVisible] = useState(false);
  const [twoFaChallenge, setTwoFaChallenge] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const [tenantPick, setTenantPick] = useState<LoginTenantOption[] | null>(null);

  const goToTechRegistrationAfterAuth = () => {
    if (!techRegToken) return;
    router.replace({
      pathname: '/auth/tech-registration',
      params: { token: techRegToken },
    } as any);
  };

  const selectedCountry = useMemo(
    () => COUNTRIES.find((c) => c.code === country) || COUNTRIES[0],
    [country]
  );

  const applyCountryAndLanguage = async (c: (typeof COUNTRIES)[number]) => {
    setCountry(c.code);
    await AsyncStorage.setItem(REGION_KEY, c.code);
    await setLanguage(c.lang);
  };

  /** iOS: action sheet nativo. Android: Alert com lista — evita modal customizado por baixo de outras camadas. */
  const openCountryLanguagePicker = () => {
    const titleRaw = t('auth.selectCountryTitle');
    const title =
      titleRaw === 'auth.selectCountryTitle' || !titleRaw?.trim() ? 'País e idioma' : titleRaw;
    const messageRaw = t('auth.countryHint');
    const message =
      messageRaw === 'auth.countryHint' || !messageRaw?.trim()
        ? 'Define o idioma da interface e preferências regionais.'
        : messageRaw;
    const cancelLabel = t('common.cancel');

    if (Platform.OS === 'ios') {
      const options = [
        ...COUNTRIES.map((c) => String(t(`auth.regions.${c.code}`, { defaultValue: c.label }))),
        cancelLabel,
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: COUNTRIES.length,
          title,
          message,
        },
        (idx) => {
          if (idx === undefined || idx === COUNTRIES.length) return;
          void applyCountryAndLanguage(COUNTRIES[idx]);
        }
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

  const countryFieldLabel = useMemo(() => {
    const raw = t('auth.countryLabel');
    if (!raw || raw === 'auth.countryLabel') return 'País e idioma do app';
    return raw;
  }, [t, i18n.language]);

  const openDoc = async (type: 'TERMS_OF_USE' | 'PRIVACY_POLICY') => {
    setDocLoading(true);
    try {
      // Try tenant-specific document first, then fallback to global
      const storedEmail = await AsyncStorage.getItem('@brspark_email');
      const res = await fetch(`${API_BASE}/api/compliance/active/${type}`);
      if (res.ok) {
        const doc = await res.json();
        setDocModal({ title: doc.title, content: doc.content });
      } else {
        Linking.openURL('https://www.brspark.com/term');
      }
    } catch {
      Linking.openURL('https://www.brspark.com/term');
    } finally {
      setDocLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      return Alert.alert('', t('auth.alertFillFields'));
    }
    if (mode === 'REGISTER') {
      if (!name) return Alert.alert('', t('auth.alertFillName'));
      if (password.length < 6) return Alert.alert('', t('auth.alertWeakPass'));
      if (!consent) return Alert.alert('', t('auth.alertConsentRequired'));
    }

    setLoading(true);
    try {
      if (mode === 'LOGIN') {
        await login(email, password);
      } else {
        await register({ name, email, password, consent });
      }
      goToTechRegistrationAfterAuth();
      // Sem convite: RouteGuard trata onboarding / tabs
    } catch (e: any) {
      if (e instanceof TwoFactorRequired) {
        setTwoFaChallenge(e.challengeToken);
        setOtp('');
        setTwoFaVisible(true);
        return;
      }
      if (e instanceof MultipleAccountsError && e.tenants?.length) {
        setTenantPick(e.tenants);
        return;
      }
      Alert.alert(
        mode === 'LOGIN' ? t('auth.errorLogin') : t('auth.errorRegister'),
        e?.message || t('auth.errorConnection')
      );
    } finally {
      setLoading(false);
    }
  };

  const completeLoginWithChosenTenant = async (tenantId: string) => {
    setTenantPick(null);
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password, tenantId);
      goToTechRegistrationAfterAuth();
    } catch (e: any) {
      if (e instanceof TwoFactorRequired) {
        setTwoFaChallenge(e.challengeToken);
        setOtp('');
        setTwoFaVisible(true);
        return;
      }
      Alert.alert(t('auth.errorLogin'), e?.message || t('auth.errorConnection'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6 || !twoFaChallenge) return;
    setOtpLoading(true);
    try {
      await completeLoginWithOtp(twoFaChallenge, otp);
      await ApiService.sync(email);
      setTwoFaVisible(false);
      goToTechRegistrationAfterAuth();
      // Sem convite: RouteGuard trata onboarding / tabs
    } catch (e: any) {
      Alert.alert('Código inválido', e?.message || 'Tente novamente.');
      setOtp('');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      {/* Compliance Doc Modal */}
      <Modal visible={!!docModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.cardWhite }} edges={['top', 'bottom']}>
          <View style={styles.docModalHeader}>
            <Text style={styles.docModalTitle} numberOfLines={1}>{docModal?.title}</Text>
            <TouchableOpacity onPress={() => setDocModal(null)} style={styles.docCloseBtn}>
              <Ionicons name="close" size={22} color={C.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.docContent}>{docModal?.content}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ─── Várias organizações (mesmo e-mail) ───────────────────────────── */}
      <Modal visible={!!tenantPick?.length} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.cardWhite, borderRadius: 20, padding: 22, maxHeight: '70%' }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: C.primary, marginBottom: 8 }}>
              Escolha a organização
            </Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16, lineHeight: 20 }}>
              Este e-mail está em mais de uma organização. Selecione com qual deseja entrar agora.
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {(tenantPick || []).map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    backgroundColor: C.background,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                  onPress={() => completeLoginWithChosenTenant(t.id)}
                  disabled={loading}
                >
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.primary }}>
                    {t.name || t.id}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{ alignItems: 'center', paddingTop: 12 }}
              onPress={() => setTenantPick(null)}
              disabled={loading}
            >
              <Text style={{ fontSize: 14, color: C.textSecondary, fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── 2FA OTP Modal ─────────────────────────────────────────────────── */}
      <Modal visible={twoFaVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.cardWhite, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.status.info.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="shield-checkmark" size={28} color={C.accent} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: C.primary }}>Verificação em 2 etapas</Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, fontWeight: '500', textAlign: 'center', marginTop: 6 }}>
                {'Insira o código de 6 dígitos\nenviado para o seu e-mail.'}
              </Text>
            </View>

            <TextInput
              style={{
                fontSize: 32, fontWeight: '900', letterSpacing: 12,
                textAlign: 'center', backgroundColor: C.background,
                borderRadius: 16, borderWidth: 1.5, borderColor: C.accent,
                paddingVertical: 18, paddingHorizontal: 16, color: C.primary,
                marginBottom: 20,
              }}
              value={otp}
              onChangeText={v => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              placeholder="------"
              placeholderTextColor={C.border}
            />

            <TouchableOpacity
              style={[{ backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 14 }, (otp.length < 6 || otpLoading) && { opacity: 0.5 }]}
              onPress={handleVerifyOtp}
              disabled={otp.length < 6 || otpLoading}
            >
              {otpLoading
                ? <ActivityIndicator color={C.cardWhite} />
                : <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 16 }}>Verificar Código</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={{ alignItems: 'center', padding: 8 }} onPress={() => { setTwoFaVisible(false); setTwoFaChallenge(null); }}>
              <Text style={{ fontSize: 13, color: C.textSecondary, fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoBlock}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoSub}>Precisou, resolveu.</Text>
          </View>


          {/* Mode Tabs */}
          <View style={styles.tabs}>
            {(['LOGIN', 'REGISTER'] as Mode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.tab, mode === m && styles.tabActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.tabT, mode === m && styles.tabTActive]}>
                  {m === 'LOGIN' ? t('auth.login') : t('auth.createAccount')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === 'REGISTER' && (
              <>
                <Field
                  label={t('auth.fullName').toUpperCase() + ' *'}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('auth.fullNamePlaceholder')}
                  icon="person-outline"
                  C={C}
                  formStyles={styles}
                />
              </>
            )}
            <Field
              label={t('auth.email').toUpperCase() + ' *'}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              icon="mail-outline"
              keyboardType="email-address"
              C={C}
              formStyles={styles}
            />
            <Field
              label={t('auth.password').toUpperCase() + ' *'}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.passwordPlaceholder')}
              icon="lock-closed-outline"
              secure={!showPass}
              toggle={() => setShowPass(p => !p)}
              showPass={showPass}
              C={C}
              formStyles={styles}
            />




            {/* País / idioma — linha única; lista no modal (padrão de apps) */}
            {mode === 'REGISTER' && (
              <View style={styles.countryRow}>
                <View style={styles.fieldG}>
                  <Text style={styles.fieldL}>{countryFieldLabel.toUpperCase()}</Text>
                  <TouchableOpacity
                    style={styles.fieldRow}
                    onPress={openCountryLanguagePicker}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={countryFieldLabel}
                    accessibilityHint={
                      t('auth.countryHint') === 'auth.countryHint'
                        ? 'Define o idioma do app'
                        : t('auth.countryHint')
                    }
                  >
                    <Ionicons name="globe-outline" size={18} color={C.textLight} style={styles.fieldIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.countrySelectTitle}>
                        {t(`auth.regions.${selectedCountry.code}`, { defaultValue: selectedCountry.label })}
                      </Text>
                      <Text style={styles.countrySelectSub}>
                        {selectedCountry.lang} · {selectedCountry.code}
                      </Text>
                    </View>
                    <Ionicons name="chevron-down" size={20} color={C.textLight} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* LGPD / GDPR Consent */}
            {mode === 'REGISTER' && (
              <TouchableOpacity
                style={styles.consentRow}
                onPress={() => setConsent(c => !c)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, consent && styles.checkboxActive]}>
                  {consent && <Ionicons name="checkmark" size={13} color={C.cardWhite} />}
                </View>
                <Text style={styles.consentText}>
                  {t('auth.consentText')}{' '}
                  <Text style={styles.link} onPress={() => openDoc('TERMS_OF_USE')}>
                    {t('auth.termsOfUse')}
                  </Text>
                  {' '}{t('auth.and')}{' '}
                  <Text style={styles.link} onPress={() => openDoc('PRIVACY_POLICY')}>
                    {t('auth.privacyPolicy')}
                  </Text>
                  {' '}({t('auth.consentRequired')})
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.cta, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={C.cardWhite} />
              ) : (
                <>
                  <Ionicons
                    name={mode === 'LOGIN' ? 'log-in-outline' : 'person-add-outline'}
                    size={20}
                    color={C.cardWhite}
                  />
                  <Text style={styles.ctaText}>
                    {mode === 'LOGIN' ? t('auth.loginPlatform') : t('auth.createMyAccount')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={async () => { await logout(); router.replace('/(tabs)' as any); }} style={styles.guestLink}>
              <Text style={styles.guestLinkText}>{t('auth.exploreGuest')}</Text>
            </TouchableOpacity>
          </View>

          {/* Footer links */}
          <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => openDoc('PRIVACY_POLICY')} style={styles.footerLinkTouch}>
                <Text style={styles.footerLink}>🔒 {t('auth.privacyPolicy')}</Text>
              </TouchableOpacity>
              <Text style={styles.footerDivider}>·</Text>
              <TouchableOpacity onPress={() => openDoc('TERMS_OF_USE')} style={styles.footerLinkTouch}>
                <Text style={styles.footerLink}>{t('auth.termsOfUse')}</Text>
              </TouchableOpacity>
          </View>

          <Text style={styles.gdprBadge}>{t('auth.lgpdBadge')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
