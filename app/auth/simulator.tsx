import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { getPersonaHomeHref } from '../../src/navigation/personaRouting';
import { Ionicons } from '@expo/vector-icons';

type Step = 'start' | 'enroute' | 'photo' | 'done';

export default function TrainingSimulatorScreen() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>('start');

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite, padding: 20 },
        title: { fontSize: 20, fontWeight: '900', color: C.slate, marginBottom: 6 },
        intro: { fontSize: 15, lineHeight: 22, color: C.textSecondary, marginBottom: 20 },
        card: { backgroundColor: C.surfaceLow, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
        label: { fontSize: 12, fontWeight: '800', color: C.textLight, marginBottom: 4 },
        value: { fontSize: 16, fontWeight: '700', color: C.slate },
        img: { width: '100%', height: 160, borderRadius: 12, backgroundColor: C.border, marginTop: 8 },
        btn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
        btnS: { backgroundColor: C.surfaceLow, borderWidth: 1, borderColor: C.accent, marginTop: 10 },
        btnT: { color: '#fff', fontWeight: '800' },
        btnTS: { color: C.accent, fontWeight: '800' },
        done: { textAlign: 'center', fontSize: 16, lineHeight: 24, color: C.textSecondary, marginTop: 8 },
        back: { marginTop: 20, alignItems: 'center' },
      }),
    [C]
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScrollView>
        <Text style={s.title}>{t('auth.simulatorTitle')}</Text>
        <Text style={s.intro}>{t('auth.simulatorIntro')}</Text>

        {step === 'start' && (
          <View>
            <View style={s.card}>
              <Text style={s.label}>Pedido (exemplo)</Text>
              <Text style={s.value}>Instalação de rede — R. Exemplo, 100</Text>
              <Text style={{ marginTop: 8, color: C.textSecondary, fontSize: 13 }}>2,3 km · janela 14h–18h</Text>
            </View>
            <TouchableOpacity
              onPress={() => setStep('enroute')}
              style={s.btn}
            >
              <Text style={s.btnT}>{t('auth.simulatorAccept')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'enroute' && (
          <View>
            <View style={s.card}>
              <Ionicons name="navigate" size={32} color={C.accent} style={{ marginBottom: 6 }} />
              <Text style={s.value}>Rota de treino (simulada)</Text>
              <Text style={{ color: C.textSecondary, marginTop: 4 }}>ETA ~12 min</Text>
            </View>
            <TouchableOpacity onPress={() => setStep('photo')} style={s.btn}>
              <Text style={s.btnT}>{t('auth.simulatorEnRoute')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('start')} style={[s.btn, s.btnS]}>
              <Text style={s.btnTS}>{t('common.back')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'photo' && (
          <View>
            <View style={s.card}>
              <Text style={s.label}>Foto de conclusão (ilustrativa)</Text>
              <View style={s.img}>
                <Ionicons name="image-outline" size={48} color={C.textLight} style={{ alignSelf: 'center', marginTop: 48 }} />
              </View>
            </View>
            <TouchableOpacity onPress={() => setStep('done')} style={s.btn}>
              <Text style={s.btnT}>{t('auth.simulatorComplete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('enroute')} style={[s.btn, s.btnS]}>
              <Text style={s.btnTS}>{t('common.back')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'done' && (
          <View>
            <Ionicons name="checkmark-circle" size={56} color="#10b981" style={{ alignSelf: 'center' }} />
            <Text style={s.done}>{t('auth.simulatorDone')}</Text>
            <TouchableOpacity
              onPress={() => router.replace(getPersonaHomeHref('client') as any)}
              style={[s.btn, { marginTop: 20 }]}
            >
              <Text style={s.btnT}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace(getPersonaHomeHref('client') as any))}
          style={s.back}
        >
          <Text style={{ color: C.textSecondary, fontWeight: '600' }}>{t('common.close')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
