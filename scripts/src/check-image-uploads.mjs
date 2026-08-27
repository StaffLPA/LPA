#!/usr/bin/env node

/*
 * Release smoke check for the signed-in image upload flow.
 *
 * Credentials are read only from the environment. They are never included in
 * output, errors, or child processes. CI can use LPA_SESSION_TOKEN and
 * LPA_SECOND_SESSION_TOKEN instead of putting a test password in a job log.
 */

import { deflateSync } from 'node:zlib';

const originValue = (process.env.PREVIEW_ORIGIN || process.env.RELEASE_CHECK_ORIGIN || '').trim().replace(/\/+$/, '');
const sessionToken = process.env.LPA_SESSION_TOKEN?.trim();
const secondSessionToken = process.env.LPA_SECOND_SESSION_TOKEN?.trim();
const testEmail = process.env.LPA_TEST_ADMIN_EMAIL?.trim();
const testPassword = process.env.LPA_TEST_ADMIN_PASSWORD;

if (!originValue || !/^https?:\/\//i.test(originValue)) {
  fail('Set PREVIEW_ORIGIN (or RELEASE_CHECK_ORIGIN) to the running API/app origin.');
}
if (!sessionToken && (!testEmail || !testPassword)) {
  fail('Set LPA_SESSION_TOKEN, or set LPA_TEST_ADMIN_EMAIL and LPA_TEST_ADMIN_PASSWORD in the release environment.');
}
if (sessionToken && !secondSessionToken && (!testEmail || !testPassword)) {
  fail('Cross-session verification needs LPA_SECOND_SESSION_TOKEN, or the test-admin sign-in variables.');
}

const origin = new URL(originValue).origin;
const expected = {
  profile: { width: 3, height: 2 },
  schedule: { width: 8, height: 5 },
};

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function endpoint(path) {
  return new URL(path, origin).toString();
}

function imageError(name, response, detail = '') {
  const status = response ? `HTTP ${response.status}` : 'no HTTP response';
  const hint = response?.status === 404
    ? ' Object storage returned 404; check bucket/path configuration.'
    : response?.status === 401 || response?.status === 403
      ? ' Authorization was rejected; check the approved test session and signed URL permissions.'
      : '';
  return `${name}: ${status}${detail ? ` — ${detail}` : ''}.${hint}`;
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function api(name, token, path, options = {}) {
  let response;
  try {
    response = await fetch(endpoint(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(`${name}: request failed — ${error instanceof Error ? error.message : String(error)}`);
  }
  const body = await readBody(response);
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'message' in body ? body.message : String(body || '');
    throw new Error(imageError(name, response, detail));
  }
  return body;
}

async function signIn() {
  const response = await fetch(endpoint('/api/auth/sign-in'), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ identifier: testEmail, password: testPassword }),
  });
  const body = await readBody(response);
  if (!response.ok || !body?.sessionToken) {
    const detail = body && typeof body === 'object' && 'message' in body ? body.message : '';
    throw new Error(imageError('approved test-admin sign-in', response, detail));
  }
  if (body.user?.role !== 'Admin') {
    throw new Error('approved test-admin sign-in: the configured account is not an Admin.');
  }
  return body;
}

function pngFixture(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) rgba.copy(raw, y * (width * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const typeBuffer = Buffer.from(type);
    const payload = Buffer.concat([typeBuffer, data]);
    const crc = crc32(payload);
    const output = Buffer.alloc(12 + data.length);
    output.writeUInt32BE(data.length, 0);
    payload.copy(output, 4);
    output.writeUInt32BE(crc, 8 + data.length);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    if (bytes.toString('ascii', 12, 16) === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  throw new Error('returned object is not a supported PNG/WebP fixture');
}

async function uploadAndVerify(name, token, uploadPath, savePath, fixture, metadata) {
  const upload = await api(`${name} upload-url`, token, uploadPath, {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png', size: fixture.length, ...metadata }),
  });
  if (!upload?.uploadURL || !upload?.objectPath) throw new Error(`${name} upload-url: response did not include uploadURL and objectPath.`);

  let put;
  try {
    put = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: fixture });
  } catch (error) {
    throw new Error(`${name} object upload: request failed — ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!put.ok) throw new Error(imageError(`${name} object upload`, put));

  const saved = await api(`${name} save`, token, savePath(upload.objectPath), {
    method: 'PATCH',
    body: JSON.stringify({ ...metadata, objectPath: upload.objectPath }),
  });
  return { upload, saved };
}

async function verifyImage(name, uri, expectedDimensions) {
  if (!uri || typeof uri !== 'string') throw new Error(`${name}: save/read response did not include an image URI.`);
  let response;
  try { response = await fetch(uri); } catch (error) {
    throw new Error(`${name}: signed image GET failed — ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(imageError(`${name} signed image GET`, response));
  const actual = dimensions(Buffer.from(await response.arrayBuffer()));
  if (actual.width !== expectedDimensions.width || actual.height !== expectedDimensions.height) {
    throw new Error(`${name}: returned dimensions ${actual.width}x${actual.height}; expected ${expectedDimensions.width}x${expectedDimensions.height}.`);
  }
}

const profileFixture = pngFixture(expected.profile.width, expected.profile.height, Buffer.from([196, 122, 68, 255]));
const scheduleFixture = pngFixture(expected.schedule.width, expected.schedule.height, Buffer.from([73, 184, 160, 255]));

try {
  const first = sessionToken ? { sessionToken, user: await api('first session', sessionToken, '/api/auth/me') } : await signIn();
  const second = secondSessionToken ? { sessionToken: secondSessionToken } : (testEmail && testPassword ? await signIn() : null);
  if (!first.user || first.user.role !== 'Admin') {
    throw new Error('first session: the authenticated account is not an Admin.');
  }
  if (!second?.sessionToken) throw new Error('second session: no second approved session was available.');

  const profile = await uploadAndVerify(
    'profile photo',
    first.sessionToken,
    '/api/auth/profile-photo/upload-url',
    (objectPath) => '/api/auth/profile',
    profileFixture,
    { email: first.user.email, phone: first.user.phone, firstName: first.user.firstName, lastName: first.user.lastName },
  );
  await verifyImage('profile photo', profile.saved.profilePhotoUri, expected.profile);
  console.log('PASS profile photo upload, save, signed GET, and dimensions');

  const schedule = await uploadAndVerify(
    'weekly schedule',
    first.sessionToken,
    '/api/admin/schedule-images/upload-url',
    (objectPath) => '/api/admin/schedule-images',
    scheduleFixture,
    { kind: 'weekly-schedule', width: expected.schedule.width, height: expected.schedule.height },
  );
  await verifyImage('weekly schedule upload', schedule.saved['weekly-schedule']?.uri, expected.schedule);
  console.log('PASS weekly schedule upload, save, signed GET, and dimensions');

  const secondRead = await api('weekly schedule second-session read', second.sessionToken, '/api/schedule-images');
  await verifyImage('weekly schedule second-session image', secondRead['weekly-schedule']?.uri, expected.schedule);
  const returned = secondRead['weekly-schedule'];
  if (returned.width !== expected.schedule.width || returned.height !== expected.schedule.height) {
    throw new Error(`weekly schedule second-session read: API metadata was ${returned.width}x${returned.height}; expected ${expected.schedule.width}x${expected.schedule.height}.`);
  }
  console.log('PASS weekly schedule is visible with image dimensions in a second session');
  console.log('Image upload release smoke check passed.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}