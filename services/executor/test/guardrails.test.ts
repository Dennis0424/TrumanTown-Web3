import { describe, it, expect } from 'vitest';
import { GuardrailError, isAllowedContract, type GuardrailConfig } from '../src/guardrails.js';

const cfg: GuardrailConfig = {
  maxUsdcPerTx: 5_000_000n, // 5 USDC
  allowedContracts: ['0xTOKEN', '0xUSDC'],
};

describe('guardrails', () => {
  it('isAllowedContract is case-insensitive', () => {
    expect(isAllowedContract(cfg, '0xtoken')).toBe(true);
    expect(isAllowedContract(cfg, '0xUSDC')).toBe(true);
    expect(isAllowedContract(cfg, '0xOTHER')).toBe(false);
  });

  it('GuardrailError carries a name', () => {
    const e = new GuardrailError('nope');
    expect(e.name).toBe('GuardrailError');
    expect(e.message).toBe('nope');
  });
});
