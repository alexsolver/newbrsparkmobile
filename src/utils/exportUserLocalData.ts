import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/** Mesma chave que `auth.ts` — nunca incluir no JSON exportado. */
const JWT_STORAGE_KEY = 'brspark_jwt';

/**
 * Lista fechada (portabilidade LGPD): apenas conta e preferências de interface.
 * Não inclui área de prestador: OS em cache, rascunhos de formulário, outbox,
 * modelos/checklists, chat em cache, telemetria, filas de sync operacionais, etc.
 */
const LGPD_EXPORT_ALLOWLIST_EXACT = new Set([
  'brspark_user',
  '@brspark_email',
  '@brspark_region',
  '@brspark_language',
  '@brspark_active_role',
  '@brspark_onboarding_done',
  '@brspark_onboarding_provider_done',
  '@brspark_app_intro_seen',
  '@pref_push_enabled',
  '@pref_dark_mode',
  '@user_profile',
  '@brspark_units',
  '@brspark_number_format',
  '@brspark_device_id',
]);

function shouldIncludeAsyncStorageKey(key: string): boolean {
  if (!key) return false;
  if (key === JWT_STORAGE_KEY) return false;
  return LGPD_EXPORT_ALLOWLIST_EXACT.has(key);
}

export type LocalUserDataExportPayload = {
  exportSchemaVersion: 1;
  generatedAt: string;
  platform: string;
  description: string;
  asyncStorage: Record<string, unknown>;
};

/**
 * Agrega chaves locais permitidas (LGPD / portabilidade) sem credencial de sessão.
 * Conteúdo operacional do prestador permanece só no dispositivo até sync normal.
 */
export async function buildLocalUserDataExportPayload(): Promise<LocalUserDataExportPayload> {
  const sorted = [...LGPD_EXPORT_ALLOWLIST_EXACT].filter(shouldIncludeAsyncStorageKey).sort();
  const asyncStorage: Record<string, unknown> = {};
  for (const k of sorted) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (raw == null) continue;
      try {
        asyncStorage[k] = JSON.parse(raw);
      } catch {
        asyncStorage[k] = raw;
      }
    } catch {
      /* ignora chave problemática */
    }
  }
  return {
    exportSchemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: Platform.OS,
    description:
      'Exportação limitada a conta e preferências (lista fechada de chaves AsyncStorage). Não inclui OS, rascunhos de formulário, filas de envio, modelos em cache, chat, telemetria nem outros dados da área de prestador. O JWT não é incluído. Dados em SQLite não vêm neste arquivo.',
    asyncStorage,
  };
}

export type ShareUserLocalDataOptions = {
  dialogTitle?: string;
};

/**
 * Gera JSON no diretório de cache e abre o menu nativo de compartilhamento (salvar, Drive, e-mail, etc.).
 */
export async function shareUserLocalDataJson(options?: ShareUserLocalDataOptions): Promise<void> {
  const payload = await buildLocalUserDataExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const userObj = payload.asyncStorage['brspark_user'];
  const emailFromUser =
    userObj && typeof userObj === 'object' && userObj !== null && 'email' in userObj
      ? String((userObj as { email?: string }).email || '')
      : '';
  const emailRaw = payload.asyncStorage['@brspark_email'] ?? emailFromUser;
  const emailSlug =
    typeof emailRaw === 'string'
      ? emailRaw.replace(/[^a-z0-9@._-]+/gi, '_').slice(0, 48)
      : 'usuario';
  const cacheDir = (FileSystem as { cacheDirectory?: string | null }).cacheDirectory;
  if (!cacheDir) {
    throw new Error('cacheDirectory unavailable');
  }
  const uri = `${cacheDir}brspark_export_${emailSlug}_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: 'utf8' });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('sharing not available on this device');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: options?.dialogTitle || 'Exportar dados',
    ...(Platform.OS === 'ios' ? { UTI: 'public.json' as const } : {}),
  });
}
