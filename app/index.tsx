import { Redirect, useGlobalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../src/hooks/useAuth';
import { usePersona } from '../src/context/PersonaContext';
import { getPersonaHomeHref } from '../src/navigation/personaRouting';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
type GuestTarget = 'boot' | 'login';

/**
 * Ponto de entrada “/” — sem sessão: login (ou convite técnico); com sessão: área autenticada.
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
    setGuestTarget('login');
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
