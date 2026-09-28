# RDPMS — 研发项目管理系统

> R&D Project Management System · 面向 IVD（体外诊断）/ 诊断试剂研发的科研项目全过程管理平台
> 最新版本：`v1.0.0`（分支 `tencent_CVM/rdpm`）

---

## 目录

1. [系统概述](#1-系统概述)
2. [技术栈总览](#2-技术栈总览)
3. [系统架构](#3-系统架构)
4. [数据库设计](#4-数据库设计)
5. [API 接口文档](#5-api-接口文档)
6. [前端模块设计](#6-前端模块设计)
7. [认证与权限设计](#7-认证与权限设计)
8. [部署架构](#8-部署架构)
9. [安全设计](#9-安全设计)
10. [已知技术债务与待办](#10-已知技术债务与待办)
11. [开发环境搭建指南](#11-开发环境搭建指南)
12. [运维手册](#12-运维手册)

---

## 1. 系统概述

### 1.1 业务定位

RDPMS 是一套面向**诊断试剂 / IVD 研发团队**的研发项目全过程管理系统，覆盖从项目立项、阶段流转、任务执行、进展汇报到注册申报、知识沉淀的完整链路。核心解决"研发过程不可视、汇报靠手工、法规与配方散落、注册进度难追踪"的痛点。

包含以下业务域：

| 业务域 | 说明 |
|--------|------|
| 项目管理 | 项目立项 / 草稿、阶段流转状态机、成员管理、套用模板自动生成任务与里程碑 |
| 任务管理 | 任务看板（拖拽改状态）、前置依赖（环检测）、阶段/优先级/法规适用性标签 |
| 研发汇报 | 日报 / 周报 / 月报，版本历史，提交 / 审阅（已阅）/ 驳回（需修改）工作流 |
| 月度进展 | 按项目 + 月份填写实际工作、完成度、下月计划、风险 |
| 试剂与配方 | 试剂库、试剂原料库、配方编辑器、配制计算器（含配制记录） |
| 引物探针 | 引物 / 探针序列库，CSV 批量导入 |
| 样本库 | 实验样本管理，关联项目 |
| 法规文档 | 法规文件库（适用性 / 优先级标签），关联任务；支持原文件上传与 PDF 导入 |
| 注册申报 | IVD 注册全流程（资料准备 / 送检受理 / 技术审评 / 行政审批 / 取证归档），阶段状态机，合规负责人，到期预警 |
| 知识库 | 文档分类 + 文档版本管理，支持富文本 / Markdown |
| 模板库 | 项目模板（含阶段 / 角色 / 任务结构）、任务模板（含步骤） |

### 1.2 目标用户

| 角色 | 代码 | 典型职责 |
|------|------|----------|
| 系统管理员 | `admin` | 用户 / 权限管理、模板维护、系统备份恢复、注册法规种子数据 |
| 项目经理 | `manager` | 创建与管理项目、增删成员、审阅汇报、推进注册阶段、编辑模板 |
| 研发成员 | `member` | 认领 / 更新任务、提交汇报、填写月度进展、查看注册与法规 |
| 质量 / 注册合规 | 归属上述角色，通过 `registrations.*` 权限位区分 | 维护注册档案、上传法规原文件 |

### 1.3 部署形态

- **单实例生产**：一台 Ubuntu 22.04 服务器，Nginx 托管前端静态文件并反向代理 `/api` 到本机 Hono 后端；后端连 PostgreSQL。
- **离线优先**：前端内置 Dexie 本地库，登录态与同步时间戳存 localStorage；弱网 / 离线时可继续操作，恢复网络后增量同步（`/api/sync`）。
- **无状态后端**：JWT 鉴权，后端不依赖 Redis / 会话存储，可水平扩展（见 §8）。

---

## 2. 技术栈总览

### 2.1 后端

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 运行时 | Node.js | 20 LTS | 服务运行时 |
| Web 框架 | Hono | ^4.0.0 | HTTP 路由 / 中间件 |
| 服务适配器 | @hono/node-server | ^1.8.0 | Node 原生 HTTP 适配 |
| ORM | Prisma | ^5.10.0 | 数据库访问 / 迁移 |
| 数据库 | PostgreSQL | 14 | 主存储（本地可 SQLite，生产统一 PG） |
| 密码哈希 | bcryptjs | ^2.4.3 | 口令单向哈希（cost 10） |
| 令牌 | jsonwebtoken | ^9.0.2 | JWT 签发 / 校验 |
| CORS | cors | ^2.8.5 | 跨域白名单 |
| ID 生成 | nanoid | ^5.0.4 | 短 ID（部分场景） |
| 报表导出 | pdfkit | ^0.14.0 | PDF 生成 |

### 2.2 前端

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| UI 框架 | React | ^18.2.0 | 视图层 |
| 语言 | TypeScript | ^5.3.3 | 类型安全（构建门禁：`tsc -b`） |
| 构建 | Vite | ^5.1.0 | 开发服务器 / 生产打包 |
| 路由 | react-router-dom | ^6.22.0 | 前端路由 + 守卫 |
| 状态 | Zustand | ^4.5.0 | 全局状态 + 持久化 |
| 离线库 | Dexie | ^3.2.5 | 浏览器 IndexedDB 本地库 |
| HTTP | axios | ^1.6.7 | API 客户端 / 拦截器 |
| 样式 | TailwindCSS | ^3.4.19 | 原子化 CSS |
| 图标 | lucide-react | ^1.8.0 | 图标 |
| 图表 | recharts | ^2.12.0 | 统计图表 |
| 流程图 | @xyflow/react | ^12.10.2 | 阶段 / 流程可视化 |
| 看板拖拽 | @dnd-kit/* | ^6/9/10 | 任务看板拖拽 |
| 导出 | jspdf / html2canvas | — | 页面 / 报表导出 |
| 图布局 | @dagrejs/dagre | ^3.0.0 | 流程图自动布局 |

### 2.3 运维

| 分类 | 技术 | 用途 |
|------|------|------|
| 进程守护 | systemd | 后端服务管理、开机自启、崩溃重启 |
| 反向代理 / 静态 | Nginx（或 Caddy） | 前端托管 + `/api` 反代 + gzip |
| 数据库 | PostgreSQL 14 | 主存储 + 逻辑备份（`pg_dump`） |

---

## 3. 系统架构

### 3.1 部署拓扑

```mermaid
flowchart LR
  U[浏览器 / 用户] -->|HTTP 80| NG[Nginx<br/>静态资源 + 反代]
  NG -->|/api → 127.0.0.1:3000| BE[Hono 后端<br/>systemd: rdpms-backend]
  BE -->|Prisma| PG[(PostgreSQL 14)]
  BE -->|审计写入| SL[(SystemLog 表)]
  U -.离线可用.-> DX[(Dexie 本地库<br/>IndexedDB)]
  DX -.恢复网络后增量同步.-> NG
```

- 公网仅暴露 80（后续 443）；后端 3000 端口**仅本机**可达，不对外。
- 前端为纯静态 SPA，所有 `/api` 请求经同源 Nginx 转发，避免跨域。

### 3.2 组件与请求链路

```mermaid
flowchart TB
  subgraph 前端
    SPA[React SPA] --> STORE[Zustand Store]
    STORE --> DEXIE[(Dexie)]
    SPA --> AXIOS[Axios API 客户端<br/>注入 Bearer Token]
  end
  AXIOS -->|HTTPS?/HTTP| NG
  NG --> BE
  subgraph 后端
    BE --> CORS[CORS 中间件]
    CORS --> IDEMP[幂等中间件 PUT]
    IDEMP --> AUTH[authMiddleware]
    AUTH --> ROUTES[21 个路由模块]
    ROUTES --> JWT[jwt 校验/签发]
    ROUTES --> BC[bcrypt 校验]
    ROUTES --> PRISMA[Prisma Client]
  end
  PRISMA --> PG
```

### 3.3 目录结构

```
project-management/
├── README.md                       # 本文件
├── docs/
│   ├── CODE_REVIEW.md              # 代码审查清单（43 项，已收敛）
│   └── deployment/deploy-guide.md  # 部署执行手册
└── rdpms-system/
    ├── backend/                    # Hono 后端
    │   ├── prisma/
    │   │   ├── schema.prisma       # 数据模型（provider=postgresql）
    │   │   └── seed.js             # 种子数据
    │   ├── src/
    │   │   ├── index.js            # 入口：中间件 + 路由注册 + 启动
    │   │   ├── routes/             # 21 个路由模块
    │   │   ├── middleware/         # idempotency.js
    │   │   ├── data/               # 任务模板种子等
    │   │   └── utils/              # 工具（状态机、权限等）
    │   └── package.json
    └── frontend/                   # React SPA
        ├── src/
        │   ├── App.tsx             # 路由 + 守卫
        │   ├── api/client.ts       # Axios 客户端 + 拦截器
        │   ├── store/appStore.ts   # Zustand + Dexie 同步
        │   ├── utils/permissions.ts# 前端权限位
        │   ├── pages/              # 页面（含 knowledge/、reagent-formula/）
        │   └── components/         # 布局与复用组件
        └── package.json
```

---

## 4. 数据库设计

### 4.1 ER 关系图

```mermaid
erDiagram
  USER ||--o{ PROJECT : "manages(managerId)"
  USER ||--o{ PROJECTMEMBER : "is member"
  USER ||--o{ REPORT : submits
  USER ||--o{ MONTHLYPROGRESS : submits
  USER ||--o{ SYSTEMLOG : generates
  USER ||--o{ DOCDOCUMENT : creates
  USER ||--o{ REAGENTFORMULA : creates
  USER ||--o{ PREPRECORD : creates
  USER ||--o{ TASKTEMPLATE : owns

  PROJECT ||--o{ PROJECTMEMBER : has
  PROJECT ||--o{ REPORT : has
  PROJECT ||--o{ TASK : has
  PROJECT ||--o{ MILESTONE : has
  PROJECT ||--o{ MONTHLYPROGRESS : has
  PROJECT ||--o{ REAGENTFORMULA : "references"
  PROJECT ||--o{ SAMPLEMATERIAL : "references"
  PROJECT ||--|| PROJECTREGISTRATIONPROFILE : "has(1-1)"
  PROJECT }o--|| PROJECTTEMPLATE : "applied(templateId)"

  REPORT ||--o{ REPORTVERSION : has
  TASK ||--o{ TASKDEPENDENCY : "prerequisite"
  TASK ||--o{ TASKREGULATORYDOCUMENT : "links"
  REGULATORYDOCUMENT ||--o{ TASKREGULATORYDOCUMENT : "links"

  PROJECTTEMPLATE ||--o{ PROJECTTEMPLATE : "parent/child"
  PROJECTTEMPLATE ||--o{ PROJECTROLEDEFINITION : defines

  REAGENTFORMULA ||--o{ FORMULACOMPONENT : has
  REAGENT ||--o{ FORMULACOMPONENT : "used in"
  REAGENTMATERIAL ||--o{ FORMULACOMPONENT : "used in"
  REAGENTFORMULA ||--o{ PREPRECORD : has

  DOCCATEGORY ||--o{ DOCDOCUMENT : contains
  DOCDOCUMENT ||--o{ DOCVERSION : has
```

### 4.2 数据表清单（字段 / 约束 / 索引 / 外键）

> 类型说明：`uuid`=UUID 主键，`cuid`=Prisma cuid，`txt`=文本(String)，`json`=JSON 存文本(String)，`dt`=DateTime，`bool`=Boolean，`int`=Int，`flt`=Float。外键级联：`C`=Cascade，`N`=SetNull。

| 表（模型） | 主要字段 | 主键 / 唯一 | 索引 | 外键 / 级联 |
|------------|----------|-------------|------|-------------|
| `User` | id, username(UQ), password, name, position, department, role(`admin/manager/member`), status(`active/disabled`), avatar?, createdAt, updatedAt | id / username | — | 被 Project.managerId(N)、ProjectMember.userId(C)、Report.userId(C) 等引用 |
| `Project` | id, code(UQ), name, type, isDraft, subtype?, status(`进行中…`), managerId, templateId?, startDate?, endDate?, createdAt, updatedAt | id / code | — | managerId→User(N)；templateId→ProjectTemplate(N) |
| `ProjectRegistrationProfile` | id, projectId(UQ), registrationType(`IVD`), region?, authority?, submissionNo?, certificateNo?, currentStage?, plannedSubmissionDate?, expectedApprovalDate?, complianceOwnerId?, riskLevel(`高/中/低`), notes? | id / projectId | [registrationType],[currentStage],[complianceOwnerId] | projectId→Project(C)；complianceOwnerId→User(N) |
| `ProjectRoleDefinition` | id, templateId, name, description?, permissions?(csv), sortOrder | id | [templateId] | templateId→ProjectTemplate(C)；UQ[templateId,name] |
| `ProjectTemplate` | id, code(UQ), name, description?, category?, type?, parentId?(自引用), isMaster, content?(json), preview?(json), createdBy, status, createdAt, updatedAt | id / code | [category],[parentId] | createdBy→User；parentId→自身 |
| `ProjectMember` | id, projectId, userId, role(`manager/member/viewer`), joinedAt | id | — | UQ[projectId,userId]；projectId→Project(C)；userId→User(C) |
| `Report` | id, userId, projectId, reportType(`日报/周报/月报`), month, content(json), status(`草稿/已提交/已阅/需修改`), submittedAt?, approvedBy?, approvedAt?, approveNote?, createdAt, updatedAt | id | [updatedAt] | UQ[userId,projectId,month,reportType]；userId→User(C)；projectId→Project(C)；approvedBy→User |
| `ReportVersion` | id, reportId, version(int), content, createdAt | id | — | UQ[reportId,version]；reportId→Report(C) |
| `MonthlyProgress` | id, projectId, month, actualWork?, completion(int), nextPlan?, risks?, projectStatus?, submittedBy, submittedAt, createdAt, updatedAt | id | [updatedAt] | UQ[projectId,month]；projectId→Project(C)；submittedBy→User |
| `Task` | id, projectId, title, description?, assigneeId?, status(`待开始/进行中/已完成/已阻塞`), priority, phase?, phaseId?, phaseOrder?, taskType?, applicabilityStatus, regulatoryPriority, dueDate?, completedAt?, docRefs?(json), createdAt, updatedAt | id | — | projectId→Project(C)；assigneeId→User(N) |
| `TaskDependency` | id(cuid), taskId, prerequisiteId, createdAt | id | — | UQ[taskId,prerequisiteId]；taskId/prerequisiteId→Task(C) |
| `RegulatoryDocument` | id, dispatchNo(UQ), title, fullTitle?, category?, applicability, applicableToIvd(bool), priorityLevel, summary?, applicabilityNote?, fileName?, createdAt, updatedAt | id / dispatchNo | [priorityLevel],[applicability],[applicableToIvd] | — |
| `TaskRegulatoryDocument` | taskId, regulatoryDocumentId, relationType, note?, createdAt | PK[taskId,regulatoryDocumentId] | [taskId],[regulatoryDocumentId] | taskId→Task(C)；regulatoryDocumentId→RegulatoryDocument(C) |
| `Milestone` | id, projectId, name, phaseId?, phaseName?, date(dt), status(`待完成/已完成/已延期`), completedAt?, createdAt, updatedAt | id | [projectId] | projectId→Project(C) |
| `SystemLog` | id, action, userId, targetId?, detail?, ip?, createdAt | id | — | userId→User(C) |
| `DocCategory` | id, name, description?, icon?, sortOrder, createdAt, updatedAt | id | — | — |
| `DocDocument` | id, categoryId, code(UQ), title, description?, docType(`sop/template/guide/reference`), content?, fileUrl?, fileName?, version, status, tags?, createdBy, approvedBy?, approvedAt?, createdAt, updatedAt | id / code | [categoryId],[docType],[status] | categoryId→DocCategory(C)；createdBy/approvedBy→User |
| `DocVersion` | id, documentId, version, content, changelog?, createdBy, createdAt | id | — | UQ[documentId,version]；documentId→DocDocument(C) |
| `Reagent` | id, name(UQ), fullName?, casNumber?, category, molecularWeight?(flt), purity(flt), density?, defaultUnit, hazardLevel?, supplier?, storageCondition?, notes?, status, createdAt, updatedAt | id / name | [category] | — |
| `ReagentMaterial` | id, name?(legacy), commonName(UQ), chineseName?, englishName?, category, casNumber?, molecularFormula?, mw(flt), purity(flt), density?, state, defaultStockConc?, defaultStockUnit?, supplier?, notes?, createdAt, updatedAt | id / commonName | [commonName],[category] | — |
| `ReagentFormula` | id, code(UQ), name?, type, pH?(flt), status, projectId?, procedure?, notes?, createdBy, createdAt, updatedAt | id / code | [type],[status] | projectId→Project(N)；createdBy→User |
| `FormulaComponent` | id, formulaId, reagentId?, reagentMaterialId?, componentName?, concentration(flt), unit, notes?, sortOrder | id | [formulaId] | formulaId→ReagentFormula(C)；reagentId→Reagent；reagentMaterialId→ReagentMaterial |
| `PrepRecord` | id, formulaId, targetVolume(flt), calcResult(txt), prepDate(txt), operator?, batchNo?, notes?, createdBy, createdAt | id | [formulaId] | formulaId→ReagentFormula(C)；createdBy→User |
| `PhaseTransition` | id(cuid), fromPhaseId, toPhaseId, createdAt | id | — | UQ[fromPhaseId,toPhaseId]（阶段 ID 为字符串，非模型关系） |
| `TaskTemplate` | id, name(UQ), category?, description?, estimatedDays(int), priority, tags?, createdAt, updatedAt | id / name | [category] | — |
| `TaskTemplateStep` | id, templateId, order(int), title, description?, estimatedHours?(flt), assigneeRole?, checklist?, createdAt, updatedAt | id | [templateId],[order] | templateId→TaskTemplate(C) |
| `Primer` | id, projectName?, name, sequence, targetGene?, detectionTarget?, …(修饰/物种/菌株等), status, createdBy?, createdAt, updatedAt | id | [projectName],[targetGene],[detectionTarget],[name] | — |
| `SampleMaterial` | id, sampleCode(UQ), sampleName, sampleType, species?, tissue?, concentration?, volume?, storageCondition, collectionDate?, expiryDate?, supplier?, status, projectId?, notes?, createdAt, updatedAt | id / sampleCode | [projectId],[sampleType],[status] | projectId→Project(N) |

### 4.3 设计要点

- **关系型外键由 Prisma 维护**：删除项目（`Cascade`）会级联清理成员 / 汇报 / 任务 / 里程碑 / 进展 / 注册档案；删除用户（`Cascade`）清理其创建的汇报、版本等，`SetNull` 处理负责人 / 指派人。
- **JSON 以文本存储**：`content`、`docRefs`、`preview` 等复杂结构存为 `String`，由应用层序列化，避免数据库 JSON 类型耦合。
- **状态字段用字符串枚举**：`role` / `status` / `reportType` 等以字符串常量表示（非 DB enum），便于演进但依赖应用层约束（见技术债务 §10）。
- **唯一约束保证业务一致性**：汇报按 `[userId,projectId,month,reportType]` 唯一（upsert 幂等），项目成员按 `[projectId,userId]` 唯一。

---

## 5. API 接口文档

### 5.1 通用约定

- **Base URL**：`/api`（生产经 Nginx 同域反代；前端默认 `VITE_API_URL` 未设时即 `/api`）。
- **认证**：除 `POST /api/auth/login` 外，所有接口需在请求头携带 `Authorization: Bearer <token>`。
- **鉴权图例**：
  - 🔓 `auth`：需登录（`authMiddleware`）
  - 👤 `admin`：需管理员（`adminMiddleware`）
  - 🧑‍💼 `admin|manager`：需管理员或项目经理（`adminOrManagerMiddleware`）
  - `角色权限`：在接口内按 `registrations.*` / `regulatory-documents.*` 权限位判断（admin 全有，manager 有 view+edit，member 仅 view）
- **统一响应**：`{ success, message?, data?, list?, total?, page?, pageSize?, ... }`（前端 `ApiResponse<T>`）。错误返回 `{ error, code }` + 对应 HTTP 状态码。

### 5.2 认证与用户 `/api/auth`、`/api/users`

| 方法 | 路径 | 鉴权 | 功能 | 请求体 / 参数 |
|------|------|------|------|----------------|
| POST | `/api/auth/login` | 否 | 登录签发 JWT | `{username,password}` → `{token,user{...,permissions}}` |
| POST | `/api/auth/verify` | 🔓 | 校验 Token | — |
| POST | `/api/auth/logout` | 🔓 | 登出（写日志） | — |
| GET | `/api/auth/profile` | 🔓 | 当前用户资料 | — |
| PUT | `/api/auth/password` | 🔓 | 改密（新密码≥6） | `{oldPassword,newPassword}` |
| GET | `/api/users` | 🔓 | 用户列表 | query: `page,pageSize,department,role,status` |
| GET | `/api/users/:id` | 🔓 | 用户详情 | — |
| POST | `/api/users` | 👤 | 创建用户 | `{username,password,name,position,department,role}` |
| PUT | `/api/users/:id` | 🔓 | 更新（非管理员仅改自己） | 用户字段 |
| PUT | `/api/users/:id/reset-password` | 👤 | 管理员重置密码 | `{newPassword}` |
| DELETE | `/api/users/:id` | 👤 | 删除（不可删自己） | — |
| POST | `/api/users/batch` | 👤 | 批量导入 | `{users:[...]}` |

### 5.3 项目与成员 `/api/projects`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/projects` | 🔓 | 项目列表（分页/筛选） |
| GET | `/api/projects/:id` | 🔓 | 项目详情（含成员/任务/里程碑/进展） |
| POST | `/api/projects` | 🔓 | 创建（支持草稿，自动建成员/任务/里程碑） |
| PUT | `/api/projects/:id` | 🔓 | 更新（状态机校验 + 成员/任务重建） |
| DELETE | `/api/projects/:id` | 🧑‍💼 | 删除项目 |
| GET | `/api/projects/:id/members` | 🔓 | 成员列表 |
| POST | `/api/projects/:id/members` | 🧑‍💼 | 添加成员 |
| DELETE | `/api/projects/:id/members/:userId` | 🧑‍💼 | 移除成员（不可移负责人） |
| GET | `/api/projects/stats/types` | 🔓 | 按类型统计 |
| GET | `/api/projects/stats/status` | 🔓 | 按状态统计 |
| POST | `/api/projects/:id/apply-template` | 🧑‍💼 | 套用模板生成任务/里程碑 |
| POST | `/api/projects/batch-delete` | 🧑‍💼 | 批量删除 |
| POST | `/api/projects/batch-update-status` | 🧑‍💼 | 批量改状态 |

### 5.4 汇报 `/api/reports`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/reports` | 🔓 | 汇报列表（分页/筛选） |
| GET | `/api/reports/:id` | 🔓 | 汇报详情（含版本） |
| POST | `/api/reports` | 🔓 | 创建/更新（按唯一约束 upsert） |
| PUT | `/api/reports/:id` | 🔓 | 更新（仅本人） |
| POST | `/api/reports/:id/submit` | 🔓 | 提交（生成版本） |
| POST | `/api/reports/:id/approve` | 🔓(admin/manager) | 审阅"已阅" |
| POST | `/api/reports/:id/reject` | 🔓(admin/manager) | 批示"需修改" |
| GET | `/api/reports/:id/versions` | 🔓 | 版本历史 |

### 5.5 任务 `/api/tasks`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/tasks/` | 🔓 | 任务列表（筛选/分页） |
| POST | `/api/tasks/` | 🔓 | 创建任务 |
| GET | `/api/tasks/:id` | 🔓 | 任务详情（含前置/法规） |
| PUT | `/api/tasks/:id` | 🔓 | 更新 |
| PATCH | `/api/tasks/:id/status` | 🔓 | 改状态（看板拖拽） |
| DELETE | `/api/tasks/:id` | 🧑‍💼 | 删除 |
| POST | `/api/tasks/:id/prerequisites` | 🔓 | 加前置（环检测） |
| DELETE | `/api/tasks/:id/prerequisites/:prerequisiteId` | 🔓 | 删前置 |
| GET | `/api/tasks/board/:projectId` | 🔓 | 看板分组数据 |
| POST | `/api/tasks/batch/status` | 🧑‍💼 | 批量改状态 |

### 5.6 月度进展 `/api/progress`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/progress/project/:projectId` | 🔓 | 某项目月度进展 |
| POST | `/api/progress/project/:projectId` | 🔓 | 填写/更新月度进展 |
| GET | `/api/progress/all/:month` | 🔓 | 某月全部项目进展 |
| GET | `/api/progress/export/:month` | 🔓 | 导出月报 |

### 5.7 同步 `/api/sync`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/sync/init` | 🔓 | 增量拉取当前用户可访问数据 |
| POST | `/api/sync/push` | 🔓 | 上行推送本地变更（含权限校验） |

### 5.8 统计 `/api/stats`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/stats/dashboard` | 🔓 | 仪表盘统计 |
| GET | `/api/stats/projects` | 🔓 | 项目统计（含完成率） |
| GET | `/api/stats/users/:userId/workload` | 🔓 | 个人工作量 |
| GET | `/api/stats/reports` | 🔓 | 汇报统计 |

### 5.9 知识库与文档 `/api/docs`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/docs/categories` | 🔓 | 分类列表 |
| POST | `/api/docs/categories` | 🔓 | 建分类 |
| PUT | `/api/docs/categories/:id` | 🔓 | 改分类 |
| DELETE | `/api/docs/categories/:id` | 🧑‍💼 | 删分类 |
| GET | `/api/docs/documents` | 🔓 | 文档列表 |
| GET | `/api/docs/documents/:id` | 🔓 | 文档详情（含版本） |
| POST | `/api/docs/documents` | 🔓 | 建文档 |
| PUT | `/api/docs/documents/:id` | 🔓 | 改文档（建版本） |
| DELETE | `/api/docs/documents/:id` | 🧑‍💼 | 删文档 |
| GET | `/api/docs/documents/:id/versions` | 🔓 | 版本历史 |
| GET | `/api/docs/search` | 🔓 | 关键词搜索 |

### 5.10 项目模板 `/api/project-templates`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| GET | `/api/project-templates/` | 🔓 | 模板列表 |
| GET | `/api/project-templates/:id` | 🔓 | 模板详情（含子/阶段） |
| POST | `/api/project-templates/` | 👤 | 建模板 |
| PUT / PATCH | `/api/project-templates/:id` | 🧑‍💼 | 更新模板 |
| DELETE | `/api/project-templates/:id` | 👤 | 删模板 |
| POST | `/api/project-templates/:id/copy` | 👤 | 复制 |
| GET | `/api/project-templates/:id/preview` | 🔓 | 预览阶段结构 |
| POST | `/api/project-templates/:id/apply` | 🔓 | 应用生成数据 |
| GET/POST/PUT/DELETE | `/api/project-templates/:templateId/roles[/:roleId]` | 🔓/🧑‍💼 | 模板角色 CRUD + 批量 |

### 5.11 阶段流转 `/api/phases`

| 方法 | 路径 | 鉴权 | 功能 |
|------|------|------|------|
| POST | `/api/phases/:id/transitions` | 🔓 | 建阶段流转（环检测） |
| DELETE | `/api/phases/:id/transitions/:toPhaseId` | 🔓 | 删阶段流转 |

### 5.12 试剂 / 原料 / 配方 / 配制 `/api/reagents`、`/api/reagent-materials`、`/api/formulas`、`/api/prep`

| 方法 | 路径 | 前缀 | 鉴权 | 功能 |
|------|------|------|------|------|
| GET/POST/PUT/DELETE | `/api/reagents/` `:id` | reagents | 🔓 | 试剂 CRUD（删时查配方引用） |
| GET | `/api/reagents/:id/formulas` | reagents | 🔓 | 引用该试剂的配方 |
| GET/POST/PUT/DELETE | `/api/reagent-materials/` `:id` | reagent-materials | 🔓 | 原料 CRUD + `bulk-delete` |
| GET/POST/PUT/DELETE | `/api/formulas/` `:id` | formulas | 🔓 | 配方 CRUD（含组分）+ `:id/duplicate` |
| POST | `/api/prep/calculate` | prep | 🔓 | 配制计算（不落库） |
| POST/GET | `/api/prep/records` | prep | 🔓 | 保存 / 列表配制记录 |
| GET | `/api/prep/records/:id` | prep | 🔓 | 配制记录详情 |

### 5.13 任务模板 / 引物 / 样本 `/api/task-templates`、`/api/primers`、`/api/samples`

| 方法 | 路径 | 前缀 | 鉴权 | 功能 |
|------|------|------|------|------|
| GET/POST/PUT/DELETE | `/api/task-templates/` `:id` | task-templates | 🔓 | 任务模板 CRUD + `bulk-delete` |
| POST | `/api/task-templates/seed` | task-templates | 👤 | 预置标准模板 |
| GET/POST/PUT/DELETE | `/api/primers/` `:id` | primers | 🔓 | 引物/探针 CRUD + `batch-import` |
| GET/POST/PUT/DELETE | `/api/samples/` `:id` | samples | 🔓 | 样本 CRUD（自动编号） |

### 5.14 注册申报与法规 `/api/registrations`、`/api/regulatory-documents`

| 方法 | 路径 | 前缀 | 鉴权 | 功能 |
|------|------|------|------|------|
| GET | `/api/registrations/` | registrations | 角色(view) | 列表（含到期预警） |
| GET | `/api/registrations/stats` | registrations | 角色(view) | 统计 |
| GET | `/api/registrations/templates` | registrations | 角色(view) | 可用模板 |
| GET | `/api/registrations/:id` | registrations | 角色(view) | 详情 |
| POST | `/api/registrations/` | registrations | 角色(edit) | 创建（含档案/任务/里程碑） |
| PUT | `/api/registrations/:id` | registrations | 角色(edit) | 更新 |
| PATCH | `/api/registrations/:id/stage` | registrations | 角色(edit) | 阶段推进（状态机，approve 可越级） |
| PATCH | `/api/registrations/:id/profile` | registrations | 角色(edit) | 更新档案 |
| GET/POST/PUT/DELETE | `/api/regulatory-documents/` `:id` | regulatory-documents | 角色(view/edit) | 法规 CRUD + `import`(base64) |
| POST | `/api/regulatory-documents/seed` | regulatory-documents | 👤 | 预置种子法规库 |
| POST/GET | `/api/regulatory-documents/:id/original-file` | regulatory-documents | 角色(edit/view) | 上传 / 下载原文件 |

### 5.15 备份 `/api/backup`（均 👤 管理员）

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/backup/export` | 导出备份（`?modules=` 选择性导出） |
| POST | `/api/backup/restore` | 从 JSON 备份事务恢复 |

### 5.16 登录请求/响应示例

```http
POST /api/auth/login
Content-Type: application/json

{ "username": "admin", "password": "admin123" }
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "name": "管理员",
    "role": "admin",
    "status": "active",
    "permissions": ["projects.create", "users.manage", "registrations.approve", "..."]
  }
}
```

---

## 6. 前端模块设计

### 6.1 路由结构（`src/App.tsx`）

路由守卫 `ProtectedRoute`：读取 `useAppStore().user`，为空则 `<Navigate to="/login">`；响应拦截器遇 401 会清 token 并跳登录，形成双重保护。

| 路径 | 组件 | 说明 |
|------|------|------|
| `/login` | `Login` | 登录（公开） |
| `/` | `Dashboard` | 仪表盘 |
| `/projects` `/projects/new` | `Projects` | 项目列表 / 新建 |
| `/projects/:id` | `ProjectDetail` | 项目详情 |
| `/registrations` `/registrations/:id` | `RegistrationProjects` / `RegistrationProjectDetail` | 注册申报 |
| `/regulatory-documents` | → `/knowledge?module=regulatory` | 重定向到知识库法规模块 |
| `/project-templates` `/:id/edit` | `TemplateLibrary` / `TemplateEditor` | 项目模板 |
| `/task-templates` | `TaskTemplateLibrary` | 任务模板（knowledge/） |
| `/reports` `/:id` `/:id/review` | `Reports` / `ReportEdit` / `ReportReview` | 汇报 |
| `/knowledge` `/:id` | `Docs` / `KnowledgeDetail` | 知识库 |
| `/reagent-formula` `/new` `/:id/edit` `/calculator` | `FormulaList` / `FormulaEditor` / `PrepCalculator` | 试剂配方 |
| `/tasks` | `Tasks` | 任务看板 |
| `/users` | `Users` | 用户管理 |
| `/settings` | `Settings` | 系统设置 |
| `/backup` | `BackupManager` | 备份管理 |

通配 `*` → 重定向首页。

### 6.2 状态管理（`src/store/appStore.ts`，Zustand）

- **State**：`user`、`token`、`projects`、`reports`、`tasks`、`milestones`、`monthlyProgress`、`projectMembers`、`lastSync`、`isOnline`、`isSyncing`。
- **Actions**：`login/logout`、`init`（启动校验 token + 拉本地数据 + 触发同步）、`sync`（上行本地变更 → 下行增量 → 对账）、`saveReportLocal/saveTaskLocal`（写 Dexie）、各 `setXxx`。
- **持久化**：`persist` 中间件仅持久化 `lastSync`（`partialize`），业务数据走 Dexie（库名 `RDPatabase`，version 2，7 个 object store：projects/reports/tasks/milestones/monthlyProgress/projectMembers/syncMeta）。
- **离线优先**：网络恢复后 `sync()` 与后端增量对账，保证多端一致。

### 6.3 组件划分

- **布局**：`components/Layout.tsx`（侧边栏 + 顶栏，包裹受保护路由）。
- **业务组件**：`KanbanBoard`（看板）、`PhaseTaskPanel`、`PhaseProgressBar`、`ProcessFlowDiagram`、`MindMapView`、`HierarchicalTaskList`、`ProjectCard`、`CreateProjectModal`、`EditProjectModal`、`AddMemberModal`、`DocReference`、`ProjectTemplateEditor`、`ReagentDailyReport`、`VisualTableEditor`。
- **页面域目录**：`pages/knowledge/`（任务模板、试剂库、引物库、扩增试剂库、样本库）、`pages/reagent-formula/`（配方列表/编辑器/批量编辑/计算器）。

### 6.4 API 客户端（`src/api/client.ts`）

```ts
const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '/api';
```

- 请求拦截器注入 `Authorization: Bearer <token>`（从 localStorage `rdpms_token`）。
- 响应拦截器解包 `response.data`；遇 401 清 token 并跳 `/login`。
- 导出按业务域拆分对象：`authAPI / userAPI / projectAPI / registrationsAPI / regulatoryDocumentsAPI / reportAPI / progressAPI / taskAPI / syncAPI / statsAPI / projectTemplatesAPI / taskTemplatesAPI / docsAPI / reagentAPI / reagentMaterialsAPI / formulaAPI / prepAPI / primerAPI / samplesAPI`，及默认 `api` 实例。

---

## 7. 认证与权限设计

### 7.1 JWT 结构

- **签发**（`/api/auth/login` 成功）：`jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' })`。
- **Payload**：`{ userId: string, role: 'admin'|'manager'|'member' }`，有效期 7 天，**无刷新令牌**（见技术债务）。
- **校验**：`authMiddleware` 解析 `Authorization: Bearer <token>`，写入 `c.set('userId'/'userRole')` 供后续处理。
- **密钥**：优先 `JWT_SECRET` 环境变量；未配置则运行时生成一次性密钥并告警（重启后旧 token 失效，禁止用于生产）。

### 7.2 RBAC 角色权限矩阵

权限位（`permissions.ts` / 后端 `ROLE_PERMISSIONS`）：

| 权限位 | admin | manager | member |
|--------|:-----:|:-------:|:------:|
| `projects.create` | ✅ | ✅ | — |
| `projects.edit` | ✅ | ✅ | — |
| `projects.delete` | ✅ | — | — |
| `projects.update_status` | ✅ | ✅ | — |
| `projects.manage_members` | ✅ | ✅ | — |
| `tasks.create` | ✅ | ✅ | ✅ |
| `tasks.update_status` | ✅ | ✅ | ✅ |
| `tasks.delete` | ✅ | ✅ | — |
| `users.manage` | ✅ | — | — |
| `templates.create` | ✅ | — | — |
| `templates.edit` | ✅ | ✅ | — |
| `registrations.view` | ✅ | ✅ | ✅ |
| `registrations.edit` | ✅ | ✅ | — |
| `registrations.approve` | ✅ | — | — |

> 后端为安全权威（所有写操作经中间件/权限位校验）；前端 `permissions.ts` 仅用于按钮显隐（非安全边界）。`registrations` / `regulatory-documents` 模块用 `registrations.view/edit/approve` 三个权限位在接口内细粒度判断。

### 7.3 中间件链

```
请求 → CORS 中间件（origin 白名单，credentials:true）
     → Idempotency 中间件（仅 PUT，按 Idempotency-Key 去重，24h）
     → 路由模块级 authMiddleware（全局需登录）
         ├─ adminMiddleware（部分端点）
         └─ adminOrManagerMiddleware（部分端点）
     → 业务处理器
     → onError / notFound 统一处理
```

- **CORS**：`CORS_ORIGINS` 逗号分隔白名单；同源（无 origin）或命中放行，否则拒绝（避免 `*` + credentials 风险）。
- **幂等**：`Idempotency-Key` 头命中缓存（内存 Map，重启失效）→ 直接返回上次结果，防弱网重传重复写入（生产建议换 Redis，见 §10）。

---

## 8. 部署架构

> 当前标准化部署为 **Nginx + systemd + PostgreSQL**（详见 `docs/deployment/deploy-guide.md`）。按需求同时提供 **Caddy** 等价配置（见 8.5）。

### 8.1 多实例隔离方式

- **后端无状态**：JWT 鉴权不依赖服务端会话，多个后端实例可共享同一 PostgreSQL，前置 Nginx / 负载均衡即可水平扩展。
- **进程隔离**：后端以专用系统用户 `rdpms` 运行，`systemd` 设 `MemoryMax=512M`、`Restart=on-failure` 防止异常占用与崩溃。
- **数据库隔离**：专用 PostgreSQL 角色 `rdpms` + 独立库 `rdpms`，仅本机 127.0.0.1 可达；应用与数据库网络隔离（不在同一暴露面）。
- **端口隔离**：对外仅 80（后 443）；后端 3000 仅监听本机，Nginx 反代抵达，公网不可直接访问。
- **已知限制（多实例注意）**：幂等缓存当前为**单实例内存 Map**，多实例下重复 PUT 可能命中不同实例——需改用 Redis 等共享存储（见 §10）。

### 8.2 环境变量清单

**后端 `backend/.env`**：

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 | `postgresql://rdpms:密码@localhost:5432/rdpms?schema=public` |
| `JWT_SECRET` | ✅ | JWT 强密钥（≥64 位 hex） | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `PORT` | 否 | 后端监听端口 | `3000` |
| `CORS_ORIGINS` | 否 | 允许来源（逗号分隔） | `http://111.231.166.161` |
| `NODE_ENV` | 否 | 运行环境 | `production` |

**前端（构建期）**：`VITE_API_URL` / `VITE_API_BASE`（可选，默认 `/api`；独立域名部署时设完整基址且含 `/api` 后缀）。

### 8.3 systemd 服务（`/etc/systemd/system/rdpms-backend.service`）

```ini
[Unit]
Description=RDPMS Backend (Hono)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=rdpms
Group=rdpms
WorkingDirectory=/opt/rdpms/backend
EnvironmentFile=/opt/rdpms/backend/.env
ExecStart=/usr/bin/node /opt/rdpms/backend/src/index.js
Restart=on-failure
RestartSec=3
MemoryMax=512M
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rdpms-backend

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rdpms-backend
journalctl -u rdpms-backend -f   # 查看日志
```

### 8.4 Nginx 配置（`/etc/nginx/sites-available/rdpms`）

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /opt/rdpms/frontend/dist;
    index index.html;

    gzip on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_vary on;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/x-javascript image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options nosniff;
    }
    location ~* \.(ico|png|svg|jpg|jpeg|gif|json|woff2?)$ { expires 30d; add_header Cache-Control "public"; }
    location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache, no-store, must-revalidate"; }

    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

### 8.5 Caddy 等价配置（替代 Nginx）

若选用 Caddy，删除 Nginx 配置后使用以下 `Caddyfile`（`sudo caddy reload`）：

```caddyfile
:80 {
    root * /opt/rdpms/frontend/dist
    encode gzip

    # SPA 回退
    try_files {path} /index.html
    file_server

    # API 反代到本机后端
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }

    # 静态资源长缓存
    @assets path /assets/*
    header @assets Cache-Control "public, immutable"
}
```

> Caddy 自动处理 gzip、`try_files`、健康检查；后续启用 HTTPS 仅需将 `:80` 改为你的域名，Caddy 自动申请 Let's Encrypt 证书。

---

## 9. 安全设计

### 9.1 认证与令牌

- JWT 无状态、7 天有效期；密钥强制生产配置（`JWT_SECRET`），缺失即告警并拒绝作为生产凭据。
- 密码以 bcrypt（cost 10）单向哈希存储，登录用 `bcrypt.compare` 校验，响应中**绝不返回 password 字段**。
- 账号 `status='disabled'` 时拒绝登录（403）。

### 9.2 鉴权与越权防护

- 后端为唯一安全边界：`adminMiddleware` / `adminOrManagerMiddleware` 拦截敏感写操作；`registrations` / `regulatory-documents` 按权限位细粒度校验（含"不可删自己""不可移负责人"等特例）。
- CORS 白名单 + `credentials:true` 组合，避免通配 `*` 带来的凭证泄露。

### 9.3 密码策略

- 修改密码要求 `newPassword.length >= 6`（前端 + 后端双重校验）。
- 管理员可重置成员密码；禁用明文传输（HTTPS 阶段强化，见 §10）。

### 9.4 审计日志（`SystemLog`）

- 记录 `login` / `logout` / `report_submit` / `report_approve` 等关键动作，字段：`action, userId, targetId, detail, ip, createdAt`。
- `ip` 取自 `X-Forwarded-For`（经 Nginx 反代），支撑事后追溯。

### 9.5 限流 / 防重放

- **幂等中间件**：PUT 请求携带 `Idempotency-Key` 时去重（24h 内存缓存），防弱网重传重复写入。
- **全局限流**：⚠️ 当前**未实现**统一速率限制（如登录爆破防护），属待办（见 §10）。

### 9.6 其他

- 数据库凭据独立于应用，专用低权角色；端口最小化暴露（仅 80/443）。
- 种子账号 `admin/admin123` 首次登录后应强制改密（运营规范，非系统强制）。

---

## 10. 已知技术债务与待办

| 类别 | 项 | 说明 / 建议 |
|------|----|--------------|
| 鉴权 | 无刷新令牌 | JWT 7 天固定有效期，过期需重新登录；建议引入 refresh token。 |
| 安全 | 无全局限流 | 登录/API 缺速率限制，存在爆破风险；建议加中间件或网关限流。 |
| 安全 | 尚未启用 HTTPS | 当前公网 HTTP；建议绑定域名后启用 TLS（Caddy 可自动签发）。 |
| 安全 | 密码策略偏弱 | 仅最小 6 位，无复杂度/历史校验；建议增强。 |
| 可靠性 | 幂等缓存单实例 | `idempotency` 用内存 Map，多实例失效；建议换 Redis。 |
| 数据 | 用 `db push` 而非 migration | 无版本化迁移历史，团队协作/回滚不便；建议改用 `prisma migrate`。 |
| 数据 | 状态字段为字符串 | `role/status/reportType` 等为字符串，缺 DB 层枚举约束；建议评估 enum 或查表。 |
| 前端 | 大组件 | `TemplateEditor`(~123KB)、`ProcessFlowDiagram`(~61KB)、`CreateProjectModal`(~57KB) 体积大，影响首屏；建议拆分/懒加载。 |
| 工程化 | 缺自动化测试 | 后端/前端均无单测与 E2E；建议补关键路径测试。 |
| 工程化 | 缺 CI/CD | 无流水线；建议加 lint + tsc + test + build 门禁。 |
| 工程化 | 缺输入校验层 | 依赖各路由手动 `if` 判断，易遗漏；建议引入 zod 等 schema 校验。 |
| 兼容性 | SQLite/PG 漂移 | 已统一为 PostgreSQL 以消除大小写等差异；若本地仍用 SQLite 需保持同步。 |
| 运维 | 备份未加密传输 | `pg_dump` 明文；建议加密备份并异地存储。 |
| 体验 | Dexie 升级需硬刷新 | schema 版本升级时旧本地库需用户硬刷新（Cmd/Ctrl+Shift+R）触发迁移。 |

> 代码质量审查（`docs/CODE_REVIEW.md`）列出的 43 项问题**已全部收敛**（含 ApiResponse 弱类型、CORS、`[key:string]:any` 索引等）。

---

## 11. 开发环境搭建指南

### 11.1 前置

- Node.js 20 LTS、`npm`
- PostgreSQL 14（本地）或 Docker：`docker run -d --name rdpms-pg -p 5432:5432 -e POSTGRES_PASSWORD=本地密码 postgres:14`

### 11.2 后端

```bash
cd rdpms-system/backend
npm install
createdb rdpms                              # 或 psql 建库
# 编辑 .env
# DATABASE_URL="postgresql://postgres:本地密码@localhost:5432/rdpms?schema=public"
# JWT_SECRET="rdpms-local-dev-secret"
npx prisma generate
npx prisma db push --accept-data-loss      # 建表
node prisma/seed.js                         # 种子：admin/admin123 等
npm run dev                                 # nodemon 启动，端口 3000
```

### 11.3 前端

```bash
cd rdpms-system/frontend
npm install
npm run dev                                 # Vite，端口 5173，代理 /api → :3000
```

> 或使用仓库根 `start-dev.sh` 一键拉起（杀旧进程 → `db push` → seed → 起后端 → 起前端 → 健康检查）。

### 11.4 验证

- 浏览器打开 `http://localhost:5173/`，用 `admin / admin123` 登录。
- `curl http://localhost:3000/api/health` 应返回 `{"status":"ok"}`。

---

## 12. 运维手册

### 12.1 备份

**数据库（推荐，每日 cron）**：

```bash
pg_dump "postgresql://rdpms:密码@localhost:5432/rdpms" -F c -f /opt/rdpms/backups/rdpms_$(date +%Y%m%d_%H%M%S).dump
# 恢复：pg_restore -d rdpms -c /opt/rdpms/backups/rdpms_xxx.dump
```

**应用层备份/恢复**（无需数据库权限，管理员在 `/backup` 页面或 API 操作）：

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/backup/export?modules=projects,reports > backup.json
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     --data @backup.json http://localhost:3000/api/backup/restore
```

### 12.2 日志查看

```bash
sudo journalctl -u rdpms-backend -f           # 后端日志
sudo tail -f /var/log/nginx/error.log         # Nginx 错误
sudo tail -f /var/log/nginx/access.log        # Nginx 访问
```

### 12.3 重启 / 发布

```bash
# 后端
sudo systemctl restart rdpms-backend
# Nginx 改配置后
sudo nginx -t && sudo systemctl reload nginx   # 或 Caddy: sudo caddy reload
```

代码更新（git 流程）：

```bash
cd /opt/rdpms && git pull
cd backend && npm install --omit=dev && npx prisma generate && node prisma/seed.js   # 全新库才需 seed
sudo systemctl restart rdpms-backend
cd ../frontend && npm install && npm run build
sudo systemctl reload nginx
```

### 12.4 故障排查

| 现象 | 可能原因 | 处置 |
|------|----------|------|
| 前端登录报 Dexie/IndexedDB `object stores was not found` | 本地库 schema 版本升级（`appStore` 已升 v2）但旧库未迁移 | 浏览器**硬刷新**（Cmd/Ctrl+Shift+R）触发 Dexie 升级 |
| `502 Bad Gateway` | 后端未起 / 端口错 | `systemctl status rdpms-backend`；查 `journalctl` |
| `/api` 404 或 CORS 报错 | Nginx 反代未生效 / `CORS_ORIGINS` 未含来源 | 检查 `location /api/` 与后端 `CORS_ORIGINS` |
| 登录报 `用户名或密码错误` 但密码正确 | `JWT_SECRET` 与旧 token 不一致（重启后一次性密钥） | 生产务必固定 `JWT_SECRET`；清 localStorage 重新登录 |
| `PrismaClientInitializationError` | `DATABASE_URL` 错 / PG 未起 | 校验连接串、`systemctl status postgresql` |
| 公网无法访问 | 腾讯云安全组未放通 80/443 | 控制台放通入站 TCP 80（HTTPS 阶段 443） |
| 静态资源无 gzip | Nginx gzip 未开 | 确认 `gzip on;` 与 `gzip_types` |
| 弱网重复提交产生重复数据 | 非 PUT 请求无幂等保护 | 前端对写操作加 `Idempotency-Key`（PUT） |

---

*文档版本：v1.0.0 · 生成于 2026-07-14 · 对应分支 `tencent_CVM/rdpm`*
