import React from 'react';
import { View } from 'react-native';
import { getGetPerformanceAuditQueryKey, useGetPerformanceAudit } from '@workspace/api-client-react';
import { Body, Btn, Card, Empty, ErrorBox, Sheet, Skeleton } from './ui';
import { fmtDate } from '@/lib/metrics';

const show = (v: unknown) => (v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v));
export function AuditSheet({ kind, id, title, onClose }: { kind: 'metric' | 'result'; id: string | null; title: string; onClose: () => void }) {
  const q = useGetPerformanceAudit(kind, id ?? '', { query: { enabled: !!id, queryKey: getGetPerformanceAuditQueryKey(kind, id ?? '') } as never });
  const rows = (q.data ?? []) as any[];
  return <Sheet visible={!!id} title={title} onClose={onClose}>
    {q.isLoading ? <Skeleton /> : q.isError ? <ErrorBox message="Audit history could not load." onRetry={() => void q.refetch()} /> : !rows.length ? <Empty title="No history" copy="No changes have been recorded." /> : rows.map((a) => {
      const keys = [...new Set([...Object.keys(a.before ?? {}), ...Object.keys(a.after ?? {})])].filter((k) => show(a.before?.[k]) !== show(a.after?.[k]));
      return <Card key={a.id}>
        <Body style={{ fontFamily: 'Inter_700Bold' }}>{fmtDate(a.createdAt)} · {a.changedBy}</Body>
        <Body muted>Reason: {a.reason || '-'}</Body>
        <View style={{ marginTop: 6 }}>{keys.length ? keys.map((k) => <Body key={k} style={{ fontSize: 12 }}>{k}: {show(a.before?.[k])} to {show(a.after?.[k])}</Body>) : <Body muted>Created.</Body>}</View>
      </Card>;
    })}
    <Btn label="Close" kind="ghost" onPress={onClose} />
  </Sheet>;
}
