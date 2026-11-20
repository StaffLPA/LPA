import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coachNoteDraftKey,
  clearCoachNoteDraft,
  loadCoachNoteDraft,
  parseCoachNoteDraft,
  resolveCoachNoteSaveFailure,
  saveCoachNoteDraft,
} from '../lib/coachNoteEdit.ts';

test('coach-note draft keys isolate the signed-in user, athlete, and note', () => {
  const first = coachNoteDraftKey('user/a', 'athlete 1', 'note:1');

  assert.match(first, /user%2Fa:athlete%201:note%3A1$/);
  assert.notEqual(first, coachNoteDraftKey('user-b', 'athlete 1', 'note:1'));
  assert.notEqual(first, coachNoteDraftKey('user/a', 'athlete 2', 'note:1'));
  assert.notEqual(first, coachNoteDraftKey('user/a', 'athlete 1', 'note:2'));
});

test('coach-note drafts round-trip without changing their original note version', () => {
  const value = { text: 'Unfinished coaching cue', updatedAt: '2026-11-19T12:00:00.000Z' };

  assert.deepEqual(parseCoachNoteDraft(JSON.stringify(value)), value);
  assert.equal(parseCoachNoteDraft(null), null);
  assert.throws(() => parseCoachNoteDraft('{broken'), /could not be read/i);
});

test('clearing a coach-note draft waits for earlier writes so canceled text cannot return', async () => {
  const data = new Map();
  let releaseWrite;
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      await new Promise((resolve) => { releaseWrite = resolve; });
      data.set(key, value);
    },
    removeItem: async (key) => { data.delete(key); },
  };
  const key = coachNoteDraftKey('user-1', 'athlete-1', 'note-1');

  const saving = saveCoachNoteDraft(storage, key, { text: 'Keep this draft', updatedAt: 'version-1' });
  while (!releaseWrite) await new Promise((resolve) => setImmediate(resolve));
  const clearing = clearCoachNoteDraft(storage, key);
  releaseWrite();
  await Promise.all([saving, clearing]);

  assert.equal(await loadCoachNoteDraft(storage, key), null);
});

test('loading waits for an in-flight draft save and returns its latest value', async () => {
  const data = new Map();
  let releaseWrite;
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      await new Promise((resolve) => { releaseWrite = resolve; });
      data.set(key, value);
    },
    removeItem: async (key) => { data.delete(key); },
  };
  const key = coachNoteDraftKey('user-1', 'athlete-1', 'note-1');
  const saving = saveCoachNoteDraft(storage, key, { text: 'Latest text', updatedAt: 'version-1' });
  while (!releaseWrite) await new Promise((resolve) => setImmediate(resolve));
  const loading = loadCoachNoteDraft(storage, key);
  releaseWrite();

  assert.deepEqual(await loading, { text: 'Latest text', updatedAt: 'version-1' });
  await saving;
});

test('network failures keep the coach draft available for retry', () => {
  const draft = 'Keep the front-side control cue from today.';
  const failure = resolveCoachNoteSaveFailure(new TypeError('Network request failed'), 'note-1', draft);

  assert.equal(failure.kind, 'error');
  assert.equal(failure.draft, draft);
  assert.match(failure.message, /draft is still here/i);
});

test('conflicts return the draft and latest saved note for review', () => {
  const draft = 'My unsaved version.';
  const latest = { id: 'note-1', text: 'Saved on the other device.', updatedAt: '2026-11-19T12:00:00.000Z' };
  const failure = resolveCoachNoteSaveFailure({
    status: 409,
    data: { message: 'A newer version was saved.', latest },
  }, 'note-1', draft);

  assert.equal(failure.kind, 'conflict');
  assert.equal(failure.draft, draft);
  assert.equal(failure.latest, latest);
});
