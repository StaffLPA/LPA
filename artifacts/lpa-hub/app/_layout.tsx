import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { DarkTheme, Stack, ThemeProvider, usePathname, useRouter, useSegments } from 'expo-router';
import { safeFormPath } from '@/lib/formNavigation';
import * as SplashScreen from 'expo-splash-screen';
import { FontDisplay, type FontSource } from 'expo-font';
import { AppProvider, useApp, useLiveSync } from '@/context/AppContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { MessageNotificationCenter } from '@/components/MessageNotificationCenter';
import { useColors } from '@/hooks/useColors';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
const productionApiBaseUrl = 'https://adequate-acceptable-debugger.replit.app';
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const publicDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
setBaseUrl(apiBaseUrl || (publicDomain ? `https://${publicDomain}` : productionApiBaseUrl));

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
  const pathname = usePathname();
  const { user, isReady } = useApp();

  useEffect(() => {
    if (!isReady) return;

    const onLaunch = segments[0] === 'launch';
    const onAdminDashboard = segments.some((segment) => segment === 'admin-dashboard');
    const onAccountDeletion = Platform.OS === 'web' && segments[0] === 'account-deletion';
    const onPublicBuild = (segments[0] as string) === 'build' || (segments[0] as string) === 'intensity-guide';

    if (!user && !onLaunch && !onAccountDeletion && !onPublicBuild) {
      router.replace(
        safeFormPath(pathname)
          ? { pathname: '/launch', params: { returnTo: pathname } }
          : onAdminDashboard
          ? { pathname: '/launch', params: { returnTo: '/admin-dashboard' } }
          : '/launch',
      );
      return;
    }

    // Launch owns the authenticated redirect using its actual route params.
    // Reading child returnTo params from this root layout races that redirect.
  }, [isReady, pathname, router, segments, user]);

  return (
    <Stack initialRouteName="launch" screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="launch" options={{ headerShown: false }} />
      <Stack.Screen name="account-deletion" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="admin-users" options={{ headerShown: false }} />
      <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="daily-rollcall/index" options={{ headerShown: false }} />
      <Stack.Screen name="daily-rollcall/[category]" options={{ headerShown: false }} />
      <Stack.Screen name="family" options={{ headerShown: false }} />
      <Stack.Screen name="forms/index" options={{ headerShown: false }} />
      <Stack.Screen name="forms/settings" options={{ headerShown: false }} />
      <Stack.Screen name="forms/[id]" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="metrics/index" options={{ headerShown: false }} />
      <Stack.Screen name="metrics/reports" options={{ headerShown: false }} />
      <Stack.Screen name="metrics/athlete/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="metrics/report/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="new-chat" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ headerShown: false }} />
      <Stack.Screen name="build" options={{ headerShown: false }} />
      <Stack.Screen name="intensity-guide" options={{ headerShown: false }} />
    </Stack>
  );
}

function AppNavigation() {
  const colors = useColors();
  if (Platform.OS !== 'web') return <RootLayoutNav />;
  // Navigation owns the area outside centered scenes; its default light
  // background must not show through around LPA's dark desktop content.
  return (
    <ThemeProvider value={{
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: colors.background,
        card: colors.card,
        text: colors.foreground,
        border: colors.border,
        primary: colors.primary,
        notification: colors.primary,
      },
    }}>
      <RootLayoutNav />
    </ThemeProvider>
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

// Web uses font-display: swap so text paints in the system fallback immediately
// instead of rendering invisible while Inter downloads. Native is unchanged.
const webFont = (asset: number): FontSource =>
  Platform.OS === 'web' ? { uri: asset, display: FontDisplay.SWAP } : asset;
const interFonts: Record<string, FontSource> = {
  Inter_400Regular: webFont(Inter_400Regular),
  Inter_500Medium: webFont(Inter_500Medium),
  Inter_600SemiBold: webFont(Inter_600SemiBold),
  Inter_700Bold: webFont(Inter_700Bold),
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(interFonts);

  // On web, wait briefly for Inter so text never paints blank, but never block forever.
  const [webFontTimeout, setWebFontTimeout] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const timer = setTimeout(() => setWebFontTimeout(true), 800);
    return () => clearTimeout(timer);
  }, []);
  const fontsSettled = fontsLoaded || !!fontError || (Platform.OS === 'web' && webFontTimeout);

  useEffect(() => {
    if (fontsSettled) {
      SplashScreen.hideAsync();
    }
  }, [fontsSettled]);

  if (!fontsSettled) return Platform.OS === 'web' ? <View style={styles.webBoot} /> : null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AppProvider>
                <AppNavigation />
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
  webBoot: { flex: 1, backgroundColor: '#050505' },
  liveSyncNotice: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: Platform.OS === 'web' ? 100 : 92,
    ...(Platform.OS === 'web' ? { maxWidth: 520, marginHorizontal: 'auto' as const } : null),
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
