import { useMemo, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useGetMetricsWorkspace } from '@workspace/api-client-react';
import type { MetricsWorkspace, MetricMax, PerformanceMetric, PerformanceSummary, PerformanceResult } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { phoenixToday, shiftDate } from '@/lib/rollcall';
import { deliverRollcallExport } from '@/lib/rollcall';

export { phoenixToday, shiftDate } from '@/lib/rollcall';
export const deliverExport = (file: { fileName: string; mimeType: string; contentBase64: string }) =>
  deliverRollcallExport(file, { dialogTitle: 'Export LPA Metrics' });
export type { MetricsWorkspace, MetricMax, PerformanceMetric, PerformanceSummary, PerformanceResult };

export const POLL_MS = 30_000;
export const UNCONFIGURED = 'unconfigured';
export const isUnconfigured = (m: { unit: string }) => m.unit.trim().toLowerCase() === UNCONFIGURED;

export type Preset = 'all' | '30' | '90' | '6m' | '12m' | 'year' | 'custom';
export type Filters = { team: string; athleteIds: string[]; athletesCleared: boolean; metricIds: string[]; metricsCleared: boolean; category: string; coachId: string; preset: Preset; start: string; end: string; athleteSearch: string; metricSearch: string };
export const DEFAULT_FILTERS: Filters = { team: '', athleteIds: [], athletesCleared: false, metricIds: [], metricsCleared: false, category: '', coachId: '', preset: 'all', start: '', end: '', athleteSearch: '', metricSearch: '' };

let state: Filters = DEFAULT_FILTERS;
let stateUser: string | null | undefined;
const listeners = new Set<() => void>();
export function setFilters(patch: Partial<Filters> | ((f: Filters) => Partial<Filters>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
export const resetFilters = () => { state = DEFAULT_FILTERS; listeners.forEach((l) => l()); };
/** Toggle one id: all-mode (empty, not cleared) becomes just that id; emptying becomes explicit "none". */
export function toggleSelection(ids: string[], cleared: boolean, id: string): { ids: string[]; cleared: boolean } {
  if (!ids.length) return { ids: [id], cleared: false };
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  return { ids: next, cleared: next.length === 0 };
}
export function useFilters() {
  const { user } = useApp();
  const uid = user?.id ?? null;
  if (stateUser !== uid) { const first = stateUser === undefined; stateUser = uid; if (!first) state = DEFAULT_FILTERS; }
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
}

export function periodError(f: Filters): string | null {
  if (f.preset !== 'custom') return null;
  const today = phoenixToday();
  const chk = (d: string, n: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${n} date must be YYYY-MM-DD.`;
    const t = new Date(`${d}T00:00:00Z`);
    if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d) return `${n} date does not exist.`;
    if (d > today) return `${n} date cannot be after today (${today}).`;
    return null;
  };
  if (!f.start.trim() && !f.end.trim()) return 'Enter a start and end date for a custom range.';
  return chk(f.start.trim(), 'Start') ?? chk(f.end.trim(), 'End') ?? (f.start.trim() > f.end.trim() ? 'Start date must be on or before the end date.' : null);
}

export function periodOf(f: Filters): { start?: string; end?: string } {
  const today = phoenixToday();
  if (f.preset === 'all') return {};
  if (f.preset === '30') return { start: shiftDate(today, -30), end: today };
  if (f.preset === '90') return { start: shiftDate(today, -90), end: today };
  if (f.preset === '6m') return { start: shiftDate(today, -182), end: today };
  if (f.preset === '12m') return { start: shiftDate(today, -365), end: today };
  if (f.preset === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return periodError(f) ? {} : { start: f.start.trim(), end: f.end.trim() };
}

export function filterParams(f: Filters, override?: { athleteIds?: string[]; ignoreTeam?: boolean }) {
  const { start, end } = periodOf(f);
  const ids = override?.athleteIds ?? f.athleteIds;
  const p: Record<string, string> = {};
  if (f.team && !override?.ignoreTeam) p.team = f.team;
  if (override?.athleteIds) p.athleteIds = ids.join(',');
  else if (f.athletesCleared) p.athleteIds = 'none';
  else if (ids.length) p.athleteIds = ids.join(',');
  if (f.metricsCleared) p.metricIds = 'none';
  else if (f.metricIds.length) p.metricIds = f.metricIds.join(',');
  if (start) p.start = start;
  if (end) p.end = end;
  if (f.category) p.category = f.category;
  if (f.coachId) p.coachId = f.coachId;
  return p;
}

export function athleteWorkspaceParams(f: Filters, athleteId: string, extra: Record<string, string> = {}) {
  return { ...filterParams(f, { athleteIds: [athleteId], ignoreTeam: true }), ...extra };
}

export function athleteTeamAverageParams(f: Filters, teamId?: string) {
  const params = filterParams(f, { athleteIds: [] });
  delete params.athleteIds;
  delete params.metricIds;
  delete params.team;
  if (teamId) params.team = teamId;
  return params;
}

export function useWorkspace(params: Record<string, string>, enabled = true) {
  const { user } = useApp();
  const key = JSON.stringify(params);
  const stable = useMemo(() => ({ ...params, compact: true }), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useGetMetricsWorkspace(stable, {
    query: { queryKey: ['/api/metrics/workspace', user?.id ?? 'anon', stable], enabled, refetchInterval: POLL_MS, refetchOnWindowFocus: true, staleTime: 10_000 } as never,
  });
}

export function useInvalidateMetrics() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/metrics') });
}

export function uuid(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[8 + Math.floor(Math.random() * 4)];
    else s += h[Math.floor(Math.random() * 16)];
  }
  return s;
}
/** Keeps one batch id until reset (retries reuse it). */
export function useBatchId() {
  const ref = useRef(uuid());
  return { get: () => ref.current, renew: () => { ref.current = uuid(); } };
}

export const fmtNum = (v: number | null | undefined, decimals?: number) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  const d = decimals ?? (Number.isInteger(v) ? 0 : 2);
  return v.toFixed(d).replace(/\.?0+$/, (m) => (d > 0 && m.includes('.') ? '' : m));
};
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '-%' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
export const fmtDate = (d?: string | null) => {
  if (!d) return '-';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${m}-${day}-${y}`;
};
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type Group = { key: string; metric: PerformanceMetric; unit: string; protocol: string; summaries: PerformanceSummary[] };
export function latestTeamAverage(ws: MetricsWorkspace | undefined, metricId: string, unit: string, protocol: string) {
  const latestByAthlete = new Map<string, PerformanceSummary>();
  for (const summary of ws?.summaries ?? []) {
    if (summary.metricId !== metricId || summary.unit !== unit || summary.protocol !== protocol || summary.latest === null) continue;
    const current = latestByAthlete.get(summary.athleteId);
    if (!current || (summary.lastTestingDate ?? '') > (current.lastTestingDate ?? '')) {
      latestByAthlete.set(summary.athleteId, summary);
    }
  }
  return mean([...latestByAthlete.values()].map((summary) => summary.latest!));
}
export function selectedMetrics(ws: MetricsWorkspace | undefined) {
  if (!ws || ws.filters?.metricIds === 'none') return [];
  const ids = ws.filters?.metricIds?.split(',').filter(Boolean) ?? [];
  return ws.metrics.filter((m) => (!ids.length || ids.includes(m.id)) &&
    (!ws.filters?.category || m.category === ws.filters.category));
}
/** Separate groups per metric+unit+protocol; incompatible units never merge. */
export function groupSummaries(ws: MetricsWorkspace | undefined): Group[] {
  if (!ws) return [];
  const map = new Map<string, Group>();
  for (const s of ws.summaries) {
    const metric = ws.metrics.find((m) => m.id === s.metricId);
    if (!metric) continue;
    const key = JSON.stringify([s.metricId, s.unit, s.protocol]);
    const g = map.get(key) ?? { key, metric, unit: s.unit, protocol: s.protocol, summaries: [] };
    g.summaries.push(s);
    map.set(key, g);
  }
  return [...map.values()];
}

export type Kpi = { current: number | null; baseline: number | null; pct: number | null; improved: boolean | null; tested: number; paired: number; missing: number; counts: Record<string, number>; pbs: number };
/** Current and baseline use the SAME paired athletes as the percentage; sample sizes are reported. */
export function kpiOf(g: Group, totalAthletes: number): Kpi {
  const tested = g.summaries.filter((s) => s.latest !== null);
  const paired = g.summaries.filter((s) => s.latest !== null && s.previous !== null);
  const current = paired.length ? mean(paired.map((s) => s.latest as number)) : mean(tested.map((s) => s.latest as number));
  const baseline = paired.length ? mean(paired.map((s) => s.previous as number)) : null;
  const dir = g.metric.direction;
  const pct = dir !== 'neutral' && paired.length && baseline !== null && baseline !== 0 && current !== null
    ? ((current - baseline) / Math.abs(baseline)) * 100 : null;
  const improved = pct === null || dir === 'neutral' || pct === 0 ? null : dir === 'higher' ? pct > 0 : pct < 0;
  const counts: Record<string, number> = { improved: 0, declined: 0, unchanged: 0, insufficient: 0, neutral: 0 };
  g.summaries.forEach((s) => { counts[s.status] = (counts[s.status] ?? 0) + 1; });
  counts.missing = Math.max(0, totalAthletes - tested.length);
  return { current, baseline, pct, improved, tested: tested.length, paired: paired.length, missing: counts.missing, counts, pbs: dir === 'neutral' ? 0 : g.summaries.filter((s) => s.personalBestInPeriod).length };
}

export const STATUS_LABEL: Record<string, string> = { improved: 'Improved', declined: 'Declined', unchanged: 'No change', neutral: 'Tracked (no better/worse)', insufficient: 'Needs another test', missing: 'No result' };
export const fixed = (v: number | null | undefined, decimals?: number) => (v === null || v === undefined || Number.isNaN(v) ? '-' : decimals === undefined ? fmtNum(v) : v.toFixed(decimals));
export function plainChange(first: number | null, latest: number | null, pct: number | null, dir: string, unit: string, d?: number) {
  if (first === null || latest === null) return 'Not enough results yet.';
  if (first === latest) return `No change from ${fixed(first, d)} ${unit}.`;
  const verb = latest > first ? 'rose' : 'dropped';
  const good = dir === 'neutral' ? '' : (dir === 'lower' ? latest < first : latest > first) ? (dir === 'lower' ? ' (lower is better, so this is an improvement)' : ' (an improvement)') : ' (moving away from the goal)';
  return `${verb} from ${fixed(first, d)} to ${fixed(latest, d)} ${unit}${pct !== null ? `, ${fmtPct(pct)}` : ''}${good}.`;
}

export function bestOf(values: number[], direction: string): number | null {
  if (!values.length || direction === 'neutral') return null;
  return direction === 'lower' ? Math.min(...values) : Math.max(...values);
}

export const csvLike = (s: string) => s;

export function openPrintable(file: { mimeType: string; contentBase64: string }) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const html = decodeURIComponent(escape(atob(file.contentBase64)));
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* user can print manually */ } }, 400);
  return true;
}
