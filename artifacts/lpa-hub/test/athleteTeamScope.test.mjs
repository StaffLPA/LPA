import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const metricsSource = ts.createSourceFile(
  'metrics.ts',
  readFileSync(new URL('../lib/metrics.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const helperNames = new Set(['filterParams', 'athleteWorkspaceParams', 'athleteTeamAverageParams']);
const helpers = metricsSource.statements.filter((node) =>
  ts.isFunctionDeclaration(node) && helperNames.has(node.name?.text));
assert.equal(helpers.length, helperNames.size, 'athlete query helpers must remain available for regression checks');
const helpersCode = ts.transpileModule(helpers.map((node) => node.getText(metricsSource)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helperRuntime = { exports: {}, periodOf: () => ({}) };
vm.runInNewContext(helpersCode, helperRuntime);
const { athleteWorkspaceParams, athleteTeamAverageParams } = helperRuntime.exports;

const filters = {
  team: 'globally-selected-team',
  athleteIds: ['another-athlete'],
  athletesCleared: false,
  metricIds: ['selected-metric'],
  metricsCleared: false,
  category: 'Health',
  coachId: 'selected-coach',
  preset: 'all',
  start: '',
  end: '',
  athleteSearch: '',
  metricSearch: '',
};

test('athlete results ignore the inherited team and athlete selection', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(athleteWorkspaceParams(filters, 'target-athlete'))), {
    athleteIds: 'target-athlete',
    metricIds: 'selected-metric',
    category: 'Health',
    coachId: 'selected-coach',
  });
});

test('athlete team averages replace global team and roster selections', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(athleteTeamAverageParams(filters, 'athlete-team'))), {
    category: 'Health',
    coachId: 'selected-coach',
    team: 'athlete-team',
  });
});

test('athlete team averages do not inherit a global team when assignment is missing', () => {
  const params = athleteTeamAverageParams(filters);
  assert.equal('team' in params, false);
  assert.equal('athleteIds' in params, false);
  assert.equal('metricIds' in params, false);
});

const filterSource = ts.createSourceFile(
  'FilterBar.tsx',
  readFileSync(new URL('../components/metrics/FilterBar.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const filterFunction = filterSource.statements.find((node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'FilterBar');
const presetDeclaration = filterSource.statements.find((node) =>
  ts.isVariableStatement(node) && node.declarationList.declarations.some((d) =>
    ts.isIdentifier(d.name) && d.name.text === 'PRESETS'));
assert.ok(filterFunction, 'FilterBar component must exist');
assert.ok(presetDeclaration, 'FilterBar presets must exist');
const filterCode = ts.transpileModule(
  `${presetDeclaration.getText(filterSource)}\n${filterFunction.getText(filterSource)}`,
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function renderFilterBar({ mini, open = false }) {
  let stateIndex = 0;
  const states = [open, mini, null];
  const React = {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children: children.length === 1 ? children[0] : children } };
    },
  };
  const runtime = {
    React,
    exports: {},
    useColors: () => ({ border: 'border', foreground: 'foreground', mutedForeground: 'muted', background: 'background' }),
    useState: () => [states[stateIndex++], () => {}],
    periodError: () => null,
    resetFilters: () => {},
    setFilters: () => {},
    toggleSelection: () => ({ ids: [], cleared: false }),
    fmtDate: () => 'Jan 01, 2026',
    Feather: 'Feather',
    DateCalendarSheet: 'DateCalendarSheet',
    Btn: 'Btn',
    Card: 'Card',
    Chip: 'Chip',
    Label: 'Label',
    SearchBox: 'SearchBox',
    Body: 'Body',
    ScrollView: 'ScrollView',
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
  };
  vm.runInNewContext(filterCode, runtime);
  return runtime.exports.FilterBar({ f: filters, ws: { teams: [{ id: filters.team, label: 'Other Team Selector' }], metrics: [], athletes: [], results: [] }, hideAthletes: true, hideTeam: true });
}

function visibleText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(' ');
  return visibleText(node.props?.children);
}

for (const view of [
  { name: 'expanded', mini: false, open: false },
  { name: 'expanded advanced filters', mini: false, open: true },
  { name: 'minimized', mini: true },
]) {
  test(`${view.name} athlete filters do not show the selected team`, () => {
    const text = visibleText(renderFilterBar(view));
    assert.doesNotMatch(text, /Other Team Selector/);
    assert.doesNotMatch(text, /\bTeam\b/);
  });
}

test('athlete route and Health panel use the tested query scopes', () => {
  const route = readFileSync(new URL('../app/metrics/athlete/[id].tsx', import.meta.url), 'utf8');
  const health = readFileSync(new URL('../components/metrics/HealthPanel.tsx', import.meta.url), 'utf8');
  assert.match(route, /athleteWorkspaceParams\(f,\s*String\(id\)\)/);
  assert.match(route, /athleteTeamAverageParams\(f,\s*averageTeamId\)/);
  assert.match(route, /<FilterBar[^>]*hideTeam/);
  assert.match(route, /const averageTeamId = a\?\.teams\[0\]/);
  assert.match(health, /athleteWorkspaceParams\(filters,\s*athleteId,\s*\{\s*category:\s*'Health'\s*\}\)/);
});
