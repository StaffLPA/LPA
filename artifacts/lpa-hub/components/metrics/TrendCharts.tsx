import React from 'react';
import { useGetMetricsChartResults } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { Card, Body, Empty, ErrorBox, H, Skeleton } from './ui';
import { LineChart, Series } from './LineChart';
import { MetricsWorkspace, fixed } from '@/lib/metrics';

const COLORS = ['#C97A4A', '#9BC7BD', '#E7C65B', '#8AA2D6', '#C98AB8', '#7FB77E', '#D6A06B', '#A78BDA'];

function useChartWorkspace(source?: MetricsWorkspace) {
  const { user } = useApp();
  const query = useGetMetricsChartResults(source?.filters, {
    query: { enabled: !!source?.historyPaged, queryKey: ['/api/metrics/chart-results', user?.id, source?.filters], staleTime: 10_000, refetchInterval: 30_000 },
  });
  return { ws: source?.historyPaged ? { ...source, results: query.data ?? [] } : source, query };
}

function athleteSeries(ws: MetricsWorkspace, metricId: string, unit: string, protocol: string, staff: boolean): Series[] {
  const rows = ws.results.filter((r) => r.metricId === metricId && r.unit === unit && r.protocol === protocol);
  const ids = [...new Set(rows.map((r) => r.athleteId))].slice(0, 8);
  return ids.map((id, i) => ({
    id, markBest: true, label: ws.athletes.find((a) => a.id === id)?.fullName ?? 'Athlete', color: COLORS[i % COLORS.length],
    points: rows.filter((r) => r.athleteId === id).map((r) => ({
      date: r.testingDate, value: r.value,
      detail: [`${r.protocol} · session ${r.sessionName}${staff ? ` · recorded by ${r.recorderName}` : ''}${r.sets ? ` · ${r.sets} sets` : ''}${r.repetitions ? ` x ${r.repetitions} reps` : ''}`, r.publicNotes ? `Public note: ${r.publicNotes}` : '', staff && r.notes ? `Internal note: ${r.notes}` : ''].filter(Boolean).join('\n'),
    })),
  }));
}

/** Team charts: aggregate trend (never labelled a personal best) plus individual athlete comparison per metric+unit+protocol. */
export function TeamCharts({ ws: source, staff = true }: { ws?: MetricsWorkspace; staff?: boolean }) {
  const { ws, query } = useChartWorkspace(source);
  if (!ws) return null;
  const keys = [...new Set([...ws.trends.map((t) => JSON.stringify([t.metricId, t.unit, t.protocol])), ...ws.results.map((t) => JSON.stringify([t.metricId, t.unit, t.protocol]))])];
  return <Card>
    <H sub="Team lines use one latest retest per athlete per day. Units and protocols are never mixed. Median, minimum and maximum need at least 3 athletes on a date.">Team trends and athlete comparison</H>
    {source?.historyPaged ? <Body muted>Comparison charts show the latest retest per day for up to 8 athletes. Best markers refer to those daily points; summary personal bests include every test. History and exports include all retests.</Body> : null}
    {source?.historyPaged && query.isLoading ? <Skeleton /> : null}
    {source?.historyPaged && query.isError ? <ErrorBox message="Athlete comparison could not load." onRetry={() => void query.refetch()} /> : null}
    {!keys.length ? <Empty title="No trend data" copy="Record results or widen the filters to see trends." /> : keys.map((k) => {
      const [metricId, unit, protocol] = (JSON.parse(k) as string[]);
      const m = ws.metrics.find((x) => x.id === metricId);
      const rows = ws.trends.filter((t) => t.metricId === metricId && t.unit === unit && t.protocol === protocol);
      const mk = (id: string, label: string, color: string, f: (t: (typeof rows)[number]) => number, min: number): Series => ({ id, label, color, points: rows.filter((t) => t.sampleSize >= min).map((t) => ({ date: t.date, value: f(t), detail: `Team ${label.toLowerCase()} of ${t.sampleSize} athlete${t.sampleSize === 1 ? '' : 's'} · ${protocol}${t.sampleSize < 3 ? ' · small sample' : ''}` })) });
      const small = rows.some((t) => t.sampleSize < 3);
      const dir = m?.direction ?? 'neutral';
      return <React.Fragment key={k}>
        <LineChart title={`${m?.name ?? metricId}: team average`} unit={unit} direction={dir} decimals={m?.decimals} caption={`${protocol}${small ? ' · some dates have fewer than 3 athletes, so spread stats are hidden there (insufficient sample)' : ''}`} series={[mk('avg', 'Average', COLORS[0], (t) => t.average, 1), mk('med', 'Median', COLORS[1], (t) => t.median, 3), mk('min', 'Minimum', COLORS[2], (t) => t.minimum, 3), mk('max', 'Maximum', COLORS[3], (t) => t.maximum, 3)]} />
        <LineChart title={`${m?.name ?? metricId}: athlete comparison`} unit={unit} direction={dir} decimals={m?.decimals} caption={`${protocol} · best shown point is marked`} series={athleteSeries(ws, metricId, unit, protocol, staff)} />
      </React.Fragment>;
    })}
  </Card>;
}

/** Individual charts built directly from recorded results; one series per athlete. */
export function ResultCharts({ ws: source, title = 'Progress', staff = true }: { ws?: MetricsWorkspace; title?: string; staff?: boolean }) {
  const { ws, query } = useChartWorkspace(source);
  if (!ws) return null;
  const keys = [...new Set(ws.results.map((r) => JSON.stringify([r.metricId, r.unit, r.protocol])))];
  return <Card>
    <H sub={source?.historyPaged ? "Latest recorded retest per athlete per day. Best markers refer to shown points; summaries, history and exports include all tests." : "Every point is a recorded result. Nothing is estimated."}>{title}</H>
    {source?.historyPaged && query.isLoading ? <Skeleton /> : source?.historyPaged && query.isError ? <ErrorBox message="Progress charts could not load." onRetry={() => void query.refetch()} /> : !keys.length ? <Empty title="No results to chart" copy="No results match the current filters." /> : keys.map((k) => {
      const [metricId, unit, protocol] = (JSON.parse(k) as string[]);
      const m = ws.metrics.find((x) => x.id === metricId);
      return <LineChart key={k} title={m?.name ?? metricId} unit={unit} direction={m?.direction ?? 'neutral'} decimals={m?.decimals} caption={protocol} series={athleteSeries(ws, metricId, unit, protocol, staff)} />;
    })}
    {ws.results.length ? <Body muted style={{ fontSize: 11 }}>{fixed(ws.results.length, 0)} results shown. Charts show up to 8 athletes each; narrow the athlete filter to focus.</Body> : null}
  </Card>;
}
