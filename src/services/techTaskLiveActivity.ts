import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

const STORAGE_KEY = '@brspark_tech_live_activity_slot';

type Slot = { activityId: string; taskId: string };

async function readSlot(): Promise<Slot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Slot;
    if (j && typeof j.activityId === 'string' && typeof j.taskId === 'string') return j;
  } catch {
    /* ignore */
  }
  return null;
}

async function writeSlot(slot: Slot | null): Promise<void> {
  try {
    if (!slot) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(slot));
  } catch {
    /* ignore */
  }
}

function liveActivityModuleAvailable(): boolean {
  return Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoLiveActivity');
}

/**
 * Live Activity estilo «cartão em baixo» no Lock Screen (iOS 16.2+).
 * Só funciona em build com `expo-live-activity` (dev client / EAS); no Expo Go não há módulo nativo.
 */
export async function startTechTaskLiveActivity(params: {
  taskId: string;
  title: string;
  subtitle?: string;
}): Promise<void> {
  if (!liveActivityModuleAvailable()) return;
  const taskId = String(params.taskId || '').trim();
  if (!taskId) return;

  try {
    const LiveActivity = await import('expo-live-activity');
    const prev = await readSlot();
    if (prev && prev.taskId !== taskId) {
      try {
        LiveActivity.stopActivity(prev.activityId, {
          title: 'BrSpark',
          subtitle: 'Atualizado.',
        });
      } catch {
        /* ignore */
      }
    }

    const title = params.title.slice(0, 56);
    const subtitle = (params.subtitle || 'Toque para abrir no app.').slice(0, 120);
    const deepLinkUrl = `/checklist/${encodeURIComponent(taskId)}`;

    const activityId = LiveActivity.startActivity(
      {
        title,
        subtitle,
        imageName: 'brspark-badge',
        dynamicIslandImageName: 'brspark-badge',
      },
      {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        subtitleColor: '#cbd5e1',
        progressViewTint: '#2563eb',
        progressViewLabelColor: '#f8fafc',
        deepLinkUrl,
        timerType: 'digital',
        padding: { horizontal: 16, top: 14, bottom: 14 },
        imagePosition: 'left',
        imageAlign: 'center',
        imageSize: { width: 40, height: 40 },
        contentFit: 'cover',
      }
    );

    if (activityId) await writeSlot({ activityId, taskId });
  } catch (e) {
    console.warn('[BrSpark LiveActivity] start:', e);
  }
}

/** Encerra o cartão Live Activity associado a esta OS (aceite, recusa ou OK). */
export async function stopTechTaskLiveActivityForTask(taskId: string): Promise<void> {
  if (!liveActivityModuleAvailable()) return;
  const id = String(taskId || '').trim();
  if (!id) return;

  const slot = await readSlot();
  if (!slot || slot.taskId !== id) return;

  try {
    const LiveActivity = await import('expo-live-activity');
    LiveActivity.stopActivity(slot.activityId, {
      title: 'BrSpark',
      subtitle: 'Concluído.',
    });
  } catch (e) {
    console.warn('[BrSpark LiveActivity] stop:', e);
  } finally {
    await writeSlot(null);
  }
}
