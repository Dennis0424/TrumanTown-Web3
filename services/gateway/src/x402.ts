// x402 wire protocol v1 — local mirror of the `exact` (EIP-3009) scheme shapes.
// If the installed `x402` package exports equivalents, these may be replaced by
// `export type { PaymentRequirements, PaymentPayload } from 'x402/types'`.

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
    p.scheme !== 'exact' ||
    typeof p.network !== 'string' ||
    !p.payload ||
    typeof p.payload.signature !== 'string' ||
    !p.payload.authorization ||
    typeof p.payload.authorization.from !== 'string'
  ) {
    throw new Error('X-PAYMENT missing required exact-scheme fields');
  }
  return p;
}
