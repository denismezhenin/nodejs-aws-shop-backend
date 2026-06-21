import http from 'node:http';
import { PORT } from './config';
import { handleProxy, parseRequest } from './proxy';


function isHealthCheck(rawUrl: string): boolean {
  const { service } = parseRequest(rawUrl);
  return service === '' || service === 'health';
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url ?? '/';

  if (isHealthCheck(rawUrl)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'bff-service' }));
    return;
  }

  handleProxy(req, res).catch((err) => {
    console.error('Unhandled proxy error:', err);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    if (!res.writableEnded) {
      res.end('Cannot process request');
    }
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

server.listen(PORT, () => {
  console.log(`BFF service listening on port ${PORT}`);
});
