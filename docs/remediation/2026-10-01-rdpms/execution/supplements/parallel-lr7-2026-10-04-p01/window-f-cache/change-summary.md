# 窗口 F 变更摘要（PREPARATION_ONLY）

窗口：F（cache / 水位 / 撤权 / 最后副本保全）
批次：`parallel-lr7-2026-10-04-p01`
模式：`PROPOSED_APPROVAL_PREPARATION_ONLY`

## 本窗口做了什么

仅生产**待批准材料**，面向决策 `T-RP-04`（提交可见水位与 bootstrap）与 `T-RP-12`（用户可恢复流程与保留）。
复用 `RP13-T02` 已有的 barrier 证据（`WATERMARK_ADR_DRAFT.md`、`attempt-02/barrier-summary.json`、`owned-watermark-barrier.py`），
不重跑任何数据库或浏览器。所有推荐方案保持 `PROPOSED`，签名字段为空。

## 本窗口没有做什么（硬约束）

- 未实施 publisher、ACL、IDB 迁移、缓存删除或 epoch；未激活 `RP13-T03`。
- 未运行真实 DB / browser / JWT / IDB；未改共享台账或其他窗口。
- 未把局部 `barrier` 或 `sequence` 递增当作生产 `safe-watermark` 验收。
- 只读当前 `pull/init cursor`、ACL 投影与前端 `cache/outbox/recovery` 接口，源码事实带当前行号与 SHA256。

## 源码事实锚点（仅引用，不改）

- 后端 `rdpms-system/backend/src/routes/sync.js` SHA256 `ad41610a6036f054533e663089f1584a9c9730a8264c2a62f39448add7672c7f`
  - `GET /init` 在 L369；`upperBound = new Date()` 见 L389/L395；`cursor` 返回 `since`（仍有更多）或 `upperBound`（末页）见 L486。
  - `streamPageWhere` 用 `{ [tsField]: { gt: since, lte: upperBound } }`（L353）——仅时间戳区间，无提交顺序证明。
  - `aclVersionOf` L302–L308；`projectVisibilityFilter` 在 L404 每请求重算 `projectIds`（L404–L413），分页每页为独立 `/init` 调用，故 ACL 每页重查。
  - 页令牌 `signPageState`/`readPageState`（L317/L323）仅绑定 `actorId`+`deviceId`+时间范围；无 `epoch`/`scope-version` 绑定。
  - 当前协议无 source revision / 发布序列 / outbox。
- 前端 `rdpms-system/frontend/src/offline/engine.ts` SHA256 `83f86f613d23e657e6f0de95a149399cbd4d82abb15362337a234811203c7f11`
  - outbox（`idb.outboxPut`）、dead-letter（`idb.deadLetterMove`）、镜像（`idb.recordsPutMany`）。
  - `applyPull`（L189）按页应用；`cursor` 仅在末页提交（L266 `!hasMore`）；ACL 变化触发本地清除（L217–L236）。
  - 会话代次 `sessionGen` 用于账号切换/登出作废在途同步（A03，L448/L530）。
  - `resolveConflict` L370、`retryRejection` L390、`dropRejection` L426、`getRejectedPayload` L417 —— 拒绝项的查看/重推/放弃/取回。
  - `resetOnLogout` L525 把未同步 outbox 转入持久拒绝区；`isolateForeignOutbox` L558 隔离他人变更。
  - 当前**无** oversize / quarantine 处理，**无** epoch / `RESET_REQUIRED` 游标处理，**无** unknown receipt 状态分支。
- 前端 `rdpms-system/frontend/src/api/endpoints/sync.ts` SHA256 `86bdcb749aed588e158aed887bd3a8362fb19a388970a603b58d983e128fd159`
  - `SyncInitResponse`（L48）含 `acl`/`cursor`/`pagination`；**无** `epoch` 字段。

## 复用证据（REUSED_VERIFIED_EVIDENCE）

不伪称本轮重跑。下列来自 `RP13-T02`（日期 2026-10-02 continuous-rework）：

- `barrier-summary.json`：`unsafeSequenceCounterexample` 结果 `PERMANENT_MISS_DEMONSTRATED`（seq 递增可永久漏行）；
  `candidateTransactionalBarrier` 结果 `PASS_FOR_CANDIDATE_SQL_MODEL_ONLY`（仅候选 SQL 模型，非应用实现）。
- `WATERMARK_ADR_DRAFT.md`：选项 3（事务 outbox + 提交可见发布序列）为**测试候选**，未选生产方案、未批准、未实现。

## 产物

见 `WORKER_MANIFEST.json`。决策保持 `PROPOSED`；`independentReview=PENDING`、`release=NOT_EVALUATED`。
