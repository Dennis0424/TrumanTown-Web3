import { describe, it, expect } from 'vitest';
import { buyAction, sellAction, transferAction, type ActionsDeps } from '../src/actions.js';
import { GuardrailError, type GuardrailConfig } from '../src/guardrails.js';
import { fakeWallet } from './helpers/fakeWallet.js';
import type { AgentConfig } from '../src/config.js';

const cfg: AgentConfig = { agentId: '0', smartAccount: '0xS', eoa: '0xE', token: '0xTOKEN' };
const guardrails: GuardrailConfig = { maxUsdcPerTx: 5_000_000n, allowedContracts: ['0xTOKEN', '0xUSDC'] };

function deps(): { d: ActionsDeps; w: ReturnType<typeof fakeWallet> } {
  const w = fakeWallet();
  return { d: { wallet: w.provider, guardrails, usdcAddress: '0xUSDC' }, w };
}

describe('buyAction', () => {
  it('buys own token within cap and records the call', async () => {
    const { d, w } = deps();
    const out = await buyAction(d, cfg, { usdcIn: 1_000_000n, minTokensOut: 0n });
    expect(out.txHash).toBe('0xbuy');
    expect(w.calls).toContainEqual({ kind: 'buy', token: '0xTOKEN', usdcIn: 1_000_000n, minTokensOut: 0n });
  });

  it('rejects buy over per-tx cap', async () => {
    const { d } = deps();
    await expect(buyAction(d, cfg, { usdcIn: 6_000_000n, minTokensOut: 0n })).rejects.toBeInstanceOf(GuardrailError);
  });

  it('rejects buy of a non-allowlisted token', async () => {
    const { d } = deps();
    await expect(
      buyAction(d, cfg, { token: '0xEVIL', usdcIn: 1_000_000n, minTokensOut: 0n }),
    ).rejects.toBeInstanceOf(GuardrailError);
  });
});

describe('sellAction', () => {
  it('sells own token and records the call', async () => {
    const { d, w } = deps();
    const out = await sellAction(d, cfg, { tokensIn: 5n, minUsdcOut: 0n });
    expect(out.txHash).toBe('0xsell');
    expect(w.calls).toContainEqual({ kind: 'sell', token: '0xTOKEN', tokensIn: 5n, minUsdcOut: 0n });
  });
});

describe('transferAction', () => {
  it('sweeps USDC from smart to own EOA within cap', async () => {
    const { d, w } = deps();
    w.setUsdc('0xS', 3_000_000n);
    const out = await transferAction(d, cfg, { source: 'smart', to: '0xE', amount: 2_000_000n });
    expect(out.txHash).toBe('0xtransfer');
    expect(await w.provider.getUsdcBalance('0xE')).toBe(2_000_000n);
  });

  it('rejects transfer to a non-own address', async () => {
    const { d } = deps();
    await expect(
      transferAction(d, cfg, { source: 'smart', to: '0xSTRANGER', amount: 1n }),
    ).rejects.toBeInstanceOf(GuardrailError);
  });

  it('rejects transfer over per-tx cap', async () => {
    const { d } = deps();
    await expect(
      transferAction(d, cfg, { source: 'smart', to: '0xE', amount: 6_000_000n }),
    ).rejects.toBeInstanceOf(GuardrailError);
  });
});
