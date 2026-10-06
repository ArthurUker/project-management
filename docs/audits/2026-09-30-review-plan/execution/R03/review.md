# R03 · 项目聚合写入与可见性

状态：COMPLETE。日期：2026-09-30。基线/当前 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本包按任务卡审查项目列表/详情/创建/更新/模板/统计/软删相关调用链，继承历史 B02/B03/B18/B20 复现。本轮未运行动态验证，未修改业务代码或测试。源码摘要见 `source-digests.json`。

## 入口与聚合写入路径

| 操作 | 实际入口与保护 | 提交/可见性边界 |
|---|---|---|
| 列表 | `GET /api/projects`，`projects.view`，`projectVisibilityFilter()` | 负责人或有效成员可见；过滤项目类型时未统一加 `deletedAt=null`。 |
| 详情 | `GET /api/projects/:id`，`projects.view`，`resolveProjectAccess()` 后 `auditElevatedIfNeeded()` | 非成员404；软删项目404；SUPER_ADMIN 非成员会记 elevated 审计。返回活动 task/milestone，但 phases 查询未见 deletedAt 条件。 |
| 创建 | `POST /api/projects`，`projects.create`，服务器发项目编号；创建项目时嵌套创建成员，随后阶段、任务、里程碑、审计分步执行 | 项目主记录先独立提交，子记录写入未包在同一事务；任一后续失败可能返回500但保留项目（B18）。 |
| 更新 | `PUT /api/projects/:id`，`projects.update`，项目成员/能力 resolver；事务内先更新项目，再同步负责人/成员，并按传入数组重建任务/里程碑 | 单事务内可回滚本次子操作，但 `tasks`/`milestones` 数组是替换语义；deleteMany 物理删除，不保留墓碑。成员变更另检查 `manage_members`，任务数组只检查项目 `write`，未检查 `tasks.delete`（B02）。审计在事务外。 |
| 状态批量更新 | `POST /api/projects/batch-update-status`，逐项目 resolver + `transition` 能力 + 状态机 | resolver 的项目投影不含 status，但业务代码读取 `access.project.status`（B03）；循环逐项写入，没有批次事务。 |
| 模板套用 | `POST /api/projects/:id/apply-template`，resolver + `write` | 基础日期读取 `access.project.startDate`，但 resolver 投影未选择 startDate（B03）；项目模板关联与新阶段/任务在事务内。 |
| 删除 | `DELETE /api/projects/:id` 和批量删除需 `projects.delete` | 软删项目主行；单删路径没有 resolver。任务子记录未在此路径直接改写。本包按计划不把它扩大成普通角色可利用发现，因为未证明默认普通角色拥有该权限。 |
| 统计 | `GET /api/projects/stats/types`、`/stats/status`，`projects.view` + visibility filter | 可见性有过滤，但没有统一排除软删项目（B20）。 |

前端 `EditProjectModal` 将表单 status、负责人、参与者、任务、里程碑数组及日期打包发至 `projectAPI.update()`（`EditProjectModal.tsx:237-277`；端点封装 `frontend/src/api/endpoints/projects.ts:11-42`）。这意味着一个编辑提交可同时触发普通字段和任务/里程碑替换；当计划已加载时，即使用户只改项目信息，表单仍携带完整数组。历史报告已证实嵌套硬删与状态报错；本轮未启动 UI。

## B02 · P1 · SUPPORTED · 项目更新绕过子实体删除权限并物理重建

**入口与前提：** 项目成员具有 `projects.update` 和项目 `write` 能力；PUT body 含 `tasks` 数组（例如空数组）。历史夹具使用有效项目成员。默认 MANAGER 含 `projects.update`，但默认 MANAGER 权限列表不含 `tasks.delete`（`seed.js:267-300`；`constants.js:48-80` 将任务删除定义为独立解冻权限）。

**当前调用链（S）：** `PUT /:id` → `resolveProjectAccess()` → `assertProjectCapability(access,'write','projects.update')` → 若 body 含 tasks，再次只检查项目 `write` → `tx.task.deleteMany({where:{projectId:id}})` → 按传入数组 createMany（`projects.js:307-357,402-438`）。里程碑路径同样先 `tx.milestone.deleteMany` 再按数组 createMany（`440-455`）。

**历史动态证据（H，仅继承）：** `backend-results.json#B02_PROJECT_NESTED_HARD_DELETE` 记载专用 `DELETE /tasks/:id` 返回403；同成员经项目 PUT 携带 `tasks:[]`、`milestones:[]` 返回200，原任务物理缺失。当前代码未变化且直接对应该路径。本轮没有查历史数据库中关联行数量。

**既有保护/边界：** 更新有项目成员与项目 write 能力；整个更新事务包含主项目、成员与嵌套替换，失败会回滚该事务；直接任务删除另有 `tasks.delete` 权限。上述保护没有在嵌套物理删除处要求同等任务删除授权。物理删除可能影响关联行由 FK onDelete 策略决定；本包未对具体关联计数作实测，不将其写成已观察影响。

**已证明影响：** 有权编辑项目但没有任务删除权限的成员可经数组替换删除任务，历史证据证明数据库行物理消失；同一 handler 对里程碑执行相同物理删除模式，但历史探针未单独陈述里程碑结果。保持 B02 P1。

**建议/验收：** 将嵌套数组改为带实体ID的差量命令，逐项做创建/更新/删除授权与项目能力校验；删除按业务墓碑/同步协议处理；保留无法识别的客户端ID并拒绝静默全量替换。验收无 `tasks.delete` 的角色通过任何更新入口都不能删除任务，且保留任务ID、关联与客户端同步一致性。

## B03 · P1 · SUPPORTED · 状态与模板日期读取授权投影中不存在的字段

`resolveProjectAccess()` 查询只选 `id, code, name, deletedAt, managerId` 并将其作为 `access.project` 返回（`projectAccess.js:21-25,49-55`）。项目 PUT 状态转换用 `access.project.status` 比较当前状态并查 transition map（`projects.js:331-342`）；批量状态更新亦读取 `access.project.status`（`790-792`）。模板应用以 `access.project.startDate` 作为缺省基准日（`apply-template`，`662-673`）。schema 确有 Project.status/startDate 字段，但 Prisma select 未取即无法由该结果提供字段（`schema.prisma:591-607`）。

历史 H `backend-results.json#B03_PROJECT_STATUS_UNDEFINED` 记录合法 `PLANNING→IN_PROGRESS` 请求返回400，错误文本显示 `undefined`。旧报告还记录模板起始日期路径。当前代码直接支持两处字段缺口，模板日期的实际生成差异本轮未动态重放。`EditProjectModal` 默认将 status 随更新提交（`EditProjectModal.tsx:256-275`），因此状态问题可能阻断带该字段的普通编辑；历史证据确认状态请求失败，但本轮没有逐表单端到端复核。

建议把授权上下文与业务快照分离：resolver 明确返回授权必需投影，业务命令按需另取状态/日期字段，避免把窄 select 当完整 Project。验收覆盖合法状态流转、状态不变普通编辑、模板无显式 startDate 时使用项目 startDate；非法转移仍拒绝。

## B18 · P1 · SUPPORTED · 项目创建跨多个独立提交边界

`POST /projects` 先经 `prisma.project.create()` 建立项目和成员（`projects.js:198-241`），随后分别建 phase、task、milestone（`243-289`），最后才写 audit（`291-303`）；这些步骤没有共同 `$transaction`。历史 H `backend-results.json#B18_PROJECT_CREATE_PARTIAL_COMMIT` 记载注入 task 外键失败后 HTTP 500、项目仍已提交且任务数为0。当前顺序源码一致，失败清理逻辑未发现。

已证明影响仅为失败响应与孤立/半成品项目同时存在；可能造成重试重复创建是风险路径，历史证据未计数重试行为。项目编号在聚合创建前独立发号，消耗编号可能形成空档，是否允许编号空档需按规则确定。建议先验证输入与关联，再以一个数据库事务创建项目/成员/phase/task/milestone；审计若不能同事务，定义可靠 outbox/补偿语义。验收在每个子步骤故障时项目聚合不留部分提交、回执可安全重试。

## B20 · P2 · SUPPORTED · 普通项目列表/统计未统一排除软删

`GET /projects` 以 `projectVisibilityFilter()` 起始 where 并叠加类型等条件，但没有 `deletedAt:null`（`projects.js:107-161`）；类型/状态统计同样只用 visibility filter（`633-652`）。相对地详情 resolver 读取 deletedAt 并将软删项目作为404处理（`projectAccess.js:21-28`）。历史 H `backend-results.json#B20_PROJECT_SOFT_DELETE_STILL_LISTED` 观察列表返回1条，該项目详情404。当前代码支持列表/统计 scope 不一致；本轮未逐项复跑搜索、统计或 sync。保持 B20 P2。

建议封装 `aliveProjectScope ∩ visibilityScope` 并复用到列表、统计、搜索、同步；回收站显式使用单独 scope。验收软删对象在列表、分页总数、搜索、统计、详情和同步中的一致性，同时确保存活成员/负责人项目仍可见。

## 已审查的授权范围与未覆盖项

`projectVisibilityFilter()` 令 SUPER_ADMIN 全量可见、其他用户按负责人或有效成员过滤（`projectAccess.js:92-105`）；单项 resolver 拒绝非成员并对软删404。PUT 成员同步检查 `manage_members`（`projects.js:380-400`）。因此本包不把所有项目操作概括为无授权。直接/批量 `projects.delete` 缺少项目 resolver 是代码观察，但按 REVIEW_PLAN 边界，在证明普通角色可获 `projects.delete` 前不升级为可利用问题；P1 解冻码存在不等于默认 MANAGER 拥有该权限。批量状态写入逐项提交以及事务外审计记为结构事实，不新增未复现故障发现。

未覆盖：独立任务/里程碑处理器权限矩阵、模板全部字段转换、历史关联被硬删后的精确级联数、并发更新/CAS、sync对墓碑的响应、面向所有 UI 页面执行浏览器验证。本包采用旧复现证据，没有新增实验。

## 结论

B02 SUPPORTED/P1；B03 SUPPORTED/P1；B18 SUPPORTED/P1；B20 SUPPORTED/P2；新确认发现0。R03 COMPLETE，表示该包审阅及证据记录完成，不表示问题已修复或系统验收通过。
