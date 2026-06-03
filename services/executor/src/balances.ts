import type { AgentConfig } from './config.js';
import type { WalletProvider } from './wallet.js';

export interface AgentBalances {
  agentId: string;
  eoaUsdc: string; // atomic USDC (6dec) — Plan 4 reads as `energy` source
  smartUsdc: string; // atomic USDC (6dec)
  tokenBalance: string; // atomic token (18dec) held by the smart account
  marketCap: string; // atomic USDC (6dec) — Plan 4 reads as `Standing`
}

export async function readBalances(wallet: WalletProvider, cfg: AgentConfig): Promise<AgentBalances> {
  const [eoaUsdc, smartUsdc, tokenBalance, marketCap] = await Promise.all([
    wallet.getUsdcBalance(cfg.eoa),
    wallet.getUsdcBalance(cfg.smartAccount),
    wallet.getTokenBalance(cfg.token, cfg.smartAccount),
    wallet.getMarketCap(cfg.token),
  ]);
  return {
    agentId: cfg.agentId,
    eoaUsdc: eoaUsdc.toString(),
    smartUsdc: smartUsdc.toString(),
    tokenBalance: tokenBalance.toString(),
    marketCap: marketCap.toString(),
  };
}
