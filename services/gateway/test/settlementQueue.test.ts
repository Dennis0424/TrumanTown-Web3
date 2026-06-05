import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettlementQueue, type QueueItem } from '../src/settlementQueue.js';
import type { Facilitator } from '../src/facilitatorClient.js';

const item = (n: number): QueueItem => ({
  payload: { x402Version: 2, payload: { signature: '0x' + n, authorization: { from: '0xa', to: '0xb', value: '1', validAfter: '0', validBefore: '9', nonce: '0x' + n } }, accepted: { scheme: 'exact', network: 'eip155:84532' } },
  requirements: { scheme: 'exact', network: 'eip155:84532', maxAmountRequired: '10000', resource: 'r', description: 'd', mimeType: 'application/json', payTo: '0xb', maxTimeoutSeconds: 120, asset: '0xusdc' },
});

function fakeFacilitator() {
  const settle = vi.fn().mockResolvedValue({ success: true, transaction: '0xtx' });
  const verify = vi.fn().mockResolvedValue({ isValid: true });
  return { facilitator: { settle, verify } as unknown as Facilitator, settle };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SettlementQueue', () => {
  it('flushes immediately when batch size reached', async () => {
    const { facilitator, settle } = fakeFacilitator();
    const q = new SettlementQueue(facilitator, { maxBatch: 3, maxWaitMs: 60000 });
    q.enqueue(item(1));
    q.enqueue(item(2));
    expect(settle).not.toHaveBeenCalled();
    q.enqueue(item(3));
    await vi.waitFor(() => expect(settle).toHaveBeenCalledTimes(3));
    expect(q.size).toBe(0);
  });

  it('flushes on timer when batch not full', async () => {
    const { facilitator, settle } = fakeFacilitator();
    const q = new SettlementQueue(facilitator, { maxBatch: 10, maxWaitMs: 60000 });
    q.enqueue(item(1));
    expect(settle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60000);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(q.size).toBe(0);
  });

  it('settle errors invoke onError and do not throw', async () => {
    const onError = vi.fn();
    const settle = vi.fn().mockRejectedValue(new Error('chain down'));
    const facilitator = { settle, verify: vi.fn() } as unknown as Facilitator;
    const q = new SettlementQueue(facilitator, { maxBatch: 1, maxWaitMs: 60000, onError });
    q.enqueue(item(1));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(q.size).toBe(0);
  });

  it('does not crash the flush when onError itself throws', async () => {
    const settle = vi.fn().mockRejectedValue(new Error('chain down'));
    const onError = vi.fn(() => {
      throw new Error('logger exploded');
    });
    const facilitator = { settle, verify: vi.fn() } as unknown as Facilitator;
    // maxBatch: 5 — enqueue only arms a timer, so the item is still in the queue.
    // The explicit await q.flush() below is the one that exercises settle + throwing onError.
    const q = new SettlementQueue(facilitator, { maxBatch: 5, maxWaitMs: 60000, onError });
    q.enqueue(item(1));
    // flush must resolve cleanly despite onError throwing
    await expect(q.flush()).resolves.toBeUndefined();
    expect(q.size).toBe(0);
  });
});
