import { createPublicClient, http, getAddress } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { WalletProvider } from './wallet.js';
import type { AgentConfig } from './config.js';

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;
const AGENT_TOKEN_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'marketCap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

export interface CdpWalletConfig {
  rpcUrl: string;
  usdcAddress: string;
  sendSmartAccountCall: (
    cfg: AgentConfig,
    call: { to: string; functionName: 'buy' | 'sell' | 'approve' | 'transfer'; args: unknown[] },
  ) => Promise<string>;
  faucetTo: (address: string, asset: 'usdc' | 'eth') => Promise<string>;
}

export function createCdpWalletProvider(c: CdpWalletConfig): WalletProvider {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(c.rpcUrl) });
  const usdc = getAddress(c.usdcAddress);
  return {
    async getUsdcBalance(address) {
      return (await publicClient.readContract({ address: usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [getAddress(address)] })) as bigint;
    },
    async getTokenBalance(token, holder) {
      return (await publicClient.readContract({ address: getAddress(token), abi: AGENT_TOKEN_ABI, functionName: 'balanceOf', args: [getAddress(holder)] })) as bigint;
    },
    async getMarketCap(token) {
      return (await publicClient.readContract({ address: getAddress(token), abi: AGENT_TOKEN_ABI, functionName: 'marketCap', args: [] })) as bigint;
    },
    async buy(cfg, token, usdcIn, minTokensOut) {
      await c.sendSmartAccountCall(cfg, { to: c.usdcAddress, functionName: 'approve', args: [getAddress(token), usdcIn] });
      return c.sendSmartAccountCall(cfg, { to: token, functionName: 'buy', args: [usdcIn, minTokensOut] });
    },
    async sell(cfg, token, tokensIn, minUsdcOut) {
      return c.sendSmartAccountCall(cfg, { to: token, functionName: 'sell', args: [tokensIn, minUsdcOut] });
    },
    async transferUsdc(cfg, source, to, amount) {
      // SP1 only ever sweeps smart->eoa, so only the smart-account source is wired here
      // (gasless via paymaster). An 'eoa'-sourced transfer needs a CDP EOA send, added in
      // Plan 5 — reject it explicitly rather than silently routing from the smart account
      // and misrouting funds.
      if (source === 'eoa') {
        throw new Error("transferUsdc(source:'eoa') not implemented in SP1 — wire CDP EOA send in Plan 5");
      }
      return c.sendSmartAccountCall(cfg, { to: c.usdcAddress, functionName: 'transfer', args: [getAddress(to), amount] });
    },
    async fund(cfg, target, asset) {
      return c.faucetTo(target === 'eoa' ? cfg.eoa : cfg.smartAccount, asset);
    },
  };
}
