/**
 * Opt-in LIVE smoke (NOT part of `npm test`; run `npm run live:verify`).
 * Proves a real CDP EOA, signing via @x402/core + @x402/evm (v2 exact EVM), produces an
 * X-PAYMENT the REAL self-hosted facilitator's /verify accepts on eip155:84532.
 * Skips cleanly if CDP creds are not set.
 */
import '../../src/loadEnv.js'; // load .env + route fetch through proxy (must be first)
import { buildCdpHooks } from '../../src/cdpClient.js';
import { createX402Signer } from '../../src/x402Signer.js';
import { decodeXPayment, type PaymentRequirements } from '../../src/x402.js';

async function main() {
  const need = ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET'];
  if (need.some((k) => !process.env[k])) {
    console.log('[live:verify] SKIP — CDP creds not set');
    return;
  }
  const facilitatorUrl = process.env.FACILITATOR_URL ?? 'http://127.0.0.1:8403/facilitator';
  const usdcAddress = process.env.USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const payTo = process.env.GATEWAY_TREASURY_ADDRESS ?? '0x000000000000000000000000000000000000dEaD';
  const agent = { agentId: '0', smartAccount: process.env.AGENT_0_SMART_ACCOUNT ?? '0x0', eoa: process.env.AGENT_0_EOA ?? '0x0', token: process.env.AGENT_0_TOKEN ?? '0x0' };
  const cdp = await buildCdpHooks({
    apiKeyId: process.env.CDP_API_KEY_ID!, apiKeySecret: process.env.CDP_API_KEY_SECRET!, walletSecret: process.env.CDP_WALLET_SECRET!,
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA ?? 'https://sepolia.base.org', agents: [agent], usdcAddress,
  });
  await cdp.faucetTo(agent.eoa, 'usdc');
  const signer = createX402Signer({ accountFor: cdp.eoaAccountFor });
  const requirements: PaymentRequirements = {
    scheme: 'exact', network: 'eip155:84532', maxAmountRequired: '10000',
    resource: 'http://gw.local/v1/chat/completions', description: 'TrumanTown live verify',
    mimeType: 'application/json', payTo, maxTimeoutSeconds: 120, asset: usdcAddress,
    extra: { name: 'USDC', version: '2' }, // EIP-712 domain — required by @x402/evm exact scheme
  };
  const xPayment = await signer.sign(agent.eoa, requirements);
  const paymentPayload = decodeXPayment(xPayment);
  console.log('[live:verify] x402Version in payload:', paymentPayload.x402Version);
  // Facilitator/@x402 use `amount` (not our 402-challenge `maxAmountRequired`).
  const { maxAmountRequired, ...rest } = requirements;
  const facReq = { ...rest, amount: maxAmountRequired };
  const res = await fetch(`${facilitatorUrl}/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: facReq }) });
  const body = (await res.json()) as { isValid?: boolean; invalidReason?: string };
  console.log('[live:verify] facilitator /verify ->', body);
  if (!body.isValid) throw new Error(`facilitator rejected payload: ${body.invalidReason ?? 'unknown'}`);
  console.log('[live:verify] OK — real CDP signature verified at v2/eip155:84532');
}
main().catch((e) => { console.error('[live:verify] FAIL', e); process.exit(1); });
