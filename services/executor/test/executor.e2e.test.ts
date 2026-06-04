import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createExecutor } from '../src/executor.js';
import { staticAgentResolver, type AgentConfig } from '../src/config.js';
import type { GuardrailConfig } from '../src/guardrails.js';
import { fakeWallet } from './helpers/fakeWallet.js';
import { fakeSigner } from './helpers/fakeSigner.js';

const agent0: AgentConfig = { agentId: '0', smartAccount: '0xS', eoa: '0xE', token: '0xTOKEN' };
const guardrails: GuardrailConfig = { maxUsdcPerTx: 5_000_000n, allowedContracts: ['0xTOKEN', '0xUSDC'] };

const requirements = {
  scheme: 'exact',
  network: 'eip155:84532',
  maxAmountRequired: '10000',
  resource: 'http://gw/v1/chat/completions',
  description: 'think',
  mimeType: 'application/json',
  payTo: '0xbeef',
  maxTimeoutSeconds: 120,
  asset: '0xUSDC',
};

function makeApp() {
  const w = fakeWallet();
  const s = fakeSigner();
  const app = createExecutor({
    resolve: staticAgentResolver({ '0': agent0 }, agent0),
    wallet: w.provider,
    signer: s.signer,
    guardrails,
    usdcAddress: '0xUSDC',
    markDead: async (id) => `0xdead-${id}`,
  });
  return { app, w, s };
}

describe('executor end-to-end', () => {
  it('GET /healthz', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST /sign-payment returns xPayment when EOA funded', async () => {
    const { app, w } = makeApp();
    w.setUsdc('0xE', 10000n);
    const res = await request(app).post('/sign-payment').send({ agentId: '0', paymentRequirements: requirements });
    expect(res.status).toBe(200);
    expect(typeof res.body.xPayment).toBe('string');
  });

  it('POST /sign-payment returns 402 insufficient_funds when EOA broke', async () => {
    const { app, w } = makeApp();
    w.setUsdc('0xE', 1n);
    const res = await request(app).post('/sign-payment').send({ agentId: '0', paymentRequirements: requirements });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: 'insufficient_funds' });
  });

  it('POST /sign-payment 400 when agentId missing', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/sign-payment').send({ paymentRequirements: requirements });
    expect(res.status).toBe(400);
  });

  it('POST /actions/buy succeeds within cap', async () => {
    const { app, w } = makeApp();
    const res = await request(app).post('/actions/buy').send({ agentId: '0', usdcIn: '1000000', minTokensOut: '0' });
    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('0xbuy');
    expect(w.calls).toContainEqual({ kind: 'buy', token: '0xTOKEN', usdcIn: 1_000_000n, minTokensOut: 0n });
  });

  it('POST /actions/buy 403 over cap', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/actions/buy').send({ agentId: '0', usdcIn: '6000000', minTokensOut: '0' });
    expect(res.status).toBe(403);
  });

  it('POST /actions/sell succeeds', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/actions/sell').send({ agentId: '0', tokensIn: '5', minUsdcOut: '0' });
    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('0xsell');
  });

  it('POST /actions/transfer sweeps smart->eoa', async () => {
    const { app, w } = makeApp();
    w.setUsdc('0xS', 3_000_000n);
    const res = await request(app).post('/actions/transfer').send({ agentId: '0', source: 'smart', to: '0xE', amount: '2000000' });
    expect(res.status).toBe(200);
    expect(await w.provider.getUsdcBalance('0xE')).toBe(2_000_000n);
  });

  it('POST /actions/transfer 403 to stranger', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/actions/transfer').send({ agentId: '0', source: 'smart', to: '0xSTRANGER', amount: '1' });
    expect(res.status).toBe(403);
  });

  it('POST /actions/fund tops up the EOA', async () => {
    const { app, w } = makeApp();
    const res = await request(app).post('/actions/fund').send({ agentId: '0', target: 'eoa', asset: 'usdc' });
    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('0xfund');
    expect(w.calls).toContainEqual({ kind: 'fund', target: 'eoa', asset: 'usdc' });
  });

  it('GET /balances/:agentId aggregates', async () => {
    const { app, w } = makeApp();
    w.setUsdc('0xE', 12345n);
    w.setMarketCap('0xTOKEN', 999n);
    const res = await request(app).get('/balances/0');
    expect(res.status).toBe(200);
    expect(res.body.eoaUsdc).toBe('12345');
    expect(res.body.marketCap).toBe('999');
  });

  it('GET /balances/:agentId 404 unknown', async () => {
    const w = fakeWallet();
    const s = fakeSigner();
    const app = createExecutor({
      resolve: staticAgentResolver({ '0': agent0 }), // no fallback
      wallet: w.provider,
      signer: s.signer,
      guardrails,
      usdcAddress: '0xUSDC',
    });
    const res = await request(app).get('/balances/99');
    expect(res.status).toBe(404);
  });

  it('POST /actions/mark-dead returns txHash for known agent', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/actions/mark-dead').send({ agentId: '0' });
    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('0xdead-0');
  });

  it('POST /actions/mark-dead 400 when agentId missing', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/actions/mark-dead').send({});
    expect(res.status).toBe(400);
  });

  it('POST /actions/mark-dead 501 when keeper not configured', async () => {
    const w = fakeWallet();
    const s = fakeSigner();
    const app = createExecutor({
      resolve: staticAgentResolver({ '0': agent0 }, agent0),
      wallet: w.provider, signer: s.signer, guardrails, usdcAddress: '0xUSDC',
    });
    const res = await request(app).post('/actions/mark-dead').send({ agentId: '0' });
    expect(res.status).toBe(501);
  });
});
