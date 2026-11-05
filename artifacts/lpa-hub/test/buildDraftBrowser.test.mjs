import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import { get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browserUrl = process.env.LPA_BUILD_BROWSER_URL
  ?? (process.env.REPLIT_EXPO_DEV_DOMAIN ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}/build` : null);
const chromiumPath = process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium';
const draftKey = 'lpa-public-build-drafts:v1:athlete-a';

function installBuildMocks() {
  const athletes = [
    { id: 'athlete-a', displayName: 'Alex Athlete' },
    { id: 'athlete-b', displayName: 'Bailey Athlete' },
  ];
  const calls = [];
  window.__buildTestCalls = calls;
  window.__initialBuildSession = sessionStorage.getItem('lpa-build-access');
  const originalFetch = window.fetch.bind(window);

  const workoutFor = (athleteId) => {
    const isA = athleteId === 'athlete-a';
    const params = new URL(location.href).searchParams;
    const assignmentId = isA && params.has('scope-assignment') ? 'assignment-a-changed' : `assignment-${athleteId}`;
    const structureVersion = isA && params.has('scope-structure') ? 5 : 4;
    const name = isA ? 'Alex Athlete' : 'Bailey Athlete';
    return {
      athlete: { id: athleteId, displayName: name },
      assignment: {
        id: assignmentId,
        athleteId,
        programId: `program-${athleteId}`,
        programName: isA ? 'Alex Strength Cycle' : 'Bailey Strength Cycle',
        startDate: '2026-11-01',
        status: 'active',
        note: '',
        createdAt: '2026-11-01T12:00:00.000Z',
        endedAt: null,
      },
      program: {
        id: `program-${athleteId}`,
        name: isA ? 'Alex Strength Cycle' : 'Bailey Strength Cycle',
        description: '',
        isFavorite: false,
        structureVersion,
        createdAt: '2026-11-01T12:00:00.000Z',
        updatedAt: '2026-11-01T12:00:00.000Z',
        weeks: [{
          id: `week-${athleteId}`,
          position: 0,
          name: 'Week 1',
          days: [{
            id: `day-${athleteId}`,
            position: 0,
            name: 'Day A',
            workoutName: 'Workout A',
            exercises: [{
              id: `workout-exercise-${athleteId}`,
              exerciseId: `exercise-${athleteId}`,
              position: 0,
              exerciseName: 'Back Squat',
              supersetLetter: null,
              supersetIndex: null,
              sets: 1,
              additionalInfo: '',
              options: { trackReps: true, trackVolume: true, disablePR: false },
              setValues: [],
            }],
          }],
        }],
      },
      exercises: [{
        id: `exercise-${athleteId}`,
        description: '',
        videoUrl: null,
        hasUploadedVideo: false,
      }],
      logs: [],
      records: [],
      progress: { overallPercent: 0, weeklyPercent: [0] },
      currentWeek: 0,
      currentDay: 0,
      today: '2026-11-02',
    };
  };
  const json = (value) => new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = init.method ?? (input instanceof Request ? input.method : 'GET');
    calls.push({ method: method.toUpperCase(), path: url.pathname, body: init.body ?? null });

    if (url.pathname === '/api/public/build/athletes') {
      return json({ athletes, pinRequired: false });
    }
    const access = url.pathname.match(/^\/api\/public\/build\/athletes\/([^/]+)\/access$/);
    if (access) {
      return json({ accessToken: `test-token-for-${access[1]}-with-sufficient-length`, expiresAt: '2099-01-01T00:00:00.000Z' });
    }
    const workspace = url.pathname.match(/^\/api\/public\/build\/athletes\/([^/]+)\/workspace$/);
    if (workspace) return json(workoutFor(workspace[1]));
    if (url.pathname.match(/^\/api\/public\/build\/athletes\/[^/]+\/logs$/)) return json(workoutFor('athlete-a'));
    return originalFetch(input, init);
  };
}

class CdpClient {
  nextId = 0;
  pending = new Map();
  listeners = new Map();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (${pending.method})`));
        else pending.resolve(message.result ?? {});
      } else {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params, message.sessionId);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}, sessionId, timeoutMs = 20_000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Chromium command ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.socket.close();
  }
}

function readJsonFromLocalHttp(url) {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, { timeout: 5_000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Chromium DevTools returned HTTP ${response.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Timed out reading Chromium DevTools information.')));
    request.on('error', reject);
  });
}

async function waitForJsonFromLocalHttp(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Chromium exited with code ${child.exitCode}`);
    try { return await readJsonFromLocalHttp(url); }
    catch (error) {
      lastError = error;
      if (error.code !== 'ECONNREFUSED') throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Chromium DevTools did not become available on ${url}: ${lastError?.message ?? 'unknown error'}; ${child.chromeOutput || 'no Chromium diagnostics'}`);
}

async function stopChromium(child, cdp) {
  if (child.exitCode === null) {
    if (cdp) void cdp.send('Browser.close', {}, undefined, 3_000).catch(() => undefined);
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_500)),
    ]);
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
      if (child.exitCode === null) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    }
  }
  cdp?.close();
}

async function startBrowser(profileDir) {
  const activePortPath = join(profileDir, 'DevToolsActivePort');
  await unlink(activePortPath).catch(() => undefined);
  const child = spawn(chromiumPath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.chromeOutput = '';
  child.stderr?.on('data', (chunk) => { child.chromeOutput = `${child.chromeOutput}${chunk}`.slice(-4_000); });

  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Chromium exited with code ${child.exitCode}`);
    try {
      [port] = (await readFile(activePortPath, 'utf8')).split('\n');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!port) throw new Error('Chromium did not open its DevTools connection.');

  let cdp;
  try {
    const version = await waitForJsonFromLocalHttp(`http://127.0.0.1:${port}/json/version`, child);
    cdp = await CdpClient.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${installBuildMocks.toString()})();`,
    }, sessionId);
    cdp.on('Page.javascriptDialogOpening', (_params, eventSessionId) => {
      void cdp.send('Page.handleJavaScriptDialog', { accept: true }, eventSessionId);
    });

    return {
      cdp,
      sessionId,
      child,
      async close() {
        await stopChromium(child, cdp);
      },
    };
  } catch (error) {
    await stopChromium(child, cdp);
    throw error;
  }
}

async function evaluate(browser, expression) {
  const result = await browser.cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, browser.sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(browser, expression, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(browser, expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function clickTestId(browser, testId) {
  const selector = `[data-testid="${testId}"]`;
  const clicked = await evaluate(browser, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Expected Build control ${testId} to exist`);
}

async function fillTestId(browser, testId, value) {
  const selector = `[data-testid="${testId}"]`;
  const changed = await evaluate(browser, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!(node instanceof HTMLInputElement)) return false;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, `Expected Build input ${testId} to exist`);
}

async function openAthlete(browser, athleteId) {
  await clickTestId(browser, `build-athlete-${athleteId}`);
  await clickTestId(browser, 'build-continue');
  await waitFor(browser,
    `!!document.querySelector('[data-testid="build-weight-workout-exercise-${athleteId}-1"]')`,
    `workout for ${athleteId}`);
}

async function navigate(browser, url) {
  await browser.cdp.send('Page.navigate', { url }, browser.sessionId);
  await waitFor(browser, 'document.readyState === "complete"', 'the Build page to load');
  await waitFor(browser, `!!document.querySelector('[data-testid="build-weight-workout-exercise-athlete-a-1"]')`,
    'the selected athlete workout to render');
}

test('Build drafts survive a full browser restart and stay within their athlete and workout scope', {
  skip: !browserUrl ? 'Set LPA_BUILD_BROWSER_URL or REPLIT_EXPO_DEV_DOMAIN and start the LPA Hub Expo workflow.' : false,
}, async () => {
  await access(chromiumPath);
  const profileDir = await mkdtemp(join(tmpdir(), 'lpa-build-draft-browser-'));
  let browser;
  try {
    browser = await startBrowser(profileDir);
    await browser.cdp.send('Page.navigate', { url: browserUrl }, browser.sessionId);
    await waitFor(browser, `!!document.querySelector('[data-testid="build-athlete-athlete-a"]')`, 'the public athlete roster');
    await openAthlete(browser, 'athlete-a');

    assert.match(await evaluate(browser, 'document.body.innerText'), /Alex Strength Cycle/);
    assert.match(await evaluate(browser, 'document.body.innerText'), /Day A/);
    await fillTestId(browser, 'build-weight-workout-exercise-athlete-a-1', '85');
    await fillTestId(browser, 'build-reps-workout-exercise-athlete-a-1', '5');
    await fillTestId(browser, 'build-notes-workout-exercise-athlete-a-1', 'browser restart draft');

    await waitFor(browser, `(() => {
      const snapshots = JSON.parse(localStorage.getItem(${JSON.stringify(draftKey)}) || '[]');
      return snapshots.some((snapshot) => snapshot.assignmentId === 'assignment-athlete-a'
        && snapshot.structureVersion === 4
        && snapshot.entries['assignment-athlete-a|day-athlete-a|workout-exercise-athlete-a|1']?.weight === '85'
        && snapshot.entries['assignment-athlete-a|day-athlete-a|workout-exercise-athlete-a|1']?.reps === '5'
        && snapshot.entries['assignment-athlete-a|day-athlete-a|workout-exercise-athlete-a|1']?.notes === 'browser restart draft');
    })()`, 'the edited set to be saved in device-local storage');

    await browser.close();
    browser = null;

    // A new Chromium process and tab reuse only the durable browser profile.
    browser = await startBrowser(profileDir);
    await browser.cdp.send('Page.navigate', { url: browserUrl }, browser.sessionId);
    await waitFor(browser, `!!document.querySelector('[data-testid="build-weight-workout-exercise-athlete-a-1"]')`,
      'the remembered athlete workout after a full restart');
    assert.equal(await evaluate(browser, 'window.__initialBuildSession'), null,
      'the reopened browser must not rely on the previous tab’s session token');
    assert.match(await evaluate(browser, 'document.body.innerText'), /Alex Athlete/);
    assert.match(await evaluate(browser, 'document.body.innerText'), /Alex Strength Cycle/);
    assert.match(await evaluate(browser, 'document.body.innerText'), /Day A/);
    assert.equal(await evaluate(browser,
      `document.querySelector('[data-testid="build-weight-workout-exercise-athlete-a-1"]').value`), '85');
    assert.equal(await evaluate(browser,
      `document.querySelector('[data-testid="build-reps-workout-exercise-athlete-a-1"]').value`), '5');
    assert.equal(await evaluate(browser,
      `document.querySelector('[data-testid="build-notes-workout-exercise-athlete-a-1"]').value`), 'browser restart draft');
    assert.ok(await evaluate(browser, `window.__buildTestCalls.some((call) =>
      call.path === '/api/public/build/athletes/athlete-a/access' && call.method === 'POST')`),
    'the remembered athlete should receive a fresh access token after the session token is lost');

    await clickTestId(browser, 'build-switch');
    await waitFor(browser, `!!document.querySelector('[data-testid="build-athlete-athlete-b"]')`,
      'the athlete selector after switching');
    await openAthlete(browser, 'athlete-b');
    assert.match(await evaluate(browser, 'document.body.innerText'), /Bailey Strength Cycle/);
    assert.equal(await evaluate(browser,
      `document.querySelector('[data-testid="build-weight-workout-exercise-athlete-b-1"]').value`), '',
      'another athlete must not receive Alex’s local draft');
    assert.doesNotMatch(await evaluate(browser, 'document.body.innerText'), /Saved draft needs review/);

    await clickTestId(browser, 'build-switch');
    await waitFor(browser, `!!document.querySelector('[data-testid="build-athlete-athlete-a"]')`,
      'the athlete selector before checking a changed workout scope');
    await openAthlete(browser, 'athlete-a');

    const scopeAssignmentUrl = new URL(browserUrl);
    scopeAssignmentUrl.searchParams.set('scope-assignment', 'changed');
    await navigate(browser, scopeAssignmentUrl.toString());
    assert.match(await evaluate(browser, 'document.body.innerText'), /coach changed the assignment/i);
    assert.equal(await evaluate(browser,
      `document.querySelector('[data-testid="build-weight-workout-exercise-athlete-a-1"]').value`), '',
      'a draft from the previous assignment must not populate the current workout');

    const scopeStructureUrl = new URL(browserUrl);
    scopeStructureUrl.searchParams.set('scope-structure', 'changed');
    await navigate(browser, scopeStructureUrl.toString());
    assert.match(await evaluate(browser, 'document.body.innerText'), /changed the workout structure/i);
    assert.equal(await evaluate(browser,
      `document.querySelector('[data-testid="build-weight-workout-exercise-athlete-a-1"]').value`), '',
      'a draft from the previous structure version must not populate the current workout');
  } finally {
    if (browser) await browser.close();
    await rm(profileDir, { recursive: true, force: true });
  }
});
