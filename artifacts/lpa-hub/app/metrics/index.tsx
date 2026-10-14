import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { Shell } from '@/components/metrics/Shell';
import { Body, Btn, Card, ErrorBox, Skeleton } from '@/components/metrics/ui';
import { SyncControl } from '@/components/metrics/SyncControl';
import { FilterBar } from '@/components/metrics/FilterBar';
import { KpiCards } from '@/components/metrics/KpiCards';
import { TeamProgressChart } from '@/components/metrics/TeamProgressChart';
import { OverviewEntry, LeaveGuard } from '@/components/metrics/OverviewEntry';
import { AthletesPanel } from '@/components/metrics/AthletesPanel';
import { LibraryPanel } from '@/components/metrics/LibraryPanel';
import { ReportsPanel } from '@/components/metrics/ReportsPanel';
import { CategoryTabs } from '@/components/metrics/CategoryTabs';
import { SummaryCards } from '@/components/metrics/SummaryCards';
import { MaxesSection } from '@/components/metrics/MaxesSection';
import { filterParams, periodError, useFilters, useWorkspace } from '@/lib/metrics';

const TABS = ['Overview', 'Team KPI Dashboard', 'Athletes', 'Reports & Progress', 'Metrics Library'] as const;
type Tab = (typeof TABS)[number];

export default function MetricsScreen() {
  const c = useColors(); const router = useRouter();
  const { role, user, isReady } = useApp();
  useEffect(() => { if (isReady && !user) router.replace({ pathname: '/launch', params: { returnTo: '/metrics' } } as never); }, [isReady, user, router]);
  if (!isReady || !user) return <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  if (role !== 'Admin' && role !== 'Staff-Coach') return <Shell title="LPA Metrics"><Card><Body>LPA Metrics is available to Admin and Staff-Coach users. Parents and athletes can open published reports from More.</Body><View style={{ height: 10 }} /><Btn label="Go back" onPress={() => router.back()} /></Card></Shell>;
  return <Workspace />;
}

function Workspace() {
  const c = useColors();
  const f = useFilters();
  const sp = useLocalSearchParams<{ tab?: string; athleteId?: string; metricId?: string }>();
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : 'Overview');
  const params = tab === 'Overview' ? {} : filterParams(f);
  const perr = tab === 'Overview' ? null : periodError(f);
  const q = useWorkspace(params, !perr);
  const ws = q.data;
  const showFilters = tab !== 'Metrics Library' && tab !== 'Overview';
  const guardRef = useRef<LeaveGuard | null>(null);
  const register = useCallback((g: LeaveGuard | null) => { guardRef.current = g; }, []);
  const go = (t: Tab) => { if (t === tab) return; if (tab === 'Overview' && guardRef.current) guardRef.current(() => setTab(t)); else setTab(t); };
  return <Shell title="LPA Metrics" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
    <SyncControl />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', backgroundColor: c.muted, borderRadius: 14, padding: 3 }}>
        {TABS.map((t) => <Pressable key={t} testID={`metrics-tab-${t.toLowerCase().replace(/[^a-z]+/g, '-')}`} accessibilityRole="tab" onPress={() => go(t)} style={{ paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: tab === t ? c.card : 'transparent' }}><Text style={{ color: tab === t ? c.foreground : c.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{t === 'Overview' ? 'KPI Overview' : t}</Text></Pressable>)}
      </View>
    </ScrollView>
    {tab === 'Overview' ? null : <CategoryTabs f={f} />}
    {showFilters ? <FilterBar f={f} ws={ws} /> : null}
    {tab === 'Overview' ? <OverviewEntry register={register} initialMetricId={sp.metricId} initialAthleteId={sp.athleteId} /> : perr && showFilters ? <ErrorBox message={perr} /> : q.isLoading ? <><Skeleton /><Skeleton h={160} /></> : q.isError ? <ErrorBox message={(q.error as Error)?.message || 'Metrics could not load.'} onRetry={() => void q.refetch()} /> : <>
      {tab === 'Team KPI Dashboard' ? <><SummaryCards ws={ws} /><TeamProgressChart ws={ws} /><View style={{ height: 14 }} /><KpiCards ws={ws} showDetails={false} /><MaxesSection ws={ws} /></> : null}
      {tab === 'Athletes' ? <AthletesPanel ws={ws} /> : null}
      {tab === 'Metrics Library' ? <LibraryPanel metrics={(ws?.metrics ?? []).filter((m) => !f.category || m.category === f.category)} /> : null}
      {tab === 'Reports & Progress' ? <ReportsPanel ws={ws} f={f} /> : null}
    </>}
    {Platform.OS === 'web' ? null : null}
  </Shell>;
}
