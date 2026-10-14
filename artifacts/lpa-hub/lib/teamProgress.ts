export type TpResult = { id: string; athleteId: string; metricId: string; unit: string; protocol: string; value: number; testingDate: string; createdAt: string };
export type TpTrend = { metricId: string; unit: string; protocol: string; date: string; average: number; sampleSize: number };
export type TpMetric = { id: string; name: string; category: string; decimals?: number };
export type TpPoint = { date: string; value: number; sampleSize: number; label: string };
export type TpLine = { id: string; metricId: string; metricName: string; protocol: string; showProtocol: boolean; unit: string; category: string; decimals?: number; points: TpPoint[] };
export type TpGroup = { id: string; category: string; unit: string; lines: TpLine[] };
export type TpMode = 'daily' | 'monthly';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** Same ordering as backend metricsAnalytics: testingDate, createdAt, id. */
export const resultOrder = (a: TpResult, b: TpResult) => a.testingDate.localeCompare(b.testingDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const ck = (r: { metricId: string; unit: string; protocol: string }) => JSON.stringify([r.metricId, r.unit, r.protocol]);

export function dailyPoints(trends: TpTrend[]): Map<string, TpPoint[]> {
  const out = new Map<string, TpPoint[]>();
  for (const t of trends) {
    if (!Number.isFinite(t.average) || t.sampleSize < 1) continue;
    const k = ck(t); if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ date: t.date, value: t.average, sampleSize: t.sampleSize, label: t.date });
  }
  for (const p of out.values()) p.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Latest result per athlete per cohort per month, averaged once per athlete. */
export function monthlyPoints(results: TpResult[]): Map<string, TpPoint[]> {
  const latest = new Map<string, TpResult>();
  for (const r of [...results].sort(resultOrder)) latest.set(JSON.stringify([ck(r), r.testingDate.slice(0, 7), r.athleteId]), r);
  const buckets = new Map<string, Map<string, number[]>>();
  for (const r of latest.values()) {
    const k = ck(r), ym = r.testingDate.slice(0, 7);
    if (!buckets.has(k)) buckets.set(k, new Map());
    const m = buckets.get(k)!; if (!m.has(ym)) m.set(ym, []);
    m.get(ym)!.push(r.value);
  }
  const out = new Map<string, TpPoint[]>();
  for (const [k, m] of buckets) out.set(k, [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ym, v]) => ({ date: `${ym}-01`, value: v.reduce((s, x) => s + x, 0) / v.length, sampleSize: v.length, label: monthLabel(ym) })));
  return out;
}

export function buildTeamProgress(mode: TpMode, trends: TpTrend[], results: TpResult[], metrics: TpMetric[], monthlyTrends?: TpTrend[]): TpGroup[] {
  const pts = mode === 'daily' ? dailyPoints(trends) : monthlyTrends ? dailyPoints(monthlyTrends) : monthlyPoints(results);
  return groupProgress(mode, pts, metrics);
}

/** One athlete's own series: latest result per day (daily) or per month (monthly), never averaged. */
export function athleteProgressPoints(mode: TpMode, results: TpResult[], athleteId: string): Map<string, TpPoint[]> {
  const latest = new Map<string, TpResult>();
  for (const r of results.filter((x) => x.athleteId === athleteId).sort(resultOrder)) latest.set(JSON.stringify([ck(r), mode === 'daily' ? r.testingDate.slice(0, 10) : r.testingDate.slice(0, 7)]), r);
  const out = new Map<string, TpPoint[]>();
  for (const r of latest.values()) {
    const k = ck(r); if (!out.has(k)) out.set(k, []);
    const ym = r.testingDate.slice(0, 7);
    out.get(k)!.push(mode === 'daily' ? { date: r.testingDate.slice(0, 10), value: r.value, sampleSize: 1, label: r.testingDate.slice(0, 10) } : { date: `${ym}-01`, value: r.value, sampleSize: 1, label: monthLabel(ym) });
  }
  for (const p of out.values()) p.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
export const buildAthleteProgress = (mode: TpMode, results: TpResult[], athleteId: string, metrics: TpMetric[]): TpGroup[] => groupProgress(mode, athleteProgressPoints(mode, results, athleteId), metrics);

export function groupProgress(mode: TpMode, pts: Map<string, TpPoint[]>, metrics: TpMetric[]): TpGroup[] {
  if (mode === 'monthly') for (const points of pts.values()) for (const point of points) point.label = monthLabel(point.date);
  const lines: TpLine[] = [];
  for (const [k, points] of pts) {
    if (!points.length) continue;
    const [metricId, unit, protocol] = JSON.parse(k) as string[];
    const m = metrics.find((x) => x.id === metricId);
    lines.push({ id: k, metricId, metricName: m?.name ?? metricId, protocol, showProtocol: false, unit, category: m?.category ?? 'Other', decimals: m?.decimals, points });
  }
  const groups = new Map<string, TpGroup>();
  for (const l of lines.sort((a, b) => a.metricName.localeCompare(b.metricName) || a.protocol.localeCompare(b.protocol))) {
    const gid = JSON.stringify([l.category, l.unit]);
    if (!groups.has(gid)) groups.set(gid, { id: gid, category: l.category, unit: l.unit, lines: [] });
    groups.get(gid)!.lines.push(l);
  }
  for (const g of groups.values()) for (const l of g.lines) l.showProtocol = g.lines.some((o) => o !== l && o.metricId === l.metricId);
  return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category) || a.unit.localeCompare(b.unit));
}
