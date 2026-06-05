/**
 * SP1 in-process guardrails (belt). The CDP on-chain spend-permission/policy on the
 * smart account is the suspenders — configured in cdpClient.ts (Task 9) when the
 * CDP policy API is available. Both enforce: per-tx USDC cap + contract allowlist
 * (AgentToken + USDC only).
 */
export class GuardrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardrailError';
  }
}

export interface GuardrailConfig {
  maxUsdcPerTx: bigint; // atomic USDC (6dec)
  allowedContracts: string[]; // AgentToken + USDC addresses
}

export function isAllowedContract(cfg: GuardrailConfig, contract: string): boolean {
  const c = contract.toLowerCase();
  return cfg.allowedContracts.some((a) => a.toLowerCase() === c);
}
