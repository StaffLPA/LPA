import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamProgress } from '../lib/teamProgress.ts';

const M = [{ id: 'sq', name: 'Squat', category: 'Lifting', decimals: 0 }, { id: 'bp', name: 'Bench', category: 'Lifting', decimals: 0 }, { id: 'sp', name: 'Sprint', category: 'Speed', decimals: 2 }];
const r = (id, a, m, v, d, extra = {}) => ({ id, athleteId: a, metricId: m, unit: 'lb', protocol: '1RM', value: v, testingDate: d, createdAt: `${d}T10:00:00Z`, ...extra });

test('monthly uses latest retest per athlete once', () => {
  const g = buildTeamProgress('monthly', [], [r('1', 'a', 'sq', 100, '2026-01-05'), r('2', 'a', 'sq', 120, '2026-01-20'), r('3', 'b', 'sq', 200, '2026-01-10')], M);
  const p = g[0].lines[0].points;
  assert.equal(p.length, 1);
  assert.equal(p[0].value, 160);
  assert.equal(p[0].sampleSize, 2);
});
test('same-day retest tie breaks by createdAt then id', () => {
  const g = buildTeamProgress('monthly', [], [r('9', 'a', 'sq', 100, '2026-02-01', { createdAt: 'x1' }), r('1', 'a', 'sq', 150, '2026-02-01', { createdAt: 'x2' })], M);
  assert.equal(g[0].lines[0].points[0].value, 150);
  const h = buildTeamProgress('monthly', [], [r('a', 'a', 'sq', 1, '2026-02-01', { createdAt: 'x' }), r('b', 'a', 'sq', 2, '2026-02-01', { createdAt: 'x' })], M);
  assert.equal(h[0].lines[0].points[0].value, 2);
});
test('multiple months sorted and independent', () => {
  const g = buildTeamProgress('monthly', [], [r('1', 'a', 'sq', 100, '2026-03-02'), r('2', 'a', 'sq', 110, '2026-01-02'), r('3', 'a', 'sq', 105, '2026-02-02')], M);
  assert.deepEqual(g[0].lines[0].points.map((p) => [p.label, p.value]), [['Jan 2026', 110], ['Feb 2026', 105], ['Mar 2026', 100]]);
});
test('daily passes team averages through with distinct sample sizes, unweighted across days', () => {
  const t = [{ metricId: 'sq', unit: 'lb', protocol: '1RM', date: '2026-01-02', average: 100, sampleSize: 1 }, { metricId: 'sq', unit: 'lb', protocol: '1RM', date: '2026-01-01', average: 200, sampleSize: 9 }];
  const p = buildTeamProgress('daily', t, [], M)[0].lines[0].points;
  assert.deepEqual(p.map((x) => [x.date, x.value, x.sampleSize]), [['2026-01-01', 200, 9], ['2026-01-02', 100, 1]]);
});
test('units, categories and protocols separate', () => {
  const rows = [r('1', 'a', 'sq', 100, '2026-01-01'), r('2', 'a', 'sq', 90, '2026-01-01', { protocol: '3RM' }), r('3', 'a', 'sp', 5, '2026-01-01', { unit: 'seconds', protocol: 'Timed' }), r('4', 'a', 'bp', 50, '2026-01-01')];
  const g = buildTeamProgress('monthly', [], rows, M);
  assert.equal(g.length, 2);
  const lift = g.find((x) => x.category === 'Lifting');
  assert.equal(lift.lines.length, 3);
  assert.deepEqual(lift.lines.map((l) => l.showProtocol), [false, true, true].map((x, i) => lift.lines[i].metricId === 'sq' ? true : false));
  assert.equal(g.find((x) => x.unit === 'seconds').lines.length, 1);
});
test('empty gives no groups', () => assert.deepEqual(buildTeamProgress('daily', [], [], M), []));
test('compact monthly aggregates retain earlier months without full result history', () => {
  const months = [
    { metricId: 'sq', unit: 'lb', protocol: '1RM', date: '2026-01-01', average: 120, sampleSize: 2 },
    { metricId: 'sq', unit: 'lb', protocol: '1RM', date: '2026-02-01', average: 140, sampleSize: 3 },
  ];
  const g = buildTeamProgress('monthly', [], [], M, months);
  assert.deepEqual(g[0].lines[0].points.map((p) => [p.label, p.value, p.sampleSize]),
    [['Jan 2026', 120, 2], ['Feb 2026', 140, 3]]);
  assert.deepEqual(buildTeamProgress('monthly', [], [r('1', 'a', 'sq', 9, '2026-01-01')], M, []), []);
});

import { buildAthleteProgress } from '../lib/teamProgress.ts';
test('athlete progress: latest per day/month for that athlete only, protocols kept', () => {
  const rs = [r('1', 'a', 'sq', 100, '2026-01-05'), r('2', 'a', 'sq', 120, '2026-01-05', { createdAt: '2026-01-05T12:00:00Z' }), r('3', 'a', 'sq', 130, '2026-01-20'), r('4', 'b', 'sq', 999, '2026-01-20'), r('5', 'a', 'sq', 50, '2026-01-06', { protocol: '3RM' })];
  const d = buildAthleteProgress('daily', rs, 'a', M)[0].lines;
  assert.equal(d.length, 2);
  const one = d.find((l) => l.protocol === '1RM').points;
  assert.deepEqual(one.map((p) => p.value), [120, 130]);
  const m = buildAthleteProgress('monthly', rs, 'a', M)[0].lines.find((l) => l.protocol === '1RM').points;
  assert.equal(m.length, 1); assert.equal(m[0].value, 130);
});
