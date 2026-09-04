# 路由层字段/枚举迁移对照表（W10）

> 目的：防止「字段口径漂移」的护栏文档。**schema.prisma 是唯一真源**；
> 任何路由中出现本表左列旧口径即为缺陷。后续模型变更时必须同步更新本表。
>
> 关联文档：`docs/rbac/M-1-RBAC-v1.0-SIGNED.md`（权限真源）
> 执行窗口：W10（2026-09-03），W9 之后收尾。

## 使用方法

```bash
# 检查路由层是否出现旧口径（应全部无命中）
grep -rnE "'(规划中|进行中|待加工|待验证|待开始|已阻塞|已完成|已归档)'" rdpms-system/backend/src/routes/
grep -rn "phaseOrder\|\.phase\b" rdpms-system/backend/src/routes/   # 仅允许局部变量名
grep -rn "projectName\|detectionTarget:" rdpms-system/backend/src/routes/
grep -rn "REGISTRATION_PROJECT_TYPE" rdpms-system/backend/src/routes/
```

---

## 1. Project 模块

| 模块 | 旧字段/枚举/写法 | 新字段/枚举/写法 | 修改文件 |
|---|---|---|---|
| projects | `type: '项目注册管理'`（中文，ProjectType 枚举无此值） | 注册类项目以 `subtype: 'registration'` 标识；创建时 `type: 'CUSTOMIZATION'`；列表过滤 `subtype: { not: 'registration' }` | routes/projects.js、routes/registrations.js |
| projects | `status: '草稿'/'规划中'/'进行中'/'待加工'/'待验证'/'已完成'/'已归档'`（中文状态机） | `ProjectStatus` 枚举：`PLANNING/IN_PROGRESS/PENDING_PROCESSING/PENDING_VERIFICATION/ON_HOLD/COMPLETED/ARCHIVED/CANCELLED`（草稿语义由 `isDraft` 承载） | routes/projects.js、routes/progress.js、routes/stats.js、FE constants/statusColors.ts |
| projects | `generateProjectCode()` = `count()+1`（竞态） | `nextCode(prisma,'PROJECT',{periodKey:year})` 原子发号（PRJ-2026-xxx） | routes/projects.js、routes/registrations.js |
| projects | `manager.select: { name, avatar }`（User 已无此字段） | `displayName` / `avatarFileId` | routes/projects.js、routes/registrations.js、routes/reports.js、routes/stats.js |
| projects | `data: body`（mass-assignment，W9 曾以变量名规避门禁） | `pickAllowed()` 白名单（W10 重写后彻底消除） | routes/projects.js |
| projects | `position` 字段 | `positioning` | routes/registrations.js |
| ProjectMember | `role: 'manager'/'member'`（小写字符串） | `ProjectMemberRole` 枚举：`OWNER/MANAGER/MEMBER/VIEWER`；创建者固定 OWNER；退组置 `leftAt` 不删行 | routes/projects.js、routes/registrations.js |
| Project（关联） | `template.content` JSON 大字段 | 已删除；结构化走 `TemplatePhase/TemplateTask` 行；自由 JSON 兜底 `config` | routes/projectTemplates.js、routes/projects.js(apply-template) |
| milestones | `date` 字段；`status: '待完成'`；`phaseName` 字段 | `dueDate`；`TaskStatus.NOT_STARTED`；phaseName 已删除（归属走 `phaseId`） | routes/projects.js、routes/registrations.js |
| tasks（批量创建） | `status: '待开始'`、`priority: '中'/'高'/'低'`、`phase`/`phaseOrder` 字段、`applicabilityStatus` | `NOT_STARTED`、`MEDIUM/HIGH/LOW`、`phaseId`+`sortOrder`（阶段行化）、`applicability`（`TaskApplicability` 枚举大写） | routes/projects.js、routes/registrations.js、routes/tasks.js |
| tasks | `docRefs` 字段（字符串 JSON，已删除） | 移除；法规/文档关联走 `TaskRegulatoryDocument` | routes/tasks.js |

## 2. Tasks 模块

| 模块 | 旧字段/枚举/写法 | 新字段/枚举/写法 | 修改文件 |
|---|---|---|---|
| tasks | `PATCH /:id/status` 传 `'已完成'`、看板分组 `'待开始'/'进行中'/'已完成'/'已阻塞'` | `COMPLETED` 副作用（completedAt+progress=100）、`startedAt`；看板分组键 `NOT_STARTED/IN_PROGRESS/COMPLETED/BLOCKED` | routes/tasks.js、FE components/KanbanBoard.tsx |
| tasks | `status !== '已完成'` 等业务判定 | `TaskStatus` 枚举判定（入参兼容归一化 `normalizeStatus`，仅做迁移过渡） | routes/tasks.js |
| TaskDependency | `dependencyType String @default("FS")`（Q-a） | `enum DependencyType { FS SS FF SF }`，默认 `FS`；upsert 键 `taskId_prerequisiteId`；同项目校验 | schema.prisma、routes/tasks.js |
| TaskRegulatoryDocument | `relationType: 'basis'`（小写字符串，Q-a2） | `enum TaskRegulatoryRelationType { BASIS REFERENCE CONDITIONAL POST_MARKET NOT_APPLICABLE }`，默认 `BASIS` | schema.prisma、routes/registrations.js |
| tasks | 前置任务跨项目可挂 | 强制同一项目（400） | routes/tasks.js |

## 3. Registrations 模块

| 模块 | 旧字段/枚举/写法 | 新字段/枚举/写法 | 修改文件 |
|---|---|---|---|
| registrations | `REGISTRATION_PROJECT_TYPE='项目注册管理'` + `STAGE_TRANSITIONS` 中文五阶段 | `subtype='registration'`；`RegistrationStage` 枚举：`DOSSIER_PREPARATION/SUBMISSION_ACCEPTED/TECHNICAL_REVIEW/ADMIN_APPROVAL/CERTIFIED/ARCHIVED` | routes/registrations.js |
| registrations | `prisma.projectRegistrationProfile` | `prisma.registrationProfile`（模型改名） | routes/registrations.js |
| registrations | `currentStage: '资料准备'` 默认值、`riskLevel: '中'` | `DOSSIER_PREPARATION`、`RiskLevel.MEDIUM` | routes/registrations.js |
| registrations | PUT 直接改 `currentStage` | 阶段流转**只**走 `PATCH /:id/stage`（change_stage 权限 + 严格状态机）；PUT/.profile 中拒绝 | routes/registrations.js |
| registrations | `region: body.region \|\| null`（无兜底） | 默认 `MACAO_ISAF` | routes/registrations.js |
| registrations | 模板实例化解析 `template.content` JSON（2 层/3 层兼容代码） | 读 `TemplatePhase/TemplateTask` 结构化行；任务-法规关联用 `TASK_REGULATORY_MAP`（外置 `src/data/reg66TaskRegulatoryMap.js`） | routes/registrations.js、src/data/reg66TaskRegulatoryMap.js |
| registrations | 编号 `REG-${Date.now()}` | `nextCode` 原子发号 | routes/registrations.js |

## 4. Reports / Progress 模块

| 模块 | 旧字段/枚举/写法 | 新字段/枚举/写法 | 修改文件 |
|---|---|---|---|
| reports | `userId`/`month`/`approvedBy`/`approvedAt`/`approveNote` | `authorId`/`periodKey`/`reviewerId`/`reviewedAt`/`reviewNote` | routes/reports.js |
| reports | `status: '草稿'/'已提交'/'已阅'/'需修改'`（中文） | `ReportStatus` 枚举：`DRAFT/SUBMITTED/REVIEWING/NEEDS_REVISION/REVIEWED` | routes/reports.js |
| reports | 唯一键 `userId_projectId_month_reportType` | `projectId_authorId_reportType_periodKey` | routes/reports.js |
| reports | `content: '{}'` 字符串 | `Json`（对象） | routes/reports.js |
| reports | role 判定（`userRole !== 'admin' && ...`）审阅 | `reports.review` 权限 + 项目 `transition` 能力 | routes/reports.js |
| reports | DELETE 草稿端点 | M-1：reports.delete 为 P1 → 403 摘除 | routes/reports.js |
| progress | `month`/`completion`/`submittedBy` | `periodKey`/`completionPercent`/`submittedById` | routes/progress.js |
| progress | 唯一键 `projectId_month` | `projectId_periodKey` | routes/progress.js |
| progress | `projectStatus: '进行中'` | `ProjectStatus` 枚举 | routes/progress.js |

## 5. Docs / Templates / Primers / Materials 模块

| 模块 | 旧字段/枚举/写法 | 新字段/枚举/写法 | 修改文件 |
|---|---|---|---|
| docs | `fileUrl/fileName/version` 字段 | 已删除 → `currentVersion` | routes/docs.js |
| docs | `tags: { contains: keyword }`（字符串） | `tags` 为 text[] → `{ has: keyword }` | routes/docs.js |
| docs | `creator/approver` 关系、`createdBy/approvedBy/approvedAt` | `owner/reviewer`、`createdById/reviewerId/reviewedAt`（DocVersion.createdById 必填=当前登录人） | routes/docs.js |
| docs | `status: 'active'`、`docType: 'sop'`（小写） | `ACTIVE`、`SOP`（DocumentStatus/DocType 枚举大写） | routes/docs.js |
| docs | DocCategory 无 code | `code @unique` 必填（缺省自动生成） | routes/docs.js |
| docs | 搜索端点状态 `'active'` | `ACTIVE` | routes/docs.js |
| taskTemplates | `tags` 逗号串、`priority: 'medium'`、steps `order/assigneeRole/checklist` 串 | `tags` text[]、`TaskPriority` 枚举、`sortOrder/assigneeRoleCode/checklist` text[] | routes/taskTemplates.js |
| taskTemplates | `code` 无（按 name 查重） | `code @unique` 必填（缺省生成）；DELETE 挂 `task_templates.delete`（P0） | routes/taskTemplates.js |
| projectTemplates | `content` JSON、`type`、`createdBy`、`status: 'active'` | `config` Json 兜底 + 结构化 phases/roles 行、`typeLabel`、`createdById`、`ACTIVE`（TemplateStatus） | routes/projectTemplates.js |
| projectTemplates | `projectRoleDefinition`（无 code） | `templateRole`（`code` 必填、`permissions` text[]） | routes/projectTemplates.js |
| primers | `projectName`（文本）、`detectionTarget`（文本）、`speciesLatinName` 等旧字段、`status: 'active'`、`createdBy` | `projectId` 外键、`targetId` 外键（DetectionTarget）、字段已删除、`ACTIVE`、`createdById`；`code` 走 CodeSequence（PRM-） | routes/primers.js |
| reagentMaterials | `category` 自由文本（'未分类'/逗号串）、`mw` 字段、DELETE/bulk-delete、`formulaComponent.reagentMaterialId` | `MaterialCategory` 枚举（未识别→OTHER）、`molecularWeight`、P1 403 摘除、`materialId` | routes/reagentMaterials.js |
| prep/formulas | W9 已迁移（materialId、CodeSequence） | 本轮复核无回归 | routes/formulas.js、routes/prep-calculator.js |

## 6. Stats / Sync / Misc

| 模块 | 旧字段/枚举/写法 | 新字段/枚举/写法 | 修改文件 |
|---|---|---|---|
| stats | `userRole === 'admin'` 全量/成员分支 | `projectVisibilityFilter()`（∩ 模型：managerId 或有效成员；SUPER_ADMIN 全量） | routes/stats.js |
| stats | `status: '进行中'`、`in: ['已提交','已通过']`、report `month` | `IN_PROGRESS`、`SUBMITTED`、`periodKey` | routes/stats.js |
| stats | `assignee.name/avatar`、`reports.where.userId` | `displayName/avatarFileId`、`authorId` | routes/stats.js |
| sync | `/api/sync` 全文件 | **删除**（总控历史裁定：ORCH v2.2 清理项 + smoke `/api/sync → 404` 断言）——非本窗口新增决策 | routes/sync.js（已删）、index.js |
| projectRoles | routes/projectRoles.js（从未挂载的死代码，引用旧 User.name） | **删除**（顺手修复项） | routes/projectRoles.js（已删） |

## 7. W10 新增端点（∩ 接入）

| 端点 | 权限 | 项目 ∩ |
|---|---|---|
| `GET /api/projects/:id/tasks` | tasks.view | read；SA 非成员 elevated 审计 |
| `GET /api/projects/:id/reports` | reports.view | read |
| `GET /api/projects/:id/milestones` | milestones.view | read |
| `GET /api/projects/:id/phases` | project_phases.view | read |
| `POST /api/phases`、`GET /api/phases?projectId=`、`GET/PUT /:id`、`PATCH /:id/status` | project_phases.* | write / transition |
| `GET /api/roles/permission-catalog` | roles.view | —（权限目录） |

## 8. EnumMeta 新增（Q-a/Q-b，seed 展示字典）

| 枚举 | 成员 | 默认 |
|---|---|---|
| `DependencyType` | FS / SS / FF / SF | FS |
| `TaskRegulatoryRelationType` | BASIS / REFERENCE / CONDITIONAL / POST_MARKET / NOT_APPLICABLE | BASIS |
| `RegulatoryDocStatus` | ACTIVE / DRAFT / ARCHIVED / SUPERSEDED | ACTIVE（RegulatoryDocument.status 自 DocumentStatus 切换） |

## 9. W10 本地重建（§6）运行期暴露并修复的缺陷

以下问题静态扫描不可见，仅在真实 DB + 真实 HTTP 下暴露，均已修复并回归验证：

| # | 缺陷 | 根因 | 修复 | 验证 |
|---|---|---|---|---|
| R-1 | `GET /api/files` 404、`POST /api/files` 404、dict 通配吞路径 | `settings/dict/files` 三个 subapp 内部为裸 `'/'` 路由却挂在 `app.route('/api', ...)`，实际注册成 `POST /api`、`GET /api/:enumName`（通配吞掉全局单段路径） | 挂载点改为显式前缀：`app.route('/api/settings', ...)` 等 | smoke P-01/C-01、F-13 全 PASS |
| R-2 | `POST /api/reagents/export` 405 | `reagents.post('/:id')` 405 handler 注册在 `/export` 之前被优先匹配 | 移除无业务意义的 `POST /:id` 405 handler | perm-matrix reagents/export 行 7/7 PASS |
| R-3 | `GET /api/reagent-lots` 500 | include select 引用 `ReagentMaterial.unit`（字段不存在） | 改用 `defaultStockUnit` | perm-matrix reagent-lots 行 7/7 PASS |
| R-4 | 所有登录 500 | kernel/audit.js 使用了未导入的 `AUDIT_ACTION_LIST` | 补 import | 登录/全部用例恢复 |
| R-5 | 非法上传请求返回 404 | files.js 用 `notFound()` 表达「缺少文件字段」 | 改为 `badRequest()` → 400 | smoke F-16 PASS |
| R-6 | `GET /api/backup/restore` 403（应对所有人 404） | `backup.use('*', requirePermission('data.export'))` 全局门禁先于 404 | 门禁收窄到 `/export` 路由 | perm-matrix restore 行 7×404 PASS |
| R-7 | smoke F-12 误报 | 断言引用了未提供的 `NM_TOKEN` 且在 `set -u` 下未安全引用 | 挂 SKIP 条件（与 P-06/P-07 口径一致）+ `${NM_TOKEN:-}` | smoke 33/0/6 |
| R-8 | smoke P-16b 误报 | 无状态 JWT 设计下 access token 到期前仍可访问 `/me`（预期行为），断言语义错误 | P-16b 改为记录 INFO；新增 P-16c「已吊销 refresh 401」真断言 | smoke P-16c PASS |
| R-9 | perm-matrix 在 macOS bash 3.2 无法运行 | `declare -A` 关联数组 | 改平行数组 `TOKENS[i]`；登录响应字段对齐（`.accessToken // .data.accessToken`） | 273 断言全跑 |
| R-10 | perm-matrix 3 行期望过时（W9 基线） | ① PUT projects 零值 UUID：`requirePermission` 先于 handler 内 404（标准 RBAC）② MEMBER 无 primers.create ③ AUDITOR 对外国项目 403 | 按实际语义校准期望列并注明依据 | 273/0/0 |

## 10. 判定顺序语义说明（M-1 §4.2 的落地口径）

```text
1. 资源存在性（404）优先 —— 仅对「真实存在的资源」做成员隐藏（SMOKE_FOREIGN_PROJECT_ID 行：非成员 404 ✓）
2. 对「不存在的资源」（如零值 UUID），权限中间件先返回 403（标准 RBAC；不泄露存在性信息）
3. 系统权限 403 → 项目能力 403 → 放行
```

两条路径均已由 perm-matrix 独立用例覆盖并通过。
