import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, StoredUser } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { customFetch } from '@workspace/api-client-react';

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser, signOut } = useApp();
  const [firstName, setFirstName] = useState(user?.firstName ?? user?.fullName.split(' ')[0] ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? user?.fullName.split(' ').slice(1).join(' ') ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [address, setAddress] = useState(user?.address ?? '');
  const [birthday, setBirthday] = useState(user?.birthday ?? '');
  const [gender, setGender] = useState(user?.gender ?? '');
  const [photoUri, setPhotoUri] = useState(user?.profilePhotoUri ?? user?.photoUri ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setPhotoUri(result.assets[0]?.uri ?? null);
  };
  const saveProfile = async () => {
    setSaving(true); setMessage('');
    try {
      const data = await customFetch<StoredUser>('/api/auth/profile', { method: 'PATCH', responseType: 'json', body: JSON.stringify({ firstName, lastName, email, phone, address, birthday, gender, profilePhotoUri: photoUri }) });
      updateUser(data); setMessage('Profile updated.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your profile.'); } finally { setSaving(false); }
  };
  const logOut = () => Alert.alert('Log out?', 'You will need to sign in again to access LPA Hub.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: () => { signOut(); router.replace('/launch'); } }]);

  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 35 }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>My account</Text><View style={{ width: 22 }} /></View>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>Manage your profile and login details.</Text>
      <Pressable onPress={() => void choosePhoto()} style={styles.photoRow}><View style={[styles.photo, { backgroundColor: colors.primary }]}>{photoUri ? <Image source={{ uri: photoUri }} style={styles.photoImage} /> : <Text style={styles.photoText}>{`${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || 'LPA'}</Text>}</View><View style={{ flex: 1 }}><Text style={[styles.photoTitle, { color: colors.foreground }]}>Profile picture</Text><Text style={[styles.photoCopy, { color: colors.mutedForeground }]}>Upload a new photo</Text></View><Feather name="camera" size={18} color={colors.primary} /></Pressable>
      <Text style={[styles.section, { color: colors.foreground }]}>Personal information</Text>
      <Field label="FIRST NAME" value={firstName} onChangeText={setFirstName} colors={colors} />
      <Field label="LAST NAME" value={lastName} onChangeText={setLastName} colors={colors} />
      <Field label="EMAIL" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" colors={colors} />
      <Field label="MOBILE NUMBER" value={phone} onChangeText={setPhone} keyboardType="phone-pad" colors={colors} />
      <Field label="ADDRESS" value={address} onChangeText={setAddress} colors={colors} />
      <Field label="BIRTHDAY" value={birthday} onChangeText={setBirthday} placeholder="MM/DD/YYYY" colors={colors} />
      <Field label="GENDER" value={gender} onChangeText={setGender} placeholder="Optional" colors={colors} />
      <Pressable testID="save-profile" onPress={() => void saveProfile()} disabled={saving} style={[styles.save, { backgroundColor: colors.primary }]}>{saving ? <ActivityIndicator color="#fff" /> : <><Text style={styles.saveText}>Save profile</Text><Feather name="check" size={16} color="#fff" /></>}</Pressable>
      {message ? <Text style={[styles.message, { color: message === 'Profile updated.' ? colors.accent : colors.destructive }]}>{message}</Text> : null}
      <Text style={[styles.section, { color: colors.foreground, marginTop: 30 }]}>Login & security</Text>
       <Pressable testID="change-password" onPress={() => setShowPassword(true)} style={[styles.security, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.securityIcon, { backgroundColor: `${colors.primary}18` }]}><Feather name="lock" size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.securityTitle, { color: colors.foreground }]}>Update password</Text><Text style={[styles.securityCopy, { color: colors.mutedForeground }]}>Your current password is required</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
       <Pressable testID="account-sign-out" onPress={logOut} style={[styles.security, styles.signOut, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.securityIcon, { backgroundColor: `${colors.destructive}18` }]}><Feather name="log-out" size={17} color={colors.destructive} /></View><View style={{ flex: 1 }}><Text style={[styles.securityTitle, { color: colors.destructive }]}>Log out</Text><Text style={[styles.securityCopy, { color: colors.mutedForeground }]}>Sign out of this LPA Hub account</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
    </ScrollView>
    <PasswordModal visible={showPassword} onClose={() => setShowPassword(false)} colors={colors} />
  </View>;
}

function Field({ label, value, onChangeText, colors, placeholder, keyboardType, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; colors: ReturnType<typeof useColors>; placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad'; autoCapitalize?: 'none' | 'sentences' }) {
  return <View style={styles.field}><Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} /></View>;
}

function PasswordModal({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: ReturnType<typeof useColors> }) {
  const { updateUser } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const changePassword = async () => {
    if (newPassword !== confirmPassword) { setMessage('New passwords do not match.'); return; }
    setSaving(true); setMessage('');
    try {
      const data = await customFetch<{ message: string; user?: StoredUser }>('/api/auth/change-password', { method: 'POST', responseType: 'json', body: JSON.stringify({ currentPassword, newPassword }) });
      if (data.user) updateUser(data.user);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update your password.'); } finally { setSaving(false); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.card }]}><View style={styles.modalHeader}><View><Text style={[styles.kicker, { color: colors.primary }]}>LOGIN & SECURITY</Text><Text style={[styles.modalTitle, { color: colors.foreground }]}>Update password</Text></View><Pressable onPress={onClose}><Feather name="x" size={21} color={colors.mutedForeground} /></Pressable></View><Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>Enter your current password before creating a new one.</Text><TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Current password" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="New password (8+ characters)" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Confirm new password" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />{message ? <Text style={[styles.message, { color: colors.destructive }]}>{message}</Text> : null}<Pressable testID="save-password" onPress={() => void changePassword()} disabled={saving || !currentPassword || newPassword.length < 8 || !confirmPassword} style={[styles.save, { backgroundColor: currentPassword && newPassword.length >= 8 && confirmPassword ? colors.primary : colors.muted }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Update password</Text>}</Pressable></View></View></Modal>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { height: 47, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 }, intro: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginHorizontal: 22, marginTop: 12, marginBottom: 20 }, photoRow: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 25 }, photo: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, photoImage: { width: '100%', height: '100%' }, photoText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }, photoTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, photoCopy: { fontFamily: 'Inter_400Regular', fontSize: 11 }, section: { fontFamily: 'Inter_700Bold', fontSize: 16, marginHorizontal: 22, marginBottom: 13 }, field: { marginHorizontal: 20, marginBottom: 12 }, label: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginBottom: 6 }, input: { height: 47, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13 }, save: { height: 49, marginHorizontal: 20, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 4 }, saveText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }, message: { fontFamily: 'Inter_500Medium', fontSize: 12, marginHorizontal: 22, marginTop: 10 }, security: { marginHorizontal: 20, borderRadius: 17, borderWidth: 1, minHeight: 68, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, signOut: { marginTop: 10 }, securityIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, securityTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, securityCopy: { fontFamily: 'Inter_400Regular', fontSize: 11 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' }, sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 35 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 }, kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, marginBottom: 5 }, modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 22 }, modalCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 17 },
});