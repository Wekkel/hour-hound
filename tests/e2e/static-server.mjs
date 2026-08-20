#!/usr/bin/env node
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const port = Number(process.env.PORT || 4173);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

function safePath(urlPath) {
  const pathname = decodeURIComponent(new URL(urlPath, `http://localhost:${port}`).pathname);
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
  const full = resolve(join(root, rel));
  if (!full.startsWith(root)) return null;
  return full;
}

createServer((req, res) => {
  const full = safePath(req.url || '/');
  if (!full || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': types.get(extname(full)) || 'application/octet-stream' });
  createReadStream(full).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Hour Hound test server listening on http://127.0.0.1:${port}`);
});
