import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ImageBackground,
  ActivityIndicator, Linking, Modal,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { BrandingLogoImage } from '../../src/components/BrandingLogoImage';
import { useAuth } from '../../src/hooks/useAuth';
import { getPersonaHomeHref } from '../../src/navigation/personaRouting';
import {
  API_BASE,
  AuthService,
  TwoFactorRequired,
  MultipleAccountsError,
  type LoginTenantOption,
} from '../../src/services/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from '../../src/services/api';
import { LoginOAuthNativeSection, type NativeOAuthPending } from '../../src/components/auth/LoginOAuthNativeSection';

function createLoginStyles(C: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.cardWhite },
    container: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },
    heroBg: {
      marginHorizontal: -28,
      marginBottom: 10,
      minHeight: 130,
      justifyContent: 'flex-end',
      backgroundColor: C.surfaceLow,
      borderBottomLeftRadius: 26,
      borderBottomRightRadius: 26,
      overflow: 'hidden',
    },
    heroOverlay: {
      paddingHorizontal: 28,
      paddingTop: 14,
      paddingBottom: 14,
      backgroundColor: 'rgba(15,23,42,0.35)',
    },

    logoBlock: { alignItems: 'center', paddingTop: 20, paddingBottom: 8 },
    logoImage: { width: 220, height: 80, marginBottom: 6 },
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
    forgotLinkRow: {
      alignItems: 'flex-end',
      marginTop: -8,
      marginBottom: 8,
    },
    forgotLinkText: {
      fontSize: 13,
      color: C.accent,
      fontWeight: '700',
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
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 24,
    },
    sheetCard: {
      backgroundColor: C.cardWhite,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: C.border,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: C.primary,
      marginBottom: 8,
    },
    sheetText: {
      fontSize: 13,
      lineHeight: 20,
      color: C.textSecondary,
      marginBottom: 16,
    },
    sheetActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 8,
    },
    sheetSecondaryBtn: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: C.divider,
    },
    sheetSecondaryBtnText: {
      color: C.textSecondary,
      fontWeight: '700',
      fontSize: 14,
    },
    sheetPrimaryBtn: {
      minWidth: 152,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetPrimaryBtnText: {
      color: C.cardWhite,
      fontWeight: '800',
      fontSize: 14,
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
  const params = useLocalSearchParams<{ techRegToken?: string; register?: string }>();
  const techRegToken =
    typeof params.techRegToken === 'string' && params.techRegToken.trim()
      ? params.techRegToken.trim()
      : undefined;
  const { login, loginWithOAuth, logout, completeLoginWithOtp, user, loading: authBoot } = useAuth();
  const { t, i18n } = useTranslation();
  const { colors: C, appTagline, loginBackgroundUrl } = useTheme();
  const styles = useMemo(() => createLoginStyles(C), [C]);

  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const r = params.register;
    if (r === '1' || r === 'true') {
      router.replace(
        techRegToken
          ? ({ pathname: '/auth/register-onboarding', params: { techRegToken } } as any)
          : ('/auth/register-onboarding' as any),
      );
    }
  }, [params.register, router, techRegToken]);

  // Compliance doc viewer
  const [docModal, setDocModal] = useState<{ title: string; content: string } | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [passwordResetVisible, setPasswordResetVisible] = useState(false);
  const [passwordResetEmail, setPasswordResetEmail] = useState('');
  const [passwordResetSending, setPasswordResetSending] = useState(false);

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
  const oauthPendingRef = useRef<NativeOAuthPending | null>(null);

  const goToTechRegistrationAfterAuth = () => {
    if (!techRegToken) return;
    router.replace({
      pathname: '/auth/tech-registration',
      params: { token: techRegToken },
    } as any);
  };

  const openDoc = async (type: 'TERMS_OF_USE' | 'PRIVACY_POLICY') => {
    setDocLoading(true);
    try {
      // Try tenant-specific document first, then fallback to global
      const storedEmail = await AsyncStorage.getItem('@brspark_email');
      const loc = encodeURIComponent(i18n.language || 'pt-BR');
      const res = await fetch(`${API_BASE}/api/compliance/active/${type}?locale=${loc}`);
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

  const openPasswordResetModal = () => {
    setPasswordResetEmail(String(email || '').trim().toLowerCase());
    setPasswordResetVisible(true);
  };

  const handlePasswordResetRequest = async () => {
    const normalizedEmail = String(passwordResetEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return Alert.alert('', t('auth.resetPasswordEmailRequired'));
    }
    setPasswordResetSending(true);
    try {
      const out = await AuthService.requestPasswordReset(normalizedEmail);
      setPasswordResetVisible(false);
      Alert.alert(
        t('auth.resetPasswordTitle'),
        out.message || t('auth.resetPasswordRequestSent'),
      );
    } catch (e: any) {
      Alert.alert(
        t('auth.resetPasswordTitle'),
        e?.message || t('auth.resetPasswordRequestError'),
      );
    } finally {
      setPasswordResetSending(false);
    }
  };

  const runNativeOAuthLogin = async (pending: NativeOAuthPending) => {
    oauthPendingRef.current = pending;
    setLoading(true);
    try {
      await loginWithOAuth(pending);
      oauthPendingRef.current = null;
      goToTechRegistrationAfterAuth();
    } catch (e: unknown) {
      if (e instanceof MultipleAccountsError && e.tenants?.length) {
        setTenantPick(e.tenants);
        return;
      }
      oauthPendingRef.current = null;
      Alert.alert(
        t('auth.errorLogin'),
        e instanceof Error ? e.message : t('auth.errorConnection'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      return Alert.alert('', t('auth.alertFillFields'));
    }
    oauthPendingRef.current = null;

    setLoading(true);
    try {
      await login(email, password);
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
        t('auth.errorLogin'),
        e?.message || t('auth.errorConnection')
      );
    } finally {
      setLoading(false);
    }
  };

  const completeLoginWithChosenTenant = async (tenantId: string) => {
    setTenantPick(null);
    const oauth = oauthPendingRef.current;
    if (oauth) {
      setLoading(true);
      try {
        await loginWithOAuth({ ...oauth, tenantId });
        oauthPendingRef.current = null;
        goToTechRegistrationAfterAuth();
      } catch (e: unknown) {
        oauthPendingRef.current = null;
        Alert.alert(
          t('auth.errorLogin'),
          e instanceof Error ? e.message : t('auth.errorConnection'),
        );
      } finally {
        setLoading(false);
      }
      return;
    }
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

      <Modal
        visible={passwordResetVisible}
        animationType="fade"
        transparent
        onRequestClose={() => !passwordResetSending && setPasswordResetVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{t('auth.resetPasswordTitle')}</Text>
            <Text style={styles.sheetText}>{t('auth.resetPasswordDescription')}</Text>

            <Field
              label={t('auth.email').toUpperCase() + ' *'}
              value={passwordResetEmail}
              onChangeText={setPasswordResetEmail}
              placeholder={t('auth.emailPlaceholder')}
              icon="mail-outline"
              keyboardType="email-address"
              C={C}
              formStyles={styles}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetSecondaryBtn}
                onPress={() => setPasswordResetVisible(false)}
                disabled={passwordResetSending}
              >
                <Text style={styles.sheetSecondaryBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetPrimaryBtn, passwordResetSending && { opacity: 0.7 }]}
                onPress={handlePasswordResetRequest}
                disabled={passwordResetSending}
              >
                {passwordResetSending ? (
                  <ActivityIndicator color={C.cardWhite} />
                ) : (
                  <Text style={styles.sheetPrimaryBtnText}>{t('auth.sendResetLink')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
              onPress={() => {
                setTenantPick(null);
                oauthPendingRef.current = null;
              }}
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
          {loginBackgroundUrl ? (
            <ImageBackground source={{ uri: loginBackgroundUrl }} style={styles.heroBg} resizeMode="cover">
              <View style={styles.heroOverlay}>
                <BrandingLogoImage style={styles.logoImage} resizeMode="contain" />
                <Text style={[styles.logoSub, { color: '#fff' }]}>{appTagline}</Text>
              </View>
            </ImageBackground>
          ) : (
            <View style={styles.logoBlock}>
              <BrandingLogoImage style={styles.logoImage} resizeMode="contain" />
              <Text style={styles.logoSub}>{appTagline}</Text>
            </View>
          )}


          {/* Abas: Entrar (esta tela) / Criar conta (fluxo OTP + senha) */}
          <View style={styles.tabs}>
            <View style={[styles.tab, styles.tabActive]}>
              <Text style={[styles.tabT, styles.tabTActive]}>{t('auth.login')}</Text>
            </View>
            <TouchableOpacity
              style={styles.tab}
              onPress={() =>
                router.push(
                  techRegToken
                    ? ({ pathname: '/auth/register-onboarding', params: { techRegToken } } as any)
                    : ('/auth/register-onboarding' as any),
                )
              }
            >
              <Text style={styles.tabT}>{t('auth.createAccount')}</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
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

            <TouchableOpacity
              style={styles.forgotLinkRow}
              onPress={openPasswordResetModal}
              disabled={loading}
            >
              <Text style={styles.forgotLinkText}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>

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
                  <Ionicons name="log-in-outline" size={20} color={C.cardWhite} />
                  <Text style={styles.ctaText}>{t('auth.loginPlatform')}</Text>
                </>
              )}
            </TouchableOpacity>

            <LoginOAuthNativeSection
              C={C}
              disabled={loading}
              labelDivider={t('auth.oauthOrContinue')}
              labelGoogle={t('auth.oauthGoogle')}
              labelMeta={t('auth.oauthMeta')}
              labelApple={t('auth.oauthApple')}
              unconfiguredOauthMessage={t('auth.oauthNotConfigured')}
              onOAuth={(pending) => runNativeOAuthLogin(pending)}
              onNativeError={(msg) =>
                Alert.alert(t('auth.errorLogin'), msg || t('auth.errorConnection'))
              }
            />

            <TouchableOpacity onPress={async () => { await logout(); router.replace(getPersonaHomeHref('client') as any); }} style={styles.guestLink}>
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
