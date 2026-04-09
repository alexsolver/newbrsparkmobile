import '../src/tasks/routeTrackingTask';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, getDatabaseOwner, clearLocalDatabase } from '../src/database';
import { ApiService } from '../src/services/api';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { isTechnicianProfileActive } from '../src/services/auth';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { I18nextProvider } from 'react-i18next';
import i18n from '../src/i18n';
import { loadUnitPreference, loadNumberFormatPreference } from '../src/i18n/formatters';
import { Header } from '../src/components/Header';
import { AppProvider } from '../src/context/AppContext';
import { startAppStateTelemetryBridge } from '../src/services/appStateTelemetryBridge';
import { pollStaleGpsReminders } from '../src/services/syncService';
import { NotificationService } from '../src/services/notifications';
import { AutomaticTimeGate } from '../src/components/AutomaticTimeGate';
import { GpsIntegrityGate } from '../src/components/GpsIntegrityGate';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { colors: C } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup  = segments[0] === 'auth';
    const inTabs       = segments[0] === '(tabs)';
    const inProfile    = segments[0] === 'profile';
    const inOnboarding = segments[0] === 'auth' && (segments as string[])[1] === 'onboarding';
    const isRoot       = !segments || !segments.length || !segments[0];

    if (!user && !isRoot && !inAuthGroup && !inTabs && !inProfile) {
      router.replace('/auth/login' as any);
      return;
    }

    if (user && inAuthGroup && !inOnboarding) {
      // Logged-in user trying to access auth — check if onboarding is needed first
      AsyncStorage.getItem('@brspark_onboarding_done').then(done => {
        if (!done) {
          router.replace('/auth/onboarding' as any);
        } else {
          router.replace('/(tabs)' as any);
        }
      });
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.cardWhite }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

function AppInitializer() {
  const { user, loading } = useAuth();
  
  useEffect(() => {
    if (loading) return;
    
    const init = async () => {
      try {
        initDatabase();
        
        // ─── Session & Isolation Audit ───
        const ISOLATION_VERSION = 'v2_strict';
        const currentVersion = await AsyncStorage.getItem('@brspark:isolation_v');

        if (currentVersion !== ISOLATION_VERSION) {
          console.warn(`[BOOT] 🛡️ Upgrading Isolation to ${ISOLATION_VERSION}. Purging local data...`);
          clearLocalDatabase();
          await AsyncStorage.clear(); // Nuclear option for old keys
          await AsyncStorage.setItem('@brspark:isolation_v', ISOLATION_VERSION);
          // Reinforcement: keep user session if possible, but force re-login if needed.
          // Since we cleared all keys, user will have to login again. This is SAFER.
        }

        // If DB has assets but they don't belong to current user, PURGE.
        if (user) {
          const currentOwner = getDatabaseOwner();
          if (currentOwner && currentOwner !== user.email) {
            console.warn(`[BOOT] ⚠️ Session Mismatch! DB: ${currentOwner} vs User: ${user.email}. Purging...`);
            clearLocalDatabase();
          }
        } else {
           // If no user, DB must be empty
           clearLocalDatabase();
        }

        await ApiService.sync(user?.email || '');
        await loadUnitPreference();
        await loadNumberFormatPreference();
      } catch (err) {
        console.error('[BOOT] Initialization error:', err);
      }
    };
    
    init();

    // Sync every 5 minutes
    const intervalId = setInterval(() => { 
      ApiService.sync(user?.email || '').catch(e => console.warn('[SYNC] Interval sync failed:', e));
    }, 300000);
    
    return () => clearInterval(intervalId);
  }, [user, loading]);

  // Registre token Expo Push ao iniciar sessão (antes só ao abrir o separador Notificações)
  useEffect(() => {
    if (loading || !user) return;
    NotificationService.registerForPushNotificationsAsync().catch(() => {});
  }, [user?.id, loading]);

  useEffect(() => {
    if (loading || !user) return;
    const isTech = isTechnicianProfileActive(user);
    if (!isTech) return;
    const stopBridge = startAppStateTelemetryBridge();
    const staleId = setInterval(() => {
      pollStaleGpsReminders().catch(() => {});
    }, 90 * 1000);
    return () => {
      stopBridge();
      clearInterval(staleId);
    };
  }, [user, loading]);

  return null;
}

function MainLayout() {
  const segments = useSegments();
  const inAuth = segments[0] === 'auth';

  return (
    <RouteGuard>
      <AppInitializer />
      {!inAuth && <Header />}
      <Stack screenOptions={{ 
        headerShown: false,
        gestureEnabled: true, 
        animation: 'slide_from_right' 
      }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile" />
        <Stack.Screen name="+not-found" options={{ headerShown: true }} />
      </Stack>
    </RouteGuard>
  );
}

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <AutomaticTimeGate>
          <GpsIntegrityGate>
            <AuthProvider>
              <AppProvider>
                <MainLayout />
              </AppProvider>
            </AuthProvider>
          </GpsIntegrityGate>
        </AutomaticTimeGate>
      </ThemeProvider>
    </I18nextProvider>
  );
}
