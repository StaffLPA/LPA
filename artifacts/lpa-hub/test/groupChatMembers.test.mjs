import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../lib/groupChatMembers.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtime = { exports: {} };
vm.runInNewContext(code, runtime);
const { matchesMemberGroup, matchesMemberRole } = runtime.exports;
const roster = [
  { id: 'a', groupTag: 'Group 1' }, { id: 'b', groupTag: 'Group 2' },
  { id: 'parent' }, { id: 'unassigned' },
];
const links = [
  { athlete: { id: 'a' }, guardian: { id: 'parent' } },
  { athlete: { id: 'b' }, guardian: { id: 'parent' } },
];

test('conversation role filters support all, individual roles and combined roles', () => {
  const roles = ['Parent-Athlete', 'Athlete', 'Staff-Coach', 'Admin'];
  assert.ok(roles.every((role) => matchesMemberRole(role, [])));
  assert.deepEqual(roles.filter((role) => matchesMemberRole(role, ['Parent-Athlete'])), ['Parent-Athlete']);
  assert.deepEqual(roles.filter((role) => matchesMemberRole(role, ['Parent-Athlete', 'Athlete'])), ['Parent-Athlete', 'Athlete']);
  assert.deepEqual(roles.filter((role) => matchesMemberRole(role, ['Staff-Coach', 'Admin'])), ['Staff-Coach', 'Admin']);
});

test('conversation combines roles with search without changing active/member eligibility or fetching groups', () => {
  const chat = readFileSync(new URL('../app/chat/[id].tsx', import.meta.url), 'utf8');
  assert.match(chat, /person\.status === 'active' && !chat\?\.members\.some/);
  assert.match(chat, /matchesMemberRole\(person\.role, participantRoles\)/);
  assert.match(chat, /<GroupChatMemberFilters selectedRoles=\{participantRoles\} onRolesChange=\{setParticipantRoles\}/);
  assert.match(chat, /\{canManage \? <>/);
  assert.doesNotMatch(chat, /useListGroupTags|matchesMemberGroup|onGroupChange=/);
});

test('group filters use exact assignments and all/unassigned options', () => {
  assert.equal(matchesMemberGroup(roster[0], null, roster), true);
  assert.equal(matchesMemberGroup(roster[0], 'Group 1', roster), true);
  assert.equal(matchesMemberGroup(roster[0], 'Group 2', roster), false);
  assert.equal(matchesMemberGroup(roster[0], '', roster), false);
  assert.equal(matchesMemberGroup(roster[3], '', roster), true);
});

test('parents match any linked athlete group without changing parent assignments', () => {
  assert.equal(matchesMemberGroup(roster[2], 'Group 1', roster, links), true);
  assert.equal(matchesMemberGroup(roster[2], 'Group 2', roster, links), true);
  assert.equal(matchesMemberGroup(roster[2], 'Group 3', roster, links), false);
  assert.equal(matchesMemberGroup(roster[2], '', roster, links), false);
  assert.equal(matchesMemberGroup(roster[2], 'Group 1', roster, []), false);
  assert.equal(roster[2].groupTag, undefined);
});

test('member filter controls render role/group choices and report changes independently', () => {
  const source = ts.createSourceFile('filters.tsx', readFileSync(new URL('../components/GroupChatMemberFilters.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = source.statements.filter((node) => !ts.isImportDeclaration(node));
  const output = ts.transpileModule(declarations.map((node) => node.getText(source)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const context = {
    exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    Pressable: 'Pressable', Text: 'Text', View: 'View',
    useColors: () => ({}), StyleSheet: { create: (styles) => styles },
  };
  vm.runInNewContext(output, context);
  const updates = [];
  const tree = context.exports.GroupChatMemberFilters({
    groups: [{ id: 'Group 1', label: 'Group 1' }, { id: 'Group 2', label: 'Group 2' }],
    selectedGroup: null, selectedRoles: [],
    onGroupChange: (group) => updates.push(group),
    onRolesChange: (roles) => updates.push(Array.from(roles)),
  });
  const buttons = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Pressable') buttons.push(node);
    visit(node.children);
  };
  visit(tree);
  const find = (id) => buttons.find((button) => button.props.testID === id);
  assert.equal(find('member-group-all').props.accessibilityState.checked, true);
  find('member-role-Parent-Athlete').props.onPress();
  find('member-role-Athlete').props.onPress();
  find('member-group-Group 2').props.onPress();
  find('member-group-unassigned').props.onPress();
  assert.deepEqual(updates, [['Parent-Athlete'], ['Athlete'], 'Group 2', '']);
  const roleOnly = context.exports.GroupChatMemberFilters({
    selectedRoles: ['Athlete'], onRolesChange: (roles) => updates.push(Array.from(roles)),
  });
  buttons.length = 0;
  visit(roleOnly);
  assert.ok(buttons.every((button) => !button.props.testID.startsWith('member-group-')));
  assert.equal(find('member-role-Athlete').props.accessibilityState.checked, true);
  find('member-role-Athlete').props.onPress();
  find('member-role-all').props.onPress();
  assert.deepEqual(updates.slice(-2), [[], []]);
});
