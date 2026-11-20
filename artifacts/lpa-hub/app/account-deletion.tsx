import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestAccountDeletion } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { LpaIcon as Feather } from '@/components/LpaIcon';

export default function AccountDeletionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requestDeletion = useRequestAccountDeletion();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isAccepted, setIsAccepted] = useState(false);

  if (Platform.OS !== 'web') return <Redirect href="/launch" />;

  const submit = async () => {
    const accountEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
      setIsAccepted(false);
      setMessage('Enter the email address associated with the LPA Hub account.');
      return;
    }
    setMessage('');
    setIsAccepted(false);
    try {
      const result = await requestDeletion.mutateAsync({ data: { email: accountEmail } });
      setEmail('');
      setIsAccepted(true);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your request could not be sent. Please try again later.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, {
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 28,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 28,
        }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            testID="account-deletion-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/launch')}
            style={styles.back}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
            <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
          </Pressable>
          <Image source={require('../assets/lpa-badge.png')} accessibilityLabel="Legendary Prep Academy badge" resizeMode="contain" style={styles.logo} />
          <Text style={[styles.kicker, { color: colors.primary }]}>LEGENDARY PREP ACADEMY</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Request account deletion</Text>
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>
            Submit the email address on the LPA Hub account. Your request will be sent to LPA administrators to review deletion of the account and associated data.
          </Text>
          <Text style={[styles.label, { color: colors.foreground }]}>Account email</Text>
          <TextInput
            testID="account-deletion-email"
            accessibilityLabel="Account email"
            value={email}
            onChangeText={(value) => { setEmail(value); setMessage(''); setIsAccepted(false); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            placeholder="name@example.com"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            editable={!requestDeletion.isPending}
            maxLength={254}
          />
          <Text style={[styles.notice, { color: colors.mutedForeground }]}>
            An administrator will verify your request before processing it. Current LPA removal may retain shared conversation content and some athlete performance history. This form does not delete data automatically.
          </Text>
          <Pressable
            testID="submit-account-deletion"
            accessibilityRole="button"
            accessibilityState={{ disabled: requestDeletion.isPending || !email.trim(), busy: requestDeletion.isPending }}
            disabled={requestDeletion.isPending || !email.trim()}
            onPress={() => void submit()}
            style={[styles.button, { backgroundColor: colors.destructive, opacity: requestDeletion.isPending || !email.trim() ? 0.55 : 1 }]}
          >
            {requestDeletion.isPending
              ? <ActivityIndicator color={colors.destructiveForeground} />
              : <Text style={[styles.buttonText, { color: colors.destructiveForeground }]}>Send deletion request</Text>}
          </Pressable>
          {message ? (
            <Text accessibilityRole="alert" testID="account-deletion-message" style={[styles.message, { color: isAccepted ? colors.success : colors.destructive }]}>
              {message}
            </Text>
          ) : null}
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  panel: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 24, borderWidth: 1, borderRadius: 22 },
  back: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 18 },
  backText: { fontSize: 13, fontWeight: '600' },
  logo: { width: 86, height: 122, alignSelf: 'center', marginBottom: 18 },
  kicker: { fontWeight: '700', fontSize: 10, letterSpacing: 1.4, marginBottom: 10 },
  title: { fontWeight: '700', fontSize: 30, lineHeight: 36 },
  copy: { fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 23 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  notice: { fontSize: 12, lineHeight: 18, marginTop: 12, marginBottom: 18 },
  button: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 14, fontWeight: '700' },
  message: { fontSize: 13, lineHeight: 19, marginTop: 15 },
});
