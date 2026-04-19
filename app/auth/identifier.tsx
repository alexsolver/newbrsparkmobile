import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeContext';
import { AuthService } from '../../src/services/auth';

type FlowMode = 'login' | 'register';

export default function OtpIdentifierScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const p = useLocalSearchParams<{ mode?: string }>();
  const { colors: C } = useTheme();
  const [mode, setMode] = useState<FlowMode>(p?.mode === 'register' ? 'register' : 'login');
  const [identifier, setId] = useState('');
  const [name, setName] = useState('');
  const [channel, setCh] = useState<'sms' | 'whatsapp'>('sms');
  const [load, setLoad] = useState(false);

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite, padding: 24 },
        back: { marginBottom: 8 },
        title: { fontSize: 24, fontWeight: '900', color: C.slate, marginBottom: 6 },
        hint: { fontSize: 14, color: C.textSecondary, marginBottom: 20 },
        toggles: { flexDirection: 'row', gap: 8, marginBottom: 12 },
        chip: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
        chipOn: { backgroundColor: C.status.info.bg, borderColor: C.accent },
        chText: { fontSize: 12, fontWeight: '800', color: C.slate },
        field: { borderWidth: 1, borderColor: C.border, backgroundColor: C.background, borderRadius: 12, padding: 12, fontSize: 16, color: C.primary, fontWeight: '600', marginBottom: 12 },
        main: { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
        mainD: { opacity: 0.5 },
        mainT: { color: '#fff', fontWeight: '900', fontSize: 16 },
        row: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
      }),
    [C]
  );

  const send = async () => {
    if (!identifier.trim()) {
      Alert.alert('', t('auth.alertFillFields'));
      return;
    }
    if (mode === 'register' && !name.trim()) {
      Alert.alert('', t('auth.alertFillName'));
      return;
    }
    setLoad(true);
    try {
      const out = await AuthService.startOtpAuth({
        identifier: identifier.trim(),
        channel,
        purpose: mode === 'register' ? 'register' : 'login',
        name: mode === 'register' ? name.trim() : undefined,
      });
      if (out.devCode && __DEV__) {
        console.log('[OTP dev]', out.devCode);
      }
      router.push({
        pathname: '/auth/otp-verify' as any,
        params: {
          challengeId: out.challengeId,
          name: mode === 'register' ? name.trim() : '',
          purpose: mode,
        },
      });
    } catch (e: any) {
      Alert.alert(t('auth.errorConnection'), e?.message || '—');
    } finally {
      setLoad(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <TouchableOpacity
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/auth/welcome' as any))}
        style={s.back}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={24} color={C.accent} />
      </TouchableOpacity>
      <Text style={s.title}>{t('auth.identifierTitle')}</Text>
      <Text style={s.hint}>{t('auth.identifierHint')}</Text>

      <View style={s.toggles}>
        <TouchableOpacity style={[s.chip, mode === 'login' && s.chipOn]} onPress={() => setMode('login')}>
          <Text style={s.chText}>{t('auth.identifierModeLogin')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.chip, mode === 'register' && s.chipOn]} onPress={() => setMode('register')}>
          <Text style={s.chText}>{t('auth.identifierModeRegister')}</Text>
        </TouchableOpacity>
      </View>

      {mode === 'register' && (
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('auth.identifierName')}
          style={s.field}
          placeholderTextColor={C.textLight}
          autoCapitalize="words"
        />
      )}

      <TextInput
        value={identifier}
        onChangeText={setId}
        style={s.field}
        autoCapitalize="none"
        keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
        placeholder="email ou +55 11 99999-9999"
        placeholderTextColor={C.textLight}
      />

      <View style={s.row}>
        <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '700' }}>Canal:</Text>
        <TouchableOpacity
          onPress={() => setCh('sms')}
          style={[s.chip, { flex: 0, paddingVertical: 6, paddingHorizontal: 12 }, channel === 'sms' && s.chipOn]}
        >
          <Text style={s.chText}>{t('auth.identifierChannelSms')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setCh('whatsapp')}
          style={[s.chip, { flex: 0, paddingVertical: 6, paddingHorizontal: 12 }, channel === 'whatsapp' && s.chipOn]}
        >
          <Text style={s.chText}>{t('auth.identifierChannelWa')}</Text>
        </TouchableOpacity>
      </View>

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
