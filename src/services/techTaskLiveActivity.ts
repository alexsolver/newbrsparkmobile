import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

const STORAGE_KEY = '@aria_tech_live_activity_slot';

type Slot = { activityId: string; taskId: string };

/** Cartão Live Activity: sempre identidade Aria (não segue branding do tenant no tema nem no push). */
const LA_BADGE_ASSET = 'aria-badge';
const LA_BACKGROUND = '#0f172a';
const LA_ACCENT = '#2563eb';

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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function channelToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function getContrastText(hex: string, dark = '#0F172A', light = '#F8FAFC'): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return light;
  const lum =
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b);
  return lum > 0.55 ? dark : light;
}

/**
 * Live Activity estilo «cartão em baixo» no Lock Screen (iOS 16.2+).
 * Só funciona em build com `expo-live-activity` (dev client / EAS); no Expo Go não há módulo nativo.
 *
 * Cores, ícone e nome curto de encerramento são **fixos Aria** — não usam `ThemeContext` nem
 * `appDisplayName` / `liveActivityBadgeKey` do push (evita cartão distinto por tenant).
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
          title: 'Aria',
          subtitle: 'Atualizado.',
        });
      } catch {
        /* ignore */
      }
    }

    const title = params.title.slice(0, 56);
    const subtitle = (params.subtitle || 'Toque para abrir no app.').slice(0, 120);
    const deepLinkUrl = `/checklist/${encodeURIComponent(taskId)}`;
    const backgroundColor = LA_BACKGROUND;
    const titleColor = getContrastText(backgroundColor);
    const subtitleColor = titleColor === '#0F172A' ? '#334155' : '#CBD5E1';
    const progressViewTint = LA_ACCENT;

    const activityId = LiveActivity.startActivity(
      {
        title,
        subtitle,
        imageName: LA_BADGE_ASSET,
        dynamicIslandImageName: LA_BADGE_ASSET,
      },
      {
        backgroundColor,
        titleColor,
        subtitleColor,
        progressViewTint,
        progressViewLabelColor: titleColor,
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
    console.warn('[Aria LiveActivity] start:', e);
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
      title: 'Aria',
      subtitle: 'Concluído.',
    });
  } catch (e) {
    console.warn('[Aria LiveActivity] stop:', e);
  } finally {
    await writeSlot(null);
  }
}
