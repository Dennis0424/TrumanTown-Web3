import { createGateway } from './gateway.js';
import { staticResolver, type AgentPrice } from './pricing.js';
import { httpFacilitator } from './facilitatorClient.js';
import { SettlementQueue, type QueueItem } from './settlementQueue.js';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
}

const price: AgentPrice = {
  costPerThink: env('DEFAULT_COST_PER_THINK', '10000'),
  payTo: env('GATEWAY_TREASURY_ADDRESS'),
  asset: env('USDC_ADDRESS', '0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  network: env('X402_NETWORK', 'base-sepolia'),
};

const facilitator = httpFacilitator(env('FACILITATOR_URL', 'http://127.0.0.1:8403'));

const queue = new SettlementQueue(facilitator, {
  maxBatch: Number(env('SETTLE_MAX_BATCH', '10')),
  maxWaitMs: Number(env('SETTLE_MAX_WAIT_MS', '60000')),
  onError: (err: unknown, item: QueueItem) =>
    console.error('[settle] failed for', item.payload.payload.signature, err),
});

const app = createGateway({
  resolve: staticResolver({ '0': price }, price),
  facilitator,
  queue,
  ollamaUpstream: env('OLLAMA_UPSTREAM', 'http://127.0.0.1:11434'),
  defaultAgentId: env('DEFAULT_AGENT_ID', '0'),
});

const port = Number(env('PORT', '8402'));
app.listen(port, () => console.log(`[gateway] x402 metered inference on :${port}`));
