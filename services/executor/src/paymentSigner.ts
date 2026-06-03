import type { PaymentRequirements } from './x402.js';

/**
 * Turns PaymentRequirements into a base64 X-PAYMENT header by signing an EIP-3009
 * authorization with the agent's EOA. Real impl (x402Signer.ts) delegates to the
 * official x402 client primitive; tests inject a fake.
 */
export interface PaymentSigner {
  sign(eoa: string, requirements: PaymentRequirements): Promise<string>;
}
