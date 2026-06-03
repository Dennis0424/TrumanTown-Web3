import { Hono } from 'hono';
import { db } from 'ponder:api';
import { agent } from 'ponder:schema';
import { eq } from 'ponder';
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

export default app;
