# T-RP-02 推荐方案（decision-draft，PROPOSED）

> 状态：**PROPOSED**。批准人 / 批准日期 / 批准证据均为 **null**。本文件仅为可审查的推荐方案，不构成任何批准或实施。

## 1. 决策定位

- 决策：`T-RP-02`（作用域回执和保留窗）；关联合同 `PC03`；父任务 `RP09-T01`/`RP09-T02`/`RP12-T02`（当前均 `NOT_STARTED`）。
- 问题核心：系统存在**两条互不相干的回执通道**。HTTP 命令通道（`mutationReceipt` + `withIdempotency`）已具备作用域绑定、payloadHash、单事务、24h TTL；而同步上行通道（`SyncMutation`）只以全局 `clientMutationId` 幂等，无 actor/hash 绑定、业务写与回执分离、无保留期、无按 key 查询、无 unknown/expired 态。T-RP-02 旨在补齐同步通道的“作用域回执和保留窗”。

## 2. 推荐选项：OPT-A（扩展 SyncMutation 为作用域回执）

将 `SyncMutation` 扩展为与 `mutationReceipt` 同构的作用域回执：加列 `actorId`/`resourceScope`/`payloadHash`/`expiresAt`，把业务写与回执 upsert 合并到同一事务，新增按 key 的授权结果查询。理由：HTTP 通道已证明该模型可行（`receipts.js` L33-145），同步通道仅缺同等保证；加列为 additive，回退成本低。

备选（均不推荐）：
- **OPT-B** 同步上行复用 `withIdempotency`：复用最彻底，但 sync 批处理/部分成功/conflict 语义差异大，适配层重。
- **OPT-C** 新建独立 `SyncReceipt` 表：隔离清晰，但双写与迁移/回填成本高。

## 3. 作用域与字段/API 语义

- 作用域键：`actorId + deviceId + clientMutationId + resourceScope`（resourceScope 形如 `project:<id>`），并记 `payloadHash = sha256(canonicalJson(payload))`（复用 `payloadHash.js`）。
- 新增 `expiresAt` 与状态 `unknown`/`expired`（与 `applied/conflict/rejected` 并列）。
- 新增按 key 结果查询：`GET /api/sync/receipts?clientMutationId=…` 或批量 POST；返回 `{status, result, payloadHashMatched, expiresAt}`。

## 4. 保留期 / 最大离线窗 / 查询授权

- 保留字段：`SyncMutation.expiresAt`；**推荐值 24 小时**，对齐 `mutationReceipt.RECEIPT_TTL_MS=24h`（`receipts.js` L20）。更长离线窗为**建议待批准**（需产品/运维确认）。
- 最大离线窗定义：客户端在 `expiresAt` 之前可安全按原 key/hash 重放或查询；超出视为 `expired`，交由人工/业务恢复，**禁止静默换 key**。
- 查询授权：回执查询必须在鉴权与资源授权之后；跨 actor、跨 device 一律按 `unknown` 处理，绝不泄露他人回执。

## 5. 错误响应

- 同 key 异 payload → 409 `IDEMPOTENCY_PAYLOAD_MISMATCH`（复用 `receipts.js` L50-57 语义）。
- 同 key 异 actor → 409 / 404 `unknown`（绝不允许跨 actor 回放）。
- `unknown`：显式态，可重试查询或原 key/hash 重试。
- `expired`：显式态，禁止自动换 key；交业务/人工恢复。
- 提交前后 500：业务写与回执同事务 → 500 整体回滚无半成品（消除 B06）；响应丢失走 `unknown` → 按 key 查询/原 key 重放。

## 6. 兼容窗口

- 旧客户端仅发 `clientMutationId`、无 `payloadHash`：迁移期 `payloadHash` 视为可选，缺失不强制 409，但标记 `legacyHashAbsent`；兼容窗口结束后置为必需。
- `applied/conflict/rejected` 回放语义保持；新增 `unknown/expired` 仅为正向状态，不破坏旧客户端读取。
- 加列 additive；通过 feature flag 灰度新事务路径，旧路径保留以便回退。

## 7. 迁移与回退边界

- schema：additive 加列 + 可选唯一键调整；需 Prisma migration 与 `expiresAt` 回填（默认 now+窗口）。
- 代码回退：feature flag 关闭即回退旧 push 路径（独立 upsert）；新列留空不影响旧逻辑。
- 数据回退：新列 nullable，回退不丢数据；改唯一键需“先加后删旧约束”。
- 回退边界归实现任务 `RP09-T01/T02`、`RP12-T02`；本决策仅规定策略，不实施。

## 8. 待确认问题（开放输入）

1. 最大离线窗/保留期确切小时数（建议 24h 对齐，更长需产品/运维批准）。
2. `SyncMutation` 唯一键是否改为 `actor+device+key+scope`，或保留全局 key 仅查询过滤（影响跨设备重放语义）。
3. 留存清理 job 的频率与责任人（S03-OI-04 仍 OPEN）。
4. 与 `T-RP-07`（删除命令适配器）在 delete op 上的作用域/回执交互——必要 `T-RP-07`/`S03-OI-05` 仅在对应 delete 范围生效，不扩大。

## 9. 证据基础与状态边界

- 当前合同事实：`current-contract.md`（本目录）。静态 500 恢复矩阵：`execution/RP00/RP00-T02/evidence/failure-point-matrix.json`（RP00-T02 静态 PASS；`INT-PC03-01` NOT_RUN）。
- 源码哈希：`receipts.js 5fedecb6…`、`payloadHash.js 2d9eaadf…`、`sync.js ad41610a…`（相对冻结 S03 `9d9408f5…` 有未提交工作树改动，本窗口只读）、`schema.prisma fac40301…`。
- 状态：决策 **PROPOSED**；`approvedBy/approvedAt/evidenceRef` 均 **null**；实现 `NOT_STARTED`；动态验收 `NOT_RUN`；发布 `NOT_EVALUATED`。
