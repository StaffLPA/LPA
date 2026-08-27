import React, { useMemo } from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useListChats } from '@workspace/api-client-react';
import { LpaIcon, type LpaIconName } from '@/components/LpaIcon';

type TabIconProps = { color: string; focused: boolean };

function TabIcon({ color, focused, name }: TabIconProps & { name: LpaIconName }) {
  return <LpaIcon name={name} size={focused ? 23 : 21} color={color} strokeWidth={focused ? 2.1 : 1.8} />;
}

const tabIcons = {
  home: (props: TabIconProps) => <TabIcon {...props} name="home" />,
  messages: (props: TabIconProps) => <TabIcon {...props} name="message-circle" />,
  calendar: (props: TabIconProps) => <TabIcon {...props} name="calendar" />,
  parentHub: (props: TabIconProps) => <TabIcon {...props} name="grid" />,
  schedule: (props: TabIconProps) => <TabIcon {...props} name="clipboard" />,
  more: (props: TabIconProps) => <TabIcon {...props} name="menu" />,
};

export default function TabLayout() {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const isWeb = Platform.OS === 'web';
  const usesNativeBlur = Platform.OS === 'ios';
  const chats = useListChats({ query: { queryKey: ['chats'] } });
  const unreadCount = (chats.data ?? []).reduce((total, chat) => total + chat.unreadCount, 0);
  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground,
    tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 10 },
    tabBarIconStyle: { width: 24, height: 24 },
    tabBarStyle: {
      backgroundColor: usesNativeBlur ? 'transparent' : colors.card,
      borderTopWidth: usesNativeBlur ? 0 : 1,
      borderTopColor: colors.border,
      height: isWeb ? 84 : 82,
      paddingTop: 8,
      elevation: 0,
    },
    tabBarItemStyle: { paddingBottom: 2 },
    tabBarHideOnKeyboard: true,
    lazy: true,
    freezeOnBlur: true,
    tabBarBackground: () => usesNativeBlur
      ? <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />,
  }), [colors, isDark, isWeb, usesNativeBlur]);
  const messageOptions = useMemo(() => ({
    title: 'Messages',
    tabBarBadge: unreadCount || undefined,
    tabBarBadgeStyle: { minWidth: 18, height: 18, fontSize: 10, lineHeight: 18 },
    tabBarIcon: tabIcons.messages,
  }), [unreadCount]);
  return (
    <Tabs
      screenOptions={screenOptions}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcons.home }} />
      <Tabs.Screen name="messages" options={messageOptions} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: tabIcons.calendar }} />
      <Tabs.Screen name="parenthub" options={{ title: 'Parent Hub', tabBarIcon: tabIcons.parentHub }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: tabIcons.schedule }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcons.more }} />
    </Tabs>
  );
}