# RDPMS 修复工作包任务卡

2026-10-01。本文是待执行计划。所有包实施 NOT_STARTED、验收 NOT_RUN。C01–C08为原设计来源，RP00–RP19为本轮可独立管理的实施拆分。

每个包允许的现有文件与拟新增路径如下。新增路径是候选设计，启动包前核对JS/TS构建与import契约；不得据此现在创建业务文件。共享schema、sync.js、engine.ts的修改必须由一个集成owner协调。

## RP00 · 实施准备、规则登记与两项定向审阅门禁

阶段 0；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：技术负责人、产品/安全负责人。

关联发现/候选：准备工作，不计新finding；原卡：统一准备门禁；先决包：无。

### 文件和输入范围

- 仅读取计划/证据和登记准备材料；本包不修改业务实现。

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 启动实施时重新核对 HEAD、工作区及本计划输入摘要；若发生源码增量，只评估受影响包，记录新基线。保护所有未提交审计文档。
2. 为每个拟启动包登记 owner、批准规则、允许文件、兼容范围、隔离资源和验收失败停止条件；没有依赖的包可独立就绪。
3. 定向完成 S03-OI-03：沿 push 写入/receipt/响应到客户端 outbox，列出各故障点的重试、状态查询与最终持久副本合同；交付故障点矩阵，作为 RP09/RP12 开工条件。
4. 定向完成 S03-OI-09：枚举 Tasks/Task 编辑组件/Kanban、API DTO、HTTP route、command 及受支持旧客户端的 revision 传递；逐字段/状态/指派列 matrix，作为 RP10 启用严格基线条件。
5. 取得 S01 八项裁定；另登记离线无 owner、receipt 保留、旧客户端、pull 水位、文件扫描与 restore 冲突等技术设计决定。每项保持 PROPOSED，未经裁定不当成要求。
6. 隔离验证统一使用自有临时 PostgreSQL、合成账号、临时浏览器配置和临时文件系统；启动前核对自动 dotenv、子进程/脚本连接目标，禁止复用旧固定审计库。

### 验收与证据

- 所有33条发现/候选都有唯一主修复包；31个开放项有对应门禁和解除条件。
- 两项静态问题有明确调用链/客户端版本矩阵；其余包不因无关门禁被整体阻塞。
- 实施状态保持 NOT_STARTED，只有用户启动实施后才转 IN_PROGRESS。

### 依赖门禁

- 两项静态补审只阻塞对应包
- 各业务决定仅阻塞依赖它的子任务

### 兼容、回滚和停止

- 本包仅准备文档和隔离环境；未执行任何生产动作。发现基线漂移先更新影响登记。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP01 · 账号目标保护、强制改密与角色创建 DTO

阶段 1；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：后端认证负责人、安全/产品负责人。

关联发现/候选：B01、B17；原卡：C01；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/users.js`
- `rdpms-system/backend/src/routes/roles.js`
- `rdpms-system/backend/src/kernel/rbac.js`
- `rdpms-system/backend/src/kernel/massAssign.js`
- `rdpms-system/backend/src/kernel/constants.js`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/auth/accountPolicy.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 把账号 reset/enable/disable/delete 的 actor-target 规则收敛为共享后端策略；按 D-S01-01 裁定处理同级/更高等级和受保护账号，紧急恢复另有显式流程。
2. 在服务端认证/命令边界按 D-S01-02 落实 mustChangePassword 可调用端点；前端跳转仅用于提示，不能承担授权。
3. 密码写入、refresh 撤销和必需审计采用明确事务/失败恢复合同；与 RP02/RP03 的会话机制共享，避免各路由分别修改。
4. B17 用命令专属 DTO 允许 roles.create 的 code，禁止放宽全局字段黑名单；分别验证 duplicate/invalid/system/id/permission links。
5. 角色创建可作为独立子提交；自定义角色绑定和权限管理仅在 D-S01-03 批准后实现，不能顺手更改已签署 M-1 权限/seed。

### 验收与证据

- ADMIN→SUPER_ADMIN reset 按批准规则拒绝，密码、refresh、状态和审计无不符合合同的副作用。
- 强制改密会话普通业务请求被后端阻断，允许端点可用。
- 合法角色 code/name 创建成功；system/id/权限关系注入拒绝，重复 code 显式失败。
- 对每条账号操作运行 actor×target 矩阵和故障注入，结果按真实 DB 状态核对。

### 依赖门禁

- D-S01-01
- D-S01-02
- D-S01-03仅限绑定子任务

### 兼容、回滚和停止

- 回退到已包含账号保护的兼容版本；不得退回可越权重置版本。无法证明旧会话不会恢复高权限时停发。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP02 · 临时锁定与 refresh 单次消费和真实 TTL

阶段 1；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：认证后端负责人。

关联发现/候选：B14、B15；原卡：C01；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/auth.js`
- `rdpms-system/backend/src/kernel/rbac.js`
- `rdpms-system/backend/prisma/schema.prisma`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

条件schema修改另允许新增 `prisma/migrations/<approved-new-migration>/migration.sql`；不改写历史migration。具体命名和SQL在实施包设计裁定后登记。

### 实施步骤（本次未执行）

1. 将管理员停用与限时登录锁区分；检查 lockUntil 后再决定可否认证，按已有锁定合同在到期恢复，成功登录清计数，DISABLED 不自动启用。
2. 失败计数/进入锁定采用条件更新，避免并发丢计数；若需持久字段变更按 expand/contract 独立迁移。
3. refresh 在同一事务中按 revokedAt=null 条件消费旧令牌并检查 affected count，只有胜者创建 successor；稳定继承 familyId，定义可恢复失败/replay响应。
4. 统一 JWT TTL 解析和响应 expiresIn；依据真实签发过期时点，不写固定常数。
5. 与 RP03 的双 tab 方案一起明确并发败者响应；不能因修服务端单次消费反而让旧失败清掉新 token。

### 验收与证据

- 控制时间推进：锁到期正确密码恢复，DISABLED 仍拒绝；并发失败计数符合规则。
- 屏障并发消费同一 refresh 至多一条有效 successor，家庭关系正确。
- 消费后插入故障整体回滚或执行已批准可观察恢复合同。
- 登录/refresh expiresIn 与实际 JWT exp 对应；双 tab 集成无新 token 被清除。

### 依赖门禁

- refresh replay/family处理设计需和 RP03 定稿

### 兼容、回滚和停止

- 保留兼容 token-family/schema 读取窗口；回滚不能重新启用双重消费实现。旧失效令牌不被复活。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP03 · 会话失效合同与跨标签 token 协调

阶段 2；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：认证后端负责人、前端负责人、安全负责人。

关联发现/候选：N-R02-01、N-R02-02；原卡：C01；先决包：RP00、RP02。

### 文件和输入范围

- `rdpms-system/backend/src/kernel/rbac.js`
- `rdpms-system/backend/src/routes/auth.js`
- `rdpms-system/backend/src/routes/users.js`
- `rdpms-system/backend/prisma/schema.prisma`
- `rdpms-system/frontend/src/api/http.ts`
- `rdpms-system/frontend/src/auth/tokenStore.ts`
- `rdpms-system/frontend/src/auth/AuthProvider.tsx`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

条件schema修改另允许新增 `prisma/migrations/<approved-new-migration>/migration.sql`；不改写历史migration。具体命名和SQL在实施包设计裁定后登记。

### 实施步骤（本次未执行）

1. 按 D-S01-04 决定改密/reset/停用/降权的失效时限；若允许直到 TTL 到期，记录目标行为和剩余暴露窗口，不把保留现状宣称即时撤销修复。
2. 若选择即时/有界撤销，设计 session/security version 或 server-side session 验证，并证明所有认证入口消费该版本；密码更新、refresh 撤销、版本递增及审计一致提交。
3. 前端为 refresh 建跨 tab 协调和 token generation；失败清理必须比较本次失败所用 token/generation 与当前 token。不能清除较新 successor。
4. 同步真正 logout/revoke 通知；旧响应只取消旧会话，不影响新身份。协调采用浏览器能力须明确不支持浏览器的后备方案。
5. 准备 legacy JWT/version 缺失窗口；任何允许旧 token 的兼容方案须受时限/策略批准。

### 验收与证据

- 共享同一 origin/storage 的两个 tab：旧 refresh 失败晚于新 token 入库时，successor 仍可用。
- 当前真正失效 refresh 能清理当前会话并引导登录。
- 改密/reset 后旧 access/refresh 在批准时限内被拒绝，新登录和强制改密行为正确。
- 旧/新 schema 与 app rollback 矩阵不复活已撤销会话。

### 依赖门禁

- D-S01-04
- S02-OPEN-05验收

### 兼容、回滚和停止

- 只回退到理解已签发版本和撤销记录的版本；不得通过删除 version 检查回滚。协调不可用时保留新会话并要求显式重新登录。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP04 · 项目业务快照、创建聚合事务与活跃查询

阶段 1；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：项目后端负责人。

关联发现/候选：B03、B18、B20；原卡：C02、C03、C07；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/projects.js`
- `rdpms-system/backend/src/kernel/projectAccess.js`
- `rdpms-system/backend/src/modules/access/writeGuards.ts`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/projects/projectCommands.ts`
- `rdpms-system/backend/src/modules/projects/projectQueries.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 授权上下文与业务 snapshot 分型；status/startDate 从明确的业务查询取得，修正普通/batch 状态和模板默认日期调用。
2. 对创建项目的 phase/task/milestone/member 输入先校验，再用一个事务创建聚合；事务中的 sequence/审计/幂等必须明确失败行为，不保留半项目。
3. 将 alive-project 条件与可见性组合成共享 query scope，用于 list/count/search/stats；回收站单独入口。
4. 业务字段读取所需投影明确列举，防止以后复用授权 select 当完整 Project。

### 验收与证据

- 合法状态转换和默认 startDate 模板日期正确；非法状态仍拒绝。
- 在各子表写入故障点验证无半项目；相同幂等键重试不重复。
- 软删项目在普通 list/count/search/stats 均不出现，详情与专用回收策略一致。

### 依赖门禁

- 状态沿用已有批准转换表；不追加未经裁定状态边

### 兼容、回滚和停止

- 保留 API响应字段与资源ID；安全版本回滚不拆开聚合提交。事务扩大出现无法控制的锁/超时时停包重新评估。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP05 · 嵌套差量命令、删除授权与同项目父关系防护

阶段 1；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：项目/任务后端负责人。

关联发现/候选：B02、B19；原卡：C02、C07；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/projects.js`
- `rdpms-system/backend/src/routes/tasks.js`
- `rdpms-system/backend/src/routes/sync.js`
- `rdpms-system/backend/src/modules/tasks/taskCommands.ts`
- `rdpms-system/frontend/src/api/endpoints/projects.ts`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/projects/projectCommands.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 先阻断项目 PUT 的无授权硬 delete/recreate：对每个 create/update/delete独立授权；不允许仅凭数组遗漏推断用户授权删除。
2. 将 child 修改分成保留ID的增量命令，兼容旧数组时显式计算 delta并核对权限/基线，未知ID或跨项目ID拒绝。
3. 在所有 parentId 写入口校验父项同项目；递归操作每层带 projectId。已软删父/phase、一般 DAG、restore 和 stale delete 按 D-S01-08/相关决定实现。
4. 删除采用授权 tombstone 命令；避免对异常跨项目边触发物理级联。应用防护可以先上线，历史数据整理与 DB约束留 RP15。
5. 以两项目合成父子边验证 S04 的组合影响边界，修复后 Project A 编辑不得物理移除 B 子项；保留原ID、引用和离线变更。

### 验收与证据

- 无 tasks.delete 主体 tasks:[] 不删除任务；原ID/附件/关联保留。
- sync/HTTP及嵌套入口跨项目 parent 均拒绝且无副作用。
- 异常跨项目边存在时，A项目编辑不级联删除 B任务。
- 获准删除产生正确 tombstone，下行与恢复满足批准规则。

### 依赖门禁

- 完整删除/restore合同：D-S01-08
- 旧数组客户端兼容范围
- S04-OI-01仅阻塞数据迁移，不阻塞应用防护

### 兼容、回滚和停止

- 保留旧客户端适配层；回滚只能到禁止硬删除和跨项目parent的版本。遇到需清理历史数据先停，不能自动重挂/删除。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP06 · 注册项目全入口访问范围

阶段 1；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：注册模块负责人、产品/数据负责人。

关联发现/候选：B21；原卡：C02；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/registrations.js`
- `rdpms-system/backend/src/kernel/projectAccess.js`
- `rdpms-system/frontend/src/api/endpoints/registrations.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 按 D-S01-05 定义 registration 的全局可见字段例外（若批准）与成员/capability写入边界。
2. list/stats/detail/update/stage/profile及存在的export入口复用同一 alive project scope；全球统计只允许明确批准字段，不能通过聚合反查敏感任务。
3. 后端过滤关联 tasks/members/profile/regulatory 字段；SUPER_ADMIN elevated 上下文和敏感访问审计不丢失。
4. manager转移与 RP07 共享命令；所有拒绝路径验证项目/profile无副作用。

### 验收与证据

- 缺系统权限、成员、非成员、已退出成员、软删项目、超管矩阵覆盖各入口。
- 非成员不能经detail/profile读取或PUT写入未批准字段。
- 列表/统计/详情一致；获准例外只返回明确字段。

### 依赖门禁

- D-S01-05
- D-S01-06仅负责人子任务

### 兼容、回滚和停止

- 回滚只允许保留成员范围或批准的受控例外，不能恢复旧无scope路由。页面依赖全局字段时改提示/投影合同。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP07 · 项目状态与负责人跨入口共享命令

阶段 1；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：项目后端负责人。

关联发现/候选：B09、R06-N01；原卡：C02、C03；先决包：RP00、RP04。

### 文件和输入范围

- `rdpms-system/backend/src/routes/projects.js`
- `rdpms-system/backend/src/routes/registrations.js`
- `rdpms-system/backend/src/routes/sync.js`
- `rdpms-system/backend/src/kernel/projectAccess.js`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/projects/projectCommands.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 把 status/managerId 从generic sync fields中移出，HTTP/sync/registration适配显式transition/transfer命令。
2. 状态转换使用相同系统/项目权限和现有允许边；archive单独权限不能被projects.update代替。
3. 按 D-S01-06 定义 managerId/有效MANAGER成员一致性，在同一事务处理新旧成员与project字段；不从当前差异推导业务要求。
4. 命令暴露 actor、expectedRevision、transaction client、必需审计，集成 RP09 回执。

### 验收与证据

- 只有projects.update主体通过sync不能归档；有archive权限仍不能走非法边。
- HTTP/sync/registration同初始状态同命令结果一致。
- 成员维护故障回滚manager字段，resolver可见性符合批准合同。

### 依赖门禁

- D-S01-06只阻塞manager子任务

### 兼容、回滚和停止

- 保留显式命令适配；禁用generic敏感字段回写。rollback不允许只回退成员一半状态。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP08 · 同步实体读权限与授权增量回填

阶段 1；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：同步后端负责人、离线前端负责人。

关联发现/候选：B04、B08；原卡：C04；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/sync.js`
- `rdpms-system/backend/src/kernel/projectAccess.js`
- `rdpms-system/frontend/src/offline/engine.ts`
- `rdpms-system/backend/prisma/schema.prisma`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/sync/syncReadPolicy.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

条件schema修改另允许新增 `prisma/migrations/<approved-new-migration>/migration.sql`；不改写历史migration。具体命名和SQL在实施包设计裁定后登记。

### 实施步骤（本次未执行）

1. 为每类实体声明与在线读取相同的有效系统/项目权限及own-only字段投影；在分页查询前后遵守相同策略。
2. ACL版本涵盖加入、退出、改角色与实体权限改变；不以projectIds集合不变认定权限不变。
3. 新授权项目在确认其scoped snapshot/backfill完成前不进入既有incremental cursor；离开/撤权先清当前主体镜像再提交ACL版本。
4. 与 RP11 owner partition及RP13 cursor版本配合，cache清理不误删待同步用户payload。

### 验收与证据

- 在线拒绝的task/report实体或字段不会从sync返回；own-only report仅作者可得。
- 用户带旧cursor加入老项目，可获取历史项目/任务。
- 同项目角色变更、撤权、退出/再加入缓存与版本一致；outbox保全。

### 依赖门禁

- ACL缓存/outbox保留设计
- D-S01-05若registration实体例外涉及sync

### 兼容、回滚和停止

- ACL/cursor按协议版本适配；不能回退到只按project范围拉取版本。新旧缓存切换出现不明owner时隔离。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP09 · 单 mutation 事务、作用域回执与失败恢复

阶段 2；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：同步/事务后端负责人。

关联发现/候选：B05、B06；原卡：C03；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/sync.js`
- `rdpms-system/backend/src/platform/idempotency/receipts.js`
- `rdpms-system/backend/src/platform/idempotency/payloadHash.js`
- `rdpms-system/backend/src/platform/audit/strictAudit.js`
- `rdpms-system/backend/prisma/schema.prisma`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/sync/syncMutationCommands.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

条件schema修改另允许新增 `prisma/migrations/<approved-new-migration>/migration.sql`；不改写历史migration。具体命名和SQL在实施包设计裁定后登记。

### 实施步骤（本次未执行）

1. 完成S03-OI-03后定义单项成功/冲突/拒绝/未知结果及重试合同；连接断开保留原key，不能猜测成功。
2. 授权当前资源先于读取replay；receipt绑定actor、resource/project、command/op、key与canonical payload hash；同scope/key不同payload冲突。
3. 单条mutation内业务CAS、写入、必需strict audit、receipt同一事务；保留批次逐条部分成功，不强制batch整体事务。
4. 同key竞争使用唯一约束+事务处理winner/replay；失败者不能覆盖胜者成功回执。为resource tombstone后的replay明确授权与not-found行为。
5. 回执过期、清理、最大离线重试窗、旧SyncMutation兼容/退役及按key查询或可证明等价的安全重试合同写入协议；不信任无scope旧回执跨主体重放。
6. 共享事务command集成 RP05/RP07/RP10；新通用helper不算行为一致验收。

### 验收与证据

- 已知key被另一主体重放拒绝，同key改payload冲突，同payload安全重放。
- receipt/audit故障不留下业务已写但无成功回执状态。
- 屏障并发同key同/不同payload最终row/receipt/两个响应一致。
- 首项成功第二项故障、receipt提交后响应丢失，各项可恢复且不重复执行业务。

### 依赖门禁

- S03-OI-03前置静态合同
- S03-OI-02隔离并发验收
- S03-OI-04运维保留窗
- receipt设计决定

### 兼容、回滚和停止

- 新旧receipt dual-read必须仍授权且绑定足够scope；旧无hash记录不能伪造hash。rollback版本理解新receipt并不能重复写。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP10 · 任务全入口 revision 与汇报同修订提交

阶段 2；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：任务/汇报后端负责人、前端负责人。

关联发现/候选：B10、B16；原卡：C03；先决包：RP00、RP09。

### 文件和输入范围

- `rdpms-system/backend/src/routes/tasks.js`
- `rdpms-system/backend/src/routes/reports.js`
- `rdpms-system/backend/src/modules/tasks/taskCommands.ts`
- `rdpms-system/backend/src/modules/reports/reportCommands.ts`
- `rdpms-system/frontend/src/api/endpoints/tasks.ts`
- `rdpms-system/frontend/src/api/endpoints/reports.ts`
- `rdpms-system/frontend/src/pages/Tasks.tsx`
- `rdpms-system/frontend/src/components/KanbanBoard.tsx`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 依据S03-OI-09枚举的受支持客户端，为普通字段/status PATCH/指派/混合PUT明确必需基线和旧版兼容截止；缺失modern基线不能静默last-write-wins。
2. DTO→route→command→条件DB写完整携带expectedRevision；409返回当前revision及允许的最新投影。
3. 汇报submit在同事务重读/锁定来源state+revision并成功CAS后从同一修订生成version snapshot，不使用事务外捕获正文。
4. 按D-S01-07区分同key replay与新key resubmit；version分配以约束/锁和重试保证无重复或半状态。
5. 与RP09统一receipt/strict audit；全入口使用同一个CAS命令，包括线上和offline支持的草稿操作。

### 验收与证据

- 两个客户端同基线首写成功，第二普通字段/status/指派写409且不覆盖。
- 保存与提交屏障交错snapshot等于成功提交正文revision，失败无version/receipt。
- 并发version分配符合唯一约束；SUBMITTED新key按裁定拒绝或明确复提行为。
- 明确受支持旧客户端matrix；不支持版本有可理解升级结果。

### 依赖门禁

- S03-OI-09静态全调用端链
- D-S01-07
- 客户端兼容设计
- S03-OI-08数据库验收

### 兼容、回滚和停止

- revision协议版本化，回滚版本必须消费已要求的基线。保留旧数据，不删版本历史；禁止回退到忽略客户端基线。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP11 · 离线身份生命周期、持久副本与旧库隔离

阶段 1；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：离线前端负责人。

关联发现/候选：F01、F02、F03、N-S02-01；原卡：C05；先决包：RP00。

### 文件和输入范围

- `rdpms-system/frontend/src/auth/AuthProvider.tsx`
- `rdpms-system/frontend/src/offline/SyncProvider.tsx`
- `rdpms-system/frontend/src/offline/engine.ts`
- `rdpms-system/frontend/src/offline/idb.ts`
- `rdpms-system/frontend/src/offline/deadLetter.ts`
- `rdpms-system/frontend/src/pages/Tasks.tsx`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 身份状态明确为BOOTSTRAPPING/AUTHENTICATED/ANONYMOUS；身份恢复null不触发logout清理。切号时旧session generation不能改新账号stores。
2. records/outbox/cursor/ACL/conflict/deadLetters与缓存消费者都显式owner分区；API要求owner，不能依靠UI当前账号约定。
3. 冲突/拒绝转移和原outbox删除放同一IndexedDB事务，完整payload在确认提交前保留；重复/异常回包不丢最后副本。
4. 旧有明确owner的记录迁移到其分区；无owner记录保全在隔离区，不自动归anonymous或首个登录账号，不从本地数据猜测可靠身份。按批准认领/导出口径处理。
5. 升级复制→校验→切换→清理分阶段；迁移中止可重入，页面关闭/QuotaExceeded/abort只影响当前事务，保留可恢复原数据。
6. 缓存回退按当前owner和当前ACL授权，RPC拒绝时不能以无授权旧cache绕开；与RP08集成。

### 验收与证据

- 慢/me、离线刷新、logout/login交错与双账号时，A草稿不会被清理或由B发送。
- 浏览器transaction故障/重开下，每个未确认payload至少一份持久副本。
- A/B共享项目cache API及Tasks实际fallback不交叉显示。
- v1/旧v2无owner队列upgrade中止/重试保全，B不会代发；不宣称server接受旧行。

### 依赖门禁

- 旧owner认领与dead-letter保存口径
- S02-OPEN-01/02/03/06/07浏览器验收

### 兼容、回滚和停止

- 迁移前保持原stores可读取；回滚只能到支持owner分区/隔离区版本。不能clear整个IDB作rollback。升级失败暂停同步并保存用户草稿。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP12 · 离线按条数/字节分批与结果核对

阶段 3；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：离线前端负责人、同步后端负责人。

关联发现/候选：F04；原卡：C05；先决包：RP00、RP09、RP11。

### 文件和输入范围

- `rdpms-system/frontend/src/offline/engine.ts`
- `rdpms-system/frontend/src/api/endpoints/sync.ts`
- `rdpms-system/frontend/src/offline/idb.ts`
- `rdpms-system/backend/src/routes/sync.js`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. count上限与serialized body byte上限同时计算；实际HTTP limit待S02-OPEN-04取得，应用主动预算不能高于已知链路。单条oversize给可恢复拒绝，不能无限重试。
2. 同资源与父子创建依赖显式排序；依赖失败时保留后续项，不以数组位置作为已提交证据。
3. 逐批发送并逐mutationId验证结果完整性、唯一性和status；missing/duplicate/unknown返回不删除未确认行。
4. 网络中断/500保留同key和payload按RP09合同重试，批间进度和队列状态持久化；重开继续未确认项。

### 验收与证据

- 501/1001项分批完成，byte限额在count不足500时同样切批。
- 首批成功次批故障重开只重试未确认项，不重复影响已确认业务。
- 父项失败、单项oversize、缺失/重复/未知结果均不丢payload。

### 依赖门禁

- S03-OI-03
- S02-OPEN-04有效body限额

### 兼容、回滚和停止

- 兼容较小批次作为回滚；不能回退到全队列发送。持久key/结果状态不重建，不放弃未确认队列。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP13 · 稳定分页、提交可见水位与版本化 pull

阶段 3；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：同步/数据库负责人、离线前端负责人。

关联发现/候选：B07；原卡：C04；先决包：RP00、RP08、RP09、RP11。

### 文件和输入范围

- `rdpms-system/backend/src/routes/sync.js`
- `rdpms-system/backend/prisma/schema.prisma`
- `rdpms-system/frontend/src/offline/engine.ts`
- `rdpms-system/frontend/src/api/endpoints/sync.ts`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/sync/changePublisher.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

条件schema修改另允许新增 `prisma/migrations/<approved-new-migration>/migration.sql`；不改写历史migration。具体命名和SQL在实施包设计裁定后登记。

### 实施步骤（本次未执行）

1. 先修已证明截断：upsert/tombstone均稳定keyset续页、明确hasMore/token、固定窗口；全部流到边界且IDB应用完成后才提交checkpoint。这个子任务不能声称解决迟提交。
2. 完成S03-OI-01确定性事务屏障后签署watermark ADR；时间戳或max自增ID不天然代表提交顺序。
3. 建议选项为业务事务持久outbox+模块化单体内发布器：只有已提交outbox可发布；保存该业务revision的事件投影/tombstone；在持有单一发布水位锁的事务中分配并提交可见published sequence，杜绝跳过尚未提交缺口。这是待验证设计，不是现有能力。
4. 若采用另一方案，须证明每个合格已提交change必在当前或后续窗口出现，包括长事务、发布器中断、分页重试和同时间戳；不满足证明不能发布新cursor。
5. snapshot、ACL、tombstone及incremental协议版本化；旧cursor不能直接当新cursor，一次受控snapshot和双版本窗口不丢outbox。
6. HTTP/sync/后台所有相关写入口产生日志/outbox原子记录；发布与保留窗允许重发去重，不允许漏发。

### 验收与证据

- 3001+ upsert/5001+ tombstone全分页且checkpoint不早推进。
- 同timestamp、长事务迟提交、发布器故障屏障证明无永久跳过。
- 新授权snapshot与分页checkpoint一致；IDB apply中断后可重放。
- old/new client/cursor兼容，不丢离线payload；历史版本保留覆盖最久离线窗。

### 依赖门禁

- S03-OI-01数据库语义
- 提交可见水位ADR
- 各写入口coverage及保留窗

### 兼容、回滚和停止

- cursor带version，回滚不能复用更高水位跳过历史；可停新发布器并重新snapshot，但须保留owner outbox。旧无分页协议不得恢复为默认。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP14 · 文件字节出口、扫描策略与 elevated 上下文

阶段 1；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：文件模块负责人、安全负责人。

关联发现/候选：B11、B12；原卡：C06；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/routes/files.js`
- `rdpms-system/backend/src/routes/regulatory-documents.js`
- `rdpms-system/backend/src/modules/files/fileAccessPolicy.ts`
- `rdpms-system/backend/src/modules/files/fileCommands.ts`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/modules/files/fileReadService.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 下载/原文件/预览/兼容别名复用同一FileRead流程：当前scope→deleted→scan policy→安全storage根→读取→必要审计。
2. INFECTED阻断不因别名或elevated绕过，保留URL和响应兼容；FAILED/SKIPPED等状态依据显式安全政策，不能当扫描通过。
3. 完整传入projectAccess decision保留elevated；普通非成员拒绝，超管访问需权限+批准的敏感审计合同。
4. B12涉及metadata/download/delete均检查上下文；字节出口不以metadata允许替代扫描检查。

### 验收与证据

- 无害文本标为INFECTED，所有字节出口均拒绝并有要求的审计。
- 成员/普通非成员/超管非成员矩阵符合批准scope；B12正常允许用例成功。
- 安全存储根、soft delete、缺object/path等失败结果一致，不能泄露未授权正文。

### 依赖门禁

- FAILED/SKIPPED与elevated审计政策只阻塞相关子项

### 兼容、回滚和停止

- 别名保持委托共享policy；回滚不得恢复感染绕过handler。不能为兼容临时放宽scope。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP15 · 历史异常处置与关系约束迁移

阶段 4；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：数据库负责人、产品/数据所有者。

主finding归RP05等包；本包支持B19/B20关系迁移和历史异常，不重复计算关闭；原卡：C07；先决包：RP00、RP05。

### 文件和输入范围

- `rdpms-system/backend/prisma/schema.prisma`
- `rdpms-system/backend/prisma/migrations/`
- `rdpms-system/backend/src/modules/tasks/taskCommands.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

条件schema修改另允许新增 `prisma/migrations/<approved-new-migration>/migration.sql`；不改写历史migration。具体命名和SQL在实施包设计裁定后登记。

### 实施步骤（本次未执行）

1. 在获准只读副本按S04核查方案统计跨项目parent/phase/dependency、orphans、cycles/tombstone引用与实际部署FK漂移。不得编造存量数量。
2. 由产品/数据owner逐类批准保留/隔离/重挂等处置，输出原值/new值/依据/补偿表；本计划不预选自动删除。
3. 先expand复合候选键/必要索引，再应用受控历史处置，validate约束，最后contract旧路径；新migration，不改写已执行历史migration。
4. DAG/live reference规则留应用command验证，数据库复合FK不能单独证明无环或有效软删引用；物理cascade/softdelete职责明确。
5. 针对目标DB实际计划/锁预算/数据规模做隔离迁移演练；记录cancel、失败、旧app兼容与回滚补偿。

### 验收与证据

- RP05 guard阻断新跨项目边；异常盘点有人签收，归零或显式隔离后才validate。
- 复合约束reject跨项目关系，合法树/phase/dependency继续工作。
- 迁移锁/耗时与cancel在获准预算内；rollback不删除未授权任务。

### 依赖门禁

- D-S01-08
- S04-OI-01授权数据与处置
- 目标DBschema/锁预算

### 兼容、回滚和停止

- expand/validate/contract分离；保留原关系备份和受控补偿。不能用数据库cascade清异常。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP16 · restore 完整约束校验与真实影响计数

阶段 4；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：数据库/备份后端负责人。

关联发现/候选：B13；原卡：C07、C08；先决包：RP00。

### 文件和输入范围

- `rdpms-system/backend/src/kernel/backupRestore.js`
- `rdpms-system/backend/src/routes/backup.js`
- `rdpms-system/backend/prisma/schema.prisma`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/kernel/restoreSchemaRegistry.js`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 从schema-aware统一registry生成supported表的主键、所有单列/复合unique和FK检查，不把部分模块JSON称整库镜像；明确不支持模块。
2. 校验payload内冲突及目标库全量冲突，不slice前500；preview仅建议，apply在事务有效快照再检查并处理并发目标变化。
3. 移除静默skipDuplicates成功语义；任何意外冲突事务失败或按批准merge合同逐行明确计数，不以输入length累计created。
4. 响应每表planned/inserted/updated/deleted/unchanged及真实effect；提交后核对PK/unique/FK/文件引用才报告已恢复范围。
5. partial replace、append-only和不可恢复模块明确显示；RP19定义JSON restore与整库dump/file DR的独立验收合同。

### 验收与证据

- 重复username等单列与复合unique、非空/可空FK、500/501边界均显式拒绝或完整核对。
- reported行数等于事务后DBeffect，各表总数/关系可核对。
- preview/apply并发变化不导致静默丢行；失败全回滚。
- 不宣称恢复未包含的phase/file模块或二进制。

### 依赖门禁

- merge/replace冲突目标合同
- S05-OI-03验收
- 真实restore需RP17/RP19恢复能力门禁

### 兼容、回滚和停止

- 只有获准可验证快照才能操作真实restore；应用rollback保持真实count/fail-on-conflict语义。保留原payload/结果用于补偿。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP17 · 不可变 uploads 快照与备份清单

阶段 1；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：运维/备份负责人。

关联发现/候选：D01；原卡：C08；先决包：RP00。

### 文件和输入范围

- `rdpms-system/deploy/scripts/backup-pg.sh`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 新建确认真实目录的staging，解析上一完成快照路径仅用作rsync link-dest；不要把latest软链复制为新快照。
2. 生成文件manifest/摘要与dump hash；确保内容完整后原子发布dated snapshot及latest，失败不发布部分结果。
3. 实现可重入runId与保留策略；只能清理已确认published快照，不先删除旧可恢复点。
4. 在目标Linux文件系统核对硬链接语义，至少两轮新增/修改/删除；旧快照是否已损坏须单独证据，历史macOS结果不外推。
5. 现存备份先保全/分类，疑似问题快照标记不可自动restore，不覆盖修复。

### 验收与证据

- 两轮及失败中断后第一轮manifest/字节保持；第二轮完整才推进latest。
- 快照是实际目录，latest指向完整published位置，错误目录/权限/rsync失败不影响首份。
- dump文件可读性/hash不替代配对恢复一致性，RP19另外验收。

### 依赖门禁

- S05-OI-01目标Linux验收

### 兼容、回滚和停止

- 保全原备份树；回滚不得继续运行会改写历史快照的脚本，必要时暂停该任务并保留日志/数据。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP18 · 候选门禁、统一配置与发布兼容矩阵

阶段 2；相对工作量 M（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：发布/运维负责人、后端bootstrap负责人。

关联发现/候选：D02、D03；原卡：C08；先决包：RP00。

### 文件和输入范围

- `rdpms-system/deploy/scripts/deploy.sh`
- `rdpms-system/deploy/scripts/preflight.sh`
- `rdpms-system/deploy/scripts/smoke-test.sh`
- `rdpms-system/backend/src/bootstrap/createApp.js`
- `rdpms-system/backend/.env.example`
- `rdpms-system/deploy/systemd/rdpms-api.service`

拟新增文件（待设计/构建契约确认）：

- `rdpms-system/backend/src/platform/config/configSchema.ts`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 拆host preflight与candidate gate；clone候选后且migration前传候选路径，校验source/schema/seed/config contracts，不用current检查结果代替候选。
2. 候选commit/build/hash manifest绑定gate/build/migration/readiness/smoke/实际服务identity；失败发生在任何迁移/切流前。
3. 应用/preflight/example共用配置schema并核对真实消费；ALLOWED_ORIGINS/CORS_ORIGINS迁移有兼容期，矛盾变量显式失败，不输出真实secret。
4. ENABLE_BACKUP_EXPORT等开关若保留必须接上已定义的受权行为，否则明确移除/废弃，不能把未消费flag当保护。
5. 每个migration注明旧/新app兼容窗口、不可逆数据变化及补偿；smoke失败按受控runbook恢复兼容旧release，不假定代码指针回退可回退schema。

### 验收与证据

- 仅candidate有合同缺陷时current仍健康，失败阻断在migration前。
- 只配置文档变量时有效CORS行为符合合同，非法生产配置同样被preflight/app拒绝。
- 部署健康/ready/smoke同build fingerprint；受控失败退出状态清晰。
- release/app×schema矩阵含回退版本，不知兼容时禁止切流。

### 依赖门禁

- S05-OI-04目标运行环境
- S05-OI-05回滚runbook
- CORS与export行为设计

### 兼容、回滚和停止

- 保留前/后release及manifest；配置新旧解析兼容不恢复wildcard默认。避免盲目migrate down。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。

## RP19 · 候选恢复点裁定、配对恢复与发布验收

阶段 5；相对工作量 L（S/M/L表示范围和不确定性，不代表日程承诺）；负责人角色：运维/数据库负责人、发布负责人。

关联发现/候选：R12-N01；原卡：C08；先决包：RP00、RP15、RP16、RP17、RP18。

### 文件和输入范围

- `rdpms-system/deploy/scripts/backup-pg.sh`
- `rdpms-system/deploy/scripts/drill/backup-drill.py`
- `rdpms-system/deploy/scripts/deploy.sh`

先读本计划、该finding的S06对账与所属R包报告、相关S包补充；再沿列出的源码锚点读取，不重扫全仓。

### 实施步骤（本次未执行）

1. 先取得脚本外调度/存储快照/写屏障证据，裁定R12-N01是否为实际缺陷；无法裁定保持PENDING。若仅做可靠性增强，独立标注增强而非关闭已证缺陷。
2. 选择获准write barrier或可证明的版本快照，使DB dump和file manifest属于同一恢复点；runId/hash相同仅证明配对标签，不自动证明一致时点。
3. 在自有合成DB/files连续新增/修改/删除元数据和二进制，恢复同对及错对，核对引用、size、hash和表计数；不匹配在验收前拒绝。
4. 与受控§13 runbook进行旧release+兼容schema+proxy/service重启隔离演练，保留buildID/日志/health/readiness/auth只读smoke。
5. 产品/运维签署RPO/RTO与恢复结果；接续生产变更另建具体变更任务，计划本身不授权生产部署/restore。

### 验收与证据

- R12-N01有SUPPORTED/反证/继续PENDING的证据理由，不能未经补证改confirmed计数。
- paired restore在控制写入条件下完整，错对/hash mismatch明确失败。
- 隔离rollback恢复前一兼容release且build一致，恢复时间有实测证据。
- 所有P1与各包验收达到批准标准，NOT_RUN/ENV_BLOCKED不能算通过。

### 依赖门禁

- S05-OI-02
- S05-OI-04
- S05-OI-05
- RPO/RTO与写屏障决定

### 兼容、回滚和停止

- 恢复失败保持原环境/备份不覆盖；没有配对完整性和迁移兼容证据时不启动真实restore或发布。
- 批准规则/关键前置未满足时只完成独立子任务，不能覆盖门禁。
- 隔离资源/数据所有权不明、dotenv或子进程指向非自有资源时停止动态验证。
- 出现范围外文件变更、意外数据丢失/授权扩大、无法解释的回执或rollback不安全时停包并记录。

### 必交结果

- change-summary.md：关联ID、决策、源码基线、实际差异及API/schema兼容变化。
- evidence/：合成夹具、执行命令、退出码、日志、DB/浏览器持久状态、清理记录；真实token/正文/姓名不入证据。
- acceptance.json：每场景 PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据文件及未覆盖边界。
- rollback.md：可回滚版本、schema/data兼容与演练结果；禁用不安全旧路径。
- 更新 IMPLEMENTATION_STATE 与 handoff；未验收不关闭finding，merge/deploy单独登记。


所有包的未来测试文件和隔离夹具，在启动实施时按PACKAGES.json.validationFileScope逐包登记。当前未创建或执行任何业务测试。

RP19列出的完整依赖用于本轮整改项目的最终验收。某次具体candidate发布按包含包选择RP19相关子验收和schema/备份/runbook门禁；安全小修不自动等待不相干的关系迁移，但其实际部署仍需另行授权并证明可恢复。
