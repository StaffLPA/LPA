import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Head from 'expo-router/head';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGetPublicBuildAthletesQueryKey, useGetPublicBuildAthletes, useOpenPublicBuildAccess } from '@workspace/api-client-react';
import type { BuildPublicAthlete } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { LpaIcon as Icon } from '@/components/LpaIcon';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Btn, Empty, ErrorBox, SearchBox, Skeleton } from '@/components/metrics/ui';
import { BuildWorkout } from '@/components/workouts/BuildWorkout';
import { BuildAthleteSlots } from '@/components/workouts/BuildAthleteSlots';
import { assignBuildSlot, BUILD_SLOTS_KEY, emptyBuildSlots, readBuildSlots, type BuildSlotConfig } from '@/lib/buildAthleteSlots';

const LAST_KEY = 'lpa-build-last-athlete';
const TOKEN_KEY = 'lpa-build-access';
const session = {
  get(): { athleteId: string; token: string; expiresAt: string } | null {
    if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return null;
    try { const v = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null'); return v && new Date(v.expiresAt).getTime() > Date.now() ? v : null; } catch { return null; }
  },
  set(v: { athleteId: string; token: string; expiresAt: string } | null) {
    if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
    try { if (v) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(v)); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

export default function BuildPage() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? 67 : insets.top + 12;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom + 16;
  const roster = useGetPublicBuildAthletes({ query: { queryKey: getGetPublicBuildAthletesQueryKey(), refetchInterval: 60_000 } });
  const openAccess = useOpenPublicBuildAccess();
  const [selected, setSelected] = useState<BuildPublicAthlete | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pinStage, setPinStage] = useState(false);
  const [pin, setPin] = useState('');
  const [search, setSearch] = useState('');
  const [pickId, setPickId] = useState('');
  const [error, setError] = useState('');
  const [booted, setBooted] = useState(false);
  const bootStarted = useRef(false);
  const [config, setConfig] = useState<BuildSlotConfig>(emptyBuildSlots);
  const configRef = useRef(config);
  const [switching, setSwitching] = useState(false);
  const [storageError, setStorageError] = useState('');
  const switchGuard = useRef<(() => Promise<boolean>) | null>(null);
  const openEpoch = useRef(0);
  const switchRequest = useRef(0);
  const selectedId = useRef<string | null>(null);
  const grants = useRef(new Map<string, { token: string; expiresAt: string; pinRequired: boolean }>());
  const { width } = useWindowDimensions();
  const athletes = useMemo(() => roster.data?.athletes ?? [], [roster.data?.athletes]);
  const pinRequired = !!roster.data?.pinRequired;
  const commitConfig = useCallback((next: BuildSlotConfig) => {
    configRef.current = next;
    setConfig(next);
    try {
      const raw = JSON.stringify(next);
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(BUILD_SLOTS_KEY, raw);
      else void AsyncStorage.setItem(BUILD_SLOTS_KEY, raw).catch(() => setStorageError('This device could not remember athlete slots. They may reset after closing the page.'));
    } catch {
      setStorageError('This device could not remember athlete slots. They may reset after closing the page.');
    }
  }, []);

  const open = useCallback(async (athlete: BuildPublicAthlete, pinValue?: string) => {
    const epoch = ++openEpoch.current;
    selectedId.current = athlete.id;
    setSelected(athlete); setToken(null); setPinStage(false); setError(''); setPin('');
    setSwitching(true);
    try {
      const grant = grants.current.get(athlete.id);
      if (!pinValue && grant && grant.pinRequired === pinRequired && Date.parse(grant.expiresAt) > Date.now()) {
        setToken(grant.token);
        session.set({ athleteId: athlete.id, ...grant });
        return;
      }
      if (pinRequired && !pinValue) { setPinStage(true); return; }
      const r = await openAccess.mutateAsync({ athleteId: athlete.id, data: pinValue ? { pin: pinValue } : {} });
      if (epoch !== openEpoch.current) return;
      setSelected(athlete); setToken(r.accessToken); setPinStage(false); setPin('');
      grants.current.set(athlete.id, { token: r.accessToken, expiresAt: r.expiresAt, pinRequired });
      session.set({ athleteId: athlete.id, token: r.accessToken, expiresAt: r.expiresAt });
      void AsyncStorage.setItem(LAST_KEY, athlete.id);
    } catch (e) {
      if (epoch !== openEpoch.current) return;
      const status = (e as { status?: number }).status;
      setError(status === 401 || status === 403 ? 'That PIN did not match. Check with your coach.' : errText(e));
      setSelected(athlete);
      setPinStage(true);
    } finally { if (epoch === openEpoch.current) setSwitching(false); }
  }, [openAccess.mutateAsync, pinRequired]);

  const openRef = useRef(open); openRef.current = open;
  useEffect(() => {
    if (bootStarted.current || !roster.data) return;
    bootStarted.current = true;
    void (async () => {
      const existing = session.get();
      try {
        const raw = Platform.OS === 'web' && typeof localStorage !== 'undefined'
          ? localStorage.getItem(BUILD_SLOTS_KEY) : await AsyncStorage.getItem(BUILD_SLOTS_KEY);
        const lastId = existing?.athleteId ?? await AsyncStorage.getItem(LAST_KEY);
        const restored = readBuildSlots(raw, athletes.map(a => a.id), lastId);
        commitConfig(restored);
        const athlete = athletes.find(a => a.id === restored.activeAthleteId);
        if (!athlete) return;
        setPickId(athlete.id);
        if (existing?.athleteId === athlete.id) grants.current.set(athlete.id, { token: existing.token, expiresAt: existing.expiresAt, pinRequired });
        void openRef.current(athlete);
      } catch {
        setStorageError('Saved athlete slots could not be read. Add athletes again; workout records have not been changed.');
      } finally { setBooted(true); }
    })();
  }, [booted, roster.data, athletes, commitConfig, pinRequired]);

  const onUnauthorized = useCallback((athleteId: string) => {
    if (selectedId.current !== athleteId) return;
    grants.current.clear();
    setToken(null); session.set(null); setPin('');
    setError('Your session ended. Open your program again.');
    setPinStage(true);
    void roster.refetch();
  }, []);
  const prepareSwitch = async () => {
    if (switchGuard.current && !await switchGuard.current()) {
      setError('Finish saving your sets or resolve the draft-storage warning before switching athletes.');
      return false;
    }
    switchGuard.current = null;
    return true;
  };
  const activate = async (athlete: BuildPublicAthlete, next: BuildSlotConfig) => {
    const request = ++switchRequest.current;
    if (!await prepareSwitch()) return;
    if (request !== switchRequest.current) return;
    commitConfig(next);
    void open(athlete);
  };
  const switchAthlete = async () => {
    if (!await prepareSwitch()) return;
    ++openEpoch.current; selectedId.current = null; setSwitching(false);
    setToken(null); session.set(null); setSelected(null); setPinStage(false); setPin(''); setError(''); setPickId('');
  };
  const assignAthlete = (index: number, athlete: BuildPublicAthlete) => {
    const next = assignBuildSlot(configRef.current, index, athlete.id);
    if (next === configRef.current) return;
    void activate(athlete, next);
  };
  const removeAthlete = async (index: number) => {
    const next = assignBuildSlot(configRef.current, index, null);
    if (configRef.current.activeAthleteId !== configRef.current.slots[index]) { commitConfig(next); return; }
    if (!await prepareSwitch()) return;
    commitConfig(next);
    const athlete = athletes.find(a => a.id === next.activeAthleteId);
    if (athlete) void open(athlete);
    else void switchAthlete();
  };

  const filtered = athletes.filter((a) => a.displayName.toLowerCase().includes(search.trim().toLowerCase()));
  const pick = athletes.find((a) => a.id === pickId) ?? null;

  let body: React.ReactNode;
  if (selected && token) {
    body = <BuildWorkout key={`${selected.id}-${token}`} athleteId={selected.id} accessToken={token} pinRequired={pinRequired}
      onUnauthorized={() => onUnauthorized(selected.id)} onDirtyChange={() => undefined}
      registerSwitchGuard={(guard) => { switchGuard.current = guard; }} />;
  } else if (selected && pinStage) {
    body = <View style={[st.panel, { backgroundColor: c.card, borderColor: c.border }]}>
      <Icon name="lock" size={22} color={c.primary} />
      <Text style={[st.h1, { color: c.foreground }]}>Hi, {selected.displayName.split(' ')[0]}</Text>
      <Text style={[st.sub, { color: c.mutedForeground }]}>{pinRequired ? 'Enter your 4-digit PIN to open your program.' : 'Open your program again to continue.'}</Text>
      {pinRequired ? <TextInput testID="build-pin" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4}
        autoFocus placeholder="••••" placeholderTextColor={c.mutedForeground} onSubmitEditing={() => pin.length === 4 && void open(selected, pin)}
        style={[st.pin, { color: c.foreground, borderColor: error ? c.destructive : c.border, backgroundColor: c.background }]} /> : null}
      {error ? <Text accessibilityRole="alert" style={[st.err, { color: c.destructive }]}>{error}</Text> : null}
      <Btn label="Open my program" disabled={pinRequired && pin.length !== 4} loading={openAccess.isPending} onPress={() => void open(selected, pinRequired ? pin : undefined)} testID="build-pin-submit" />
      <Pressable testID="build-not-me" onPress={() => void switchAthlete()} style={st.link}><Text style={[st.linkText, { color: c.mutedForeground }]}>Not {selected.displayName}? Switch athlete</Text></Pressable>
    </View>;
  } else if (roster.isLoading || switching || (!booted && !roster.isError)) {
    body = <View><Skeleton h={48} /><Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} /></View>;
  } else if (roster.isError) {
    body = <ErrorBox message={errText(roster.error)} onRetry={() => void roster.refetch()} />;
  } else {
    body = <View>
      <Text style={[st.h1, { color: c.foreground }]}>Select your name</Text>
      <Text style={[st.sub, { color: c.mutedForeground, marginBottom: 14 }]}>Find yourself, then open the program your coach assigned.</Text>
      <SearchBox value={search} onChange={setSearch} placeholder="Search your name" testID="build-athlete-search" />
      {error ? <Text accessibilityRole="alert" style={[st.err, { color: c.destructive }]}>{error}</Text> : null}
      <View style={[st.list, { borderColor: c.border, backgroundColor: c.card }]}>
        {filtered.length ? filtered.slice(0, 60).map((a, i) => {
          const on = a.id === pickId;
          return <Pressable key={a.id} testID={`build-athlete-${a.id}`} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPickId(a.id)}
            style={[st.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, on && { backgroundColor: `${c.primary}1F` }]}>
            <View style={[st.avatar, { backgroundColor: on ? c.primary : c.muted }]}>
              <Text style={[st.avatarText, { color: on ? c.primaryForeground : c.foreground }]}>{a.displayName.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</Text>
            </View>
            <Text numberOfLines={1} style={[st.itemText, { color: c.foreground }]}>{a.displayName}</Text>
            {on ? <Icon name="check" size={16} color={c.primary} /> : null}
          </Pressable>;
        }) : <Empty title={athletes.length ? 'No name matches' : 'No athletes yet'} copy={athletes.length ? 'Try fewer letters.' : 'Ask your coach to add you.'} />}
      </View>
      <View style={{ height: 14 }} />
      <Btn label="Continue" icon="arrow-up-right" disabled={!pick} loading={openAccess.isPending}
        onPress={() => { if (!pick) return; const index = configRef.current.slots.indexOf(pick.id);
          assignAthlete(index >= 0 ? index : Math.max(0, configRef.current.slots.indexOf(null)), pick); }} testID="build-continue" />
    </View>;
  }

  return <View style={[st.root, { backgroundColor: c.background }]}>
    <Head><title>Build · Legendary Prep Academy</title></Head>
    <KeyboardAwareScrollViewCompat keyboardShouldPersistTaps="handled" bottomOffset={24}
      contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: 16 }}>
      <View style={st.inner}>
        <View style={[st.top, { flexWrap: 'wrap' }]}>
          <View style={[st.mark, { backgroundColor: c.primary }]}><Text style={[st.markText, { color: c.primaryForeground }]}>LPA</Text></View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={[st.brand, { color: c.foreground }]}>BUILD</Text>
            <Text numberOfLines={1} style={[st.brandSub, { color: c.mutedForeground }]}>{selected ? selected.displayName : 'Legendary Prep Academy'}</Text>
          </View>
          <View style={{ width: width >= 700 ? 350 : '100%' }}>
            <BuildAthleteSlots slots={config.slots.map(id => athletes.find(a => a.id === id) ?? null)}
              activeAthleteId={selected?.id ?? config.activeAthleteId} athletes={athletes} disabled={!booted || roster.isLoading}
              onSelectSlot={(index) => { const athlete = athletes.find(a => a.id === configRef.current.slots[index]);
                if (athlete && (athlete.id !== selectedId.current || !token)) void activate(athlete, { ...configRef.current, activeAthleteId: athlete.id }); }}
              onAssignSlot={assignAthlete} onRemoveSlot={(index) => void removeAthlete(index)} />
          </View>
        </View>
        {storageError ? <Text accessibilityRole="alert" style={[st.err, { color: c.destructive }]}>{storageError}</Text> : null}
        {selected && token && error ? <Text accessibilityRole="alert" style={[st.err, { color: c.destructive }]}>{error}</Text> : null}
        {body}
      </View>
    </KeyboardAwareScrollViewCompat>
  </View>;
}

const st = StyleSheet.create({
  root: { flex: 1 },
  inner: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  mark: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 3 },
  brandSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 36 },
  switchText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  h1: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -0.5, marginTop: 4 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, marginTop: 4 },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  itemText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flex: 1 },
  panel: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 10 },
  pin: { minHeight: 60, borderWidth: 1, borderRadius: 14, fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: 14, textAlign: 'center', marginVertical: 6 },
  err: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8 },
  link: { alignSelf: 'center', paddingVertical: 8 },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
