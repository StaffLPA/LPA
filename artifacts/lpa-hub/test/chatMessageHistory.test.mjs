import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessageHistoryRows, MESSAGE_HISTORY_TIME_ZONE } from '../lib/chatMessageHistory.ts';

const message = (id, createdAt) => ({ id, createdAt, text: id, senderId: id });
const dates = (rows) => rows.flatMap((row) => row.dateSeparator ? [row.dateSeparator] : []);

test('empty history has no separators', () => {
  assert.deepEqual(buildMessageHistoryRows([]), []);
});

test('matches the requested long date labels and chronological day grouping', () => {
  const rows = buildMessageHistoryRows([
    message('friday', '2026-10-02T15:00:00Z'),
    message('wednesday-received', '2026-09-23T17:00:00Z'),
    message('thursday', '2026-09-24T15:00:00Z'),
    message('wednesday-sent', '2026-09-23T16:00:00Z'),
  ]);
  assert.deepEqual(rows.map((row) => row.message.id), ['wednesday-sent', 'wednesday-received', 'thursday', 'friday']);
  assert.deepEqual(dates(rows), [
    { key: '2026-09-23', label: 'Wednesday, September 23' },
    { key: '2026-09-24', label: 'Thursday, September 24' },
    { key: '2026-10-02', label: 'Friday, October 2' },
  ]);
  assert.equal(rows[1].dateSeparator, null);
});

test('uses the configured Arizona date rather than splitting at UTC midnight', () => {
  assert.equal(MESSAGE_HISTORY_TIME_ZONE, 'America/Phoenix');
  const rows = buildMessageHistoryRows([
    message('before-utc-midnight', '2026-09-23T23:59:00Z'),
    message('after-utc-midnight', '2026-09-24T00:01:00Z'),
    message('before-arizona-midnight', '2026-09-24T06:59:59Z'),
    message('after-arizona-midnight', '2026-09-24T07:00:00Z'),
  ]);
  assert.deepEqual(dates(rows).map((day) => day.key), ['2026-09-23', '2026-09-24']);
  assert.equal(rows[1].dateSeparator, null);
  assert.equal(rows[2].dateSeparator, null);
  assert.equal(rows[3].dateSeparator?.key, '2026-09-24');
});

test('equivalent timestamps with different offsets belong to the same day', () => {
  const rows = buildMessageHistoryRows([
    message('utc', '2026-09-24T07:00:00Z'),
    message('arizona', '2026-09-24T00:00:00-07:00'),
  ]);
  assert.equal(dates(rows).length, 1);
});

test('a different configured timezone is used for both keys and labels', () => {
  const rows = buildMessageHistoryRows([
    message('before', '2026-09-24T03:59:00Z'),
    message('after', '2026-09-24T04:00:00Z'),
  ], 'America/New_York');
  assert.deepEqual(dates(rows).map((day) => day.key), ['2026-09-23', '2026-09-24']);
  assert.equal(rows[1].dateSeparator?.label, 'Thursday, September 24');
});

test('does not mutate input, message references, metadata, or equal-time order', () => {
  const first = Object.freeze({ ...message('first', '2026-09-23T16:00:00Z'), reactions: ['👍'], edited: true });
  const second = Object.freeze(message('second', first.createdAt));
  const input = Object.freeze([first, second]);
  const rows = buildMessageHistoryRows(input);
  assert.equal(rows[0].message, first);
  assert.equal(rows[1].message, second);
  assert.deepEqual(first.reactions, ['👍']);
});

test('receiving or sending a message on a new day adds exactly one new separator', () => {
  const existing = [message('old', '2026-09-23T16:00:00Z')];
  const next = buildMessageHistoryRows([
    ...existing, message('new-sent', '2026-09-24T15:00:00Z'), message('new-received', '2026-09-24T15:01:00Z'),
  ]);
  assert.equal(dates(next).length, 2);
  assert.equal(next[2].dateSeparator, null);
});

test('loading older messages moves the separator to the oldest message of that date', () => {
  const loaded = [message('latest', '2026-09-24T18:00:00Z')];
  const expanded = buildMessageHistoryRows([
    ...loaded, message('earlier-same-day', '2026-09-24T17:00:00Z'), message('prior-day', '2026-09-23T18:00:00Z'),
  ]);
  assert.deepEqual(expanded.map((row) => row.message.id), ['prior-day', 'earlier-same-day', 'latest']);
  assert.equal(expanded[1].dateSeparator?.key, '2026-09-24');
  assert.equal(expanded[2].dateSeparator, null);
});

test('deleting the first message of a day leaves the separator on the next visible message', () => {
  const input = [message('oldest', '2026-09-23T16:00:00Z'), message('remaining', '2026-09-23T17:00:00Z')];
  assert.equal(buildMessageHistoryRows(input.slice(1))[0].dateSeparator?.key, '2026-09-23');
});

test('reversing rows for the existing inverted list preserves each boundary attachment', () => {
  const rows = buildMessageHistoryRows([
    message('oldest', '2026-09-23T16:00:00Z'),
    message('same-day', '2026-09-23T17:00:00Z'),
    message('next-day', '2026-09-24T17:00:00Z'),
  ]).reverse();
  assert.equal(rows[0].message.id, 'next-day');
  assert.equal(rows[0].dateSeparator?.key, '2026-09-24');
  assert.equal(rows[1].dateSeparator, null);
  assert.equal(rows[2].dateSeparator?.key, '2026-09-23');
});

test('different years and leap days use full date keys', () => {
  const rows = buildMessageHistoryRows([
    message('new-year', '2026-01-01T15:00:00Z'),
    message('old-year', '2025-01-01T15:00:00Z'),
    message('leap-day', '2024-02-29T15:00:00Z'),
  ]);
  assert.deepEqual(dates(rows).map((day) => day.key), ['2024-02-29', '2025-01-01', '2026-01-01']);
});

test('invalid legacy timestamps remain visible without inventing a calendar date', () => {
  const rows = buildMessageHistoryRows([
    message('invalid', 'not-a-date'), message('valid', '2026-09-23T16:00:00Z'),
  ]);
  assert.deepEqual(rows.map((row) => row.message.id), ['valid', 'invalid']);
  assert.deepEqual(rows[1].dateSeparator, { key: 'unknown', label: 'Unknown date' });
});
