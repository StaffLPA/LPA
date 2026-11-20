import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryViewModel, snapshotHistoryDetail } from '../lib/buildHistory.ts';

test('history intensity details use only the original saved prescription, effort, unit and 1RM', () => {
  const snapshot = {
    unit: 'kg', calculatedLoad: 80, targetPercentageMin: 80, targetPercentageMax: 80,
    targetRpeMin: 7, targetRpeMax: 8, actualRpe: 8.5, actualRir: 1.5,
    actualPercentage: 85, oneRepMax: 100,
  };
  const description = snapshotHistoryDetail(snapshot);
  assert.match(description, /80% = 80 kg/);
  assert.match(description, /RPE 8.5 \/ RIR 1.5/);
  assert.match(description, /85% of 1RM \(100 kg\)/);
  assert.equal(snapshotHistoryDetail(undefined), '', 'legacy history does not invent a unit or intensity snapshot');
});

test('athlete History and personal records keep logged exercise names and set values after a library rename', () => {
  const workout = {
    assignment: { id: 'assignment-1', programName: 'Strength Program' },
    currentLibraryExerciseName: 'Renamed Shared Exercise',
    logs: [
      {
        id: 'log-1',
        assignmentId: 'assignment-1',
        dayId: 'day-1',
        dayName: 'Day A',
        weekName: 'Week 1',
        workoutExerciseId: 'workout-exercise-1',
        exerciseId: 'shared-exercise-1',
        exerciseName: 'Original Logged Exercise',
        setNumber: 2,
        weight: 140,
        reps: 5,
        notes: '',
        completed: true,
        loggedAt: '2026-11-02T16:00:00.000Z',
      },
      {
        id: 'log-2',
        assignmentId: 'assignment-1',
        dayId: 'day-1',
        dayName: 'Day A',
        weekName: 'Week 1',
        workoutExerciseId: 'workout-exercise-1',
        exerciseId: 'shared-exercise-1',
        exerciseName: 'Original Logged Exercise',
        setNumber: 1,
        weight: 135,
        reps: 5,
        notes: '',
        completed: true,
        loggedAt: '2026-11-02T15:59:00.000Z',
      },
    ],
    records: [{
      exerciseName: 'Original Logged Exercise',
      weight: 140,
      reps: 5,
      loggedAt: '2026-11-02T16:00:00.000Z',
    }],
  };

  const history = buildHistoryViewModel(workout);

  assert.deepEqual(history.records.map(({ exerciseName, value }) => ({ exerciseName, value })), [
    { exerciseName: 'Original Logged Exercise', value: '140 × 5' },
  ]);
  assert.deepEqual(history.groups[0].days[0].exercises, [{
    exerciseName: 'Original Logged Exercise',
    sets: [
      { setNumber: 1, value: '135×5' },
      { setNumber: 2, value: '140×5' },
    ],
  }]);
  assert.equal(JSON.stringify(history).includes(workout.currentLibraryExerciseName), false);
});

test('History keeps completed sets separated across previous and renewed assignments', () => {
  const previousAt = '2026-01-12T15:00:00.000Z';
  const currentAt = '2026-11-04T15:00:00.000Z';
  const history = buildHistoryViewModel({
    assignment: { id: 'renewed-assignment', programName: 'Renewed Strength Program' },
    logs: [
      {
        id: 'current-set', assignmentId: 'renewed-assignment', dayId: 'day-1',
        dayName: 'Day A', weekName: 'Week 1', workoutExerciseId: 'current-exercise',
        exerciseId: 'shared-exercise', exerciseName: 'Current Shared Exercise', setNumber: 1,
        weight: 175, reps: 3, notes: 'Current block', completed: true, loggedAt: currentAt,
      },
      {
        id: 'previous-set', assignmentId: 'previous-assignment', dayId: 'day-1',
        dayName: 'Day A', weekName: 'Week 1', workoutExerciseId: 'previous-exercise',
        exerciseId: 'shared-exercise', exerciseName: 'Original Logged Exercise', setNumber: 1,
        weight: 135, reps: 5, notes: 'Earlier block', completed: true, loggedAt: previousAt,
      },
    ],
    records: [],
  });

  assert.equal(history.groups.length, 2, 'identical week and day IDs do not merge assignment histories');
  const previous = history.groups.find(({ assignmentId }) => assignmentId === 'previous-assignment');
  const current = history.groups.find(({ assignmentId }) => assignmentId === 'renewed-assignment');
  assert.ok(previous);
  assert.ok(current);
  assert.equal(previous.programName, 'Previous program');
  assert.equal(previous.days[0].latest, previousAt);
  assert.deepEqual(previous.days[0].exercises, [{
    exerciseName: 'Original Logged Exercise',
    sets: [{ setNumber: 1, value: '135×5' }],
  }]);
  assert.equal(current.programName, 'Renewed Strength Program');
  assert.equal(current.days[0].latest, currentAt);
  assert.deepEqual(current.days[0].exercises, [{
    exerciseName: 'Current Shared Exercise',
    sets: [{ setNumber: 1, value: '175×3' }],
  }]);
});
