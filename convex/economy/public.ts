import { query } from '../_generated/server';
import { v } from 'convex/values';
import { RECOVERY_WINDOW } from './constants';

export interface AgentStatusView {
  playerId: string;
  econAgentId: string;
  status: 'alive' | 'starving' | 'dead';
  energy: number;
  starvingPeriods: number;
  recoveryWindow: number;
  diedAt: number | null;
}

/**
 * Pure selector: economy row + ai-town playerId + T -> the frontend view.
 * Kept pure (no ctx) so it is unit-testable without a Convex harness.
 */
export function selectAgentStatus(
  playerId: string,
  econ: {
    econAgentId: string;
    status: 'alive' | 'starving' | 'dead';
    energy: number;
    starvingPeriods: number;
    diedAt?: number;
  },
  recoveryWindow: number,
): AgentStatusView {
  return {
    playerId,
    econAgentId: econ.econAgentId,
    status: econ.status,
    energy: econ.energy,
    starvingPeriods: econ.starvingPeriods,
    recoveryWindow,
    diedAt: econ.diedAt ?? null,
  };
}

/**
 * SP2+ 前端只读查询：返回指定 econAgentId 的经济快照。
 * 默认查 "0"（向后兼容 SP1 单居民）。
 * 前端传 econAgentId 以支持多居民仪表盘。
 */
export const getAgentStatus = query({
  args: { econAgentId: v.optional(v.string()) },
  handler: async (ctx, { econAgentId = '0' }): Promise<AgentStatusView | null> => {
    const econ = await ctx.db
      .query('agentEconomy')
      .filter((q) => q.eq(q.field('econAgentId'), econAgentId))
      .first();
    if (!econ) return null;
    return selectAgentStatus(econ.agentId as string, econ, RECOVERY_WINDOW);
  },
});
