import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDirectoryContact } from '../lib/contactDirectory.ts';

const staff = { name: 'Directory Coach', role: 'Head Coach', email: 'coach@example.com' };
const member = (id, extra = {}) => ({ id, fullName: 'Directory Coach', role: 'Staff-Coach', status: 'active', ...extra });
test('exact full name works when login email differs or an older API omits the mapping field', () => {
  assert.deepEqual(matchDirectoryContact(staff, [member('a')]).map((m) => m.id), ['a']);
  assert.deepEqual(matchDirectoryContact(staff, [member('a', { contactDirectoryKey: null })]).map((m) => m.id), ['a']);
});
test('case and whitespace differences do not prevent an exact name match', () => {
  assert.equal(matchDirectoryContact(staff, [member('a', { fullName: '  directory   COACH  ' })])[0].id, 'a');
});
test('email identity wins over another account with the same display name', () => {
  assert.deepEqual(matchDirectoryContact(staff, [member('a'), member('b', { fullName: 'Different Display Name', contactDirectoryKey: 'COACH@example.com' })]).map((m) => m.id), ['b']);
});
test('inactive users and non-staff access roles cannot become staff recipients', () => {
  assert.deepEqual(matchDirectoryContact(staff, [member('a', { status: 'invited' }), member('b', { role: 'Athlete' }), member('c', { role: 'Admin' })]), []);
});
test('similar names and explicit links to other contacts are not matched', () => {
  assert.deepEqual(matchDirectoryContact(staff, [member('a', { fullName: 'Directory Coach Jr' }), member('b', { contactDirectoryKey: 'another@example.com' })]), []);
});
test('duplicate names remain ambiguous instead of silently selecting a recipient', () => {
  assert.equal(matchDirectoryContact(staff, [member('a'), member('b')]).length, 2);
});
test('duplicate rows for the same account do not create false ambiguity', () => {
  assert.equal(matchDirectoryContact(staff, [member('a'), member('a')]).length, 1);
});
test('parent organization uses the named member without requiring a staff role', () => {
  const contact = { name: 'Parent Organization', role: 'Parent Contact', email: 'parent@example.com', partner: true };
  const parent = member('p', { fullName: 'Parent Contact', role: 'Parent-Athlete' });
  assert.equal(matchDirectoryContact(contact, [parent])[0].id, 'p');
  assert.deepEqual(matchDirectoryContact(contact, [{ ...parent, status: 'invited' }]), []);
});
