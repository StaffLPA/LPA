import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LpaIcon as Feather } from '@/components/LpaIcon';
import { useColors } from '@/hooks/useColors';
import { Body, Empty, H, SearchBox } from './ui';
import { MetricsWorkspace, fmtDate } from '@/lib/metrics';

export function AthletesPanel({ ws }: { ws?: MetricsWorkspace }) {
  const c = useColors(); const router = useRouter(); const [q, setQ] = useState('');
  const selectedIds = new Set(ws?.selectedAthleteIds ?? (ws?.athletes ?? []).map((a) => a.id));
  const list = (ws?.athletes ?? []).filter((a) => selectedIds.has(a.id) && `${a.fullName} ${a.teams.join(' ')} ${a.gradYear ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <View>
    <H sub="Roster is every person tagged Athlete, filtered by the selected team.">Athletes</H>
    <SearchBox value={q} onChange={setQ} placeholder="Search name, team, grad year" />
    {!list.length ? <Empty title="No athletes found" copy="Adjust the team filter or search." /> : list.map((a) => {
      const s = ws?.summaries.filter((x) => x.athleteId === a.id) ?? [];
      const last = s.map((x) => x.lastTestingDate).filter(Boolean).sort().pop();
      return <Pressable key={a.id} testID={`athlete-${a.id}`} onPress={() => router.push(`/metrics/athlete/${a.id}` as never)} style={{ borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderColor: c.border }}>
        <View style={{ flex: 1 }}><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{a.fullName}</Text>
          <Body muted style={{ fontSize: 12 }}>{a.teams.join(', ') || 'No team'}{a.gradYear ? ` · ${a.gradYear}` : ''} · {s.length ? `${s.length} metric series · last tested ${fmtDate(last)}` : 'No results in this period'}</Body></View>
        <Feather name="chevron-right" size={18} color={c.mutedForeground} /></Pressable>;
    })}
  </View>;
}
