# 执行器 = AgentKit + CDP 智能钱包（TrumanTown SP1 · 计划 3/5）

为每个居民托管**双密钥**：CDP 智能账户（=`AgentRegistry.wallet`，交易/护栏，gasless）+ CDP EOA
Server Account（持 USDC、x402 付款方）。对外是计划2 冻结的接口 B `POST /sign-payment` 及链上
动作端点。

## 双密钥模型

- **智能账户**：`buy`/`sell`/`transfer`，spend-permission 护栏（单笔上限 + 合约白名单），
  paymaster gasless。Standing = 自有 token `marketCap()`。常态持有 USDC（回购/买他币/持有），
  目标恒为推高 marketCap。
- **EOA**：每次思考用它签 EIP-3009 付 x402。Energy = EOA USDC / costPerThink（瞬时预算）。
- **饥饿/死亡由计划4 判定**（执行器只报事实）：EOA 付不起且 smart USDC≈0 且 token 卖不出钱 → 抢救窗口。

## WSL 运行（Node 24）

> 整个仓库已统一 **Node 24**（`nvm use 24`，已设 nvm 默认）。注意 `@coinbase/cdp-sdk` 自身要求
> Node ≥ 19（Node 18 下会在 `CdpClient` 构造处抛 `not supported`），Node 24 满足。

```bash
cd services/executor
nvm use 24
npm install
cp .env.example .env   # 填 CDP 三件套 / USDC / RPC（AGENT_0_* 可先留 0x... 占位）
npm run accounts       # 取/建居民 0 的 CDP EOA + 智能账户，打印两个地址 → 粘回 .env 的 AGENT_0_*
npm run start          # :8404
```

> **`.env` 加载与代理**：三个入口（`index.ts` / `bootstrapAccounts.ts` / `live:verify`）首行
> `import './loadEnv.js'`，它 (1) 用 dotenv 加载本目录 `.env`（Node 18 无 `--env-file`，本版 tsx
> 会把该 flag 透传给 node 而报 `bad option`，故用 dotenv）；(2) 若设了 `HTTP(S)_PROXY`，用
> **global-agent** 把 http/https 走代理（CDP SDK 用 axios，axios 自带的 env 代理无法对 HTTPS 做
> CONNECT 隧道，会报 `plain HTTP request was sent to HTTPS port`；global-agent 修正之）。
> `127.0.0.1`/`localhost`（facilitator 等本地服务）默认不走代理。

依赖：facilitator 在 :8403（计划2）、（LIVE 冒烟时）真 CDP 密钥。

## 测试

```bash
npm test               # 38 个单测/e2e（注入式假 wallet+signer，零云调用、不动真实资金）
npm run live:verify    # 可选 LIVE 冒烟：真 CDP 签名 → 真 facilitator /verify（需 CDP 密钥；否则 SKIP）
```

## 端点（接口 B′；计划4 消费、计划5 联调）

- `POST /sign-payment {agentId, paymentRequirements}` → `{xPayment}` | 402 `{error:"insufficient_funds"}`
- `POST /actions/{buy,sell,transfer,fund}`、`GET /balances/:agentId`、`GET /healthz`

## 云依赖版本（实测）

- `@x402/core`: 2.14.0　·　`@x402/evm`: 2.14.0　·　`@coinbase/cdp-sdk`: 1.51.0　·　`@coinbase/agentkit`: 0.10.4
- **x402 v2 客户端**：用 Coinbase 官方**作用域包** `@x402/core` + `@x402/evm`（2.14.0，与自托管 facilitator 同源）：
  `new x402Client()` → `registerExactEvmScheme(client, { signer })`（`@x402/evm/exact/client`，注册 v2 `eip155:*`
  exact 方案）→ `x402HTTPClient.createPaymentPayload()` + `encodePaymentSignatureHeader()` 出 X-PAYMENT。
  CDP `EvmServerAccount` 直接满足 x402 的 `ClientEvmSigner`（含 `address`/`signTypedData`），无需转换。
  故 Task 9 的实现用 `@x402/core`+`@x402/evm`（**非**下方参考代码里的裸 `x402`），其余结构不变；真链验证仍由
  LIVE 冒烟在计划5 完成。

## ✅ 计划 5（已完成）

- `EXECUTOR_USE_REGISTRY=1`：以链上 `AgentRegistry.agents(id)` 解析 token/wallet + CDP 派生 EOA（registry-cache resolver，反伪造、无宽容 fallback；未注册/dead → 404）。
- `transferUsdc(source:"eoa")` 接通 CDP EOA send（`cdp.evm.sendTransaction`）。
- keeper：新增 `POST /actions/mark-dead {agentId}`（keeper-only，`KEEPER_PRIVATE_KEY` viem 直发 `AgentRegistry.markDead`，需 Base Sepolia ETH 付 gas）。
- 两条端到端验收脚本见 `services/e2e/`（① 复活 ② 死亡）。
- LIVE 冒烟 (`npm run live:verify`) 仍是「@x402 v2 签名被真 facilitator /verify 接受」的真相检验。
