import { encodeFunctionData, getAddress } from 'viem';
import { CdpClient } from '@coinbase/cdp-sdk';
import type { AgentConfig } from './config.js';

const ERC20_WRITE_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 't', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;
const AGENT_TOKEN_WRITE_ABI = [
  { type: 'function', name: 'buy', stateMutability: 'nonpayable', inputs: [{ name: 'usdcIn', type: 'uint256' }, { name: 'minTokensOut', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'sell', stateMutability: 'nonpayable', inputs: [{ name: 'tokensIn', type: 'uint256' }, { name: 'minUsdcOut', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
] as const;

const NETWORK = 'base-sepolia' as const; // CDP faucet/user-op network name for Base Sepolia (eip155:84532)

// Deterministic CDP account names per agent. Single-sourced here so `ensureAgent` (runtime)
// and the `bootstrapAccounts` script (address discovery) cannot drift apart — the smart
// account's owner must be the SAME named EOA the x402 signer signs with.
export const agentEoaName = (agentId: string) => `trumantown-agent-${agentId}-eoa`;
export const agentSmartName = (agentId: string) => `trumantown-agent-${agentId}-smart`;

export interface CdpHooksConfig {
  apiKeyId: string;
  apiKeySecret: string;
  walletSecret: string;
  rpcUrl: string;
  agents: AgentConfig[];
  usdcAddress: string;
}

export type SmartCall = { to: string; functionName: 'buy' | 'sell' | 'approve' | 'transfer'; args: unknown[] };

export interface CdpHooks {
  sendSmartAccountCall(cfg: AgentConfig, call: SmartCall): Promise<string>;
  /**
   * Batches multiple contract calls into a SINGLE ERC-4337 user operation (one nonce, atomic).
   * Required for approve+buy: two sequential user ops race on the same account nonce (and, on
   * first use, the same counterfactual deploy) → `AA25 invalid account nonce`.
   */
  sendSmartAccountCalls(cfg: AgentConfig, calls: SmartCall[]): Promise<string>;
  faucetTo(address: string, asset: 'usdc' | 'eth'): Promise<string>;
  /** Sends USDC from an agent's EOA server account. */
  sendEoaTransfer(cfg: AgentConfig, to: string, amount: bigint): Promise<string>;
  eoaAccountFor(eoa: string): Promise<unknown>;
}

/**
 * CDP smart-wallet adapter (cloud-coupled, NOT unit-tested — verified by the Plan-5 LIVE smoke).
 *
 * Bound (verify-then-adapt) to @coinbase/cdp-sdk@1.51.0:
 *   - `new CdpClient({ apiKeyId, apiKeySecret, walletSecret })`
 *   - per agent: `cdp.evm.getOrCreateAccount({ name })` → EvmServerAccount (EOA),
 *     then `cdp.evm.getOrCreateSmartAccount({ name, owner: eoa })` → EvmSmartAccount.
 *   - gasless write: `cdp.evm.sendUserOperation({ smartAccount, network, calls: [{ to, data }] })`,
 *     calldata built with viem `encodeFunctionData`; returns `{ userOpHash }`.
 *   - faucet: `cdp.evm.requestFaucet({ address, network, token })` → `{ transactionHash }`.
 *   - eoaAccountFor: returns the EvmServerAccount itself — it implements EvmAccount
 *     (`address` + `signTypedData`/`signMessage`/`sign`), i.e. it IS a viem-compatible
 *     signer satisfying x402's ClientEvmSigner. No separate toViem conversion needed.
 *
 * Accounts are deterministically named per agentId and cached so the EOA/smart-account
 * pair is stable across hooks (the smart account's owner must be the SAME EOA the x402
 * signer signs with).
 */
export async function buildCdpHooks(c: CdpHooksConfig): Promise<CdpHooks> {
  const cdp = new CdpClient({
    apiKeyId: c.apiKeyId,
    apiKeySecret: c.apiKeySecret,
    walletSecret: c.walletSecret,
  });

  const usdc = getAddress(c.usdcAddress);

  // Cache EOA + smart account per agentId (keyed by lowercased EOA address for lookups).
  const eoaByAddress = new Map<string, unknown>();
  const smartByEoa = new Map<string, unknown>();

  async function ensureAgent(cfg: AgentConfig): Promise<{ eoa: unknown; smartAccount: unknown }> {
    const eoaKey = cfg.eoa.toLowerCase();
    let eoa = eoaByAddress.get(eoaKey);
    let smartAccount = smartByEoa.get(eoaKey);
    if (eoa && smartAccount) return { eoa, smartAccount };

    eoa = await cdp.evm.getOrCreateAccount({ name: agentEoaName(cfg.agentId) });
    smartAccount = await cdp.evm.getOrCreateSmartAccount({
      name: agentSmartName(cfg.agentId),
      owner: eoa as never,
    });
    eoaByAddress.set(eoaKey, eoa);
    smartByEoa.set(eoaKey, smartAccount);
    return { eoa, smartAccount };
  }

  function encodeCall(call: SmartCall): { to: `0x${string}`; data: `0x${string}` } {
    const to = getAddress(call.to);
    const data =
      call.functionName === 'buy' || call.functionName === 'sell'
        ? encodeFunctionData({ abi: AGENT_TOKEN_WRITE_ABI, functionName: call.functionName, args: call.args as never })
        : encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: call.functionName, args: call.args as never });
    return { to, data };
  }

  async function sendCalls(cfg: AgentConfig, calls: SmartCall[]): Promise<string> {
    const { smartAccount } = await ensureAgent(cfg);
    const res = await cdp.evm.sendUserOperation({
      smartAccount: smartAccount as never,
      network: NETWORK,
      calls: calls.map(encodeCall) as never,
    });
    return res.userOpHash;
  }

  return {
    sendSmartAccountCall(cfg, call) {
      return sendCalls(cfg, [call]);
    },
    sendSmartAccountCalls(cfg, calls) {
      return sendCalls(cfg, calls);
    },

    async faucetTo(address, asset) {
      const res = await cdp.evm.requestFaucet({
        address: getAddress(address),
        network: NETWORK,
        token: asset,
      });
      return res.transactionHash;
    },

    async sendEoaTransfer(cfg, to, amount) {
      await ensureAgent(cfg); // idempotent: ensures the EOA server account is loaded before sending
      // CDP EvmServerAccount USDC transfer (ERC20).
      // cdp.evm.sendTransaction accepts address + TransactionRequestEIP1559 object + network.
      // Returns { transactionHash: Hex }.
      const data = encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'transfer', args: [getAddress(to), amount] });
      const res = await cdp.evm.sendTransaction({
        address: getAddress(cfg.eoa),
        network: NETWORK,
        transaction: { to: usdc, data },
      });
      return res.transactionHash;
    },

    async eoaAccountFor(eoa) {
      const eoaKey = eoa.toLowerCase();
      const cached = eoaByAddress.get(eoaKey);
      if (cached) return cached;
      // Re-derive by the same deterministic name scheme used in ensureAgent. We only have
      // the address here; map it back via the agents passed at construction.
      const cfg = c.agents.find((a) => a.eoa.toLowerCase() === eoaKey);
      if (!cfg) throw new Error(`no agent config for EOA ${eoa}`);
      const { eoa: account } = await ensureAgent(cfg);
      return account;
    },
  };
}
