import type { AgentResolver } from './config.js';

export interface KeeperDeps {
  resolve: AgentResolver;
  /** Sends AgentRegistry.markDead(id) from the keeper wallet; undefined when not configured. */
  markDead?: (agentId: string) => Promise<string>;
}

export type MarkDeadResult =
  | { ok: true; txHash: string }
  | { ok: false; status: number; error: string };

/**
 * keeper-only: turns Plan 4's `agentEconomy.status='dead'` into an on-chain
 * AgentRegistry.markDead(id) -> AgentDied. Pure orchestration; the actual chain write
 * is injected (keeperSigner.ts). Preserves "executor is the only service that sends
 * chain txs". 404 unknown agent; 501 when no keeper wallet is configured.
 */
export async function markDeadForAgent(deps: KeeperDeps, agentId: string): Promise<MarkDeadResult> {
  const cfg = deps.resolve(agentId);
  if (!cfg) return { ok: false, status: 404, error: `unknown agent ${agentId}` };
  if (!deps.markDead) return { ok: false, status: 501, error: 'keeper not configured' };
  const txHash = await deps.markDead(agentId);
  return { ok: true, txHash };
}
