import AsyncStorage from '@react-native-async-storage/async-storage';

/** Concluído o fluxo de consentimento LGPD/GPS específico do modo prestador (telas «prestador» em `/auth/onboarding`). */
export const ONBOARDING_PROVIDER_DONE_KEY = '@brspark_onboarding_provider_done';

/** Token público do cadastro prestador — guardado ao abrir onboarding de prestador antes de `/auth/tech-registration`. */
export const PENDING_TECH_REG_TOKEN_KEY = '@brspark_pending_tech_reg_token';

/** JWT de convite «primeiro cadastro prestador» (deep link `brsparkmobile://provider-onboarding?inviteToken=…`). */
export const PENDING_PROVIDER_GLOBAL_INVITE_JWT_KEY = '@brspark_pending_provider_global_invite_jwt';

export async function isProviderOnboardingComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_PROVIDER_DONE_KEY)) === '1';
}
