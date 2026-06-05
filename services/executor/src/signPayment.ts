import type { AgentResolver } from './config.js';
import type { WalletProvider } from './wallet.js';
import type { PaymentSigner } from './paymentSigner.js';
import type { PaymentRequirements } from './x402.js';

export interface SignPaymentDeps {
  resolve: AgentResolver;
  wallet: WalletProvider;
  signer: PaymentSigner;
}

export type SignPaymentResult =
  | { ok: true; xPayment: string }
  | { ok: false; status: number; error: string };

/**
 * The executor is a mechanical lever: it signs from the EOA iff the EOA already
 * holds enough USDC. Insufficient EOA balance => `insufficient_funds` (a fact about
 * this instant, NOT a death verdict). Topping up the EOA (sell token -> sweep) and
 * declaring starvation are Plan 4's job.
 */
export async function signPaymentForAgent(
  deps: SignPaymentDeps,
  agentId: string,
  requirements: PaymentRequirements,
): Promise<SignPaymentResult> {
  const cfg = deps.resolve(agentId);
  if (!cfg) return { ok: false, status: 404, error: `unknown agent ${agentId}` };

  if (!requirements || typeof requirements.maxAmountRequired !== 'string') {
    return { ok: false, status: 400, error: 'invalid paymentRequirements' };
  }
  let required: bigint;
  try {
    required = BigInt(requirements.maxAmountRequired);
  } catch {
    return { ok: false, status: 400, error: 'invalid maxAmountRequired' };
  }

  const balance = await deps.wallet.getUsdcBalance(cfg.eoa);
  if (balance < required) return { ok: false, status: 402, error: 'insufficient_funds' };

  const xPayment = await deps.signer.sign(cfg.eoa, requirements);
  return { ok: true, xPayment };
}
