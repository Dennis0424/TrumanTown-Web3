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

## WSL 运行（Node 18）

```bash
cd services/executor
nvm use 18
npm install
cp .env.example .env   # 填 CDP 密钥 / AGENT_0_* / USDC / RPC
npm run start          # :8404
```

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

## ⚠ 计划 5 集成待办

- static agent resolver → 从 `AgentRegistry.agents(id)` / Ponder 读 `wallet`+`token` 的解析器（不改 resolver 接口）。
- 注入真 CDP 密钥；用 LIVE 冒烟核过的 x402 v2 绑定跑真链 buy/sell/transfer。
- 与网关 + facilitator 端到端：402 → `/sign-payment` → 重试 → 真 `/verify` → 批量 `/settle` 上链。
- LIVE 冒烟 (`npm run live:verify`) 是「@x402 v2 签名被真 facilitator /verify 接受」的真相检验——计划5 备齐 CDP 密钥 + 运行中的 facilitator 后跑通。
