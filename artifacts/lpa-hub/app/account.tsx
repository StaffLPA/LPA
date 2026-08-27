import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
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
  const [photoPath, setPhotoPath] = useState(user?.profilePhotoPath ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const contentType = asset.mimeType && /^image\/(?:jpeg|png|webp)$/.test(asset.mimeType) ? asset.mimeType : 'image/jpeg';
      const localImage = await fetch(asset.uri);
      if (!localImage.ok) throw new Error('Could not read that photo. Please choose another image.');
      const imageData = await localImage.blob();
      const size = asset.fileSize ?? imageData.size;
      if (!size) { setMessage('Could not read that photo. Please choose another image.'); return; }

      setMessage('');
      setUploadingPhoto(true);
      const upload = await customFetch<{ uploadURL: string; objectPath: string }>('/api/auth/profile-photo/upload-url', {
        method: 'POST',
        responseType: 'json',
        body: JSON.stringify({ contentType, size }),
      });
      const response = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'content-type': contentType }, body: imageData });
      if (!response.ok) throw new Error('Could not upload that photo. Please try again.');
      setPhotoUri(asset.uri);
      setPhotoPath(upload.objectPath);
      setMessage('Photo ready. Save your profile to use it everywhere.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not upload that photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };
  const saveProfile = async () => {
    setSaving(true); setMessage('');
    try {
      const data = await customFetch<StoredUser>('/api/auth/profile', { method: 'PATCH', responseType: 'json', body: JSON.stringify({ firstName, lastName, email, phone, address, birthday, gender, profilePhotoUri: photoPath }) });
      updateUser(data);
      setPhotoUri(data.profilePhotoUri ?? null);
      setPhotoPath(data.profilePhotoPath ?? null);
      setMessage('Profile updated.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your profile.'); } finally { setSaving(false); }
  };
  const logOut = () => setShowLogoutConfirm(true);
  const confirmLogOut = () => { setShowLogoutConfirm(false); signOut(); router.replace('/launch'); };

  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 35 }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Pressable onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>My account</Text><View style={{ width: 22 }} /></View>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>Manage your profile and login details.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose and adjust profile picture" onPress={() => void choosePhoto()} disabled={uploadingPhoto} style={styles.photoRow}><View style={[styles.photo, { backgroundColor: colors.primary }]}>{photoUri ? <Image source={{ uri: photoUri }} style={styles.photoImage} /> : <Text style={styles.photoText}>{`${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || 'LPA'}</Text>}</View><View style={{ flex: 1 }}><Text style={[styles.photoTitle, { color: colors.foreground }]}>Profile picture</Text><Text style={[styles.photoCopy, { color: colors.mutedForeground }]}>{uploadingPhoto ? 'Uploading photo…' : 'Choose, crop, and pinch to zoom'}</Text></View>{uploadingPhoto ? <ActivityIndicator color={colors.primary} /> : <Feather name="camera" size={18} color={colors.primary} />}</Pressable>
      <Text style={[styles.section, { color: colors.foreground }]}>Personal information</Text>
      <Field label="FIRST NAME" value={firstName} onChangeText={setFirstName} colors={colors} />
      <Field label="LAST NAME" value={lastName} onChangeText={setLastName} colors={colors} />
      <Field label="EMAIL" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" colors={colors} />
      <Field label="MOBILE NUMBER" value={phone} onChangeText={setPhone} keyboardType="phone-pad" colors={colors} />
      <Field label="ADDRESS" value={address} onChangeText={setAddress} colors={colors} />
      <Field label="BIRTHDAY" value={birthday} onChangeText={setBirthday} placeholder="MM/DD/YYYY" colors={colors} />
      <Field label="GENDER" value={gender} onChangeText={setGender} placeholder="Optional" colors={colors} />
      <Pressable testID="save-profile" onPress={() => void saveProfile()} disabled={saving || uploadingPhoto} style={[styles.save, { backgroundColor: colors.primary }]}>{saving ? <ActivityIndicator color="#fff" /> : <><Text style={styles.saveText}>Save profile</Text><Feather name="check" size={16} color="#fff" /></>}</Pressable>
      {message ? <Text style={[styles.message, { color: message === 'Profile updated.' ? colors.accent : colors.destructive }]}>{message}</Text> : null}
      <Text style={[styles.section, { color: colors.foreground, marginTop: 30 }]}>Login & security</Text>
       <Pressable testID="change-password" onPress={() => setShowPassword(true)} style={[styles.security, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.securityIcon, { backgroundColor: `${colors.primary}18` }]}><Feather name="lock" size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.securityTitle, { color: colors.foreground }]}>Update password</Text><Text style={[styles.securityCopy, { color: colors.mutedForeground }]}>Your current password is required</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
       <Pressable testID="account-sign-out" onPress={logOut} style={[styles.security, styles.signOut, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.securityIcon, { backgroundColor: `${colors.destructive}18` }]}><Feather name="log-out" size={17} color={colors.destructive} /></View><View style={{ flex: 1 }}><Text style={[styles.securityTitle, { color: colors.destructive }]}>Log out</Text><Text style={[styles.securityCopy, { color: colors.mutedForeground }]}>Sign out of this LPA account</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable>
    </ScrollView>
    <PasswordModal visible={showPassword} onClose={() => setShowPassword(false)} colors={colors} />
     <LogoutConfirmModal visible={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={confirmLogOut} colors={colors} />
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
    if (!currentPassword) { setMessage('Enter your current password.'); return; }
    if (newPassword.length < 8) { setMessage('Your new password must be at least 8 characters.'); return; }
    if (!confirmPassword) { setMessage('Repeat your new password.'); return; }
    if (newPassword !== confirmPassword) { setMessage('New passwords do not match.'); return; }
    setSaving(true); setMessage('');
    try {
      const data = await customFetch<{ message: string; user?: StoredUser }>('/api/auth/change-password', { method: 'POST', responseType: 'json', body: JSON.stringify({ currentPassword, newPassword }) });
      if (data.user) updateUser(data.user);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update your password.'); } finally { setSaving(false); }
  };
  const canSubmit = Boolean(currentPassword && newPassword.length >= 8 && confirmPassword);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.card, maxHeight: '90%' }]}><KeyboardAwareScrollViewCompat contentContainerStyle={{ paddingBottom: 4 }} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View style={styles.modalHeader}><View><Text style={[styles.kicker, { color: colors.primary }]}>LOGIN & SECURITY</Text><Text style={[styles.modalTitle, { color: colors.foreground }]}>Update Password</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close update password" onPress={onClose}><Feather name="x" size={21} color={colors.mutedForeground} /></Pressable></View><Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>Enter your current password before creating a new one.</Text><Text style={[styles.label, { color: colors.mutedForeground }]}>Current Password</Text><TextInput value={currentPassword} onChangeText={(value) => { setCurrentPassword(value); setMessage(''); }} secureTextEntry placeholder="Enter current password" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginBottom: 12 }]} /><Text style={[styles.label, { color: colors.mutedForeground }]}>New Password</Text><TextInput value={newPassword} onChangeText={(value) => { setNewPassword(value); setMessage(''); }} secureTextEntry placeholder="At least 8 characters" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginBottom: 12 }]} /><Text style={[styles.label, { color: colors.mutedForeground }]}>Confirm New Password</Text><TextInput value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); setMessage(''); }} secureTextEntry placeholder="Confirm new password" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" returnKeyType="done" onSubmitEditing={() => void changePassword()} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />{message ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.destructive }]}>{message}</Text> : null}<Pressable testID="save-password" accessibilityRole="button" accessibilityLabel="Update Password" onPress={() => void changePassword()} disabled={saving || !canSubmit} style={[styles.save, { backgroundColor: canSubmit ? colors.primary : colors.muted }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Update Password</Text>}</Pressable></KeyboardAwareScrollViewCompat></View></View></Modal>;
}

function LogoutConfirmModal({ visible, onCancel, onConfirm, colors }: { visible: boolean; onCancel: () => void; onConfirm: () => void; colors: ReturnType<typeof useColors> }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.card, maxWidth: 420, width: '100%', alignSelf: 'center', borderRadius: 26 }]}><View style={[styles.securityIcon, { backgroundColor: `${colors.destructive}18`, alignSelf: 'center', marginBottom: 14 }]}><Feather name="log-out" size={18} color={colors.destructive} /></View><Text style={[styles.modalTitle, { color: colors.foreground, textAlign: 'center' }]}>Log out?</Text><Text style={[styles.modalCopy, { color: colors.mutedForeground, textAlign: 'center', marginBottom: 20 }]}>You will need to sign in again to access LPA.</Text><Pressable testID="confirm-account-sign-out" accessibilityRole="button" accessibilityLabel="Confirm log out" onPress={onConfirm} style={[styles.save, { backgroundColor: colors.destructive, marginHorizontal: 0 }]}><Text style={styles.saveText}>Log out</Text></Pressable><Pressable testID="cancel-account-sign-out" accessibilityRole="button" accessibilityLabel="Cancel log out" onPress={onCancel} style={{ height: 49, marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}><Text style={[styles.saveText, { color: colors.foreground }]}>Cancel</Text></Pressable></View></View></Modal>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { height: 47, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 }, intro: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginHorizontal: 22, marginTop: 12, marginBottom: 20 }, photoRow: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 25 }, photo: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, photoImage: { width: '100%', height: '100%' }, photoText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 }, photoTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, photoCopy: { fontFamily: 'Inter_400Regular', fontSize: 11 }, section: { fontFamily: 'Inter_700Bold', fontSize: 16, marginHorizontal: 22, marginBottom: 13 }, field: { marginHorizontal: 20, marginBottom: 12 }, label: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1, marginBottom: 6 }, input: { height: 47, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13 }, save: { height: 49, marginHorizontal: 20, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 4 }, saveText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }, message: { fontFamily: 'Inter_500Medium', fontSize: 12, marginHorizontal: 22, marginTop: 10 }, security: { marginHorizontal: 20, borderRadius: 17, borderWidth: 1, minHeight: 68, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, signOut: { marginTop: 10 }, securityIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, securityTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 }, securityCopy: { fontFamily: 'Inter_400Regular', fontSize: 11 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' }, sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 35 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 }, kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, marginBottom: 5 }, modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 22 }, modalCopy: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 17 },
});