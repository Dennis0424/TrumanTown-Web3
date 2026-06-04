import { describe, it, expect } from 'vitest';
import { markDeadForAgent, type KeeperDeps } from '../src/keeper.js';
import { staticAgentResolver, type AgentConfig } from '../src/config.js';

const agent0: AgentConfig = { agentId: '0', smartAccount: '0xS', eoa: '0xE', token: '0xT' };

function deps(over: Partial<KeeperDeps> = {}): { d: KeeperDeps; calls: string[] } {
  const calls: string[] = [];
  const d: KeeperDeps = {
    resolve: staticAgentResolver({ '0': agent0 }),
    markDead: async (id) => { calls.push(id); return '0xdead'; },
    ...over,
  };
  return { d, calls };
}

describe('markDeadForAgent', () => {
  it('marks a known agent dead and returns txHash', async () => {
    const { d, calls } = deps();
    const res = await markDeadForAgent(d, '0');
    expect(res).toEqual({ ok: true, txHash: '0xdead' });
    expect(calls).toEqual(['0']);
  });

  it('404 for unknown agent (does not call markDead)', async () => {
    const { d, calls } = deps();
    const res = await markDeadForAgent(d, '99');
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(calls).toEqual([]);
  });

  it('501 when keeper signer not configured', async () => {
    const { d } = deps({ markDead: undefined });
    const res = await markDeadForAgent(d, '0');
    expect(res).toMatchObject({ ok: false, status: 501 });
  });
});
