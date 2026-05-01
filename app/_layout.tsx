import '../src/tasks/routeTrackingTask';
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { useTheme } from '../src/theme/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, getDatabaseOwner, clearLocalDatabase } from '../src/database';
import { ApiService } from '../src/services/api';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { isTechnicianProfileActive } from '../src/services/auth';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { I18nextProvider } from 'react-i18next';
import i18n from '../src/i18n';
import { loadUnitPreference, loadNumberFormatPreference } from '../src/i18n/formatters';
import { Header } from '../src/components/Header';
import { AppProvider } from '../src/context/AppContext';
import { PersonaProvider, usePersona } from '../src/context/PersonaContext';
import { getPersonaHomeHref } from '../src/navigation/personaRouting';
import { isProviderOnboardingComplete } from '../src/lib/onboardingPrefs';
import { startAppStateTelemetryBridge } from '../src/services/appStateTelemetryBridge';
import { pollStaleGpsReminders } from '../src/services/syncService';
import { NotificationService, preparePushNotificationInfrastructure } from '../src/services/notifications';
import { PushNotificationResponseBridge } from '../src/components/PushNotificationResponseBridge';
import { TransitMapExpandedProvider } from '../src/context/TransitMapExpandedContext';
import { AutomaticTimeGate } from '../src/components/AutomaticTimeGate';
import { GpsIntegrityGate } from '../src/components/GpsIntegrityGate';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { VECTOR_ICON_FONT_MAP } from '../src/lib/vectorIconFonts';
import { fetchGpsCapturePolicyMe, resetGpsCapturePolicyToDefaults } from '../src/services/gpsCapturePolicyStore';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { colors: C } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  /** Durante transições do stack `auth/*`, `segments[1]` pode ainda não existir — usar pathname evita redirecionar à força. */
  const pathname = usePathname() || '';
  const { activePersona } = usePersona();
  const globalParams = useGlobalSearchParams<{ techRegToken?: string }>();
  const pendingTechRegInvite =
    typeof globalParams.techRegToken === 'string' && globalParams.techRegToken.trim().length > 0;

  useEffect(() => {
    if (loading) return;

    const inAuthGroup  = segments[0] === 'auth';
    const inClient = segments[0] === '(client)';
    const inProvider = segments[0] === '(provider)';
    const inProfile    = segments[0] === 'profile';
    const segList = Array.isArray(segments) ? (segments as string[]) : [];
    const otpSeg = segList[1] || '';
    const inOnboarding =
      pathname.startsWith('/auth/onboarding') ||
      segList.includes('onboarding') ||
      (segments[0] === 'auth' && otpSeg === 'onboarding');
    const inOtpJourney =
      (segments[0] === 'auth' &&
        ['identifier', 'otp-verify', 'awaiting-approval', 'simulator', 'legal-sign'].includes(otpSeg)) ||
      ['/auth/identifier', '/auth/otp-verify', '/auth/awaiting-approval', '/auth/simulator', '/auth/legal-sign'].some(
        (p) => pathname.startsWith(p),
      );
    const inTechRegistration =
      pathname.startsWith('/auth/tech-registration') ||
      segList.includes('tech-registration') ||
      (segments[0] === 'auth' && otpSeg === 'tech-registration');
    const inRegisterOnboarding =
      pathname.startsWith('/auth/register-onboarding') ||
      segList.includes('register-onboarding') ||
      (segments[0] === 'auth' && otpSeg === 'register-onboarding');
    const inLogin =
      pathname.startsWith('/auth/login') || (segments[0] === 'auth' && otpSeg === 'login');
    const inProviderCatalog = segments[0] === 'provider-services';
    const seg0 = (segments as string[])[0];
    /** `/` ou ecrã `index` — deixar `app/index` decidir login vs home (não forçar login aqui). */
    const atRootOrIndex = !seg0 || seg0 === 'index';

    if (!user && !atRootOrIndex && !inAuthGroup && !inClient && !inProvider && !inProfile && !inProviderCatalog) {
      router.replace('/auth/login' as any);
      return;
    }

    if (
      user &&
      inAuthGroup &&
      !inOnboarding &&
      !inTechRegistration &&
      !inRegisterOnboarding &&
      !inOtpJourney
    ) {
      if (inLogin && pendingTechRegInvite) {
        return;
      }
      // Logged-in user in `auth/*` fora de fluxos explícitos: completar onboarding geral ou sair do **login**.
      // Não redireccionar para a home só porque `@brspark_onboarding_done` existe — isso cancelava
      // `tech-registration` (Quero ser prestador) numa frame em que pathname/segments ainda não batiam.
      AsyncStorage.getItem('@brspark_onboarding_done')
        .then((done) => {
          if (!done) {
            router.replace('/auth/onboarding' as any);
          } else if (inLogin) {
            router.replace(getPersonaHomeHref(activePersona) as any);
          }
        })
        .catch(() => {});
    }

    if (user && inClient && activePersona === 'provider') {
      void (async () => {
        if (!(await isProviderOnboardingComplete())) {
          router.replace('/auth/onboarding' as any);
          return;
        }
        router.replace(getPersonaHomeHref('provider') as any);
      })();
    }
    if (user && inProvider && activePersona === 'client') {
      router.replace(getPersonaHomeHref('client') as any);
    }
  }, [user, loading, segments, pathname, pendingTechRegInvite, activePersona, router]);

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
    
    void init().catch((err) => console.error('[BOOT] init():', err));

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
    /** iOS: APNs/Expo por vezes só entregam token após o 1.º frame — re-tentar em silêncio. */
    if (Platform.OS !== 'ios') return;
    const a = setTimeout(() => {
      NotificationService.registerForPushNotificationsAsync().catch(() => {});
    }, 5000);
    const b = setTimeout(() => {
      NotificationService.registerForPushNotificationsAsync().catch(() => {});
    }, 20000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [user?.id, loading]);

  useEffect(() => {
    if (loading) return;
    if (!user?.id) {
      resetGpsCapturePolicyToDefaults();
      return;
    }
    void fetchGpsCapturePolicyMe();
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
  const segs: string[] = Array.isArray(segments) ? (segments as string[]) : [];
  const inAuth = segs[0] === 'auth';

  return (
    <RouteGuard>
      <TransitMapExpandedProvider>
        <View style={{ flex: 1 }}>
          <PushNotificationResponseBridge />
          <AppInitializer />
          {!inAuth && <Header />}
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                gestureEnabled: true,
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(client)" />
              <Stack.Screen name="(provider)" />
              <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
              <Stack.Screen name="profile" />
              <Stack.Screen name="provider-os-search" />
              <Stack.Screen name="work-time" />
              <Stack.Screen name="ops-chat/[taskId]" />
              <Stack.Screen name="provider-services/[tenantId]" />
              <Stack.Screen name="+not-found" options={{ headerShown: true }} />
            </Stack>
          </View>
        </View>
      </TransitMapExpandedProvider>
    </RouteGuard>
  );
}

/**
 * `useFonts` só deve dar seguido quando `loaded === true`.
 * Tratar `error != null` como «pronto» montava a app sem fontes; ao abrir o mapa de deslocamento
 * (Octicons/vector-icons), o Metro era pedido outra vez e falhava offline — promise rejeitada.
 */
function FontLoadingGate({ onRetryLoadFonts }: { onRetryLoadFonts: () => void }) {
  const [iconFontsLoaded, iconFontError] = useFonts(VECTOR_ICON_FONT_MAP);

  useEffect(() => {
    void preparePushNotificationInfrastructure().catch(() => {});
  }, []);

  if (!iconFontsLoaded && !iconFontError) {
    return (
      <View style={fontGateStyles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (iconFontError) {
    return (
      <View style={[fontGateStyles.centered, fontGateStyles.errorPad]}>
        <Text style={fontGateStyles.errorText}>
          Não foi possível carregar as fontes dos ícones. Em desenvolvimento, confirme que o telemóvel está na mesma
          rede que o Metro e que o modo avião está desligado. Depois toque em Tentar novamente.
        </Text>
        <TouchableOpacity style={fontGateStyles.retryBtn} onPress={onRetryLoadFonts} accessibilityRole="button">
          <Text style={fontGateStyles.retryLabel}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <PersonaProvider>
          <ThemeProvider>
            <AutomaticTimeGate>
              <GpsIntegrityGate>
                <AppProvider>
                  <MainLayout />
                </AppProvider>
              </GpsIntegrityGate>
            </AutomaticTimeGate>
          </ThemeProvider>
        </PersonaProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}

const fontGateStyles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  errorPad: {
    paddingHorizontal: 24,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#334155',
    fontSize: 15,
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default function RootLayout() {
  const [fontLoadSession, setFontLoadSession] = useState(0);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FontLoadingGate
        key={fontLoadSession}
        onRetryLoadFonts={() => setFontLoadSession((n) => n + 1)}
      />
    </GestureHandlerRootView>
  );
}
