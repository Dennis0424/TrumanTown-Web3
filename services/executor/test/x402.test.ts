import { describe, it, expect } from 'vitest';
import {
  encodeXPayment,
  decodeXPayment,
  X402_VERSION,
  DEFAULT_NETWORK,
  type PaymentPayload,
} from '../src/x402.js';

const sample: PaymentPayload = {
  x402Version: X402_VERSION,
  payload: { signature: '0xdeadbeef', authorization: { from: '0xa', to: '0xb', value: '10000' } },
  // @x402 v2: scheme/network live under `accepted`, not at top level.
  accepted: { scheme: 'exact', network: DEFAULT_NETWORK },
};

describe('x402 v2 payment header', () => {
  it('exports v2 constants', () => {
    expect(X402_VERSION).toBe(2);
    expect(DEFAULT_NETWORK).toBe('eip155:84532');
  });

  it('round-trips encode/decode', () => {
    const header = encodeXPayment(sample);
    expect(typeof header).toBe('string');
    expect(decodeXPayment(header)).toEqual(sample);
  });

  it('throws on malformed base64/json', () => {
    expect(() => decodeXPayment('!!!not-base64-json!!!')).toThrow();
  });

  it('throws when required fields missing', () => {
    const bad = Buffer.from(JSON.stringify({ x402Version: 2 }), 'utf8').toString('base64');
    expect(() => decodeXPayment(bad)).toThrow();
  });

  it('throws on a well-formed payload with the wrong x402Version', () => {
    const bad = Buffer.from(
      JSON.stringify({ x402Version: 1, scheme: 'exact', network: 'eip155:84532', payload: {} }),
      'utf8',
    ).toString('base64');
    expect(() => decodeXPayment(bad)).toThrow();
  });
});
