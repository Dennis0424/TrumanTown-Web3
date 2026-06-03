import type { Request, Response, RequestHandler } from 'express';
import { Readable } from 'node:stream';

const HOP_BY_HOP = new Set([
  'host',
  'content-length',
  'connection',
  'x-payment',
  'x-agent-id',
]);

/**
 * Minimal streaming reverse proxy to Ollama. Forwards the original URL, streams
 * the request body (so chat prompts aren't buffered) and pipes the upstream
 * response back (so SSE streaming works). The gateway never JSON-parses bodies,
 * which keeps `req` a readable stream.
 */
export function makeProxy(target: string): RequestHandler {
  const root = target.replace(/\/$/, '');
  return async (req: Request, res: Response) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k) && typeof v === 'string') headers[k] = v;
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${root}${req.originalUrl}`, {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
        // duplex:'half' is required by Node fetch when body is a ReadableStream
        duplex: 'half',
      });
    } catch {
      res.status(502).json({ error: 'upstream (ollama) unreachable' });
      return;
    }

    res.status(upstream.status);
    upstream.headers.forEach((val, key) => {
      if (key !== 'content-encoding' && key !== 'transfer-encoding') res.setHeader(key, val);
    });
    if (upstream.body) {
      const upstreamStream = Readable.fromWeb(
        upstream.body as Parameters<typeof Readable.fromWeb>[0],
      );
      // Never let a mid-stream upstream error or a client disconnect crash the gateway.
      upstreamStream.on('error', () => res.destroy());
      res.on('close', () => upstreamStream.destroy());
      upstreamStream.pipe(res);
    } else {
      res.end();
    }
  };
}
