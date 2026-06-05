import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubUpstream {
  url: string;
  requests: { method: string; url: string; body: string; headers: Record<string, string | string[] | undefined> }[];
  close: () => Promise<void>;
}

/** A tiny fake Ollama that echoes the request path/body so the proxy can be asserted. */
export async function startStubUpstream(): Promise<StubUpstream> {
  const requests: StubUpstream['requests'] = [];
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method!, url: req.url!, body, headers: req.headers });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ echoUrl: req.url, echoBody: body }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** A stub that sends headers + a partial chunk on /broken, then abruptly destroys
 *  the socket to simulate a mid-stream upstream failure. All other paths echo normally. */
export async function startFlakyUpstream(): Promise<StubUpstream> {
  const requests: StubUpstream['requests'] = [];
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method!, url: req.url!, body, headers: req.headers });
      if (req.url === '/broken') {
        res.write('{"partial":true'); // no close — destroy the socket mid-stream
        res.socket?.destroy();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ echoUrl: req.url, echoBody: body }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
