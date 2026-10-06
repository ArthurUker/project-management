# RDPMS 修复计划接续 — 2026-10-02

## 已完成执行

- RP04-T01：状态/模板日期业务快照与普通list/count/type/status活跃过滤实现已交付；`tsc`缺失导致B03/B20集成验收ENV_BLOCKED，未FIX_ACCEPTED。

- RP02-T01：临时锁恢复、并发失败计数与JWT真实expiresIn实现已交付；构建因本地缺少tsc被ENV_BLOCKED，真实DB验收未运行，B14仍SUPPORTED且未FIX_ACCEPTED。

- RP00-T05：预算、去敏监控与candidate范围登记已交付；静态材料PASS，T-RP-11/T-RP-13仍PROPOSED，数值阈值及动态INT-PC11-01未运行。

- RP00-T04：Bearer/body refresh 与 session-generation 当前源码矩阵及待批准联合合同已交付。静态 artifact PASS；T-RP-09 / PC01仍PROPOSED，INT-PC01-01与批准记录NOT_RUN；不改业务代码、不关闭B15/N-R02-01/N-R02-02。

- RP00-T01：基线/隔离资源/合法鉴权夹具/停止条件登记；完整 PC09 candidate 验证仍 ENV_BLOCKED（本地缺少 `tsc`）。
- RP01-T01 / B17：角色创建DTO本地验收通过；目标环境与release仍NOT_EVALUATED。
- RP00-T02：500恢复静态矩阵完成；TASK与S03-OI-03静态合同交付通过；动态INT-PC03-01 NOT_RUN，PC03 PROPOSED，历史B06仍SUPPORTED/P1。
- RP00-T03：当前检出任务客户端/DTO/route/command/schema revision矩阵已交付；没有业务代码变化。S03-OI-09因缺少完整支持客户端版本/legacy兼容窗口而保持OPEN/NOT_RUN；B16仍SUPPORTED/P2；RP10-T01仍受门禁限制。

## 边界与未完成证据

RP00、RP01包保持IN_PROGRESS。31项历史审计开放状态保留；本轮没有测试、构建、DB、浏览器或并发屏障实验。当前可确认前端包版本 `1.0.0`，不能代表部署或全部受支持版本。动态B16字段/状态/指派/混合PUT/PATCH矩阵NOT_RUN。

## 下一独立就绪子任务

RP04-T02：实现依赖RP00-T01已满足；RP09-T01是验收依赖，按规则只限制validation。RP02-T01和RP04-T01仍需恢复tsc与自有隔离DB补完验收。RP02-T02/RP03仍不得越过T-RP-09；RP01-T02/T03仍等业务规则批准；RP10-T01仍受S03-OI-09限制。

## 最新执行续接（2026-10-02，覆盖上文旧 next 指针）

- RP04-T02 已实施：创建命令先验证聚合输入，再将 sequence、project/member、phase/task/milestone、严格审计和 idempotency receipt 放在一个事务；同键成功重试走现有 receipt 回放。增加 task/sequence/audit/receipt 故障注入集成场景。
- RP04-T02 验证 `ENV_BLOCKED`：源码和测试 `node --check`、`git diff --check` 通过；`npm run build` 因 `tsc` 缺失退出127。没有使用 backend `.env`、没有构建产物、没有隔离DB，因此未运行集成场景。B18仍SUPPORTED/未FIX_ACCEPTED，PC03仍PROPOSED，INT-PC03-01仍NOT_RUN，release NOT_EVALUATED。
- 当前 `IMPLEMENTATION_STATE.json` 与 `execution/state.json` 的 `nextReadyTask` 为 `RP05-T01`。RP04包仍IN_PROGRESS；RP09-T01仅为RP04-T02验收依赖，不阻止该实现。
- 保持不提交、不部署、不升级依赖；后续从 `execution/RP04/RP04-T02/handoff.md` 和 state 接续。


## Latest execution continuation — RP14-T01 (2026-10-02)

- Implemented shared INFECTED byte-read guard used by both `/api/files/:id` aliases and the regulatory original-file attachment alias; the latter now writes a download denial audit before returning 403. Added synthetic clean/infected integration coverage.
- `node --check` for the touched JS route/test files and `git diff --check` passed. `npm run build` failed with exit 127 (`tsc: command not found`); no isolated PostgreSQL or task-owned UPLOAD_DIR existed, so DB/API assertions were NOT_RUN. B11 remains SUPPORTED / not FIX_ACCEPTED; release NOT_EVALUATED.
- T-RP-05 remains PROPOSED and blocks RP14-T02; FAILED/SKIPPED behavior was not changed. Legacy regulatory files without FileObject scan status remain outside this task.
- Next phase-1 ready task recorded as RP17-T01, subject to live dependency/gate recheck.


## RP17-T01 execution (2026-10-02)

`backup-pg.sh` now stages uploads under UP_DIR, links only from a real prior snapshot, creates a SHA-256 file manifest, and publishes the dated snapshot/latest pointer only after sync completes. Owned local filesystem test passed two add/change/delete rounds and an injected rsync exit 23; the first snapshot/manifest remained unchanged and latest stayed on the previous complete snapshot. Synthetic pg tools were used, with no DB connection. Test temp root was cleaned. Exact Linux command/FS validation remains ENV_BLOCKED for RP17-T03; T-RP-11 blocks RP17-T02. D01 stays open.


## RP13-T01 execution (2026-10-02)

Implemented fixed-window keyset paging for upsert/tombstone streams and client cursor commit only after the final page. Added 3001/5001 API integration assertions and a client cursor-boundary unit test. Frontend source TypeScript check passed. Backend build is ENV_BLOCKED (missing `tsc`); frontend `npm test` is ENV_BLOCKED because `fake-indexeddb/auto` is unavailable; DB/API assertions NOT_RUN. B07 remains open: late-committing transactions are not solved by timestamp upper bounds and belong to RP13-T02/S03-OI-01.


## RP13-T02 design preparation (2026-10-02)

Delivered `execution/RP13/RP13-T02/evidence/WATERMARK_ADR_DRAFT.md` as an unsigned option analysis and candidate test design. No option was selected, no code/schema changed, and no decision was signed. S03-OI-01 remains OPEN; T-RP-04/T-RP-10 remain PROPOSED, so RP13-T02 stays IN_PROGRESS / validation NOT_RUN. Next independent task: RP15-T01.


## RP15-T01 static inventory prepared (2026-10-02)

Repository schema and all six migration SQL files were reviewed and hashed. Prepared aggregate-only read-only queries are in `execution/RP15/RP15-T01/evidence/read-only-anomaly-queries.sql`; they were not run. No target DB was accessed. Actual migration drift and anomaly counts remain unknown; S04-OI-01 remains OPEN and RP15-T01 is IN_PROGRESS / validation ENV_BLOCKED. No data disposition or migration is approved. Next independent task: RP19-T01.


## RP19 continuation — 2026-10-02

- RP19-T01 evidence review delivered. Current script and frozen S05 materials still do not establish a shared DB/files checkpoint or an external write barrier. No operator attestation or paired restore was available. R12-N01 remains PENDING; `AC-R12-N01-01`, `PAC-RP19-01`, `TASK-RP19-T01`, and `GATE-S05-OI-02` are ENV_BLOCKED.
- RP19-T04 current-state reconciliation snapshot delivered for all 33 records. It preserves 32 SUPPORTED and one PENDING candidate. Only B17 has local FIX_ACCEPTED evidence; target/release remain NOT_EVALUATED. RP19-T04 remains IN_PROGRESS / ENV_BLOCKED; this is not programme closure.
- Corrected an aggregate-ledger mismatch for RP05-T01 from its existing task-state evidence: implementation COMPLETE, validation ENV_BLOCKED, release NOT_EVALUATED. No RP05 source change was made in this continuation.
- No production/shared host, DB, real `.env`, or restore was accessed. No runtime resource or product source change was made. RP19 package and all 31 frozen audit open items remain OPEN/IN_PROGRESS as applicable.
- Next task pointer: RP13-T02. Its unsigned ADR exists, but acceptance/signoff is blocked by T-RP-04/T-RP-10 approvals and S03-OI-01 transaction-barrier evidence. RP15-T01 remains blocked by lack of a data-owner-approved read-only DB snapshot and target schema confirmation.


## 2026-10-02 continuous execution closeout

Completed RP02-T01, RP01-T01, RP04-T02, RP05-T01, RP08-T01, RP10-T02 and RP13-T02 under the latest bounded authorization. See `execution/continuous-run-2026-10-02/handoff.md` and per-task `runs/2026-10-02-continuous-rework/`. Eight independent-review suites plus final backend build/typecheck passed. All task packages remain IN_PROGRESS; local validation does not imply target/release acceptance. RP13 candidate barrier evidence is model-only and unsigned. No current next implementation task is executable until the listed dependencies, named gates, or required read-only data snapshot become available.


## Final 2026-10-02 continuous execution state

- 54-task implementation ledger: 18 COMPLETE, 34 NOT_STARTED, 2 IN_PROGRESS. Validation: 10 PASS, 7 ENV_BLOCKED, 37 NOT_RUN. See `execution/all54-task-status.csv` and `execution/remaining-task-gates.csv` for exact dependency/gate separation.
- Final eight integration suites: 32/32 pass, each in a separate guarded temporary PostgreSQL DB; backend build/typecheck/diff/syntax checks PASS. RP04-T01/RP07-T01/RP14-T01 gained task-local PASS; RP13-T01 API pagination cases passed while frontend IDB validation remains ENV_BLOCKED.
- All seven directly enumerated continuous tasks have per-task run deliveries. RP13-T02 is candidate SQL evidence only; no watermark/restore design was selected or signed. Frozen audit status and all 31 open audit items remain open; no deployment/release acceptance.
- Current next-ready task is empty because every remaining implementation task has an unmet dependency/applicable gate, or requires the owner-approved read-only snapshot for RP15-T01. Re-evaluate after those exact conditions change.


## 2026-10-02 连续执行后独立复核（最新）

此前closeout的“没有就绪任务”和10项PASS是旧检查点。本复核以当前真实DB反例与缺失覆盖重新裁定：RP10-T02/RP04-T02实施IN_PROGRESS、验证FAIL；RP02-T01/RP08-T01实施COMPLETE、验证NOT_RUN。16项实施COMPLETE、34项NOT_STARTED、4项IN_PROGRESS；验证6 PASS、2 FAIL、7 ENV_BLOCKED、39 NOT_RUN。

下一顺序RP10-T02返工 -> RP04-T02返工 -> RP02-T01补验 -> RP08-T01补验；现有本地连续授权可接续，原业务门禁不代签。详见execution/reviews/2026-10-02-post-continuous/REVIEW.md、PLAN_ADJUSTMENTS.md和NEXT_EXECUTION.md。既有完整run及失败日志冻结，原通过局部证据不删除。所有发布NOT_EVALUATED。

## 2026-10-03 CodeBuddy 连续执行（RP10-T02 / RP04-T02 返工 + RP02-T01 / RP08-T01 补验）

本轮按 `EXECUTOR_PROMPT.md` 与 `execution/reviews/2026-10-02-post-continuous/` 交付四项：

| 任务 | 类型 | 处置 | run |
|---|---|---|---|
| RP10-T02 | REWORK | LR2-01 已在共享保存命令修复（可编辑状态+并发基线同一原子谓词；legacy/modern/sync 同质）；LR2-03 编号纠正已登记；D-S01-07 condition=false；RP09-T01 仅验收依赖 | `execution/RP10/RP10-T02/runs/2026-10-03-codebuddy-b10-rework/` |
| RP04-T02 | REWORK | LR2-02 已在 normalize/ORM 前补顶层原始类型检查；12 类非法输入 400 且无持久残留；未改经理/成员政策 | `execution/RP04/RP04-T02/runs/2026-10-03-codebuddy-b18-rework/` |
| RP02-T01 | VALIDATION_ONLY | 补并发 disable/login 双方向屏障、锁内正确/错误密码持久断言、线性化点登记；无新失败证据故未改业务代码 | `execution/RP02/RP02-T01/runs/2026-10-03-codebuddy-b14-validation/` |
| RP08-T01 | VALIDATION_ONLY | 真实 VIEWER/outsider/零权限/SUPER_ADMIN(elevated) 夹具 + 逐实体权限、字段投影、reports own-only 矩阵；缓存撤权与回填留 RP08-T02 | `execution/RP08/RP08-T01/runs/2026-10-03-codebuddy-b04-validation/` |

反例对照：RP10 移除状态谓词后 legacy 迟到保存用例失败；RP04 禁用顶层检查后 subtype 对象回到 500（与复核反例一致）。两者证明新断言确有捕获力。

测试夹具修复：`tests/helpers/stubDeps.mjs` 补 `$queryRaw` 记录实现与 `{ in: [...] }` 匹配，恢复上一轮 submit 行锁破坏的 4 条契约用例（改动前即失败）。

全 54 任务：实施 COMPLETE 18 / IN_PROGRESS 2 / NOT_STARTED 34；验证 PASS 10 / NOT_RUN 37 / ENV_BLOCKED 7 / FAIL 0。验收矩阵 306 行：PASS 53 / NOT_RUN 228 / ENV_BLOCKED 25 / FAIL 0。全部 release NOT_EVALUATED；31 项冻结审计开放项、原审计、manifest、v1 与两轮复核证据保持不变。


## 2026-10-03 CodeBuddy 独立复核（覆盖上节当前结论，历史交付保留）

最新裁定见 execution/reviews/2026-10-03-codebuddy/REVIEW.md、findings.json、validation-summary.json、NEXT_EXECUTION.md 和 handoff.md。
RP10-T02 IN_PROGRESS/FAIL：已证明 POST 无行分支的迟到 upsert 仍覆盖已提交正文，P1 LR3-01；原PUT/sync修复有效。RP04-T02 COMPLETE/PASS。RP02-T01 COMPLETE/PASS，含独立真实密码校验后 reset 前停用屏障补证，建议固化测试。RP08-T01 COMPLETE/NOT_RUN：普通API合同对照与elevated非空报告/墓碑/pull补验缺项，5/5局部日志保留。
54任务：17 COMPLETE / 3 IN_PROGRESS / 34 NOT_STARTED；验证8 PASS / 1 FAIL / 38 NOT_RUN / 7 ENV_BLOCKED；306验收47 PASS / 3 FAIL / 231 NOT_RUN / 25 ENV_BLOCKED。37项实施未完成。各包仍IN_PROGRESS，发布NOT_EVALUATED，冻结旧发现/开放项不关闭。
下一就绪RP10-T02→RP08-T01补验，不需要新增来源状态/缓存批准来做本范围工作。TASK_GRAPH/PACKAGES运行镜像和两份版本历史已统一；这是记录修正，不是产品验收。业务源码/正式测试未修改，自有隔离验证清理完成；旧run/旧审计/manifest/v1不动。

## 2026-10-03（第二轮）CodeBuddy 连续执行 — LR3-01 返工 / LR3-02 补验 / RP02 固化

| 任务 | 类型 | 处置 | run | 结果 |
|---|---|---|---|---|
| RP10-T02 | REWORK | LR3-01：删除 POST 无行/恢复分支的无条件 upsert；新建改 create（唯一键竞争 → 409），墓碑恢复改条件 UPDATE；清点全部 8 个写正文分支 | `execution/RP10/RP10-T02/runs/2026-10-03-codebuddy-lr3-rework/` | 17/17 + 6 套回归；反例对照 5 项失败 |
| RP08-T01 | VALIDATION_ONLY | LR3-02：七实体普通 API 成对请求、撤销成员资格、SUPER_ADMIN 非空本人报告、真实墓碑正/负例、`?since=` 增量拉取、字段子集；交付 read-contract-matrix | `execution/RP08/RP08-T01/runs/2026-10-03-codebuddy-lr3-validation/` | 11/11（业务代码零改动） |
| RP02-T01 | TEST_ONLY | 固化独立复核的条件更新前停用屏障为正式回归 C01 | `execution/RP02/RP02-T01/runs/2026-10-03-codebuddy-lr3-testonly/` | 12/12（业务代码零改动） |

LR3-03（账本与来源漂移）：TASK_GRAPH、PACKAGES、ACCEPTANCE_MATRIX、FINDING_TO_PACKAGE、IMPLEMENTATION_STATE、
execution/state、两级 HANDOFF、all54/remaining 状态表与两份版本历史均已同步；新验收绑定当前源码 hash。
B04/B10/B14 仍 SUPPORTED；AC-B10-02、AC-B04-02、PAC-RP08-02/03/04、PAC-RP02-02..05 仍 NOT_RUN；
全部 release NOT_EVALUATED；原审计、manifest、v1、三轮复核证据与既有 run 保持冻结。
独立审阅入口：`REVIEW_ENTRY.md`。


## 2026-10-03 第二轮CodeBuddy交付独立复核（最新）

最新独立入口：execution/reviews/2026-10-03-codebuddy-followup/REVIEW.md、validation-summary.json、CONTRACT_ERRATA.md、NEXT_EXECUTION.md、handoff.md。
三个当前本地任务RP10-T02/RP08-T01/RP02-T01接受COMPLETE/PASS，结合执行者日志和独立14项观察：POST新建迟到409、墓碑恢复并提交后迟到恢复409；核心真实SQL语义负对照；七实体相同行字段/权限比较；永久login条件更新屏障再次验证。未独立验收字段安全政策、JWT全链、IDB、目标、联合合同或发布。
原报告负对照四屏障超时/一审计失败不能称五个业务覆盖反例；普通阶段列表仍返回软删阶段，矩阵“一律过滤”表述已追加纠正。这是证据范围修正，没有业务改码。
当前图双轴、接续指针、必要包内镜像和两份版本历史重新核对。18 COMPLETE / 2 IN_PROGRESS / 34 NOT_STARTED；验证10 PASS / 37 NOT_RUN / 7 ENV_BLOCKED / 0 FAIL；306验收53 PASS / 228 NOT_RUN / 25 ENV_BLOCKED / 0 FAIL。36项实施未完成，所有release NOT_EVALUATED。nextReady业务指针null，不重做接受任务；测试完善建议另列，其他任务仍需精确审批/材料/资源条件。
旧run/审阅/审计/v1冻结。业务源码和正式测试未修改；自有资源清理完成；B10/B04/B14和冻结开放项不关闭。

## 2026-10-03 测试合同补充交付（SUP-01/SUP-02/SUP-03）

本轮按 CODEBUDDY_TEST_CONTRACT_EXECUTOR_PROMPT_2026-10-03.md 与 reviews/2026-10-03-codebuddy-followup/ 执行三项补充交付（新增 SUP 编号，不扩 54 任务）：
- SUP-01（RP10-T02 / LR4-01 / B10，TEST_ONLY）：报告并发写入确定性屏障加固（覆盖 create/upsert/updateMany/update 多原语）+ 语义负对照（测试适配层把迟到新建转成真实无条件 upsert，确认坏结果）。仅改白名单测试；rp10 套件 19/19。
- SUP-02（RP08-T01 / LR4-02 / B04，TEST_ONLY）：七实体（projects/projectPhases/tasks/milestones/monthlyProgress/reports/projectMembers）精确行字段键-值对照固化到正式测试。仅改白名单测试；rp08 套件 12/12。
- SUP-03（RP04/RP08 / LR4-04 / B20，REVIEW_ONLY）：阶段软删合同定向核对（普通 API 列表未过滤 deletedAt 为当前实现；软删写仅经同步 push 可达；恢复不可达；同步侧正确）。只读，未改任何代码。
交付目录：execution/supplements/test-contract-2026-10-03/（含 SESSION_SUMMARY.md / REVIEW_ENTRY.md / final-integrity.json / resume.md 与各 SUP 的 7 类交付）。
业务源码 backend/src + frontend/src 相对启动基线零变化（sha256 串联一致 7564dcf2…）；发布保持 NOT_EVALUATED；包未标 COMPLETE；原审计/v1/旧 run/旧复核冻结。


## 2026-10-03 CodeBuddy 三项补充交付的独立审阅

审阅：execution/reviews/2026-10-03-codebuddy-supplements/REVIEW.md。
独立新库复跑报告19/19、同步12/12，build/typecheck/undefined/diff均0；这只支持已执行断言。三项SUP完整交付尚缺，独立裁定REWORK_WITH_SCOPED_PASSES，补充实现IN_PROGRESS、完整validation NOT_RUN；原业务任务接受和54/306轴/统计/门禁/release不变。

缺项：旧屏障原语/恢复后submit/finally、同账号撤权及精确字段表、阶段详情/global/真实调用者/原B20项目范围、真实版本摘要及缺失起点/命令说明、runner异常清理。业务源码未发现越界修改。下一步只按本审阅NEXT_EXECUTION.md补测试/文档/新runner，不做业务修复、不选其他STANDARD任务。CodeBuddy原session及旧审阅/日志保持冻结；旧自报结果保留并由新增独立裁定限定。


---

## 2026-10-03 CodeBuddy 补充返工会话 — test-contract-rework-2026-10-03-cb1（待独立审阅）

- 指令：`execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md`；权威复核：
  `execution/reviews/2026-10-03-codebuddy-supplements/`。
- 范围：SUP-01（TEST_ONLY，父任务 RP10-T02，原映射 **LR4-03**）、
  SUP-02（TEST_ONLY，父任务 RP08-T01，原映射 LR4-02）、
  SUP-03（REVIEW_ONLY，关联 RP04-T01/RP08-T01，原映射 **LR4-02**）；
  共有工作 LR5-04（交付/编号纠正）与 LR5-05（runner 失败清理）。
- 结果：rp10 正式套件 22/22、rp08 正式套件 12/12（各自全新自有 PostgreSQL 库）；
  build / typecheck / lint:undefined / git diff --check 均 0；三次 runner `SIMULATED_CONTROL` 通过；
  stop-fail 保留的自有集群已按记录条件手动释放。
- 业务源码改动数 = 0；只修改两个允许的正式测试，新增文档与证据只在本会话目录。
- 口径：局部套件 PASS ≠ 修复验收；`release = NOT_EVALUATED`；原 54 任务 / 306 验收 / 包状态 /
  门禁 / 31 历史开放项不变；SUP 不加入原任务图。
- 证据：`execution/supplements/test-contract-rework-2026-10-03-cb1/REVIEW_ENTRY.md`、`execution/supplements/test-contract-rework-2026-10-03-cb1/SESSION_SUMMARY.md`、
  `execution/supplements/test-contract-rework-2026-10-03-cb1/delivery-errata.md`、`execution/supplements/test-contract-rework-2026-10-03-cb1/final-integrity.json`。


---

## 2026-10-04 CodeBuddy LR6 有界收尾 — lr6-closeout-2026-10-04-cb1（待独立审阅）

- 指令：`execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md`；权威复核：
  `execution/reviews/2026-10-04-codebuddy-supplement-rework/`。
- 范围与结果：
  - CLOSE-01（LR6-01 / SUP-01 / RP10-T02，TEST_ONLY）：完整业务键或 target id + 必需 marker、
    逐原语同源取参、`draftWriteBarrier` 真实 upsert 形状、legacy/modern/sync 三条旧草稿竞争
    `try/finally` + timer 清理 + 收束；新增 3 条控制用例，原 22 条保留；完整报告套件 **25/25**。
  - CLOSE-02（LR6-02）：新 session runner 记录主流程异常、cleanup 后仍非零、写盘失败非零 + fallback、
    清理各步隔离、stop 失败保留自有根；六项 **SIMULATED_CONTROL** 全部非零（未启动真实数据库）。
  - CLOSE-03（LR6-03）：两 registry 各追加唯一订正 entry（含 correctsRef）；payload/final 封存排除两份 history、
    自身与读回文件；逐文件 hash 读回。
  - CLOSE-04（LR6-04 / SUP-03，文档勘误）：单项目 404 与全局可见性过滤分开陈述，明确全局分支无
    `project.deletedAt` 条件；未改业务代码。
- 复用：SUP-02 按独立复核证据复用（12/12、101/101），本轮未重跑 rp08。
- 边界：业务源码改动 0；同步正式测试未改；原 54/306 轴、包状态、门禁与批准不变；
  `independentReview = PENDING`、`release = NOT_EVALUATED`。
- 入口：`execution/supplements/lr6-closeout-2026-10-04-cb1/REVIEW_ENTRY.md`、`execution/supplements/lr6-closeout-2026-10-04-cb1/SESSION_SUMMARY.md`、
  `execution/supplements/lr6-closeout-2026-10-04-cb1/final-integrity.json`、`execution/supplements/lr6-closeout-2026-10-04-cb1/post-seal-readback.json`。
