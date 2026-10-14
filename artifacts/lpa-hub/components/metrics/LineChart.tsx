import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { Body, Empty } from './ui';
import { fixed, fmtDate, fmtNum } from '@/lib/metrics';

export type Pt = { date: string; value: number; detail?: string };
export type Series = { id: string; label: string; color: string; points: Pt[]; markBest?: boolean };
const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

export function LineChart({ title, unit, direction, series, caption, decimals, dateLabel = fmtDate, showEndpoints = true }: { title: string; unit: string; direction: string; series: Series[]; caption?: string; decimals?: number; dateLabel?: (date: string) => string; showEndpoints?: boolean }) {
  const c = useColors();
  const [w, setW] = useState(320);
  const [hidden, setHidden] = useState<string[]>([]);
  const [sel, setSel] = useState<{ s: string; i: number } | null>(null);
  const H = 210, L = 44, R = 12, T = 12, B = 26;
  const vis = series.filter((s) => !hidden.includes(s.id) && s.points.length);
  const all = vis.flatMap((s) => s.points);
  if (!series.some((s) => s.points.length)) return <Empty title={`${title}: no results`} copy="Nothing has been recorded for the current filters." />;
  const xs = all.map((p) => ms(p.date)); const ys = all.map((p) => p.value);
  const x0 = xs.length ? xs.reduce((n, x) => Math.min(n, x), Infinity) : 0;
  const x1 = xs.length ? xs.reduce((n, x) => Math.max(n, x), -Infinity) : 1;
  let y0 = ys.length ? ys.reduce((n, y) => Math.min(n, y), Infinity) : 0;
  let y1 = ys.length ? ys.reduce((n, y) => Math.max(n, y), -Infinity) : 1;
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const X = (d: string) => L + (x1 === x0 ? (w - L - R) / 2 : ((ms(d) - x0) / (x1 - x0)) * (w - L - R));
  const Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const sorted = (x: Series) => [...x.points].sort((p, q) => ms(p.date) - ms(q.date));
  const bestIdx = (x: Series) => { if (direction === 'neutral' || !x.markBest || !x.points.length) return -1; let bi = 0; x.points.forEach((p, i) => { if (direction === 'lower' ? p.value < x.points[bi].value : p.value > x.points[bi].value) bi = i; }); return bi; };
  const selPt = sel ? series.find((q) => q.id === sel.s)?.points[sel.i] : null;
  const ticks = [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * i) / 3);
  const labelDates = x1 === x0 ? [all[0]?.date] : [all.find((p) => ms(p.date) === x0)?.date, all.find((p) => ms(p.date) === x1)?.date];
  return <View style={{ marginBottom: 14 }} onLayout={(e) => setW(Math.max(240, e.nativeEvent.layout.width))}>
    <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{title}</Text>
    <Body muted style={{ fontSize: 11, marginBottom: 6 }}>Unit: {unit}{caption ? ` · ${caption}` : ''}</Body>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
      {series.map((s) => { const off = hidden.includes(s.id); return <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: !off }} onPress={() => setHidden(off ? hidden.filter((h) => h !== s.id) : [...hidden, s.id])} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4, opacity: off ? 0.4 : 1 }}>
        <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: s.color, marginRight: 5 }} /><Text style={{ color: c.foreground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{s.label}</Text></Pressable>; })}
    </View>
    <Svg width={w} height={H}>
      {ticks.map((t, i) => <G key={i}><Line x1={L} x2={w - R} y1={Y(t)} y2={Y(t)} stroke={c.border} strokeWidth={1} /><SvgText x={L - 6} y={Y(t) + 4} fontSize={10} fill={c.mutedForeground} textAnchor="end">{decimals !== undefined ? t.toFixed(decimals) : fmtNum(t, Math.abs(y1 - y0) < 5 ? 2 : 0)}</SvgText></G>)}
      {labelDates[0] ? <SvgText x={L} y={H - 6} fontSize={10} fill={c.mutedForeground} textAnchor="start">{dateLabel(labelDates[0])}</SvgText> : null}
      {x1 !== x0 && labelDates[1] ? <SvgText x={w - R} y={H - 6} fontSize={10} fill={c.mutedForeground} textAnchor="end">{dateLabel(labelDates[1])}</SvgText> : null}
      {vis.map((s) => { const pts = sorted(s); return <Path key={s.id} d={pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.date)} ${Y(p.value)}`).join(' ')} stroke={s.color} strokeWidth={2} fill="none" />; })}
      {vis.map((s) => s.points.map((p, i) => <Circle key={`${s.id}${i}`} cx={X(p.date)} cy={Y(p.value)} r={sel && sel.s === s.id && sel.i === i ? 6 : 4} fill={s.color} stroke={c.card} strokeWidth={1.5} onPress={() => setSel({ s: s.id, i })} />))}
      {vis.map((s) => { const bi = bestIdx(s); const p = bi >= 0 ? s.points[bi] : null; const pts = sorted(s); const fp = pts[0], lp = pts[pts.length - 1];
        return <G key={`m${s.id}`}>
          {p ? <G><Circle cx={X(p.date)} cy={Y(p.value)} r={9} fill="none" stroke="#E7C65B" strokeWidth={2} /><SvgText x={X(p.date)} y={Math.max(10, Y(p.value) - 13)} fontSize={9} fill="#E7C65B" textAnchor="middle" fontWeight="bold">PB</SvgText></G> : null}
          {showEndpoints && pts.length > 1 ? <SvgText x={X(fp.date)} y={Y(fp.value) + 16} fontSize={9} fill={s.color} textAnchor="start">First</SvgText> : null}
          {showEndpoints && pts.length > 1 ? <SvgText x={X(lp.date)} y={Y(lp.value) + 16} fontSize={9} fill={s.color} textAnchor="end">Latest</SvgText> : null}
        </G>; })}
    </Svg>
    <Body style={{ fontSize: 12 }}>{selPt ? `${series.find((q) => q.id === sel!.s)!.label}: ${fixed(selPt.value, decimals)} ${unit} on ${dateLabel(selPt.date)}${selPt.detail ? `\n${selPt.detail}` : ''}` : 'Tap a point for its date, value, session and notes.'}</Body>
    {series.some((x) => x.markBest) ? <Body muted style={{ fontSize: 11 }}>{direction === 'neutral' ? 'No personal best for neutral metrics.' : 'PB marks each athlete\'s own best result in this view.'}</Body> : null}
  </View>;
}
