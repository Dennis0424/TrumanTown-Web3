// x402 wire protocol v2 — local mirror of the `exact` (EIP-3009) scheme shapes.
// Local types are intentional — SP1 does not depend on the x402 npm package.
// They mirror x402 v2 wire shapes for interoperability.

export const X402_VERSION = 2 as const;

export interface PaymentRequirements {
  scheme: 'exact';
  network: string; // CAIP-2, e.g. "eip155:84532"
  maxAmountRequired: string; // atomic USDC (6dec) as decimal string, e.g. "10000"
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string; // USDC contract address
  extra?: { name: string; version: string }; // EIP-712 domain for EIP-3009
}

export interface ExactEvmAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

// @x402 v2 `exact` wire payload (what @x402/core's client emits and the facilitator expects):
// scheme/network live under `accepted`, NOT at top level. We forward this object as-is to the
// facilitator, so we only assert the fields we depend on.
export interface PaymentPayload {
  x402Version: number;
  payload: { signature: string; authorization: ExactEvmAuthorization };
  resource?: { url: string; description?: string; mimeType?: string };
  accepted?: Record<string, unknown>;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

export function encodePayment(p: PaymentPayload): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64');
}

const AUTH_KEYS = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'] as const;

export function decodePayment(header: string): PaymentPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    throw new Error('X-PAYMENT is not valid base64 JSON');
  }
  const p = parsed as PaymentPayload;
  if (
    !p ||
    p.x402Version !== X402_VERSION ||
    !p.payload ||
    typeof p.payload.signature !== 'string' ||
    !p.payload.authorization ||
    AUTH_KEYS.some((k) => typeof (p.payload.authorization as unknown as Record<string, unknown>)[k] !== 'string')
  ) {
    throw new Error('X-PAYMENT missing required exact-scheme fields');
  }
  return p;
}
