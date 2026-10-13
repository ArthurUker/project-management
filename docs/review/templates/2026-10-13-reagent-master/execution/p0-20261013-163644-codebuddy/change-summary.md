# P0 改动说明（按子项）

执行者：CodeBuddy（本轮 P0 技术修复执行者）。
工作区：独立 worktree `/home/ubuntu/rdpms-wt-p0-20261013-163644`（分支 `p0/template-info-20261013-163644`，起点 `03f9637`）。
生产工作树与生产库全程零变更；未 stage/commit/push/merge/部署/重启服务。

## 新增：统一规范来源

`rdpms-system/backend/src/modules/projectTemplates/canonicalTemplate.js`

- `parseTemplateConfig`：兼容 config 为 JSON 字符串或对象；非法输入返回明确错误（不静默降级）。
- `buildCanonicalTemplate`：config 已表达的顺序/启用/连线/节点信息/编辑值优先；**config 未携带的领域字段按相同任务 ID 从结构化行补全**（description、taskType、applicability、regulatoryPriority、expectedDeliverable、regulatoryNotes、estimatedHours、assigneeRoleCode、code）；未知合法键原样保留；显式 `false/0/''` 不被旧行覆盖；config 新建、无结构化行的节点使用兼容默认值且不伪造交付物/角色。
- `validateCanonicalPhases`：阶段/任务 ID 重复、`nextPhaseIds` 无效引用 → 明确拒绝（保留原数据）。
- `buildInstantiationPlan`：供 apply、新建项目、已有项目套用共用；输出**真实阶段名**（非 key/UUID）、任务领域字段、模板任务身份（`templateTaskId`）、空阶段显式登记、以及 `runtimeUnsupported`（模板可保留但当前项目模型不能表达的能力）。
- `remapCanonicalIds`：复制副本时重映射阶段/任务/连线/子阶段引用。

## P0-01 规范化与保存读回（`routes/projectTemplates.js`）

- 移除旧 `toCompatPhases` / `parseConfigPhases`（仅映射 8 个任务字段，丢弃 type/phaseInfo/events/交付物等）。
- 详情与预览统一经 `buildCanonicalOrThrow()`；**损坏配置返回 `TEMPLATE_CONFIG_INVALID`**，不再静默退回旧表并显示成功。
- `PUT` / `PATCH` 保存时用规范模块合并当前结构化行并校验，写入**完整规范 JSON 对象**（含 `configVersion: 2`）；字符串/对象输入均接受。

## P0-02 复制与预览一致性（`routes/projectTemplates.js`）

- 复制使用同一规范来源，并在副本行创建后**重映射 config 内部 ID**（连线/子阶段/任务引用）；只读取原模板（原模板不受写入影响）；副本仍非母版（`isMaster=false`、`status=DRAFT`）。
- `POST /:id/apply` 改用 `buildInstantiationPlan`：任务携带交付物/适用性/任务类型/监管优先级/模板身份；阶段名使用真实名称；响应增加 `counts`、`emptyPhases`、`runtimeUnsupported`、`source`。
- 计数由规范内容**动态统计**；描述中的旧「57」未通过批量写真实数据库解决，原 description 是否更新待授权。

## P0-03 项目实例化信息保留（`routes/projects.js`）

- `normalizeTaskInput` 与任务字符串白名单新增 `templateTaskId`，落库写入 `tasks.template_task_id`（模板任务身份可追溯）。
- 新建项目：阶段名称改为**模板真实阶段名**（此前直接用 `phaseKey`，会出现 p1/p2 之类显示名）。
- `POST /:id/apply-template` 改用同一规范来源，任务携带 description/交付物/适用性/任务类型/监管优先级/人时；`applicability` 落库前转大写以符合枚举合同。
- **冲突保护**：套用前检查目标项目是否已含该模板的阶段/任务；存在则返回 `TEMPLATE_ALREADY_APPLIED`，事务无部分写入（不删除/覆盖/重置已执行任务与证据，不设计整套合并策略）。
- 权限链、项目能力检查、审计、幂等/事务与全局批量赋值保护均未改动；新增字段走既有 DTO 白名单逐字段受控解析，未放宽全局黑名单。

## 前端补齐（2026-10-13 续做，同一轮 P0 范围）

- `components/CreateProjectModal.tsx`：
  - 本地解析 `parseTemplateContentToPlan` 兼容 `config`（此前只读 `template.content`，接口实际返回 config → 本地路径恒空、退化为 apply 兜底）；
  - apply 载荷映射修正：阶段引用字段是 `templatePhaseId`（此前误读 `task.phaseId` → 恒 undefined，**任务阶段归属丢失**）；计划阶段名改取 `phases[].name`（真实名称，不再出现 p1 之类）；
  - 三条任务提交路径（模板创建 / draft 保存）补齐 `templateTaskId`、`taskType`、`applicability`、`regulatoryPriority`、`expectedDeliverable`、`regulatoryNotes`。
- `api/endpoints/templates.ts`：新增规范载荷类型（`TemplateApplyPayload` / `TemplateInstantiationPhase` / `TemplateInstantiationTask`），`apply` 返回类型由 `unknown` 收紧。
- `pages/TemplateEditor.tsx`：**未修改**——后端 `PUT/PATCH` 保存时已做规范化（字符串/对象输入均接受并写入规范对象），编辑器不改也不会丢字段。

## 真实验收中发现并修复的问题（本轮新增记录）

1. **`routes/projects.js` 缺少 `canonicalTemplate` 模块 import** → 新建项目（POST /projects）与已有项目套用（POST /projects/:id/apply-template）均返回 500。由**真实 HTTP 验收**发现（单元测试与源码检查均无法发现）；已补 import 并验证为 201 / 200。
2. 前端 `CreateProjectModal` 误读 apply 载荷字段（见上）。
3. 前端本地解析只读 `content`（见上）。

## 验证状态（本轮最终）

| 项目 | 结果 |
|---|---|
| 单元/契约测试 | 9/9 PASS |
| 真实导出夹具（AC-P0-01） | PASS（13/65、65 交付物、56+9、零差异） |
| **真实数据库 + HTTP 验收**（AC-P0-02~09） | **PASS**（临时库 + 隔离后端 + 真实 JWT） |
| 后端 `lint:undefined` / `typecheck` | PASS |
| rp04-project-create-aggregate 定向回归 | 5/5 PASS |
| 前端构建（tsc -b） | PASS |
| 后端全量 `npm test`、前端单测、浏览器流程 | NOT_RUN（如实登记） |

