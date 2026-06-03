import { ponder } from 'ponder:registry';
import { agent, tokenIndex, trade } from 'ponder:schema';
import { getAddress } from 'viem';
import { AgentRegistryAbi } from '../abis/AgentRegistry';
import { AgentTokenAbi } from '../abis/AgentToken';

// Registry address resolved once from env (context.contracts.AgentRegistry.address
// is typed as the configured value, but for factory-registered contracts address is a
// Factory descriptor, so we use the env var for the registry read below).
const REGISTRY_ADDRESS = getAddress(
  process.env.REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000',
);

/**
 * Reads on-chain life params + latest curve snapshot for an agent.
 * Uses context.client.readContract (Ponder 0.11 ReadonlyClient viem action).
 */
async function readAgentState(
  context: { client: { readContract: Function } },
  agentId: bigint,
  token: `0x${string}`,
  wallet: `0x${string}`,
) {
  const [a, marketCap, pricePerToken, usdcReserve, tokenBalance] = await Promise.all([
    context.client.readContract({
      abi: AgentRegistryAbi,
      address: REGISTRY_ADDRESS as `0x${string}`,
      functionName: 'agents',
      args: [agentId],
    }),
    context.client.readContract({
      abi: AgentTokenAbi,
      address: token,
      functionName: 'marketCap',
      args: [],
    }),
    context.client.readContract({
      abi: AgentTokenAbi,
      address: token,
      functionName: 'pricePerToken',
      args: [],
    }),
    context.client.readContract({
      abi: AgentTokenAbi,
      address: token,
      functionName: 'usdcReserve',
      args: [],
    }),
    context.client.readContract({
      abi: AgentTokenAbi,
      address: token,
      functionName: 'balanceOf',
      args: [wallet],
    }),
  ]);

  // agents() returns a tuple: (token, wallet, costPerThink, floor, recoveryWindow, alive)
  const row = a as readonly [
    `0x${string}`,
    `0x${string}`,
    bigint,
    bigint,
    bigint,
    boolean,
  ];

  return {
    costPerThink: row[2],
    floor: row[3],
    recoveryWindow: row[4],
    alive: row[5],
    marketCap: marketCap as bigint,
    pricePerToken: pricePerToken as bigint,
    usdcReserve: usdcReserve as bigint,
    tokenBalance: tokenBalance as bigint,
  };
}

// ---------------------------------------------------------------------------
// AgentRegistry:AgentRegistered
// Creates (or upserts) the agent row + populates the reverse-lookup tokenIndex.
// ---------------------------------------------------------------------------
ponder.on('AgentRegistry:AgentRegistered', async ({ event, context }) => {
  const id = event.args.agentId.toString();
  const token = event.args.token as `0x${string}`;
  const wallet = event.args.wallet as `0x${string}`;
  const s = await readAgentState(context, event.args.agentId, token, wallet);

  // Ponder 0.11: onConflictDoUpdate receives Partial<updateModel> (no PK) or a fn.
  await context.db
    .insert(agent)
    .values({
      id,
      token,
      wallet,
      costPerThink: s.costPerThink,
      floor: s.floor,
      recoveryWindow: s.recoveryWindow,
      alive: s.alive,
      marketCap: s.marketCap,
      pricePerToken: s.pricePerToken,
      usdcReserve: s.usdcReserve,
      tokenBalance: s.tokenBalance,
      spawnedAt: event.block.timestamp,
      diedAt: null,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      token,
      wallet,
      costPerThink: s.costPerThink,
      floor: s.floor,
      recoveryWindow: s.recoveryWindow,
      alive: s.alive,
      marketCap: s.marketCap,
      pricePerToken: s.pricePerToken,
      usdcReserve: s.usdcReserve,
      tokenBalance: s.tokenBalance,
      updatedAt: event.block.timestamp,
    });

  await context.db
    .insert(tokenIndex)
    .values({ id: token, agentId: id })
    .onConflictDoNothing();
});

// ---------------------------------------------------------------------------
// AgentRegistry:AgentDied
// Marks the agent dead and zeroes the market cap.
// ---------------------------------------------------------------------------
ponder.on('AgentRegistry:AgentDied', async ({ event, context }) => {
  const id = event.args.agentId.toString();
  await context.db
    .update(agent, { id })
    .set({
      alive: false,
      diedAt: event.block.timestamp,
      marketCap: 0n,
      updatedAt: event.block.timestamp,
    });
});

// ---------------------------------------------------------------------------
// Trade helpers (Bought / Sold on every AgentToken instance)
// ---------------------------------------------------------------------------
async function onTrade(
  side: 'buy' | 'sell',
  event: {
    args: Record<string, unknown>;
    log: { address: string; logIndex: number };
    transaction: { hash: string };
    block: { number: bigint; timestamp: bigint };
  },
  context: { db: typeof import('ponder:registry') extends never ? never : any; client: { readContract: Function } },
) {
  const token = event.log.address as `0x${string}`;
  const idx = await context.db.find(tokenIndex, { id: token });

  const usdc =
    side === 'buy'
      ? (event.args.usdcIn as bigint)
      : (event.args.usdcOut as bigint);
  const tokens =
    side === 'buy'
      ? (event.args.tokensOut as bigint)
      : (event.args.tokensIn as bigint);
  const actor = (
    side === 'buy' ? event.args.buyer : event.args.seller
  ) as `0x${string}`;

  // Append trade record.
  await context.db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agentId: idx?.agentId ?? null,
    token,
    side,
    actor,
    usdc,
    tokens,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
  });

  // Update agent curve snapshot.
  if (idx) {
    const [marketCap, pricePerToken, usdcReserve] = await Promise.all([
      context.client.readContract({
        abi: AgentTokenAbi,
        address: token,
        functionName: 'marketCap',
        args: [],
      }),
      context.client.readContract({
        abi: AgentTokenAbi,
        address: token,
        functionName: 'pricePerToken',
        args: [],
      }),
      context.client.readContract({
        abi: AgentTokenAbi,
        address: token,
        functionName: 'usdcReserve',
        args: [],
      }),
    ]);

    const row = await context.db.find(agent, { id: idx.agentId });
    const wallet = (row?.wallet ?? actor) as `0x${string}`;

    const tokenBalance = await context.client.readContract({
      abi: AgentTokenAbi,
      address: token,
      functionName: 'balanceOf',
      args: [wallet],
    });

    await context.db.update(agent, { id: idx.agentId }).set({
      marketCap: marketCap as bigint,
      pricePerToken: pricePerToken as bigint,
      usdcReserve: usdcReserve as bigint,
      tokenBalance: tokenBalance as bigint,
      updatedAt: event.block.timestamp,
    });
  }
}

ponder.on('AgentToken:Bought', async ({ event, context }) => {
  await onTrade('buy', event as any, context as any);
});

ponder.on('AgentToken:Sold', async ({ event, context }) => {
  await onTrade('sell', event as any, context as any);
});
