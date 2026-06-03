# x402 计量推理网关（TrumanTown SP1 · 计划 2/5）

挡在 Ollama 前面：每次 `chat completion` 按居民 `costPerThink` 定价为真实 USDC。
首次 `402 + 付款要求`；带 `X-PAYMENT` 重试 → facilitator 即时验款 → 反向代理转发
Ollama → 返回；已验款项入内存队列，每 N=10 笔或 60s 批量 settle 上链。

## WSL 运行（Node 18）

```bash
cd services/gateway
nvm use 18
npm install
cp .env.example .env   # 填 GATEWAY_TREASURY_ADDRESS 等
npm run start          # :8402
```

依赖：facilitator 在 `:8403`（见 ../facilitator/README.md）、Ollama 在 `:11434`。

## 测试

```bash
npm test          # 全部单测 + e2e（用 mock facilitator + stub Ollama，无需真链）
```

（7 个测试文件，28 个用例，全绿；`npm run typecheck` 干净。）

## 计费 / 免费

- 计费：`POST /v1/chat/completions`（= 一次思考）。
- 免费透传：`/v1/embeddings`、`/api/*`（含 `/api/embeddings`、`/api/pull`）、`/v1/moderations`、`GET /healthz`。

## 计划 4（Convex 接缝）对接

在 `convex/util/llm.ts`：
1. 让 chat 出口指向本网关：`OLLAMA_HOST=http://127.0.0.1:8402`（embeddings 走同一 host 的免费 `/api/embeddings`）。
2. chat 请求加头 `X-Agent-Id: <agentId>`（SP1 用 "0"）。
3. 收到 `402` 时，取 body `accepts[0]`（PaymentRequirements），调执行器
   `POST {EXECUTOR_URL}/sign-payment {agentId, paymentRequirements}` 拿 `xPayment`，
   设 `X-PAYMENT: <xPayment>` 头重试该请求。
4. 执行器返回 `insufficient_funds` 或重试仍持续 `402` → 判定**饥饿**（进入抢救窗口）。

> 网关不持钱包、不签名；签名方永远是居民的 CDP 钱包（执行器，计划 3）。

## ⚠ 计划 5 集成待办（网关 ↔ 真 facilitator 协议对齐）

本网关按 x402 **v1** 线格式、网络字符串 `"base-sepolia"` 实现，并用 **mock facilitator** 做
单测/e2e（28/28 全绿，不依赖真链）。Task 8 立起的真实自托管 facilitator
（`OviatoHQ/x402-facilitator-hono`，live 验证）使用 **x402 v2** 且网络为 CAIP-2 `eip155:84532`，
路由在 `/facilitator` 前缀下。因此**真实联调前需在计划 5 对齐**：

- `FACILITATOR_URL` 已含 `/facilitator` 前缀（本仓 .env.example 已设）。
- 网关 `src/x402.ts` 的 `X402_VERSION`（=1）与 `PaymentRequirements.network`（`"base-sepolia"`，
  来自 `X402_NETWORK`）需与 facilitator 的 v2 / `eip155:84532` 对齐；对齐时应在计划 5 用**真
  facilitator 跑通 `/verify`**（而非 mock）来校验 v2 载荷字段，再据实调整本网关的版本常量与网络值。
- 这是计划 2（mock 测试）与计划 5（真链集成）的边界，**不在本计划范围内修改已测代码**。
