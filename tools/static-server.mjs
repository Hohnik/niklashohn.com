/* A static file server small enough not to be a dependency.
   Shared by `npm start`, the test suite and the card renderer, so
   all three serve the site exactly the same way. */
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
    /* Strip any leading ../ before joining, then check the result
       is still inside the root — a served directory should not be
       a way out of it. */
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
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}
