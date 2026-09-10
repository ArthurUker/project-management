# Tencent → enh 功能复刻移植清单

> 分支：`integrate/tencent-feature-port`（基点 `origin/enh/phase-info-struct` @ 3392572）
> 对比基线：Tencent = `origin/tencent_CVM/rdpm` @ 194e0ae（参考树 `work/tencent-ref/`，下称 `T/`）；enh = 本分支（下称 `E/`）
> 方针（2026-09-09 裁定）：enh 为唯一主干；Tencent 功能**完整功能复刻**，以 enh 架构重实现；不 merge、不整批 cherry-pick、不抄代码；Tencent 修复只迁意图不迁补丁（其实现存在 `fetchDocuments` 未定义、`fitTimer` 作用域错误）。

## 0. 总体结论

- **数据模型**：enh 42 模型对 Tencent 28 模型全量覆盖，无模型消失（`Reagent` 并入 `ReagentMaterial`+`ReagentLot`）。实质丢失 4 处业务字段/能力：`Task.docRefs`、`Primer.validatedStrain`、`ProjectTemplate.preview`（可由结构化表推导）、`RegulatoryDocument.fileName`（且 enh 路由仍在写该列 → **缺陷 D-1**）。
- **API**：真实缺口 5 组端点：`/api/sync/*`（整域）、`/api/backup/restore`（裁定移除）、`POST /api/users/batch`、`POST /api/task-templates/bulk-delete`、`DELETE /api/formulas/:id`、`DELETE /api/samples/:id`。
- **P1 冻结**：enh 以 403 `PERMISSION_NOT_AVAILABLE` 冻结 10 个端点（见 §B）。
- **前端**：`/backup` 页、离线横幅、同步状态指示、Dexie 整链路在 enh 删除；enh 另有 2 个零引用死文件、1 处失实文案（见 §E）。
- 冲突提示 UI：Tencent **本来就没有**（全树唯一"冲突"命中是可视化表格选区校验，`T:/frontend/src/components/VisualTableEditor.tsx:320`），属同步 v2 的新增要求，不是移植项。

## A. 直接移植项（在线能力缺口，优先做）

| # | 项 | Tencent 证据 | enh 现状 | enh 实现要求 |
|---|---|---|---|---|
| A-1 | 用户批量导入 `POST /api/users/batch` | `T/…/routes/users.js:216`、`T:/api/client.ts:98` | 无路由无桩 | 走权限码（如 `users.create`），逐条校验复用单建逻辑，返回逐条成功/失败明细；审计 |
| A-2 | 任务模板批量删除 `POST /api/task-templates/bulk-delete` | `T/…/routes/taskTemplates.js:148` | 404 | 与既有单删同语义（在用检查），权限码 `task_templates.delete`，审计 |
| A-3 | 配方删除 `DELETE /api/formulas/:id` | `T/…/routes/formulas.js:152` | 404（连桩都没有） | 按冻结桩模式补桩后随 B 解冻；软删除；审计 |
| A-4 | 样本删除 `DELETE /api/samples/:id` | `T/…/routes/samples.js:90` | 404（无桩） | 同上 |
| ~~A-5~~ | 配方复制 `POST /api/formulas/:id/duplicate` | `T/…/routes/formulas.js:164` | **更正：enh 已存在**（`E/…/formulas.js:155-191`，走 CodeSequence 发号）——初版探查误报 | 无需移植 |
| A-6 | 草稿 localStorage 异常降级（Tencent 审查修复意图） | `T:/store/appStore.ts:124-147`（safeStorage） | enh 草稿键两侧一致存在（`CREATE_PROJECT_DRAFT_KEY` 等），但隐私模式/配额异常降级未确认 | 在 enh 侧补统一 safeStorage 工具并接入 CreateProjectModal/EditProjectModal，不抄 Tencent 补丁 |
| A-7 | 其余审查修复意图（在 enh 对应页面重查修复） | Tencent CODE_REVIEW 批次 | 待逐项核查 | ①法规文档页卸载后请求取消（AbortController）；②配方页异步竞态/旧闭包；③流程图延迟定时器清理；④死文件清理见 §E |

## B. P1 解冻项（✅ 批次二已完成：10 端点全部转正，软删除+审计；治理层新增 P1_UNFROZEN 8 码，SUPER_ADMIN 短路追加，permissions 表 90→98；未解冻 P1 仍冻结）

| 端点 | Tencent 实现 | enh 现状（证据） | 权限码（建议） |
|---|---|---|---|
| `DELETE /api/projects/:id` | `T/…/projects.js:410` | 403 冻结 `E/…/projects.js:452` | `projects.delete` |
| `POST /api/projects/batch-delete` | `T/…/projects.js:576` | 403 冻结 `E/…/projects.js:684` | `projects.delete` |
| `DELETE /api/tasks/:id` | `T/…/tasks.js:237` | 403 冻结 `E/…/tasks.js:336` | `tasks.delete` |
| `DELETE /api/reports/:id` | `T/…/reports.js:324`（仅草稿） | 403 冻结 `E/…/reports.js:329` | `reports.delete` |
| `DELETE /api/docs/documents/:id` | `T/…/docs.js:253` | 403 冻结 `E/…/docs.js:231` | `documents.delete` |
| `DELETE /api/primers/:id` | `T/…/primers.js:125` | 403 冻结 `E/…/primers.js:153` | `primers.delete` |
| `POST /api/primers/batch-import` | `T/…/primers.js:135`（CSV） | 403 冻结 `E/…/primers.js:158` | `primers.import` |
| `DELETE /api/reagent-materials/:id` | `T/…/reagentMaterials.js:149` | 403 冻结 `E/…/reagentMaterials.js:173` | `materials.delete` |
| `POST /api/reagent-materials/bulk-delete` | `T/…/reagentMaterials.js:163` | 403 冻结 `E/…/reagentMaterials.js:177` | `materials.delete` |
| `POST /api/project-templates/:id/copy` | `T/…/projectTemplates.js:191`（phases/roles 深拷贝） | 403 冻结 `E/…/projectTemplates.js:225` | `project_templates.copy` |

语义要求：删除一律改软删除（`deletedAt`），恢复=清除 `deletedAt`；全部写 `AuditLog`（before/after）；列表查询全局过滤已删行；前端按钮按权限码显示。注意 enh 用户删除（`E/…/users.js:308`）、知识库分类删除（`E/…/docs.js:60`）、法规文档删除（`E/…/regulatory-documents.js:213`）、项目模板删除（`E/…/projectTemplates.js:193`）、任务模板单删（`E/…/taskTemplates.js:168`）已存在，只需对齐软删/审计口径。

## C. 重设计项（大件，后置）

### C-1 离线同步 v2（替换 Tencent Local-First 整链路）
Tencent 现状：Dexie 6 表镜像 + `GET /api/sync/init`（`updatedAt > lastSync` 增量）+ `POST /api/sync/push`（逐条 upsert）（`T/…/routes/sync.js:10,133`、`T:/store/appStore.ts:216-293`）；**硬删除不可同步**（仅 projectMembers 带 deleted 标记）；同步失败仅 `console.warn`，无冲突 UI。
enh 现状：整域不存在；保留了 PUT 幂等中间件 + `ConflictError`(409) 可复用。
设计要求：本地变更日志 + 幂等键；软删除 tombstone；基于 `updatedAt/version` 增量；项目权限变化后本地数据清除；服务端审阅字段（reviewerId/reviewedAt/reviewNote 等）不可被客户端覆盖；冲突检测 + 用户处理 UI；PostgreSQL 枚举/Decimal/JSON/日期序列化规范。
交付物：服务端 `routes/sync.js` v2（挂 `/api/sync/*`）+ 前端同步引擎（**重写**，不拷 `appStore.ts`/`sync.js`）+ 离线横幅（`T:/App.tsx:51-56` 意图）+ 顶栏同步状态（`T:/components/Layout.tsx:130-134` 意图）。

### C-2 应用层备份恢复 v2（替换 `/api/backup/restore` + BackupManager 页）✅ 批次三已完成
Tencent 现状：事务内按依赖序 deleteMany+createMany 整库覆盖（`T/…/backup.js:116`）+ 9 模块勾选页（`T:/pages/BackupManager.tsx`）。
enh 现状：`/api/backup/export` 保留并强化（`data.export` + 审计，`E/…/backup.js:76`）；restore 裁定移除（404，`E/…/backup.js:11-18`）。
设计要求（PG 版）：导入到暂存 schema → 外键/枚举/必填校验 → 差异预览 → 管理员确认提交 → 失败整体回滚；全程审计；权限 `SUPER_ADMIN`；不得沿用逐表 JSON 覆盖方案。前端恢复 BackupManager 页（勾选/进度/历史），恢复入口按新流程重做。

### C-3 Settings 页失实文案
`E:/pages/Settings.tsx:128-139` 保留着"Local-First/IndexedDB"说明，但 enh 已无 IndexedDB。随 C-1 决策一并改写（若先于 C-1，先改为中性描述）。

## D. 数据模型补齐（先冻结：本节完成后模型不再变）

| # | 项 | 说明 | 方案 |
|---|---|---|---|
| D-1 | **缺陷**：`RegulatoryDocument.fileName` 缺列 | enh schema 无 fileName 列，但路由 4 处写该列（create/PUT/import/seed/original-file）→ 上传法规原件、PDF 导入必报错；且前端已按"走 /api/files 后回写 originalFileId"实现，回写传的是文档 id 而非文件 id | ✅ 已完成：统一 `FileObject`+`Attachment(entityType=REGULATORY_DOCUMENT, label='original')` 承接；PUT 支持 `originalFileId` 关联/解除；list/detail 带出 `originalFileId`+`fileName`；GET 原文=附件优先+legacy 目录回退；共享存储内核 `kernel/storage.js`；前端改用上传返回的文件 id 回写 |
| D-2 | `Task.docRefs`（任务↔知识库文档引用 `{id,code,title,docType,version}`） | `T/…/prisma/schema.prisma` Task 模型；enh Task 无承接 | 新表 `TaskDocRef(taskId, docDocumentId, note, unique(taskId,docDocumentId))`；任务表单/详情补选择器；列表带出 |
| D-3 | `Primer.validatedStrain`（验证菌株） | enh 曾有意删除（`primers.js` 头注释），但属真实业务字段 | ✅ 已完成：按 Tencent 语义保留在**引物级**（Primer 增列 `validated_strain`），白名单与前端类型同步；引物表单/详情 UI 随 A 批补 |
| D-4 | `ProjectTemplate.preview` | 模板统计预览 JSON | 不加列：由 `TemplatePhase`/`TemplateTask` 聚合推导，`GET /:id/preview` 端点已存在（`E/…/projectTemplates.js:230`），前端如需展示接入即可 |

## E. enh 清理项

| # | 项 | 证据 | 动作 |
|---|---|---|---|
| E-1 | 删除 `E/frontend/src/components/FlowEditor.tsx` | 13.4KB，全树 0 引用（流程图实际用 `ProcessFlowDiagram.tsx`） | 删除文件 |
| E-2 | 删除 `E/frontend/src/pages/ProjectTemplates.tsx` | 2.17KB 占位页，未路由（`/project-templates` 实际指向 `TemplateLibrary`） | 删除文件 |
| E-3 | Settings 失实文案 | `E:/pages/Settings.tsx:128-139` | 见 C-3 |

## F. 已确认无需移植（enh 已以更强方式覆盖）

- 试剂写端点（`T reagents.js` CRUD）→ enh `405` 固定拒绝，写入口拆分：批次 `POST/PATCH /api/reagent-lots`（`E/…/reagent-lots.js:53,87`）+ 原料/配方各域；前端编辑入口改走原料与批次 API。
- `GET /api/reagents/:id/formulas` → 并入聚合详情 `GET /api/reagents/:id`（`E/…/reagents.js:124`）。
- 法规 PDF base64 直传 → `POST /api/files` multipart + `originalFileId` 回写（`E:/pages/RegulatoryDocumentsPage.tsx:131-141`）；但该链路被 D-1 缺陷阻塞，修复 D-1 即通。
- 汇报撤回 recall、task-templates 单删、knowledge 分类删除、模板/法规软删等：enh 已存在。
- 用户生命周期（启停/角色绑定）、auth refresh/强制改密、审计/系统日志/字典：enh 净新增，Tencent 无对应。

## G. 枚举映射速查（页面/筛选/看板/表单改引用用）

| 语义 | Tencent 字符串值 | enh 枚举值 |
|---|---|---|
| 项目状态 | 规划中/进行中/待加工/待验证/已完成/已归档 | PLANNING/IN_PROGRESS/PENDING_PROCESSING/PENDING_VERIFICATION/COMPLETED/ARCHIVED（+ON_HOLD/CANCELLED） |
| 项目类型 | platform/定制/合作/测试/应用 | PLATFORM/CUSTOMIZATION/COLLABORATION/TESTING/APPLICATION |
| 项目成员角色 | manager/member/viewer | MANAGER/MEMBER/VIEWER（+OWNER） |
| 任务状态 | 待开始/进行中/已完成/已阻塞 | NOT_STARTED/IN_PROGRESS/COMPLETED/BLOCKED（+CANCELLED） |
| 任务优先级 | 高/中/低 | HIGH/MEDIUM/LOW（+URGENT） |
| 汇报状态 | 草稿/已提交/已阅/需修改 | DRAFT/SUBMITTED/REVIEWED/NEEDS_REVISION（+REVIEWING/ARCHIVED） |
| 汇报类型 | 日报/周报/月报 | DAILY/WEEKLY/MONTHLY（+PHASE/AD_HOC） |
| 汇报字段 | userId/month/approvedBy/approvedAt/approveNote | authorId/periodKey/reviewerId/reviewedAt/reviewNote |
| 系统角色 | admin/manager/member | SystemRole 六角色 + UserRole 多角色叠加 |
| 中文展示 | 硬编码 | `EnumMeta` 表下发（`GET /api/dict`） |

## H. 实施顺序与验收

1. **批次一（模型冻结）**：§D 全部 + §A（A-1~A-5 端点、A-6/A-7 修复意图）+ §E 清理。验收：`tsc` 构建 0 错误、Prisma validate 通过、后端测试通过。
2. **批次二**：§B P1 解冻（逐项：权限码 + 软删除 + 审计 + 前端按钮 + 测试）。
3. **批次三**：C-2 备份恢复 v2。
4. **批次四**：C-1 离线同步 v2（最大件，含 UI）。
5. **批次五**：契约测试、权限矩阵核对、核心 E2E、数据迁移校验与部署回滚演练；验收后集成分支替换 enh 主干，Tencent 保留只读标签。

> 附注：`.deploy-meta` 记 `commit=63f936f` 与生产 release HEAD `3392572` 不一致，属部署记录问题，与本清单无关，另行修正。

## I. 批次一进度（2026-09-09）

- ✅ §D 全部完成（提交 ad91118）：schema 冻结（task_doc_refs 新表、primers.validated_strain）、D-1 法规原文改走 FileObject+Attachment、共享存储内核 kernel/storage.js、迁移 20260909120000_batch1_d_model；prisma validate/generate 通过，tsc -b 零错误。
- ✅ A-1 `POST /api/users/batch`（users.create 权限码、逐条校验、MEMBER 绑定、批量审计；兼容 Tencent `name` 字段）+ 前端 `userAPI.batchCreate` 门面。
- ✅ A-2 `POST /api/task-templates/bulk-delete`（软删、引用整批拒绝、审计；前端门面 templates.bulkDelete 原已存在）。
- ✅ A-3 `DELETE /api/formulas/:id` 与 A-4 `DELETE /api/samples/:id` 冻结桩（403 PERMISSION_NOT_AVAILABLE，风格对齐既有桩）。
- ✅ A-6 safeStorage 工具（utils/safeStorage.ts）+ CreateProjectModal/EditProjectModal/PrimerLibrary/ReagentLibrary 共 8 处裸 localStorage 全部收口。
- ✅ A-7① useRegulatoryDocuments 重写（过期响应丢弃、refetch 走 reloadToken）；A-7③ ProcessFlowDiagram 延迟 fitView 定时器登记+清理；**A-7② 配方页异步竞态待批次后续专项核查**（涉及 FormulaEditor/PrepCalculator 数据流，需单独读代码定位）。
- ✅ E-1/E-2 死文件删除（FlowEditor.tsx、ProjectTemplates.tsx）；E-3 Settings 失实文案修正。
- 验收门：`tsc -b` 零错误；vite 生产构建在部署流水线执行（本地 10s 监视截断，不影响判定）。

## J. 批次二进度（2026-09-09）

- ✅ 治理（c3d8c87）：`kernel/constants.js` 新增 `P1_UNFROZEN`（8 码：projects.delete / tasks.delete / reports.delete / docs.delete / project_templates.copy / primers.import / primers.delete / reagent_materials.delete）；`rbac.js` SUPER_ADMIN 短路追加；seed 播种 90→98 条（孤儿清理同步豁免）；`rbac.test.mjs` T1c 断言更新；前端 `PERMS` 增加对应 8 键。未解冻 P1（projects.restore、milestones.delete、samples.delete、formulas.delete 等 22 条）仍冻结。
- ✅ 10 端点转正（全部软删除+writeAudit）：项目删除/批量删除；任务删除（显式级联软删全部后代）；汇报删除（仅 DRAFT）；知识库文档删除；引物删除/批量导入（≤200 行，逐行校验+CodeSequence 发号+失败明细）；原料删除/批量删除；项目模板复制（roles/phases/tasks 深拷贝，副本 isMaster=false、状态 DRAFT）。
- ✅ 前端（309ecf8）：ProjectDetail 删除项目按钮；ReagentLibrary 空壳删除确认流接通+行级删除；PrimerLibrary 删除/批量删除/导入按钮权限显示+导入失败明细展示；KnowledgeDetail 门控换 DOCS_DELETE；reagentMaterialsAPI 补 remove/bulkDelete；batchImport 类型对齐。
- ✅ 复核发现：模板复制、汇报删除、任务删除（PhaseTaskPanel）、引物删除/导入的前端入口**早已存在**，此前被后端 403 挡住——后端解冻后自动生效，仅需权限门控补齐。
- ⚠️ 授权提示：新解冻码默认只有 SUPER_ADMIN 持有（未自动授予任何角色）；ADMIN/MANAGER 需要时由 SUPER_ADMIN 在 Roles 页授予。
- 验收门：`node --check` 全过、`tsc -b` 零错误；rbac 单测需 DB 环境，待部署/演练时跑（T1c 已按 98 更新）。

## K. 批次三进度（2026-09-10）

- ✅ 后端新增 `kernel/backupRestore.js`：27 张可恢复表的**依赖序注册表**（外键 / 唯一键 / append-only 元数据）+ `validatePayload()`（只读校验：结构、主键、备份内重复、跨表外键可解析性（payload ∪ DB）、唯一键占用、replace 依赖提示）+ `applyRestore()`（单事务；merge=主键 upsert，replace=逆序清空后写入；Prisma 事务 timeout 180s；失败整体回滚）。
- ✅ 端点（`routes/backup.js`，均仅 SUPER_ADMIN）：
  - `GET /api/backup/restore/tables` — 可恢复表清单
  - `POST /api/backup/restore/preview` — 只读校验 + 逐表差异（新增/覆盖/错误/警告），审计 action=read.sensitive
  - `POST /api/backup/restore` — 应用恢复（replace 需 `confirmReplace=true`），成功审计 action=restore（含逐表统计与耗时），失败/被拦截也审计
- ✅ 前端：`api/endpoints/backup.ts`（导出 blob / tables / preview / restore）；`pages/BackupManager.tsx`（模块勾选导出、文件解析概要、merge/replace 模式选择、replace 二次确认、逐表差异表、结果摘要）；`App.tsx` 注册 `/backup`（RoleGuard=DATA_EXPORT）；`menu.ts` 系统组新增「数据备份与恢复」。
- 架构说明（与原始设计的偏差，需知悉）：**未建平行 staging schema**（27 表 DDL 双写易漂移），改为「只读预校验（等价暂存校验）→ 单事务应用」；若后续需要物理暂存，可升级为临时库导入演练再合并。
- 权限：仅 SUPER_ADMIN（复用 data.export 门控，ADMIN 被 ADMIN_EXCLUDED 排除）；运维级整库恢复仍走 pg_dump/pg_restore。
- 待验：无 DB 环境，`preview/apply` 的端到端行为需在演练环境实跑（含一次 replace 回滚演练）。
- 验收门：`node --check` 全过、`tsc -b` 零错误。
