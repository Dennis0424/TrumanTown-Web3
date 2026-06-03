import { describe, it, expect } from 'vitest';
import { staticResolver, buildPaymentRequirements, type AgentPrice } from '../src/pricing.js';

const price: AgentPrice = {
  costPerThink: '10000', // 0.01 USDC (6dec)
  payTo: '0x000000000000000000000000000000000000dEaD',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  network: 'eip155:84532',
};

describe('pricing', () => {
  it('resolves a configured agent', () => {
    const resolve = staticResolver({ '0': price });
    expect(resolve('0')).toEqual(price);
  });

  it('falls back to default for unknown agent', () => {
    const resolve = staticResolver({ '0': price }, price);
    expect(resolve('7')).toEqual(price);
  });

  it('returns undefined when no match and no fallback', () => {
    const resolve = staticResolver({ '0': price });
    expect(resolve('7')).toBeUndefined();
  });

  it('builds x402 PaymentRequirements from a price + resource', () => {
    const req = buildPaymentRequirements(price, 'http://gw.local/v1/chat/completions');
    expect(req).toMatchObject({
      scheme: 'exact',
      network: 'eip155:84532',
      maxAmountRequired: '10000',
      payTo: price.payTo,
      asset: price.asset,
      resource: 'http://gw.local/v1/chat/completions',
      mimeType: 'application/json',
    });
    expect(req.maxTimeoutSeconds).toBeGreaterThan(0);
    expect(req.extra).toEqual({ name: 'USDC', version: '2' });
  });
});
