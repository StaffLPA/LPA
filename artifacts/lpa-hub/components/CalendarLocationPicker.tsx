import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getListCalendarLocationsQueryKey, useCreateCalendarLocation, useListCalendarLocations } from '@workspace/api-client-react';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const normalizeName = (name: string) => name.normalize('NFKC').trim().toLowerCase();

export function CalendarLocationPicker({ location, address, onLocationChange, onAddressChange, enabled = true, testIDPrefix = 'calendar-location' }: {
  location: string;
  address: string;
  onLocationChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  enabled?: boolean;
  testIDPrefix?: string;
}) {
  const colors = useColors();
  const { user } = useApp();
  const queryClient = useQueryClient();
  const locationsQuery = useListCalendarLocations({ query: { queryKey: getListCalendarLocationsQueryKey(), enabled } });
  const createLocation = useCreateCalendarLocation();
  const [open, setOpen] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveAddress, setSaveAddress] = useState('');
  const [saveError, setSaveError] = useState('');
  const selectedLocation = useRef<{ name: string; address: string } | null>(null);
  const locations = locationsQuery.data ?? [];
  const canSave = user?.role === 'Admin';

  const changeName = (nextName: string) => {
    const selected = selectedLocation.current;
    if (selected && normalizeName(nextName) !== normalizeName(selected.name)) {
      if (address.trim() === selected.address) onAddressChange('');
      selectedLocation.current = null;
    }
    onLocationChange(nextName);
    const match = locations.find((item) => normalizeName(item.name) === normalizeName(nextName));
    if (match) {
      onAddressChange(match.address);
      selectedLocation.current = { name: match.name, address: match.address };
    }
  };

  const chooseLocation = (item: { name: string; address: string }) => {
    selectedLocation.current = { name: item.name, address: item.address };
    onLocationChange(item.name);
    onAddressChange(item.address);
    setOpen(false);
    setSavingForm(false);
    setSaveError('');
  };

  const beginSave = () => {
    setSaveName(location);
    setSaveAddress(address);
    setSaveError('');
    setSavingForm(true);
  };

  const saveLocation = async () => {
    const name = saveName.trim();
    const savedAddress = saveAddress.trim();
    if (!name || !savedAddress) {
      setSaveError('Enter both a location name and address.');
      return;
    }
    setSaveError('');
    try {
      const saved = await createLocation.mutateAsync({ data: { name, address: savedAddress } });
      await queryClient.invalidateQueries({ queryKey: getListCalendarLocationsQueryKey() });
      chooseLocation(saved);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this location.');
    }
  };

  return <View style={styles.container}>
    <View style={[styles.locationControl, { backgroundColor: colors.background, borderColor: open ? colors.primary : colors.border }]}>
      <Feather name="map-pin" size={16} color={location ? colors.primary : colors.mutedForeground} />
      <TextInput
        testID={`${testIDPrefix}-name`}
        value={location}
        onChangeText={changeName}
        placeholder="Location name"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="words"
        style={[styles.nameInput, { color: colors.foreground }]}
      />
      <Pressable
        testID={`${testIDPrefix}-toggle`}
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Hide' : 'Show'} saved locations`}
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen((current) => !current)}
        style={styles.toggle}
      >
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
    <TextInput
      testID={`${testIDPrefix}-address`}
      value={address}
      onChangeText={onAddressChange}
      placeholder="Location address"
      placeholderTextColor={colors.mutedForeground}
      maxLength={1000}
      style={[styles.addressInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
    />
    {open ? <View style={[styles.locationOptions, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {locationsQuery.isLoading ? <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading saved locations…</Text> : null}
      {locationsQuery.isError ? <Text style={[styles.stateText, { color: colors.destructive }]}>Couldn’t load saved locations.</Text> : null}
      {!locationsQuery.isLoading && !locationsQuery.isError && locations.length === 0
        ? <Text style={[styles.stateText, { color: colors.mutedForeground }]}>No saved locations yet.</Text>
        : null}
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.optionList}>
        {locations.map((item) => <Pressable
          key={item.id}
          testID={`${testIDPrefix}-option-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.address}`}
          onPress={() => chooseLocation(item)}
          style={[styles.option, { borderBottomColor: colors.border, backgroundColor: normalizeName(item.name) === normalizeName(location) ? colors.secondary : 'transparent' }]}
        >
          <Text style={[styles.optionName, { color: colors.foreground }]}>{item.name}</Text>
          <Text numberOfLines={2} style={[styles.optionAddress, { color: colors.mutedForeground }]}>{item.address}</Text>
        </Pressable>)}
      </ScrollView>
    </View> : null}
    {canSave ? <View style={styles.saveSection}>
      {!savingForm ? <Pressable
        testID={`${testIDPrefix}-save-toggle`}
        accessibilityRole="button"
        onPress={beginSave}
        style={[styles.saveToggle, { borderColor: colors.border, backgroundColor: colors.card }]}
      >
        <Feather name="bookmark" size={14} color={colors.primary} />
        <Text style={[styles.saveToggleText, { color: colors.primary }]}>Save this location</Text>
      </Pressable> : <View style={[styles.saveForm, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.saveTitle, { color: colors.foreground }]}>Save reusable location</Text>
        <TextInput
          testID={`${testIDPrefix}-save-name`}
          value={saveName}
          onChangeText={setSaveName}
          placeholder="Location name"
          placeholderTextColor={colors.mutedForeground}
          maxLength={120}
          autoCapitalize="words"
          style={[styles.saveInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
        />
        <TextInput
          testID={`${testIDPrefix}-save-address`}
          value={saveAddress}
          onChangeText={setSaveAddress}
          placeholder="Location address"
          placeholderTextColor={colors.mutedForeground}
          maxLength={1000}
          style={[styles.saveInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
        />
        {saveError ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>{saveError}</Text> : null}
        <View style={styles.saveActions}>
          <Pressable testID={`${testIDPrefix}-save-cancel`} onPress={() => { setSavingForm(false); setSaveError(''); }}>
            <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
          <Pressable
            testID={`${testIDPrefix}-save-submit`}
            accessibilityRole="button"
            disabled={createLocation.isPending}
            onPress={() => void saveLocation()}
            style={[styles.submit, { backgroundColor: colors.primary, opacity: createLocation.isPending ? 0.6 : 1 }]}
          >
            {createLocation.isPending ? <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Saving…</Text>
              : <><Feather name="check" size={14} color={colors.primaryForeground} /><Text style={[styles.submitText, { color: colors.primaryForeground }]}>Save location</Text></>}
          </Pressable>
        </View>
      </View>}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  locationControl: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 9 },
  nameInput: { flex: 1, minWidth: 0, paddingVertical: 10, fontFamily: 'Inter_500Medium', fontSize: 13 },
  toggle: { minWidth: 32, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  addressInput: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', fontSize: 13 },
  locationOptions: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  stateText: { paddingHorizontal: 12, paddingTop: 10, fontFamily: 'Inter_400Regular', fontSize: 12 },
  optionList: { maxHeight: 190 },
  option: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  optionName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  optionAddress: { marginTop: 2, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15 },
  saveSection: { marginTop: 1 },
  saveToggle: { minHeight: 36, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveToggleText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  saveForm: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  saveTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  saveInput: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontFamily: 'Inter_400Regular', fontSize: 13 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  saveActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 2 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  submit: { minHeight: 36, borderRadius: 9, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  submitText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
