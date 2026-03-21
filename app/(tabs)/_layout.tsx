import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { NotificationService } from '../../src/services/notifications';

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
          fontWeight: '600',
          paddingBottom: 4,
        },
        headerShown: false,
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color }) => <Ionicons name="grid" size={24} color={color} />,
        }}
      />

      <Tabs.Screen
        name="assets"
        options={{
          title: 'Ativos',
          tabBarIcon: ({ color }) => <Ionicons name="card" size={24} color={color} />,
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'Mensagens',
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={24} color={color} />,
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Avisos',
          tabBarIcon: ({ color }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons name="notifications" size={24} color={color} />
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

      <Tabs.Screen
        name="scanner"
        options={{ href: null }}
      />

      {/* Tabs ocultas */}
      <Tabs.Screen name="calendar"   options={{ href: null }} />
      <Tabs.Screen name="documents"  options={{ href: null }} />
      <Tabs.Screen name="profile"    options={{ href: null }} />

      <Tabs.Screen
        name="family"
        options={{
          title: 'Família',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'} size={24} color={focused ? '#D97706' : color} />
            </View>
          ),
          tabBarActiveTintColor: '#D97706',
        }}
      />
    </Tabs>
  );
}
