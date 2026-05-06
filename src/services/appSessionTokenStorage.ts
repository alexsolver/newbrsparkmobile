import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/** JWT legacy no AsyncStorage (migração automática para SecureStore). */
export const TOKEN_KEY = 'aria_jwt';
export const USER_KEY = 'aria_user';

const REFRESH_TOKEN_SECURE_KEY = 'aria_refresh_token_v1';
const REFRESH_TOKEN_ASYNC_FALLBACK_KEY = 'aria_refresh_token_fb';
const ACCESS_TOKEN_SECURE_KEY = 'aria_jwt_secure_v1';

export async function clearAccessTokenStorage(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_SECURE_KEY);
  } catch {
    /* inexistente */
  }
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export async function setAccessTokenStorage(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, token);
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  } catch {
    /* Keychain indisponível (ex.: web) */
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(ACCESS_TOKEN_SECURE_KEY);
    if (secure) return secure;
  } catch {
    /* ignore */
  }
  try {
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      try {
        await SecureStore.setItemAsync(ACCESS_TOKEN_SECURE_KEY, legacy);
        await AsyncStorage.removeItem(TOKEN_KEY);
      } catch {
        /* mantém legacy no AsyncStorage se SecureStore falhar */
      }
    }
    return legacy;
  } catch {
    return null;
  }
}

export async function clearRefreshTokenSecure(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_SECURE_KEY);
  } catch {
    /* inexistente */
  }
  try {
    await AsyncStorage.removeItem(REFRESH_TOKEN_ASYNC_FALLBACK_KEY);
  } catch {
    /* ignore */
  }
}

export async function getRefreshTokenSecure(): Promise<string | null> {
  try {
    const a = await SecureStore.getItemAsync(REFRESH_TOKEN_SECURE_KEY);
    if (a) return a;
  } catch {
    /* ignore */
  }
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_ASYNC_FALLBACK_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshTokenSecure(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_SECURE_KEY, token);
    await AsyncStorage.removeItem(REFRESH_TOKEN_ASYNC_FALLBACK_KEY);
    return;
  } catch {
    /* SecureStore indisponível (ex.: web) */
  }
  await AsyncStorage.setItem(REFRESH_TOKEN_ASYNC_FALLBACK_KEY, token);
}
