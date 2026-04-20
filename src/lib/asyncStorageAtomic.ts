import AsyncStorage from '@react-native-async-storage/async-storage';

type ReleaseFn = () => void;

const keyWaiters = new Map<string, Array<() => void>>();

async function acquireKeyLock(key: string): Promise<ReleaseFn> {
  return new Promise<ReleaseFn>((resolve) => {
    const queue = keyWaiters.get(key);
    if (!queue) {
      keyWaiters.set(key, []);
      resolve(() => releaseKeyLock(key));
      return;
    }
    queue.push(() => resolve(() => releaseKeyLock(key)));
  });
}

function releaseKeyLock(key: string): void {
  const queue = keyWaiters.get(key);
  if (!queue) return;
  const next = queue.shift();
  if (next) {
    next();
    return;
  }
  keyWaiters.delete(key);
}

export async function withAsyncStorageKeyLock<T>(
  key: string,
  work: () => Promise<T>
): Promise<T> {
  const release = await acquireKeyLock(key);
  try {
    return await work();
  } finally {
    release();
  }
}

export type UpdateJsonArrayOptions = {
  removeWhenEmpty?: boolean;
};

/**
 * Atualiza um array JSON no AsyncStorage de forma serializada por chave.
 * Evita corrida read-modify-write quando múltiplos fluxos escrevem a mesma key.
 */
export async function updateStoredJsonArray<T>(
  key: string,
  updater: (current: T[]) => T[] | Promise<T[]>,
  options?: UpdateJsonArrayOptions
): Promise<T[]> {
  return withAsyncStorageKeyLock(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    let current: T[] = [];
    try {
      current = raw ? JSON.parse(raw) : [];
    } catch {
      current = [];
    }
    if (!Array.isArray(current)) current = [];

    const nextRaw = await updater([...current]);
    const next = Array.isArray(nextRaw) ? nextRaw : [];

    if (options?.removeWhenEmpty && next.length === 0) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    }
    return next;
  });
}

/**
 * Atualiza array JSON sem adquirir o lock da chave — usar **apenas** dentro de
 * `withAsyncStorageKeyLock(key, ...)` para o mesmo `key`, para evitar deadlock com `updateStoredJsonArray`.
 */
export async function updateStoredJsonArrayWhileLockHeld<T>(
  key: string,
  updater: (current: T[]) => T[] | Promise<T[]>,
  options?: UpdateJsonArrayOptions
): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  let current: T[] = [];
  try {
    current = raw ? JSON.parse(raw) : [];
  } catch {
    current = [];
  }
  if (!Array.isArray(current)) current = [];

  const nextRaw = await updater([...current]);
  const next = Array.isArray(nextRaw) ? nextRaw : [];

  if (options?.removeWhenEmpty && next.length === 0) {
    await AsyncStorage.removeItem(key);
  } else {
    await AsyncStorage.setItem(key, JSON.stringify(next));
  }
  return next;
}

export async function appendUniqueStringToStoredArray(
  key: string,
  value: string
): Promise<boolean> {
  const id = String(value || '').trim();
  if (!id) return false;
  let inserted = false;
  await updateStoredJsonArray<string>(key, (arr) => {
    if (arr.includes(id)) return arr;
    inserted = true;
    return [...arr, id];
  });
  return inserted;
}
