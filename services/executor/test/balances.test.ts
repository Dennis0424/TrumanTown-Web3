import { describe, it, expect } from 'vitest';
import { readBalances } from '../src/balances.js';
import { fakeWallet } from './helpers/fakeWallet.js';
import type { AgentConfig } from '../src/config.js';

const cfg: AgentConfig = { agentId: '0', smartAccount: '0xS', eoa: '0xE', token: '0xT' };

describe('readBalances', () => {
  it('aggregates eoa/smart USDC, token balance and marketCap as decimal strings', async () => {
    const w = fakeWallet();
    w.setUsdc('0xE', 12345n);
    w.setUsdc('0xS', 67890n);
    w.setToken('0xT', '0xS', 1000n);
    w.setMarketCap('0xT', 999n);
    const b = await readBalances(w.provider, cfg);
    expect(b).toEqual({
      agentId: '0',
      eoaUsdc: '12345',
      smartUsdc: '67890',
      tokenBalance: '1000',
      marketCap: '999',
    });
  });

  it('defaults missing balances to "0"', async () => {
    const w = fakeWallet();
    const b = await readBalances(w.provider, cfg);
    expect(b).toEqual({ agentId: '0', eoaUsdc: '0', smartUsdc: '0', tokenBalance: '0', marketCap: '0' });
  });
});
