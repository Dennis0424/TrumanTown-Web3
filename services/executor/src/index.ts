import './loadEnv.js'; // load .env + route fetch through proxy (must be first)
import { createExecutor } from './executor.js';
import { staticAgentResolver, type AgentConfig } from './config.js';
import { createCdpWalletProvider } from './cdpWalletProvider.js';
import { createX402Signer } from './x402Signer.js';
import { buildCdpHooks } from './cdpClient.js';
import { createRegistryAgentResolver, viemRegistryAgentReader } from './registryAgentResolver.js';
import { createKeeperMarkDead } from './keeperSigner.js';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
}

async function main() {
  const usdcAddress = env('USDC_ADDRESS', '0x036CbD53842c5426634e7929541eC2318f3dCF7e');
  const agent0: AgentConfig = {
    agentId: '0',
    smartAccount: env('AGENT_0_SMART_ACCOUNT'),
    eoa: env('AGENT_0_EOA'),
    token: env('AGENT_0_TOKEN'),
  };

  const cdp = await buildCdpHooks({
    apiKeyId: env('CDP_API_KEY_ID'),
    apiKeySecret: env('CDP_API_KEY_SECRET'),
    walletSecret: env('CDP_WALLET_SECRET'),
    rpcUrl: env('RPC_URL_BASE_SEPOLIA', 'https://sepolia.base.org'),
    agents: [agent0],
    usdcAddress,
  });

  const wallet = createCdpWalletProvider({
    rpcUrl: env('RPC_URL_BASE_SEPOLIA', 'https://sepolia.base.org'),
    usdcAddress,
    sendSmartAccountCall: cdp.sendSmartAccountCall,
    sendSmartAccountCalls: cdp.sendSmartAccountCalls,
    faucetTo: cdp.faucetTo,
    sendEoaTransfer: cdp.sendEoaTransfer,
  });

  const signer = createX402Signer({ accountFor: cdp.eoaAccountFor });

  const guardrails = {
    maxUsdcPerTx: BigInt(env('MAX_USDC_PER_TX', '5000000')),
    allowedContracts: [agent0.token, usdcAddress],
  };

  let resolve = staticAgentResolver({ '0': agent0 }, agent0);
  if (process.env.EXECUTOR_USE_REGISTRY === '1') {
    const reg = createRegistryAgentResolver(
      viemRegistryAgentReader(
        env('RPC_URL_BASE_SEPOLIA', 'https://sepolia.base.org'),
        env('REGISTRY_ADDRESS'),
      ),
      (id) => (id === agent0.agentId ? agent0.eoa : `0x`),
      (process.env.AGENT_IDS ?? '0').split(',').map((s) => s.trim()).filter(Boolean),
    );
    await reg.refresh();
    reg.start(Number(process.env.REGISTRY_REFRESH_MS ?? '30000'));
    resolve = reg.resolve;
  }

  const markDead = createKeeperMarkDead({
    privateKey: process.env.KEEPER_PRIVATE_KEY,
    rpcUrl: env('RPC_URL_BASE_SEPOLIA', 'https://sepolia.base.org'),
    registry: process.env.REGISTRY_ADDRESS,
  });

  const app = createExecutor({
    resolve,
    wallet,
    signer,
    guardrails,
    usdcAddress,
    markDead,
  });

  const port = Number(env('PORT', '8404'));
  app.listen(port, () => console.log(`[executor] AgentKit/CDP on :${port}`));
}

main().catch((e) => {
  console.error('[executor] failed to start', e);
  process.exit(1);
});
