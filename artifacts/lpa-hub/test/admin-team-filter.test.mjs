import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('admin-dashboard.tsx',
  readFileSync(new URL('../app/admin-dashboard.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const groupChatHelpers = source.statements.filter((node) =>
  ts.isFunctionDeclaration(node) && [
    'matchesGroupChatRole',
    'areAllVisibleGroupChatParticipantsSelected',
    'toggleVisibleGroupChatParticipants',
  ].includes(node.name?.text ?? ''));
const compiledGroupChatHelpers = ts.transpileModule(
  `${groupChatHelpers.map((node) => node.getText(source)).join('\n')}\n({ matchesGroupChatRole, areAllVisibleGroupChatParticipantsSelected, toggleVisibleGroupChatParticipants })`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const groupChat = vm.runInNewContext(compiledGroupChatHelpers);
test('group-chat role filters include all roles by default and combine selected roles', () => {
  assert.equal(groupChat.matchesGroupChatRole('Parent-Athlete', []), true);
  assert.equal(groupChat.matchesGroupChatRole('Athlete', ['Parent-Athlete', 'Athlete']), true);
  assert.equal(groupChat.matchesGroupChatRole('Staff-Coach', ['Parent-Athlete', 'Athlete']), false);
});
test('bulk selection adds or removes only visible filtered participants', () => {
  assert.deepEqual(
    Array.from(groupChat.toggleVisibleGroupChatParticipants(['outside-filter', 'parent-1'], ['parent-1', 'athlete-1'])),
    ['outside-filter', 'parent-1', 'athlete-1'],
  );
  assert.equal(groupChat.areAllVisibleGroupChatParticipantsSelected(['parent-1', 'athlete-1'], ['parent-1', 'athlete-1']), true);
  assert.deepEqual(
    Array.from(groupChat.toggleVisibleGroupChatParticipants(['outside-filter', 'parent-1', 'athlete-1'], ['parent-1', 'athlete-1'])),
    ['outside-filter'],
  );
  assert.deepEqual(
    Array.from(groupChat.toggleVisibleGroupChatParticipants(['parent-1'], [])),
    ['parent-1'],
  );
});
const component = source.statements.find((node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'TeamMultiFilter');
assert.ok(component, 'shared team filter must exist');
const compiled = ts.transpileModule(component.getText(source), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const render = vm.runInNewContext(`${compiled}\nTeamMultiFilter`, {
  React: { createElement: (type, props, ...children) => ({ type, props, children }) },
  ScrollView: 'ScrollView', Pressable: 'Pressable', Text: 'Text',
  styles: { teamFilters: {}, teamPill: {}, teamText: {} },
});

for (const prefix of ['roster-team-filter', 'group-team-filter']) {
  test(`${prefix} renders without depending on dashboard role or router`, () => {
    const updates = [];
    const tree = render({
      catalog: { teams: [{ id: 'LPA Varsity', label: 'Varsity' }] },
      selected: [], onChange: (teams) => updates.push(Array.from(teams)),
      colors: { primary: 'primary', card: 'card', border: 'border', foreground: 'foreground' },
      testIDPrefix: prefix,
    });
    const allTeams = tree.children[0];
    const varsity = tree.children[1][0];
    assert.equal(allTeams.props.testID, `${prefix}-all`);
    assert.equal(allTeams.props.accessibilityState.checked, true);
    assert.equal(varsity.props.testID, `${prefix}-LPA Varsity`);
    varsity.props.onPress();
    allTeams.props.onPress();
    assert.deepEqual(updates, [['LPA Varsity'], []]);
    const selectedTree = render({
      catalog: { teams: [{ id: 'LPA Varsity', label: 'Varsity' }] },
      selected: ['LPA Varsity'], onChange: (teams) => updates.push(Array.from(teams)),
      colors: {}, testIDPrefix: prefix,
    });
    assert.equal(selectedTree.children[1][0].props.accessibilityState.checked, true);
    selectedTree.children[1][0].props.onPress();
    assert.deepEqual(updates.at(-1), []);
  });
}
