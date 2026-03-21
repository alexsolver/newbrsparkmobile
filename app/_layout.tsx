import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { initDatabase } from '../src/database';
import { ApiService } from '../src/services/api';

export default function RootLayout() {
  useEffect(() => {
    initDatabase();
    ApiService.sync();
    const intervalId = setInterval(() => { ApiService.sync(); }, 300000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
