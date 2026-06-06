import { v } from 'convex/values';
import { internalQuery, internalMutation } from '../_generated/server';

/** Quadratic weight (sqrt of atomic USDC) → existing 0..9 memory importance scale. */
export function mapImportance(weight: number): number {
  if (weight <= 0) return 0;
  // weight = sqrt(atomicUSDC); sqrt(1e6)=1000 for 1 USDC. log10 maps 1..1e6 -> ~0..6; scale to 0..9.
  const i = Math.round((Math.log10(weight) / Math.log10(1000)) * 9);
  return Math.max(0, Math.min(9, i));
}

/** Resolve the default world's resident: engine agentId + playerId (memories key on playerId). */
export const getDefaultResident = internalQuery({
  args: {},
  handler: async (ctx) => {
    const status = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    if (!status) return null;
    const world = await ctx.db.get(status.worldId);
    if (!world) return null;
    const agent = world.agents[0];
    if (!agent) return null;
    return { worldId: status.worldId, agentId: agent.id, playerId: agent.playerId };
  },
});

export const getCursor = internalQuery({
  args: { onchainAgentId: v.string() },
  handler: async (ctx, { onchainAgentId }) => {
    const row = await ctx.db
      .query('whisperCursor')
      .withIndex('agent', (q) => q.eq('onchainAgentId', onchainAgentId))
      .first();
    return row?.lastTsSec ?? 0;
  },
});

export const setCursor = internalMutation({
  args: { onchainAgentId: v.string(), lastTsSec: v.number() },
  handler: async (ctx, { onchainAgentId, lastTsSec }) => {
    const row = await ctx.db
      .query('whisperCursor')
      .withIndex('agent', (q) => q.eq('onchainAgentId', onchainAgentId))
      .first();
    if (row) await ctx.db.patch(row._id, { lastTsSec });
    else await ctx.db.insert('whisperCursor', { onchainAgentId, lastTsSec });
  },
});

/** Insert a whisper row if its logId is new. Returns the _id (or null if dup). */
export const insertWhisperIfNew = internalMutation({
  args: {
    onchainAgentId: v.string(),
    whisperLogId: v.string(),
    sender: v.string(),
    amount: v.string(),
    text: v.string(),
    ts: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('whispers')
      .withIndex('logId', (q) => q.eq('whisperLogId', args.whisperLogId))
      .first();
    if (existing) return null;
    return await ctx.db.insert('whispers', { ...args, memoryWritten: false });
  },
});

/** Read recent whispers (within window) for a given onchain agent (for the prompt block). */
export const recentWhispers = internalQuery({
  args: { onchainAgentId: v.string(), sinceTs: v.number() },
  handler: async (ctx, { onchainAgentId, sinceTs }) => {
    return await ctx.db
      .query('whispers')
      .withIndex('agent_ts', (q) => q.eq('onchainAgentId', onchainAgentId).gte('ts', sinceTs))
      .collect();
  },
});

/** Write a whisper as a retrievable memory under the resident's playerId (importance on 0..9). */
export const writeWhisperMemory = internalMutation({
  args: {
    whisperId: v.id('whispers'),
    playerId: v.string(),
    description: v.string(),
    importance: v.number(),
    embedding: v.array(v.float64()),
    sender: v.string(),
    amount: v.string(),
  },
  handler: async (ctx, args) => {
    const embeddingId = await ctx.db.insert('memoryEmbeddings', {
      playerId: args.playerId as any,
      embedding: args.embedding,
    });
    await ctx.db.insert('memories', {
      playerId: args.playerId as any,
      embeddingId,
      importance: args.importance,
      lastAccess: Date.now(),
      description: args.description,
      data: { type: 'whisper', sender: args.sender, amount: args.amount },
    });
    await ctx.db.patch(args.whisperId, { memoryWritten: true });
  },
});
