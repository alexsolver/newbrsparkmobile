import { Redirect } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { usePersona } from '../src/context/PersonaContext';
import { getPersonaHomeHref } from '../src/navigation/personaRouting';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * Ponto de entrada “/” — encaminha para a árvore da persona ativa ou login.
 */
export default function AppEntryIndex() {
  const { user, loading } = useAuth();
  const { activePersona } = usePersona();
  const { colors: C } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.cardWhite }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }
  if (!user) {
    return <Redirect href={"/auth/login" as any} />;
  }
  return <Redirect href={getPersonaHomeHref(activePersona) as any} />;
}
