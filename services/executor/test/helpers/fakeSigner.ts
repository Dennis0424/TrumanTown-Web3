import type { PaymentSigner } from '../../src/paymentSigner.js';
import type { PaymentRequirements } from '../../src/x402.js';
import { encodeXPayment, X402_VERSION } from '../../src/x402.js';

/** Deterministic in-process signer: records calls, emits a valid base64 X-PAYMENT. */
export function fakeSigner() {
  const signed: { eoa: string; requirements: PaymentRequirements }[] = [];
  const signer: PaymentSigner = {
    async sign(eoa, requirements) {
      signed.push({ eoa, requirements });
      return encodeXPayment({
        x402Version: X402_VERSION,
        payload: { signer: eoa, value: requirements.maxAmountRequired },
        accepted: { scheme: 'exact', network: requirements.network },
      });
    },
  };
  return { signer, signed };
}
