import type { PaymentRequirements } from './x402.js';

export interface AgentPrice {
  costPerThink: string; // atomic USDC (6dec) decimal string
  payTo: string; // gateway treasury
  asset: string; // USDC address
  network: string; // CAIP-2 "eip155:84532"
}

export type PriceResolver = (agentId: string) => AgentPrice | undefined;

/**
 * SP1 resolver: a static config map (single agent). Plan 5 may swap this for a
 * Ponder/registry-backed resolver without changing the middleware interface.
 */
export function staticResolver(
  config: Record<string, AgentPrice>,
  fallback?: AgentPrice,
): PriceResolver {
  return (agentId: string) => config[agentId] ?? fallback;
}

export function buildPaymentRequirements(
  price: AgentPrice,
  resource: string,
): PaymentRequirements {
  return {
    scheme: 'exact',
    network: price.network,
    maxAmountRequired: price.costPerThink,
    resource,
    description: 'TrumanTown metered inference: 1 think',
    mimeType: 'application/json',
    payTo: price.payTo,
    maxTimeoutSeconds: 120,
    asset: price.asset,
    extra: { name: 'USDC', version: '2' },
  };
}
