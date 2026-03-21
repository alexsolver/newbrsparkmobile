import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { NotificationService } from '../../src/services/notifications';

/**
 * PADRÃO DE DESIGN BRSPARK (UX/UI GUIDELINES)
 * 1. Ícones Solid para estado FOCUSED, Outline para estado INATIVO.
 * 2. Tintura Principal: colors.primary (#1e293b).
 * 3. Menu centralizado em 4-5 itens essenciais para evitar confusão.
 */

export default function TabLayout() {
  const [unread, setUnread] = useState(NotificationService.getUnreadCount());

  useEffect(() => {
    const unsub = NotificationService.subscribe(() => {
      setUnread(NotificationService.getUnreadCount());
    });
    return unsub;
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.cardWhite,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingBottom: 4,
        },
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: 'Ativos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'cube' : 'cube-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="costs"
        options={{
          title: 'Custos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="stock"
        options={{
          title: 'Estoque',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'archive' : 'archive-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Avisos',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={24} color={color} />
              {unread > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -6,
                  backgroundColor: '#EF4444',
                  minWidth: 16, height: 16, borderRadius: 8,
                  justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 3,
                  borderWidth: 1.5, borderColor: colors.cardWhite,
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>
                    {unread > 9 ? '9+' : unread}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      {/* Telas auxiliares (ocultas da navegação principal) */}
      <Tabs.Screen name="assets"     options={{ href: null }} />
      <Tabs.Screen name="scanner"    options={{ href: null }} />
      <Tabs.Screen name="documents"  options={{ href: null }} />
      <Tabs.Screen name="profile"    options={{ href: null }} />
      <Tabs.Screen name="family"     options={{ href: null }} />
    </Tabs>
  );
}
