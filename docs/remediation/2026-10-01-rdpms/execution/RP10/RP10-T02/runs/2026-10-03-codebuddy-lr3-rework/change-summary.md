# RP10-T02 返工（LR3-01）— POST 无行/恢复分支旁路

- 任务：RP10-T02（REWORK）；复核发现：LR3-01（P1）；关联历史发现：B10（关联 LR2-01）
- 执行者：CodeBuddy；日期：2026-10-03（session 2026-10-03b）；run：2026-10-03-codebuddy-lr3-rework
- 源码基线：HEAD 138cf2da1b63195cef7e884f69bdf8ded6ed3c21 + 多轮未提交改动（dirty worktree，全程保留，未 reset/clean/stash）
- 门禁：D-S01-07 condition=false（未改 submit 来源状态）→ NOT_APPLICABLE；RP09-T01 仅联合验收依赖

## 缺陷（LR3-01）

POST /api/reports 的「初次按业务唯一键读取无行」分支使用无条件 upsert：竞争请求在窗口内创建并提交同一
projectId+authorId+reportType+periodKey 后，原请求的 upsert 退化为 update，直接覆盖已提交正文
（复核实测 201 + 正文 late-new-POST + ReportVersion 仍为 winner-created + 两条 create 审计 + 两份成功回执）。
该分支不经过共享 saveReportDraft，因此既无状态谓词也无 CAS。

## 写报告正文的全部分支清点（非仅检索 saveReportDraft 调用）

| # | 入口/分支 | 修复前保护 | 本轮处置 |
|---|---|---|---|
| 1 | POST /api/reports 既有活跃草稿 | 共享 saveReportDraft（状态+CAS 原子谓词） | 保留，未改 |
| 2 | POST /api/reports 墓碑恢复 | 无条件 upsert（会复活任意当前行） | 改为条件 UPDATE：仅当该行此刻仍是墓碑（deletedAt not null），否则受控 409 |
| 3 | POST /api/reports 真正新建 | 无条件 upsert（唯一键竞争即覆盖） | 改为 create：唯一键被占用 → P2002 → 既有 409 DUPLICATE_PERIOD_KEY，事务整体回滚 |
| 4 | PUT /api/reports/:id legacy（无基线） | saveReportDraft（状态谓词） | 保留 |
| 5 | PUT /api/reports/:id modern（expectedUpdatedAt） | saveReportDraft（状态+CAS） | 保留 |
| 6 | sync push reports upsert | saveReportDraft（状态+CAS） | 保留，未改 sync.js |
| 7 | sync push reports 离线新建 | create；唯一键冲突 → sync 记 rejected | 已受控，未改 |
| 8 | submit / recall / approve / reject | 只改状态/版本与审阅字段，不写正文 | 保留 |

## 实际文件变化

- rdpms-system/backend/src/routes/reports.js（唯一业务改动，execute 分支）
  - 删除 tx.report.upsert({ update: { content, …, deletedAt: null } }) 旁路；
  - 新增墓碑恢复分支：tx.report.updateMany({ where: { id, deletedAt: { not: null } }, data: { content, updatedById, deletedAt: null } })，count === 0 → 409 CONFLICT（不删除版本、不重置 status/currentVersion）；
  - 新建分支改为 tx.report.create(...)，审计 action 由实际分支决定（恢复=UPDATE + restoredFromTombstone，新建=CREATE），不再用陈旧的 current 推断。
- rdpms-system/backend/src/modules/reports/reportCommands.ts：本轮未改动（上一轮的状态+CAS 谓词保持原样）。
- rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs：新增 A01–A06b 共 8 个用例与屏障 helper（既有 9 个用例全部保留，合计 17）。

## 保留的既有合同

权限（reports.create / reports.update）、作者归属、项目 write 能力、周期键校验、legacy 无基线兼容、
合法同 key 回放（含提交后重试）、业务/审计/回执同事务、submit 行锁与并发版本唯一分配、当前 submit/resubmit 来源状态政策。

## 反例对照（证明新断言有捕获力）

evidence/negative-control/attempt-01：临时恢复无条件 upsert 后，A02/A03/A03b/A06/A06b 共 5 条失败
（前者因屏障未命中而超时，A06 因缺少受控恢复审计失败）；还原后 17/17 通过。

## 兼容与影响边界

- 仅影响此前会错误成功的两类并发写入：竞争出现的活跃行、竞争已恢复的墓碑行。
- 正常单请求语义不变：合法新建仍 201、既有草稿保存仍 201、墓碑恢复仍 201。
- 无字段/结构/迁移变化；未改前端、sync.js、共享测试 helper。
