import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

/** Cores oficiais (aprox.) – Google, Meta/Facebook, Apple */
const GOOGLE = {
  bg: '#FFFFFF',
  border: '#DADCE0',
  text: '#1F1F1F',
  icon: '#4285F4',
};

const META_FACEBOOK = {
  /** Azul de marca (Facebook / Meta) */
  bg: '#1877F2',
  text: '#FFFFFF',
  border: '#1877F2',
};

const APPLE = {
  /** Sign in with Apple: botão escuro + texto/ícone claros (HIG) */
  bg: '#000000',
  text: '#FFFFFF',
  border: '#000000',
};

export type NativeOAuthPending = {
  provider: 'google' | 'facebook' | 'apple';
  idToken?: string;
  accessToken?: string;
};

function googleEnvReady(): boolean {
  const web = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!web) return false;
  if (Platform.OS === 'web') return true;
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

/** Só montar quando as env estiverem completas; senão o hook de OAuth falha. */
function GoogleWithHookRow(props: {
  disabled: boolean;
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
      style={[
        styles.oauthBtn,
        { borderColor: GOOGLE.border, backgroundColor: GOOGLE.bg },
      ]}
      onPress={() => void onPress()}
      disabled={props.disabled || busy}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator color={GOOGLE.icon} />
      ) : (
        <>
          <Ionicons name="logo-google" size={20} color={GOOGLE.icon} style={styles.oauthIcon} />
          <Text style={[styles.oauthBtnText, { color: GOOGLE.text }]}>{props.labelGoogle}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function GoogleUnconfiguredButton(props: {
  disabled: boolean;
  labelGoogle: string;
  onNeedConfig: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.oauthBtn,
        { borderColor: GOOGLE.border, backgroundColor: GOOGLE.bg, opacity: props.disabled ? 0.55 : 0.9 },
      ]}
      onPress={props.onNeedConfig}
      disabled={props.disabled}
      activeOpacity={0.8}
    >
      <Ionicons name="logo-google" size={20} color={GOOGLE.icon} style={styles.oauthIcon} />
      <Text style={[styles.oauthBtnText, { color: GOOGLE.text }]}>{props.labelGoogle}</Text>
    </TouchableOpacity>
  );
}

function FacebookWithHookRow(props: {
  disabled: boolean;
  labelMeta: string;
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
      style={[
        styles.oauthBtn,
        { borderColor: META_FACEBOOK.border, backgroundColor: META_FACEBOOK.bg },
      ]}
      onPress={() => void onPress()}
      disabled={props.disabled || busy}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator color={META_FACEBOOK.text} />
      ) : (
        <>
          <Ionicons name="logo-facebook" size={20} color={META_FACEBOOK.text} style={styles.oauthIcon} />
          <Text style={[styles.oauthBtnText, { color: META_FACEBOOK.text }]}>{props.labelMeta}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function FacebookUnconfiguredButton(props: {
  disabled: boolean;
  labelMeta: string;
  onNeedConfig: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.oauthBtn,
        {
          borderColor: META_FACEBOOK.border,
          backgroundColor: META_FACEBOOK.bg,
          opacity: props.disabled ? 0.55 : 0.9,
        },
      ]}
      onPress={props.onNeedConfig}
      disabled={props.disabled}
      activeOpacity={0.8}
    >
      <Ionicons name="logo-facebook" size={20} color={META_FACEBOOK.text} style={styles.oauthIcon} />
      <Text style={[styles.oauthBtnText, { color: META_FACEBOOK.text }]}>{props.labelMeta}</Text>
    </TouchableOpacity>
  );
}

function AppleSignInRow(props: {
  disabled: boolean;
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
      style={[
        styles.oauthBtn,
        { borderColor: APPLE.border, backgroundColor: APPLE.bg },
      ]}
      onPress={() => void onPress()}
      disabled={props.disabled || busy}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator color={APPLE.text} />
      ) : (
        <>
          <Ionicons name="logo-apple" size={20} color={APPLE.text} style={styles.oauthIcon} />
          <Text style={[styles.oauthBtnText, { color: APPLE.text }]}>{props.labelApple}</Text>
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
  labelMeta: string;
  labelApple: string;
  /** Aviso quando faltam EXPO_PUBLIC_GOOGLE_* ou EXPO_PUBLIC_FACEBOOK_APP_ID */
  unconfiguredOauthMessage: string;
  onOAuth: (pending: NativeOAuthPending) => Promise<void>;
  onNativeError?: (message: string) => void;
};

/**
 * Google / Meta (Facebook) e Apple, com a identidade visual aproximada de cada marca.
 * Google e Meta mostram-se sempre; sem env o toque explica. Apple só iOS.
 */
export function LoginOAuthNativeSection(props: LoginOAuthNativeSectionProps) {
  const showApple = Platform.OS === 'ios';
  const gReady = googleEnvReady();
  const fReady = facebookEnvReady();
  const platformOk =
    Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web';

  if (!platformOk) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: props.C.border }]} />
        <Text style={[styles.dividerText, { color: props.C.textLight }]}>{props.labelDivider}</Text>
        <View style={[styles.dividerLine, { backgroundColor: props.C.border }]} />
      </View>
      {gReady ? (
        <GoogleWithHookRow
          disabled={props.disabled}
          labelGoogle={props.labelGoogle}
          onNativeError={props.onNativeError}
          onToken={async (idToken) => {
            await props.onOAuth({ provider: 'google', idToken });
          }}
        />
      ) : (
        <GoogleUnconfiguredButton
          disabled={props.disabled}
          labelGoogle={props.labelGoogle}
          onNeedConfig={() =>
            Alert.alert(
              props.labelGoogle,
              props.unconfiguredOauthMessage,
            )
          }
        />
      )}
      {fReady ? (
        <FacebookWithHookRow
          disabled={props.disabled}
          labelMeta={props.labelMeta}
          onNativeError={props.onNativeError}
          onAccessToken={async (accessToken) => {
            await props.onOAuth({ provider: 'facebook', accessToken });
          }}
        />
      ) : (
        <FacebookUnconfiguredButton
          disabled={props.disabled}
          labelMeta={props.labelMeta}
          onNeedConfig={() =>
            Alert.alert(
              props.labelMeta,
              props.unconfiguredOauthMessage,
            )
          }
        />
      )}
      {showApple ? (
        <AppleSignInRow
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
