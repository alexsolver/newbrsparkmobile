import { useEffect, useState } from 'react';
import type { User } from '../services/auth';
import { resolveAvatarUri } from '../services/avatarLocalCache';

/**
 * URI estável para o avatar do usuário: preferência por arquivo local (offline).
 */
export function useResolvedAvatarUri(user: User | null | undefined): string | undefined {
  const [uri, setUri] = useState<string | undefined>(
    () => user?.avatarLocalUri || user?.avatarUrl
  );

  useEffect(() => {
    let cancel = false;
    setUri(user?.avatarLocalUri || user?.avatarUrl);
    (async () => {
      const resolved = await resolveAvatarUri(user ?? null);
      if (!cancel) setUri(resolved);
    })();
    return () => {
      cancel = true;
    };
  }, [user?.id, user?.avatarUrl, user?.avatarLocalUri]);

  return uri;
}
