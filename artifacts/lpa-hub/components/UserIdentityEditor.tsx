import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateUserIdentity } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useLiveSync } from '@/context/AppContext';

export function UserIdentityEditor({ user }: { user: { id: string; fullName: string; email?: string | null } }) {
  const colors = useColors();
  const queries = useQueryClient();
  const { syncSharedData } = useLiveSync();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const update = useUpdateUserIdentity();
  const start = () => {
    setName(user.fullName);
    setEmail(user.email ?? '');
    setError('');
    setSaved(false);
    setOpen(true);
  };
  const save = async () => {
    if (update.isPending) return;
    const fullName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!fullName || fullName.length > 200 || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a full name and a valid email address.');
      return;
    }
    setError('');
    try {
      await update.mutateAsync({ id: user.id, data: { fullName, email: normalizedEmail } });
      setOpen(false);
      setSaved(true);
      void queries.invalidateQueries();
      void syncSharedData();
    } catch (cause) {
      setError(cause instanceof Error && 'status' in cause && cause.status === 404
        ? 'Name and email editing is not available on this server yet. Publish the updated API server, then retry.'
        : cause instanceof Error ? cause.message : 'Could not save. Please retry.');
    }
  };
  if (!open) return <View style={styles.container}>
    <Pressable testID={`edit-identity-${user.id}`} accessibilityRole="button" accessibilityLabel={`Edit name and email for ${user.fullName}`} onPress={start} style={[styles.button, { borderColor: colors.border }]}>
      <Text style={[styles.buttonText, { color: colors.primary }]}>Edit name & email</Text>
    </Pressable>
    {saved ? <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: colors.accent }]}>Name and email saved.</Text> : null}
  </View>;
  return <View style={[styles.container, styles.form, { borderColor: colors.border }]}>
    <Text style={[styles.label, { color: colors.foreground }]}>Full name</Text>
    <TextInput testID={`identity-name-${user.id}`} accessibilityLabel="Full name" value={name} onChangeText={setName} editable={!update.isPending} autoCapitalize="words" maxLength={200} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
    <Text style={[styles.label, { color: colors.foreground }]}>Email address</Text>
    <TextInput testID={`identity-email-${user.id}`} accessibilityLabel="Email address" value={email} onChangeText={setEmail} editable={!update.isPending} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
    <Text style={[styles.copy, { color: colors.mutedForeground }]}>A new email becomes this person’s sign-in email. Their account and history stay the same. No invitation is resent.</Text>
    {error ? <Text accessibilityRole="alert" style={[styles.copy, { color: colors.destructive }]}>{error}</Text> : null}
    <View style={styles.actions}>
      <Pressable testID={`cancel-identity-${user.id}`} accessibilityRole="button" disabled={update.isPending} onPress={() => setOpen(false)} style={[styles.button, { borderColor: colors.border }]}><Text style={[styles.buttonText, { color: colors.foreground }]}>Cancel</Text></Pressable>
      <Pressable testID={`save-identity-${user.id}`} accessibilityRole="button" disabled={update.isPending} onPress={() => void save()} style={[styles.button, { borderColor: colors.primary, backgroundColor: colors.primary, opacity: update.isPending ? 0.6 : 1 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{update.isPending ? 'Saving…' : 'Save changes'}</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 10, gap: 8 },
  form: { padding: 12, borderWidth: 1, borderRadius: 12 },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 14 },
  copy: { fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 8 },
  buttonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
