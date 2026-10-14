import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSetUserAccountLock } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Target = { id: string; fullName: string; status: string };

export function AccountLockAction({ target }: { target: Target }) {
  const { user } = useApp();
  const colors = useColors();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const mutation = useSetUserAccountLock({
    mutation: {
      onSuccess: (updated) => {
        setConfirming(false);
        setError('');
        const userLists = { predicate: (query: { queryKey: readonly unknown[] }) =>
          typeof query.queryKey[0] === 'string' && query.queryKey[0].includes('/users') };
        queryClient.setQueriesData(userLists, (current: unknown) => Array.isArray(current)
          ? current.map((row) => row.id === updated.id ? { ...row, status: updated.status } : row)
          : current);
        void queryClient.invalidateQueries(userLists);
      },
      onError: (failure) => setError(failure.message || 'Could not change account status. Please try again.'),
    },
  });
  if (user?.email?.trim().toLowerCase() !== 'staff@legendaryprepacademy.com'
    || user.id === target.id || !['active', 'locked'].includes(target.status)) return null;
  const locked = target.status === 'locked';
  const changeLock = (nextLocked: boolean) => {
    setError('');
    mutation.mutate({ id: target.id, data: { locked: nextLocked } });
  };
  return <View style={styles.wrapper}>
    <Pressable
      testID={`${locked ? 'unlock' : 'lock'}-account-${target.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${locked ? 'Unlock' : 'Lock'} account for ${target.fullName}`}
      disabled={mutation.isPending}
      onPress={() => locked ? changeLock(false) : setConfirming(true)}
      style={[styles.action, { borderColor: locked ? colors.primary : colors.destructive }]}
    >
      <Text style={[styles.label, { color: locked ? colors.primary : colors.destructive }]}>
        {mutation.isPending ? 'Updating…' : locked ? 'Unlock Account' : 'Lock Account'}
      </Text>
    </Pressable>
    {error && !confirming ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => { if (!mutation.isPending) setConfirming(false); }}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Lock this account?</Text>
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>
            {target.fullName} will be signed out on all devices and cannot sign in until you unlock the account. Their password, profile, and data will not change.
          </Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Pressable testID={`cancel-account-lock-${target.id}`} disabled={mutation.isPending} accessibilityRole="button" onPress={() => { setConfirming(false); setError(''); }} style={styles.button}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
            <Pressable testID={`confirm-account-lock-${target.id}`} disabled={mutation.isPending} accessibilityRole="button" onPress={() => changeLock(true)} style={[styles.button, { backgroundColor: colors.destructive, borderRadius: 10 }]}>
              <Text style={[styles.label, { color: colors.primaryForeground }]}>{mutation.isPending ? 'Locking…' : 'Lock Account'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'flex-start', marginTop: 10, maxWidth: '100%' },
  action: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 18, padding: 22 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  copy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 12 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  button: { paddingHorizontal: 16, paddingVertical: 12 },
});
