import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { paymentMiddleware } from '../src/paymentMiddleware.js';
import { SettlementQueue } from '../src/settlementQueue.js';
import { staticResolver, type AgentPrice } from '../src/pricing.js';
import { encodePayment, type PaymentPayload } from '../src/x402.js';
import type { Facilitator } from '../src/facilitatorClient.js';

const price: AgentPrice = { costPerThink: '10000', payTo: '0xbeef', asset: '0xusdc', network: 'eip155:84532' };

function buildApp(facilitator: Facilitator) {
  const queue = new SettlementQueue(facilitator, { maxBatch: 100, maxWaitMs: 60000 });
  const app = express();
  app.use(
    '/v1/chat/completions',
    paymentMiddleware({ resolve: staticResolver({ '0': price }, price), facilitator, queue, defaultAgentId: '0' }),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  return { app, queue };
}

const payment = (): string =>
  encodePayment({ x402Version: 2, scheme: 'exact', network: 'eip155:84532', payload: { signature: '0xsig', authorization: { from: '0xa', to: '0xbeef', value: '10000', validAfter: '0', validBefore: '9999999999', nonce: '0x1' } } } as PaymentPayload);

describe('paymentMiddleware', () => {
  it('returns 402 with accepts when no X-PAYMENT', async () => {
    const facilitator = { verify: vi.fn(), settle: vi.fn() } as unknown as Facilitator;
    const { app } = buildApp(facilitator);
    const res = await request(app).post('/v1/chat/completions').send({ messages: [] });
    expect(res.status).toBe(402);
    expect(res.body.x402Version).toBe(2);
    expect(res.body.accepts[0].maxAmountRequired).toBe('10000');
    expect(res.body.accepts[0].payTo).toBe('0xbeef');
  });

  it('returns 402 again when facilitator says invalid (insufficient funds)', async () => {
    const facilitator = { verify: vi.fn().mockResolvedValue({ isValid: false, invalidReason: 'insufficient_funds' }), settle: vi.fn() } as unknown as Facilitator;
    const { app, queue } = buildApp(facilitator);
    const res = await request(app).post('/v1/chat/completions').set('X-PAYMENT', payment()).send({ messages: [] });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('insufficient_funds');
    expect(queue.size).toBe(0);
  });

  it('passes to next() and enqueues settlement when valid', async () => {
    const facilitator = { verify: vi.fn().mockResolvedValue({ isValid: true, payer: '0xa' }), settle: vi.fn() } as unknown as Facilitator;
    const { app, queue } = buildApp(facilitator);
    const res = await request(app).post('/v1/chat/completions').set('X-PAYMENT', payment()).send({ messages: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-payment-response']).toBeTruthy();
    expect(queue.size).toBe(1);
  });

  it('returns 402 on malformed X-PAYMENT', async () => {
    const facilitator = { verify: vi.fn(), settle: vi.fn() } as unknown as Facilitator;
    const { app } = buildApp(facilitator);
    const res = await request(app).post('/v1/chat/completions').set('X-PAYMENT', 'garbage').send({});
    expect(res.status).toBe(402);
    expect(facilitator.verify).not.toHaveBeenCalled();
  });
});
