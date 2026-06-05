// x402 wire protocol v2 — local mirror of the shapes the executor passes through.
// Real v2 `exact`-scheme payloads are produced by the official `x402` client
// (src/x402Signer.ts); this mirror exists for typing + the in-process fakes/tests.

export const X402_VERSION = 2 as const;
export const DEFAULT_NETWORK = 'eip155:84532' as const; // CAIP-2 (Base Sepolia)

export interface PaymentRequirements {
  scheme: string; // "exact"
  network: string; // CAIP-2, e.g. "eip155:84532"
  maxAmountRequired: string; // atomic USDC (6dec) decimal string, e.g. "10000"
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string; // USDC contract address
  extra?: Record<string, unknown>; // EIP-712 domain etc.
}

// @x402 v2 `exact` payload: scheme/network live under `accepted`, not at top level.
export interface PaymentPayload {
  x402Version: number;
  payload: unknown; // exact-scheme specific (signature + authorization)
  resource?: unknown;
  accepted?: Record<string, unknown>;
}

export function encodeXPayment(p: PaymentPayload): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64');
}

export function decodeXPayment(header: string): PaymentPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    throw new Error('X-PAYMENT is not valid base64 JSON');
  }
  const p = parsed as PaymentPayload;
  if (!p || typeof p.x402Version !== 'number' || p.x402Version !== X402_VERSION || p.payload == null) {
    throw new Error('X-PAYMENT missing required fields');
  }
  return p;
}
