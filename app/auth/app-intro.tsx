import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { OnboardingIntroSlide } from '../../src/components/OnboardingIntroSlide';
import { markAppIntroDismissedForGuestSession } from '../../src/lib/appIntroPrefs';

export default function AppIntroScreen() {
  const router = useRouter();

  const goRegister = useCallback(() => {
    markAppIntroDismissedForGuestSession();
    router.replace({ pathname: '/auth/login', params: { register: '1' } } as any);
  }, [router]);

  return (
    <OnboardingIntroSlide
      onContinue={goRegister}
      showExistingAccountLink={false}
    />
  );
}
