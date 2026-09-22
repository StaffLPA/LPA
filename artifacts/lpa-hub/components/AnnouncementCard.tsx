import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { LpaIcon } from '@/components/LpaIcon';
import type { Announcement } from '@workspace/api-client-react';

export function AnnouncementCard({
  announcement,
  highlighted
}: {
  announcement: Announcement;
  highlighted: boolean;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);

  const tagsStyles = useMemo(() => ({
    body: { color: colors.foreground, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22 },
    p: { marginVertical: 6 },
    a: { color: colors.primary, textDecorationLine: 'underline' as const },
    h1: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 12, marginBottom: 8 },
    h2: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 10, marginBottom: 6 },
    h3: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.foreground, marginTop: 8, marginBottom: 4 },
  }), [colors]);

  return (
    <View style={[styles.card, { backgroundColor: highlighted ? `${colors.primary}12` : colors.card, borderColor: highlighted ? colors.primary : colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: '#9d4d2c18' }]}>
          <LpaIcon name="bell" size={16} color="#9d4d2c" />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{announcement.title}</Text>
      </View>
      
      <View style={[styles.content, !expanded && styles.collapsed]}>
        <View onLayout={(e) => {
          if (e.nativeEvent.layout.height > 100) {
            setNeedsCollapse(true);
          }
        }}>
          <RenderHtml
            contentWidth={width - 72}
            source={{ html: announcement.body }}
            tagsStyles={tagsStyles}
            renderersProps={{
              a: {
                onPress: async (_, href) => {
                  if (href) await WebBrowser.openBrowserAsync(href);
                }
              }
            }}
          />
        </View>
      </View>
      
      {(needsCollapse) && (
        <Pressable testID={`announcement-read-more-${announcement.id}`} onPress={() => setExpanded(!expanded)} style={styles.expandButton}>
          <Text style={[styles.expandText, { color: colors.primary }]}>{expanded ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      )}
      
      <Text style={[styles.date, { color: colors.mutedForeground }]}>
        {new Date(announcement.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    flex: 1,
  },
  content: {
    marginBottom: 10,
  },
  collapsed: {
    maxHeight: 100,
    overflow: 'hidden',
  },
  expandButton: {
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  expandText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  date: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  }
});
