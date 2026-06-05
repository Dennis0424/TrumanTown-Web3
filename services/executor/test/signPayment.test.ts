import { describe, it, expect } from 'vitest';
import { signPaymentForAgent, type SignPaymentDeps } from '../src/signPayment.js';
import { staticAgentResolver, type AgentConfig } from '../src/config.js';
import { fakeWallet } from './helpers/fakeWallet.js';
import { fakeSigner } from './helpers/fakeSigner.js';
import type { PaymentRequirements } from '../src/x402.js';

const agent0: AgentConfig = { agentId: '0', smartAccount: '0xS', eoa: '0xE', token: '0xT' };
const req: PaymentRequirements = {
  scheme: 'exact',
  network: 'eip155:84532',
  maxAmountRequired: '10000', // 0.01 USDC
  resource: 'http://gw/v1/chat/completions',
  description: 'think',
  mimeType: 'application/json',
  payTo: '0xbeef',
  maxTimeoutSeconds: 120,
  asset: '0xusdc',
};

function deps(): { d: SignPaymentDeps; w: ReturnType<typeof fakeWallet>; s: ReturnType<typeof fakeSigner> } {
  const w = fakeWallet();
  const s = fakeSigner();
  return {
    d: { resolve: staticAgentResolver({ '0': agent0 }), wallet: w.provider, signer: s.signer },
    w,
    s,
  };
}

describe('signPaymentForAgent', () => {
  it('signs when EOA balance >= required', async () => {
    const { d, w, s } = deps();
    w.setUsdc('0xE', 10000n);
    const res = await signPaymentForAgent(d, '0', req);
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.xPayment).toBe('string');
    expect(s.signed).toHaveLength(1);
    expect(s.signed[0].eoa).toBe('0xE');
  });

  it('returns 402 insufficient_funds when EOA balance < required (and does NOT sign)', async () => {
    const { d, w, s } = deps();
    w.setUsdc('0xE', 9999n);
    const res = await signPaymentForAgent(d, '0', req);
    expect(res).toEqual({ ok: false, status: 402, error: 'insufficient_funds' });
    expect(s.signed).toHaveLength(0);
  });

  it('returns 404 for unknown agent', async () => {
    const { d } = deps();
    const res = await signPaymentForAgent(d, '99', req);
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it('returns 400 for invalid paymentRequirements', async () => {
    const { d } = deps();
    const res = await signPaymentForAgent(d, '0', { } as unknown as PaymentRequirements);
    expect(res).toMatchObject({ ok: false, status: 400 });
  });
});
