import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Text, Animated, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments, useLocalSearchParams } from 'expo-router';
import { useAppContext, checkGuardBeforeBack } from '../context/AppContext';
import { getLocalAssets } from '../database';
import { Asset } from '../types/asset';
import { useAuth } from '../hooks/useAuth';
import { useResolvedAvatarUri } from '../hooks/useResolvedAvatarUri';
import { useConnectivity } from '../hooks/useConnectivity';
import { useGpsAuraIssue } from '../hooks/useGpsAuraIssue';
import { MODE_SEGMENT_COLORS } from '../theme/colors';
import { fontSize, fontWeight, radius } from '../theme/layout';

function AvatarConnectivityStack({
  ringSize,
  touchSize,
  placeholderIconSize,
  dotColor,
  gpsIssue,
  gpsAuraDiameter,
  avatarUri,
  onPress,
  textSecondary,
  cardSurface,
  gpsRing,
  gpsShadow,
}: {
  ringSize: number;
  touchSize: number;
  placeholderIconSize: number;
  dotColor: string;
  gpsIssue: boolean;
  gpsAuraDiameter: number;
  avatarUri: string | null | undefined;
  onPress: () => void;
  textSecondary: string;
  cardSurface: string;
  gpsRing: string;
  gpsShadow: string;
}) {
  return (
    <View style={{ width: ringSize, height: ringSize, justifyContent: 'center', alignItems: 'center' }}>
      {gpsIssue ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: gpsAuraDiameter,
            height: gpsAuraDiameter,
            borderRadius: gpsAuraDiameter / 2,
            borderWidth: 3,
            borderColor: gpsRing,
            shadowColor: gpsShadow,
            shadowOpacity: Platform.OS === 'ios' ? 0.45 : 0.38,
            shadowRadius: 9,
            shadowOffset: { width: 0, height: 0 },
            ...(Platform.OS === 'android' ? { elevation: 5 } : {}),
          }}
        />
      ) : null}
      <View
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 3,
          borderColor: dotColor,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <TouchableOpacity
          style={{
            width: touchSize,
            height: touchSize,
            borderRadius: touchSize / 2,
            backgroundColor: cardSurface,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={onPress}
          activeOpacity={0.7}
        >
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={{ width: touchSize, height: touchSize, borderRadius: touchSize / 2 }}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="person-outline" size={placeholderIconSize} color={textSecondary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface HeaderProps {
  showAssetTools?: boolean;
  title?: string;
  leftIcon?: string;
  onLeftPress?: () => void;
}

export function Header({ showAssetTools = false, title, leftIcon, onLeftPress }: HeaderProps) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const params = useLocalSearchParams();
  const { colors: C } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { mode, setMode, guardRef } = useAppContext();
  const { user, userRole } = useAuth();
  const avatarUri = useResolvedAvatarUri(user);
  const { isOnline } = useConnectivity();
  const gpsIssue = useGpsAuraIssue();

  // Pulse animation for the online dot
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isOnline) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.6, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [isOnline]);

  // Dot color: grey while first check, green online, red offline
  const dotColor =
    isOnline === null ? C.connectivity.checking : isOnline ? C.connectivity.online : C.connectivity.offline;

  const isAssetDetail = segments[0] === 'asset' && segments.length > 1 && segments[1] !== 'new';
  const isProfile = segments[0] === 'profile';
  const isTabs = segments[0] === '(tabs)';

  // O Header global (injetado no _layout.tsx) não recebe `title`.
  // Devemos escondê-lo completamente se não estivermos nas abas principais, no perfil ou no detalhe do ativo.
  if (!title && !isTabs && !isProfile && !isAssetDetail) {
    return null;
  }

  const asset = isAssetDetail && params.id ? getLocalAssets().find(a => a.id === params.id) : null;

  const showBensInBadge = mode !== 'PROVIDER';
  const badgeSegmentCount =
    (userRole === 'CLIENT' ? 1 : 0) + (showBensInBadge ? 1 : 0) + (userRole === 'TECHNICIAN' ? 1 : 0);

  const segmentHitSlop = { top: 10, bottom: 10, left: 4, right: 4 } as const;
  const segBase = {
    flex: 1,
    minHeight: 32,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  };

  const segLabelStyle = {
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs + 2,
    letterSpacing: 0.2,
    textAlign: 'center' as const,
    /** Não usar adjustsFontSizeToFit: com flex igual por segmento, "PRESTADOR" ficava microscópico vs "BENS". */
  };

  /** Largura um pouco maior com 2 segmentos para "PRESTADOR" + "BENS" sem apertar o texto. */
  const idealBadgeWidth = badgeSegmentCount <= 1 ? 122 : badgeSegmentCount === 2 ? 186 : 228;
  /** Espaço entre logo (≈100) + margem, avatar (≈54) e padding do header — evita sobrepor o logo com absolute center. */
  const headerSideReserve = 32 + 108 + 54;
  const maxBadgeByScreen = Math.max(104, windowWidth - headerSideReserve);
  const badgeWidth = Math.min(idealBadgeWidth, maxBadgeByScreen);

  const renderBadge = () => (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: C.surfaceLow,
        borderRadius: radius.md,
        paddingHorizontal: 3,
        paddingVertical: 2,
        width: badgeWidth,
        maxWidth: '100%',
        alignItems: 'center',
      }}
    >
      {userRole === 'CLIENT' && (
        <TouchableOpacity
          hitSlop={segmentHitSlop}
          onPress={() => {
            setMode('SERVICES');
            if (segments[0] !== '(tabs)') router.push('/(tabs)');
          }}
          activeOpacity={0.8}
          style={[
            segBase,
            {
              backgroundColor: mode === 'SERVICES' ? C.cardWhite : 'transparent',
              shadowColor: mode === 'SERVICES' ? C.slate : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: mode === 'SERVICES' ? 0.06 : 0,
              shadowRadius: 2,
              elevation: mode === 'SERVICES' ? 1 : 0,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="clip"
            style={[
              segLabelStyle,
              {
                fontWeight: mode === 'SERVICES' ? fontWeight.black : fontWeight.bold,
                color: mode === 'SERVICES' ? MODE_SEGMENT_COLORS.SERVICES : C.textLight,
              },
            ]}
          >
            SERVIÇOS
          </Text>
        </TouchableOpacity>
      )}

      {showBensInBadge && (
        <TouchableOpacity
          hitSlop={segmentHitSlop}
          onPress={() => {
            setMode('ASSETS');
            if (segments[0] !== '(tabs)') router.push('/(tabs)');
          }}
          activeOpacity={0.8}
          style={[
            segBase,
            {
              backgroundColor: mode === 'ASSETS' ? C.cardWhite : 'transparent',
              shadowColor: mode === 'ASSETS' ? C.slate : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: mode === 'ASSETS' ? 0.06 : 0,
              shadowRadius: 2,
              elevation: mode === 'ASSETS' ? 1 : 0,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="clip"
            style={[
              segLabelStyle,
              {
                fontWeight: mode === 'ASSETS' ? fontWeight.black : fontWeight.bold,
                color: mode === 'ASSETS' ? MODE_SEGMENT_COLORS.ASSETS : C.textLight,
              },
            ]}
          >
            BENS
          </Text>
        </TouchableOpacity>
      )}

      {userRole === 'TECHNICIAN' && (
        <TouchableOpacity
          hitSlop={segmentHitSlop}
          onPress={() => {
            setMode('PROVIDER');
            if (segments[0] !== '(tabs)') router.push('/(tabs)');
          }}
          activeOpacity={0.8}
          style={[
            segBase,
            {
              backgroundColor: mode === 'PROVIDER' ? C.cardWhite : 'transparent',
              shadowColor: mode === 'PROVIDER' ? C.slate : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: mode === 'PROVIDER' ? 0.06 : 0,
              shadowRadius: 2,
              elevation: mode === 'PROVIDER' ? 1 : 0,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="clip"
            style={[
              segLabelStyle,
              {
                fontWeight: mode === 'PROVIDER' ? fontWeight.black : fontWeight.bold,
                color: mode === 'PROVIDER' ? MODE_SEGMENT_COLORS.PROVIDER : C.textLight,
              },
            ]}
          >
            PRESTADOR
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (title || isAssetDetail || isProfile) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border }}
      >
        <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          {/* Left: Back + Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={onLeftPress || (() => checkGuardBeforeBack(guardRef, () => router.back()))}
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: 22,
                backgroundColor: C.surfaceLow,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name={(leftIcon as any) || 'arrow-back'} size={22} color={C.slate} />
            </TouchableOpacity>

            <Image 
              source={require('../../assets/logo.png')} 
              style={{ width: 70, height: 22, marginLeft: 2, marginRight: 4 }} 
              resizeMode="contain" 
            />

            {title ? (
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.black, color: C.slate, letterSpacing: -0.5 }}>
                {title}
              </Text>
            ) : isAssetDetail && asset ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Image
                  source={{ uri: asset.imageUrl || 'https://via.placeholder.com/150' }}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.border }}
                />
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.black, color: C.slate, maxWidth: 160 }} numberOfLines={1}>
                  {asset.title}
                </Text>
              </View>
            ) : isProfile ? (
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.black, color: C.slate, letterSpacing: -0.5 }}>
                Configurações
              </Text>
            ) : null}
          </View>

          {/* Right: QR + connectivity dot + Profile */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!isProfile ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AvatarConnectivityStack
                  ringSize={48}
                  touchSize={40}
                  placeholderIconSize={22}
                  dotColor={dotColor}
                  gpsIssue={gpsIssue}
                  gpsAuraDiameter={56}
                  avatarUri={avatarUri}
                  onPress={() => router.push('/profile')}
                  textSecondary={C.textSecondary}
                  cardSurface={C.cardWhite}
                  gpsRing={C.gpsAura.ring}
                  gpsShadow={C.gpsAura.shadow}
                />
              </View>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: C.cardWhite }]}>
      <View style={[styles.container, { borderBottomColor: C.border, height: 64 }]}>
        {/* Esquerda: logo fixo — não participa do “centro” absoluto para não ser tapado pelo seletor */}
        <View style={{ flexShrink: 0, marginRight: 8 }}>
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 100, height: 32 }}
            resizeMode="contain"
          />
        </View>

        {/* Centro: só o espaço entre logo e avatar (o seletor já não invade o logo) */}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="box-none"
        >
          {(segments.length <= 1 || segments[1] === 'index') && renderBadge()}
        </View>

        {/* Direita: avatar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
          <AvatarConnectivityStack
            ringSize={50}
            touchSize={44}
            placeholderIconSize={22}
            dotColor={dotColor}
            gpsIssue={gpsIssue}
            gpsAuraDiameter={58}
            avatarUri={avatarUri}
            onPress={() => router.push('/profile')}
            textSecondary={C.textSecondary}
            cardSurface={C.cardWhite}
            gpsRing={C.gpsAura.ring}
            gpsShadow={C.gpsAura.shadow}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {},
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileAvatar: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 40,
  },
  searchButton: {
    padding: 4,
  },
  dot: {
    display: 'none',
  },
  dotRing: {
    display: 'none',
  },
});
