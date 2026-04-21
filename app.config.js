/**
 * Expo config — inclui Google Maps Android (obrigatório para react-native-maps).
 * Defina: EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY no .env; o Android injeta a mesma chave no manifest em compile-time (android/app/build.gradle).
 * API móvel em release: EXPO_PUBLIC_API_BASE (origem sem /api), ou fallback em src/services/auth.ts.
 * Login social (Google/Facebook/Apple): validação no Laravel via Node — defina no .env
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
 * EXPO_PUBLIC_FACEBOOK_APP_ID; no Laravel, GOOGLE_CLIENT_IDS deve incluir os mesmos client IDs do aud do id_token.
 * Apple: plugin expo-apple-authentication; em APPLE_CLIENT_IDS no Laravel inclua o Services ID / bundle id usado pelo app.
 *
 * Dev Client (iOS/Android): o URL do packager é o Metro (ex.: exp://IP-LAN:8081 ou túnel do `expo start`),
 * NÃO o domínio HTTPS da API (ex. api.brspark.com). Se vir "Could not connect to development server"
 * com host tipo expo.*:8081, abra o menu de desenvolvimento → altere o URL do bundler para o IP do PC onde corre
 * `npx expo start --dev-client`, ou use `expo start --tunnel`. Só use hostname remoto em :8081 se aí estiver mesmo
 * a correr o Metro com porta acessível (e no iOS pode ser preciso exceção ATS para HTTP em Info.plist).
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch {
  /* dotenv é opcional em ambientes mínimos */
}

const appJson = require('./app.json');

// Opcional: GOOGLE_MAPS_ANDROID_API_KEY em android/gradle.properties (CI) — senão usa .env / variáveis de ambiente na build.
const mapsKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY?.trim() ||
  process.env.GOOGLE_MAPS_ANDROID_KEY?.trim() ||
  '';

/** EAS: @alexsolver/BrsparkMobile — https://expo.dev/accounts/alexsolver/projects/BrsparkMobile */
const EAS_PROJECT_ID_FALLBACK = '8afa6988-8e45-42e8-afd5-67728288f086';

/** Obrigatório para EAS Build/Submit e getExpoPushTokenAsync. */
const easProjectId =
  process.env.EAS_PROJECT_ID?.trim() ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
  appJson.expo.extra?.eas?.projectId?.trim() ||
  EAS_PROJECT_ID_FALLBACK;

const basePlugins = Array.isArray(appJson.expo.plugins) ? [...appJson.expo.plugins] : [];
const extraPlugins = ['expo-web-browser', 'expo-apple-authentication'];
const mergedPlugins = [...basePlugins];
for (const p of extraPlugins) {
  const key = typeof p === 'string' ? p : p?.[0];
  if (!mergedPlugins.some((x) => (typeof x === 'string' ? x : x?.[0]) === key)) {
    mergedPlugins.push(p);
  }
}

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: mergedPlugins,
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...((appJson.expo.extra && appJson.expo.extra.eas) || {}),
        projectId: easProjectId,
      },
    },
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config || {}),
        ...(mapsKey ? { googleMaps: { apiKey: mapsKey } } : {}),
      },
    },
    /** App Store / EAS: declaração padrão (HTTPS e APIs do SO); evita bloqueio na revisão. */
    ios: {
      ...appJson.expo.ios,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        ITSAppUsesNonExemptEncryption: false,
      },
    },
  },
};
