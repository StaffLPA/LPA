import assert from 'node:assert/strict';
import test from 'node:test';
import { markRollcallDraft, reconcileRollcallDraft } from '../lib/rollcallDraft.ts';

test('newer taps on the same athlete and other athletes survive a slow save', () => {
  let draft = markRollcallDraft(undefined, 2, 'a', 'pending', 'present', false);
  draft = markRollcallDraft(draft, 2, 'a', 'pending', 'absent', true);
  draft = markRollcallDraft(draft, 2, 'b', 'pending', 'tardy', true);
  const remaining = reconcileRollcallDraft(draft, {
    revision: 3, students: [{ id: 'a', status: 'present' }, { id: 'b', status: 'pending' }],
  });
  assert.deepEqual(remaining, {
    baseRevision: 3, statuses: { a: 'absent', b: 'tardy' }, previous: { a: 'present', b: 'pending' },
  });
  assert.equal(reconcileRollcallDraft(remaining, {
    revision: 4, students: [{ id: 'a', status: 'absent' }, { id: 'b', status: 'tardy' }],
  }), undefined);
});

test('undo back to Pending during a save is retained and then persisted', () => {
  let draft = markRollcallDraft(undefined, 0, 'a', 'pending', 'present', false);
  draft = markRollcallDraft(draft, 0, 'a', 'pending', 'present', true);
  assert.equal(draft.statuses.a, 'pending');
  const remaining = reconcileRollcallDraft(draft, { revision: 1, students: [{ id: 'a', status: 'present' }] });
  assert.deepEqual(remaining, { baseRevision: 1, statuses: { a: 'pending' }, previous: { a: 'present' } });
  assert.equal(reconcileRollcallDraft(remaining, { revision: 2, students: [{ id: 'a', status: 'pending' }] }), undefined);
});

test('polls observing an in-flight save cannot turn an explicit newer tap into a lost undo', () => {
  let draft = markRollcallDraft(undefined, 0, 'a', 'pending', 'present', false);
  draft = markRollcallDraft(draft, 1, 'a', 'present', 'present', true);
  draft = markRollcallDraft(draft, 1, 'a', 'present', 'present', true);
  assert.equal(draft.statuses.a, 'present');
  assert.equal(reconcileRollcallDraft(draft, { revision: 1, students: [{ id: 'a', status: 'present' }] }), undefined);
});

test('ordinary unsent toggles clear cleanly and unchanged acknowledgements leave no draft', () => {
  let draft = markRollcallDraft(undefined, 0, 'a', 'pending', 'present', false);
  assert.equal(markRollcallDraft(draft, 0, 'a', 'pending', 'present', false), undefined);
  assert.equal(reconcileRollcallDraft(draft, { revision: 1, students: [{ id: 'a', status: 'present' }] }), undefined);
});
