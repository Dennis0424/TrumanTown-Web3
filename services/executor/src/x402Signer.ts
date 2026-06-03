import type { PaymentSigner } from './paymentSigner.js';
import type { PaymentRequirements } from './x402.js';
import { X402_VERSION } from './x402.js';

export interface X402SignerConfig {
  accountFor: (eoa: string) => Promise<unknown>; // returns a viem-compatible ClientEvmSigner for the EOA
}

/**
 * v2 X-PAYMENT signer. Uses the Coinbase-official @x402/core + @x402/evm packages
 * (the SAME lineage as the self-hosted facilitator), exact EVM scheme, protocol v2 /
 * eip155:84532. No hand-rolled EIP-712 — the library owns the domain/signature, so the
 * real facilitator's /verify will accept it. The unscoped `x402` pkg was v1-only and is
 * NOT used. Final binding is LIVE-verified at Plan 5 (verify.live.ts) once CDP creds exist.
 *
 * Bound (verify-then-adapt) to the confirmed v2 exports:
 *   - `@x402/core/client`     → `x402Client` (ctor, no args) + `x402HTTPClient`
 *       · `x402HTTPClient#createPaymentPayload(paymentRequired): Promise<PaymentPayload>`
 *       · `x402HTTPClient#encodePaymentSignatureHeader(payload): Record<string,string>` (→ X-PAYMENT)
 *   - `@x402/evm/exact/client` → `registerExactEvmScheme(client, { signer })`
 *       registers the v2 `eip155:*` exact scheme (a viem account satisfies the signer).
 *
 * Shape note: the library's `PaymentRequirements` uses `amount` (not `maxAmountRequired`),
 * a required `extra` map, and `PaymentRequired.resource` is a `ResourceInfo` object — so we
 * map our local seam shape (src/x402.ts) into the library shape before calling the client.
 * Cloud-boundary `as never` casts keep typecheck clean across the two near-identical shapes;
 * this module is verified by the Plan-5 LIVE smoke, not unit tests.
 */
export function createX402Signer(cfg: X402SignerConfig): PaymentSigner {
  return {
    async sign(eoa: string, requirements: PaymentRequirements): Promise<string> {
      const signer = await cfg.accountFor(eoa);
      const { x402Client, x402HTTPClient } = await import('@x402/core/client');
      const { registerExactEvmScheme } = await import('@x402/evm/exact/client');

      const client = new x402Client();
      registerExactEvmScheme(client, { signer: signer as never });
      const http = new x402HTTPClient(client);

      // Map our seam's PaymentRequirements into the library's PaymentRequired (402) shape.
      const libRequirements = {
        scheme: requirements.scheme,
        network: requirements.network,
        asset: requirements.asset,
        amount: requirements.maxAmountRequired,
        payTo: requirements.payTo,
        maxTimeoutSeconds: requirements.maxTimeoutSeconds,
        extra: requirements.extra ?? {},
      };
      const paymentRequired = {
        x402Version: X402_VERSION,
        error: '',
        resource: {
          url: requirements.resource,
          description: requirements.description,
          mimeType: requirements.mimeType,
        },
        accepts: [libRequirements],
      } as never;

      const payload = await http.createPaymentPayload(paymentRequired);
      const headers = http.encodePaymentSignatureHeader(payload);

      // Extract the X-PAYMENT header value (case-insensitive).
      const key = Object.keys(headers).find((k) => k.toLowerCase() === 'x-payment');
      if (!key) throw new Error('x402 client did not produce an X-PAYMENT header');
      return headers[key];
    },
  };
}
