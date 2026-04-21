import React, { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { BrandingLogoImage } from '../../src/components/BrandingLogoImage';

const { width: W } = Dimensions.get('window');

export default function WelcomeOtpOnboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors: C, appTagline, appDisplayName } = useTheme();
  const [i, setI] = useState(0);
  const listRef = useRef<FlatList>(null);
  const slides = useMemo(
    () => [
      { k: 1, title: t('auth.welcomeSlide1'), icon: 'navigate-outline' as const },
      { k: 2, title: t('auth.welcomeSlide2'), icon: 'list-outline' as const },
      { k: 3, title: t('auth.welcomeSlide3'), icon: 'card-outline' as const },
    ],
    [t]
  );

  const s = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite },
        top: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
        logo: { width: 180, height: 64 },
        sub: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
        slide: { width: W, paddingHorizontal: 32, paddingTop: 20, alignItems: 'center' },
        ico: {
          width: 88,
          height: 88,
          borderRadius: 22,
          backgroundColor: C.surfaceLow,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        },
        t: { fontSize: 22, fontWeight: '900', color: C.slate, textAlign: 'center' },
        dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 },
        dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
        dotOn: { backgroundColor: C.accent, width: 20 },
        actions: { padding: 24, paddingBottom: 32, gap: 12 },
        primary: {
          backgroundColor: C.accent,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center',
        },
        pText: { color: '#fff', fontWeight: '900', fontSize: 16 },
        secondary: { paddingVertical: 8, alignItems: 'center' },
        sText: { color: C.textSecondary, fontWeight: '700', fontSize: 14 },
      }),
    [C]
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const n = Math.round(x / W);
    if (n !== i && n >= 0 && n < slides.length) setI(n);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.top}>
        <BrandingLogoImage style={s.logo} resizeMode="contain" />
        <Text style={s.sub}>{appTagline || 'BrSpark'}</Text>
        <Text style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>{appDisplayName}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(it) => String(it.k)}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={s.slide}>
            <View style={s.ico}>
              <Ionicons name={item.icon} size={40} color={C.accent} />
            </View>
            <Text style={s.t}>{item.title}</Text>
          </View>
        )}
      />

      <View style={s.dots}>
        {slides.map((_, idx) => (
          <View key={String(idx)} style={[s.dot, i === idx && s.dotOn]} />
        ))}
      </View>

      <View style={s.actions}>
        {i < slides.length - 1 ? (
          <TouchableOpacity
            style={s.primary}
            onPress={() => {
              const next = Math.min(i + 1, slides.length - 1);
              listRef.current?.scrollToIndex({ index: next, animated: true });
            }}
            accessibilityLabel={t('auth.welcomeNext')}
          >
            <Text style={s.pText}>{t('auth.welcomeNext')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.primary}
            onPress={() => router.push('/auth/identifier' as any)}
            accessibilityLabel={t('auth.welcomeStart')}
          >
            <Text style={s.pText}>{t('auth.welcomeStart')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.replace('/auth/login' as any)}
          style={s.secondary}
        >
          <Text style={s.sText}>E-mail e senha</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
