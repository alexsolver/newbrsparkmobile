/**
 * Reduz fotos de checklist antes do upload base64 → JSON (/api/storage/upload),
 * evitando payloads enormes, timeouts e falhas intermitentes em redes móveis.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.82;

const COMPRESSIBLE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

function guessExtFromPath(uri: string): string {
  const pathOnly = uri.split('?')[0];
  const m = pathOnly.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err)
    );
  });
}

/**
 * Devolve URI de ficheiro JPEG (nova) ou a original se não for imagem comprimível / falhar.
 */
export async function compressLocalImageForChecklistSyncUpload(localFileUri: string): Promise<string> {
  const ext = guessExtFromPath(localFileUri);
  if (!COMPRESSIBLE_EXT.has(ext)) return localFileUri;

  try {
    const { width: w, height: h } = await getImageSize(localFileUri);
    const shouldTranscode = ['png', 'webp', 'heic', 'heif'].includes(ext);

    const actions: ImageManipulator.Action[] = [];
    if (w > 0 && h > 0) {
      if (w >= h) {
        if (w > MAX_EDGE_PX) actions.push({ resize: { width: MAX_EDGE_PX } });
      } else if (h > MAX_EDGE_PX) {
        actions.push({ resize: { height: MAX_EDGE_PX } });
      }
    } else {
      actions.push({ resize: { width: MAX_EDGE_PX } });
    }

    if (actions.length === 0 && !shouldTranscode) {
      return localFileUri;
    }

    const resizeActions =
      actions.length > 0
        ? actions
        : [{ resize: { width: w > 0 ? Math.min(w, MAX_EDGE_PX) : MAX_EDGE_PX } }];

    const result = await ImageManipulator.manipulateAsync(
      localFileUri,
      resizeActions,
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (e) {
    console.warn('[checklistMediaUploadPrep] compress:', e);
    return localFileUri;
  }
}

export function isProbablyVideoExt(ext: string): boolean {
  return ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'].includes(String(ext || '').toLowerCase());
}
