/**
 * Deep link: brsparkmobile://provider-onboarding?inviteToken=<JWT>
 * Persiste o token e envia o utilizador para login/registo; o consumo real é após autenticação.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme/ThemeContext';
import { PENDING_PROVIDER_GLOBAL_INVITE_JWT_KEY } from '../src/lib/onboardingPrefs';
import { tryConsumePendingProviderGlobalInvite } from '../src/lib/pendingProviderGlobalInvite';
import { useAuth } from '../src/hooks/useAuth';

export default function ProviderOnboardingDeepLinkScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user, loading } = useAuth();
  const params = useLocalSearchParams<{ inviteToken?: string }>();
  const invite = typeof params.inviteToken === 'string' ? params.inviteToken.trim() : '';

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      if (invite) {
        try {
          await AsyncStorage.setItem(PENDING_PROVIDER_GLOBAL_INVITE_JWT_KEY, invite);
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      if (user) {
        const { outcome, message } = await tryConsumePendingProviderGlobalInvite();
        if (cancelled) return;
        if (outcome === 'error' && message) {
          Alert.alert('', message);
        }
        router.replace('/profile' as any);
        return;
      }
      router.replace('/auth/login' as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [invite, loading, router, user]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.cardWhite }}>
      <ActivityIndicator size="large" color={C.accent} />
    </View>
  );
}
