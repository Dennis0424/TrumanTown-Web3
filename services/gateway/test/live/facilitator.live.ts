/**
 * Opt-in x402 full-chain v2 smoke (NOT in `npm test`; run with tsx).
 * Proves: a real X-PAYMENT (from the executor's real CDP signer) is accepted by the
 * gateway wired to the REAL self-hosted facilitator (/facilitator/verify), and the
 * batch queue settles it on-chain (/facilitator/settle, funded settler).
 *
 * Requires running: facilitator :8403, gateway :8402 (FACILITATOR_URL pointing at the
 * real facilitator), executor :8404 (real CDP), Ollama :11434. Skips if unconfigured.
 */
const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8402';
const EXECUTOR = process.env.EXECUTOR_URL ?? 'http://127.0.0.1:8404';
const AGENT_ID = process.env.SMOKE_AGENT_ID ?? '0';

async function main() {
  try {
    const h = await fetch(`${GATEWAY}/healthz`);
    if (!h.ok) throw new Error();
  } catch {
    console.log(`[facilitator.live] SKIP — gateway not reachable at ${GATEWAY}`);
    return;
  }

  const body = JSON.stringify({ model: 'llama3', messages: [{ role: 'user', content: 'live ping' }] });
  const r402 = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Id': AGENT_ID },
    body,
  });
  if (r402.status !== 402) {
    console.log('[facilitator.live] unexpected first status', r402.status, '(expected 402) — SKIP');
    return;
  }
  const challenge = await r402.json() as { accepts?: unknown[] };
  const requirements = challenge?.accepts?.[0];
  if (!requirements) throw new Error('402 without accepts[0]');

  const signRes = await fetch(`${EXECUTOR}/sign-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: AGENT_ID, paymentRequirements: requirements }),
  });
  if (signRes.status === 402) {
    console.log('[facilitator.live] executor reports insufficient_funds — fund the EOA first (executor /actions/fund). SKIP');
    return;
  }
  const { xPayment } = await signRes.json() as { xPayment: string };

  const r200 = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Id': AGENT_ID, 'X-PAYMENT': xPayment },
    body,
  });
  console.log('[facilitator.live] retry status', r200.status, 'X-PAYMENT-RESPONSE:', r200.headers.get('x-payment-response'));
  if (r200.status !== 200) throw new Error(`gateway rejected verified payment: ${r200.status}`);
  console.log('[facilitator.live] OK — real facilitator verified the v2 payment; settle is queued (check facilitator logs / Base Sepolia for the settle tx).');
}

main().catch((e) => { console.error('[facilitator.live] FAIL', e); process.exit(1); });
