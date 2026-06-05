import type { Facilitator } from '../../src/facilitatorClient.js';

/**
 * In-process facilitator. `richPayers` are addresses whose verify() returns valid;
 * everyone else is treated as insufficient funds. settle() records calls.
 */
export function mockFacilitator(richPayers: string[]) {
  const settled: string[] = [];
  const rich = new Set(richPayers.map((a) => a.toLowerCase()));
  const facilitator: Facilitator = {
    async verify(payload) {
      const from = payload.payload.authorization.from.toLowerCase();
      return rich.has(from) ? { isValid: true, payer: from } : { isValid: false, invalidReason: 'insufficient_funds', payer: from };
    },
    async settle(payload) {
      settled.push(payload.payload.signature);
      return { success: true, transaction: '0xtx', payer: payload.payload.authorization.from };
    },
  };
  return { facilitator, settled };
}
