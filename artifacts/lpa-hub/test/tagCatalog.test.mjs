import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real matching functions without Node needing Expo's @/ resolver.
const source = ts.createSourceFile('tagCatalog.ts',
  readFileSync(new URL('../constants/tagCatalog.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true);
const helpers = source.statements.filter((node) =>
  (ts.isFunctionDeclaration(node) && ['tagOption', 'canonicalTeam', 'teamMatches'].includes(node.name?.text ?? '')) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(source) === 'normalized')));
const compiled = ts.transpileModule(
  helpers.map((node) => node.getText(source).replace(/^export /, '')).join('\n') +
    '\n({ canonicalTeam, teamMatches })',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const { canonicalTeam, teamMatches } = vm.runInNewContext(compiled);

test('canonical IDs keep 13U and 15U independent even when display labels are swapped', () => {
  const catalog = {
    roles: [],
    teams: [
      { id: 'LPA 13U', label: 'LPA 15U', aliases: ['13u'] },
      { id: 'LPA 15U', label: 'LPA 13U', aliases: ['15u'] },
    ],
    gradYears: [],
  };

  assert.equal(canonicalTeam(catalog, 'LPA 13U'), 'LPA 13U');
  assert.equal(canonicalTeam(catalog, 'LPA 15U'), 'LPA 15U');
  assert.equal(canonicalTeam(catalog, '13u'), 'LPA 13U');
  assert.equal(canonicalTeam(catalog, '15u'), 'LPA 15U');
  assert.equal(teamMatches(catalog, 'LPA 13U', 'LPA 15U'), false);
  assert.equal(teamMatches(catalog, '13u', '15u'), false);

  const selected = (values) => catalog.teams.filter((option) =>
    values.some((team) => teamMatches(catalog, team, option.id))).map((option) => option.id);
  assert.deepEqual(selected(['LPA 13U']), ['LPA 13U'], 'selecting 13U must not check 15U');
  assert.deepEqual(selected(['LPA 15U']), ['LPA 15U'], 'selecting 15U must not check 13U');
  assert.deepEqual(selected(['LPA 13U', 'LPA 15U']), ['LPA 13U', 'LPA 15U'], 'both can be explicitly selected');
  const remaining = ['LPA 13U', 'LPA 15U'].filter((team) => !teamMatches(catalog, team, 'LPA 13U'));
  assert.deepEqual(selected(remaining), ['LPA 15U'], 'clearing 13U must retain 15U');
});
