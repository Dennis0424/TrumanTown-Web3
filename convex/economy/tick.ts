import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { createExecutorClient } from './executorClient';
import { computeEnergy, isDying, advanceSurvival, SurvivalState } from './survival';
import {
  COST_PER_THINK,
  STANDING_FLOOR,
  RECOVERY_WINDOW,
  DEFAULT_ECON_AGENT_ID,
  economyEnabled,
  executorUrl,
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

    const econAgentId = process.env.DEFAULT_AGENT_ID ?? DEFAULT_ECON_AGENT_ID;
    const eoa = process.env.AGENT_0_EOA ?? '';
    const executor = createExecutorClient(executorUrl());

    let balances;
    try {
      balances = await executor.balances(econAgentId);
    } catch (e) {
      console.error('[economy] balances unavailable, skipping tick', e);
      return;
    }

    const costPerThink = BigInt(process.env.COST_PER_THINK ?? COST_PER_THINK);
    const floor = BigInt(process.env.STANDING_FLOOR ?? STANDING_FLOOR);
    const recoveryWindow = Number(process.env.RECOVERY_WINDOW ?? RECOVERY_WINDOW);

    const energy = computeEnergy(BigInt(balances.eoaUsdc), costPerThink);
    const dying = isDying(energy, BigInt(balances.marketCap), floor);

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
