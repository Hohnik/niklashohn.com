/* `npm start`. The site has no build step. This tool is here only
   to make an http address as easy as a file address. */
import { startServer } from './static-server.mjs';

const port = Number(process.env.PORT || 8743);
const server = await startServer(port);
/* Show the port that the server holds, and not the port that this
   tool asked for. The two are different if the first port is
   busy. */
console.log('http://localhost:' + server.address().port);
