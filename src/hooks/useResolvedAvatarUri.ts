import { useEffect, useState } from 'react';
import type { User } from '../services/auth';
import { API_BASE } from '../services/appApiBase';
import { resolveAvatarUri } from '../services/avatarLocalCache';
import { normalizeUserAvatarUrl } from '../utils/normalizeUserAvatarUrl';

function displayAvatarUri(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith('file:')) return raw;
  return normalizeUserAvatarUrl(raw, API_BASE);
}

/**
 * URI estável para o avatar do usuário: preferência por arquivo local (offline).
 */
export function useResolvedAvatarUri(user: User | null | undefined): string | undefined {
  const [uri, setUri] = useState<string | undefined>(() =>
    displayAvatarUri(user?.avatarLocalUri || user?.avatarUrl)
  );

  useEffect(() => {
    let cancel = false;
    setUri(displayAvatarUri(user?.avatarLocalUri || user?.avatarUrl));
    (async () => {
      const resolved = await resolveAvatarUri(user ?? null);
      if (!cancel) setUri(displayAvatarUri(resolved));
    })();
    return () => {
      cancel = true;
    };
  }, [user?.id, user?.avatarUrl, user?.avatarLocalUri]);

  return uri;
}
