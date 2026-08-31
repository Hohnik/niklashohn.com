/* A small server for static files. It is small enough to not be a
   dependency. `npm start`, the tests and the card tool all use it.
   Thus all three serve the site in the same way. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.glsl': 'text/plain'
};

export function startServer(port = 8743, root = process.cwd()) {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    /* First remove each ../ at the start of the path. Then make
       sure that the result is still in the root. A directory must
       not give a path to a file above it. */
    const rel = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      res.end(body);
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Read error');
    }
  });
  /* Try the port that the caller asks for. If a different program
     holds it, take any free port. The caller then reads the real
     port from server.address().port.

     Before this, a busy port stopped the full test run with an
     error from deep in the network code. */
  return new Promise((ok, fail) => {
    server.once('error', err => {
      if (err.code !== 'EADDRINUSE') return fail(err);
      server.once('error', fail);
      server.listen(0, '127.0.0.1', () => ok(server));
    });
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

/* The address of a server that listens on a host and a port. */
export function origin(server) {
  return 'http://127.0.0.1:' + server.address().port;
}
