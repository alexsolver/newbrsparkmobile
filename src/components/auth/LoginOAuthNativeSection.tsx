import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import type { ColorPalette } from '../../theme/colors';

WebBrowser.maybeCompleteAuthSession();

export type NativeOAuthPending = {
  provider: 'google' | 'facebook' | 'apple';
  idToken?: string;
  accessToken?: string;
};

function googleEnvReady(): boolean {
  const web = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!web) return false;
  if (Platform.OS === 'ios') {
    return Boolean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim());
  }
  if (Platform.OS === 'android') {
    return Boolean(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim());
  }
  return false;
}

function facebookEnvReady(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim());
}

function GoogleSignInRow(props: {
  disabled: boolean;
  C: ColorPalette;
  labelGoogle: string;
  onToken: (idToken: string) => Promise<void>;
  onNativeError?: (message: string) => void;
}) {
  const web = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '';
  const ios = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const android = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();

  const [, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: web,
    iosClientId: ios,
    androidClientId: android,
  });

  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    if (props.disabled || busy) return;
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') return;
      const idToken = result.params?.id_token;
      if (idToken && typeof idToken === 'string') {
        await props.onToken(idToken);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      props.onNativeError?.(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, promptAsync, props]);

  return (
    <TouchableOpacity
      style={[styles.oauthBtn, { borderColor: props.C.border, backgroundColor: props.C.background }]}
      onPress={() => void onPress()}
      disabled={props.disabled || busy}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator color={props.C.primary} />
      ) : (
        <>
          <Ionicons name="logo-google" size={20} color={props.C.primary} style={styles.oauthIcon} />
          <Text style={[styles.oauthBtnText, { color: props.C.primary }]}>{props.labelGoogle}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function FacebookSignInRow(props: {
  disabled: boolean;
  C: ColorPalette;
  labelFacebook: string;
  onAccessToken: (token: string) => Promise<void>;
  onNativeError?: (message: string) => void;
}) {
  const appId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() || '';
  const [, , promptAsync] = Facebook.useAuthRequest({ clientId: appId });
  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    if (props.disabled || busy) return;
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') return;
      const access = result.params?.access_token;
      if (access && typeof access === 'string') {
        await props.onAccessToken(access);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      props.onNativeError?.(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, promptAsync, props]);

  return (
    <TouchableOpacity
      style={[styles.oauthBtn, { borderColor: props.C.border, backgroundColor: props.C.background }]}
      onPress={() => void onPress()}
      disabled={props.disabled || busy}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator color={props.C.primary} />
      ) : (
        <>
          <Ionicons name="logo-facebook" size={20} color="#1877F2" style={styles.oauthIcon} />
          <Text style={[styles.oauthBtnText, { color: props.C.primary }]}>{props.labelFacebook}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function AppleSignInRow(props: {
  disabled: boolean;
  C: ColorPalette;
  labelApple: string;
  onIdentityToken: (idToken: string) => Promise<void>;
  onNativeError?: (message: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AppleAuthentication.isAvailableAsync().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onPress = useCallback(async () => {
    if (props.disabled || busy || !available) return;
    setBusy(true);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (cred.identityToken) {
        await props.onIdentityToken(cred.identityToken);
      }
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      props.onNativeError?.(msg);
    } finally {
      setBusy(false);
    }
  }, [available, busy, props]);

  if (!available) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.oauthBtn, { borderColor: props.C.border, backgroundColor: props.C.primary }]}
      onPress={() => void onPress()}
      disabled={props.disabled || busy}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator color={props.C.cardWhite} />
      ) : (
        <>
          <Ionicons name="logo-apple" size={20} color={props.C.cardWhite} style={styles.oauthIcon} />
          <Text style={[styles.oauthBtnText, { color: props.C.cardWhite }]}>{props.labelApple}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  oauthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  oauthIcon: { marginRight: 2 },
  oauthBtnText: { fontSize: 15, fontWeight: '800' },
});

export type LoginOAuthNativeSectionProps = {
  C: ColorPalette;
  disabled: boolean;
  labelDivider: string;
  labelGoogle: string;
  labelFacebook: string;
  labelApple: string;
  onOAuth: (pending: NativeOAuthPending) => Promise<void>;
  onNativeError?: (message: string) => void;
};

/**
 * Botões de login social (Google / Facebook via expo-auth-session; Apple nativa no iOS).
 * Só monta Google/Facebook quando as variáveis EXPO_PUBLIC_* estiverem definidas.
 */
export function LoginOAuthNativeSection(props: LoginOAuthNativeSectionProps) {
  const showGoogle = googleEnvReady();
  const showFacebook = facebookEnvReady();
  const showApple = Platform.OS === 'ios';

  if (!showGoogle && !showFacebook && !showApple) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: props.C.border }]} />
        <Text style={[styles.dividerText, { color: props.C.textLight }]}>{props.labelDivider}</Text>
        <View style={[styles.dividerLine, { backgroundColor: props.C.border }]} />
      </View>
      {showGoogle ? (
        <GoogleSignInRow
          C={props.C}
          disabled={props.disabled}
          labelGoogle={props.labelGoogle}
          onNativeError={props.onNativeError}
          onToken={async (idToken) => {
            await props.onOAuth({ provider: 'google', idToken });
          }}
        />
      ) : null}
      {showFacebook ? (
        <FacebookSignInRow
          C={props.C}
          disabled={props.disabled}
          labelFacebook={props.labelFacebook}
          onNativeError={props.onNativeError}
          onAccessToken={async (accessToken) => {
            await props.onOAuth({ provider: 'facebook', accessToken });
          }}
        />
      ) : null}
      {showApple ? (
        <AppleSignInRow
          C={props.C}
          disabled={props.disabled}
          labelApple={props.labelApple}
          onNativeError={props.onNativeError}
          onIdentityToken={async (idToken) => {
            await props.onOAuth({ provider: 'apple', idToken });
          }}
        />
      ) : null}
    </View>
  );
}
