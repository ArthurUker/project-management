# 开发状态追踪与计划

**文档创建时间：** 2026-04-23  
**文档版本：** v1.0  
**状态：** 活跃维护中

> **状态更新（2026-05-29）：** 已完成一次后端/前端/Prisma 的全量审阅抽检。当前最高风险从“类型构建阻断”转为“权限与事务一致性风险”。

---

## 一、当前开发阶段总览

### 1.1 阶段定位：MVP 完成 → 整合与精修阶段

截至 2026-04-23，系统整体处于 **"功能完备 MVP / 集成精修" 阶段**：

| 维度 | 状态 | 说明 |
|------|------|------|
| 后端 API | ✅ 功能完备 | 16+ 路由模块全部注册，Hono + Prisma 架构稳定 |
| 核心前端页面 | ✅ 全部实现 | 10+ 页面，包含项目管理、任务、汇报、成员等所有主模块 |
| 新功能模块 | ✅ 已集成 | 试剂配方系统、知识库、项目模版、阶段管理、备料计算器 |
| TypeScript 类型安全 | ⚠️ 有阻断性错误 | 3 处 ts(2339) 错误，**阻断生产构建**（详见第三节） |
| 样式系统 | ⚠️ 技术债积累 | inline style 泛滥，主题 token 覆盖不一致 |
| 权限系统 | ⚠️ 粗粒度 | 基于 role 字符串的分散判断，未实现细粒度权限码 |
| 状态机 | ⚠️ 缺失 | 项目状态流转无约束，前后端口径未统一 |
| 测试覆盖 | ❌ 缺失 | 未发现任何自动化测试文件 |

### 1.2 系统模块清单（截至 2026-04-23）

**后端已实现路由（`rdpms-system/backend/src/routes/`）**
- `auth.js` — 认证（登录/登出/token 刷新）
- `users.js` — 成员管理
- `projects.js` — 项目管理（含批量操作）
- `tasks.js` — 任务管理（含看板 board 接口）
- `reports.js` — 汇报管理
- `progress.js` — 月度进度追踪
- `projectTemplates.js` — 项目模版
- `taskTemplates.js` — 任务模版
- `phases.js` — 阶段管理
- `reagents.js` — 试剂管理
- `reagentMaterials.js` — 试剂材料
- `formulas.js` — 试剂配方
- `prep-calculator.js` — 备料计算器
- `docs.js` — 文档/知识库
- `stats.js` — 统计看板
- `sync.js` — 前端离线同步

**前端已实现页面（`rdpms-system/frontend/src/pages/`）**
- `Dashboard.tsx` — 统计仪表盘
- `Projects.tsx` + `ProjectDetail.tsx` — 项目管理
- `Tasks.tsx` — 任务看板
- `Reports.tsx` + `ReportEdit.tsx` — 汇报管理
- `Users.tsx` — 成员管理
- `Settings.tsx` — 系统设置
- `Docs.tsx` — 知识库文档
- `TemplateLibrary.tsx` + `TemplateEditor.tsx` — 模版库
- `ProjectTemplates.tsx` — 项目模版管理
- `knowledge/ReagentLibrary.tsx` — 试剂知识库
- `reagent-formula/index.tsx` + `FormulaEditor.tsx` + `PrepCalculator.tsx` — 试剂配方系统

---

## 二、近期功能进展（相对于审计文档 2026-04-15）

| 功能 | 状态 | 备注 |
|------|------|------|
| 试剂配方矩阵页面 | ✅ 已完成 | FormulaMatrix 支持分类筛选、展开/折叠 |
| 备料计算器 | ✅ 已完成 | PrepCalculator 页面 |
| 知识库 ReagentLibrary | ✅ 已完成 | 试剂知识库页面 |
| 审计文档整理 | ✅ 已完成 | docs/pm-audit/ 5 份审计文档 |
| Layout children 类型问题（BUG-001） | ✅ **已修复** | 添加 `NavItem` 接口，生产构建恢复正常 |
| `@keyframes fadeInUp` 缺失 | ✅ **已修复** | 在 `index.css` 补充关键帧，ProjectCard 动画正常 |
| `statusColors.ts` 状态色统一真值源 | ✅ **已完成** | `src/constants/statusColors.ts`，含状态机定义 |
| `permissions.ts` 权限工具 | ✅ **已完成** | `src/utils/permissions.ts`，`hasPerm` + `useHasPerm` |
| 后端 auth.js 权限列表 | ✅ **已完成** | 登录/verify 响应附加 `permissions: string[]` |
| 后端 projects.js 状态机校验 | ✅ **已完成** | PUT 路由校验非法状态迁移，返回 422 |
| EditProjectModal 状态机联动 | ✅ **已完成** | 下拉仅显示当前状态允许的目标状态 |
| 前端权限判断统一（Users/TemplateLibrary/ProjectTemplates） | ✅ **已完成** | 替换所有 `role === 'admin'` 为 `hasPerm()` |
| 设计 token 统一（design-tokens.css）| 📋 待规划 | 见第四节 P3 |

---

## 三、已知问题与修复计划

### 3.1 【已修复 ✅】Layout.tsx TypeScript 类型错误（BUG-001）

**修复时间：** 2026-04-23  
**方案：** 添加 `NavItem` 接口并显式声明 `navItems: NavItem[]`，同时将 `isAdmin` 判断替换为 `hasPerm(user, PERMS.USERS_MANAGE)`。  
**当前构建状态：** ✅ TypeScript 0 错误

---

### 3.2 【已完成 ✅】权限判断逻辑统一（DEBT-001）

**完成时间：** 2026-04-23  
**实现内容：**
- 新建 `frontend/src/utils/permissions.ts`：`PERMS` 权限码常量、`hasPerm()` 普通函数、`useHasPerm()` React Hook
- 后端 `auth.js` 登录/verify 响应附加 `permissions: string[]`（基于角色映射）
- `appStore.ts` `User` 接口新增 `permissions?: string[]` 字段
- `Layout.tsx`、`Users.tsx`、`TemplateLibrary.tsx`、`ProjectTemplates.tsx` 统一使用 `hasPerm()`

---

### 3.3 【已完成 ✅】状态机实现（DEBT-002）

**完成时间：** 2026-04-23  
**实现内容：**
- 新建 `frontend/src/constants/statusColors.ts`：`STATUS_TRANSITIONS` 状态机定义、`getAllowedTransitions()` 工具函数，同时将 `STATUS_COLORS`/`STATUS_CONFIG` 迁移至此（唯一真值源）
- 后端 `projects.js`：
  - `GET /projects/:id` 响应附加 `allowedTransitions: string[]`
  - `PUT /projects/:id` 添加状态机校验，非法迁移返回 `422 + { code: 'INVALID_STATUS_TRANSITION' }`
- `EditProjectModal.tsx`：状态下拉仅显示当前状态允许迁移的目标状态，并展示当前状态提示

---

### 3.4 【技术债】样式系统不一致（来自 04-ui-style-audit.md）

**问题编号：** DEBT-003  
**文件：** `ProjectCard.tsx`, `Projects.tsx`, `KanbanBoard.tsx` 等

**问题：**  
- 大量 inline style 阻碍主题统一覆盖
- 状态色在 `ProjectCard.tsx` 和 `Projects.tsx` 中重复定义
- `!important` 堆积（尤其 `flow-edge.css`）

**修复计划（分阶段）：**
- **阶段 0（1 周）：** 创建 `design-tokens.css`，声明语义变量，替换 3 处核心 inline 依赖
- **阶段 1（2 周）：** 将状态色迁移至 `src/constants/statusColors.ts` 作为唯一真值
- **阶段 2（持续）：** 逐步将 inline style 替换为 Tailwind 工具类或 CSS 变量

**优先级：** P3（视觉一致性，不影响功能）  
**计划修复时间：** 视觉精修阶段

---

## 四、下阶段开发计划

### 4.1 P0 — 当前冲刺（修复阻断问题）

| 任务 | 负责模块 | 预估 | 状态 |
|------|----------|------|------|
| 修复 Layout.tsx `children` 类型错误（BUG-001） | 前端 | 15min | ✅ 已完成 |
| 添加 `@keyframes fadeInUp` 动画 | 前端样式 | 5min | ✅ 已完成 |

### 4.2 P1 — 整合精修（近期）

| 任务 | 负责模块 | 预估 | 状态 |
|------|----------|------|------|
| 创建 `statusColors.ts` 状态色统一真值源 | 前端常量 | 30min | ✅ 已完成 |
| ProjectCard / Projects.tsx 引用 `statusColors.ts`（消除重复定义）| 前端组件 | 1h | 📋 待规划（低优先） |
| 完善 API 错误处理（EditProjectModal 422 提示）| 前端 | 30min | 📋 待规划 |

### 4.3 P2 — 架构加固（中期）

| 任务 | 负责模块 | 预估 | 状态 |
|------|----------|------|------|
| 实现细粒度权限系统（DEBT-001） | 前后端 | 1 天 | ✅ 已完成 |
| 实现项目状态机（DEBT-002） | 前后端 | 1 天 | ✅ 已完成 |
| 添加乐观并发控制（version 字段 / ETag） | 前后端 | 2 天 | 📋 待规划 |
| 创建核心功能自动化测试 | 测试 | 3 天 | 📋 待规划 |

### 4.4 P3 — 视觉精修（长期）

| 任务 | 负责模块 | 预估 | 状态 |
|------|----------|------|------|
| 创建 `design-tokens.css` 统一设计令牌 | 前端样式 | 1 天 | 📋 待规划 |
| 替换核心组件 inline style → CSS 变量 | 前端组件 | 2 天 | 📋 待规划 |
| 消除非必要 `!important`（flow-edge.css 等） | 前端样式 | 0.5 天 | 📋 待规划 |

---

## 六、2026-05-29 全量代码审阅结果与整改计划

### 6.1 审阅范围与方法

- 审阅范围：`backend/src/routes/*`、`backend/prisma/schema.prisma`、`frontend/src/api/client.ts`、`frontend/src/constants/statusColors.ts`。
- 审阅方式：全量静态审阅 + 高风险点抽检（删除操作权限、批量更新事务、状态机一致性、输入校验）。
- 结论：架构总体稳定，但存在可导致越权修改/删除和数据不一致的 P0/P1 问题，需要在本轮冲刺优先处理。

### 6.2 已确认问题（按优先级）

#### P0（需立即修复）

1. 项目删除接口缺少权限校验  
  文件：`rdpms-system/backend/src/routes/projects.js`  
  现状：`DELETE /projects/:id` 直接删除项目，未校验当前用户是否具备删除权限。

2. 任务删除接口缺少权限校验  
  文件：`rdpms-system/backend/src/routes/tasks.js`  
  现状：`DELETE /tasks/:id` 直接删除任务，未校验当前用户与项目关系。

3. 批量任务状态更新未使用事务  
  文件：`rdpms-system/backend/src/routes/tasks.js`  
  现状：`POST /tasks/batch/status` 使用 `Promise.all` 执行多次 `update`，中途失败可能出现部分成功、部分失败。

4. 月度进展写入接口缺少项目权限校验  
  文件：`rdpms-system/backend/src/routes/progress.js`  
  现状：`POST /progress/project/:projectId` 未校验当前用户是否项目成员/负责人。

#### P1（本周内修复）

1. 任务状态更新接口缺少状态值校验与状态机约束  
  文件：`rdpms-system/backend/src/routes/tasks.js`  
  现状：`PATCH /tasks/:id/status` 接收任意字符串；与项目状态机策略不一致。

2. `docRefs` JSON 字段缺少结构校验  
  文件：`rdpms-system/backend/src/routes/tasks.js`  
  现状：更新时直接 `JSON.stringify`，可能写入不符合约定结构的数据。

3. 项目日期合法性缺少防御性校验  
  文件：`rdpms-system/backend/src/routes/projects.js`  
  现状：允许开始时间晚于结束时间的输入。

4. 任务前置依赖仅做浅层循环校验  
  文件：`rdpms-system/backend/src/routes/tasks.js`  
  现状：只检查互指，未覆盖深层环（例如 A→B→C→A）。

#### P2（排入优化）

1. 路由层输入校验方式分散，缺少统一验证中间件（建议 Zod/Joi）。
2. 操作日志覆盖面不足（目前重点在登录等行为，业务修改审计不足）。
3. 任务列表排序索引可进一步优化（按 `priority + dueDate` 的查询压力场景）。

### 6.3 整改执行计划（新增）

#### Sprint-A（48 小时内，P0）

- [ ] 为 `projects.delete('/:id')` 增加权限校验（至少：管理员或项目负责人）。
- [ ] 为 `tasks.delete('/:id')` 增加权限校验（至少：管理员、项目负责人、任务负责人中的授权角色）。
- [ ] 将 `tasks.post('/batch/status')` 改造为 `prisma.$transaction`，失败整体回滚。
- [ ] 为 `progress.post('/project/:projectId')` 增加项目成员权限校验。

#### Sprint-B（本周内，P1）

- [ ] 引入 `VALID_TASK_STATUSES` 与任务状态迁移规则，统一前后端状态机。
- [ ] 为任务 `docRefs` 建立结构校验（数组元素字段白名单、类型检查）。
- [ ] 增加项目日期区间校验（`startDate <= endDate`）。
- [ ] 将前置依赖校验从“浅层”升级为 DAG 检测（DFS/拓扑校验）。

#### Sprint-C（两周内，P2）

- [ ] 设计并接入统一请求校验中间件。
- [ ] 补齐核心写操作的 `SystemLog` 审计记录。
- [ ] 对高频筛选/排序路径补充索引与分页策略。

### 6.4 回归测试与验收要求（新增）

- 权限回归：非项目成员不得删除项目、任务，不得写入他人项目进展。
- 事务回归：批量更新任一项失败时，数据库应保持全量回滚。
- 状态回归：非法任务状态值必须返回 4xx，不写库。
- 依赖回归：禁止创建任意深度循环前置依赖。
- 验收输出：每个 P0/P1 项都需附带最小复现步骤与修复后验证记录。

---

## 五、文档变更记录

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-04-23 | 创建文档，分析当前开发阶段，记录 BUG-001 修复计划 | Copilot |
| 2026-04-23 | 执行 P0/P1/P2 计划：修复 BUG-001、添加 fadeInUp、创建 statusColors.ts + permissions.ts、后端权限列表与状态机、EditProjectModal 联动、前端统一 hasPerm | Copilot |
| 2026-05-29 | 新增“全量代码审阅结果与整改计划”：确认权限缺失、事务一致性、状态校验、依赖环检测等问题，并形成 Sprint-A/B/C 执行清单 | Copilot |
