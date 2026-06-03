// SP1 economic parameters. Values mirror the locked design (§8) and Plans 1/2.
// Plan 5 replaces COST_PER_THINK / STANDING_FLOOR / RECOVERY_WINDOW with on-chain
// reads from AgentRegistry.agents(id); the seam (Convex constants) is intentional.

export const COST_PER_THINK = '10000'; // 0.01 USDC (6dec) — same as gateway/Registry SP1 default
export const STANDING_FLOOR = '0'; // atomic USDC; SP1 default off (energy is the primary death driver). Plan 5: AgentRegistry.floor (=5% of launch cap)
export const RECOVERY_WINDOW = 10; // T: starving periods before death (design §8)
export const ECONOMIC_TICK_SECONDS = 30; // perception cadence (design: 1 think / 30–60s)
export const DEFAULT_ECON_AGENT_ID = '0'; // SP1 single resident

export function executorUrl(): string {
  return process.env.EXECUTOR_URL ?? 'http://127.0.0.1:8404';
}
export function gatewayUrl(): string {
  // chat egress already points at the gateway via OLLAMA_HOST (=:8402).
  return process.env.OLLAMA_HOST ?? 'http://127.0.0.1:8402';
}
export function economyEnabled(): boolean {
  return process.env.TRUMANTOWN_ECONOMY === '1';
}
export function defaultAgentId(): string {
  return process.env.DEFAULT_AGENT_ID ?? DEFAULT_ECON_AGENT_ID;
}
export function agentEoa(): string | undefined {
  return process.env.AGENT_0_EOA;
}
