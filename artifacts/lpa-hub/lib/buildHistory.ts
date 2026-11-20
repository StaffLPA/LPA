import type { BuildIntensitySnapshot, BuildPublicWorkout } from '@workspace/api-client-react';

const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : String(Math.round(v * 10) / 10));
const range = (a?: number | null, b?: number | null, suffix = '') => {
  const x = n(a ?? b); const y = n(b ?? a);
  return x == null || y == null ? '' : x === y ? `${x}${suffix}` : `${x}–${y}${suffix}`;
};
/** Describes a logged set purely from its SAVED snapshot. Never reads current 1RMs or preferences. */
export function snapshotHistoryDetail(s: BuildIntensitySnapshot | undefined) {
  if (!s) return '';
  const parts: string[] = [];
  const rx: string[] = [];
  const pct = range(s.targetPercentageMin, s.targetPercentageMax, '%');
  if (pct) rx.push(s.calculatedLoad != null ? `${pct} = ${n(s.calculatedLoad)}${s.unit ? ` ${s.unit}` : ''}` : pct);
  else if (s.calculatedLoad != null) rx.push(`${n(s.calculatedLoad)}${s.unit ? ` ${s.unit}` : ''}`);
  const rpe = range(s.targetRpeMin, s.targetRpeMax); if (rpe) rx.push(`RPE ${rpe}`);
  const rir = range(s.targetRirMin, s.targetRirMax); if (rir) rx.push(`RIR ${rir}`);
  if (rx.length) parts.push(`Rx ${rx.join(', ')}`);
  if (s.unit) parts.push(`in ${s.unit}`);
  if (s.actualRpe != null || s.actualRir != null) parts.push([s.actualRpe != null ? `RPE ${n(s.actualRpe)}` : '', s.actualRir != null ? `RIR ${n(s.actualRir)}` : ''].filter(Boolean).join(' / '));
  if (s.actualPercentage != null) parts.push(`${n(s.actualPercentage)}% of 1RM${s.oneRepMax != null ? ` (${n(s.oneRepMax)}${s.unit ? ` ${s.unit}` : ''})` : ''}`);
  return parts.join(' · ');
}

type BuildHistorySource = Pick<BuildPublicWorkout, 'assignment' | 'logs' | 'records'>;

export function buildHistoryViewModel(workout: BuildHistorySource) {
  const records = workout.records.map((record) => ({
    key: `${record.exerciseName}-${record.loggedAt}`,
    exerciseName: record.exerciseName,
    value: `${record.weight}${record.reps ? ` × ${record.reps}` : ''}`,
  }));
  const byAssignment = new Map<string, Map<string, BuildPublicWorkout['logs']>>();

  for (const log of workout.logs) {
    const byDay = byAssignment.get(log.assignmentId) ?? new Map<string, BuildPublicWorkout['logs'][number][]>();
    byDay.set(log.dayId, [...(byDay.get(log.dayId) ?? []), log]);
    byAssignment.set(log.assignmentId, byDay);
  }

  const groups = [...byAssignment.entries()].map(([assignmentId, days]) => ({
    assignmentId,
    programName: workout.assignment?.id === assignmentId ? workout.assignment.programName : 'Previous program',
    days: [...days.entries()].map(([dayId, logs]) => ({
      dayId,
      weekName: logs[0].weekName,
      dayName: logs[0].dayName,
      latest: logs.reduce((latest, log) => log.loggedAt > latest ? log.loggedAt : latest, ''),
      exercises: [...new Set(logs.map((log) => log.exerciseName))].map((exerciseName) => ({
        exerciseName,
        sets: logs.filter((log) => log.exerciseName === exerciseName)
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((log) => ({
            setNumber: log.setNumber,
            value: `${log.weight ?? '–'}×${log.reps ?? '–'}`,
            ...(log.intensity ? { detail: snapshotHistoryDetail(log.intensity) } : {}),
          })),
      })),
    })),
  }));

  return { records, groups };
}
