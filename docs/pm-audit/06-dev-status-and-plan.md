# 开发状态追踪与计划

**文档创建时间：** 2026-04-23  
**文档版本：** v1.0  
**状态：** 活跃维护中

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

## 五、文档变更记录

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-04-23 | 创建文档，分析当前开发阶段，记录 BUG-001 修复计划 | Copilot |
| 2026-04-23 | 执行 P0/P1/P2 计划：修复 BUG-001、添加 fadeInUp、创建 statusColors.ts + permissions.ts、后端权限列表与状态机、EditProjectModal 联动、前端统一 hasPerm | Copilot |
