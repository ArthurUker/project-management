# 窗口 C 交接（handoff）

## 完成内容（PREPARATION_ONLY）

- 依据当前代码（`sync.js`、`receipts.js`、`payloadHash.js`、`schema.prisma`，含行号与 SHA256）与 `RP00-T02` 静态 500 恢复矩阵、历史 `B06`，完成 `T-RP-02`「作用域回执和保留窗」回执合同的：
  1. `current-contract.md` —— 当前合同事实：HTTP 通道（`mutationReceipt`）已具备作用域/单事务/24h TTL（**已有保护**）；同步通道（`SyncMutation`）仅全局 `clientMutationId`、无 actor/hash 绑定、业务写与回执分离、无保留期、无按 key 查询、无 unknown/expired 态（**未覆盖**）。已有保护与未覆盖明确分开。
  2. `decision-draft.md` + `decision-draft.json` —— 单一可审查推荐方案 **OPT-A**（扩展 `SyncMutation` 为作用域回执，对齐 `mutationReceipt`），含作用域/字段/API、保留期与最大离线窗、查询授权、错误响应、兼容窗口、迁移与回退边界，及备选 OPT-B/OPT-C。状态 **PROPOSED**，`approvedBy/approvedAt/evidenceRef` 均 **null**。
  3. `acceptance-draft.csv` —— 13 条将来验收（合法认证+非空成功、真实副作用、同 key/跨 actor/resource/不同 payload、提交前后 500、unknown/expired 与离线恢复），动态项 **NOT_RUN**；`T-RP-07`/`S03-OI-05` 仅在 delete 范围生效。
  4. `approval-request.md` —— 精确批准选择（A1-A4）、数值/期限（N1-N4，无源码依据的标“建议待批准”）、具名角色/日期/证据空白字段、外部输入缺口。
  5. `interface-notes.md` —— 与窗口 D（认证 T-RP-09）、窗口 F（缓存/水位 T-RP-04+T-RP-12）的待确认接口，使用占位而不自行裁定跨包冲突。

## 边界

- 未修改任何业务源码/测试/共享 helper/schema/guard/配置/依赖/部署脚本；未更新 `DECISION_REGISTER`/`TASK_GRAPH`/任何根台账；未实施 `RP09`/`RP12`；未运行真实 DB/构建/浏览器；未联系负责人。
- `DECISION_REGISTER.T-RP-02` 仍为 `PROPOSED`，批准位 `null`。
- `sync.js` 存在未提交工作树改动（哈希 `ad41610a…`，相对冻结 S03 `9d9408f5…`）；本窗口只读、未作为改动依据、未修改。

## 下一步

- 等待具名角色（后端/产品/运维负责人）批准 `T-RP-02`；批准后由 `RP09-T01`/`RP09-T02`/`RP12-T02` 实施并通过 `INT-PC03-01` 与 `AC-TRP02-*` 动态验收。
- 本窗口产物冻结，停止写入；集成器可聚合。
