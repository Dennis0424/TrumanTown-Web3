import { Hono } from 'hono';
import { db } from 'ponder:api';
import { agent, whisper } from 'ponder:schema';
import { eq, gte, and, desc } from 'ponder';
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

export default app;
