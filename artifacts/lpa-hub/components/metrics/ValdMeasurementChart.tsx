import React, { useMemo } from 'react';
import type { ValdExerciseMeasurements } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { LineChart } from './LineChart';

/** This chart uses the selected source values, never the legacy jump-height ID. */
export function ValdMeasurementChart({ exercise, measurementName }: { exercise: ValdExerciseMeasurements; measurementName: string }) {
  const colors = useColors();
  const points = useMemo(() => {
    const days = new Map<string, Map<string, number[]>>();
    for (const result of exercise.results) {
      const athletes = days.get(result.testingDate) ?? new Map<string, number[]>();
      const values = athletes.get(result.athleteId) ?? [];
      values.push(result.value);
      athletes.set(result.athleteId, values);
      days.set(result.testingDate, athletes);
    }
    return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, athletes]) => {
      const means = [...athletes.values()].map((values) => values.reduce((sum, value) => sum + value, 0) / values.length);
      return { date, value: means.reduce((sum, value) => sum + value, 0) / means.length,
        detail: `${date} · ${athletes.size} athletes · ${measurementName}` };
    });
  }, [exercise.results, measurementName]);
  return <LineChart title={measurementName} unit={exercise.unit} direction="neutral"
    caption="Daily average of athlete trial means" showEndpoints={false}
    series={[{ id: exercise.selectedMeasurementId ?? exercise.id, label: measurementName, color: colors.primary, points }]} />;
}
