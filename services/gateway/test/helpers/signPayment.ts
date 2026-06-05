import { encodePayment, type PaymentPayload } from '../../src/x402.js';

/** Builds an X-PAYMENT header value for a given payer (no real chain needed; the
 *  mock facilitator decides validity by `from`). */
export function fakeXPayment(from: string, payTo: string, value = '10000'): string {
  const payload: PaymentPayload = {
    x402Version: 2,
    payload: {
      signature: '0x' + Math.random().toString(16).slice(2),
      authorization: { from, to: payTo, value, validAfter: '0', validBefore: '9999999999', nonce: '0x' + Math.random().toString(16).slice(2) },
    },
    accepted: { scheme: 'exact', network: 'eip155:84532' },
  };
  return encodePayment(payload);
}
