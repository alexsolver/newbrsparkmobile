/**
 * Expo config — inclui Google Maps Android (obrigatório para react-native-maps).
 * Defina: EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY no .env; o Android injeta a mesma chave no manifest em compile-time (android/app/build.gradle).
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

/** Obrigatório para getExpoPushTokenAsync (iOS/Android). Ver: https://docs.expo.dev/push-notifications/push-notifications-setup/ */
const easProjectId =
  process.env.EAS_PROJECT_ID?.trim() ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
  appJson.expo.extra?.eas?.projectId?.trim() ||
  undefined;

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...((appJson.expo.extra && appJson.expo.extra.eas) || {}),
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config || {}),
        ...(mapsKey ? { googleMaps: { apiKey: mapsKey } } : {}),
      },
    },
  },
};
