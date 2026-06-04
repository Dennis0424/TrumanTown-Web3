import { createWalletClient, http, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const REGISTRY_MARKDEAD_ABI = [
  { type: 'function', name: 'markDead', stateMutability: 'nonpayable', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [] },
] as const;

/**
 * Real keeper: signs AgentRegistry.markDead(id) with KEEPER_PRIVATE_KEY (the address set
 * as `keeper` in the Plan-1 AgentRegistry constructor). Needs Base Sepolia ETH for gas.
 * Returns a markDead(agentId) closure for ExecutorDeps, or undefined when unconfigured.
 */
export function createKeeperMarkDead(opts: {
  privateKey?: string;
  rpcUrl: string;
  registry?: string;
}): ((agentId: string) => Promise<string>) | undefined {
  if (!opts.privateKey || !opts.registry) return undefined;
  const account = privateKeyToAccount(opts.privateKey as `0x${string}`);
  const client = createWalletClient({ account, chain: baseSepolia, transport: http(opts.rpcUrl) });
  const address = getAddress(opts.registry);
  return async (agentId: string) => {
    return client.writeContract({
      address,
      abi: REGISTRY_MARKDEAD_ABI,
      functionName: 'markDead',
      args: [BigInt(agentId)],
    });
  };
}
