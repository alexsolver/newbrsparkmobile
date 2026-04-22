import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeContext';
import { AuthService } from '../../src/services/auth';

/**
 * OTP só para quem já tem conta (login).
 * Novo registo: fluxo em `/auth/register-onboarding`.
 */
export default function OtpIdentifierScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors: C } = useTheme();
  const [identifier, setId] = useState('');
  const [load, setLoad] = useState(false);

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite, padding: 24 },
        back: { marginBottom: 8 },
        title: { fontSize: 24, fontWeight: '900', color: C.slate, marginBottom: 6 },
        hint: { fontSize: 14, color: C.textSecondary, marginBottom: 20 },
        field: {
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.background,
          borderRadius: 12,
          padding: 12,
          fontSize: 16,
          color: C.primary,
          fontWeight: '600',
          marginBottom: 12,
        },
        main: {
          backgroundColor: C.accent,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center',
          marginTop: 4,
        },
        mainD: { opacity: 0.5 },
        mainT: { color: '#fff', fontWeight: '900', fontSize: 16 },
      }),
    [C],
  );

  const send = async () => {
    if (!identifier.trim()) {
      Alert.alert('', t('auth.identifierPlaceholder'));
      return;
    }
    setLoad(true);
    try {
      const out = await AuthService.startOtpAuth({
        identifier: identifier.trim(),
        purpose: 'login',
      });
      if (out.devCode && __DEV__) {
        console.log('[OTP dev]', out.devCode);
      }
      router.push({
        pathname: '/auth/otp-verify' as any,
        params: {
          challengeId: out.challengeId,
        },
      });
    } catch (e: any) {
      Alert.alert(t('auth.errorOtpSendTitle'), e?.message || t('auth.errorConnection'));
    } finally {
      setLoad(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <TouchableOpacity
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/auth/login' as any))}
        style={s.back}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={24} color={C.accent} />
      </TouchableOpacity>
      <Text style={s.title}>{t('auth.identifierTitle')}</Text>
      <Text style={s.hint}>{t('auth.identifierHint')}</Text>

      <TextInput
        value={identifier}
        onChangeText={setId}
        style={s.field}
        autoCapitalize="none"
        keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
        placeholder={t('auth.identifierPlaceholder')}
        placeholderTextColor={C.textLight}
      />

      <TouchableOpacity
        style={[s.main, (load || !identifier.trim()) && s.mainD]}
        onPress={send}
        disabled={load || !identifier.trim()}
      >
        {load ? <ActivityIndicator color="#fff" /> : <Text style={s.mainT}>{t('auth.sendCode')}</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}
