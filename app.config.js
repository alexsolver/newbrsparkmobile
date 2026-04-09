/**
 * Expo config — inclui Google Maps Android (obrigatório para react-native-maps).
 * Defina: EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY no .env; o Android injeta a mesma chave no manifest em compile-time (android/app/build.gradle).
 * API móvel em release: EXPO_PUBLIC_API_BASE (origem sem /api), ou fallback em src/services/auth.ts.
 *
 * Dev Client (iOS/Android): o URL do packager é o Metro (ex.: exp://IP-LAN:8081 ou túnel do `expo start`),
 * NÃO o domínio HTTPS da API (ex. brsparks.wstrategy.com.br). Se vir "Could not connect to development server"
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

module.exports = {
  expo: {
    ...appJson.expo,
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
  },
};
