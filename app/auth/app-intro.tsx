import React, { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { OnboardingIntroSlide } from '../../src/components/OnboardingIntroSlide';
import { APP_INTRO_SEEN_KEY } from '../../src/lib/appIntroPrefs';

export default function AppIntroScreen() {
  const router = useRouter();

  const markSeen = useCallback(async () => {
    await AsyncStorage.setItem(APP_INTRO_SEEN_KEY, '1');
  }, []);

  return (
    <OnboardingIntroSlide
      onContinue={async () => {
        await markSeen();
        router.replace({ pathname: '/auth/login', params: { register: '1' } } as any);
      }}
      onExistingAccountPress={async () => {
        await markSeen();
        router.replace('/auth/login' as any);
      }}
    />
  );
}
