import {
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequirements,
  type VerifyResponse,
  type SettleResponse,
} from './x402.js';

export interface Facilitator {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

// The @x402 facilitator expects `amount` (not our 402-challenge field `maxAmountRequired`).
// Map our local PaymentRequirements into the lib/facilitator shape for /verify and /settle.
function toFacilitatorRequirements(r: PaymentRequirements): Record<string, unknown> {
  const { maxAmountRequired, ...rest } = r;
  return { ...rest, amount: maxAmountRequired };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`facilitator ${url} responded ${r.status}`);
  return (await r.json()) as T;
}

export function httpFacilitator(baseUrl: string): Facilitator {
  const root = baseUrl.replace(/\/$/, '');
  return {
    verify: (paymentPayload, paymentRequirements) =>
      post<VerifyResponse>(`${root}/verify`, {
        x402Version: X402_VERSION,
        paymentPayload,
        paymentRequirements: toFacilitatorRequirements(paymentRequirements),
      }),
    settle: (paymentPayload, paymentRequirements) =>
      post<SettleResponse>(`${root}/settle`, {
        x402Version: X402_VERSION,
        paymentPayload,
        paymentRequirements: toFacilitatorRequirements(paymentRequirements),
      }),
  };
}
