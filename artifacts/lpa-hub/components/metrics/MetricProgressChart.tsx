import React, { useState } from 'react';
import { View } from 'react-native';
import { MetricsWorkspace } from '@/lib/metrics';
import { AthleteProgressChart } from './AthleteProgressChart';
import { Btn } from './ui';

/** Open a single metric's graph without changing the athlete page's filters. */
export function MetricProgressChart({ ws, athleteId, metricId, unit, protocol }: {
  ws: MetricsWorkspace; athleteId: string; metricId: string; unit?: string; protocol?: string;
}) {
  const [open, setOpen] = useState(false);
  return <View testID={`metric-progress-${metricId}`} style={{ marginTop: 10 }}>
    <Btn label={open ? 'Hide graph' : 'Graph'} kind="ghost" onPress={() => setOpen((v) => !v)} />
    {open ? <View style={{ marginTop: 10 }}>
      <AthleteProgressChart ws={ws} athleteId={athleteId} metricId={metricId} unit={unit} protocol={protocol} />
    </View> : null}
  </View>;
}
