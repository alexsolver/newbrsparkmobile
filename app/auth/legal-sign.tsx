import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { apiFetch } from '../../src/services/auth';

const TERMS_V = '2026.04.1';

export default function LegalSignScreen() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [load, setLoad] = useState(false);

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite, padding: 20 },
        title: { fontSize: 22, fontWeight: '900', color: C.slate, marginBottom: 8 },
        body: { fontSize: 15, lineHeight: 24, color: C.textSecondary, marginBottom: 20 },
        row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 },
        box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.accent, marginTop: 2, justifyContent: 'center', alignItems: 'center' },
        boxOn: { backgroundColor: C.accent },
        main: { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
        mainD: { opacity: 0.45 },
        mainT: { color: '#fff', fontWeight: '900' },
        link: { color: C.accent, textDecorationLine: 'underline' },
        skip: { marginTop: 12, alignItems: 'center' },
      }),
    [C]
  );

  const submit = async () => {
    if (!ok) {
      Alert.alert('', t('auth.legalSignCheckbox'));
      return;
    }
    setLoad(true);
    try {
      const res = await apiFetch('/api/technician-onboarding/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept: true, termsVersion: TERMS_V }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || 'Erro');
      }
      const es = await apiFetch('/api/technician-onboarding/esign', { method: 'GET' });
      const ed = await es.json();
      if (es.ok && (ed as { url?: string }).url && (ed as { configured?: boolean }).configured) {
        const can = await Linking.canOpenURL((ed as { url: string }).url);
        if (can) {
          await Linking.openURL((ed as { url: string }).url);
        } else {
          Alert.alert(t('appAlerts.legal.signatureTitle'), (ed as { url: string }).url);
        }
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('appAlerts.legal.errorFallback'));
    } finally {
      setLoad(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScrollView>
        <Text style={s.title}>{t('auth.legalSignTitle')}</Text>
        <Text style={s.body}>{t('auth.legalSignBody')}</Text>
        <TouchableOpacity style={s.row} onPress={() => setOk((v) => !v)} activeOpacity={0.8}>
          <View style={[s.box, ok && s.boxOn]} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: C.slate, fontWeight: '600' }}>{t('auth.legalSignCheckbox')}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 12, color: C.textLight, marginBottom: 16 }}>
          (v. {TERMS_V})
        </Text>
        <TouchableOpacity
          onPress={submit}
          style={[s.main, (!ok || load) && s.mainD]}
          disabled={!ok || load}
        >
          {load ? <ActivityIndicator color="#fff" /> : <Text style={s.mainT}>{t('auth.legalSignContinue')}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL('https://www.aria.com/termos').catch(() => {})}
          style={{ marginTop: 16, alignItems: 'center' }}
        >
          <Text style={s.link}>{t('auth.termsOfUse')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.skip} onPress={() => router.back()}>
          <Text style={{ color: C.textSecondary, fontWeight: '600' }}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
