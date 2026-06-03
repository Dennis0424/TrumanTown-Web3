import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createGateway } from '../src/gateway.js';
import { staticResolver, type AgentPrice } from '../src/pricing.js';
import { SettlementQueue } from '../src/settlementQueue.js';
import { startStubUpstream, type StubUpstream } from './helpers/stubUpstream.js';
import { mockFacilitator } from './helpers/mockFacilitator.js';
import { fakeXPayment } from './helpers/signPayment.js';

const PAY_TO = '0x000000000000000000000000000000000000beef';
const RICH = '0x000000000000000000000000000000000000a11ce';
const POOR = '0x0000000000000000000000000000000000000dead';
const price: AgentPrice = { costPerThink: '10000', payTo: PAY_TO, asset: '0xusdc', network: 'base-sepolia' };

let upstream: StubUpstream;

beforeAll(async () => {
  upstream = await startStubUpstream();
});
afterAll(() => upstream.close());

function makeApp(richPayers: string[]) {
  const { facilitator, settled } = mockFacilitator(richPayers);
  const queue = new SettlementQueue(facilitator, { maxBatch: 1, maxWaitMs: 60000 });
  const app = createGateway({
    resolve: staticResolver({ '0': price }, price),
    facilitator,
    queue,
    ollamaUpstream: upstream.url,
    defaultAgentId: '0',
  });
  return { app, settled, queue };
}

describe('gateway end-to-end', () => {
  it('402 first, then 200 after a valid payment, and settles', async () => {
    const { app, settled } = makeApp([RICH]);

    const first = await request(app).post('/v1/chat/completions').send({ messages: [] });
    expect(first.status).toBe(402);
    expect(first.body.accepts[0].maxAmountRequired).toBe('10000');

    const paid = await request(app)
      .post('/v1/chat/completions')
      .set('X-PAYMENT', fakeXPayment(RICH, PAY_TO))
      .send({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
    expect(paid.status).toBe(200);
    expect(paid.body.echoUrl).toBe('/v1/chat/completions');
    await new Promise((r) => setTimeout(r, 10)); // let the size-1 queue flush
    expect(settled.length).toBe(1);
  });

  it('persistent 402 when payer is starving (insufficient funds)', async () => {
    const { app, settled } = makeApp([RICH]); // POOR not rich
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/v1/chat/completions')
        .set('X-PAYMENT', fakeXPayment(POOR, PAY_TO))
        .send({ messages: [] });
      expect(res.status).toBe(402);
      expect(res.body.error).toBe('insufficient_funds');
    }
    expect(settled.length).toBe(0);
  });

  it('free passthrough: embeddings need no payment', async () => {
    const { app } = makeApp([]);
    const res = await request(app).post('/api/embeddings').send({ model: 'mxbai', prompt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.echoUrl).toBe('/api/embeddings');
  });

  it('healthz is open', async () => {
    const { app } = makeApp([]);
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
