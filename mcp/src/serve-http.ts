import http from 'node:http';
import { handler } from './http-mcp.js';

const PORT = Number(process.env.PORT ?? 4000);
const server = http.createServer((req, res) => handler(req, res));
server.listen(PORT, () => {
  console.error(`[sfbathroom-mcp] HTTP stateless en http://localhost:${PORT} (GET / y POST /)`);
});
process.on('SIGINT', () => { server.close(() => process.exit(0)); });