import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider, useApp, useLiveSync } from '@/context/AppContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { MessageNotificationCenter } from '@/components/MessageNotificationCenter';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const publicDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
setBaseUrl(apiBaseUrl || `https://${publicDomain || 'localhost'}`);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 4_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const launchParams = useLocalSearchParams<{ returnTo?: string }>();
  const { user, isReady } = useApp();

  useEffect(() => {
    if (!isReady) return;

    const onLaunch = segments[0] === 'launch';
    const onAdminDashboard = segments.some((segment) => segment === 'admin-dashboard');

    if (!user && !onLaunch) {
      router.replace(
        onAdminDashboard
          ? { pathname: '/launch', params: { returnTo: '/admin-dashboard' } }
          : '/launch',
      );
      return;
    }

    if (user && onLaunch) router.replace(launchParams.returnTo === '/admin-dashboard' ? '/admin-dashboard' : '/(tabs)');
  }, [isReady, launchParams.returnTo, router, segments, user]);

  return (
    <Stack initialRouteName="launch" screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="launch" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="admin-users" options={{ headerShown: false }} />
      <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="new-chat" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ headerShown: false }} />
    </Stack>
  );
}

function LiveSyncNotice() {
  const { isSyncing, syncError, syncSharedData } = useLiveSync();

  if (!syncError) return null;

  return (
    <Pressable
      testID="retry-live-sync"
      accessibilityRole="button"
      onPress={() => void syncSharedData()}
      style={styles.liveSyncNotice}
    >
      <Text style={styles.liveSyncNoticeText}>
        {isSyncing ? 'Refreshing shared LPA data…' : syncError}
      </Text>
    </Pressable>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AppProvider>
                <RootLayoutNav />
                <LiveSyncNotice />
                <MessageNotificationCenter />
              </AppProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  liveSyncNotice: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 92,
    backgroundColor: '#5A2418',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  liveSyncNoticeText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
  },
});
