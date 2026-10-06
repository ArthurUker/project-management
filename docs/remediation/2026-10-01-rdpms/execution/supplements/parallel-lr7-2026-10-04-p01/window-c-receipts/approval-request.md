# T-RP-02 精确批准请求（approval-request，PROPOSED）

> 本文件列举需批准的**精确选择、数值/期限、具名角色/日期/证据字段**，以及外部输入缺口。无任何字段被本窗口填写或假装已批准；所有批准位为空白。

## 1. 需批准的选择

| # | 批准项 | 推荐值（PROPOSED） | 备选 | 说明 |
|---|---|---|---|---|
| A1 | 总体方案 | **OPT-A**：扩展 `SyncMutation` 为作用域回执，对齐 `mutationReceipt` | OPT-B 复用 withIdempotency；OPT-C 新建 SyncReceipt 表 | 见 `decision-draft.md` §2 |
| A2 | 作用域唯一键形态 | `actorId + deviceId + clientMutationId + resourceScope`（建议） | 保留全局 `clientMutationId` 仅查询强制 actor+device 过滤 | 影响跨设备重放语义（见开放问题 2） |
| A3 | payloadHash 绑定 | 必填（canonicalize+sha256，复用 `payloadHash.js`） | 迁移期可选、兼容窗口后必填 | 同 key 异 payload → 409 |
| A4 | 单事务边界 | 业务写 + 回执 + 必要审计同一事务 | 维持分离（不推荐，B06 复现） | 消除 B06 |

## 2. 需批准的数值 / 期限

| # | 数值项 | 推荐（建议待批准） | 来源/备注 |
|---|---|---|---|
| N1 | 回执保留期 `expiresAt` 窗口 | **24 小时**（对齐 `RECEIPT_TTL_MS=24h`，`receipts.js` L20） | 同源 HTTP 通道；更长离线窗需产品/运维批准 |
| N2 | 最大离线窗 | = 保留窗（N1） | 超出即 `expired`，禁止静默换 key |
| N3 | 兼容窗口（payloadHash 可选期） | 建议 1 个发版周期（**建议待批准**） | 结束后 payloadHash 置为必填 |
| N4 | 留存清理 job 频率 | **OPEN_INPUT**（当前无清理任务，S03-OI-04） | 仅规定字段/窗口，不实现 job |

> 凡无源码依据的数值（N2/N3/N4 及更长离线窗）一律标注“建议待批准”，不编造既有设置。

## 3. 具名角色 / 日期 / 证据字段（空白待填）

| 角色 | 批准人（签名字段） | 批准日期 | 证据字段 |
|---|---|---|---|
| 后端负责人 | `approvedBy.backend` = ___ | `approvedAt` = ___ | 实施 PR / 集成测试 `INT-PC03-01` 证据 |
| 产品负责人 | `approvedBy.product` = ___ | `approvedAt` = ___ | 离线窗/保留期业务确认 |
| 运维负责人 | `approvedBy.ops` = ___ | `approvedAt` = ___ | 留存清理 job 与频率方案 |

- 决策登记位：`DECISION_REGISTER.T-RP-02.status` 当前 `PROPOSED`；`approvedBy/approvedAt/evidenceRef` 均为 `null`（由批准动作填写，本窗口不改）。
- 批准证据引用：`execution/.../window-c-receipts/{current-contract.md,decision-draft.md,decision-draft.json,acceptance-draft.csv}`；实施证据由 `RP09-T01/T02`、`RP12-T02` 在批准后补充。

## 4. 外部输入缺口（OPEN_INPUT）

- 最大离线窗/保留期确切小时数与更长离线需求（产品/运维）。
- `SyncMutation` 唯一键形态（A2）的最终决定。
- 留存清理 job 的责任人与频率（S03-OI-04）。
- 与 `T-RP-07`/`S03-OI-05` 在 delete op 上的作用域/回执交互确认（仅限 delete 范围）。
- 与窗口 D（认证 T-RP-09）、窗口 F（缓存/水位 T-RP-04+T-RP-12）的接口确认（见 `interface-notes.md`）。

## 5. 批准边界声明

- 本请求**不**构成批准；批准需由上述具名角色在 `DECISION_REGISTER` 填写并附证据。
- 批准后实施仍须通过 `RP09-T01`（原子提交）、`RP09-T02`（同 key/unknown/清理）、`RP12-T02`（按 key 校验/partial retry）的门禁与 `INT-PC03-01` 动态验收。
- 本窗口未运行真实 DB/构建/浏览器，未重跑 `INT-PC03-01`、B06 或任何动态验收；动态项维持 NOT_RUN。
