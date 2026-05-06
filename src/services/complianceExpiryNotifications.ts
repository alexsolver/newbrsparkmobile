import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ComplianceDocument } from '../types/assetExtensions';

const ANDROID_CHANNEL = 'aria-compliance-expiry';

let channelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Aria — Conformidade',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    sound: 'default',
  });
  channelReady = true;
}

function notificationId(docId: string): string {
  return `compliance_doc_${docId}`;
}

/**
 * Agenda lembrete local (mesmo padrão de AssetDocService / custos recorrentes).
 */
export async function scheduleComplianceDocumentNotification(doc: ComplianceDocument): Promise<void> {
  await ensureAndroidChannel();
  const nid = notificationId(doc.id);
  try {
    await Notifications.cancelScheduledNotificationAsync(nid);
  } catch {
    /* ok */
  }

  if (!doc.validUntil || doc.alertDaysBefore === undefined) return;

  const expireDate = new Date(doc.validUntil + 'T12:00:00');
  if (Number.isNaN(expireDate.getTime())) return;

  const alertDate = new Date(expireDate.getTime());
  alertDate.setDate(alertDate.getDate() - doc.alertDaysBefore);
  alertDate.setHours(9, 0, 0, 0);

  if (alertDate <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: nid,
    content: {
      title: 'Conformidade: vencimento próximo',
      body:
        doc.alertDaysBefore === 0
          ? `"${doc.title}" vence hoje.`
          : `"${doc.title}" vence em ${doc.alertDaysBefore} dia(s) (${doc.validUntil}).`,
      data: {
        type: 'COMPLIANCE_EXPIRY',
        assetId: doc.assetId,
        complianceDocId: doc.id,
      },
      sound: 'default',
    },
    trigger: { date: alertDate } as any,
  });
}

export async function cancelComplianceDocumentNotification(docId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId(docId));
  } catch {
    /* ok */
  }
}
