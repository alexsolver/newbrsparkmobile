/**
 * StorageService — Upload de arquivos via provider configurado no Admin Panel.
 *
 * Protocolo: JSON com arquivo codificado em base64.
 * - Mobile lê o arquivo com FileSystem.readAsStringAsync (base64)
 * - Envia JSON { fileBase64, mimeType, name, path } para /api/storage/upload
 * - Backend decodifica e faz upload no Dropbox (ou outro provider configurado)
 *
 * Vantagens sobre multipart:
 * - Sem riscos de parsing de boundary
 * - Funciona perfeitamente com express.json()
 * - Debug mais simples
 */
import * as FileSystem from 'expo-file-system/legacy';
import { API_BASE, getToken, handleUnauthorizedMaybeSessionInvalidated } from './auth';

export interface UploadResult {
  url: string | null;
  provider: string;
  path: string;
}

export interface StorageConfig {
  configured: boolean;
  provider: string;
  name?: string;
  baseUrl?: string;
}

// Cache em memória (TTL 5 min)
let _storageConfigCache: { config: StorageConfig; ts: number } | null = null;

export async function getStorageConfig(): Promise<StorageConfig> {
  const now = Date.now();
  if (_storageConfigCache && now - _storageConfigCache.ts < 5 * 60 * 1000) {
    return _storageConfigCache.config;
  }
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/storage/config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    await handleUnauthorizedMaybeSessionInvalidated(res);
    if (!res.ok) throw new Error('config fetch failed');
    const config: StorageConfig = await res.json();
    _storageConfigCache = { config, ts: now };
    return config;
  } catch {
    return { configured: false, provider: 'none' };
  }
}

/**
 * Faz upload de um arquivo local para o provider ativo (Dropbox, S3, R2...).
 * Usa base64 para envio confiável, sem dependência de multipart parsing.
 */
export async function uploadFile(localUri: string, remotePath: string): Promise<UploadResult | null> {
  try {
    const token = await getToken();

    const ext = localUri.split('.').pop()?.toLowerCase() || 'bin';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      mp4: 'video/mp4', mov: 'video/quicktime', gif: 'image/gif',
      pdf: 'application/pdf', heic: 'image/heic', webp: 'image/webp',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const filename  = remotePath.split('/').pop() || `file.${ext}`;

    // Lê o arquivo como base64
    const fileBase64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: 'base64',
    });

    const body = { fileBase64, mimeType, name: filename, path: remotePath };

    const res = await fetch(`${API_BASE}/api/storage/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    await handleUnauthorizedMaybeSessionInvalidated(res);

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[STORAGE] Upload falhou:', res.status, errText);
      throw new Error(`Servidor RECUSOU o payload: ${res.status} - ${errText.slice(0,100)}`);
    }

    const json: UploadResult = await res.json();
    console.info(`[STORAGE] Upload OK → provider: ${json.provider} | url: ${json.url || 'sem URL pública'}`);
    return json;

  } catch (e: any) {
    console.warn('[STORAGE] Upload erro:', e);
    throw new Error(e.message || String(e));
  }
}

/** Gera caminho remoto único para mídia */
export function mediaRemotePath(ownerEmail: string, mediaId: string, ext: string): string {
  const safeEmail = ownerEmail.replace(/[^a-zA-Z0-9]/g, '_');
  return `media/${safeEmail}/${mediaId}.${ext}`;
}

/** Gera caminho remoto único para documento */
export function docRemotePath(ownerEmail: string, docId: string, originalName: string): string {
  const safeEmail = ownerEmail.replace(/[^a-zA-Z0-9]/g, '_');
  const ext = originalName.split('.').pop() || 'bin';
  return `docs/${safeEmail}/${docId}.${ext}`;
}
