import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/hooks/useAuth';

export default function OtpVerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const p = useLocalSearchParams<{
    challengeId?: string;
    name?: string;
    purpose?: string;
  }>();
  const { colors: C } = useTheme();
  const { loginWithOtp } = useAuth();
  const [code, setCode] = useState('');
  const [load, setLoad] = useState(false);
  const challengeId = String(p.challengeId || '');

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite, padding: 24 },
        title: { fontSize: 22, fontWeight: '900', color: C.slate, marginBottom: 8, textAlign: 'center' },
        hint: { fontSize: 14, color: C.textSecondary, textAlign: 'center', marginBottom: 20 },
        input: {
          fontSize: 32,
          fontWeight: '900',
          letterSpacing: 10,
          textAlign: 'center',
          backgroundColor: C.background,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: C.accent,
          paddingVertical: 16,
          color: C.primary,
        },
        main: {
          backgroundColor: C.accent,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center',
          marginTop: 20,
        },
        mainD: { opacity: 0.5 },
        mainT: { color: '#fff', fontWeight: '900', fontSize: 16 },
        back: { position: 'absolute' as const, top: 8, left: 8, zIndex: 1 },
      }),
    [C]
  );

  const onVerify = async () => {
    if (code.length < 6 || !challengeId) return;
    setLoad(true);
    try {
      const name = p.purpose === 'register' && p.name ? String(p.name) : undefined;
      await loginWithOtp({ challengeId, code, name: name && name.trim() ? name.trim() : undefined });
    } catch (e: any) {
      Alert.alert(t('auth.errorLogin'), e?.message || t('auth.errorConnection'));
      setCode('');
    } finally {
      setLoad(false);
    }
  };

  if (!challengeId) {
    router.replace('/auth/identifier' as any);
    return null;
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.back}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={C.accent} />
          </TouchableOpacity>
          <Text style={s.title}>{t('auth.otpTitle')}</Text>
          <Text style={s.hint}>{t('auth.otpHint')}</Text>
          <TextInput
            style={s.input}
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            placeholder="------"
            placeholderTextColor={C.border}
          />
          <TouchableOpacity
            style={[s.main, (code.length < 6 || load) && s.mainD]}
            onPress={onVerify}
            disabled={code.length < 6 || load}
          >
            {load ? <ActivityIndicator color="#fff" /> : <Text style={s.mainT}>OK</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
