import { createPublicClient, http, getAddress } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { AgentConfig, AgentResolver } from './config.js';

export interface RegistryAgentRow {
  token: string;
  wallet: string; // CDP smart account
  alive: boolean;
}

export interface RegistryAgentReader {
  readAgent(agentId: string): Promise<RegistryAgentRow | undefined>;
}

export interface RegistryAgentResolver {
  resolve: AgentResolver; // synchronous (Plan 3 frozen)
  refresh(): Promise<void>;
  start(intervalMs: number): void;
  stop(): void;
}

/**
 * Registry-backed agent resolution. token + wallet(=smartAccount) come from on-chain
 * AgentRegistry.agents(id); the EOA (x402 payer, not stored on-chain) is derived from CDP
 * via `eoaFor`. No permissive fallback — forged/dead ids resolve to undefined (404).
 * Sync resolve hits an in-memory cache (prefetch + periodic refresh, with an in-flight
 * guard so overlapping refreshes can't re-insert a just-removed dead agent).
 */
export function createRegistryAgentResolver(
  reader: RegistryAgentReader,
  eoaFor: (agentId: string) => string,
  agentIds: string[],
): RegistryAgentResolver {
  const cache = new Map<string, AgentConfig>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let refreshing = false;

  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      for (const id of agentIds) {
        try {
          const a = await reader.readAgent(id);
          if (a && a.alive) cache.set(id, { agentId: id, smartAccount: a.wallet, eoa: eoaFor(id), token: a.token });
          else cache.delete(id);
        } catch {
          // keep last-good cache on transient RPC failure
        }
      }
    } finally {
      refreshing = false;
    }
  }

  return {
    resolve: (agentId: string) => cache.get(agentId),
    refresh,
    start(intervalMs) { if (timer === null) timer = setInterval(() => void refresh(), intervalMs); },
    stop() { if (timer !== null) { clearInterval(timer); timer = null; } },
  };
}

const REGISTRY_ABI = [
  { type: 'function', name: 'agents', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [
    { name: 'token', type: 'address' },
    { name: 'wallet', type: 'address' },
    { name: 'costPerThink', type: 'uint256' },
    { name: 'floor', type: 'uint256' },
    { name: 'recoveryWindow', type: 'uint256' },
    { name: 'alive', type: 'bool' },
  ] },
] as const;

export function viemRegistryAgentReader(rpcUrl: string, registry: string): RegistryAgentReader {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const address = getAddress(registry);
  return {
    async readAgent(agentId) {
      const a = (await client.readContract({
        address, abi: REGISTRY_ABI, functionName: 'agents', args: [BigInt(agentId)],
      })) as readonly [string, string, bigint, bigint, bigint, boolean];
      return { token: a[0], wallet: a[1], alive: a[5] };
    },
  };
}
