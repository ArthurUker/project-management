# P2 必要系统支持 · 设计文档（2026-10-14）

依据 `SYNTHESIS_V2.md` 第 10 节 P2 行。用户已授权 schema 变更（新增表/字段），范围三批全做，顺序 a→b→c。

## 0. 范围、判据与边界

| 批次 | 能力 | 完成判据 |
|---|---|---|
| **P2-a** | 模板版本快照 + 关键决策记录（G0–G4） | 母版可回溯任一版本；项目能回指所用版本；五门禁可记录，**缺证据/未批准的对外使用不被当作允许** |
| **P2-b** | 基本任务依赖（FS/SS/FF + 延迟） | 母版可声明依赖；项目实例能看到"被谁阻塞"；**不自动改期** |
| **P2-c** | 条件裁剪预览与理由 | 建项目选定级即见裁剪清单；裁剪必须填理由；**CONDITIONAL 不被静默改写** |

**共同边界（不做）**：通用审批引擎、自动通知/webhook、全面 QMS、甘特图/关键路径/自动排程、文档版本管理系统。
**共同纪律**：隔离库先行 → 迁移评审 → 可逆（新表可删、新字段可空）→ 不动在研项目历史数据 → 独立审阅 → 分批交付。

---

## 1. Schema 设计（4 个迁移）

### 迁移 1：`20261014_p2_template_versions`（P2-a）

```prisma
model ProjectTemplateVersion {
  id            String   @id @default(uuid())
  templateId    String   @map("template_id")
  version       Int                          // 每模板独立递增（1,2,3…）
  configHash    String   @map("config_hash") @db.VarChar(64)   // sha256(规范化 config)
  structureHash String?  @map("structure_hash") @db.VarChar(64) // 结构化行（阶段/任务）hash
  changeSummary String?  @map("change_summary")                // 变更摘要（新增/修改/删除计数）
  config        Json     @map("config")                        // 规范化后的完整 config 快照
  createdById   String   @map("created_by_id")
  createdAt     DateTime @default(now()) @map("created_at")

  template  ProjectTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  creator   User            @relation(fields: [createdById], references: [id])
  projects Project[]

  @@unique([templateId, version])
  @@index([templateId, createdAt])
  @@map("project_template_versions")
}
```
`ProjectTemplate` 增加 `versions ProjectTemplateVersion[]`；`Project` 增加：
```prisma
templateVersionId String? @map("template_version_id")   // 实例化时所用的母版版本（快照回指）
templateVersion   ProjectTemplateVersion? @relation(fields: [templateVersionId], references: [id], onDelete: SetNull)
```

**触发规则**：`PUT/PATCH /project-templates/:id` 保存成功后，若 `sha256(规范化 config)` 与最新版本不同 → 生成新版本（version = max+1）。首次保存（无版本）也生成 v1。结构 hash 变化时在 `changeSummary` 标注"阶段/任务行已变更"。

### 迁移 2：`20261014_p2_project_decisions`（P2-a）

```prisma
enum DecisionGate { G0_START G1_CONFIG G2_EVIDENCE G3_EXTERNAL G4_HANDOVER }

model ProjectDecision {
  id           String       @id @default(uuid())
  projectId    String       @map("project_id")
  gate         DecisionGate
  decision     String                          // 推进 / 不推进 / 有条件推进 / 移交 / 保留观察
  rationale    String?                          // 依据
  constraints  String?                          // 限制（不允许的解释/范围）
  evidenceRefs String[]                         // 关联证据（任务 id、文件 id）
  decidedById  String       @map("decided_by_id")
  decidedAt    DateTime     @map("decided_at")
  createdAt    DateTime     @default(now()) @map("created_at")

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  decidedBy User    @relation(fields: [decidedById], references: [id])

  @@index([projectId, gate])
  @@map("project_decisions")
}
```
同一 `gate` 可多条记录（按时间形成决策历史），最新一条为当前状态。

### 迁移 3：`20261014_p2_task_dependencies`（P2-b）

```prisma
enum DependencyType { FS SS FF }   // 完成→开始 / 开始→开始 / 完成→完成

model TemplateTaskDependency {     // 母版级声明
  id             String         @id @default(uuid())
  templateTaskId String         @map("template_task_id")   // 后继
  predecessorId  String         @map("predecessor_id")     // 前置
  type           DependencyType @default(FS)
  lagDays        Int            @default(0) @map("lag_days")  // 延迟天数（可负=提前）
  createdAt      DateTime       @default(now()) @map("created_at")

  templateTask TemplateTask @relation(fields: [templateTaskId], references: [id], onDelete: Cascade)
  predecessor  TemplateTask @relation("dep_predecessor", fields: [predecessorId], references: [id], onDelete: Cascade)

  @@unique([templateTaskId, predecessorId])
  @@index([predecessorId])
  @@map("template_task_dependencies")
}

model TaskDependency {            // 项目实例级（实例化时从母版复制，task_id 指向项目任务）
  id            String         @id @default(uuid())
  taskId        String         @map("task_id")
  predecessorId String         @map("predecessor_id")
  type          DependencyType @default(FS)
  lagDays       Int            @default(0) @map("lag_days")

  task        Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  predecessor Task @relation("task_dep_predecessor", fields: [predecessorId], references: [id], onDelete: Cascade)

  @@unique([taskId, predecessorId])
  @@index([predecessorId])
  @@map("task_dependencies")
}
```
`TemplateTask` 增加 `dependencies TemplateTaskDependency[]` 与 `predecessorOf TemplateTaskDependency[] @relation("dep_predecessor")`；`Task` 同样增加两个关系。

### 迁移 4：`20261014_p2_project_tier`（P2-c）

```prisma
// Project 增加
tier            String? @db.VarChar(1)        // A / B / C（建项目时选定）
tierReason      String? @map("tier_reason")   // 定级理由（P1-e 要求记入项目一页卡）

// Task 增加
exemptionReason String? @map("exemption_reason")  // 按级裁剪理由（简化时必须填写）
```

---

## 2. 后端设计

| 端点 | 方法 | 说明 |
|---|---|---|
| `/project-templates/:id/versions` | GET | 版本列表（version、hash、时间、操作人、changeSummary） |
| `/project-templates/:id/versions/:version` | GET | 某版本完整快照（config + 结构） |
| `/project-templates/:id/versions/:version/restore` | POST | 回滚到该版本（生成**新版本**而非覆盖，保留历史） |
| `/projects/:id/decisions` | GET/POST | 决策记录列表 / 新增（gate、decision、rationale、constraints、evidenceRefs） |
| `/projects/:id/decisions/:decisionId` | PUT/DELETE | 修改/删除（软删或留痕删除） |
| `/project-templates/:id/task-dependencies` | GET/PUT | 母版依赖读取 / 批量设置（整体替换该模板依赖） |
| `/projects/:id/tasks/:taskId/blockers` | GET | 该任务的阻塞来源（未完成前置 + 类型 + 延迟） |
| `/projects/:id/tier-preview` | POST | **P2-c**：给定 tier 返回裁剪预览（保留/可裁剪任务清单 + 需补理由项） |
| `POST /projects` | 改 | 新增可选 `tier`/`tierReason`；实例化时写入 `templateVersionId` 并复制母版依赖到 `task_dependencies` |
| `POST /projects/:id/apply-template` | 改 | 同样记录 `templateVersionId` 与复制依赖 |

**关键逻辑**：
1. **版本生成**：保存成功后比对 `configHash`；不同则写新版本。`restore` 也走"生成新版本"路径（保证历史不可变）。
2. **依赖复制**：项目创建/套用时，按 `templateTaskId → 项目 task.id` 映射复制依赖（沿用 P0 的 ID 映射思路）。
3. **阻塞计算**：前置任务状态非 `COMPLETED` 即视为阻塞（SS 类型下前置未 `IN_PROGRESS` 亦阻塞）；`lagDays` 仅作展示信息，**不改期**。
4. **裁剪预览**：依据任务 `regulatory_notes` 中的 `[分级要求]` 与 `p1-tier-policy.md` 规则，输出三档：`REQUIRED`（必须）、`CONDITIONAL_BY_TIER`（该级可裁剪，需理由）、`NOT_APPLICABLE`（该级不适用）。**不删除任何任务**，只标注。

## 3. 前端设计

| 文件 | 改动 |
|---|---|
| `TemplateEditor.tsx` | ① 顶部显示当前版本号 + 「版本历史」入口（列表/对比）；② 任务间**依赖连线**（灰色虚线箭头，区别于蓝色流转线）+ 依赖编辑面板（选前置任务、类型、延迟天数） |
| `CreateProjectModal.tsx` | ① 选定级（A/B/C + 理由）；② **裁剪预览步骤**（在"计划预览"后插入一屏，列出可裁剪任务与待填理由）；③ 提交时带 `tier`/`tierReason` |
| 项目详情（新增/扩展） | ① 「母版版本」标识（v3 · 2026-10-14）；② **决策记录**面板（G0–G4 卡片 + 新增表单 + 历史时间线）；③ 任务列表「阻塞」列/徽标 |
| `ProcessFlowDiagram.tsx` | 依赖线渲染（与流转线区分样式）；点击依赖线可查看类型/延迟 |

## 4. 验收用例（每批）

**P2-a**：① 连续保存母版两次 → 版本列表出现 v1/v2，hash 不同、changeSummary 正确；② 用 v2 创建项目 → 项目显示"母版 v2"；③ 母版再改版 → 旧项目仍显示 v2 且可查看当时快照；④ restore 到 v1 → 生成 v4 而非覆盖 v3；⑤ 项目可记录 G0–G4 五类决策，G3 未记录时项目页面对"对外交付"给出醒目提示。

**P2-b**：① 母版中给「性能验证报告」设前置「重复性与批间一致性」(FS) → 保存成功；② 创建项目 → 依赖复制到项目任务；③ 前置未完成 → 后继任务显示"阻塞：重复性与批间一致性"；④ 删除母版依赖 → 新项目不再复制（旧项目保留，不改历史）。

**P2-c**：① 建项目选 A 级 → 预览显示「A 类最低验证执行」路径 + 可裁剪任务清单；② 裁剪某任务不填理由 → 前端阻止提交；③ 选 C 级 → 预览要求 C 类增强验证 + 完整交付文件；④ 创建后任务的 `applicability` 与母版一致（CONDITIONAL 未被改写）；⑤ 任务详情可看裁剪理由。

## 5. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 迁移影响在研项目 | 全部为**新增表/可空字段**；不 ALTER 现有列、不回填历史数据；`projects.template_version_id` 对旧项目为 NULL（显示"版本未记录"） |
| 依赖数据错误导致误导 | 依赖仅"提示阻塞"，不阻止操作、不改期；母版依赖可随时编辑，旧项目保留快照式复制 |
| 裁剪预览被误解为自动删任务 | UI 明确"仅预览与标注，不删除任务"；裁剪必须填理由 |
| 回滚 | 新表 `DROP`、新字段 `DROP COLUMN` 均可逆；每批独立迁移，可按批回退 |

## 6. 实施顺序（每批：设计评审 → 隔离库迁移 → 后端 → 前端 → 复验 → 交付）

1. **P2-a**：迁移 1+2 → 版本生成/列表/恢复 + 决策 CRUD → 编辑器版本入口 + 项目决策面板
2. **P2-b**：迁移 3 → 母版依赖 API + 实例化复制 → 画布依赖线 + 项目阻塞提示
3. **P2-c**：迁移 4 → tier-preview API + 创建流程 → 定级与预览 UI

每批交付：迁移 SQL、后端/前端改动、定向测试、隔离库复验证据、验收用例结果、回滚说明。

## 7. 待你在实施前确认的小项

1. **版本号规则**：每模板独立递增（v1/v2…）还是全局流水号？—— 建议前者。
2. **restore 语义**：生成新版本（推荐，历史不可变）还是就地覆盖？—— 推荐前者。
3. **依赖是否允许跨阶段**：如「p8 性能报告」前置「p6 片外体系评审」——建议允许（真实项目常跨阶段）。
4. **裁剪理由的粒度**：任务级 `exemptionReason`（推荐）还是项目级一次性说明？—— 推荐任务级。
5. **决策记录是否允许事后补录**（`decidedAt` 与 `createdAt` 分离）——建议允许，便于回填历史门禁。
