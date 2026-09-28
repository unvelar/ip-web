import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// No environment files, proxy, API, database, auth, or third-party dependencies.
const resources = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
export function createSandboxServer() {
  return createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const resource = resources.get(request.url);
    if (!['GET', 'HEAD'].includes(request.method) || !resource) {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      const body = await readFile(new URL(resource[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': resource[1] });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500).end('Unable to load sandbox resource');
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createSandboxServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(5173, '127.0.0.1', () => console.log('Monitoring sandbox: http://localhost:5173 — example data only'));
}
