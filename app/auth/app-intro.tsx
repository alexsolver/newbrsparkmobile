import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { OnboardingIntroSlide } from '../../src/components/OnboardingIntroSlide';
import { markAppIntroDismissedForGuestSession } from '../../src/lib/appIntroPrefs';
import { getPersonaTabHref } from '../../src/navigation/personaRouting';

export default function AppIntroScreen() {
  const router = useRouter();

  const goLogin = useCallback(() => {
    markAppIntroDismissedForGuestSession();
    router.replace('/auth/login' as any);
  }, [router]);

  const goRegister = useCallback(() => {
    markAppIntroDismissedForGuestSession();
    router.replace({ pathname: '/auth/login', params: { register: '1' } } as any);
  }, [router]);

  const goExploreServices = useCallback(() => {
    markAppIntroDismissedForGuestSession();
    router.replace(getPersonaTabHref('client', 'services') as any);
  }, [router]);

  return (
    <OnboardingIntroSlide
      onContinue={goRegister}
      onExistingAccountPress={goLogin}
      onExploreServicesPress={goExploreServices}
    />
  );
}
