import test from 'node:test';
import assert from 'node:assert/strict';
import { assignBuildSlot, emptyBuildSlots, readBuildSlots } from '../lib/buildAthleteSlots.ts';

test('four slots, legacy migration, persisted active athlete and first-filled fallback', () => {
  assert.deepEqual(emptyBuildSlots().slots, [null, null, null, null]);
  assert.equal(readBuildSlots(null, ['a'], 'a').activeAthleteId, 'a');
  const raw = JSON.stringify({ slots: [null, 'a', 'b'], activeAthleteId: 'b' });
  assert.deepEqual(readBuildSlots(raw, ['a', 'b']), { slots: [null, 'a', 'b', null], activeAthleteId: 'b' });
  assert.equal(readBuildSlots(raw, ['a']).activeAthleteId, 'a');
});
test('removed athletes, duplicate and malformed IDs cannot survive roster reconciliation', () => {
  assert.deepEqual(readBuildSlots(JSON.stringify({ slots: ['a', 'a', 'removed', 32], activeAthleteId: 'removed' }), ['a']),
    { slots: ['a', null, null, null], activeAthleteId: 'a' });
  assert.throws(() => readBuildSlots('{broken', ['a']));
  assert.throws(() => readBuildSlots('{"slots":false}', ['a']));
});
test('assign/remove preserves exactly four unique athletes and safely changes active identity', () => {
  const a = assignBuildSlot(emptyBuildSlots(), 0, 'a');
  const b = assignBuildSlot(a, 1, 'b');
  assert.deepEqual(assignBuildSlot(b, 2, 'a'), b);
  assert.equal(assignBuildSlot(b, 1, null).activeAthleteId, 'a');
  assert.equal(assignBuildSlot(b, 0, null).activeAthleteId, 'b');
  assert.equal(assignBuildSlot(a, 0, null).activeAthleteId, null);
  assert.equal(assignBuildSlot(b, 9, 'c'), b);
  assert.equal(assignBuildSlot(b, 1, 'c').activeAthleteId, 'c');
});
