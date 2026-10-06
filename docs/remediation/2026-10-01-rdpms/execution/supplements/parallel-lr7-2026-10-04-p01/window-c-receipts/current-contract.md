# T-RP-02 当前回执合同事实清单（current-contract）

- 决策：`T-RP-02`（作用域回执和保留窗），关联 `PC03`，父任务 `RP09-T01`/`RP09-T02`/`RP12-T02`。
- 模式：PREPARATION_ONLY。本文件只陈述**当前代码事实**，不批准、不实施。
- 所有行号/SHA256 来自 `git rev-parse HEAD = 138cf2da…`（HEAD 未变），源码按**当前工作树**读取（`sync.js` 有未提交改动，哈希见 `start-baseline.json`）。
- 复用已验证证据：`execution/RP00/RP00-T02/evidence/failure-point-matrix.json`（静态 500 恢复矩阵，RP00-T02 静态 PASS；`INT-PC03-01` NOT_RUN）；历史 `B06`（SUPPORTED/P1，继承未重跑）。

## 0. 存在两条互不相干的回执通道

| 通道 | 表/模块 | 绑定键 | payloadHash | 单事务(授权+CAS+业务+审计+回执) | 保留期/过期 | 按 key 查询结果 | 未知/过期态 |
|---|---|---|---|---|---|---|---|
| HTTP 命令（`withIdempotency`） | `MutationReceipt` | `actorId+command+resourceScope+idempotencyKey` | **有** (`payloadHash`, Char64) | **是**（事务内 validate→execute→回填） | `expiresAt` = now+`RECEIPT_TTL_MS`(24h)；无清理任务 | 回放查询命中即返回 | 无显式未知/过期码，靠 `expiresAt` 缺失判定 |
| 同步上行（`POST /api/sync/push`） | `SyncMutation` | 仅 `clientMutationId`（全局唯一，不绑定 actor） | **无字段** | **否**（业务写后**独立** `upsert`，非同事务） | 仅 `createdAt`，**无 `expiresAt`** | 仅 `/sync/status` 聚合计数 | 仅 `applied/conflict/rejected`，无 unknown/expired |

> 结论：T-RP-02 的“作用域回执和保留窗”**在 HTTP 通道已具备作用域与单事务保证（已有保护）**；**在同步上行通道未覆盖**（未覆盖）。

## 1. 已有保护（HTTP 通道 `mutationReceipt`）

- `rdpms-system/backend/src/platform/idempotency/receipts.js` (sha256 `5fedecb6…`，与冻结 S03 一致)
  - `withIdempotency` 要求调用方**先完成鉴权与资源授权**再进入（注释 L9-14, L61-66）；回执查询在授权之后（L100-104）。
  - 作用域唯一键 `actorId+command+resourceScope+idempotencyKey`，另记 `payloadHash`（L33-39，`scopeWhere`；schema `MutationReceipt` `@@unique mutation_receipts_scope_key` L1615）。
  - 同键不同 `payloadHash` → 409 `IDEMPOTENCY_PAYLOAD_MISMATCH`（L50-59 `replayReceipt`）。
  - **单事务**写入：占位 `mutationReceipt` → `validate` → `execute`（业务+审计）→ 回填 `responseStatus/Body`（L107-128）；失败整体回滚不留成功回执（L129-145）。
  - 并发同键：唯一索引让后到者阻塞，先到者提交后回放；先到者回滚则报 `IDEMPOTENCY_IN_PROGRESS` retryable（L129-142）。
  - `RECEIPT_TTL_MS = 24*60*60*1000`（L20）；`expiresAt` 写入（L118）；**无清理任务**（注释 L19）。
- `payloadHash.js` (sha256 `2d9eaadf…`，与冻结一致)：`canonicalize` 递归字典序排序后 `sha256(canonicalJson)`（L13-31），覆盖调用方显式传入的规范化内容，不含服务端时间/随机数。

## 2. 未覆盖（同步上行通道 `SyncMutation`）

- `rdpms-system/backend/prisma/schema.prisma` `SyncMutation` (L486-503, sha256 `fac40301…` 与冻结一致)
  - 唯一键**仅** `clientMutationId`（L488）；列有 `deviceId/userId/entity/entityId/op/status/result/createdAt`，**无 `payloadHash`、无 `expiresAt`、无 actor 绑定进唯一键**。
  - `status` 仅 `applied/conflict/rejected`（L494）；`result` JsonB 回放原样返回（L495）。
- `rdpms-system/backend/src/routes/sync.js` (sha256 `ad41610a…`，**相对冻结 S03 的 `9d9408f5…` 有未提交工作树改动**，本窗口只读不改)
  - 幂等命中**预取**只按 `clientMutationId` **全局**查：`syncMutation.findMany({where:{clientMutationId:{in:mutationIds}}})`（L523-527），**不按 actor 过滤** → 跨 actor 同 key 可能命中他人回执。
  - 仅 `status==='applied'` 回放（L550-553）；`rejected/conflict` 一律重新判定并**覆盖写回同一条 `SyncMutation`**（L544-554，注释解释 F10 恢复闭环）。
  - 业务写（report/task/phase 等）在循环内执行（L557-700 区间，如 `saveReportDraft` L620-623、`prisma[def.model].update` L604），**之后**才 `syncMutation.upsert(...)`（L706-718）——**非同事务**，复现 B06：业务提交后回执 upsert 失败 → 500 且无回执。
  - `GET /api/sync/status`（L762-773）仅返回 `devices/mutations/conflicts` 聚合计数，**无按 `clientMutationId` 的结果查询**，无法区分 unknown/expired/applied。
- 跨 actor/跨 payload 保护缺失：唯一键不含 actor/hash，历史 `B05`（同 key 跨 payload/actor 重放）在同步通道未证明已防护。

## 3. 边界汇总（已有 vs 未覆盖）

| 合同要素 | HTTP 通道 | 同步通道 | 差距 |
|---|---|---|---|
| actor/resource/command/key 绑定 | ✅ `actorId+command+resourceScope+key` | ❌ 仅全局 `clientMutationId` | 同步通道需加 actor/device/entity/op/id 绑定 |
| payload hash 绑定 | ✅ `payloadHash`(Char64) | ❌ 无字段 | 同步通道需加 `payloadHash` |
| device / hash 版本 | ✅ actor(用户)；无 device 维度 | ❌ 仅有 `deviceId` 列未进键 | 同步通道需把 `deviceId` 纳入作用域 |
| 单事务(授权+CAS+业务+审计+回执) | ✅ | ❌ 业务写与回执 upsert 分离 | 同步通道需合并事务 |
| 首次响应 / 同 key 重放 | ✅ 回放原 `responseStatus/Body` | ✅ applied 回放(限同 key) | 同步通道应校验 payloadHash |
| 不同 payload | ✅ 409 | ❌ 无校验，覆盖写 | 同步通道需 409 |
| 跨 actor / resource | ✅ 作用域隔离 | ❌ 全局 key 跨 actor | 同步通道需 actor 作用域 |
| 500 前/后 | HTTP 通道事务回滚安全 | ❌ 业务已提交回执失败→500 | 同步通道需同事务 |
| unknown / expired | 靠 `expiresAt` 隐式 | ❌ 无 `expiresAt`/无两态 | 需显式 unknown/expired |
| 保留窗/最大离线窗 | 24h TTL（无清理） | ❌ 无保留期 | 需定义并治理 |
| 按 key 结果查询授权 | 回放查询在授权后 | ❌ 仅聚合状态 | 需按 actor+device 授权查询 |

## 4. 来源与复用声明

- 当前哈希：`receipts.js 5fedecb6…`、`payloadHash.js 2d9eaadf…`、`schema.prisma fac40301…`（均与冻结一致）；`sync.js ad41610a…`（未提交改动，见 §0/start-baseline）。
- 复用：`execution/RP00/RP00-T02/evidence/failure-point-matrix.json`（FP-01~FP-10 与 crossCutting）；`docs/audits/2026-09-29-rdpms/backend-results.json#B06`；`docs/audits/2026-09-30-review-plan/execution/supplemental/S03/review.md`（S03-OI-03/04）。
- 未运行：本轮未运行真实 DB/构建/浏览器；未重跑 `INT-PC03-01`、B06 或任何动态验收。所有“动态”状态仍为 NOT_RUN。
