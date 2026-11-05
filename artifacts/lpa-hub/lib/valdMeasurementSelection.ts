import type { ValdExerciseMeasurements, ValdMeasurementsResponse } from '@workspace/api-client-react';

/** Select locally from the authorized, date-filtered bundle; never mix exercises. */
export function selectValdExercise(
  data: ValdMeasurementsResponse | undefined,
  exerciseId: ValdExerciseMeasurements['id'],
  measurementId?: string,
): ValdExerciseMeasurements | undefined {
  const initial = data?.exercises.find((exercise) => exercise.id === exerciseId);
  if (!measurementId || initial?.selectedMeasurementId === measurementId) return initial;
  return data?.measurementAlternatives?.find((exercise) =>
    exercise.id === exerciseId && exercise.selectedMeasurementId === measurementId) ?? initial;
}
