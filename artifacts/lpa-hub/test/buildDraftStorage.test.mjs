import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDraftStorageKey,
  buildDraftEntryKey,
  matchingBuildDraft,
  parseBuildDraftSnapshots,
  readBuildDraftSnapshots,
  restoreMatchingBuildDraft,
  removeSavedBuildDraftEntries,
  saveWithDraftRecovery,
  writeBuildDraftSnapshots,
} from '../lib/buildDraftStorage.ts';

class MemoryStorage {
  values = new Map();
  failGet = false;
  failSet = false;

  getItem(key) {
    if (this.failGet) throw new Error('Storage read blocked');
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.failSet) throw new Error('Storage write blocked');
    this.values.set(key, value);
  }
}

const scope = { assignmentId: 'assignment-1', structureVersion: 4, pinRequired: false };
const entries = {
  'assignment-1|day-a|exercise-a|1': { weight: '85', reps: '5', notes: 'steady', completed: false },
  'assignment-1|day-b|exercise-b|2': { weight: '40', reps: '8', notes: '', completed: true },
};
const snapshot = {
  ...scope,
  entries,
  labels: {
    'assignment-1|day-a|exercise-a|1': { weekName: 'Week 1', dayName: 'Day A', exerciseName: 'Squat' },
  },
  updatedAt: '2026-11-02T12:00:00.000Z',
};

test('intensity drafts preserve half-step effort, units, and untouched autofill metadata', () => {
  const storage = new MemoryStorage();
  const entryKey = buildDraftEntryKey('assignment-1', 'day-a', 'exercise-a', 1);
  const intensityDraft = {
    ...snapshot,
    entries: { [entryKey]: { ...entries[entryKey], rpe: '8.5', rir: '1.5', unit: 'kg', auto: ['reps'] } },
  };
  writeBuildDraftSnapshots(storage, 'intensity-fixture', [intensityDraft]);
  const restored = matchingBuildDraft(readBuildDraftSnapshots(storage, 'intensity-fixture'), scope);
  assert.deepEqual(restored.entries[entryKey], intensityDraft.entries[entryKey]);
  assert.equal(restored.entries[entryKey].weight, '85', 'typed load survives recovery rather than being replaced by a new target');
});

test('a browser reload restores only the matching athlete, assignment, structure, and access scope', () => {
  const storage = new MemoryStorage();
  const athleteKey = buildDraftStorageKey('athlete-a');
  writeBuildDraftSnapshots(storage, athleteKey, [snapshot]);

  // A new component instance reads the persisted value as a reload would.
  const reloaded = readBuildDraftSnapshots(storage, athleteKey);
  const restored = matchingBuildDraft(reloaded, scope);
  assert.equal(restored?.entries[buildDraftEntryKey('assignment-1', 'day-a', 'exercise-a', 1)].weight, '85');
  assert.equal(restored?.entries[buildDraftEntryKey('assignment-1', 'day-c', 'exercise-a', 1)], undefined);
  assert.deepEqual(restored?.entries[buildDraftEntryKey('assignment-1', 'day-b', 'exercise-b', 2)], entries['assignment-1|day-b|exercise-b|2']);
  assert.equal(readBuildDraftSnapshots(storage, buildDraftStorageKey('athlete-b')).length, 0);
  assert.equal(matchingBuildDraft(reloaded, { ...scope, assignmentId: 'assignment-2' }), null);
  assert.equal(matchingBuildDraft(reloaded, { ...scope, structureVersion: 5 }), null);
  assert.equal(matchingBuildDraft(reloaded, { ...scope, pinRequired: true }), null);
});

test('a rejected server save leaves the persisted draft available for an explicit retry', async () => {
  const storage = new MemoryStorage();
  const key = buildDraftStorageKey('athlete-a');
  writeBuildDraftSnapshots(storage, key, [snapshot]);
  let entriesAfterSave = entries;
  const onSaved = () => {
    entriesAfterSave = removeSavedBuildDraftEntries(entriesAfterSave, 'assignment-1', 'day-a', new Set(['exercise-a']));
    writeBuildDraftSnapshots(storage, key, Object.keys(entriesAfterSave).length
      ? [{ ...snapshot, entries: entriesAfterSave }]
      : []);
  };

  const failed = await saveWithDraftRecovery(async () => {
    throw new Error('Server unavailable');
  }, onSaved);
  assert.equal(failed.ok, false);
  assert.deepEqual(readBuildDraftSnapshots(storage, key)[0].entries, entries);
  assert.deepEqual(entriesAfterSave, entries);

  const retried = await saveWithDraftRecovery(async () => ({ saved: true }), onSaved);
  assert.deepEqual(retried, { ok: true, value: { saved: true } });
  const afterRetry = readBuildDraftSnapshots(storage, key);
  assert.deepEqual(afterRetry[0].entries, {
    'assignment-1|day-b|exercise-b|2': entries['assignment-1|day-b|exercise-b|2'],
  });
});

test('storage failures and unreadable data are surfaced without overwriting the prior snapshot', () => {
  const storage = new MemoryStorage();
  const key = buildDraftStorageKey('athlete-a');
  const prior = JSON.stringify([snapshot]);
  storage.values.set(key, prior);

  storage.failSet = true;
  assert.throws(() => writeBuildDraftSnapshots(storage, key, []), /Storage write blocked/);
  assert.equal(storage.values.get(key), prior);

  storage.failSet = false;
  storage.failGet = true;
  assert.throws(() => readBuildDraftSnapshots(storage, key), /Storage read blocked/);
  storage.failGet = false;

  const corrupt = '{not valid json';
  storage.values.set(key, corrupt);
  assert.throws(() => parseBuildDraftSnapshots(storage.getItem(key)), /not readable/);
  assert.equal(storage.values.get(key), corrupt);
});

test('draft recovery retries storage and merges the readable snapshot without losing current edits', () => {
  const storage = new MemoryStorage();
  const key = buildDraftStorageKey('athlete-a');
  const prior = JSON.stringify([snapshot]);
  storage.values.set(key, prior);
  storage.failGet = true;

  assert.throws(() => readBuildDraftSnapshots(storage, key), /Storage read blocked/);
  assert.equal(storage.values.get(key), prior);

  storage.failGet = false;
  const recovered = readBuildDraftSnapshots(storage, key);
  const editedEntry = {
    ...entries['assignment-1|day-a|exercise-a|1'],
    weight: '90',
    notes: 'updated while storage was blocked',
  };
  const currentEntries = {
    'assignment-1|day-a|exercise-a|1': editedEntry,
    'assignment-1|day-c|exercise-c|1': { weight: '20', reps: '10', notes: '', completed: false },
  };
  const result = restoreMatchingBuildDraft(recovered, scope, currentEntries);

  assert.equal(result.snapshot, recovered[0]);
  assert.deepEqual(result.entries, {
    ...entries,
    ...currentEntries,
  });
  assert.equal(storage.values.get(key), prior);
});
