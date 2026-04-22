import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../theme/ThemeContext';
import { BrandingLogoImage } from './BrandingLogoImage';
import { markAppIntroDismissedForGuestSession } from '../lib/appIntroPrefs';
import { Button } from './Button';

export type IntroPersonaTab = 'person' | 'provider' | 'company';

const HERO_IMAGES: Record<IntroPersonaTab, string> = {
  person:
    'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=600',
  provider:
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&q=80&w=600',
  company:
    'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&q=80&w=600',
};

type Props = {
  onContinue: () => void | Promise<void>;
  /** Quando `false`, oculta «Já tenho conta» (ex.: onboarding pós-login). */
  showExistingAccountLink?: boolean;
  /** Se omitido e o link estiver visível, marca intro como vista e abre o login. */
  onExistingAccountPress?: () => void | Promise<void>;
  /** Catálogo de prestadores (ex.: intro antes do login). Só mostra o botão se definido. */
  onExploreServicesPress?: () => void | Promise<void>;
};

export function OnboardingIntroSlide({
  onContinue,
  showExistingAccountLink = true,
  onExistingAccountPress,
  onExploreServicesPress,
}: Props) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<IntroPersonaTab>('person');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const winH = Dimensions.get('window').height;
  const imageBlockH = Math.min(winH * 0.36, 280);

  const switchTab = useCallback(
    (tab: IntroPersonaTab) => {
      if (tab === activeTab) return;
      Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setActiveTab(tab);
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    },
    [activeTab, fadeAnim]
  );

  const headline = t(`consentFlow.introHeadline_${activeTab}`);
  const body = t(`consentFlow.introBody_${activeTab}`);

  const handleExistingAccount = useCallback(() => {
    const run =
      onExistingAccountPress ??
      (() => {
        markAppIntroDismissedForGuestSession();
        router.replace('/auth/login' as any);
      });
    void run();
  }, [onExistingAccountPress]);

  const tabs: { key: IntroPersonaTab; labelKey: string }[] = [
    { key: 'person', labelKey: 'consentFlow.introTabPerson' },
    { key: 'provider', labelKey: 'consentFlow.introTabProvider' },
    { key: 'company', labelKey: 'consentFlow.introTabCompany' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: C.background, paddingTop: Math.max(insets.top, 8) }]}>
      <View style={[styles.imageWrap, { height: imageBlockH, marginHorizontal: 10, marginTop: 4 }]}>
        <Animated.View style={[styles.imageInner, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: HERO_IMAGES[activeTab] }}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityLabel={t('consentFlow.introImageA11y')}
          />
        </Animated.View>
        <LinearGradient
          colors={['transparent', C.cardWhite]}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={styles.copyBlock}>
        <View style={styles.logoRow}>
          <BrandingLogoImage
            style={styles.logoImg}
            resizeMode="contain"
            accessibilityLabel={t('consentFlow.a11yLogo')}
          />
        </View>

        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={[styles.headline, { color: C.slate }]} accessibilityRole="header">
            {headline}
          </Text>
          <Text style={[styles.body, { color: C.textSecondary }]}>{body}</Text>
        </Animated.View>

        <View style={[styles.segment, { backgroundColor: C.surfaceLow }]}>
          {tabs.map(({ key, labelKey }) => {
            const active = activeTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => switchTab(key)}
                style={[
                  styles.segmentItem,
                  active
                    ? {
                        backgroundColor: C.cardWhite,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.08,
                        shadowRadius: 3,
                        elevation: 2,
                      }
                    : { backgroundColor: 'transparent' },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? C.accent : C.textLight },
                  ]}
                  numberOfLines={1}
                >
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: C.accent, shadowColor: C.accent }]}
          onPress={() => void onContinue()}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t('consentFlow.introCtaPrimary')}
        >
          <Text style={[styles.primaryBtnText, { color: C.cardWhite }]}>{t('consentFlow.introCtaPrimary')}</Text>
          <Ionicons name="arrow-forward" size={18} color={C.cardWhite} />
        </TouchableOpacity>

        {onExploreServicesPress ? (
          <Button
            title={t('consentFlow.introExploreServices')}
            variant="secondary"
            onPress={() => void onExploreServicesPress()}
            style={styles.secondaryBtn}
            testID="onboarding-explore-services"
          />
        ) : null}

        {showExistingAccountLink && (
          <View style={styles.loginRow}>
            <Text style={[styles.loginMuted, { color: C.textLight }]}>{t('consentFlow.introLoginPrefix')} </Text>
            <TouchableOpacity onPress={handleExistingAccount} accessibilityRole="link">
              <Text style={[styles.loginLink, { color: C.slate }]}>{t('consentFlow.introLoginAction')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  imageWrap: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  imageInner: { flex: 1 },
  heroImage: { width: '100%', height: '100%' },
  copyBlock: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  logoRow: { alignItems: 'flex-start', marginBottom: 4 },
  logoImg: { width: 200, height: 48 },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 10,
    lineHeight: 28,
  },
  body: { fontSize: 14, lineHeight: 22, marginBottom: 16 },
  segment: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  segmentLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  secondaryBtn: { width: '100%', borderRadius: 16 },
  loginRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginMuted: { fontSize: 12, fontWeight: '600' },
  loginLink: { fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
});
