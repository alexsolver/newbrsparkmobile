/**
 * Antes de enviar lançamentos do financeiro técnico à nuvem, faz upload dos anexos
 * ainda locais (file://, content://) para /api/storage/upload e grava a URL no SQLite.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { getTechFinanceRowById, saveTechFinanceEntryLocal } from '../database';
import { uploadFile } from './storageService';
import type { TechnicianFinanceAttachment } from '../types/technicianFinance';

function parseAttachmentsList(row: any): TechnicianFinanceAttachment[] {
  const raw = row?.attachments_json ?? row?.attachments;
  if (raw == null) return [];
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function remoteExt(att: TechnicianFinanceAttachment, uri: string): string {
  const fromName = att.name?.split('.').pop();
  if (fromName && fromName.length >= 2 && fromName.length <= 8) {
    return fromName.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  }
  const fromUri = uri.split('.').pop()?.split('?')[0];
  if (fromUri && fromUri.length >= 2 && fromUri.length <= 8) {
    return fromUri.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  }
  return 'bin';
}

function isRemoteUri(uri: string) {
  return /^https?:\/\//i.test(String(uri).trim());
}

/**
 * Faz upload de cada anexo local e atualiza a linha no SQLite quando pelo menos um mudar.
 * @returns Linha a usar no POST de sync (preferencialmente a lida de volta do DB).
 */
export async function ensureTechFinanceAttachmentsUploaded(
  row: any,
  ownerEmail?: string
): Promise<any> {
  if (!ownerEmail || !row?.id) return row;

  const list = parseAttachmentsList(row);
  if (list.length === 0) return row;

  const next: TechnicianFinanceAttachment[] = [];
  let changed = false;
  const entryId = String(row.id);

  for (let i = 0; i < list.length; i++) {
    const att = list[i];
    const uri = att?.uri != null ? String(att.uri) : '';
    if (!uri) {
      next.push(att);
      continue;
    }
    if (isRemoteUri(uri)) {
      next.push(att);
      continue;
    }

    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        next.push(att);
        continue;
      }
    } catch {
      next.push(att);
      continue;
    }

    const ext = remoteExt(att, uri);
    const safeEmail = ownerEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const remotePath = `tech_finance/${safeEmail}/${entryId}/${Date.now()}_${i}.${ext}`;

    try {
      const res = await uploadFile(uri, remotePath);
      const cloudUri = res?.url || res?.path;
      if (cloudUri) {
        next.push({
          uri: cloudUri,
          name: att.name,
          mimeType: att.mimeType,
        });
        changed = true;
      } else {
        next.push(att);
      }
    } catch (e) {
      console.warn('[TECH_FINANCE] Upload de anexo falhou:', e);
      next.push(att);
    }
  }

  if (!changed) return row;

  const updated = {
    ...row,
    attachments_json: JSON.stringify(next),
  };
  saveTechFinanceEntryLocal(updated, ownerEmail);
  return getTechFinanceRowById(entryId) ?? updated;
}
