import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  AppState,
  type AppStateStatus,
  DeviceEventEmitter,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '../theme/ThemeContext';
import { NotificationService } from '../services/notifications';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatService } from '../services/chat';
import { countGestorUnreadAcrossOpsThreads } from '../services/executionOpsChat';
import {
  FloatingRadialMenu,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INSETS_BOTTOM_MIN,
  TAB_BAR_ROW_MIN_HEIGHT,
  TAB_BAR_ROW_PADDING_TOP,
} from '../components/FloatingRadialMenu';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import { computeJourneyUiState, type WorkTimeJourneyPhase } from '../lib/workTimeJourney';
import { getWorkTimeOutboxForDisplay } from '../services/workTimePunchOutbox';
import { fetchWorkTimeMe, fetchWorkTimePunchesWithLocalFallback } from '../services/workTimeService';
import { readWorkTimeMeCacheForUser, writeWorkTimeMeCache } from '../services/workTimeMeCache';
import { mergePendingWithServerPunches } from '../services/workTimePunchesCache';
import { pushWorkTimePunchOutbox } from '../services/workTimePunchOutbox';
import { emitWorkTimeJourneyChanged, WORK_TIME_JOURNEY_CHANGED } from '../lib/workTimeJourneyEvents';
import { CHAT_UNREAD_CHANGED_EVENT } from '../lib/chatUnreadEvents';
import { userHasCapability } from '../services/auth';

/** Destaque do ícone de ponto no menu — jornada ativa (vermelho) / em intervalo (amarelo). */
const WORK_TIME_TAB_RED = '#DC2626';
const WORK_TIME_TAB_YELLOW = '#CA8A04';

/** Aura só quando há jornada «em curso» (vermelho) ou intervalo (amarelo). */
function workTimeJourneyAuraStyle(phase: 'in_work' | 'on_break'): {
  ring: string;
  glow: string;
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
  borderW: number;
} {
  if (phase === 'on_break') {
    return {
      ring: `${WORK_TIME_TAB_YELLOW}30`,
      glow: WORK_TIME_TAB_YELLOW,
      shadowOpacity: 0.55,
      shadowRadius: 12,
      elevation: 8,
      borderW: 1.5,
    };
  }
  return {
    ring: `${WORK_TIME_TAB_RED}38`,
    glow: WORK_TIME_TAB_RED,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
    borderW: 1.5,
  };
}

/**
 * Barra inferior em largura total (referência: iFood) — ícone acima, rótulo abaixo;
 * aba ativa em `slate`, inativas em cinza secundário; última coluna abre ações rápidas (+).
 */

export type TabBarPersona = 'client' | 'provider';

function CustomTabBar({
  state,
  descriptors,
  navigation,
  chatUnreadTotal = 0,
  tabBarVariant = 'client' as TabBarPersona,
}: any) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { userRole, user } = useAuth();
  const { mode } = useAppContext();
  const canOpenProviderOsSearch = userHasCapability(user, 'mobile.provider.osSearch');
  const canAccessWorkTime = userHasCapability(user, 'mobile.workTime.access');
  const [showWorkTimeTab, setShowWorkTimeTab] = useState(false);
  /** Tenant BR + utilizador em PJ: rótulo do separador «Registro» em pt-BR. */
  const [workTimeTabBrazilPj, setWorkTimeTabBrazilPj] = useState(false);
  const [workTimeJourneyPhase, setWorkTimeJourneyPhase] = useState<WorkTimeJourneyPhase>('idle_out');
  const lastWorkTimeTabFetchRef = useRef(0);
  const navStyles = useMemo(() => createNavStyles(), []);

  const refreshWorkTimeTab = useCallback(async () => {
    if (tabBarVariant === 'client') {
      setShowWorkTimeTab(false);
      setWorkTimeTabBrazilPj(false);
      setWorkTimeJourneyPhase('idle_out');
      return;
    }
    if (!user?.id || String(user.role || '').toUpperCase() === 'USER') {
      setShowWorkTimeTab(false);
      setWorkTimeTabBrazilPj(false);
      setWorkTimeJourneyPhase('idle_out');
      return;
    }
    const session = { id: user.id, tenantId: user.tenantId };
    try {
      try {
        try {
          await pushWorkTimePunchOutbox();
        } catch (pushErr) {
          console.warn('[TabBar] pushWorkTimePunchOutbox:', pushErr);
        }
      let d: Awaited<ReturnType<typeof fetchWorkTimeMe>> | null = null;
      let meSource: 'network_ok' | 'network_err' | 'network_throw' | 'cache' | 'none' = 'none';
      try {
        d = await fetchWorkTimeMe();
        if (d && d.ok) meSource = 'network_ok';
        else if (d) meSource = 'network_err';
      } catch {
        d = null;
        meSource = 'network_throw';
      }
      if (!d || !d.ok) {
        let diskMe: Awaited<ReturnType<typeof readWorkTimeMeCacheForUser>> = null;
        try {
          diskMe = await readWorkTimeMeCacheForUser(session);
        } catch {
          diskMe = null;
        }
        if (diskMe?.ok) {
          d = diskMe;
          meSource = 'cache';
        }
      }
      const show = !!(d && d.ok && d.showWorkTimeInApp);
      if (meSource === 'network_ok' && d && d.ok) {
        try {
          await writeWorkTimeMeCache(d);
        } catch {
          /* cache best-effort */
        }
      }
      setShowWorkTimeTab(show);
      setWorkTimeTabBrazilPj(!!(show && d && d.ok && d.workTimeBrazilRegime === 'PJ'));
      if (!show || mode !== 'PROVIDER') {
        setWorkTimeJourneyPhase('idle_out');
        return;
      }
      /** Batidas/outbox não devem esconder o separador se `/me` já autorizou o ponto. */
      try {
        const rows = await fetchWorkTimePunchesWithLocalFallback(session, 31);
        const pending = await getWorkTimeOutboxForDisplay();
        const merged = mergePendingWithServerPunches(pending, rows);
        setWorkTimeJourneyPhase(computeJourneyUiState(merged).phase);
      } catch (journeyErr) {
        console.warn('[TabBar] refreshWorkTimeTab (batidas/aura):', journeyErr);
        setWorkTimeJourneyPhase('idle_out');
      }
    } catch (outerErr) {
      let cached: Awaited<ReturnType<typeof readWorkTimeMeCacheForUser>> = null;
      try {
        cached = await readWorkTimeMeCacheForUser(session);
      } catch {
        cached = null;
      }
      if (cached?.ok && cached.showWorkTimeInApp && mode === 'PROVIDER') {
        setShowWorkTimeTab(true);
        setWorkTimeTabBrazilPj(cached.workTimeBrazilRegime === 'PJ');
        try {
          await pushWorkTimePunchOutbox();
          const rows = await fetchWorkTimePunchesWithLocalFallback(session, 31);
          const pending = await getWorkTimeOutboxForDisplay();
          setWorkTimeJourneyPhase(computeJourneyUiState(mergePendingWithServerPunches(pending, rows)).phase);
        } catch {
          try {
            const pending = await getWorkTimeOutboxForDisplay();
            const rows = await fetchWorkTimePunchesWithLocalFallback(session, 31);
            setWorkTimeJourneyPhase(computeJourneyUiState(mergePendingWithServerPunches(pending, rows)).phase);
          } catch {
            setWorkTimeJourneyPhase('idle_out');
          }
        }
        return;
      }
      setShowWorkTimeTab(false);
      setWorkTimeTabBrazilPj(false);
      setWorkTimeJourneyPhase('idle_out');
    }
    } catch (fatal) {
      console.warn('[TabBar] refreshWorkTimeTab (fatal):', fatal);
      setShowWorkTimeTab(false);
      setWorkTimeTabBrazilPj(false);
      setWorkTimeJourneyPhase('idle_out');
    }
  }, [user?.id, user?.role, user?.tenantId, mode, tabBarVariant]);

  useEffect(() => {
    void refreshWorkTimeTab().catch((e) => console.warn('[TabBar] refreshWorkTimeTab (pathname):', e));
  }, [refreshWorkTimeTab, pathname]);

  /** Fila de ponto / batidas mudam fora desta barra (sync, outbox) — atualiza aura de imediato. */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WORK_TIME_JOURNEY_CHANGED, () => {
      void refreshWorkTimeTab().catch((e) => console.warn('[TabBar] refreshWorkTimeTab (journey):', e));
    });
    return () => sub.remove();
  }, [refreshWorkTimeTab]);

  /** Enquanto o módulo de ponto está visível: envia fila + reavalia jornada (qualquer separador). */
  useEffect(() => {
    if (tabBarVariant === 'client' || !showWorkTimeTab || mode !== 'PROVIDER') return;
    const t = setInterval(
      () => void refreshWorkTimeTab().catch((e) => console.warn('[TabBar] refreshWorkTimeTab (intervalo):', e)),
      6_000
    );
    return () => clearInterval(t);
  }, [showWorkTimeTab, mode, refreshWorkTimeTab, tabBarVariant]);

  /** Ao recuperar rede, tenta enviar batidas pendentes e atualizar aura. */
  useEffect(() => {
    if (tabBarVariant === 'client' || mode !== 'PROVIDER') return;
    const sub = Network.addNetworkStateListener((s) => {
      if (s?.isConnected !== true) return;
      void (async () => {
        try {
          await pushWorkTimePunchOutbox();
          emitWorkTimeJourneyChanged();
        } catch (e) {
          console.warn('[TabBar] Envio da fila de ponto após rede:', e);
        }
      })();
    });
    return () => sub.remove();
  }, [mode, tabBarVariant]);

  useEffect(() => {
    const onState = (s: AppStateStatus) => {
      if (s !== 'active' || tabBarVariant === 'client') return;
      if (!user?.id || String(user.role || '').toUpperCase() === 'USER') return;
      const now = Date.now();
      if (now - lastWorkTimeTabFetchRef.current < 45_000) return;
      lastWorkTimeTabFetchRef.current = now;
      void refreshWorkTimeTab().catch((e) => console.warn('[TabBar] refreshWorkTimeTab (appState):', e));
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [user?.id, user?.role, refreshWorkTimeTab, tabBarVariant]);

  const currentName = state.routes[state.index]?.name as string | undefined;
  const hideTabBarLandscapeAgenda = width > height && currentName === 'agenda';
  if (hideTabBarLandscapeAgenda) {
    return <View pointerEvents="none" collapsable={false} style={{ height: 0, width: '100%' }} />;
  }

  const activeTint = C.slate;
  const inactiveTint = C.textSecondary;

  const allowedTabOrder =
    tabBarVariant === 'client' ? (['index', 'agenda', 'assets', 'chat'] as const) : (['index', 'agenda', 'chat'] as const);

  const visibleRoutes = state.routes
    .filter((route: any) => (allowedTabOrder as readonly string[]).includes(route.name))
    .sort(
      (a: any, b: any) =>
        (allowedTabOrder as readonly string[]).indexOf(a.name) - (allowedTabOrder as readonly string[]).indexOf(b.name),
    );

  return (
    <View
      style={[
        navStyles.bar,
        {
          paddingBottom: Math.max(insets.bottom, TAB_BAR_INSETS_BOTTOM_MIN),
          backgroundColor: C.cardWhite,
          borderTopColor: C.border,
        },
      ]}
    >
      <View style={navStyles.row}>
        {visibleRoutes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === state.routes.indexOf(route);

          let label = options.title || route.name;
          if (route.name === 'index') label = t('tabs.home');
          if (route.name === 'agenda') label = t('tabs.agenda');
          if (route.name === 'assets') label = t('tabs.assets');
          if (route.name === 'chat') label = t('tabs.chat');

          const tint = isFocused ? activeTint : inactiveTint;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={navStyles.tabBtn}
              activeOpacity={0.65}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
            >
              {route.name === 'chat' ? (
                <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                  {options.tabBarIcon &&
                    options.tabBarIcon({
                      focused: isFocused,
                      color: tint,
                      size: TAB_BAR_ICON_SIZE,
                    })}
                  {chatUnreadTotal > 0 ? (
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
                        {chatUnreadTotal > 99 ? '99+' : String(chatUnreadTotal)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                options.tabBarIcon &&
                options.tabBarIcon({
                  focused: isFocused,
                  color: tint,
                  size: TAB_BAR_ICON_SIZE,
                })
              )}
              <Text style={[navStyles.tabLabel, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {tabBarVariant === 'provider' && userRole === 'TECHNICIAN' && canOpenProviderOsSearch && (
          <TouchableOpacity
            onPress={() => router.push('/(provider)/(tabs)/provider-os-search-tab' as any)}
            style={navStyles.tabBtn}
            activeOpacity={0.65}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.providerOsSearch')}
          >
            {(() => {
              const providerOsSearchFocused =
                pathname.includes('provider-os-search-tab') || pathname === '/provider-os-search';
              const providerOsSearchTint = providerOsSearchFocused ? activeTint : inactiveTint;
              return (
                <>
                  <Ionicons
                    name={providerOsSearchFocused ? 'search' : 'search-outline'}
                    size={TAB_BAR_ICON_SIZE}
                    color={providerOsSearchTint}
                  />
                  <Text style={[navStyles.tabLabel, { color: providerOsSearchTint }]} numberOfLines={1}>
                    {t('tabs.providerOsSearch')}
                  </Text>
                </>
              );
            })()}
          </TouchableOpacity>
        )}
        {tabBarVariant === 'provider' && showWorkTimeTab && canAccessWorkTime && mode === 'PROVIDER' && (() => {
          const onWorkTimeRoute = pathname === '/work-time' || pathname.endsWith('/work-time');
          const highlightJourney = workTimeJourneyPhase === 'in_work' || workTimeJourneyPhase === 'on_break';

          let iconColor: string;
          let iconName: 'time' | 'time-outline';
          if (workTimeJourneyPhase === 'on_break') {
            iconColor = WORK_TIME_TAB_YELLOW;
            iconName = 'time';
          } else if (workTimeJourneyPhase === 'in_work') {
            iconColor = WORK_TIME_TAB_RED;
            iconName = 'time';
          } else {
            iconName = onWorkTimeRoute ? 'time' : 'time-outline';
            iconColor = onWorkTimeRoute ? activeTint : inactiveTint;
          }
          const labelColor = onWorkTimeRoute ? activeTint : inactiveTint;
          const aura = highlightJourney
            ? workTimeJourneyAuraStyle(workTimeJourneyPhase as 'in_work' | 'on_break')
            : null;

          const workTimeTabLabel = workTimeTabBrazilPj ? t('tabs.workTimeBrPj') : t('tabs.workTime');
          return (
            <TouchableOpacity
              onPress={() => router.push('/work-time' as any)}
              style={navStyles.tabBtn}
              activeOpacity={0.65}
              accessibilityRole="button"
              accessibilityLabel={workTimeTabLabel}
            >
              <View style={{ alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
                {highlightJourney && aura ? (
                  <View
                    style={[
                      navStyles.workTimeAuraWrap,
                      {
                        backgroundColor: aura.ring,
                        borderColor: `${aura.glow}66`,
                        borderWidth: aura.borderW,
                        shadowColor: aura.glow,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: aura.shadowOpacity,
                        shadowRadius: aura.shadowRadius,
                        elevation: aura.elevation,
                      },
                    ]}
                  >
                    <Ionicons name={iconName} size={TAB_BAR_ICON_SIZE} color={iconColor} />
                  </View>
                ) : (
                  <Ionicons name={iconName} size={TAB_BAR_ICON_SIZE} color={iconColor} />
                )}
                <Text style={[navStyles.tabLabel, { color: labelColor }]} numberOfLines={1}>
                  {workTimeTabLabel}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}
        <View style={navStyles.moreSlot}>
          <FloatingRadialMenu tabBarSlot />
        </View>
      </View>
    </View>
  );
}

function createNavStyles() {
  return StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingTop: TAB_BAR_ROW_PADDING_TOP,
      minHeight: TAB_BAR_ROW_MIN_HEIGHT,
    },
    tabBtn: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
    },
    /** Anel luminoso atrás do ícone de ponto (jornada / rota ativa). */
    workTimeAuraWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 1,
    },
    tabLabel: {
      fontSize: 10,
      fontWeight: '600',
      marginTop: 2,
      textAlign: 'center',
    },
    moreSlot: {
      flex: 1,
      minWidth: 0,
      alignItems: 'stretch',
      justifyContent: 'flex-end',
    },
  });
}

export function MainTabsLayout({ tabBarVariant }: { tabBarVariant: TabBarPersona }) {
  const [unreadChat, setUnreadChat] = useState(0);
  const prevRoomCounts = useRef<Record<string, number>>({});
  const lastOpsUnreadPollAtRef = useRef<number | null>(null);
  const lastOpsUnreadValueRef = useRef(0);

  useEffect(() => {
    const OPS_UNREAD_POLL_MS = 22_000;
    const fetchChatUnread = async (options?: { forceOpsRefresh?: boolean }) => {
      try {
        const rooms = await ChatService.getRooms();
        const pendingCorp = rooms.filter((r) => (r.unreadCount ?? 0) > 0).length;

        const now = Date.now();
        let pendingOps = 0;
        if (tabBarVariant === 'provider') {
          const shouldRefreshOps =
            options?.forceOpsRefresh === true ||
            lastOpsUnreadPollAtRef.current == null ||
            now - lastOpsUnreadPollAtRef.current >= OPS_UNREAD_POLL_MS;
          pendingOps = lastOpsUnreadValueRef.current;
          if (shouldRefreshOps) {
            lastOpsUnreadPollAtRef.current = now;
            try {
              pendingOps = await countGestorUnreadAcrossOpsThreads();
              lastOpsUnreadValueRef.current = pendingOps;
            } catch {
              pendingOps = lastOpsUnreadValueRef.current;
            }
          }
        }

        setUnreadChat(pendingCorp + pendingOps);

        const prev = prevRoomCounts.current;
        const isFirstPoll = Object.keys(prev).length === 0;

        if (!isFirstPoll) {
          for (const room of rooms) {
            const prevCount = prev[room.id] ?? 0;
            const currCount = room.unreadCount ?? 0;
            if (currCount > prevCount) {
              await NotificationService.sendChatPush(room.name, currCount - prevCount);
            }
          }
        }

        const updated: Record<string, number> = {};
        rooms.forEach((r) => {
          updated[r.id] = r.unreadCount ?? 0;
        });
        prevRoomCounts.current = updated;
      } catch (e) {}
    };
    void fetchChatUnread().catch(() => {});
    const unreadChangedSub = DeviceEventEmitter.addListener(CHAT_UNREAD_CHANGED_EVENT, () => {
      void fetchChatUnread({ forceOpsRefresh: true }).catch(() => {});
    });
    const interval = setInterval(() => {
      void fetchChatUnread().catch(() => {});
    }, 5000);

    return () => {
      unreadChangedSub.remove();
      clearInterval(interval);
    };
  }, [tabBarVariant]);

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar {...props} chatUnreadTotal={unreadChat} tabBarVariant={tabBarVariant} />
      )}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          elevation: 100,
          zIndex: 100,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          height: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={TAB_BAR_ICON_SIZE} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={TAB_BAR_ICON_SIZE} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={TAB_BAR_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen name="notifications" options={{ href: null, title: 'Alertas' }} />
      <Tabs.Screen name="provider-os-search-tab" options={{ href: null }} />

      <Tabs.Screen name="costs" options={{ href: null }} />
      <Tabs.Screen name="stock" options={{ href: null }} />
      <Tabs.Screen name="services" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen
        name="assets"
        options={{
          href: null,
          title: 'Ativos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'file-tray-stacked' : 'file-tray-stacked-outline'} size={TAB_BAR_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="scanner" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="media" options={{ href: null }} />
    </Tabs>
  );
}

export default function ClientMainTabs() {
  return <MainTabsLayout tabBarVariant="client" />;
}
