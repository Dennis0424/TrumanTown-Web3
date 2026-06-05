import type { AgentConfig } from './config.js';
import type { WalletProvider } from './wallet.js';
import { GuardrailError, isAllowedContract, type GuardrailConfig } from './guardrails.js';

export interface ActionsDeps {
  wallet: WalletProvider;
  guardrails: GuardrailConfig;
  usdcAddress: string;
}

export async function buyAction(
  deps: ActionsDeps,
  cfg: AgentConfig,
  args: { token?: string; usdcIn: bigint; minTokensOut: bigint },
): Promise<{ txHash: string }> {
  const token = args.token ?? cfg.token;
  if (!isAllowedContract(deps.guardrails, token)) {
    throw new GuardrailError(`contract ${token} not in allowlist`);
  }
  if (args.usdcIn > deps.guardrails.maxUsdcPerTx) {
    throw new GuardrailError(`usdcIn ${args.usdcIn} exceeds per-tx cap ${deps.guardrails.maxUsdcPerTx}`);
  }
  const txHash = await deps.wallet.buy(cfg, token, args.usdcIn, args.minTokensOut);
  return { txHash };
}

export async function sellAction(
  deps: ActionsDeps,
  cfg: AgentConfig,
  args: { token?: string; tokensIn: bigint; minUsdcOut: bigint },
): Promise<{ txHash: string }> {
  const token = args.token ?? cfg.token;
  if (!isAllowedContract(deps.guardrails, token)) {
    throw new GuardrailError(`contract ${token} not in allowlist`);
  }
  const txHash = await deps.wallet.sell(cfg, token, args.tokensIn, args.minUsdcOut);
  return { txHash };
}

export async function transferAction(
  deps: ActionsDeps,
  cfg: AgentConfig,
  args: { source: 'smart' | 'eoa'; to: string; amount: bigint },
): Promise<{ txHash: string }> {
  // SP1: USDC may only move between the agent's own two wallets.
  const own = [cfg.eoa.toLowerCase(), cfg.smartAccount.toLowerCase()];
  if (!own.includes(args.to.toLowerCase())) {
    throw new GuardrailError(`transfer recipient ${args.to} is not the agent's own wallet`);
  }
  if (args.amount > deps.guardrails.maxUsdcPerTx) {
    throw new GuardrailError(`amount ${args.amount} exceeds per-tx cap ${deps.guardrails.maxUsdcPerTx}`);
  }
  const txHash = await deps.wallet.transferUsdc(cfg, args.source, args.to, args.amount);
  return { txHash };
}
