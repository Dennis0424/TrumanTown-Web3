// x402 wire protocol v1 — local mirror of the `exact` (EIP-3009) scheme shapes.
// Local types are intentional — SP1 does not depend on the x402 npm package.
// They mirror x402 v1 wire shapes for interoperability.

export const X402_VERSION = 1 as const;

export interface PaymentRequirements {
  scheme: 'exact';
  network: string; // e.g. "base-sepolia"
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

export interface PaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: { signature: string; authorization: ExactEvmAuthorization };
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
    p.scheme !== 'exact' ||
    typeof p.network !== 'string' ||
    !p.payload ||
    typeof p.payload.signature !== 'string' ||
    !p.payload.authorization ||
    AUTH_KEYS.some((k) => typeof (p.payload.authorization as unknown as Record<string, unknown>)[k] !== 'string')
  ) {
    throw new Error('X-PAYMENT missing required exact-scheme fields');
  }
  return p;
}
