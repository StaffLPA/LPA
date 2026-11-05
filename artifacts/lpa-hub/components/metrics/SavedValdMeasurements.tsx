import React from 'react';
import type { ValdExerciseMeasurements } from '@workspace/api-client-react';
import { Body, Card, H } from './ui';
import { fixed, fmtDate, fmtPct } from '@/lib/metrics';
import { ValdMeasurementChart } from './ValdMeasurementChart';

/** Deliberately no queries or dropdowns: a report must never read today's archives. */
export function SavedValdMeasurements({ exercises }: { exercises: ValdExerciseMeasurements[] }) {
  return <>{exercises.map((ex) => {
    const option = ex.options.find((o) => o.id === ex.selectedMeasurementId);
    return <Card key={ex.id}>
      <H sub={`${option?.name ?? 'No selected measurement'}${ex.unit ? ` [${ex.unit}]` : ''} · ${option?.limb ?? ''}`}>{ex.title}</H>
      <Body>Group Average {fixed(ex.groupAverage)}{ex.unit ? ` ${ex.unit}` : ''} · Previous {fixed(ex.previousAverage)} · {fmtPct(ex.percentageChange)}</Body>
      <Body muted>Saved source trials · {ex.pairedAthletes} paired athletes. Latest/previous values use each athlete’s trial mean for the corresponding test.</Body>
      <ValdMeasurementChart exercise={ex} measurementName={option?.name ?? ex.title} />
      {!ex.results.length ? <Body muted>No recorded results for this measurement in the saved period.</Body> : ex.results.map((r, i) =>
        <Body key={`${r.testId}-${r.trialId}-${r.repeat}-${r.limb}-${i}`} muted>{r.athleteName} · {fmtDate(r.testingDate)} · {r.value}{ex.unit ? ` ${ex.unit}` : ''} · {r.limb} · Trial {r.trialId} · Repeat {r.repeat}</Body>)}
    </Card>;
  })}</>;
}
