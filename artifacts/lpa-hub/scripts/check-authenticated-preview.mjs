#!/usr/bin/env node

const previewOrigin = process.env.PREVIEW_ORIGIN?.trim().replace(/\/+$/, '');
const sessionToken = process.env.LPA_SESSION_TOKEN?.trim();

if (!previewOrigin || !/^https?:\/\//i.test(previewOrigin)) {
  console.error('Authenticated preview check: set PREVIEW_ORIGIN to the running preview origin, for example https://your-preview.replit.dev.');
  process.exit(1);
}

if (!sessionToken) {
  console.error('Authenticated preview check: set LPA_SESSION_TOKEN to the bearer token from an authenticated LPA Hub session.');
  process.exit(1);
}

const origin = new URL(previewOrigin).origin;
const authorization = `Bearer ${sessionToken}`;
const checks = [
  { name: 'calendar feed: varsity', method: 'GET', path: '/api/calendar.ics?team=varsity', responseType: 'text' },
  { name: 'calendar feed: junior varsity', method: 'GET', path: '/api/calendar.ics?team=lpa-jv', responseType: 'text' },
  { name: 'calendar feed: 14u', method: 'GET', path: '/api/calendar.ics?team=14u', responseType: 'text' },
  { name: 'calendar feed: 15u', method: 'GET', path: '/api/calendar.ics?team=15u', responseType: 'text' },
  { name: 'calendar feed: LPA events', method: 'GET', path: '/api/calendar.ics?team=lpa-events', responseType: 'text' },
  { name: 'admin calendar loading', method: 'GET', path: '/api/admin/calendar-events', responseType: 'json' },
  { name: 'invitation management loading', method: 'GET', path: '/api/admin/users', responseType: 'json' },
];

function endpointUrl(path) {
  return new URL(path, origin).toString();
}

function corsFailure(name, response, detail) {
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const allowCredentials = response.headers.get('access-control-allow-credentials');
  return `${name}: browser CORS check failed (${detail}); ` +
    `status=${response.status}, access-control-allow-origin=${allowOrigin ?? '<missing>'}, ` +
    `access-control-allow-credentials=${allowCredentials ?? '<missing>'}. ` +
    'Check the API preview origin and CORS configuration.';
}

async function preflight(name, path, method) {
  const response = await fetch(endpointUrl(path), {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'authorization, cache-control',
    },
  });
  if (!response.ok) {
    throw new Error(`${name}: preflight failed with HTTP ${response.status}. The browser will block the authenticated request.`);
  }
  if (response.headers.get('access-control-allow-origin') !== origin) {
    throw new Error(corsFailure(name, response, 'origin was not reflected'));
  }
  if (response.headers.get('access-control-allow-credentials') !== 'true') {
    throw new Error(corsFailure(name, response, 'credentials were not enabled'));
  }
}

async function authenticatedRequest(check) {
  const response = await fetch(endpointUrl(check.path), {
    method: check.method,
    headers: {
      Authorization: authorization,
      Origin: origin,
      'Cache-Control': 'no-store',
    },
  });
  if (response.status === 401) {
    throw new Error(`${check.name}: unexpected HTTP 401. The preview request carried a bearer token, but the API rejected the session; sign in again and refresh LPA_SESSION_TOKEN.`);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${check.name}: HTTP ${response.status}${body ? ` — ${body.slice(0, 240)}` : ''}.`);
  }
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const allowCredentials = response.headers.get('access-control-allow-credentials');
  if (allowOrigin !== origin || allowCredentials !== 'true') {
    throw new Error(corsFailure(check.name, response, 'authenticated response is not browser-readable'));
  }
  const body = await response[check.responseType]();
  if (check.responseType === 'text' && !body.includes('BEGIN:VCALENDAR')) {
    throw new Error(`${check.name}: response was not a valid iCalendar feed.`);
  }
}

console.log(`Checking authenticated preview at ${origin}`);
try {
  for (const check of checks) {
    await preflight(check.name, check.path, check.method);
    await authenticatedRequest(check);
    console.log(`PASS ${check.name}`);
  }

  await preflight('invitation create', '/api/admin/invites', 'POST');
  console.log('PASS invitation create preflight');
  console.log('Authenticated calendar and invitation preview checks passed.');
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}