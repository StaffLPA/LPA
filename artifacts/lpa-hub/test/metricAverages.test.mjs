import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile(
  'metrics.ts',
  readFileSync(new URL('../lib/metrics.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const wanted = new Set(['mean', 'latestTeamAverage', 'kpiOf']);
const declarations = source.statements.filter((statement) => {
  if (ts.isFunctionDeclaration(statement)) return wanted.has(statement.name?.text);
  return ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && wanted.has(declaration.name.text));
});
const code = ts.transpileModule(declarations.map((statement) => statement.getText(source)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtime = { exports: {} };
vm.runInNewContext(code, runtime);
const { latestTeamAverage, kpiOf } = runtime.exports;

const summary = (athleteId, latest, lastTestingDate, patch = {}) => ({
  athleteId,
  metricId: 'body-weight',
  unit: 'lb',
  protocol: 'Standing',
  latest,
  lastTestingDate,
  previous: null,
  personalBestInPeriod: false,
  status: 'neutral',
  ...patch,
});

test('team average counts each athlete once using their latest in-range result', () => {
  const ws = {
    summaries: [
      summary('a', 100, '2026-02-01', { previous: 90 }),
      summary('a', 120, '2026-02-15', { previous: 100 }),
      summary('b', 180, '2026-02-10', { previous: 170 }),
    ],
  };
  assert.equal(latestTeamAverage(ws, 'body-weight', 'lb', 'Standing'), 150);
});

test('team averages keep units and protocols in separate cohorts', () => {
  const ws = {
    summaries: [
      summary('a', 100, '2026-02-01'),
      summary('b', 200, '2026-02-01'),
      summary('a', 80, '2026-02-02', { protocol: 'Seated' }),
      summary('a', 90, '2026-02-02', { unit: 'kg' }),
      summary('c', 900, '2026-02-03', { latest: null }),
    ],
  };
  assert.equal(latestTeamAverage(ws, 'body-weight', 'lb', 'Standing'), 150);
  assert.equal(latestTeamAverage(ws, 'body-weight', 'lb', 'Seated'), 80);
  assert.equal(latestTeamAverage(ws, 'body-weight', 'kg', 'Standing'), 90);
});

test('neutral metrics report values without an improvement or decline percentage', () => {
  const group = {
    metric: { direction: 'neutral' },
    summaries: [
      summary('a', 120, '2026-02-15', { previous: 100, personalBestInPeriod: true }),
      summary('b', 180, '2026-02-15', { previous: 200, personalBestInPeriod: true }),
    ],
  };
  const kpi = kpiOf(group, 2);
  assert.equal(kpi.current, 150);
  assert.equal(kpi.baseline, 150);
  assert.equal(kpi.pct, null);
  assert.equal(kpi.improved, null);
  assert.equal(kpi.pbs, 0);
});
