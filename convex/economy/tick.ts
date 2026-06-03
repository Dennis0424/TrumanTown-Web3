import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { createExecutorClient } from './executorClient';
import { computeEnergy, isDying, advanceSurvival, SurvivalState } from './survival';
import {
  COST_PER_THINK,
  STANDING_FLOOR,
  RECOVERY_WINDOW,
  economyEnabled,
  executorUrl,
  defaultAgentId,
  agentEoa,
} from './constants';

/**
 * The economic heartbeat. Every ECONOMIC_TICK_SECONDS it perceives the agent's
 * balances from the executor, advances the survival state machine, and caches the
 * snapshot in agentEconomy. The reactive sell/sweep lives in the payment seam; this
 * tick is the authority on the starvation counter and on declaring death. No-ops when
 * the economy is disabled, no default world/agent exists, or the executor is down.
 */
export const runEconomicTick = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!economyEnabled()) return;

    const wa = await ctx.runQuery(internal.economy.perception.getDefaultWorldAgent, {});
    if (!wa) return;

    const econAgentId = defaultAgentId();
    const eoa = agentEoa() ?? '';
    const executor = createExecutorClient(executorUrl());
    const recoveryWindow = Number(process.env.RECOVERY_WINDOW ?? RECOVERY_WINDOW);

    // Perceive + parse atomic-string amounts together: a malformed/empty balance
    // (a bad BigInt) must skip the tick fail-safe, not crash the action.
    let balances;
    let energy: number;
    let dying: boolean;
    try {
      balances = await executor.balances(econAgentId);
      const costPerThink = BigInt(process.env.COST_PER_THINK ?? COST_PER_THINK);
      const floor = BigInt(process.env.STANDING_FLOOR ?? STANDING_FLOOR);
      energy = computeEnergy(BigInt(balances.eoaUsdc), costPerThink);
      dying = isDying(energy, BigInt(balances.marketCap), floor);
    } catch (e) {
      console.error('[economy] balances unavailable or malformed, skipping tick', e);
      return;
    }

    const prevRow = await ctx.runQuery(internal.economy.perception.getAgentEconomy, {
      worldId: wa.worldId,
      agentId: wa.agentId,
    });
    const prevState: SurvivalState = prevRow
      ? {
          status: prevRow.status,
          starvingPeriods: prevRow.starvingPeriods,
          starvingSince: prevRow.starvingSince,
          diedAt: prevRow.diedAt,
        }
      : { status: 'alive', starvingPeriods: 0 };

    const now = Date.now();
    const next = advanceSurvival(prevState, dying, now, recoveryWindow);

    await ctx.runMutation(internal.economy.perception.upsertAgentEconomy, {
      worldId: wa.worldId,
      agentId: wa.agentId,
      econAgentId,
      eoa,
      eoaUsdc: balances.eoaUsdc,
      smartUsdc: balances.smartUsdc,
      tokenBalance: balances.tokenBalance,
      marketCap: balances.marketCap,
      energy,
      lastPerceivedAt: now,
      status: next.status,
      starvingPeriods: next.starvingPeriods,
      starvingSince: next.starvingSince,
      diedAt: next.diedAt,
    });

    if (next.status === 'dead' && prevState.status !== 'dead') {
      // Plan 5: a keeper turns this into AgentRegistry.markDead -> AgentDied on-chain.
      console.log(`[economy] agent ${econAgentId} DIED (starved ${next.starvingPeriods} periods)`);
    }
  },
});
