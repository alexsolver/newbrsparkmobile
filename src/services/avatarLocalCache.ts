import * as FileSystem from 'expo-file-system/legacy';

const SUBDIR = 'brspark_avatars/';

function docDir(): string | null {
  return FileSystem.documentDirectory;
}

function avatarPaths(userId: string): { jpg: string; png: string } {
  const d = docDir() || '';
  return {
    jpg: `${d}${SUBDIR}${userId}_avatar.jpg`,
    png: `${d}${SUBDIR}${userId}_avatar.png`,
  };
}

async function ensureAvatarDir(): Promise<boolean> {
  const d = docDir();
  if (!d) return false;
  const dir = d + SUBDIR;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return true;
  } catch {
    return false;
  }
}

/** Grava cópia local do avatar a partir do base64 (upload). */
export async function writeAvatarFromBase64(
  userId: string,
  base64: string,
  ext: string
): Promise<string | undefined> {
  if (!base64 || !(await ensureAvatarDir())) return undefined;
  const safeExt = ext.toLowerCase() === 'png' ? 'png' : 'jpg';
  const d = docDir()!;
  const path = `${d}${SUBDIR}${userId}_avatar.${safeExt}`;
  const other = `${d}${SUBDIR}${userId}_avatar.${safeExt === 'png' ? 'jpg' : 'png'}`;
  try {
    const o = await FileSystem.getInfoAsync(other);
    if (o.exists) await FileSystem.deleteAsync(other);
  } catch {
    /* ignore */
  }
  await FileSystem.writeAsStringAsync(path, base64, { encoding: 'base64' });
  return path;
}

/** Remove arquivos de avatar locais do usuário. */
export async function deleteAvatarCache(userId: string): Promise<void> {
  const { jpg, png } = avatarPaths(userId);
  for (const p of [jpg, png]) {
    try {
      const info = await FileSystem.getInfoAsync(p);
      if (info.exists) await FileSystem.deleteAsync(p);
    } catch {
      /* ignore */
    }
  }
}

/** URI para mostrar: arquivo local se existir; senão URL remota. */
export async function resolveAvatarUri(
  user: { avatarUrl?: string; avatarLocalUri?: string } | null | undefined
): Promise<string | undefined> {
  if (!user) return undefined;
  if (user.avatarLocalUri) {
    try {
      const info = await FileSystem.getInfoAsync(user.avatarLocalUri);
      if (info.exists && !info.isDirectory) return user.avatarLocalUri;
    } catch {
      /* fall through */
    }
  }
  return user.avatarUrl;
}

export type AvatarMergeUser = {
  id: string;
  avatarUrl?: string;
  avatarLocalUri?: string;
};

/**
 * Preserva avatarLocalUri se a URL remota não mudou e o arquivo ainda existe.
 * Se a URL mudou, apaga cache antigo (nova imagem será descarregada depois).
 */
export async function mergeServerUserWithLocalAvatar<T extends AvatarMergeUser>(
  prev: T | null,
  server: T
): Promise<T> {
  if (!prev || prev.id !== server.id) return server;
  if (server.avatarUrl !== prev.avatarUrl) {
    await deleteAvatarCache(server.id);
    return { ...server };
  }
  if (prev.avatarLocalUri) {
    try {
      const info = await FileSystem.getInfoAsync(prev.avatarLocalUri);
      if (info.exists && !info.isDirectory) {
        return { ...server, avatarLocalUri: prev.avatarLocalUri };
      }
    } catch {
      /* drop stale uri */
    }
  }
  return server;
}

/** Descarrega avatar remoto para disco (login / arranque com rede). */
export async function cacheAvatarFromRemoteUrl(
  userId: string,
  avatarUrl: string
): Promise<string | undefined> {
  if (!avatarUrl || !/^https?:\/\//i.test(avatarUrl)) return undefined;
  if (!(await ensureAvatarDir())) return undefined;
  const tail = avatarUrl.split('?')[0].split('.').pop()?.toLowerCase();
  const safeExt = tail === 'png' ? 'png' : 'jpg';
  const d = docDir()!;
  const dest = `${d}${SUBDIR}${userId}_avatar.${safeExt}`;
  const other = `${d}${SUBDIR}${userId}_avatar.${safeExt === 'png' ? 'jpg' : 'png'}`;
  try {
    const o = await FileSystem.getInfoAsync(other);
    if (o.exists) await FileSystem.deleteAsync(other);
  } catch {
    /* ignore */
  }
  try {
    const result = await FileSystem.downloadAsync(avatarUrl, dest);
    if (result.status !== 200) return undefined;
    return result.uri;
  } catch {
    return undefined;
  }
}

export async function hasLocalAvatarFile(user: AvatarMergeUser | null | undefined): Promise<boolean> {
  if (!user?.avatarLocalUri) return false;
  try {
    const info = await FileSystem.getInfoAsync(user.avatarLocalUri);
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

/** Garante cópia local quando há URL mas ainda não há arquivo (não bloqueia UI). */
export async function warmAvatarCacheForUser(
  user: AvatarMergeUser | null | undefined,
  patchUser: (partial: { avatarLocalUri: string }) => Promise<void>
): Promise<void> {
  if (!user?.id || !user.avatarUrl) return;
  if (await hasLocalAvatarFile(user)) return;
  if (!/^https?:\/\//i.test(user.avatarUrl)) return;
  const local = await cacheAvatarFromRemoteUrl(user.id, user.avatarUrl);
  if (local) await patchUser({ avatarLocalUri: local });
}
