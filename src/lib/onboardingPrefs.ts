import AsyncStorage from '@react-native-async-storage/async-storage';

/** Concluído o fluxo de consentimento LGPD/GPS específico do modo prestador (telas «prestador» em `/auth/onboarding`). */
export const ONBOARDING_PROVIDER_DONE_KEY = '@brspark_onboarding_provider_done';

export async function isProviderOnboardingComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_PROVIDER_DONE_KEY)) === '1';
}
