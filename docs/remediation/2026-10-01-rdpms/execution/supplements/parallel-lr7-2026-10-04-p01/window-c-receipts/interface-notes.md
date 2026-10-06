# T-RP-02 接口确认备忘（interface-notes，仅占位/待确认）

> 本文件记录需与**窗口 D（认证 T-RP-09）**、**窗口 F（缓存/水位 T-RP-04+T-RP-12）**确认、且当前合同未批准即使用占位值的接口点。本窗口**不读取其它窗口未冻结材料、不自行决定跨包冲突**，所有跨包结论待对应窗口与批准动作裁定。

## 1. 与窗口 D（认证 T-RP-09）的接口

- **actor/device 绑定来源**：本决策要求 `SyncMutation` 作用域含 `actorId + deviceId`。`deviceId`（来自 `sync.js` 的 `upsertSyncDevice`，L508）与认证 `actor.userId` 的绑定关系需与 D 的认证合同一致；由 D 明确“已认证 actor + 本设备”的判定入口。
- **查询授权顺序**：按 key 回执查询必须在鉴权与资源授权之后（复用 `receipts.js` L61-66 的既有约定）。跨 actor/device 一律按 `unknown`。
- **错误码边界**：同 key 异 payload → 409（复用 `IDEMPOTENCY_PAYLOAD_MISMATCH`）；跨 actor/未授权 → `unknown`/404，**不**返回 401（避免与认证失败混淆）。与 D 确认 401 vs 409/404 的语义划分。
- **未批准占位**：D 尚未冻结的认证传输/会话字段，本决策以“已认证 actor + 本设备(deviceId)”为占位，不假设具体头部/令牌形态。

## 2. 与窗口 F（缓存/水位 T-RP-04+T-RP-12）的接口

- **保留窗 vs 缓存 TTL**：本决策 `expiresAt` 默认 24h（对齐 `RECEIPT_TTL_MS`）。与 F 的缓存/水位 TTL 需对齐，避免回执未过期但缓存已失效或反之导致的“重放/查无”不一致。
- **最大离线窗与水位**：最大离线窗 = 保留窗；若 F 定义更长“水位/可恢复窗”，本决策的 `expired` 判定应以其为下界（**建议待批准**，待 F 冻结数值）。
- **partial retry 边界**：`RP12-T02` 按 key 验证结果及 partial retry 依赖本决策的按 key 查询 API；查询返回结构 `{status,result,payloadHashMatched,expiresAt}` 需被 F 的 partial-retry 消费。`INT-PC12-01` 与 `INT-PC03-01` 应共享同一按 key 结果契约。
- **未批准占位**：F 的具体水位/缓存时长以占位引用，待 F 冻结后回填；本决策不预占 F 的数值。

## 3. 跨包冲突处理原则

- 任何 T-RP-02 与 T-RP-09 / T-RP-04 / T-RP-12 的字段或语义冲突，**不**在本窗口裁决，交由集成器/批准动作按 `CROSS_PACKAGE_CONTRACTS` 与 `DECISION_REGISTER` 裁定。
- 本文件所有“占位”仅在批准前使用；批准后由实施任务回填具体值，并同步更新 `PC03` 验证场景 `INT-PC03-01`。

## 4. 待回传确认项（供集成器汇总）

1. D：actor/device 判定入口与 401/409/404 语义划分。
2. F：缓存/水位 TTL 与保留窗对齐数值。
3. D/F：partial-retry 消费的按 key 结果结构是否需扩展字段。
