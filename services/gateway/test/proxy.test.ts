import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeProxy } from '../src/proxy.js';
import { startStubUpstream, startFlakyUpstream, type StubUpstream } from './helpers/stubUpstream.js';

let upstream: StubUpstream;
let app: express.Express;

beforeAll(async () => {
  upstream = await startStubUpstream();
  app = express();
  const proxy = makeProxy(upstream.url);
  app.use('/api', proxy);
  app.use('/v1/chat/completions', proxy);
});

afterAll(() => upstream.close());

describe('makeProxy', () => {
  it('forwards path and body to upstream and returns its response', async () => {
    const res = await request(app)
      .post('/v1/chat/completions')
      .set('content-type', 'application/json')
      .send({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    expect(res.body.echoUrl).toBe('/v1/chat/completions');
    expect(JSON.parse(res.body.echoBody).model).toBe('llama3');
  });

  it('forwards free native ollama path (/api/embeddings)', async () => {
    const res = await request(app).post('/api/embeddings').set('content-type', 'application/json').send({ model: 'mxbai', prompt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.echoUrl).toBe('/api/embeddings');
  });

  it('does not forward gateway-internal headers', async () => {
    await request(app).post('/api/embeddings').set('X-PAYMENT', 'secret').set('X-Agent-Id', '0').send({});
    const last = upstream.requests.at(-1)!;
    expect(last.headers['x-payment']).toBeUndefined();
    expect(last.headers['x-agent-id']).toBeUndefined();
  });

  it('survives a mid-stream upstream failure and still serves the next request', async () => {
    const flaky = await startFlakyUpstream();
    const flakyApp = express();
    flakyApp.use('/broken', makeProxy(flaky.url));
    flakyApp.use('/api', makeProxy(flaky.url));

    // The broken stream must not crash the gateway. The request may error or
    // return a truncated/aborted body — we only require that it does not throw
    // an unhandled error that kills the process.
    await request(flakyApp).get('/broken').catch(() => undefined);

    // Proof of survival: the very next request still succeeds.
    const ok = await request(flakyApp).post('/api/x').send({ a: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.echoUrl).toBe('/api/x');

    await flaky.close();
  });
});
