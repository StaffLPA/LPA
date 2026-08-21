import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveApiBaseUrl } from './resolve-api-host.mjs';

test('prefers the deployment-specific domain when it is available', () => {
  assert.equal(
    resolveApiBaseUrl({
      deploymentDomain: 'published.example.com',
      configuredDomains: 'fallback.example.com',
    }),
    'https://published.example.com',
  );
});

test('uses an explicitly configured API URL before environment-specific domains', () => {
  assert.equal(
    resolveApiBaseUrl({
      apiBaseUrl: 'https://adequate-acceptable-debugger.replit.app/',
      deploymentDomain: 'published.example.com',
    }),
    'https://adequate-acceptable-debugger.replit.app',
  );
});

test('falls back to a valid host when the deployment-specific domain is missing', () => {
  assert.equal(
    resolveApiBaseUrl({
      deploymentDomain: '',
      configuredDomains: 'fallback.example.com',
    }),
    'https://fallback.example.com',
  );
});

test('uses localhost rather than producing a protocol-only URL', () => {
  assert.equal(resolveApiBaseUrl(), 'https://localhost');
});