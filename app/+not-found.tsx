import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, space } from '../src/theme/layout';

export default function NotFoundScreen() {
  const { colors: C } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <Text style={[styles.title, { color: C.slate }]}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: C.primary }]}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  link: {
    marginTop: space.sm,
    paddingVertical: space.sm,
  },
  linkText: {
    fontSize: fontSize.sm,
  },
});
