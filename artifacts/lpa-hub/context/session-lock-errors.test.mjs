import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccountLockSessionError, signInErrorMessage } from './session-lock-errors.mjs';

test('explicit account locks and revoked sessions must clear cached authentication', () => {
  assert.equal(isAccountLockSessionError({ status: 401, data: { code: 'ACCOUNT_LOCKED' } }), true);
  assert.equal(isAccountLockSessionError({ status: 401, data: { code: 'SESSION_REVOKED' } }), true);
});

test('offline failures, old APIs, and unrelated unauthorized responses preserve existing offline behavior', () => {
  for (const error of [null, new Error('offline'), { status: 404 }, { status: 401 }, { status: 401, data: { message: 'expired' } }, { status: 403, data: { code: 'ACCOUNT_LOCKED' } }]) {
    assert.equal(isAccountLockSessionError(error), false);
  }
});

test('locked sign-in displays the server message without a technical HTTP prefix', () => {
  const message = 'Your account is temporarily locked. Please contact an administrator.';
  assert.equal(signInErrorMessage({ status: 423, message: `HTTP 423 Locked: ${message}`, data: { message } }), message);
  assert.equal(signInErrorMessage({ status: 423 }), message);
  assert.equal(signInErrorMessage({ status: 401, message: 'Incorrect password' }), 'Incorrect password');
});
