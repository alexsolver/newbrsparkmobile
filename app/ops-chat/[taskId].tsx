import { Redirect, useLocalSearchParams } from 'expo-router';
import { taskOsLabel } from '../../src/utils/taskOsLabel';
import { getPersonaTabHref } from '../../src/navigation/personaRouting';

/**
 * Links antigos `/ops-chat/:id` — redireciona para o ecrã unificado de chat (`/chat/[id]?ops=1`).
 */
export default function OpsChatRedirectScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const id = typeof taskId === 'string' ? taskId : Array.isArray(taskId) ? String(taskId[0] || '') : '';
  if (!id) {
    return <Redirect href={getPersonaTabHref('provider', 'chat') as any} />;
  }
  const label = taskOsLabel({ id, osNumber: null, routineTaskNumber: null });
  return (
    <Redirect
      href={{
        pathname: '/chat/[id]',
        params: { id, ops: '1', name: `Gestor · ${label}`, color: '#1d4ed8' },
      }}
    />
  );
}
