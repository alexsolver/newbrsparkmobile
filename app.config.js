/**
 * Expo config — inclui Google Maps Android (obrigatório para react-native-maps).
 * Defina: EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=sua_chave no .env e faça `npx expo prebuild` / rebuild nativo.
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch {
  /* dotenv é opcional em ambientes mínimos */
}

const appJson = require('./app.json');

// Mesma chave pode ir para android/gradle.properties (GOOGLE_MAPS_ANDROID_API_KEY) para o manifest nativo.
const mapsKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY?.trim() ||
  process.env.GOOGLE_MAPS_ANDROID_KEY?.trim() ||
  '';

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config || {}),
        ...(mapsKey ? { googleMaps: { apiKey: mapsKey } } : {}),
      },
    },
  },
};
