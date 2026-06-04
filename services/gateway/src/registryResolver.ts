import { createPublicClient, http, getAddress } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { AgentPrice, PriceResolver } from './pricing.js';

export interface RegistryAgent {
  costPerThink: bigint;
  alive: boolean;
}

export interface RegistryReader {
  readAgent(agentId: string): Promise<RegistryAgent | undefined>;
}

export interface RegistryResolver {
  resolve: PriceResolver; // synchronous (Plan 2 frozen middleware contract)
  refresh(): Promise<void>;
  start(intervalMs: number): void;
  stop(): void;
}

/**
 * Registry-backed pricing. Pricing is authoritative from on-chain AgentRegistry —
 * there is NO permissive fallback, so a forged X-Agent-Id that isn't a registered,
 * alive agent resolves to `undefined` (gateway then 402/500; no cheaper/free inference).
 * The frozen PriceResolver is synchronous, so chain reads populate an in-memory cache
 * (prefetch on boot + periodic refresh); resolve() hits the cache.
 */
export function createRegistryResolver(
  reader: RegistryReader,
  base: Omit<AgentPrice, 'costPerThink'>,
  agentIds: string[],
): RegistryResolver {
  const cache = new Map<string, AgentPrice>();
  let timer: ReturnType<typeof setInterval> | null = null;

  let refreshing = false;
  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      for (const id of agentIds) {
        try {
          const a = await reader.readAgent(id);
          if (a && a.alive) cache.set(id, { costPerThink: a.costPerThink.toString(), ...base });
          else cache.delete(id);
        } catch {
          // keep last-good cache entry on transient RPC failure
        }
      }
    } finally {
      refreshing = false;
    }
  }

  return {
    resolve: (agentId: string) => cache.get(agentId),
    refresh,
    start(intervalMs: number) {
      if (timer === null) timer = setInterval(() => void refresh(), intervalMs);
    },
    stop() {
      if (timer !== null) { clearInterval(timer); timer = null; }
    },
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

/** Real reader: viem read of AgentRegistry.agents(id) on Base Sepolia. */
export function viemRegistryReader(rpcUrl: string, registry: string): RegistryReader {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const address = getAddress(registry);
  return {
    async readAgent(agentId) {
      const a = (await client.readContract({
        address, abi: REGISTRY_ABI, functionName: 'agents', args: [BigInt(agentId)],
      })) as readonly [string, string, bigint, bigint, bigint, boolean];
      return { costPerThink: a[2], alive: a[5] };
    },
  };
}
