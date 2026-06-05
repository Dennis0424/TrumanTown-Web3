import { describe, it, expect } from 'vitest';
import { fakeWallet } from './helpers/fakeWallet.js';
import type { AgentConfig } from '../src/config.js';

const cfg: AgentConfig = {
  agentId: '0',
  smartAccount: '0xS',
  eoa: '0xE',
  token: '0xT',
};

describe('fakeWallet', () => {
  it('reads configured balances', async () => {
    const w = fakeWallet();
    w.setUsdc('0xE', 50000n);
    w.setToken('0xT', '0xS', 7n);
    w.setMarketCap('0xT', 123n);
    expect(await w.provider.getUsdcBalance('0xE')).toBe(50000n);
    expect(await w.provider.getTokenBalance('0xT', '0xS')).toBe(7n);
    expect(await w.provider.getMarketCap('0xT')).toBe(123n);
  });

  it('transferUsdc moves balance between own wallets and records the call', async () => {
    const w = fakeWallet();
    w.setUsdc('0xS', 100000n);
    const tx = await w.provider.transferUsdc(cfg, 'smart', '0xE', 40000n);
    expect(tx).toBe('0xtransfer');
    expect(await w.provider.getUsdcBalance('0xS')).toBe(60000n);
    expect(await w.provider.getUsdcBalance('0xE')).toBe(40000n);
    expect(w.calls).toContainEqual({ kind: 'transfer', source: 'smart', to: '0xE', amount: 40000n });
  });
});
