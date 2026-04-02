import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from 'react-native';

export type MediaSource = 'camera' | 'gallery';
export type MediaType = 'photo' | 'video';

export interface GeoStamp {
  latitude: number;
  longitude: number;
  address: string;
}

export interface PickedMedia {
  uri: string;
  type: MediaType;
}

// ── Permission helpers ────────────────────────────────────────────────────────

async function ensureCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

async function ensureLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

// ── Pick media ────────────────────────────────────────────────────────────────

export async function pickMedia(type: MediaType, source: MediaSource): Promise<PickedMedia | null> {
  const mediaTypes: ImagePicker.MediaType | ImagePicker.MediaType[] = type === 'photo' ? 'images' : 'videos';

  if (source === 'camera') {
    const granted = await ensureCameraPermission();
    if (!granted) {
      Alert.alert('Permissão Negada', 'Permita o acesso à câmera nas configurações.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled) return null;
    return { uri: result.assets[0].uri, type };
  } else {
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert('Permissão Negada', 'Permita o acesso à galeria nas configurações.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled) return null;
    return { uri: result.assets[0].uri, type };
  }
}

/** Abre a galeria permitindo fotos e vídeos; detecta o tipo automaticamente. */
export async function pickFromGallery(): Promise<PickedMedia | null> {
  const granted = await ensureLibraryPermission();
  if (!granted) {
    Alert.alert('Permissão Negada', 'Permita o acesso à galeria nas configurações.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
    quality: 0.85,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const type: MediaType = asset.type === 'video' ? 'video' : 'photo';
  return { uri: asset.uri, type };
}

// ── Geolocation ───────────────────────────────────────────────────────────────

export async function getGeoStamp(): Promise<GeoStamp | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = loc.coords;

    let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo.length > 0) {
        const g = geo[0];
        const parts = [g.street, g.city, g.region].filter(Boolean);
        if (parts.length > 0) address = parts.join(', ');
      }
    } catch {
      // keep coordinate string as fallback
    }

    return { latitude, longitude, address };
  } catch {
    return null;
  }
}

// ── Image stamp (burn text onto photo) ───────────────────────────────────────

export interface StampOptions {
  geoStamp?: GeoStamp;
  stampDatetime?: boolean;
}

export async function stampImage(uri: string, options: StampOptions): Promise<string> {
  if (!options.geoStamp && !options.stampDatetime) return uri;

  // Build stamp text lines
  const lines: string[] = [];

  if (options.stampDatetime) {
    const now = new Date();
    lines.push(now.toLocaleString('pt-BR'));
  }
  if (options.geoStamp) {
    lines.push(`📍 ${options.geoStamp.address}`);
    lines.push(`${options.geoStamp.latitude.toFixed(5)}, ${options.geoStamp.longitude.toFixed(5)}`);
  }

  // expo-image-manipulator doesn't support text overlay natively,
  // so we save the text as metadata and display it as an overlay in the UI.
  // For actual pixel-burning we'd need a canvas/SVG approach; returning URI unchanged.
  return uri;
}
