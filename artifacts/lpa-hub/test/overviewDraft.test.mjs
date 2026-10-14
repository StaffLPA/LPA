import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDate, validateCell, buildEntries, summarize, removeSaved, draftKey, approveEdit, changedKeys, draftSignature } from '../lib/overviewDraft.ts';
const A = [{ id: 'a', fullName: 'Ava' }, { id: 'b', fullName: 'Ben' }];
const M = [{ id: 'm1', name: 'Sprint', category: 'Speed', dataType: 'time', unit: 's', decimals: 2, active: true }, { id: 'm2', name: 'Reps', category: 'Strength', dataType: 'repetitions', unit: 'reps', decimals: 0, active: true }, { id: 'm3', name: 'Bar', category: 'Strength', dataType: 'decimal', unit: 'unconfigured', decimals: 1, active: true }];
const k = draftKey;
test('dates', () => {
  assert.ok(validateDate('2026-02-30', '2026-03-01'));
  assert.ok(validateDate('2026-03-02', '2026-03-01'));
  assert.ok(validateDate('1999-12-31', '2026-03-01'));
  assert.equal(validateDate('2026-03-01', '2026-03-01'), null);
});
test('cells follow server rules', () => {
  assert.ok(validateCell('0', M[0]));
  assert.ok(validateCell('3.5', M[1]));
  assert.ok(validateCell('4.123', M[0]));
  assert.ok(validateCell('101', { id: 'body-fat', name: 'BF', dataType: 'decimal', decimals: 1 }));
  assert.equal(validateCell('4.12', M[0]), null);
});
test('untouched approved edit is not dirty or sent', () => {
  const ex = { [k('a', 'm1')]: { id: 'r1', revision: 3, value: 5, unit: 's' } };
  const s = approveEdit({}, {}, k('a', 'm1'), ex[k('a', 'm1')], M[0]);
  assert.deepEqual(changedKeys(s.drafts, s.approvals), []);
  assert.deepEqual(summarize(s.drafts, s.approvals), { cells: 0, edits: 0, athletes: 0, metrics: 0 });
  assert.ok(buildEntries(s.drafts, s.approvals, ex, A, M).error);
});
test('mixed create and edit payload carries id and revision', () => {
  const ex = { [k('a', 'm1')]: { id: 'r1', revision: 3, value: 5, unit: 's' } };
  const s = approveEdit({}, {}, k('a', 'm1'), ex[k('a', 'm1')], M[0]);
  const d = { ...s.drafts, [k('a', 'm1')]: '4.9', [k('b', 'm2')]: '10', [k('b', 'm1')]: ' ' };
  const r = buildEntries(d, s.approvals, ex, A, M);
  assert.deepEqual(r.entries, [{ athleteId: 'a', metricId: 'm1', value: 4.9, resultId: 'r1', revision: 3 }, { athleteId: 'b', metricId: 'm2', value: 10 }]);
  const rm = removeSaved(d, s.approvals, r.entries.map((e) => k(e.athleteId, e.metricId)));
  assert.deepEqual(rm, { drafts: { [k('b', 'm1')]: ' ' }, approvals: {} });
});
test('blank replacement rejected and dirty', () => {
  const ex = { [k('a', 'm1')]: { id: 'r1', revision: 1, value: 5, unit: 's' } };
  const s = approveEdit({}, {}, k('a', 'm1'), ex[k('a', 'm1')], M[0]);
  const d = { [k('a', 'm1')]: '' };
  assert.equal(changedKeys(d, s.approvals).length, 1);
  assert.match(buildEntries(d, s.approvals, ex, A, M).error, /blank/);
});
test('typed draft on row that later exists needs explicit approval, then keeps typed value', () => {
  const ex = { [k('a', 'm1')]: { id: 'r9', revision: 2, value: 5, unit: 's' } };
  const d = { [k('a', 'm1')]: '4.8' };
  assert.match(buildEntries(d, {}, ex, A, M).error, /Approve/);
  const s = approveEdit(d, {}, k('a', 'm1'), ex[k('a', 'm1')], M[0]);
  assert.equal(s.drafts[k('a', 'm1')], '4.8');
  assert.equal(buildEntries(s.drafts, s.approvals, ex, A, M).entries[0].revision, 2);
});
test('approved revision is immutable under polling', () => {
  const rec = { id: 'r1', revision: 3, value: 5, unit: 's' };
  const s = approveEdit({}, {}, k('a', 'm1'), rec, M[0]);
  const polled = { [k('a', 'm1')]: { id: 'r1', revision: 4, value: 6, unit: 's' } };
  const again = approveEdit({ ...s.drafts, [k('a', 'm1')]: '4' }, s.approvals, k('a', 'm1'), polled[k('a', 'm1')], M[0]);
  assert.equal(again.approvals[k('a', 'm1')].revision, 3);
  assert.equal(buildEntries(again.drafts, again.approvals, polled, A, M).entries[0].revision, 3);
});
test('frozen approval prefers stored dataType/decimals; signature stable for retry', () => {
  const rec = { id: 'r1', revision: 1, value: 5, unit: 's', dataType: 'integer', decimals: 0 };
  const s = approveEdit({}, {}, k('a', 'm1'), rec, M[0]);
  assert.equal(s.approvals[k('a', 'm1')].dataType, 'integer');
  const d = { [k('a', 'm1')]: '4' };
  assert.equal(draftSignature('2026-01-01', d, s.approvals), draftSignature('2026-01-01', { ...d }, s.approvals));
  assert.notEqual(draftSignature('2026-01-01', d, s.approvals), draftSignature('2026-01-01', { [k('a', 'm1')]: '3' }, s.approvals));
});
