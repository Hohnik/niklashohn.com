/* A static server for local work. The site itself has no build
   step and no dependencies — this is only here so `npm start`
   does the obvious thing. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT || 8743);
const ROOT = process.cwd();
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const body = await readFile(file);
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream',
                       'cache-control': 'no-store' });
  res.end(body);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
