import { describe, it, expect } from 'vitest';
import { staticAgentResolver, type AgentConfig } from '../src/config.js';

const agent0: AgentConfig = {
  agentId: '0',
  smartAccount: '0x1111111111111111111111111111111111111111',
  eoa: '0x2222222222222222222222222222222222222222',
  token: '0x3333333333333333333333333333333333333333',
};

describe('staticAgentResolver', () => {
  it('resolves a configured agent', () => {
    const resolve = staticAgentResolver({ '0': agent0 });
    expect(resolve('0')).toEqual(agent0);
  });

  it('falls back to default for unknown agent', () => {
    const resolve = staticAgentResolver({ '0': agent0 }, agent0);
    expect(resolve('7')).toEqual(agent0);
  });

  it('returns undefined when no match and no fallback', () => {
    const resolve = staticAgentResolver({ '0': agent0 });
    expect(resolve('7')).toBeUndefined();
  });

  it('returns undefined for undefined/empty agentId without fallback', () => {
    const resolve = staticAgentResolver({ '0': agent0 });
    expect(resolve(undefined as unknown as string)).toBeUndefined();
  });
});
