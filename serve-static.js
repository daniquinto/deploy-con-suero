// Servidor estatico minimo para la build de React, sin dependencias.
// El nginx de la VPS hace el proxy reverso hacia este puerto.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(process.env.STATIC_ROOT || '/app/public');
const INDEX = path.join(ROOT, 'index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
};

// Los assets con hash en el nombre se cachean fuerte; index.html nunca.
function cacheControl(file) {
  if (path.basename(file) === 'index.html') {
    return 'no-cache, no-store, must-revalidate';
  }
  return /\/(assets|static)\//.test(file)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';
}

function send(res, status, file) {
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cacheControl(file),
    'X-Content-Type-Options': 'nosniff',
  };
  res.writeHead(status, headers);
  fs.createReadStream(file)
    .on('error', () => res.end())
    .pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }

  // Resuelve dentro de ROOT: corta cualquier intento de path traversal.
  const decoded = decodeURIComponent(url.pathname);
  const target = path.resolve(ROOT, '.' + path.posix.normalize(decoded));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.stat(target, (err, stat) => {
    if (!err && stat.isFile()) return send(res, 200, target);

    if (!err && stat.isDirectory()) {
      const dirIndex = path.join(target, 'index.html');
      if (fs.existsSync(dirIndex)) return send(res, 200, dirIndex);
    }

    // Fallback de SPA: la ruta la resuelve React Router en el cliente.
    if (fs.existsSync(INDEX)) return send(res, 200, INDEX);

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
});

server.listen(PORT, () => {
  console.log(`frontend sirviendo ${ROOT} en el puerto ${PORT}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
