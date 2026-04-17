import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

const STORAGE_KEY = '@brspark_tech_live_activity_slot';

type Slot = { activityId: string; taskId: string; appDisplayName?: string };
const DEFAULT_LIVE_ACTIVITY_BADGE_KEY = 'brspark-badge';

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

function normalizeHexColor(value: string | undefined | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{8}$/.test(raw)) return raw.slice(0, 7);
  return null;
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

function resolveLiveActivityBadgeKey(value: string | undefined | null): string {
  const raw = String(value || '').trim();
  return raw === 'brspark-badge' ? raw : DEFAULT_LIVE_ACTIVITY_BADGE_KEY;
}

/**
 * Live Activity estilo «cartão em baixo» no Lock Screen (iOS 16.2+).
 * Só funciona em build com `expo-live-activity` (dev client / EAS); no Expo Go não há módulo nativo.
 */
export async function startTechTaskLiveActivity(params: {
  taskId: string;
  title: string;
  subtitle?: string;
  appDisplayName?: string;
  liveActivityBadgeKey?: string;
  primaryColor?: string;
  accentColor?: string;
  secondaryColor?: string;
  surfaceColor?: string;
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
    const appDisplayName = String(params.appDisplayName || 'BrSpark').trim() || 'BrSpark';
    const liveActivityBadgeKey = resolveLiveActivityBadgeKey(params.liveActivityBadgeKey);
    const deepLinkUrl = `/checklist/${encodeURIComponent(taskId)}`;
    const primaryColor = normalizeHexColor(params.primaryColor);
    const accentColor = normalizeHexColor(params.accentColor);
    const secondaryColor = normalizeHexColor(params.secondaryColor);
    const surfaceColor = normalizeHexColor(params.surfaceColor);
    const backgroundColor = primaryColor || surfaceColor || '#0f172a';
    const titleColor = getContrastText(backgroundColor);
    const subtitleColor =
      secondaryColor && secondaryColor.toLowerCase() !== backgroundColor.toLowerCase()
        ? secondaryColor
        : titleColor === '#0F172A'
          ? '#334155'
          : '#CBD5E1';
    const progressViewTint = accentColor || primaryColor || '#2563eb';

    const activityId = LiveActivity.startActivity(
      {
        title,
        subtitle,
        imageName: liveActivityBadgeKey,
        dynamicIslandImageName: liveActivityBadgeKey,
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

    if (activityId) await writeSlot({ activityId, taskId, appDisplayName });
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
      title: slot.appDisplayName || 'BrSpark',
      subtitle: 'Concluído.',
    });
  } catch (e) {
    console.warn('[BrSpark LiveActivity] stop:', e);
  } finally {
    await writeSlot(null);
  }
}
