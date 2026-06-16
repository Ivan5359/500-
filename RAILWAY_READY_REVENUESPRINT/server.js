const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
  res.end(body);
}

function serve(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not found');
      return;
    }
    send(res, 200, data, types[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
}

function safeJoin(base, requestPath) {
  const clean = decodeURIComponent(requestPath.split('?')[0]);
  const target = path.normalize(path.join(base, clean));
  return target.startsWith(base) ? target : null;
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    send(res, 200, JSON.stringify({ ok: true, app: 'RevenueSprint 48' }), 'application/json; charset=utf-8');
    return;
  }

  let filePath = url.pathname === '/' ? path.join(publicDir, 'index.html') : safeJoin(publicDir, url.pathname);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.stat(filePath, (fileErr, fileStat) => {
      if (!fileErr && fileStat.isFile()) serve(res, filePath);
      else serve(res, path.join(publicDir, 'index.html'));
    });
  });
}).listen(port, () => {
  console.log(`RevenueSprint 48 running on ${port}`);
});
