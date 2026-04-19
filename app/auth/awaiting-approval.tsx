import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { getPersonaHomeHref } from '../../src/navigation/personaRouting';
import { Ionicons } from '@expo/vector-icons';

export default function AwaitingApprovalScreen() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const router = useRouter();

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite, padding: 24, justifyContent: 'center' },
        icon: { alignSelf: 'center', width: 72, height: 72, borderRadius: 20, backgroundColor: C.status.info.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
        title: { fontSize: 24, fontWeight: '900', textAlign: 'center', color: C.slate, marginBottom: 8 },
        body: { fontSize: 16, lineHeight: 24, textAlign: 'center', color: C.textSecondary, marginBottom: 32 },
        btn: { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
        btnT: { color: '#fff', fontWeight: '800', fontSize: 16 },
        back: { marginTop: 16, alignItems: 'center' },
        backT: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
      }),
    [C]
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={s.icon}>
          <Ionicons name="hourglass-outline" size={36} color={C.accent} />
        </View>
        <Text style={s.title}>{t('auth.awaitingTitle')}</Text>
        <Text style={s.body}>{t('auth.awaitingBody')}</Text>
        <TouchableOpacity
          onPress={() => router.push('/auth/simulator' as any)}
          style={s.btn}
        >
          <Ionicons name="school-outline" size={20} color="#fff" />
          <Text style={s.btnT}>{t('auth.awaitingCta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.replace(getPersonaHomeHref('client') as any)}
          style={s.back}
        >
          <Text style={s.backT}>{t('common.back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
