import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { NotificationService } from '../../src/services/notifications';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatService } from '../../src/services/chat';
import { FloatingRadialMenu } from '../../src/components/FloatingRadialMenu';

/**
 * Barra inferior em largura total (referência: iFood) — ícone acima, rótulo abaixo;
 * aba ativa em `slate`, inativas em cinza secundário; última coluna abre ações rápidas (+).
 */

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const activeTint = C.slate;
  const inactiveTint = C.textSecondary;
  const navStyles = useMemo(() => createNavStyles(), []);

  const ALLOWED_TABS = ['index', 'agenda', 'chat', 'notifications'];

  const visibleRoutes = state.routes.filter((route: any) => ALLOWED_TABS.includes(route.name));

  return (
    <View
      style={[
        navStyles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 8),
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
          if (route.name === 'notifications') label = t('tabs.notifications');
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
              {options.tabBarIcon &&
                options.tabBarIcon({
                  focused: isFocused,
                  color: tint,
                  size: 24,
                })}
              <Text style={[navStyles.tabLabel, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
      paddingTop: 6,
      minHeight: 52,
    },
    tabBtn: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    tabLabel: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 4,
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

export default function TabLayout() {
  const { colors: C } = useTheme();
  const [unread, setUnread] = useState(NotificationService.getUnreadCount());
  const [unreadChat, setUnreadChat] = useState(0);
  const prevRoomCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    const unsub = NotificationService.subscribe(() => {
      setUnread(NotificationService.getUnreadCount());
    });

    const fetchChatUnread = async () => {
      try {
        const rooms = await ChatService.getRooms();
        const totalUnread = rooms.reduce((acc, r) => acc + (r.unreadCount || 0), 0);
        setUnreadChat(totalUnread);

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
    fetchChatUnread();
    const interval = setInterval(fetchChatUnread, 5000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
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
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={24} color={color} />
              {unreadChat > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
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
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={24} color={color} />
              {unread > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
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
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      <Tabs.Screen name="costs" options={{ href: null }} />
      <Tabs.Screen name="stock" options={{ href: null }} />
      <Tabs.Screen name="services" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="assets" options={{ href: null }} />
      <Tabs.Screen name="scanner" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="media" options={{ href: null }} />
    </Tabs>
  );
}
