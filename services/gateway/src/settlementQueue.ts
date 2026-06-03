import type { Facilitator } from './facilitatorClient.js';
import type { PaymentPayload, PaymentRequirements } from './x402.js';

export interface QueueItem {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
}

export interface SettlementQueueOptions {
  maxBatch: number;
  maxWaitMs: number;
  onError?: (err: unknown, item: QueueItem) => void;
}

/**
 * Defers on-chain settlement off the request path. Verify happens inline (instant);
 * settle is batched here — flushed when `maxBatch` accrues or `maxWaitMs` elapses,
 * whichever comes first. In-memory: a restart drops the un-settled queue, which is
 * acceptable for SP1 (the payment was already verified/"booked"; settle is the
 * on-chain catch-up). Plan 5 may persist this if needed.
 */
export class SettlementQueue {
  private items: QueueItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly facilitator: Facilitator,
    private readonly opts: SettlementQueueOptions,
  ) {}

  get size(): number {
    return this.items.length;
  }

  enqueue(item: QueueItem): void {
    this.items.push(item);
    if (this.items.length >= this.opts.maxBatch) {
      void this.flush();
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => void this.flush(), this.opts.maxWaitMs);
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.items.splice(0, this.items.length);
    await Promise.all(
      batch.map(async (it) => {
        try {
          await this.facilitator.settle(it.payload, it.requirements);
        } catch (err) {
          // A misbehaving onError must never crash the flush (and thus the gateway).
          try {
            this.opts.onError?.(err, it);
          } catch {
            // swallow — settlement errors are best-effort to report
          }
        }
      }),
    );
  }
}
