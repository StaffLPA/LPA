import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function MessageDateSeparator({ dateKey, label, color }: {
  dateKey: string;
  label: string;
  color: string;
}) {
  return <View style={styles.container}>
    <Text testID={`message-date-${dateKey}`} accessibilityRole="header" style={[styles.label, { color }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 14, paddingBottom: 16 },
  label: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
