/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → the Expo web application
 * - GET /download → the mobile download/deep-link landing page
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { createGzip } = require('zlib');

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const WEB_ROOT = path.join(STATIC_ROOT, 'web');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const MANIFESTS = Object.freeze({
  ios: readBuildManifest('ios/manifest.json'),
  android: readBuildManifest('android/manifest.json'),
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return typeof appJson.expo?.name === 'string'
      ? appJson.expo.name
      : 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toScriptString(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function serveManifest(platform, res) {
  const manifest = Object.hasOwn(MANIFESTS, platform)
    ? MANIFESTS[platform]
    : null;

  if (manifest === null) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  res.writeHead(200, {
    'content-type': 'application/json',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `exps://${host}${basePath}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_ATTRIBUTE_PLACEHOLDER/g, escapeHtml(expsUrl))
    .replace(/EXPS_URL_JSON_PLACEHOLDER/g, toScriptString(expsUrl))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveFile(filePath, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  // Only content-fingerprinted assets are safe to retain across releases.
  const fingerprinted = /[-.][a-f0-9]{16,}\./i.test(path.basename(filePath));
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const headers = {
    'content-type': contentType,
    'cache-control': fingerprinted && ext !== '.html'
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    etag,
    'last-modified': stat.mtime.toUTCString(),
    vary: 'Accept-Encoding',
    'x-content-type-options': 'nosniff',
  };
  if (req.headers['if-none-match']?.split(',').map((value) => value.trim()).includes(etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const acceptsGzip = (req.headers['accept-encoding'] || '').split(',').some((entry) => {
    const [encoding, ...parameters] = entry.trim().toLowerCase().split(';');
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    return encoding === 'gzip' && (!quality || Number(quality.trim().slice(2)) > 0);
  });
  const compressible = /\.(html|js|json|css|svg|map)$/i.test(filePath);
  const gzip = acceptsGzip && compressible && stat.size >= 1024;
  if (gzip) headers['content-encoding'] = 'gzip';
  else headers['content-length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const onError = (error) => { if (error) res.destroy(error); };
  // Stream rather than buffering a complete JS bundle per concurrent visitor.
  const source = fs.createReadStream(filePath);
  if (gzip) pipeline(source, createGzip(), res, onError);
  else pipeline(source, res, onError);
}

function readBuildManifest(relativePath) {
  const filePath = safeStaticFilePath(STATIC_ROOT, relativePath);
  return filePath ? fs.readFileSync(filePath, 'utf-8') : null;
}

/** Production build output is immutable: request URLs select a pre-registered handler, never a file path. */
function createStaticFileServer(roots) {
  const assets = [];
  function registerDirectory(root, relativeDirectory = '') {
    const directory = path.join(root, relativeDirectory);
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) registerDirectory(root, relativePath);
      else if (entry.isFile()) {
        const filePath = safeStaticFilePath(root, relativePath);
        if (filePath) assets.push({
          url: `/${relativePath.split(path.sep).join('/')}`,
          serve: (req, res) => serveFile(filePath, req, res),
        });
      }
    }
  }
  for (const root of roots) registerDirectory(root);
  return (urlPath, req, res) => {
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(urlPath);
    } catch {
      res.writeHead(400);
      res.end('Invalid asset path');
      return true;
    }
    const asset = assets.find((entry) => entry.url === decodedPath);
    if (!asset) return false;
    asset.serve(req, res);
    return true;
  };
}

function isWithinDirectory(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function safeStaticFilePath(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relativePath);
  if (!isWithinDirectory(absoluteRoot, candidate)) return null;
  try {
    const realRoot = fs.realpathSync(absoluteRoot);
    const realCandidate = fs.realpathSync(candidate);
    if (!isWithinDirectory(realRoot, realCandidate) || !fs.statSync(realCandidate).isFile()) return null;
    return realCandidate;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES'].includes(error?.code)) return null;
    throw error;
  }
}

function serveWebEntry(req, res) {
  const entry = path.join(WEB_ROOT, 'index.html');
  if (!fs.existsSync(entry)) {
    res.writeHead(404);
    res.end('Web application is not available.');
    return;
  }
  serveFile(entry, req, res);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
const appName = getAppName();
const serveStaticFile = createStaticFileServer([STATIC_ROOT, WEB_ROOT]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || '/';
  }

  // Keep startup checks independent from the generated web bundle so the
  // production service can report readiness as soon as it is listening.
  if (pathname === '/status') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (pathname === '/' || pathname === '/manifest') {
    const platform = req.headers['expo-platform'];
    if (platform === 'ios' || platform === 'android') {
      return serveManifest(platform, res);
    }

    if (pathname === '/') return serveWebEntry(req, res);
  }

  if (pathname === '/download') return serveLandingPage(req, res, landingPageTemplate, appName);
  if (serveStaticFile(pathname, req, res)) return;
  if (!path.extname(pathname)) return serveWebEntry(req, res);
  res.writeHead(404);
  res.end('Not Found');
});

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Serving static Expo build on port ${port}`);
  });
}

module.exports = { serveFile, safeStaticFilePath, createStaticFileServer };
