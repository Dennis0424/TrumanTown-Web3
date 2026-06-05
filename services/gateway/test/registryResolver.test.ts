import { describe, it, expect } from 'vitest';
import { createRegistryResolver, type RegistryReader, type RegistryAgent } from '../src/registryResolver.js';

const base = {
  payTo: '0x000000000000000000000000000000000000beef',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  network: 'eip155:84532',
};

function fakeReader(map: Record<string, RegistryAgent>): RegistryReader {
  return { async readAgent(id) { return map[id]; } };
}

describe('createRegistryResolver', () => {
  it('prices a registered, alive agent from on-chain costPerThink (no static map)', async () => {
    const r = createRegistryResolver(fakeReader({ '0': { costPerThink: 10000n, alive: true } }), base, ['0']);
    await r.refresh();
    expect(r.resolve('0')).toEqual({ costPerThink: '10000', ...base });
  });

  it('returns undefined for an unregistered (forged) agentId — no cheaper/free inference', async () => {
    const r = createRegistryResolver(fakeReader({ '0': { costPerThink: 10000n, alive: true } }), base, ['0']);
    await r.refresh();
    expect(r.resolve('999')).toBeUndefined();
  });

  it('returns undefined for a dead agent', async () => {
    const r = createRegistryResolver(fakeReader({ '0': { costPerThink: 10000n, alive: false } }), base, ['0']);
    await r.refresh();
    expect(r.resolve('0')).toBeUndefined();
  });

  it('refresh re-reads chain (price/aliveness can change)', async () => {
    const map: Record<string, RegistryAgent> = { '0': { costPerThink: 10000n, alive: true } };
    const r = createRegistryResolver({ async readAgent(id) { return map[id]; } }, base, ['0']);
    await r.refresh();
    expect(r.resolve('0')!.costPerThink).toBe('10000');
    map['0'] = { costPerThink: 20000n, alive: true };
    await r.refresh();
    expect(r.resolve('0')!.costPerThink).toBe('20000');
  });

  it('tolerates a reader throwing on one id (keeps last good cache)', async () => {
    let fail = false;
    const r = createRegistryResolver(
      { async readAgent(id) { if (fail) throw new Error('rpc down'); return { costPerThink: 10000n, alive: true }; } },
      base, ['0'],
    );
    await r.refresh();
    fail = true;
    await r.refresh(); // must not throw
    expect(r.resolve('0')!.costPerThink).toBe('10000');
  });
});
