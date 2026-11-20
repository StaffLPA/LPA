import React, { useState } from 'react';
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { AgentPanel } from './AgentPanel';

export function StaffAgentBubble() {
  const { user, isReady } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const pathname = usePathname();
  const { height, width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const isStaff = user?.role === 'Admin' || user?.role === 'Staff-Coach';
  const isPublicScreen = segments[0] === 'launch'
    || segments[0] === 'account-deletion'
    || segments[0] === 'build'
    || segments[0] === 'intensity-guide';
  if (!isReady || !isStaff || isPublicScreen || pathname === '/launch') return null;

  const inTabs = segments[0] === '(tabs)';
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) + (inTabs ? 94 : 18);
  const panelHeight = Math.max(
    400,
    Math.min(860, height - Math.max(insets.top, 12) - Math.max(insets.bottom, 12) - (Platform.OS === 'web' ? 24 : 0)),
  );
  const widePanel = Platform.OS === 'web' && width >= 760;

  return <>
    <Pressable
      testID="lpa-ai-agent-bubble"
      accessibilityRole="button"
      accessibilityLabel="Open LPA AI Agent"
      accessibilityHint="Ask a performance question or create a graphic"
      onPress={() => setOpen(true)}
      style={{
        position: 'absolute',
        right: 18,
        bottom,
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: colors.card,
        zIndex: 900,
        elevation: 14,
        shadowColor: colors.foreground,
        shadowOpacity: 0.24,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
      }}
    >
      <Feather name="message-circle" size={25} color={colors.primaryForeground} />
    </Pressable>

    <Modal
      visible={open}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={() => setOpen(false)}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: widePanel ? 'flex-end' : 'stretch' }}>
        <Pressable
          testID="lpa-ai-agent-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close LPA AI Agent"
          onPress={() => setOpen(false)}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.58)' }}
        />
        <View style={{
          width: widePanel ? 500 : '100%',
          height: panelHeight,
          maxHeight: '94%',
          marginHorizontal: widePanel ? 18 : 0,
          marginBottom: Platform.OS === 'web' ? 16 : 0,
          borderWidth: 1,
          borderColor: colors.border,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: widePanel ? 22 : 0,
          borderBottomRightRadius: widePanel ? 22 : 0,
          overflow: 'hidden',
          backgroundColor: colors.background,
          shadowColor: colors.foreground,
          shadowOpacity: 0.2,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 8 },
          elevation: 20,
        }}>
          <View style={{
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            borderBottomWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Feather name="award" size={18} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>LPA AI Agent</Text>
            </View>
            <Pressable
              testID="lpa-ai-agent-close"
              accessibilityRole="button"
              accessibilityLabel="Close LPA AI Agent"
              onPress={() => setOpen(false)}
              hitSlop={10}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={{ flex: 1, minHeight: 0, padding: 10 }}>
            <AgentPanel />
          </View>
        </View>
      </View>
    </Modal>
  </>;
}
