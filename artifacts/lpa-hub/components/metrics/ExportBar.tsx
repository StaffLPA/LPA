import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { exportPerformanceMetrics } from '@workspace/api-client-react';
import { Body, Btn, Card, H } from './ui';
import { deliverExport, errMsg, openPrintable } from '@/lib/metrics';

type Fmt = 'csv' | 'xlsx' | 'html';
export function ExportBar({ params }: { params: Record<string, string> }) {
  const [fmt, setFmt] = useState<Fmt | null>(null);
  const [print, setPrint] = useState(false);
  const [error, setError] = useState('');
  const run = async (f: Fmt, printIt = false) => {
    setFmt(f); setPrint(printIt); setError('');
    try {
      const file = await exportPerformanceMetrics({ ...params, format: f });
      if (printIt && openPrintable(file)) return;
      await deliverExport(file);
    } catch (e) { setError(`Export failed: ${errMsg(e)}`); } finally { setFmt(null); setPrint(false); }
  };
  const busy = fmt !== null;
  return <Card>
    <H sub="Exports use the filters currently applied. Unavailable values stay blank.">Export</H>
    {error ? <Body>{error}</Body> : null}
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Btn label="CSV" icon="download" kind="ghost" loading={busy && fmt === 'csv'} disabled={busy} onPress={() => run('csv')} />
      <Btn label="Excel (XLSX)" icon="download" kind="ghost" loading={busy && fmt === 'xlsx'} disabled={busy} onPress={() => run('xlsx')} />
      <Btn label="HTML report" icon="download" kind="ghost" loading={busy && fmt === 'html' && !print} disabled={busy} onPress={() => run('html')} />
      {Platform.OS === 'web' ? <Btn label="Print view" icon="file-text" kind="ghost" loading={busy && print} disabled={busy} onPress={() => run('html', true)} /> : null}
    </View>
  </Card>;
}
