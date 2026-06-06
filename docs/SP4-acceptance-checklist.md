# SP4 验收清单（AI 居民链上博弈）

前置：SP1/SP2/SP3 栈在跑；5 个居民已部署（agentId 0–4）；
AllianceRegistry 已部署并 setEoa(0..4)；indexer .env.local 填 ALLIANCE_REGISTRY_ADDRESS 并重启；
convex env 设 `TRUMANTOWN_RIVALRY=1`；每个居民都有 energy > 0 且在对话中。

- [ ] 1. **五居民同活**：Ponder `/agents` 返回 5 条记录，均 `alive=true`；Convex agentEconomy 5 行均 status=alive。
- [ ] 2. **博弈感知写入**：等 rivalry tick 触发（30s）→ Convex `rivalryState` 表出现所有居民的对手快照行（每个居民 4 行对手）。
- [ ] 3. **rivalryPrompt 进对话**：Convex 日志里居民对话的 prompt 包含「resident N: standing=X」字样。
- [ ] 4. **买对方代币（链上证据）**：居民 0 对话后，执行器日志出现 `POST /actions/buy-rival`；链上出现 AgentToken[1].Bought 事件（来自居民 0 的 smart account）；Ponder 居民 1 的 `marketCap` 上升。
- [ ] 5. **结盟上链**：`cast send <ALLIANCE_REGISTRY> "propose(uint256,uint256,string)" 0 1 "team up" --private-key <EOA_0>`→ AllianceProposed 事件；再用 EOA_1 accept → AllianceFormed → Ponder `/agents/0/rivals` 中居民 1 的 `allied=true`；前端 RivalryPanel 居民 1 显示绿色🤝。
- [ ] 6. **背刺（戏剧性验证）**：结盟后，居民 0 仍然卖压居民 1 的代币 → 链上可验证「背刺」行为。
- [ ] 7. **门控关**：取消 `TRUMANTOWN_RIVALRY` → rivalryCursor 不再更新、对话 prompt 与 SP3 一致、无博弈感知块。
