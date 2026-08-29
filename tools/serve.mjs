/* `npm start`. The site has no build step. This tool is here only
   to make an http address as easy as a file address. */
import { startServer } from './static-server.mjs';

const port = Number(process.env.PORT || 8743);
await startServer(port);
console.log('http://localhost:' + port);
