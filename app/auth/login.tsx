import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Linking, Image, Modal,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/hooks/useAuth';
import { API_BASE, TwoFactorRequired } from '../../src/services/auth';
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
}

function Field({ label, value, onChangeText, placeholder, icon, secure, toggle, keyboardType = 'default', showPass }: FieldProps) {
  return (
    <View style={S.fieldG}>
      <Text style={S.fieldL}>{label}</Text>
      <View style={S.fieldRow}>
        <Ionicons name={icon} size={18} color={colors.textLight} style={S.fieldIcon} />
        <TextInput
          style={S.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textLight}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoCapitalize="none"
        returnKeyType="done"
                      />
        {toggle && (
          <TouchableOpacity onPress={toggle} style={{ padding: 4 }}>
            <Ionicons name={showPass ? 'eye-off' : 'eye'} size={18} color={colors.textLight} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}


export default function LoginScreen() {
  const router = useRouter();
  const { login, register, logout, completeLoginWithOtp } = useAuth();
  const { t } = useTranslation();

  const [mode, setMode] = useState<Mode>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [country, setCountry] = useState<string>(getDeviceRegion());

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

  // ─── 2FA State ───────────────────────────────────────────────────────────────
  const [twoFaVisible, setTwoFaVisible] = useState(false);
  const [twoFaChallenge, setTwoFaChallenge] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

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
      // RouteGuard will handle onboarding redirect if needed
    } catch (e: any) {
      if (e instanceof TwoFactorRequired) {
        setTwoFaChallenge(e.challengeToken);
        setOtp('');
        setTwoFaVisible(true);
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

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6 || !twoFaChallenge) return;
    setOtpLoading(true);
    try {
      await completeLoginWithOtp(twoFaChallenge, otp);
      await ApiService.sync(email);
      setTwoFaVisible(false);
      // RouteGuard will handle onboarding redirect
    } catch (e: any) {
      Alert.alert('Código inválido', e?.message || 'Tente novamente.');
      setOtp('');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <SafeAreaView style={S.safe} edges={['top', 'bottom']}>

      {/* Compliance Doc Modal */}
      <Modal visible={!!docModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={S.docModalHeader}>
            <Text style={S.docModalTitle} numberOfLines={1}>{docModal?.title}</Text>
            <TouchableOpacity onPress={() => setDocModal(null)} style={S.docCloseBtn}>
              <Ionicons name="close" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={S.docContent}>{docModal?.content}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ─── 2FA OTP Modal ─────────────────────────────────────────────────── */}
      <Modal visible={twoFaVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="shield-checkmark" size={28} color={colors.accent} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.primary }}>Verificação em 2 etapas</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '500', textAlign: 'center', marginTop: 6 }}>
                {'Insira o código de 6 dígitos\nenviado para o seu e-mail.'}
              </Text>
            </View>

            <TextInput
              style={{
                fontSize: 32, fontWeight: '900', letterSpacing: 12,
                textAlign: 'center', backgroundColor: '#F8FAFC',
                borderRadius: 16, borderWidth: 1.5, borderColor: colors.accent,
                paddingVertical: 18, paddingHorizontal: 16, color: colors.primary,
                marginBottom: 20,
              }}
              value={otp}
              onChangeText={v => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              placeholder="------"
              placeholderTextColor="#CBD5E1"
            />

            <TouchableOpacity
              style={[{ backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 14 }, (otp.length < 6 || otpLoading) && { opacity: 0.5 }]}
              onPress={handleVerifyOtp}
              disabled={otp.length < 6 || otpLoading}
            >
              {otpLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Verificar Código</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={{ alignItems: 'center', padding: 8 }} onPress={() => { setTwoFaVisible(false); setTwoFaChallenge(null); }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={S.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={S.logoBlock}>
            <Image
              source={require('../../assets/logo.png')}
              style={S.logoImage}
              resizeMode="contain"
            />
            <Text style={S.logoSub}>Precisou, resolveu.</Text>
          </View>


          {/* Mode Tabs */}
          <View style={S.tabs}>
            {(['LOGIN', 'REGISTER'] as Mode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[S.tab, mode === m && S.tabActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[S.tabT, mode === m && S.tabTActive]}>
                  {m === 'LOGIN' ? t('auth.login') : t('auth.createAccount')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Form */}
          <View style={S.form}>
            {mode === 'REGISTER' && (
              <>
                <Field
                  label={t('auth.fullName').toUpperCase() + ' *'}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('auth.fullNamePlaceholder')}
                  icon="person-outline"
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
            />




            {/* Country selector — shown in REGISTER mode */}
            {mode === 'REGISTER' && (
              <View style={S.countryRow}>
                <Text style={S.countryLabel}>{t('auth.country') || 'País / Region'}</Text>
                <View style={S.countryPills}>
                  {COUNTRIES.map(c => {
                    const active = country === c.code;
                    return (
                      <TouchableOpacity
                        key={c.code}
                        style={[S.countryPill, active && S.countryPillActive]}
                        onPress={async () => {
                          setCountry(c.code);
                          await AsyncStorage.setItem(REGION_KEY, c.code);
                          await setLanguage(c.lang);
                        }}
                      >
                        <View style={[S.countryBadge, active && S.countryBadgeActive]}>
                          <Ionicons name="earth" size={16} color={active ? '#fff' : colors.slate} />
                        </View>
                        <Text style={[S.countryCode, active && S.countryCodeActive]}>{c.code}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* LGPD / GDPR Consent */}
            {mode === 'REGISTER' && (
              <TouchableOpacity
                style={S.consentRow}
                onPress={() => setConsent(c => !c)}
                activeOpacity={0.8}
              >
                <View style={[S.checkbox, consent && S.checkboxActive]}>
                  {consent && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <Text style={S.consentText}>
                  {t('auth.consentText')}{' '}
                  <Text style={S.link} onPress={() => openDoc('TERMS_OF_USE')}>
                    {t('auth.termsOfUse')}
                  </Text>
                  {' '}{t('auth.and')}{' '}
                  <Text style={S.link} onPress={() => openDoc('PRIVACY_POLICY')}>
                    {t('auth.privacyPolicy')}
                  </Text>
                  {' '}({t('auth.consentRequired')})
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[S.cta, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={mode === 'LOGIN' ? 'log-in-outline' : 'person-add-outline'}
                    size={20}
                    color="#fff"
                  />
                  <Text style={S.ctaText}>
                    {mode === 'LOGIN' ? t('auth.loginPlatform') : t('auth.createMyAccount')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={async () => { await logout(); router.replace('/(tabs)' as any); }} style={S.guestLink}>
              <Text style={S.guestLinkText}>{t('auth.exploreGuest')}</Text>
            </TouchableOpacity>
          </View>

          {/* Footer links */}
          <View style={S.footerLinks}>
              <TouchableOpacity onPress={() => openDoc('PRIVACY_POLICY')} style={S.footerLinkTouch}>
                <Text style={S.footerLink}>🔒 {t('auth.privacyPolicy')}</Text>
              </TouchableOpacity>
              <Text style={S.footerDivider}>·</Text>
              <TouchableOpacity onPress={() => openDoc('TERMS_OF_USE')} style={S.footerLinkTouch}>
                <Text style={S.footerLink}>{t('auth.termsOfUse')}</Text>
              </TouchableOpacity>
          </View>

          <Text style={S.gdprBadge}>{t('auth.lgpdBadge')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },

  logoBlock: { alignItems: 'center', paddingTop: 40, paddingBottom: 36 },
  logoImage: { width: 220, height: 80, marginBottom: 8 },
  logoSub: {
    fontSize: 12, color: colors.textSecondary, fontWeight: '600',
    letterSpacing: 0.5,
  },


  tabs: {
    flexDirection: 'row', backgroundColor: '#F1F5F9',
    borderRadius: 14, padding: 4, marginBottom: 28,
  },
  tab: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabT: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  tabTActive: { color: colors.primary, fontWeight: '900' },

  form: { gap: 4 },
  fieldG: { marginBottom: 16 },
  fieldL: { fontSize: 10, fontWeight: '900', color: colors.textLight, marginBottom: 8, letterSpacing: 0.5 },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 4,
  },
  fieldIcon: { marginRight: 10 },
  fieldInput: {
    flex: 1, fontSize: 15, color: colors.primary, fontWeight: '600',
    paddingVertical: 12,
  },

  consentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#F0F9FF', borderRadius: 12,
    borderWidth: 1, borderColor: '#BAE6FD',
    padding: 14, marginBottom: 8,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 2, borderColor: colors.accent,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  consentText: {
    flex: 1, fontSize: 13, color: colors.textSecondary,
    fontWeight: '500', lineHeight: 20,
  },
  link: { color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },

  cta: {
    backgroundColor: colors.accent, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, borderRadius: 18, gap: 10,
    marginTop: 12,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  ctaText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  footerLinks: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 28, gap: 8,
  },
  footerLink: { fontSize: 12, color: colors.accent, fontWeight: '700' },
  footerDivider: { color: colors.textLight },

  gdprBadge: {
    textAlign: 'center', fontSize: 10, color: colors.textLight,
    marginTop: 12, fontWeight: '500', lineHeight: 16,
  },

  demoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent + '12', borderRadius: 10,
    borderWidth: 1, borderColor: colors.accent + '40',
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4,
  },
  demoBtnT: { fontSize: 12, color: colors.accent, fontWeight: '700', flex: 1 },

  guestLink: { alignItems: 'center', marginTop: 16, paddingVertical: 8 },
  guestLinkText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },

  // Compliance doc modal
  docModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  docModalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.primary, marginRight: 12 },
  docCloseBtn: { padding: 6, borderRadius: 20, backgroundColor: '#F1F5F9' },
  docContent: { fontSize: 13, color: colors.textSecondary, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  footerLinkTouch: { padding: 4 },

  // Country selector (register)
  countryRow: { marginBottom: 12, marginTop: 4 },
  countryLabel: { fontSize: 10, fontWeight: '900', color: colors.textLight, marginBottom: 8, letterSpacing: 0.5 },
  countryPills: { flexDirection: 'row', gap: 8 },
  countryPill: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  countryPillActive: { backgroundColor: '#191C1D', borderColor: '#191C1D' },
  countryBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  countryBadgeActive: { backgroundColor: '#334155' },
  countryCode: { fontSize: 11, fontWeight: '900', color: '#64748B' },
  countryCodeActive: { color: '#fff' },
});

