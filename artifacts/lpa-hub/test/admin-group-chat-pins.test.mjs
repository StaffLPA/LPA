import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile(
  'admin-dashboard.tsx',
  readFileSync(new URL('../app/admin-dashboard.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const component = source.statements.find((node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'GroupChatPinManagement');
assert.ok(component, 'pin management must be a dedicated dashboard component');
const dashboardContent = source.statements.find((node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'AdminDashboardContent');
assert.ok(dashboardContent, 'the signed-in dashboard content must exist');
function findPinPanelUse(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'GroupChatPinManagement') return node;
  let result;
  ts.forEachChild(node, (child) => {
    result ??= findPinPanelUse(child);
  });
  return result;
}
const pinPanelUse = findPinPanelUse(dashboardContent);
assert.ok(pinPanelUse, 'signed-in dashboard must render the pin management component');
const roleProp = pinPanelUse.attributes.properties.find((attribute) =>
  ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'role');
assert.equal(roleProp?.initializer?.expression?.getText(source), 'currentUser?.role');

const compiled = ts.transpileModule(component.getText(source), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const styleStub = new Proxy({}, { get: () => ({}) });
const GroupChatPinManagement = vm.runInNewContext(`${compiled}\nGroupChatPinManagement`, {
  React: {
    createElement: (type, props, ...children) => ({
      type,
      props: {
        ...props,
        ...(children.length === 1 ? { children: children[0] } : children.length ? { children } : {}),
      },
    }),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  Feather: 'Feather',
  styles: styleStub,
});

const colors = {
  card: 'card',
  border: 'border',
  foreground: 'foreground',
  mutedForeground: 'muted',
  primary: 'primary',
  destructive: 'danger',
  muted: 'muted',
};
const chat = { id: 'group-1', name: 'Varsity updates', isPinned: false };
function render(overrides = {}) {
  return GroupChatPinManagement({
    role: 'Admin',
    colors,
    chats: [chat],
    isLoading: false,
    isError: false,
    pinError: '',
    isSaving: false,
    onRefresh() {},
    onClearError() {},
    onToggle() {},
    ...overrides,
  });
}
function findByTestId(node, testID) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findByTestId(child, testID);
      if (match) return match;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object') return undefined;
  if (node.props?.testID === testID) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findByTestId(child, testID);
    if (match) return match;
  }
  return undefined;
}
function collectByType(node, type, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, type, found);
    return found;
  }
  if (!node || typeof node !== 'object') return found;
  if (node.type === type) found.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) collectByType(child, type, found);
  return found;
}
function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return node?.props?.children ? textContent(node.props.children) : '';
}

test('only signed-in Admin role renders the shared pin controls', () => {
  const adminPanel = render({ role: 'Admin' });
  assert.match(textContent(adminPanel), /Manage pinned group chats/);
  assert.equal(findByTestId(adminPanel, 'toggle-group-chat-pin-group-1')?.props.accessibilityRole, 'switch');

  for (const role of ['Staff-Coach', 'Parent-Athlete', 'Athlete', undefined]) {
    const panel = render({ role });
    assert.equal(panel, null, `${role ?? 'signed-out'} must not see pin controls`);
    assert.equal(findByTestId(panel, 'toggle-group-chat-pin-group-1'), undefined);
  }
});

test('Admin switch exposes current shared state and toggles the group pin', () => {
  const calls = [];
  let clearedError = false;
  const unpinnedPanel = render({
    onClearError: () => { clearedError = true; },
    onToggle: (...args) => calls.push(args),
  });
  const unpinnedSwitch = findByTestId(unpinnedPanel, 'toggle-group-chat-pin-group-1');
  assert.equal(unpinnedSwitch.props.accessibilityLabel, 'Pin Varsity updates');
  assert.deepEqual({ ...unpinnedSwitch.props.accessibilityState }, { checked: false, disabled: false });

  unpinnedSwitch.props.onPress();
  assert.equal(clearedError, true);
  assert.deepEqual(calls, [['group-1', true]]);

  const pinnedPanel = render({ chats: [{ ...chat, isPinned: true }] });
  const pinnedSwitch = findByTestId(pinnedPanel, 'toggle-group-chat-pin-group-1');
  assert.equal(pinnedSwitch.props.accessibilityLabel, 'Unpin Varsity updates');
  assert.deepEqual({ ...pinnedSwitch.props.accessibilityState }, { checked: true, disabled: false });

  const savingPanel = render({ isSaving: true, savingConversationId: chat.id });
  const savingSwitch = findByTestId(savingPanel, 'toggle-group-chat-pin-group-1');
  assert.equal(savingSwitch.props.disabled, true);
  assert.equal(savingSwitch.props.accessibilityState.disabled, true);
  assert.equal(collectByType(savingPanel, 'ActivityIndicator').length, 1);
});

test('Admin sees pin loading, load failure with retry, and mutation error states', () => {
  const loading = render({ isLoading: true });
  assert.ok(findByTestId(loading, 'group-chat-pins-loading'));
  assert.equal(findByTestId(loading, 'toggle-group-chat-pin-group-1'), undefined);

  let refreshes = 0;
  const failedLoad = render({ isError: true, onRefresh: () => { refreshes += 1; } });
  const loadAlert = findByTestId(failedLoad, 'group-chat-pins-load-error');
  assert.equal(loadAlert.props.accessibilityRole, 'alert');
  assert.match(textContent(loadAlert), /Could not load group chats/);
  const retry = findByTestId(failedLoad, 'retry-group-chat-pins');
  assert.equal(retry.props.accessibilityRole, 'button');
  retry.props.onPress();
  assert.equal(refreshes, 1);
  assert.equal(findByTestId(failedLoad, 'toggle-group-chat-pin-group-1'), undefined);

  const failedMutation = render({ pinError: 'The pin could not be updated.' });
  const mutationAlert = findByTestId(failedMutation, 'group-chat-pin-error');
  assert.equal(mutationAlert.props.accessibilityRole, 'alert');
  assert.equal(textContent(mutationAlert), 'The pin could not be updated.');
});
