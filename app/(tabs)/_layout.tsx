import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ColorPalette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { NotificationService } from '../../src/services/notifications';
import { useAuth } from '../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatService } from '../../src/services/chat';
import { FloatingRadialMenu } from '../../src/components/FloatingRadialMenu';
import { useAppContext } from '../../src/context/AppContext';

/**
 * BRSPARK MINIMALIST NAVIGATION
 * Displaying: Home, Browse, Chat, Alerts + Action Button
 */

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { mode } = useAppContext();
  const { colors: C } = useTheme();
  const navStyles = useMemo(() => createNavStyles(C), [C]);

  // Strictly show only these 4 screens before the "+" button
  const ALLOWED_TABS = ['index', 'agenda', 'chat', 'notifications'];
  
  const visibleRoutes = state.routes.filter((route: any) => 
    ALLOWED_TABS.includes(route.name)
  );

  const currentRouteName = state.routes[state.index]?.name;
  if (currentRouteName === 'agenda') {
    return null;
  }

  return (
    <View style={navStyles.container}>
      <View style={[navStyles.inner, { bottom: insets.bottom + 16 }]}>
        <View style={[navStyles.pill, mode === 'PROVIDER' && { marginRight: 0 }]}>
          {visibleRoutes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === state.routes.indexOf(route);
            
            // Map names to correct labels if title is not set or custom
            let label = options.title || route.name;
            if (route.name === 'index') label = t('tabs.home');
            if (route.name === 'agenda') label = t('tabs.agenda', { defaultValue: 'Agenda' });
            if (route.name === 'notifications') label = t('tabs.notifications');
            if (route.name === 'chat') label = t('tabs.chat');

            return (
              <TouchableOpacity
                key={route.key}
                onPress={() => navigation.navigate(route.name)}
                style={[navStyles.tabItem, isFocused && navStyles.tabFocused]}
                activeOpacity={0.7}
              >
                {options.tabBarIcon && options.tabBarIcon({ 
                  focused: isFocused, 
                  color: isFocused ? C.accent : C.textSecondary, 
                  size: 22 
                })}
                <Text style={{ 
                  fontSize: 10, 
                  fontWeight: '800', 
                  color: isFocused ? C.accent : C.textSecondary, 
                  marginTop: 2 
                }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <FloatingRadialMenu />
      </View>
    </View>
  );
}

function createNavStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
    inner: { flexDirection: 'row', alignItems: 'center', width: '92%', justifyContent: 'center' },
    pill: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: C.cardWhite,
      borderRadius: 40,
      padding: 6,
      marginRight: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 1,
      borderColor: C.divider,
    },
    tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 32 },
    tabFocused: { backgroundColor: C.surfaceLow },
  });
}

export default function TabLayout() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const [unread, setUnread] = useState(NotificationService.getUnreadCount());
  const [unreadChat, setUnreadChat] = useState(0);
  // Tracks previous unread counts per room to detect new messages
  const prevRoomCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    const unsub = NotificationService.subscribe(() => {
      setUnread(NotificationService.getUnreadCount());
    });
    
    // Poll chat unread count + fire push on new messages
    const fetchChatUnread = async () => {
      try {
        const rooms = await ChatService.getRooms();
        const totalUnread = rooms.reduce((acc, r) => acc + (r.unreadCount || 0), 0);
        setUnreadChat(totalUnread);

        // Fire push ONLY for rooms that gained new messages since last poll
        const prev = prevRoomCounts.current;
        const isFirstPoll = Object.keys(prev).length === 0;

        if (!isFirstPoll) {
          for (const room of rooms) {
            const prevCount = prev[room.id] ?? 0;
            const currCount = room.unreadCount ?? 0;
            if (currCount > prevCount) {
              // New messages in this room — fire push only (no alert entry)
              await NotificationService.sendChatPush(room.name, currCount - prevCount);
            }
          }
        }

        // Update prev counts
        const updated: Record<string, number> = {};
        rooms.forEach(r => { updated[r.id] = r.unreadCount ?? 0; });
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
        },
      }}>

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
                <View style={{
                  position: 'absolute', top: -4, right: -6,
                  backgroundColor: C.destructive,
                  minWidth: 16, height: 16, borderRadius: 8,
                  justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 3,
                  borderWidth: 1.5, borderColor: C.cardWhite,
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{unreadChat > 9 ? '9+' : unreadChat}</Text>
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
                <View style={{
                  position: 'absolute', top: -4, right: -6,
                  backgroundColor: C.destructive,
                  minWidth: 16, height: 16, borderRadius: 8,
                  justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 3,
                  borderWidth: 1.5, borderColor: C.cardWhite,
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      {/* Hidden Screens */}
      <Tabs.Screen name="costs"      options={{ href: null }} />
      <Tabs.Screen name="stock"      options={{ href: null }} />
      <Tabs.Screen name="services"   options={{ href: null }} />
      <Tabs.Screen name="orders"     options={{ href: null }} />
      <Tabs.Screen name="calendar"   options={{ href: null }} />
      <Tabs.Screen name="assets"     options={{ href: null }} />
      <Tabs.Screen name="scanner"    options={{ href: null }} />
      <Tabs.Screen name="documents"  options={{ href: null }} />
      <Tabs.Screen name="media"      options={{ href: null }} />
    </Tabs>
  );
}
