export interface AgentConfig {
  agentId: string;
  smartAccount: string; // CDP smart account = AgentRegistry.wallet (identity + trading + guardrails)
  eoa: string; // CDP EOA server account = x402 payer/signer (holds spendable USDC)
  token: string; // the agent's own AgentToken address
}

export type AgentResolver = (agentId: string) => AgentConfig | undefined;

/**
 * SP1 resolver: a static config map (single agent). Plan 5 swaps this for a
 * Registry/Ponder-backed resolver (read AgentRegistry.agents(id).wallet + token)
 * without changing the resolver interface.
 */
export function staticAgentResolver(
  config: Record<string, AgentConfig>,
  fallback?: AgentConfig,
): AgentResolver {
  return (agentId: string) => (agentId !== undefined ? config[agentId] : undefined) ?? fallback;
}
