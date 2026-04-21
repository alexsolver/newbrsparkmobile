import { Redirect, useGlobalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/hooks/useAuth';
import { usePersona } from '../src/context/PersonaContext';
import { getPersonaHomeHref } from '../src/navigation/personaRouting';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { APP_INTRO_SEEN_KEY } from '../src/lib/appIntroPrefs';

type GuestTarget = 'boot' | 'intro' | 'login';

/**
 * Ponto de entrada “/” — primeira abertura: apresentação; depois login ou área autenticada.
 */
export default function AppEntryIndex() {
  const { user, loading } = useAuth();
  const { activePersona } = usePersona();
  const { colors: C } = useTheme();
  const globalParams = useGlobalSearchParams<{ techRegToken?: string }>();
  const pendingTechRegInvite =
    typeof globalParams.techRegToken === 'string' && globalParams.techRegToken.trim().length > 0;
  const [guestTarget, setGuestTarget] = useState<GuestTarget>('boot');

  useEffect(() => {
    if (loading) return;
    if (user) return;
    if (pendingTechRegInvite) {
      setGuestTarget('login');
      return;
    }
    let cancel = false;
    AsyncStorage.getItem(APP_INTRO_SEEN_KEY).then((v) => {
      if (cancel) return;
      setGuestTarget(v === '1' ? 'login' : 'intro');
    });
    return () => {
      cancel = true;
    };
  }, [loading, user, pendingTechRegInvite]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.cardWhite }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (user) {
    return <Redirect href={getPersonaHomeHref(activePersona) as any} />;
  }

  if (guestTarget === 'boot') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.cardWhite }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (guestTarget === 'intro') {
    return <Redirect href={'/auth/app-intro' as any} />;
  }

  if (pendingTechRegInvite) {
    return (
      <Redirect
        href={
          {
            pathname: '/auth/login',
            params: { techRegToken: String(globalParams.techRegToken).trim() },
          } as any
        }
      />
    );
  }

  return <Redirect href={'/auth/login' as any} />;
}
