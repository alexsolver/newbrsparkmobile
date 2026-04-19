import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="identifier" />
      <Stack.Screen name="otp-verify" />
      <Stack.Screen name="legal-sign" />
      <Stack.Screen name="awaiting-approval" />
      <Stack.Screen name="simulator" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="tech-registration" />
    </Stack>
  );
}
