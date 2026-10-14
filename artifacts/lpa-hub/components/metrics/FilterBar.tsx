import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { DateCalendarSheet } from './DateCalendarSheet';
import { Btn, Card, Chip, Label, SearchBox } from './ui';
import { Body } from './ui';
import { Filters, MetricsWorkspace, Preset, fmtDate, periodError, resetFilters, setFilters, toggleSelection } from '@/lib/metrics';

const PRESETS: { id: Preset; label: string }[] = [{ id: 'all', label: 'All time' }, { id: '30', label: 'Last 30 days' }, { id: '90', label: 'Last 90 days' }, { id: '6m', label: 'Last 6 months' }, { id: '12m', label: 'Last 12 months' }, { id: 'year', label: 'This year' }, { id: 'custom', label: 'Custom' }];

export function FilterBar({ f, ws, hideAthletes, hideTeam }: { f: Filters; ws?: MetricsWorkspace; hideAthletes?: boolean; hideTeam?: boolean }) {
  const col = useColors();
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [pick, setPick] = useState<'start' | 'end' | null>(null);
  const categories = [...new Set((ws?.metrics ?? []).map((m) => m.category))].sort();
  const coaches: [string, string][] = ws?.coaches?.length ? ws.coaches.map((x) => [x.id, x.label]) : [...new Map((ws?.results ?? []).map((r) => [r.recordedBy, r.recorderName] as [string, string])).entries()];
  const err = periodError(f);
  const athletes = (ws?.athletes ?? []).filter((a) => a.fullName.toLowerCase().includes(f.athleteSearch.trim().toLowerCase()));
  const metrics = (ws?.metrics ?? []).filter((m) => (!f.category || m.category === f.category) && m.name.toLowerCase().includes(f.metricSearch.trim().toLowerCase()));
  const active = [hideTeam ? '' : f.team, f.athleteIds.length || f.athletesCleared, f.metricIds.length || f.metricsCleared, f.category, f.coachId, f.preset !== 'all'].filter(Boolean).length;
  const teamLabel = f.team ? ws?.teams.find((t) => t.id === f.team)?.label ?? f.team : 'All teams';
  const periodLabel = f.preset === 'custom' ? (f.start || f.end ? `${f.start ? fmtDate(f.start) : '?'} to ${f.end ? fmtDate(f.end) : '?'}` : 'Custom') : PRESETS.find((p) => p.id === f.preset)?.label;
  const toggleLabel = mini ? 'Expand filters' : 'Minimize filters';
  const toggleBtn = <Pressable testID="filters-toggle" accessibilityRole="button" accessibilityLabel={toggleLabel} accessibilityState={{ expanded: !mini }} onPress={() => { setMini(!mini); setPick(null); }} style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: col.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
    <Feather name={mini ? 'chevron-down' : 'chevron-up'} size={15} color={col.foreground} />
    <Text style={{ color: col.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{toggleLabel}</Text>
  </Pressable>;
  if (mini) return <Card>
    <View accessibilityState={{ expanded: false }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 180 }}>
        <Text style={{ color: col.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{hideTeam ? periodLabel : `${teamLabel} · ${periodLabel}`}</Text>
        <Text style={{ color: col.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11 }}>{active ? `${active} filter${active === 1 ? '' : 's'} active` : 'No filters active'}</Text>
      </View>
      {toggleBtn}
    </View>
    {err ? <Body style={{ color: '#E0625A', marginTop: 8 }}>{err} Results are not updated until the range is valid.</Body> : null}
  </Card>;
  return <Card>
    <View style={{ alignItems: 'flex-end', marginBottom: 4 }}>{toggleBtn}</View>
    {hideTeam ? null : <>
      <Label>Team</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={{ flexDirection: 'row' }}>
        <Chip label="All teams" active={!f.team} onPress={() => setFilters({ team: '', athleteIds: [], athletesCleared: false })} />
        {(ws?.teams ?? []).map((t) => <Chip key={t.id} label={t.label} active={f.team === t.id} onPress={() => setFilters({ team: t.id, athleteIds: [], athletesCleared: false })} />)}
      </View></ScrollView>
    </>}
    <Label>Period</Label>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{PRESETS.map((p) => <Chip key={p.id} label={p.label} active={f.preset === p.id} onPress={() => setFilters({ preset: p.id })} />)}</View>
    {f.preset === 'custom' ? <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      {(['start', 'end'] as const).map((k) => <View key={k} style={{ flex: 1, minWidth: 120 }}>
        <Label>{k === 'start' ? 'Start date' : 'End date'}</Label>
        <Pressable testID={`filter-${k}-date`} accessibilityRole="button" accessibilityLabel={`${k === 'start' ? 'Start' : 'End'} date, ${f[k] ? fmtDate(f[k]) : 'not set'}. Opens calendar`} onPress={() => setPick(k)} style={{ minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: col.border, backgroundColor: col.background }}>
          <Text style={{ color: f[k] ? col.foreground : col.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{f[k] ? fmtDate(f[k]) : 'Select date'}</Text>
          <Feather name="calendar" size={16} color={col.mutedForeground} />
        </Pressable>
      </View>)}
    </View> : null}
    <DateCalendarSheet visible={pick !== null} title={pick === 'end' ? 'Select end date' : 'Select start date'} value={pick ? f[pick] : ''} testIDPrefix={pick === 'end' ? 'filter-end-cal' : 'filter-start-cal'} onSelect={(d) => setFilters(pick === 'end' ? { end: d } : { start: d })} onClose={() => setPick(null)} />
    {err ? <Body style={{ color: '#E0625A', marginTop: 8 }}>{err} Results are not updated until the range is valid.</Body> : null}
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Btn testID="filters-more" label={open ? 'Hide more filters' : `More filters${active ? ` (${active})` : ''}`} kind="ghost" onPress={() => setOpen(!open)} />
      <Btn label="Reset filters" kind="ghost" onPress={resetFilters} disabled={!active} />
    </View>
    {open ? <View style={{ marginTop: 12 }}>
      <Label>Metric category</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}><Chip label="All" active={!f.category} onPress={() => setFilters({ category: '' })} />{categories.map((c) => <Chip key={c} label={c} active={f.category === c} onPress={() => setFilters({ category: f.category === c ? '' : c })} />)}</View>
      {coaches.length ? <><Label>Recorded by</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}><Chip label="Any coach" active={!f.coachId} onPress={() => setFilters({ coachId: '' })} />{coaches.map(([id, name]) => <Chip key={id} label={name} active={f.coachId === id} onPress={() => setFilters({ coachId: f.coachId === id ? '' : id })} />)}</View></> : null}
      <Label>Metrics {f.metricsCleared ? '(none selected)' : f.metricIds.length ? `(${f.metricIds.length} selected)` : '(all)'}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Btn label="Select all" kind="ghost" onPress={() => setFilters({ metricIds: [], metricsCleared: false })} />
        <Btn label="Clear all" kind="ghost" onPress={() => setFilters({ metricIds: [], metricsCleared: true })} />
        {f.category ? <Btn label={`Select all in ${f.category}`} kind="ghost" onPress={() => setFilters({ metricIds: (ws?.metrics ?? []).filter((m) => m.category === f.category).map((m) => m.id), metricsCleared: false })} /> : null}
      </View>
      <SearchBox value={f.metricSearch} onChange={(v) => setFilters({ metricSearch: v })} placeholder="Search metrics" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{metrics.map((m) => <Chip key={m.id} label={m.name} active={!f.metricsCleared && (!f.metricIds.length || f.metricIds.includes(m.id))} onPress={() => { const t = toggleSelection(f.metricIds, f.metricsCleared, m.id); setFilters({ metricIds: t.ids, metricsCleared: t.cleared }); }} />)}</View>
      {hideAthletes ? null : <><Label>Athletes {f.athletesCleared ? '(none selected)' : f.athleteIds.length ? `(${f.athleteIds.length} selected)` : '(whole roster)'}</Label>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <Btn label="Select all" kind="ghost" onPress={() => setFilters({ athleteIds: [], athletesCleared: false })} />
          <Btn label="Clear all" kind="ghost" onPress={() => setFilters({ athleteIds: [], athletesCleared: true })} />
        </View>
        <SearchBox value={f.athleteSearch} onChange={(v) => setFilters({ athleteSearch: v })} placeholder="Search athletes" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{athletes.slice(0, 80).map((a) => <Chip key={a.id} label={a.fullName} active={!f.athletesCleared && (!f.athleteIds.length || f.athleteIds.includes(a.id))} onPress={() => { const t = toggleSelection(f.athleteIds, f.athletesCleared, a.id); setFilters({ athleteIds: t.ids, athletesCleared: t.cleared }); }} />)}</View></>}
    </View> : null}
  </Card>;
}
