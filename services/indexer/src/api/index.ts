import { Hono } from 'hono';
import { db } from 'ponder:api';
import { agent, whisper, alliance } from 'ponder:schema';
import { eq, gte, and, desc, or } from 'ponder';
import { buildAgentAggregate, type AgentRow } from '../aggregate.js';

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));

// Per-agent aggregate (Convex perception consumes this).
app.get('/agents/:id', async (c) => {
  const rows = (await db.select().from(agent).where(eq(agent.id, c.req.param('id'))).limit(1)) as AgentRow[];
  if (!rows[0]) return c.json({ error: 'not found' }, 404);
  return c.json(buildAgentAggregate(rows[0]));
});

// All agents (frontend list; SP2+).
app.get('/agents', async (c) => {
  const rows = (await db.select().from(agent)) as AgentRow[];
  return c.json(rows.map(buildAgentAggregate));
});

// SP3: whispers for an agent (newest first), optional ?since=<unix-seconds>.
app.get('/agents/:id/whispers', async (c) => {
  const id = c.req.param('id');
  const since = BigInt(c.req.query('since') ?? '0');
  const rows = await db
    .select()
    .from(whisper)
    .where(and(eq(whisper.agentId, id), gte(whisper.timestamp, since)))
    .orderBy(desc(whisper.timestamp))
    .limit(100);
  return c.json(rows.map((r) => ({
    id: r.id, sender: r.sender, amount: r.amount.toString(),
    text: r.text, timestamp: r.timestamp.toString(),
  })));
});

// SP4: 博弈感知快照 — 返回其他所有居民的最新状态 + 与当前居民的结盟关系
app.get('/agents/:id/rivals', async (c) => {
  const id = c.req.param('id');

  // 所有居民
  const allAgents = (await db.select().from(agent)) as AgentRow[];

  // 当前居民的结盟事件（涉及自己的）
  const allianceRows = await db
    .select()
    .from(alliance)
    .where(or(eq(alliance.agentA, id), eq(alliance.agentB, id)))
    .orderBy(desc(alliance.timestamp));

  // 对每个对手计算当前是否结盟（最新事件为 'formed' = 结盟）
  const allianceByPeer: Record<string, boolean> = {};
  for (const row of allianceRows) {
    const peer = row.agentA === id ? row.agentB : row.agentA;
    if (allianceByPeer[peer] === undefined) {
      allianceByPeer[peer] = row.eventType === 'formed';
    }
  }

  const rivals = allAgents
    .filter((a) => a.id !== id)
    .map((a) => ({
      agentId: a.id,
      marketCap: a.marketCap.toString(),
      pricePerToken: a.pricePerToken.toString(),
      alive: a.alive,
      allied: allianceByPeer[a.id] ?? false,
    }));

  return c.json(rivals);
});

export default app;
