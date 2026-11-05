import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCalendarEventsByTeamVisibility, parseIcsEvents, mergeEvents, timeRangeLabel, getUpcomingCalendarEvents } from '../lib/calendarEvents.ts';

const resolver = { canonicalTeam: (team) => team, tagLabel: (team) => team, teamColor: () => '#AB562B' };
const feed = (extra = '') => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test@lpahub\r\nDTSTART;TZID=America/Phoenix:20261001T103000\r\nDTEND;TZID=America/Phoenix:20261001T123000\r\nSUMMARY:LPA vs Bombers\r\nLOCATION:Royals 5\r\n${extra}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

test('popup data keeps team, date, time range, address and multiline notes', () => {
  const [event] = parseIcsEvents(feed('X-LPA-TEAM:Varsity\r\nX-LPA-LOCATION-ADDRESS:16187 N Bullard Ave\\, Surprise\r\nX-LPA-NOTES:Arrive early\\nBring water\\; glove'), resolver);
  assert.equal(event.tag, 'Varsity');
  assert.equal(event.date, '2026-10-01');
  assert.equal(timeRangeLabel(event), '10:30 AM – 12:30 PM');
  assert.equal(event.location, 'Royals 5');
  assert.equal(event.locationAddress, '16187 N Bullard Ave, Surprise');
  assert.equal(event.notes, 'Arrive early\nBring water; glove');
});

test('legacy feeds use fallback teams but never show system update metadata as notes', () => {
  const [event] = parseIcsEvents(feed('DESCRIPTION:Varsity · Updated 2026-10-01T12:00:00Z'), resolver, 'Varsity');
  assert.equal(event.team, 'Varsity');
  assert.equal(event.notes, undefined);
  assert.equal(event.locationAddress, undefined);
});

test('folded DESCRIPTION notes are read and duplicate feeds retain richer details', () => {
  const [rich] = parseIcsEvents(feed('DESCRIPTION:Arrival time is\r\n 10:30 AM\\nArizona\r\nX-LPA-LOCATION-ADDRESS:Test address'), resolver, 'Varsity');
  assert.equal(rich.notes, 'Arrival time is10:30 AM\nArizona');
  const [legacy] = parseIcsEvents(feed(), resolver, 'Varsity');
  const merged = mergeEvents([[rich], [legacy]]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].notes, rich.notes);
  assert.equal(merged[0].locationAddress, rich.locationAddress);
});

test('explicitly cleared details override stale copies from legacy feeds', () => {
  const [old] = parseIcsEvents(feed('DESCRIPTION:Old notes\r\nX-LPA-LOCATION-ADDRESS:Old address'), resolver);
  const [cleared] = parseIcsEvents(feed('X-LPA-NOTES:\r\nX-LPA-LOCATION-ADDRESS:'), resolver);
  const [merged] = mergeEvents([[old], [cleared]]);
  assert.equal(merged.notes, null);
  assert.equal(merged.locationAddress, null);
});

test('hidden team tags and their events stay out of the calendar, including legacy aliases', () => {
  const hiddenTeamAliases = new Set(['custom-hidden-team', 'Old hidden team']);
  const visibleEvents = filterCalendarEventsByTeamVisibility([
    { id: 'hidden-event', team: 'custom-hidden-team' },
    { id: 'legacy-hidden-event', team: 'Old hidden team' },
    { id: 'visible-event', team: 'LPA Varsity' },
  ], (team) => hiddenTeamAliases.has(team));
  assert.deepEqual(visibleEvents.map(({ id }) => id), ['visible-event']);
});

test('Home events combine assigned teams with LPA, deduplicate cross-calendar copies, and sort by start time', () => {
  const canonicalizeTeam = (team) => ({
    Varsity: 'LPA Varsity',
    'LPA Events': 'LPA',
    '14u': 'LPA 14U',
  }[team] ?? team);
  const events = [
    { id: 'team-copy', title: 'LPA vs Rival', date: '2026-10-29', time: '16:00 - 18:00', location: 'East Field', team: 'LPA Varsity' },
    { id: 'lpa-copy', title: ' LPA vs Rival ', date: '2026-10-29', time: '4:00 PM - 6:00 PM', location: 'East Field', team: 'LPA Events' },
    { id: 'lpa-event', title: 'LPA fundraiser', date: '2026-10-29', time: '9:00 AM', location: 'LPA Campus', team: 'LPA' },
    { id: 'varsity-event', title: 'Varsity practice', date: '2026-10-28', time: '16:30 - 18:00', location: 'East Field', team: 'LPA Varsity' },
    { id: 'fourteen-event', title: '14U workout', date: '2026-10-28', time: '6:00 PM', location: 'West Field', team: 'LPA 14U' },
    { id: 'unrelated-event', title: 'JV practice', date: '2026-10-28', time: '3:00 PM', location: 'East Field', team: 'LPA JV' },
    { id: 'past-event', title: 'Earlier practice', date: '2026-10-28', time: '1:00 PM', location: 'East Field', team: 'LPA Varsity' },
  ];
  const now = new Date(2026, 9, 28, 14).getTime();
  const upcoming = getUpcomingCalendarEvents(events, ['Varsity', '14u'], canonicalizeTeam, now, 10);

  assert.deepEqual(upcoming.map(({ id }) => id), ['varsity-event', 'fourteen-event', 'lpa-event', 'team-copy']);
});
