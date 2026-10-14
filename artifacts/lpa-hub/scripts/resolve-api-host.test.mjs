import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

test('development CLI reaches the workspace API without changing release resolution', () => {
  const script = fileURLToPath(new URL('./resolve-api-host.mjs', import.meta.url));
  const env = {
    REPLIT_DEV_DOMAIN: 'workspace.example.test',
    REPLIT_INTERNAL_APP_DOMAIN: 'published.example.test',
    EXPO_PUBLIC_API_BASE_URL: 'https://explicit-release.example.test',
  };
  assert.equal(execFileSync(process.execPath, [script, '--development'], { env, encoding: 'utf8' }).trim(), 'https://workspace.example.test');
  assert.equal(execFileSync(process.execPath, [script], { env, encoding: 'utf8' }).trim(), 'https://explicit-release.example.test');
});