# RP10-T02 返工 — 同修订报告 snapshot/version（写边界与真实状态原子绑定）

- 任务：RP10-T02（REWORK）；复核发现：LR2-01（P1）、LR2-03（P2 证据）；关联历史发现：B10
- 执行者：CodeBuddy；日期：2026-10-03；run：`2026-10-03-codebuddy-b10-rework`
- 源码基线：HEAD `138cf2d`（原审计基线）+ 本轮开始前工作区未提交改动（上一轮连续执行的 RP10-T02/其它包修改，均未提交）
- 门禁：D-S01-07 `condition=false`（未改变 source-state 行为，仅收紧迟到保存）→ NOT_APPLICABLE；RP09-T01 仅验收依赖，不阻塞本返工

## 缺陷（LR2-01 复述）

合法作者的旧兼容草稿 PUT 先通过早期 DRAFT 校验并暂停在真实写入之前，另一个 submit 先提交并落库（status=SUBMITTED、currentVersion=1、版本正文=submit-source），随后恢复的保存仍 200 并把正文改写成 late-draft-write —— 真实 Report 正文与已提交版本不一致，且产生第二份成功回执。

## 实际改动

1. `rdpms-system/backend/src/modules/reports/reportCommands.ts`
   - `saveReportDraft`（普通 API 与同步上行**唯一**写实现）改为始终使用**原子条件 UPDATE**：
     `UPDATE reports SET … WHERE id = ? AND status IN (DRAFT, NEEDS_REVISION) [AND <并发基线>]`
     状态条件与并发基线处于同一谓词；迟到保存阻塞在提交事务持有的行锁上，锁释放后 PostgreSQL 按已提交的新行版本重新求值谓词 → 0 行更新 → 拒绝。
   - 0 行更新时区分原因：行不存在 → 404 `REPORT_NOT_FOUND`；真实状态已锁定 → 409 `INVALID_STATE`（"汇报已提交或已审阅，内容已锁定"）；否则（并发基线过期）→ 409 `CONFLICT`（"数据已被他人修改，请基于最新版本重试"，与改动前文案一致）。
   - 新增 `import { REPORT_EDITABLE_STATUSES } from '../access/writeGuards.js'`（**只读引用**，未修改共享 guard 文件，与 `isReportLocked` 同一真源）。
   - 删除原先「无 CAS 时无条件下 `report.update`」的分支（正是 LR2-01 的入口）。
2. `rdpms-system/backend/src/routes/reports.js`
   - `POST /api/reports`（按唯一键保存既有草稿分支）改用共享命令 `saveReportDraft(tx, { patch: { content }, cas: { updatedAt: … } })`，与 PUT / 同步上行同一写边界；原先此处自写的 `updateMany`（只带基线、不带状态）具备同一竞态缺口。
   - 该分支冲突文案由"该汇报已被他人修改…"变为共享命令的统一 `CONFLICT` 文案（错误码不变，仍为 409 `CONFLICT`）；无测试断言该文案。
3. `rdpms-system/backend/tests/helpers/stubDeps.mjs`（测试夹具，非业务代码）
   - `$queryRaw` 由 `unimplemented` 改为记录型实现（返回 `[]`）：上一轮为 submit 增加的行锁语句使 4 条契约用例 500（**改动前即失败**，非本次引入）。
   - `matchesWhere` 支持 `{ in: [...] }` 白名单匹配：否则桩会把新的"仅可编辑状态"谓词当作恒成立，掩盖本缺陷。

## 调用者核对（saveReportDraft 全部调用点）

| 调用点 | 入口 | 本轮是否需改 | 说明 |
|---|---|---|---|
| `routes/reports.js` PUT `/:id` | HTTP 保存 | 否（已走共享命令） | legacy 无基线 / modern 带 `expectedUpdatedAt` 均受益 |
| `routes/reports.js` POST `/` 既有草稿分支 | HTTP 保存 | **是**（改用共享命令） | 见上 |
| `routes/sync.js` push → reports upsert | 同步上行 | 否（已走共享命令，未改 sync.js） | 409 `INVALID_STATE` 由 sync 映射为 `rejected`，不产生成功 `applied` 回执 |

## 明确保留（未改变）的语义

- 现代 CAS：客户端 `expectedUpdatedAt` 仍作为原子谓词；过期基线仍 409 `CONFLICT`。
- legacy 既有可编辑状态：仍只允许 `DRAFT` / `NEEDS_REVISION`（`REPORT_EDITABLE_STATUSES`，与 `isReportLocked` 同源）；`assertLegacyCompatAllowed`（草稿且非实验科学数据）不变。
- 合法原 key 回放：`withIdempotency` 的回执回放不受新状态检查影响（回放不进入 validate/execute）；失败路径与新 key 不冒充回放。
- submit/resubmit 来源状态政策：未改动（不触及 D-S01-07）；submit 仍在同一事务 `FOR UPDATE` 后重读并快照该锁定修订；多次不同 key 提交仍生成递增版本。
- API/Schema：无字段、无响应结构、无迁移变化；仅新增 409 `INVALID_STATE` 的**迟到保存**分支（此前该场景会 200 覆盖）。

## 兼容与风险

- 客户端影响：并发「提交先完成」的迟到保存由 200 变为 409 `INVALID_STATE` —— 这是修复目标，不是回归；离线客户端按既有 `rejected` 处理并重新判定。
- 锁持有时间：谓词求值在同一 UPDATE 内，未新增额外往返；与 submit 的行锁顺序一致（均以 reports 行为唯一串行点）。
- 未覆盖：目标/候选环境、真实 JWT 链下的并发（集成测试使用注入 actor）、前端 IndexedDB。
