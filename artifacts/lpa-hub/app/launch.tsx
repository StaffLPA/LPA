import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompleteInvite, useLookupInvite, useRequestPasswordReset, useResetPassword, useSignIn } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type Match = { id: string; fullName: string; role: string } | null;
const inviteStateMessage = {
  ready: 'Your invitation is ready. Please continue creating your account.',
  completed: 'This invitation was already completed. Sign in with the password you created.',
  expired: 'This invitation has expired. Ask your administrator to resend it.',
  revoked: 'This invitation is no longer active. Ask your administrator for a new invite.',
  not_found: "We couldn't find an invitation for that email address. Email capitalization does not matter—please check the spelling.",
} as const;

export default function LaunchScreen() {
  const colors = useColors(), insets = useSafeAreaInsets(), router = useRouter(), lookup = useLookupInvite(), completeInvite = useCompleteInvite(), signInRequest = useSignIn(), passwordResetRequest = useRequestPasswordReset(), resetPasswordRequest = useResetPassword(), { user, isReady, completeAuthentication } = useApp(), params = useLocalSearchParams<{ returnTo?: string; identifier?: string }>();
  const destination = params.returnTo === '/admin-dashboard' ? '/admin-dashboard' : '/(tabs)';
  const [identifier, setIdentifier] = useState(params.identifier ?? ''), [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(''), [match, setMatch] = useState<Match>(null), [signInMode, setSignInMode] = useState(destination === '/admin-dashboard'), [message, setMessage] = useState('');
  const [authMode, setAuthMode] = useState<'standard' | 'forgot' | 'reset'>('standard');
  const [resetCode, setResetCode] = useState(''), [newPassword, setNewPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('');
  useEffect(() => { if (params.identifier) setIdentifier(params.identifier); }, [params.identifier]);
  useEffect(() => { if (isReady && user) router.replace(destination); }, [destination, isReady, router, user]);
  const findInvite = () => {
    setMessage('');
    lookup.mutate({ data: { identifier } }, {
      onSuccess: (result) => {
        if (result.found && result.user) {
          setMatch({ id: result.user.id, fullName: result.user.fullName, role: result.user.role });
          setFullName(result.user.fullName);
          return;
        }
        if (result.state === 'completed') setSignInMode(true);
        setMessage(inviteStateMessage[result.state]);
      },
      onError: () => setMessage('Could not check your invitation. Check your connection and try again.'),
    });
  };
  const signIn = () => {
    setMessage('');
    signInRequest.mutate({ data: { identifier, password } }, {
      onSuccess: async (result) => {
        await completeAuthentication(result.user, result.sessionToken);
        router.replace(destination);
      },
      onError: (error) => setMessage(error.message || 'Could not sign in. Please try again.'),
    });
  };
  const complete = () => {
    if (!match) return;
    setMessage('');
    completeInvite.mutate({ data: { userId: match.id, fullName, password } }, {
      onSuccess: async (result) => {
        await completeAuthentication(result.user, result.sessionToken);
        router.replace(destination);
      },
      onError: (error) => setMessage(error.message || 'Could not complete your invite. Please try again.'),
    });
  };
  const requestPasswordReset = () => {
    setMessage('');
    passwordResetRequest.mutate({ data: { identifier } }, {
      onSuccess: (result) => {
        setResetCode('');
        setAuthMode('reset');
        setMessage(result.message);
      },
      onError: (error) => setMessage(error.message || 'Could not request a password reset. Please try again.'),
    });
  };
  const resetPassword = () => {
    setMessage('');
    if (newPassword !== confirmPassword) { setMessage('The new passwords do not match.'); return; }
    if (!/^\d{6}$/.test(resetCode)) { setMessage('Enter the six-digit authentication code from your email.'); return; }
    resetPasswordRequest.mutate({ data: { identifier, code: resetCode, newPassword } }, {
      onSuccess: (result) => {
        setPassword('');
        setResetCode('');
        setNewPassword('');
        setConfirmPassword('');
        setAuthMode('standard');
        setSignInMode(true);
        setMessage(result.message);
      },
      onError: (error) => setMessage(error.message || 'Could not reset your password. Request a new code.'),
    });
  };
  if (!isReady) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  const loading = lookup.isPending || completeInvite.isPending || signInRequest.isPending || passwordResetRequest.isPending || resetPasswordRequest.isPending;
  const title = authMode === 'forgot' ? 'Reset your password.' : authMode === 'reset' ? 'Choose a new password.' : match ? `Welcome, ${match.fullName.split(' ')[0]}.` : 'Welcome to LPA.';
  const copy = authMode === 'forgot' ? 'Enter the email address used for your LPA invite. We’ll email a six-digit authentication code.' : authMode === 'reset' ? `Enter the six-digit code sent to ${identifier}, then choose a new password. The code expires after 30 minutes.` : match ? `Create a password to finish your ${match.role} account.` : signInMode ? 'Sign in with the password you created during invite completion.' : 'Were you invited? Enter the email address from your invitation.';
  return <View style={[styles.container, { backgroundColor: colors.background }]}><KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 30 }]} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" bottomOffset={24}><Image source={require('../assets/lpa-badge.png')} accessibilityLabel="Legendary Prep Academy badge" resizeMode="contain" style={styles.logo} /><Text style={[styles.kicker, { color: colors.primary }]}>LEGENDARY PREP ACADEMY</Text><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text><Text style={[styles.copy, { color: colors.mutedForeground }]}>{copy}</Text>{authMode === 'forgot' ? <><TextInput testID="reset-email" value={identifier} onChangeText={(next) => { setIdentifier(next); setMessage(''); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.mutedForeground} style={styles.input} editable={!loading} /><Pressable testID="request-password-reset" disabled={loading} onPress={requestPasswordReset} style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send authentication code</Text>}</Pressable><Pressable disabled={loading} onPress={() => { setAuthMode('standard'); setSignInMode(true); setMessage(''); }}><Text style={[styles.link, { color: colors.accent }]}>Back to sign in</Text></Pressable></> : authMode === 'reset' ? <><TextInput testID="reset-code" value={resetCode} onChangeText={(next) => { setResetCode(next.replace(/\D/g, '').slice(0, 6)); setMessage(''); }} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} placeholder="6-digit authentication code" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.codeInput]} editable={!loading} /><TextInput testID="new-password" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="New password (8+ characters)" placeholderTextColor={colors.mutedForeground} style={styles.input} editable={!loading} /><TextInput testID="confirm-new-password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Confirm new password" placeholderTextColor={colors.mutedForeground} style={styles.input} editable={!loading} /><Pressable testID="reset-password" disabled={loading} onPress={resetPassword} style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update password</Text>}</Pressable><Pressable disabled={loading} onPress={() => { setAuthMode('forgot'); setMessage(''); }}><Text style={[styles.link, { color: colors.accent }]}>Change email or send a new code</Text></Pressable></> : match ? <><TextInput value={fullName} onChangeText={setFullName} placeholder="Confirm your name" placeholderTextColor={colors.mutedForeground} style={styles.input} editable={!loading} /><TextInput testID="account-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Create a password (8+ characters)" placeholderTextColor={colors.mutedForeground} style={styles.input} editable={!loading} /><Pressable testID="complete-account" disabled={loading} onPress={complete} style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Complete account</Text>}</Pressable></> : <><TextInput testID="invite-identifier" value={identifier} onChangeText={(next) => { setIdentifier(next); setMessage(''); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.mutedForeground} style={styles.input} editable={!loading} />{signInMode ? <><TextInput testID="sign-in-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" placeholderTextColor={colors.mutedForeground} style={styles.input} editable={!loading} /><Pressable testID="forgot-password" disabled={loading} onPress={() => { setAuthMode('forgot'); setMessage(''); }}><Text style={[styles.forgotLink, { color: colors.accent }]}>Forgot password?</Text></Pressable></> : null}<Pressable testID={signInMode ? 'sign-in' : 'find-invite'} disabled={loading} onPress={signInMode ? signIn : findInvite} style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{signInMode ? 'Sign in' : 'Find my invite'}</Text>}</Pressable><Pressable disabled={loading} onPress={() => { setSignInMode(!signInMode); setMessage(''); }}><Text style={[styles.link, { color: colors.accent }]}>{signInMode ? 'Need to complete an invite?' : 'Already completed your invite? Sign in'}</Text></Pressable></>}{message ? <Text style={[styles.message, { color: message.startsWith('If that') || message.startsWith('Password updated') ? colors.primary : colors.destructive }]}>{message}</Text> : null}<Text style={[styles.footer, { color: colors.mutedForeground }]}>LPA is invite-only. Need access? Contact your administrator.</Text></KeyboardAwareScrollViewCompat></View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, content: { paddingHorizontal: 27, flexGrow: 1, justifyContent: 'center' }, logo: { width: 132, height: 187, alignSelf: 'center', marginBottom: 24 }, kicker: { fontWeight: '700', fontSize: 10, letterSpacing: 1.4, marginBottom: 10 }, title: { fontWeight: '700', fontSize: 34, lineHeight: 39 }, copy: { fontSize: 14, lineHeight: 20, marginTop: 12, marginBottom: 25 }, input: { height: 51, borderWidth: 1, borderColor: '#554842', borderRadius: 16, paddingHorizontal: 15, color: '#fff', marginBottom: 11 }, codeInput: {}, button: { height: 51, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 }, forgotLink: { textAlign: 'right', marginTop: -3, marginBottom: 14, fontWeight: '600', fontSize: 12 }, link: { textAlign: 'center', marginTop: 17, fontWeight: '600', fontSize: 12 }, message: { fontSize: 12, lineHeight: 17, marginTop: 15 }, footer: { fontSize: 11, lineHeight: 16, marginTop: 28, textAlign: 'center' } });