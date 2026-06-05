import type { WalletProvider } from '../../src/wallet.js';
import type { AgentConfig } from '../../src/config.js';

export interface FakeCall {
  kind: 'buy' | 'sell' | 'transfer' | 'fund';
  [k: string]: unknown;
}

/** In-process WalletProvider: in-memory balances + recorded calls. No chain, no CDP. */
export function fakeWallet() {
  const usdc = new Map<string, bigint>();
  const tokens = new Map<string, bigint>(); // key `${token}:${holder}`
  const marketCaps = new Map<string, bigint>();
  const calls: FakeCall[] = [];

  const lc = (a: string) => a.toLowerCase();
  const tkey = (t: string, h: string) => `${lc(t)}:${lc(h)}`;

  const provider: WalletProvider = {
    async getUsdcBalance(address) {
      return usdc.get(lc(address)) ?? 0n;
    },
    async getTokenBalance(token, holder) {
      return tokens.get(tkey(token, holder)) ?? 0n;
    },
    async getMarketCap(token) {
      return marketCaps.get(lc(token)) ?? 0n;
    },
    async buy(cfg, token, usdcIn, minTokensOut) {
      calls.push({ kind: 'buy', token, usdcIn, minTokensOut });
      usdc.set(lc(cfg.smartAccount), (usdc.get(lc(cfg.smartAccount)) ?? 0n) - usdcIn);
      return '0xbuy';
    },
    async sell(cfg, token, tokensIn, minUsdcOut) {
      calls.push({ kind: 'sell', token, tokensIn, minUsdcOut });
      return '0xsell';
    },
    async transferUsdc(cfg, source, to, amount) {
      calls.push({ kind: 'transfer', source, to, amount });
      const from = source === 'smart' ? cfg.smartAccount : cfg.eoa;
      usdc.set(lc(from), (usdc.get(lc(from)) ?? 0n) - amount);
      usdc.set(lc(to), (usdc.get(lc(to)) ?? 0n) + amount);
      return '0xtransfer';
    },
    async fund(cfg, target, asset) {
      calls.push({ kind: 'fund', target, asset });
      if (asset === 'usdc') {
        const a = lc(target === 'eoa' ? cfg.eoa : cfg.smartAccount);
        usdc.set(a, (usdc.get(a) ?? 0n) + 1_000_000n);
      }
      return '0xfund';
    },
  };

  return {
    provider,
    calls,
    setUsdc: (a: string, v: bigint) => usdc.set(lc(a), v),
    setToken: (t: string, h: string, v: bigint) => tokens.set(tkey(t, h), v),
    setMarketCap: (t: string, v: bigint) => marketCaps.set(lc(t), v),
  };
}
