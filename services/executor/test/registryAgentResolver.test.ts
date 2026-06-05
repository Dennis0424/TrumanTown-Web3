import { describe, it, expect } from 'vitest';
import { createRegistryAgentResolver, type RegistryAgentReader } from '../src/registryAgentResolver.js';

function fakeReader(map: Record<string, { token: string; wallet: string; alive: boolean }>): RegistryAgentReader {
  return { async readAgent(id) { return map[id]; } };
}
const eoaFor = (id: string) => `0xEOA${id}`;

describe('createRegistryAgentResolver', () => {
  it('builds AgentConfig from chain (token+wallet) + derived EOA', async () => {
    const r = createRegistryAgentResolver(
      fakeReader({ '0': { token: '0xT', wallet: '0xS', alive: true } }),
      eoaFor, ['0'],
    );
    await r.refresh();
    expect(r.resolve('0')).toEqual({ agentId: '0', smartAccount: '0xS', eoa: '0xEOA0', token: '0xT' });
  });

  it('returns undefined for unregistered (forged) id', async () => {
    const r = createRegistryAgentResolver(fakeReader({ '0': { token: '0xT', wallet: '0xS', alive: true } }), eoaFor, ['0']);
    await r.refresh();
    expect(r.resolve('42')).toBeUndefined();
  });

  it('returns undefined for a dead agent', async () => {
    const r = createRegistryAgentResolver(fakeReader({ '0': { token: '0xT', wallet: '0xS', alive: false } }), eoaFor, ['0']);
    await r.refresh();
    expect(r.resolve('0')).toBeUndefined();
  });

  it('refresh keeps last-good cache on reader error', async () => {
    let fail = false;
    const r = createRegistryAgentResolver(
      { async readAgent() { if (fail) throw new Error('rpc'); return { token: '0xT', wallet: '0xS', alive: true }; } },
      eoaFor, ['0'],
    );
    await r.refresh();
    fail = true;
    await r.refresh();
    expect(r.resolve('0')!.smartAccount).toBe('0xS');
  });
});
