import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Text,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments, useLocalSearchParams, usePathname } from 'expo-router';
import { useAppContext, checkGuardBeforeBack } from '../context/AppContext';
import { getLocalAssets } from '../database';
import { Asset } from '../types/asset';
import { useAuth } from '../hooks/useAuth';
import { usePersona } from '../context/PersonaContext';
import { getPersonaTabHref } from '../navigation/personaRouting';
import { useResolvedAvatarUri } from '../hooks/useResolvedAvatarUri';
import { useConnectivity } from '../hooks/useConnectivity';
import { useGpsAuraIssue } from '../hooks/useGpsAuraIssue';
import { NotificationService } from '../services/notifications';
import { useTranslation } from 'react-i18next';
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

const TAB_ROOT_PATHS = new Set([
  'index',
  'agenda',
  'assets',
  'calendar',
  'chat',
  'costs',
  'documents',
  'media',
  'notifications',
  'orders',
  'provider-os-search-tab',
  'scanner',
  'services',
  'stock',
]);

export function Header({ showAssetTools = false, title, leftIcon, onLeftPress }: HeaderProps) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const pathname = usePathname() || '';
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const { colors: C, appDisplayName, resolvedLogoUrl } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { guardRef } = useAppContext();
  const { user } = useAuth();
  const { activePersona } = usePersona();
  /** Troca cliente ↔ prestador: Configurações; o cabeçalho só mostra o seletor (Serviços/Ativos) na persona cliente. */
  const avatarUri = useResolvedAvatarUri(user);
  const { isOnline } = useConnectivity();
  const gpsIssue = useGpsAuraIssue();
  /** Logo do tenant vem por URL; sem rede o RN pode deixar o `Image` vazio — voltamos ao PNG embutido. */
  const [headerLogoRemoteFailed, setHeaderLogoRemoteFailed] = useState(false);
  const [headerLogoRemoteLoaded, setHeaderLogoRemoteLoaded] = useState(false);
  useEffect(() => {
    setHeaderLogoRemoteFailed(false);
    setHeaderLogoRemoteLoaded(false);
  }, [resolvedLogoUrl]);
  useEffect(() => {
    if (isOnline === true) setHeaderLogoRemoteFailed(false);
    if (isOnline !== true) setHeaderLogoRemoteLoaded(false);
  }, [isOnline]);
  const canShowRemoteLogo = !!resolvedLogoUrl && isOnline === true && !headerLogoRemoteFailed;

  const [notifUnread, setNotifUnread] = useState(() =>
    NotificationService.getUnreadCount(activePersona)
  );

  useEffect(() => {
    setNotifUnread(NotificationService.getUnreadCount(activePersona));
  }, [activePersona]);

  useEffect(() => {
    const unsub = NotificationService.subscribe(() => {
      setNotifUnread(NotificationService.getUnreadCount(activePersona));
    });
    return unsub;
  }, [activePersona]);

  // Pulse animation for the online dot
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isOnline !== true) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [isOnline, pulse]);

  // Dot color: grey while first check, green online, red offline
  const dotColor =
    isOnline === null ? C.connectivity.checking : isOnline ? C.connectivity.online : C.connectivity.offline;

  const isAssetDetail = segments[0] === 'asset' && segments.length > 1 && segments[1] !== 'new';
  const isProfile = segments[0] === 'profile';
  const pStr = String(pathname || '');
  const isProviderOsSearch =
    segments[0] === 'provider-os-search' ||
    pathname === '/provider-os-search' ||
    pStr.includes('provider-os-search-tab') ||
    (segments as string[]).includes('provider-os-search-tab');
  /** Mesmo modelo que Busca de OS: faixa global + `ScreenSubheader` na stack (não usar `Header` com título). */
  const isStackWithGlobalAppBar =
    (segments[0] === 'stock' && segments[1] === 'mobile') ||
    segments[0] === 'finance' ||
    segments[0] === 'productivity' ||
    pathname.startsWith('/stock/mobile') ||
    pathname.startsWith('/finance/') ||
    pathname.startsWith('/productivity/');
  const firstPathSegment = String(pathname || '')
    .replace(/^\/+/, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
  const pathParts = String(pathname || '')
    .replace(/^\/+/, '')
    .split('/')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0 && p !== '(tabs)' && p !== '(client)' && p !== '(provider)');
  /**
   * `TAB_ROOT_PATHS` só deve equivaler à “raiz” da aba quando o path não tem sub-rota stack
   * (ex.: `/stock/mobile`, `/documents/new` trazem `Header` próprio — evitar cabeçalho duplicado).
   */
  const isShallowTabPathGuess =
    TAB_ROOT_PATHS.has(firstPathSegment) && pathParts.length <= 1;
  /** Rotas em que o cabeçalho global aparece — `useSegments` por vezes omite o grupo `(tabs)` no arranque. */
  const isTabs =
    segments[0] === '(client)' ||
    segments[0] === '(provider)' ||
    segments[0] === '(tabs)' ||
    pathname.startsWith('/(client)/') ||
    pathname.startsWith('/(provider)/') ||
    pathname.startsWith('/(tabs)') ||
    pathname === '/' ||
    pathname === '/index' ||
    isShallowTabPathGuess;

  /**
   * Rótulo de modo (SERVIÇOS / BENS no cliente, PRESTADOR no prestador) — raiz de cada aba, não em stacks
   * (ex. asset/123). O Início falha muito com: só `['(provider)','(tabs)']` em `segments` (falta `index` no 3.º
   * segmento) — por isso há fallback por `pathname` + `pathParts` (já filtra (client)/(provider)/(tabs)).
   */
  const inClientOrProviderPath = pStr.includes('(client)') || pStr.includes('(provider)');
  const isPersonaTabByPathname =
    inClientOrProviderPath &&
    pathParts.length <= 1 &&
    (pathParts.length === 0 || (pathParts[0] && TAB_ROOT_PATHS.has(String(pathParts[0]))));
  const segs = segments as string[];
  const atClientOrProvider = segs[0] === '(client)' || segs[0] === '(provider)';
  /** Aba "index" por vezes o Expo não inclui: sobra só `(client|provider)` + `(tabs)` */
  const isPersonaDefaultTabsSlot =
    atClientOrProvider && segs.length === 2 && segs[1] === '(tabs)';
  const isPersonaTopTabPathBySegments =
    atClientOrProvider &&
    (segs.length <= 1 ||
      isPersonaDefaultTabsSlot ||
      (segs.length === 2 && !!segs[1] && segs[1] !== '(tabs)' && TAB_ROOT_PATHS.has(String(segs[1]))) ||
      (segs.length === 3 && segs[1] === '(tabs)' && segs[2] && TAB_ROOT_PATHS.has(String(segs[2]))));
  const showModeSegmentBadge =
    isPersonaTopTabPathBySegments ||
    isPersonaTabByPathname ||
    isStackWithGlobalAppBar ||
    (activePersona === 'provider' && isProviderOsSearch);

  // O Header global (injetado no _layout.tsx) não recebe `title`.
  // Devemos escondê-lo completamente se não estivermos nas abas principais, no perfil ou no detalhe do ativo.
  if (!title && !isTabs && !isProfile && !isAssetDetail && !isProviderOsSearch && !isStackWithGlobalAppBar) {
    return null;
  }

  const asset = isAssetDetail && params.id ? getLocalAssets().find(a => a.id === params.id) : null;

  /** Largura máx. do rótulo de concha: logo, alertas e avatar. */
  const headerSideReserve = 32 + 108 + 104;
  const maxBadgeByScreen = Math.max(104, windowWidth - headerSideReserve);

  const segLabelStyle = {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.1,
    textAlign: 'center' as const,
  };

  /** Rótulo estático (não muda concha: quem muda é Perfil) — mesmo aspeto para Cliente e Prestador. */
  const renderPersonaModePill = (label: string, accent: string, accessibilityLabel: string) => {
    const w = Math.min(122, maxBadgeByScreen);
    return (
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: C.surfaceLow,
          borderRadius: radius.md,
          paddingHorizontal: 3,
          paddingVertical: 2,
          width: w,
          maxWidth: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="text"
      >
        <View
          style={{
            flex: 0,
            flexGrow: 0,
            minWidth: 0,
            minHeight: 32,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: radius.sm,
            paddingHorizontal: 12,
            paddingVertical: 1,
            backgroundColor: C.cardWhite,
            shadowColor: C.slate,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
            elevation: 1,
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="clip"
            style={[
              segLabelStyle,
              { fontWeight: fontWeight.black, color: accent },
            ]}
          >
            {label}
          </Text>
        </View>
      </View>
    );
  };

  const notifFocused = /(\(client\)|\(provider\))\/\(tabs\)\/notifications|\/(tabs)\/notifications/.test(
    String(pathname || '')
  );

  const renderAlertsHeaderButton = () => (
    <TouchableOpacity
      onPress={() => router.push(getPersonaTabHref(activePersona, 'notifications') as any)}
      accessibilityRole="button"
      accessibilityLabel={t('tabs.notifications')}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      activeOpacity={0.65}
    >
      <View style={{ position: 'relative' }}>
        <Ionicons
          name={notifFocused ? 'notifications' : 'notifications-outline'}
          size={24}
          color={notifFocused ? C.slate : C.textSecondary}
        />
        {notifUnread > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              backgroundColor: C.destructive,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 3,
              borderWidth: 1.5,
              borderColor: C.cardWhite,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>
              {notifUnread > 9 ? '9+' : notifUnread}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (title || isAssetDetail || isProfile) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{
          backgroundColor: C.cardWhite,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          zIndex: 30,
          elevation: 30,
        }}
      >
        <View
          style={{
            height: 64,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            gap: 8,
          }}
        >
          {/* Esquerda: ocupa o espaço restante; título com ellipsis para não empurrar sino/avatar */}
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={onLeftPress || (() => checkGuardBeforeBack(guardRef, () => router.back()))}
              style={{
                flexShrink: 0,
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

            <View style={{ width: 70, height: 22, marginLeft: 2, marginRight: 4, flexShrink: 0 }}>
              <Image
                source={require('../../assets/logo.png')}
                style={{ width: 70, height: 22 }}
                resizeMode="contain"
              />
              {canShowRemoteLogo ? (
                <Image
                  source={{ uri: resolvedLogoUrl! }}
                  style={{ position: 'absolute', left: 0, top: 0, width: 70, height: 22, opacity: headerLogoRemoteLoaded ? 1 : 0 }}
                  resizeMode="contain"
                  onLoad={() => setHeaderLogoRemoteLoaded(true)}
                  onError={() => setHeaderLogoRemoteFailed(true)}
                />
              ) : null}
            </View>

            {title ? (
              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.black,
                    color: C.slate,
                    letterSpacing: -0.5,
                  }}
                >
                  {title}
                </Text>
              </View>
            ) : isAssetDetail && asset ? (
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Image
                  source={{ uri: asset.imageUrl || 'https://via.placeholder.com/150' }}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.border, flexShrink: 0 }}
                />
                <Text
                  style={{ flex: 1, minWidth: 0, fontSize: fontSize.sm, fontWeight: fontWeight.black, color: C.slate }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {asset.title}
                </Text>
              </View>
            ) : isProfile ? (
              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ fontSize: fontSize.lg, fontWeight: fontWeight.black, color: C.slate, letterSpacing: -0.5 }}
                >
                  Configurações
                </Text>
              </View>
            ) : null}
          </View>

          {/* Direita: alertas + avatar (largura fixa, nunca comprimida) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!isProfile ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {renderAlertsHeaderButton()}
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
              <View style={{ width: 44 }} />
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: C.cardWhite, zIndex: 30, elevation: 30 }]}
    >
      <View style={[styles.container, { borderBottomColor: C.border, height: 64 }]}>
        {/* Esquerda: logo fixo — não participa do “centro” absoluto para não ser tapado pelo seletor */}
        <View style={{ flexShrink: 0, marginRight: 8 }}>
          <View style={{ width: 100, height: 32 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 100, height: 32 }}
              resizeMode="contain"
            />
            {canShowRemoteLogo ? (
              <Image
                source={{ uri: resolvedLogoUrl! }}
                style={{ position: 'absolute', left: 0, top: 0, width: 100, height: 32, opacity: headerLogoRemoteLoaded ? 1 : 0 }}
                resizeMode="contain"
                onLoad={() => setHeaderLogoRemoteLoaded(true)}
                onError={() => setHeaderLogoRemoteFailed(true)}
              />
            ) : null}
          </View>
          {!resolvedLogoUrl || !canShowRemoteLogo || !headerLogoRemoteLoaded ? null : (
            <Text
              numberOfLines={1}
              style={{ fontSize: 9, fontWeight: '800', color: C.textLight, marginTop: -2 }}
            >
              {appDisplayName}
            </Text>
          )}
        </View>

        {/* Centro: rótulo de concha (só na persona prestador) entre logo e avatar */}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="box-none"
        >
          {showModeSegmentBadge && activePersona === 'provider'
            ? renderPersonaModePill('PRESTADOR', MODE_SEGMENT_COLORS.PROVIDER, 'Prestador')
            : null}
        </View>

        {/* Direita: alertas + avatar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 4 }}>
          {renderAlertsHeaderButton()}
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
