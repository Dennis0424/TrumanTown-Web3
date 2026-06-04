import { action } from '../_generated/server';
import { internal } from '../_generated/api';
import { runEconomicTickHandler } from './tick';

function e2eEnabled(): boolean {
  return process.env.TRUMANTOWN_E2E === '1';
}

/**
 * Gated public action: runs ONE economic tick deterministically (same handler the cron
 * uses). Only active when TRUMANTOWN_E2E=1, so it is inert in normal/prod runs. The two
 * acceptance scripts call this to advance the survival counter without waiting for cron.
 */
export const tickOnce = action({
  args: {},
  handler: async (ctx) => {
    if (!e2eEnabled()) return { ran: false };
    await runEconomicTickHandler(ctx);
    return { ran: true };
  },
});

/**
 * Gated public action: the default agent's current economy row (status/energy/marketCap).
 * An action (not a query) so it can `ctx.runQuery` the existing internalQueries — Convex
 * query contexts don't expose runQuery, actions do.
 */
export const getStatus = action({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    if (!e2eEnabled()) return null;
    const wa = await ctx.runQuery(internal.economy.perception.getDefaultWorldAgent, {});
    if (!wa) return null;
    return await ctx.runQuery(internal.economy.perception.getAgentEconomy, {
      worldId: wa.worldId,
      agentId: wa.agentId,
    });
  },
});
