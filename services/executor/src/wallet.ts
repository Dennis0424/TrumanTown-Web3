import type { AgentConfig } from './config.js';

/**
 * The wallet seam. Real impl (cdpWalletProvider.ts) is CDP/AgentKit + viem and is
 * only exercised by the opt-in LIVE smoke; all unit/e2e tests inject a fake.
 *
 * Conventions:
 * - addresses are hex strings; amounts are bigint atomic units (USDC 6dec, token 18dec).
 * - on-chain actions (buy/sell/transferUsdc/fund) run on the agent's SMART account
 *   (gasless via paymaster) and return a tx hash string. transferUsdc(source) lets
 *   the brain move USDC between the agent's own smart account and EOA.
 *   Exception: transferUsdc with source:'eoa' runs on the EOA via a normal ERC20 tx (no paymaster).
 */
export interface WalletProvider {
  getUsdcBalance(address: string): Promise<bigint>;
  getTokenBalance(token: string, holder: string): Promise<bigint>;
  getMarketCap(token: string): Promise<bigint>;
  buy(cfg: AgentConfig, token: string, usdcIn: bigint, minTokensOut: bigint): Promise<string>;
  sell(cfg: AgentConfig, token: string, tokensIn: bigint, minUsdcOut: bigint): Promise<string>;
  transferUsdc(cfg: AgentConfig, source: 'smart' | 'eoa', to: string, amount: bigint): Promise<string>;
  fund(cfg: AgentConfig, target: 'eoa' | 'smart', asset: 'usdc' | 'eth'): Promise<string>;
}
