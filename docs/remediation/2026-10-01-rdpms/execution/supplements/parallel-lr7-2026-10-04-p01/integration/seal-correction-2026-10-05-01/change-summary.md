# 有界封存订正变更摘要 — parallel-lr7-2026-10-05-seal-correction-01

- **执行者**：CodeBuddy（本地有界封存订正执行者），按 `docs/remediation/2026-10-05-parallel-aggregation-review/SEAL_CORRECTION_PROMPT.md` 的有界本地授权。
- **独立裁定**：`MATERIAL_PRESERVED_FINAL_SEAL_REQUIRES_CORRECTION`（REVIEW.md 2026-10-05）。材料/worker输入/六根记录追加可保留；原整体封存 PASS 不可接受，需一次限定在交付元数据的新订正。

## 阶段一：启动登记（只读核验）
- HEAD `138cf2da…` 一致；六根记录当前字节 SHA256 与复核 `currentRootRecordHashes` 逐项匹配（IMPLEMENTATION_STATE `3264584a…`、execution/state `bb46d318…`、HANDOFF `b5723f89…`、execution/handoff `d3c1c498…`、REVISION_HISTORY `7c99bd89…`、EXECUTION_REVISION_HISTORY `e1c760b9…`）。
- 277 冻结受保护文件零漂移；948 worker 文件（A新补正 851 + B19/C14/D18/E15/F18）全匹配；旧 J 17 文件匹配；冻结计划 2335 摘要一致。
- 六根记录真实当前字节已保存到 `evidence/start-snapshots/`，登记 `authorization.json` 与 `start-baseline.json`。

## 阶段二：AG-01 引用合同订正（reference-corrections.json）
- 8 个错误 base 引用（REVISION_HISTORY `versions[26]` 与 EXECUTION_REVISION_HISTORY `entries[17]` 各 4 个）：
  - 2 个 seal 文件（payload-manifest.json / final-integrity.json）原声明 `execution/...` 前缀、却标 REPOSITORY → 实不存在；新 targetRef 改为完整仓库相对路径 `docs/remediation/2026-10-01-rdpms/execution/...` + REPOSITORY。
  - 2 个 review/evidenceLimits 引用原标 PLAN base → 实不存在；新 targetRef 改为 REPOSITORY + 完整路径（amendment-review-01/REVIEW.md 与 readback.json）。
- 34 个缺 base 引用：旧 `evidence/nine-path-evidence-binding.json` 每条 `path` 无 pathBase；新规范化副本 `evidence/nine-path-evidence-binding.json` 采用 REPOSITORY + 完整仓库相对路径，保留原 hash、原执行结果与不同 attempt 限制。
- E 外部材料请求实际路径为 `window-e-revision/evidence/external-client-evidence-request.md`（原 approval-bundle.json 漏 `/evidence/` 段）。

## 阶段三：AG-02 审批字段规范化（evidence/readiness-normalization.json）
- 六个完整规范化节点，含 batchId/windowId/status/scope/workerManifest/actualResults/notRun/pendingApprovals/independentReview/release/writerStopped，并绑定 sourceReadyRef。
- A 取有效新 READY.pendingApprovals（仅交付协议字段补全，无业务门禁）；B～F 逐项从原 `notApproved` 映射为 pendingApprovals，附 sourceField/sourceRef/原值；原字段如实保留，未把缺项标为“无待批”。
- D 真实 manifest SHA256 采用已核对绑定 `0f7a93bd…`，原 `PENDING_SELF_EXCLUDED` 保留为 NONCONFORMING。

## 阶段四：AG-04 计数订正（evidence/seal-scope.json）
- 旧顶层 34 条 → 去重为 32 个唯一输入路径（重复项：A 原 READY.json 与 A 原 WORKER_MANIFEST.json 各一次）；worker 标记 16 历史条目 = 14 唯一文件。
- 构建完整引用图：K 静态产物、旧 J/旧 seal/旧 readback、worker manifest/READY 及其文件、B 额外捕获生成器、复核引用、4 个保持当前字节的非 history 根记录。分别报告 entryCount/uniqueFileCount，禁止以旧 34 充当新固定总数。

## 阶段五：AG-05 方案澄清 / AG-06 回滚边界
- `decision-readiness-addendum.md`：记录 T-RP-02 “任意 500 整体回滚”表述未满足 RP00-T02/FP-06/07/08；需负责人确认提交前/提交后/批次已提交项/unknown 原 key/hash 恢复边界。不修改 C 草案、HTTP 状态政策或推荐值。
- `rollback.md`：仅追加撤回/替代记录、保留封存字节；禁止删除已引用 J 目录、移除 history 条目或回滚业务数据。

## 阶段六：七类交付 + 封存
- 七类交付（authorization/change-summary/evidence/acceptance/rollback/task-state/handoff + REVIEW_ENTRY/resume）落盘。
- 封存固定顺序：定稿 K 静态产物与冻结输入清单 → K/payload-manifest.json（去重、统一 REPOSITORY 真实路径）→ K/final-integrity.json → 两 history 各追加一个唯一订正条目 → K/post-seal-readback.json（完整严格读回）。
- 两 state / 两 handoff 保持当前字节；原 J、A～F、计划与业务代码全部不变。

## 边界
- 不重开 worker、不修业务代码、不重跑控制/构建/测试/数据库；不安装升级；不提交/推送/部署；不调用子代理/切换模型/写记忆；不以顶层 manifest 哈希通过替代完整验收。
- `independentReview=PENDING`、`release=NOT_EVALUATED`。原 54/306、31 开放项、包/旧发现、批准与业务任务实施均不变；原 36 任务未完成实施。
