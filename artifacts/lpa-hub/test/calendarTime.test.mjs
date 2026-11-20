import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendarTime, calendarTimeSlots } from '../lib/calendarTime.ts';

test('manual times preserve arbitrary minutes without rounding', () => {
  assert.equal(normalizeCalendarTime('4:15 pm'), '4:15 PM');
  assert.equal(normalizeCalendarTime(' 04:45PM '), '4:45 PM');
  assert.equal(normalizeCalendarTime('7:07 a.m.'), '7:07 AM');
  assert.equal(normalizeCalendarTime('16:15'), '4:15 PM');
  assert.equal(normalizeCalendarTime('00:00'), '12:00 AM');
  assert.equal(normalizeCalendarTime('12:00'), '12:00 PM');
});

test('invalid and ambiguous manual values cannot be applied', () => {
  for (const value of ['', '4:5 PM', '13:15 PM', '0:15 AM', '4:60 PM', '24:00', '-1:15', 'noon', '4 PM']) {
    assert.equal(normalizeCalendarTime(value), null, value);
  }
});

test('the selector covers every half hour of the day in API-compatible format', () => {
  assert.equal(calendarTimeSlots.length, 48);
  assert.equal(new Set(calendarTimeSlots).size, 48);
  assert.equal(calendarTimeSlots[0], '12:00 AM');
  assert.equal(calendarTimeSlots.at(-1), '11:30 PM');
  assert.ok(calendarTimeSlots.includes('4:00 PM'));
  assert.ok(calendarTimeSlots.includes('4:30 PM'));
  assert.ok(!calendarTimeSlots.includes('4:15 PM'));
  assert.equal(normalizeCalendarTime('4:15 PM'), '4:15 PM');
  for (const value of calendarTimeSlots) assert.equal(normalizeCalendarTime(value), value);
});
