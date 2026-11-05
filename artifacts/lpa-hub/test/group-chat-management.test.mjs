import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const permissionSource = readFileSync(new URL('../lib/groupChatPermissions.ts', import.meta.url), 'utf8');
const permissionCode = ts.transpileModule(permissionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const permissionRuntime = { exports: {} };
vm.runInNewContext(permissionCode, permissionRuntime);
const { canManageGroupChats } = permissionRuntime.exports;

test('only Admin and Staff-Coach can manage group chats', () => {
  assert.equal(canManageGroupChats('Admin'), true);
  assert.equal(canManageGroupChats('Staff-Coach'), true);
  for (const role of ['Parent-Athlete', 'Athlete', undefined, null]) {
    assert.equal(canManageGroupChats(role), false);
  }
});

test('mobile group creation reports failures and opens the created conversation', () => {
  const newChat = readFileSync(new URL('../app/new-chat.tsx', import.meta.url), 'utf8');
  assert.match(newChat, /canManageGroupChats\(user\?\.role\)/);
  assert.match(newChat, /createChat\.mutate\(\{ data \}, \{ onSuccess: \(conversation\)/);
  assert.match(newChat, /router\.replace\(\('\s*\/chat\/'\s*\+\s*conversation\.id\)/);
  assert.match(newChat, /testID="create-chat-error" accessibilityRole="alert"/);
});

test('dashboard group creation uses the chat-list cache key, navigates, and reports failures', () => {
  const dashboard = readFileSync(new URL('../app/admin-dashboard.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /canManageGroupChats\(currentUser\?\.role\)/);
  assert.match(dashboard, /queryClient\.invalidateQueries\(\{ queryKey: \['chats'\] \}\)/);
  assert.match(dashboard, /router\.push\(\('\s*\/chat\/'\s*\+\s*conversation\.id\)/);
  assert.match(dashboard, /setGroupCreationError\(error\.message/);
  assert.match(dashboard, /testID="group-chat-create-error" accessibilityRole="alert"/);
  assert.match(dashboard, /testID="retry-group-chat-roster"/);
});

test('incomplete coach forms explain the next step instead of silently doing nothing', () => {
  const { groupChatCreationProblem } = permissionRuntime.exports;
  const valid = { role: 'Staff-Coach', name: 'Practice', participantCount: 2 };
  assert.equal(groupChatCreationProblem(valid), null);
  assert.match(groupChatCreationProblem({ ...valid, name: ' ' }), /Enter a group name/);
  assert.match(groupChatCreationProblem({ ...valid, participantCount: 0 }), /Select at least one member/);
  assert.match(groupChatCreationProblem({ ...valid, rosterLoading: true }), /still loading/);
  assert.match(groupChatCreationProblem({ ...valid, rosterFailed: true }), /Retry members/);
  assert.match(groupChatCreationProblem({ ...valid, role: 'Athlete' }), /Only Admin and Staff-Coach/);
  assert.match(groupChatCreationProblem({ ...valid, name: 'x'.repeat(101) }), /100 characters/);
});

test('coach create controls receive the first tap while the keyboard is open', () => {
  const newChat = readFileSync(new URL('../app/new-chat.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../app/admin-dashboard.tsx', import.meta.url), 'utf8');
  for (const source of [newChat, dashboard]) {
    assert.match(source, /<ScrollView[^>]*keyboardShouldPersistTaps="handled"/);
    const button = source.match(/<Pressable testID="create-group-chat"[^>]*>/)?.[0];
    assert.ok(button);
    assert.doesNotMatch(button, /disabled=\{[^}]*(?:canSubmit|groupName|groupParticipants|users\.is)/);
  }
  assert.match(newChat, /testID="retry-group-members"/);
  assert.match(dashboard, /dashboardScrollRef\.current\?\.scrollTo\(\{ y: 0/);
});

test('group info permissions do not grant management to non-staff creators', () => {
  const chat = readFileSync(new URL('../app/chat/[id].tsx', import.meta.url), 'utf8');
  assert.match(chat, /chat\.type === 'group'\s*\?\s*canManageGroupChats\(role\)/);
  assert.match(chat, /chat\.type === 'group' && canManageGroupChats\(role\)/);
});
