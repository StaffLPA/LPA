const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { safeStaticFilePath, createStaticFileServer } = require('./serve.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lpa-web-assets-'));
const content = 'window.lpa = "Shared mobile experience";\n'.repeat(150);
fs.writeFileSync(path.join(root, 'entry-0123456789abcdef.js'), content);
fs.writeFileSync(path.join(root, 'index.html'), '<html>LPA Hub</html>');
fs.writeFileSync(path.join(root, 'photo.png'), Buffer.alloc(2000, 42));
const serveStaticFile = createStaticFileServer([root]);
const server = http.createServer((req, res) => {
  if (serveStaticFile(req.url, req, res)) return;
  res.writeHead(404);
  res.end('Not Found');
});
let port;
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
});
function request(file, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: `/${file}`, headers, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('fingerprinted assets are immutable and stream unchanged', async () => {
  const res = await request('entry-0123456789abcdef.js');
  assert.equal(res.body.toString(), content);
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(res.headers['content-type'], 'application/javascript; charset=utf-8');
});
test('HTML is revalidated rather than retained as an immutable app shell', async () => {
  const res = await request('index.html');
  assert.equal(res.headers['cache-control'], 'no-cache');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});
test('large JavaScript is compressed when gzip is accepted', async () => {
  const res = await request('entry-0123456789abcdef.js', { 'accept-encoding': 'br, gzip' });
  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(res.headers.vary, 'Accept-Encoding');
  assert.equal(gunzipSync(res.body).toString(), content);
  assert.ok(res.body.length < Buffer.byteLength(content) / 2);
});
test('gzip refusal and already-compressed images are respected', async () => {
  const js = await request('entry-0123456789abcdef.js', { 'accept-encoding': 'gzip; q=0' });
  assert.equal(js.headers['content-encoding'], undefined);
  assert.equal(js.body.toString(), content);
  const image = await request('photo.png', { 'accept-encoding': 'gzip' });
  assert.equal(image.headers['content-encoding'], undefined);
  assert.equal(image.body.length, 2000);
});
test('matching ETags avoid retransmission for unchanged assets', async () => {
  const first = await request('index.html');
  const res = await request('index.html', { 'if-none-match': first.headers.etag });
  assert.equal(res.status, 304);
  assert.equal(res.body.length, 0);
});
test('HEAD returns headers without a response body', async () => {
  const res = await request('entry-0123456789abcdef.js', {}, 'HEAD');
  assert.equal(res.status, 200);
  assert.equal(Number(res.headers['content-length']), Buffer.byteLength(content));
  assert.equal(res.body.length, 0);
});

test('static assets cannot resolve outside their root, including through encoded paths or symlinks', async () => {
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lpa-private-assets-'));
  try {
    const secret = path.join(privateRoot, 'private.txt');
    fs.writeFileSync(secret, 'not public');
    fs.symlinkSync(secret, path.join(root, 'leak.txt'));
    assert.equal(safeStaticFilePath(root, path.relative(root, secret)), null);
    assert.equal(safeStaticFilePath(root, 'leak.txt'), null);
    assert.equal(safeStaticFilePath(root, 'index.html'), path.join(root, 'index.html'));
    assert.equal(safeStaticFilePath(root, 'missing.txt'), null);
    const indexed = createStaticFileServer([root]);
    assert.equal(indexed('/leak.txt', {}, {}), false, 'external symlinks are never registered');
    const relativeSecret = path.relative(root, secret);
    for (const attemptedPath of [relativeSecret, relativeSecret.replaceAll('../', '%2e%2e%2f'), 'leak.txt']) {
      const response = await request(attemptedPath);
      assert.equal(response.status, 404);
      assert.equal(response.body.toString(), 'Not Found');
    }
    const malformed = await request('%invalid');
    assert.equal(malformed.status, 400);
  } finally {
    fs.rmSync(privateRoot, { recursive: true, force: true });
    fs.rmSync(path.join(root, 'leak.txt'), { force: true });
  }
});
