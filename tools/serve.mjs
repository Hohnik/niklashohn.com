/* `npm start` — the site has no build step, so this is only here
   so that opening it over http is as easy as opening the file. */
import { startServer } from './static-server.mjs';

const port = Number(process.env.PORT || 8743);
await startServer(port);
console.log('http://localhost:' + port);
