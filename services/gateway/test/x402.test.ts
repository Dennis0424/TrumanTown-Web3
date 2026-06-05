import { describe, it, expect } from 'vitest';
import { encodePayment, decodePayment, X402_VERSION, type PaymentPayload } from '../src/x402.js';

const sample: PaymentPayload = {
  x402Version: X402_VERSION,
  payload: {
    signature: '0xdeadbeef',
    authorization: {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '10000',
      validAfter: '0',
      validBefore: '99999999999',
      nonce: '0xabc',
    },
  },
  // @x402 v2: scheme/network live under `accepted`, not at top level.
  accepted: { scheme: 'exact', network: 'eip155:84532' },
};

describe('x402 payment header', () => {
  it('round-trips encode/decode', () => {
    const header = encodePayment(sample);
    expect(typeof header).toBe('string');
    expect(decodePayment(header)).toEqual(sample);
  });

  it('throws on malformed base64/json', () => {
    expect(() => decodePayment('!!!not-base64-json!!!')).toThrow();
  });

  it('throws when required fields missing', () => {
    const bad = Buffer.from(JSON.stringify({ x402Version: 1 }), 'utf8').toString('base64');
    expect(() => decodePayment(bad)).toThrow();
  });

  it('throws on wrong x402Version', () => {
    const bad = Buffer.from(
      JSON.stringify({ ...sample, x402Version: 1 }),
      'utf8',
    ).toString('base64');
    expect(() => decodePayment(bad)).toThrow();
  });

  it('throws when an authorization field is missing', () => {
    const partial = {
      ...sample,
      payload: { signature: '0xsig', authorization: { from: '0x1', to: '0x2' } },
    };
    const bad = Buffer.from(JSON.stringify(partial), 'utf8').toString('base64');
    expect(() => decodePayment(bad)).toThrow();
  });
});
