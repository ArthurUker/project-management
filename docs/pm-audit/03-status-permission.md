# 状态机与权限模型审计报告

生成时间: 2026-04-15T02:33:24.807Z

目的：梳理当前前端实现的项目状态流转与权限控制现状、发现风险，并给出最小可行的 RBAC 与状态机落地建议。按“现状 / 问题 / 建议”三栏组织，且每条均给出证据文件路径与位置。

---

## 一、状态流转梳理（现状 / 问题 / 建议）

1) 当前项目状态全集
- 现状：前端定义的项目状态集合（中文）为：
  - 规划中、进行中、待加工、待验证、已完成、已归档
- 证据：frontend/src/pages/Projects.tsx 行 10；frontend/src/components/EditProjectModal.tsx 行 31
  - Projects.tsx: /rdpms-system/frontend/src/pages/Projects.tsx (lines ~10)
  - EditProjectModal.tsx: /rdpms-system/frontend/src/components/EditProjectModal.tsx (lines ~31)

- 问题：状态只是字符串常量集合，未在前端或后端看到集中、可校验的状态机定义（allowed transitions 不存在）。
- 建议：在后端与 API 层定义并暴露状态机（allowedTransitions），并在每个 Project DTO 中附带 allowedTransitions: string[] 或 allowedNext: { to:string, reason?:string }，以便前端按实际权限/业务渲染可用的状态操作。
  - 推荐落地点（后端）：projects.get 接口返回 payload.allowedTransitions
  - 推荐前端接收使用点：/rdpms-system/frontend/src/api/client.ts -> projectAPI.get；消费点：/rdpms-system/frontend/src/pages/Projects.tsx 和 EditProjectModal.tsx

2) 状态迁移触发点（当前可直接设置/发起迁移的位置）
- 现状（可触发迁移的代码位置）：
  - 编辑项目（可在 EditProjectModal 中直接设置 status 字段并调用 projectAPI.update）
    - 证据：EditProjectModal.tsx lines ~80-96（构造 payload 包含 status），调用 projectAPI.update at lines ~96
  - 批量更新状态（Projects 页面）调用 projectAPI.batchUpdateStatus
    - 证据：Projects.tsx lines ~190-196 (handleBatchStatus -> projectAPI.batchUpdateStatus)
  - 看板任务拖拽更新任务状态（task 层面，通过 taskAPI.updateStatus）
    - 证据：components/KanbanBoard.tsx lines ~496-504 (await taskAPI.updateStatus)

- 问题：前端允许任意用户（能打开编辑弹窗或触发批量操作者）直接发送任意状态值到后端；没有前端/后端双向约束的状态迁移表，导致潜在非法流转。
- 建议：
  - 后端在变更接口（PUT /projects/:id, POST /projects/batch-update-status）做严格校验：拒绝未列入 allowedTransitions 的迁移。
  - 前端在打开编辑或批量操作时，先请求或读取 allowedTransitions，从而只展示允许的目标状态。
  - 将 projectAPI.update 的 payload 增加乐观并发检查（ETag / version / updatedAt 检查），详见“并发/幂等”建议。

3) 终态 / 可逆态判定
- 现状：前端未明确定义终态；语义上“已归档”通常为终态，“已完成”可能为可逆（可归档/重启），但代码中无约束。
  - 证据：状态值仅为字符串列表，未看到 isTerminal 标注（Projects.tsx lines ~10, EditProjectModal.tsx lines ~31）。
- 问题：不同页面/组件对“已完成/已归档”的处理不一致（有的页面仍可编辑/添加成员）。
  - 证据：ProjectDetail.tsx 中仍展示“编辑 / 添加成员”按钮（/rdpms-system/frontend/src/pages/ProjectDetail.tsx lines ~89-92），没有基于状态禁用操作。
- 建议：后端在状态机定义中标注终态（isTerminal），前端据此禁用创建/编辑/添加成员等操作；同时在 API 层返回 4xx 并给出明确错误码用于前端友好提示。

4) 代码中状态判断/使用的主要位置（方便审计）
- 列表（状态定义与统计）：
  - /rdpms-system/frontend/src/pages/Projects.tsx — 状态常量与统计使用（lines ~10; ~155-162）
- 编辑/保存状态：
  - /rdpms-system/frontend/src/components/EditProjectModal.tsx — 状态下拉与提交 payload（lines ~31; ~198-208; ~86-96）
- 卡片显示与配色：
  - /rdpms-system/frontend/src/components/ProjectCard.tsx — 状态颜色映射（lines ~32-40）
- 详情页的状态色：
  - /rdpms-system/frontend/src/pages/ProjectDetail.tsx — statusColors（lines ~41-47）
- 看板（任务级别状态流转）：
  - /rdpms-system/frontend/src/components/KanbanBoard.tsx — 列定义、拖拽更新（lines ~455-461; ~488-506）

---

## 二、权限梳理（现状 / 问题 / 建议）

1) 角色与权限现状
- 现状：前端使用简单的 role 字段（user.role）做界面级权限判断；常见角色值包含：admin, manager, member。
  - 证据：
    - user 类型定义：/rdpms-system/frontend/src/store/appStore.ts lines ~30-37（interface User 包含 role 字段）
    - Users 页面创建默认 role: 'member'：/rdpms-system/frontend/src/pages/Users.tsx line ~17
    - 侧边栏菜单过滤 adminOnly：/rdpms-system/frontend/src/components/Layout.tsx lines ~14, ~23, ~30
    - TemplateLibrary admin check：/rdpms-system/frontend/src/pages/TemplateLibrary.tsx lines ~22-24, ~48
    - ProjectTemplates new button admin check：/rdpms-system/frontend/src/pages/ProjectTemplates.tsx lines ~41-43
- 问题：角色字符串仅在多处直接比较（user?.role === 'admin'）导致权限逻辑分散、粗粒度且难以扩展；没有权限码或能力列表（ability/permission codes）。
- 建议：
  - 最小可行做法：在 user profile 中引入 permissions: string[]（例如 ['projects.create','projects.edit','projects.delete','projects.update_status']），由后端在登录/verify 时返回并存储（useAppStore.user.permissions）。
  - 前端统一封装一个权限检查 helper：hasPerm('projects.update_status')，放到 /rdpms-system/frontend/src/utils/permissions.ts ，并在 Layout、Templates、Projects 等处使用，替换散落的 role === 'admin' 判定。
  - 证据/变更点：authAPI.login/verify（/rdpms-system/frontend/src/api/client.ts lines ~55-63）与 useAppStore.login（/rdpms-system/frontend/src/store/appStore.ts lines ~172-181）需接收并存储 permissions 字段。

2) 页面级 / 组件级 / 接口级权限控制位置
- 现状：
  - 页面级：Users 页面在渲染前直接检查 currentUser?.role !== 'admin' 并阻止访问（/rdpms-system/frontend/src/pages/Users.tsx lines ~69-75）。Layout 中通过 navItems.adminOnly 标记隐藏菜单（/rdpms-system/frontend/src/components/Layout.tsx lines ~14, ~30）。
  - 组件级：TemplateLibrary 的 CreateTemplateModal 中对 user?.role !== 'admin' 显示禁止创建信息（/rdpms-system/frontend/src/pages/TemplateLibrary.tsx lines ~48-56）。ProjectCard 编辑按钮由父组件是否传入 onEdit 决定（/rdpms-system/frontend/src/components/ProjectCard.tsx lines ~265-288），但无角色校验。
  - 接口级：请求拦截器带上 Authorization token（/rdpms-system/frontend/src/api/client.ts lines ~30-36），响应拦截器在 401 时登出并跳转（/rdpms-system/frontend/src/api/client.ts lines ~41-52）。除此之外，客户端并未在 API 层附加权限码或对请求体做二次检查。
- 问题：前端以 role 字符串及逻辑分散地隐藏/显示 UI，但并未形成统一权限策略；编辑/更新操作（例如 编辑项目、批量更新状态、任务状态拖拽）在前端未被统一限制。
  - 证据：Projects.tsx 将 onEdit 传给 ProjectCard（/rdpms-system/frontend/src/pages/Projects.tsx lines ~544-551），ProjectCard 会渲染编辑按钮（/rdpms-system/frontend/src/components/ProjectCard.tsx lines ~265-288），但没有 role 检查。
- 建议：
  - 在前端实现统一权限中间层：hasPerm/PermissionGuard 组件，用于包裹按钮/功能点，且自动读取 useAppStore().user.permissions。
  - 将后端返回的 permissions 与 API 的错误码映射统一，前端在调用失败时显示明确“无权限”提示而非 generic alert。

3) 与项目管理相关的权限码（建议）
- 当前：无显式权限码，只有 role.
- 建议（最小集合）：
  - projects.create
  - projects.edit
  - projects.delete
  - projects.update_status
  - projects.manage_members
  - projects.view (如果需要区分可见性)
  - tasks.create / tasks.update_status / tasks.delete
- 实施：后端在 Token / profile 中下发 permissions: string[]，并在每个受保护接口做校验；前端用 hasPerm() 控制 UI 展示与可交互性。

---

## 三、风险识别（现状 / 问题 / 建议）

1) 风险：前端仅隐藏按钮但后端未校验或校验不一致 → 越权风险
- 现状：大量权限判断在 UI 层（role === 'admin'）进行；API 请求仅依赖 JWT token（Authorization header），但没有细粒度权限码传递。
  - 证据：Layout.tsx lines ~23 (isAdmin = user?.role === 'admin'), TemplateLibrary.tsx lines ~48-56, ProjectTemplates.tsx lines ~41-43，且 client.ts 仅设置 Authorization header（/rdpms-system/frontend/src/api/client.ts lines ~30-36）。
- 建议：后端必须在受保护接口（projects.update / batch-update-status / project-templates.create / users.*）进行权限校验并返回明确错误码（如 403 + { code: 'FORBIDDEN_NO_PERMISSION' }）；前端不应仅依赖 UI 隐藏来保护。

2) 风险：权限判断逻辑分散且基于 role 字符串，导致扩展/审计困难
- 现状：role 比较散落在多个页面（Users.tsx, TemplateLibrary.tsx, ProjectTemplates.tsx, Layout.tsx）。
  - 证据：/rdpms-system/frontend/src/pages/Users.tsx lines ~69-75; /rdpms-system/frontend/src/pages/TemplateLibrary.tsx lines ~48-56; /rdpms-system/frontend/src/pages/ProjectTemplates.tsx lines ~41-43; /rdpms-system/frontend/src/components/Layout.tsx lines ~23, ~30
- 建议：统一实现 permissions 字段并使用中心化 helper（hasPerm），替换 role === 'admin' 散落实现。

3) 风险：状态迁移缺少并发保护（乐观锁/悲观锁缺失）
- 现状：projectAPI.update / batchUpdateStatus 与 taskAPI.updateStatus 在发送更新请求时没有携带版本信息或 If-Match 等机制；KanbanBoard 的拖拽更新是先 saveTaskLocal 然后调用 taskAPI.updateStatus（可能覆盖并发更新）。
  - 证据：projectAPI.update 调用在 /rdpms-system/frontend/src/api/client.ts lines ~80-82；KanbanBoard 本地更新与后端同步在 /rdpms-system/frontend/src/components/KanbanBoard.tsx lines ~496-504（saveTaskLocal then API call）。
- 问题：可能出现并发覆盖或丢失更新（尤其多用户同时拖拽/批量更新时）。
- 建议：引入乐观并发控制：在 Project / Task DTO 中加入 version:number 或 updatedAt timestamp；在 PUT/PATCH 请求中带上 If-Match 或 version 字段，后端对比失败返回 409 并携带最新资源快照；前端遇到 409 时提示并提供“刷新/合并”选项。

4) 风险：状态流转规则没有集中定义，前端与后端可能口径不一致
- 现状：前端直接发送任意 status 字段，后端若未统一校验可能接受非法流转。
  - 证据：EditProjectModal 允许任意 STATUS_OPTIONS 作为选择并提交（/rdpms-system/frontend/src/components/EditProjectModal.tsx lines ~198-208），Projects 页面有 batchUpdateStatus（/rdpms-system/frontend/src/pages/Projects.tsx lines ~190-196）。
- 建议：在后端建立状态机并在 projectGET 中返回 allowedNext（allowed transitions）以及是否需要审批/校验的 meta；前端据此限制 UI 并在尝试更改时得到明确失败信息。

5) 风险：缺少细粒度接口级权限码（审计与追责困难）
- 现状：API 不携带或校验权限码，只有 token；后端日志/审计可能难以映射到具体权限点。
  - 证据：api/client.ts 中 projectAPI 等未传递任何 action/perm 参数（/rdpms-system/frontend/src/api/client.ts lines ~76-91）。
- 建议：后端在审计日志中记录 userId、action（如 projects.update_status）、resourceId；前端在敏感操作成功后也可记录 client-side audit event（选做）。

---

## 四、最小可行 RBAC + 状态机落地建议（现状 / 问题 / 建议）

目标：在最小改动范围内，达到“前端友好展示 + 后端强制校验”的安全与可维护状态。

1) 最小可行 RBAC（建议实现步骤）
- 现状问题：当前只有 role 字符串且前端直接散落逻辑。
- 建议实现：
  - 后端：在登录/verify 返回用户 profile 时，包含 permissions: string[]（如 projects.create, projects.edit, projects.update_status, templates.create）。（修改点：后端 auth/login, auth/verify）
    - 前端证据/接入点：/rdpms-system/frontend/src/store/appStore.ts login flow lines ~172-181（useAppStore.login），/rdpms-system/frontend/src/api/client.ts authAPI.verify lines ~55-63
  - 前端：将 user.role 保留用于 display，但新增 user.permissions，并实现 helpers：hasPerm(code: string): boolean 放在 /rdpms-system/frontend/src/utils/permissions.ts；替换所有 role === 'admin' 判断（Layout、TemplateLibrary、ProjectTemplates、Users）。
  - API 层：所有受控端点在服务器端验证 permissions（基于 API token -> user -> permissions），返回 403 + error.code when missing.

2) 最小可行状态机（建议实现步骤）
- 现状问题：无集中状态机与 allowed transitions。
- 建议实现：
  - 后端：在 Project 模型/服务中实现状态机（可以用状态表或 code map），并在 GET /projects/:id 返回 allowedTransitions (例如 [{to:'进行中', requiresApproval:false}])。
  - 前端：EditProjectModal 与 Projects.batch 操作在渲染状态选择时使用 allowedTransitions；若 allowedTransitions absent，退回到全量 STATUS_OPTIONS（兼容旧后端）。
  - 变更接口：PUT /projects/:id 接受 { status, version? } 并在后端校验 allowedTransitions，若不允许返回 400/403。
  - 并发：后端对比 version 或 updatedAt；失败返回 409 + latest resource snapshot。

3) 前后端协同校验（防越权）
- 现状问题：前端可绕开 UI 校验直接调用 API（例如使用 curl），若后端未检查则会越权。
- 建议：
  - 后端：所有写操作必须校验权限（user.permissions 包含相应 action），并对状态迁移做状态机校验。
  - 前端：在调用前尽量使用 allowedTransitions 与 hasPerm 做预校验以提供更好 UX；但绝不依赖其作为唯一安全措施。
  - 接口返回错误约定：统一返回 { code: 'FORBIDDEN' | 'INVALID_TRANSITION' | 'CONFLICT', message, data? }，方便前端自动处理。

---

## 五、实施路线（优先级与小步快跑）

1) 高优先级（必须）
- 后端：对 projects.update、projects.batch-update-status、tasks.updateStatus 等写接口实现权限校验 + 状态机校验 + 并发检测（version/ETag）。
  - 前端需按错误码做 UX（403 显示无权限，409 显示数据已过期并建议刷新）。
  - 证据/修改点：/rdpms-system/frontend/src/api/client.ts 与后端对应路由

2) 中优先级（推荐）
- 后端：在 GET /projects/:id 返回 allowedTransitions
- 前端：实现 hasPerm helper 和 PermissionGuard，替换散落的 role === 'admin' 判断；EditProjectModal 使用 allowedTransitions 代替 STATUS_OPTIONS（若 available）。
  - 证据/修改点：/rdpms-system/frontend/src/components/EditProjectModal.tsx (lines ~198-208)、/rdpms-system/frontend/src/pages/Projects.tsx (batchUpdateStatus lines ~190-196)

3) 低优先级（可选）
- 前端：在 project 列表等处展示 allowed transitions 快捷操作（如“进入归档”仅当 allowed 返回 true）
- 审计：在后端记录权限相关 audit log

---

## 六、参考证据列表（文件与关键行）
- 状态集合与统计: /rdpms-system/frontend/src/pages/Projects.tsx lines ~8-19, ~155-162
- 可通过 Edit 修改状态: /rdpms-system/frontend/src/components/EditProjectModal.tsx lines ~30-31 (STATUS_OPTIONS), ~86-96 (payload), ~198-208 (select options)
- 批量改状态: /rdpms-system/frontend/src/pages/Projects.tsx lines ~190-196 (handleBatchStatus -> projectAPI.batchUpdateStatus)
- ProjectCard 渲染状态: /rdpms-system/frontend/src/components/ProjectCard.tsx lines ~32-40 (STATUS_COLORS), ~170-184 (状态标签渲染)
- 详情页仍显示编辑/添加按钮: /rdpms-system/frontend/src/pages/ProjectDetail.tsx lines ~89-92
- Kanban 任务拖拽更新状态（任务级）: /rdpms-system/frontend/src/components/KanbanBoard.tsx lines ~488-506 (saveTaskLocal -> taskAPI.updateStatus)
- Role / simple permission checks（散落）:
  - Layout.tsx: /rdpms-system/frontend/src/components/Layout.tsx lines ~14, ~23, ~30
  - TemplateLibrary.tsx: /rdpms-system/frontend/src/pages/TemplateLibrary.tsx lines ~48-56
  - Users.tsx: /rdpms-system/frontend/src/pages/Users.tsx lines ~69-75
  - ProjectTemplates.tsx: /rdpms-system/frontend/src/pages/ProjectTemplates.tsx lines ~41-43
- API Authorization header: /rdpms-system/frontend/src/api/client.ts lines ~30-36; response 401 handling lines ~41-52

---

如需，我可以：
- (A) 在前端实现 hasPerm 工具与 PermissionGuard，并替换部分页面中的 role === 'admin' 检查（小改动）
- (B) 在 EditProjectModal 中优先读取 project.allowedTransitions（若不存在则回退），并实现 UI 限制（中改动）
- (C) 在 Projects 页面批量更新时先调用后端检查允许的目标状态并在前端过滤选择（中改动）

请选择下一步（A / B / C / 我需要先让后端支持 allowedTransitions / 其它）。
