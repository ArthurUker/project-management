# R04 · 注册项目对项目授权的复用

状态：COMPLETE_WITH_PENDING。日期：2026-09-30。基线/当前 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本包按任务卡读取当前源码和历史 B21 证据；未运行动态验证，未修改业务代码或测试。源码摘要见 `source-digests.json`。

## 范围和入口矩阵

`registrations.use('*', authMiddleware)` 对路由统一认证。所有下列入口再检查系统权限，但目标项目范围过滤只含 `subtype='registration'` 和 `deletedAt=null`，没有项目成员或 capability 条件（`registrations.js:38,49-52`）。

| 入口 | 系统权限 | 项目范围/能力 | 软删与数据范围 | 审阅结论 |
|---|---|---|---|---|
| `GET /` 列表 | `registrations.view` | `registrationProjectWhere()`；`managerId` 只是调用者可选过滤 | 排除 deletedAt；返回项目、负责人、档案、成员/任务计数 | 非成员可枚举符合条件的注册项目与档案字段（B21） |
| `GET /stats` | `registrations.view` | 全量注册子类型过滤 | 排除 deletedAt；聚合阶段、风险与到期统计 | 非成员可得全局项目统计（B21 同一根因） |
| `GET /templates` | `registrations.view` | 无项目对象 | 仅活动注册模板目录 | 作为模板目录不计项目越权；未作产品语义裁定 |
| `GET /:id` 详情 | `registrations.view` | 子类型和ID，无成员/capability检查 | 排除 deletedAt；包含成员、任务/指派、法规文档、里程碑、阶段、档案 | 历史实证非成员读取详情和私有任务（B21） |
| `POST /` 创建 | `registrations.create` | 无项目级访问决策；创建者可传 managerId，所建成员为该 manager | 创建项目与档案；模板脚手架在后续独立调用 | 本包未证明创建者借此访问既有项目，不扩张 B21；创建原子性不属本包结论 |
| `PUT /:id` 更新 | `registrations.update` | 存在性查询仅用上述子类型过滤；无成员/capability | 排除 deletedAt；事务内更新项目/档案；可写 managerId；拒绝直接改 currentStage | 历史实证有权限的非成员成功改名；manager 替换是否影响成员关系未作实证 |
| `PATCH /:id/stage` | `registrations.change_stage` | 存在性查询仅用子类型过滤；无成员/capability | 排除 deletedAt；校验 stage 值与允许转移；更新档案，之后非严格审计 | 具体越权路径由共同缺失支持；本轮没有单独运行 stage 越权探针 |
| `PATCH /:id/profile` | `registrations.update` | 存在性查询仅用子类型过滤；无成员/capability | 排除 deletedAt；拒绝通过此入口直接改阶段；upsert 档案 | 具体越权路径由共同缺失支持；本轮没有单独运行 profile 越权探针 |

前端 `registrations.ts` 的 list/stats/templates/detail/create/update/profile/stage 路径与后端路由一致。它还声明 `remove()` 调用 `DELETE /registrations/:id`，本路由文件没有对应 DELETE handler；未检查全应用 mount/调用方，登记为未覆盖项，不据此新增发现。

## B21 · P1 · SUPPORTED

**实际路径与触发前提：** 已认证主体持有 `registrations.view` 可经列表/统计/详情读取注册项目；另需 `registrations.update` 才能更新。默认 MEMBER 与 VIEWER 含 view（`seed.js:360-413`），默认 MANAGER 含 view/update/change_stage（`seed.js:314-323`）。在非成员身份下，路由没有调用 `resolveProjectAccess()`，故系统权限检查后即可进入 registration 子类型查询。

**当前源码证据（S）：** `registrationProjectWhere()` 仅返回 `{subtype, deletedAt:null, ...extra}`（`registrations.js:49-52`）。详情以该 helper 查找后直接序列化成员、任务、档案等关联（`222-260`）。更新入口同样仅以该 helper 查询项目（`325-334`），并接受 managerId、项目字段及档案字段（`336-382`）。阶段和档案入口也只使用同一 helper（`397-458`）。

**比较与项目访问不变量：** `projectAccess.js` 明确最终权限为系统权限与项目成员能力交集，非成员为 404，SUPER_ADMIN 是例外（`1-9,21-55`）。普通项目列表通过 `projectVisibilityFilter()` 限制为负责人或有效成员（`projects.js:107-125`）；普通详情与更新调用 `resolveProjectAccess()`，详情/更新还处理非成员 SUPER_ADMIN 的 elevated 审计（`projects.js:164-170,306-314`）。注册路由没有复用这些决策。

**历史动态证据（H，仅继承）：** `docs/audits/2026-09-29-rdpms/additional-results.json#B21_REGISTRATION_BYPASSES_PROJECT_SCOPE` 记录隔离 PostgreSQL 探针：普通项目详情 404；注册项目详情 200 且读取到私有任务；拥有注册更新系统权限的非成员 PUT 200，DB 中名称变为 `modified-by-nonmember`。这是 actorResolver 注入身份的路由/数据库探针，不是本轮运行，也不是完整真实 JWT 登录证明。旧 findings 记载 MEMBER/VIEWER 默认 view、MANAGER update；当前 seed 源码与之吻合。

**已有保护与反证检查：** 全路由要求认证和系统权限；对象过滤限制注册子类型并排除软删项目；阶段入口验证阶段值和转移白名单；PUT/profile 阻止通过通用档案入口直接改阶段。以上限制了可访问对象类型或字段，但未增加成员/项目能力判断。注册模板目录本身不是项目私有对象。未发现本包内对非成员的另一层保护。

**已证明影响：** 历史隔离探针证明非成员可读取注册项目关联的私有任务，并在有 `registrations.update` 权限时修改其项目名称。列表/统计及 stage/profile 也走相同缺少成员约束的过滤模式；其具体响应字段或独立副作用未在历史探针逐项观察，属于源码路径支持，不声称逐入口已动态复现。保留旧 ID B21，严重度 P1，无新增发现。

**策略待决：** 是否存在经批准的“所有具 registrations.view 的用户全局查看注册项目”例外，计划要求不能从系统级 view 权限推定这种例外。当前 `projectAccess.js` 的通用规则与普通项目路由支持成员范围裁定。若产品确认注册项目故意全局可见，需明确该例外的字段、列表、统计、写权限与审计范围；在裁定前 B21 维持 SUPPORTED。此问题不阻止本包完成。

## 管理员、阶段与修复建议

PUT 可直接更新 `managerId`（`342`）；创建时 manager 被加入为 MANAGER 成员（`268-285`），但更新 manager 并未同步成员关系。当前证据只能确认这两个不同代码行为，未证明 manager 替换可造成哪种具体身份越权，因此不另编号。阶段入口确有转移白名单；本轮只确认其缺少项目成员/capability边界，不判断并发阶段竞争。

建议将注册档案视为 Project 聚合扩展：所有按项目ID操作先走统一存活项目/成员 capability resolver；列表、统计基于同一可见性 scope；SUPER_ADMIN 的非成员访问遵循统一 elevated 审计策略。明确 managerId 更新时是否同步 ProjectMember、是否允许跨主体转交。模板目录单独定义全局可见规则。验收应覆盖系统权限缺失、有效成员及 capability、非成员、已退出成员、软删项目、SUPER_ADMIN 非成员例外，并逐项检查 list/stats/detail/update/stage/profile；拒绝访问不改变数据，SUPER_ADMIN 特权访问按策略审计。

## 覆盖缺口与验证边界

- 未重跑历史 B21 动态探针；相同基线且当前相关源码摘要与计划执行前检查记录一致，沿用 H 证据并独立核对 S 调用链。
- 未分别动态验证 list、stats、stage、profile；不从 detail/update 探针推称这些入口已逐一复现。
- 未审阅所有 registration UI 调用者、全应用 DELETE 路由挂载、导出入口、并发阶段更新、模板脚手架原子性；它们不在此包必查范围，后续如有关联证据再按边界扩展。
- 当前 HEAD 与审计基线相同；仓库仅审计文档未跟踪，`rdpms-system/` 工作树干净。旧审计目录/manifest 未改。
