import { internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import * as embeddingsCache from '../agent/embeddingsCache';
import { interactionEnabled, ponderUrl, defaultOnchainAgentId } from './constants';
import { mapImportance } from './whispers';

type PonderWhisper = { id: string; sender: string; amount: string; text: string; timestamp: string };

export const runWhisperTick = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!interactionEnabled()) return; // gate: no-op when flag off
    const purl = ponderUrl();
    if (!purl) return;
    const onchainAgentId = defaultOnchainAgentId();

    const resident = await ctx.runQuery(internal.interaction.whispers.getResidentByEconId, { onchainAgentId });
    if (!resident) return;

    const sinceSec = await ctx.runQuery(internal.interaction.whispers.getCursor, { onchainAgentId });

    // Pull new whispers from the indexer (Ponder read API).
    let list: PonderWhisper[] = [];
    try {
      const r = await fetch(`${purl}/agents/${onchainAgentId}/whispers?since=${sinceSec}`);
      if (!r.ok) return;
      list = (await r.json()) as PonderWhisper[];
    } catch (e) {
      console.error('[interaction] whispers fetch failed', e);
      return;
    }

    let maxTs = sinceSec;
    for (const w of list) {
      const tsSec = Number(w.timestamp);
      maxTs = Math.max(maxTs, tsSec);
      const whisperId = await ctx.runMutation(internal.interaction.whispers.insertWhisperIfNew, {
        onchainAgentId,
        whisperLogId: w.id,
        sender: w.sender,
        amount: w.amount,
        text: w.text,
        ts: tsSec * 1000,
      });
      if (!whisperId) continue; // dup
      // Write a retrievable memory (embedding via the shared cache).
      const embedding = await embeddingsCache.fetch(ctx, w.text);
      const importance = mapImportance(Math.sqrt(Number(w.amount)));
      await ctx.runMutation(internal.interaction.whispers.writeWhisperMemory, {
        whisperId,
        playerId: resident.playerId as any,
        description: `A townsperson paid to tell you: "${w.text}"`,
        importance,
        embedding,
        sender: w.sender,
        amount: w.amount,
      });
    }
    if (maxTs > sinceSec) {
      await ctx.runMutation(internal.interaction.whispers.setCursor, { onchainAgentId, lastTsSec: maxTs });
    }
  },
});
