# 项目注册管理模块移植计划（法规驱动实施版）

文档版本：v2.0  
创建日期：2026-05-18  
更新日期：2026-05-18  
适用范围：rdpms-system 前后端一体化改造（Prisma + SQLite）

---

## 1. 背景与目标

将现有项目注册系统能力（来源于 Macao_IVD）纳入研发项目管理系统，形成统一模块“项目注册管理”，并升级为基于 ISAF 2026 的法规驱动型管理能力。

本计划遵循四项原则：
- 单一认证体系：沿用现有 JWT 认证与权限模型，不引入第二套登录体系。
- 单一数据主线：沿用 Prisma 数据层，不并行维护 Supabase 业务主数据。
- 渐进式上线：先交付可用 MVP，再叠加迁移和高级能力。
- 兼容现有任务体系：保留当前 Project/Task 主链路，增量扩展法规字段与关联关系。

---

## 2. 范围定义

### 2.1 本期建设范围

- 前端新增“项目注册管理”导航入口与页面。
- 后端新增注册模块 API（registrations 路由组）。
- 数据库新增项目注册扩展档案表（与 Project 一对一）。
- 复用现有项目、阶段、任务、模板机制，构建注册业务模板。
- 建立基础权限码并接入前后端权限判断。
- 新增“法规知识库”能力（26项 ISAF/2026 批示）。
- 建立任务与法规依据多对多关联。
- 扩展任务法规字段：taskType/applicabilityStatus/regulatoryPriority/expectedDeliverable/regulatoryNotes。

### 2.2 非本期范围

- 不改造为 Supabase 认证。
- 不引入双写数据架构。
- 不在第一阶段做复杂实时协同。
- 不在本期引入新的工作流引擎。
- 不在本期增加高频法规 Realtime 推送。

---

## 3. 法规定位与实施口径

本次实施以《澳门 IVD 注册法规指导文件》为业务输入，系统侧采用以下口径：

- 法规主线：第1、2、6、7、16、20、21、22号批示。
- 任务体系：由原 5阶段47任务 升级为 5阶段66任务（模板驱动）。
- 数据策略：不新增 Supabase 专属结构，全部落地到 Prisma schema 与 migration.sql。
- 前端策略：先交付法规知识库页 + 任务法规标签与筛选，后续迭代缺口分析页。

---

## 4. 目标架构方案

### 3.1 前端接入位置

- 导航入口：挂载到主布局导航。
- 路由入口：新增注册模块路由组。
- 页面形态：
  - 注册项目列表页（复用现有 Projects 交互模式）。
  - 注册项目详情页（复用 ProjectDetail 框架，新增注册档案面板）。
  - 法规知识库页（新增 /regulatory-documents 路由）。

### 3.2 后端接入位置

- API 命名空间：/api/registrations
- 路由职责建议：
  - 注册项目查询与筛选
  - 注册档案读写
  - 阶段推进与校验
  - 注册统计与预警视图

新增 API 命名空间：/api/regulatory-documents

- 法规文件列表查询
- 法规适用性与优先级筛选
- 单条法规详情查询
- 任务关联法规查询（可由 tasks/registrations 明细接口内聚返回）

### 3.3 数据模型建议

在 Prisma 中新增 ProjectRegistrationProfile（建议名，可在实施时统一命名规范）：

- id
- projectId（unique，关联 Project）
- registrationType（如 IVD/器械/试剂）
- region
- authority
- submissionNo
- certificateNo
- currentStage
- plannedSubmissionDate
- expectedApprovalDate
- complianceOwnerId
- riskLevel
- notes
- createdAt
- updatedAt

在 Prisma 中新增 RegulatoryDocument：

- id
- dispatchNo（唯一）
- title
- fullTitle
- category
- applicability（core/conditional/post_market/low_relevance/not_applicable）
- applicableToIvd（Boolean）
- priorityLevel（P0-P4）
- summary
- applicabilityNote
- fileName
- createdAt
- updatedAt

在 Prisma 中新增 TaskRegulatoryDocument：

- taskId
- regulatoryDocumentId
- relationType（basis/reference/conditional/post_market/not_applicable）
- note
- createdAt

在 Task 中新增字段：

- taskType
- applicabilityStatus
- regulatoryPriority
- expectedDeliverable
- regulatoryNotes

---

## 5. 分阶段实施计划

### 阶段 A：MVP 上线（建议 1-1.5 周）

目标：先可用，先跑通端到端。

交付项：
- Prisma migration：新增注册档案表。
- 后端：新增 registrations 路由，完成基础 CRUD。
- 前端：新增注册列表与详情页。
- 模板：导入“项目注册管理”模板（阶段+任务）。
- 权限：新增 registrations.view、registrations.edit。

验收标准：
- 可创建“项目注册管理”项目。
- 可维护注册档案。
- 可查看项目阶段与任务进度。

### 阶段 B：法规模块接入（建议 1 周）

目标：完成法规知识库与任务法规关联基础能力。

交付项：

- Prisma migration：新增 RegulatoryDocument、TaskRegulatoryDocument 及 Task 扩展字段。
- Seed：导入 26 项法规文件基础数据。
- Seed：将“项目注册管理（IVD）”模板升级为 66 项任务，并附带法规属性。
- 后端：新增 /api/regulatory-documents 列表与筛选接口。
- 前端：新增法规知识库页面与路由入口。

验收标准：

- 法规页面可展示 26 项批示。
- 可按 priorityLevel、applicability、applicableToIvd 筛选。
- 任务创建后可带出法规扩展字段。

### 阶段 C：流程增强（建议 1 周）

目标：补齐业务控制与看板能力。

交付项：
- 阶段流转规则校验（禁止非法迁移）。
- 审批权限 registrations.approve。
- 注册统计面板（按阶段、风险、到期分布）。
- 列表高级筛选（注册类型、阶段、负责人、时限）。

验收标准：
- 非法阶段流转被阻止并返回可读错误。
- 管理层可按维度查看注册项目状态与风险。

### 阶段 D：历史数据迁移（可选，建议 0.5-1 周）

目标：将历史 IVD 数据接入新体系。

交付项：
- 字段映射文档（来源字段 -> 目标字段）。
- 一次性导入脚本（支持 dry-run）。
- 导入校验报告（成功、跳过、失败原因）。

验收标准：
- 历史数据可查询，且与原始样本核对一致。
- 导入失败记录可追踪与重试。

---

## 6. 本轮执行顺序（可直接落地）

1. 先备份数据库（dev.db 或线上实例）。
2. 执行 Prisma migration。
3. 导入/更新 26 项法规文件种子数据。
4. 升级注册模板到 66 任务。
5. 接入前端法规知识库页面。
6. 更新开发文档与接口说明。
7. 执行构建与关键流程验证。

---

## 7. 任务分解清单（可直接进入排期）

1. 数据层
- 设计并评审注册档案 Prisma schema。
- 编写 migration 与 seed 更新。
- 增加法规主数据与任务法规关联模型。
- 增加任务法规扩展字段。

2. 后端层
- 新建 registrations 路由文件并挂载。
- 实现列表、详情、创建、更新接口。
- 增加阶段流转校验与权限校验。
- 新建 regulatory-documents 路由并挂载。
- 支持法规筛选参数（priority/applicability/ivd/category）。

3. 前端层
- 新增注册模块路由与导航。
- 实现列表页与详情页。
- 扩展 API client 的 registrationsAPI。
- 接入权限控制（页面级与按钮级）。
- 新增法规知识库页面、路由和导航。
- 在注册详情或任务区域展示法规依据标签（第二批次可继续增强）。

4. 模板层
- 定义注册模板的阶段与任务结构。
- 支持一键套用模板创建注册项目。
- 将模板升级为 5阶段66任务结构。
- 为任务写入 taskType/regulatoryPriority/expectedDeliverable。

5. 质量保障
- 最少覆盖：创建、编辑、流转、权限、查询五条主流程。
- 增加关键接口异常场景校验（422、403、404）。
- 增加法规查询、筛选、空态、错误态验证。

---

## 8. 风险与控制策略

风险 1：认证与权限分叉  
控制：统一沿用现有 JWT + 权限码，不接入第二套 auth。

风险 2：数据口径不一致  
控制：先完成字段字典与映射评审，再落 migration 与导入脚本。

风险 3：双系统并行导致维护成本上升  
控制：明确“新模块为唯一新增入口”，旧系统仅保留历史参考。

风险 4：阶段定义频繁变更影响模板稳定  
控制：先沉淀固定核心阶段，再允许可配置扩展阶段。

风险 5：外部方案与现有架构不匹配（Supabase vs Prisma）  
控制：以本项目 schema 为准，先做最小兼容映射再落地 SQL。

风险 6：任务数量升级导致存量项目混用口径  
控制：仅对新建注册项目默认应用 66 任务模板，历史项目按需迁移。

---

## 9. 角色分工建议

- 产品/业务：确认阶段规则、审批策略、字段必填规则。
- 后端开发：数据模型、API、流转校验、迁移脚本。
- 前端开发：模块页面、导航接入、权限联动。
- 测试/验收：主流程回归、权限边界、数据一致性。

---

## 10. 开发前置输入（最小必需）

1. 注册类型范围：仅 IVD 还是含器械/试剂。
2. 阶段流转规则：是否允许跳转、回退、并行。
3. 字段清单：必填项、只读项、审批项。
4. 权限矩阵：角色到权限码映射。
5. 历史迁移：是否迁移，及可提供的数据样本格式。

6. 法规文件命名口径：dispatchNo、title 的统一规范。

7. 66任务是否“覆盖旧模板”还是“新模板并存”。

---

## 11. 建议的执行节奏

第 1 周：完成阶段 A + B，并可灰度试用。  
第 2 周：完成阶段 C，并形成稳定流程。  
第 3 周：按需执行阶段 D，完成历史数据并轨。

---

## 12. Definition of Done（DoD）

以下条件同时满足，才视为“项目注册管理模块”完成上线：

- 功能：列表、详情、档案维护、阶段流转、权限控制均可用。
- 法规：法规知识库可展示26项批示，可按优先级和适用性筛选。
- 任务：新建注册项目可按66任务模板初始化，并可读取法规扩展字段。
- 数据：新增表结构稳定，基础数据可追溯。
- 接口：核心 API 文档已更新，错误码语义清晰。
- 质量：关键流程通过验证，阻断级问题为 0。
- 运维：部署与回滚步骤已记录并可执行。

---

## 13. 文档维护说明

本文件用于指导移植执行，不替代接口文档与数据库字典。执行过程中若需求发生变化，请优先更新“范围定义”和“分阶段实施计划”两节。
