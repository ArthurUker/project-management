# RDPMS 后续代码审阅工作计划（供 Luna 执行）

版本：2026-09-30 v2（补充审阅规划）。仓库：`/Users/renkang/VS Code/project-management`。

## v2 接续入口与完成口径

R00—R14 已有审阅结果，执行状态为 4 个 COMPLETE、11 个 COMPLETE_WITH_PENDING；28/28 旧 ID 已对账。这是第一轮包执行进度，交付合同核验仍有缺口，不能据此宣称严格验收 100% 完成。

新增 [SUPPLEMENTAL_REVIEW_PLAN.md](SUPPLEMENTAL_REVIEW_PLAN.md)，规划 S00—S06 七个补充包，状态均为 NOT_STARTED。下一计划包为 S00。本次只更新计划、接续提示和交接入口，不执行 S00 文档纠正或 S01—S06 审阅/实验，不实施业务修复。

- 原轮结果依据：`execution/state.json`、`execution/handoff.md` 和各 Rxx 产物。原状态保留，不重置 R00—R14。
- 补充包计划与状态入口：`SUPPLEMENTAL_REVIEW_PLAN.md`、`SUPPLEMENTAL_STATE.json`；新执行产物将写入 `execution/supplemental/Sxx/`。
- 原 `INITIAL_STATE.json` 为 v1 初始快照，继续保留；不得再据此声称 R00—R14 尚未执行。
- 严格交付验收、补充审阅包进度、动态验证完成情况、业务修复进度须分别报告。允许明确 pending 收尾，但不得把未运行写成通过。
- 下文保留 R00—R14 任务卡和证据合同；v2 的执行顺序与并行安排以补充计划为准。

## 目标与授权边界

在2026-09-29深审结果上，按风险路径细化代码审阅和架构评估，交付可追溯结论与后续修复任务卡。v1 由用户指定 Luna 执行；v2 基于已交付材料补充收尾与证据计划。本次规划只阅读已有产物并编写计划。

审阅范围包括认证/权限、项目与注册项目、离线协议和本地存储、文件、事务并发、数据关系、备份和发布回滚。执行阶段是阅读、分析、证据整理，以及必要的最小隔离补证；不实施业务修复、依赖升级、数据库迁移、部署、提交或PR。修复建议与任务卡属于设计交付。

历史基线：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。已有28条：16 P1、12 P2；21后端+4前端引擎+1本机备份复现，2条静态部署确认。数字是历史发现数量，既不代表全仓覆盖率，也不代表修复或系统测试通过。

## 输入与证据继承

输入目录：`docs/audits/2026-09-29-rdpms/`。先读HANDOFF、REPORT、manifest和findings；按工作包读取对应results JSON/verify脚本，避免每批重复加载所有大文件。当前前端证据为真实engine+fake-indexeddb+注入transport；多数后端路径注入actor，B01有真实JWT登录证据；备份实验来自本机macOS。真实浏览器、目标Linux和生产恢复均未验证。

旧目录及旧manifest保持冻结。新增判断写到本计划目录的 `execution/`，不得回写昨天报告来隐藏纠正或重新计算旧manifest掩盖差异。若HEAD或工作区有变更，先登记受影响路径/内容摘要；对无关变化继续，对影响当前结论的部分只审增量，不reset/checkout覆盖用户内容。

证据层次：H=历史报告/结果；S=当前源码调用链及行号；D=本轮实际动态结果。每个结论可同时有多层，必须记历史与当前日期/HEAD。相同代码上的历史复现可继承，但不得写成“本轮刚测试”。静态证据足以确认的问题不强制动态验证。

## 执行节奏和范围控制

推荐顺序：R00 → R01 → R04 → R03 → R07 → R08 → R12 → R02 → R05 → R06 → R09 → R10 → R11 → R13 → R14。首先保障可达越权与数据保全路径，再收敛跨模块设计。

首次提示执行R00及一个实质工作包R01；后续每次执行一个就绪工作包并完整落盘。若用户明确要求连续执行多个包，则逐包保存检查点后继续。单包通常3—8个主文件，按处理器/函数或schema片段读取；大文件也按本包问题拆读，不逐行通读全仓。schema/migrations作为目标模型的证据源，不意味着查看整个数据库模块。

额外文件必须沿已识别调用边访问，登记“从哪个入口/符号、为何需要”。直接依赖不超过5个额外文件为常规限额；超过时先拆出有边界的补充子包，写明未覆盖范围并交接，不能悄悄扩成新全仓审计。用户后续已允许子任务并行；仅按依赖拆分独立包，由主执行者统一更新状态，不自行切换模型。本次计划更新不启动子代理。出现证据冲突、产品规则不明确或数据库语义难题时输出具体待决策问题，不能靠推测补全。

每个包固定操作：读取本包任务卡与历史条目 → 建立入口和不变量清单 → 检查实际调用链/授权/提交边界 → 主动寻找反例和现有保护 → 继承或最小补充证据 → 填结果与覆盖记录 → 更新state/handoff。未覆盖行必须有原因，不能用“未发现更多问题”替代检查清单。

## 结论、优先级与完成状态

原问题的disposition：`SUPPORTED`（当前证据支持）、`REVISED`（范围/严重度需要纠正）、`NO_LONGER_PRESENT`（当前代码变化后不再存在，非等同验收修复通过）、`PENDING`（无法决定）。前三者均需要源码/证据锚点；REVISED必须保留原结论、修订原因与反证。PENDING注明缺什么以及怎样得到它。

动态验证另记：`HISTORICAL_ONLY`、`NOT_NEEDED`、`PLANNED_NOT_RUN`、`RUN_REPRODUCED`、`RUN_NOT_REPRODUCED`、`RUN_ERROR`。复现失败不自动推翻静态结论，先判定夹具/环境是否能触发同一路径。

工作包状态：`NOT_STARTED` → `IN_PROGRESS` → `COMPLETE` / `COMPLETE_WITH_PENDING` / `BLOCKED`。COMPLETE表示审阅材料齐备，不表示该模块无缺陷或已修复。BLOCKED只用于无法开始/继续本包的明确依赖，记录可解除条件；独立包可继续。R14允许合并含pending的结果，但总状态必须标注pending数量及覆盖缺口。

沿用P1/P2定义。新发现使用 `N-Rxx-01`，需有可达入口、攻击/操作前提、具体状态/数据变化与反证检查；风格建议不计缺陷。同一根因跨入口扩大影响通常追加到旧ID，由归属包记录，交叉包只引用，避免重复计数。若认为有P0，必须明确无特权触发路径、立即严重影响和对应证据，单独列裁定请求。

## 统一审阅矩阵

- 权限：实际系统角色/权限来源 × 项目OWNER/MANAGER/MEMBER/VIEWER/非成员/已退出 × 操作入口。不是枚举所有笛卡尔积：覆盖有效允许、系统权限缺失、项目能力缺失、非成员、超管例外及已撤权等有意义的边界，解释剩余项。
- 写入：HTTP/sync/批量/嵌套/导入入口 × 当前状态/版本 × 授权/CAS/事务/回执/审计。每个声称原子性的边界须指出事务起止及其内外SQL。
- 数据生命周期：正常、软删、关联删除、撤权、本地未同步、冲突/拒绝、重启恢复；每项说明最后一个可恢复副本的位置。
- 部署恢复：检查对象、制品版本、迁移和文件状态、失败时已改变内容、回退条件、可观察证据。未执行演练要明确写“方案”。

## 工作包总览

| 包 | 主题 | 历史发现归属 | 前置 |
|---|---|---|---|
| R00 | 基线与证据接续 | — | — |
| R01 | 账号管理与角色权限 | B01, B17 | R00 |
| R02 | 登录锁定与令牌轮换 | B14, B15 | R01 |
| R03 | 项目聚合写入与可见性 | B02, B03, B18, B20 | R01 |
| R04 | 注册项目对项目授权的复用 | B21 | R01 |
| R05 | 同步拉取、游标与授权变化 | B04, B07, B08 | R03, R04 |
| R06 | 同步写入、回执与状态机 | B05, B06, B09 | R05 |
| R07 | 离线启动、账号切换与本地隔离 | F01, F03 | R00 |
| R08 | 离线出队、冲突和批量恢复 | F02, F04 | R07 |
| R09 | 任务与汇报并发、提交快照 | B10, B16 | R06 |
| R10 | 文件访问、隔离与关联 | B11, B12 | R01 |
| R11 | 跨项目关系与软删模型约束 | B19 | R03, R06, R09 |
| R12 | 备份快照与恢复结果可信度 | B13, D01 | R00 |
| R13 | 候选发布门禁、配置与回滚 | D02, D03 | R12 |
| R14 | 汇总、去重与架构决策 | — | R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13 |

## 逐包任务卡

以下源码路径相对`rdpms-system/`；R00输入路径相对仓库根。未列主文件不代表无缺陷，只代表本轮范围。

### R00：基线与证据接续

- 归属：基础/汇总产物；前置：无。
- 主文件：`docs/audits/2026-09-29-rdpms/HANDOFF.md`；`docs/audits/2026-09-29-rdpms/REPORT.md`；`docs/audits/2026-09-29-rdpms/manifest.json`；`docs/audits/2026-09-29-rdpms/findings.json`。

1. 记录HEAD、分支、tracked/untracked状态；校验旧manifest列出的文件摘要。原报告的28条为历史基线，不改写历史数量。
2. 按需读取四份结果JSON及相关复现脚本；登记21后端+4前端引擎+1本机备份复现、2静态确认。明确真实JWT、actor注入、受控并发、模拟transport的不同证明能力。
3. 比较基线到HEAD及工作区差异；相同基线不重扫。若有增量，列受影响文件/结论/工作包；未提交业务变更同时记录内容摘要。
4. 确认后续复现不能沿用固定夹具污染后的旧数据库。路径不存在不否定历史证据；建立当前证据索引和28条映射即可。

- 必交产物：baseline.md；evidence-index.json；coverage.csv初始化。
- 动态验证/停止边界：无新动态验证。证据文件缺失/摘要不符先登记差异；不得重写旧manifest让它通过。影响证据可信度时仅阻断相关工作包，仍推进独立包。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R01：账号管理与角色权限

- 归属：B01, B17；前置：R00。
- 主文件：`backend/src/routes/users.js`；`backend/src/routes/roles.js`；`backend/src/kernel/rbac.js`；`backend/src/platform/identity/actorResolver.js`；`backend/src/kernel/constants.js`；`backend/prisma/seed.js`。

1. 画出认证→权限加载→重置密码/创建角色的调用链；区分systemRole、角色关联、系统权限与前端菜单限制。
2. 核对ADMIN→SUPER_ADMIN重置的实际默认权限路径，目标角色保护、强制改密端点限制、现有access/refresh token失效规则和审计事务。优先寻找可推翻旧结论的后端保护。
3. 核对创建角色code必填与全局字段过滤；权限目录/可授予集合/用户可分配角色是否一致，新增问题必须证明可达。
4. 列角色管理、改密、自改密、重置和停用相关入口矩阵；无业务规则证据时把“管理员应否重置同级”等记为产品决策问题。

- 必交产物：权限管理入口矩阵；B01/B17核对表；目标账号保护和改密会话合同建议。
- 动态验证/停止边界：沿用B01真实JWT证据；只有源码变化或发现反向保护才设计最小对照复现。不能只用注入ADMIN身份宣称完整登录链已验证。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R02：登录锁定与令牌轮换

- 归属：B14, B15；前置：R01。
- 主文件：`backend/src/routes/auth.js`；`backend/src/kernel/rbac.js`；`frontend/src/auth/AuthProvider.tsx`；`frontend/src/auth/tokenStore.ts`；`frontend/src/api/http.ts`；`backend/prisma/schema.prisma`。

1. 列ACTIVE/LOCKED/人工停用与lockedUntil组合，核对失败阈值、到期恢复、成功清零及实际入口检查顺序。
2. 画同refresh token两请求的读/撤销/签发时间线；记录事务范围、条件更新、familyId和失败后的残留状态。
3. 检查响应expiresIn与JWT实际TTL的来源，前端是否依赖该值；区别后端令牌分叉与前端同时401导致的刷新竞争。
4. 核对登出、重置密码、改角色后的会话撤销合同；历史发现沿用ID，独立新根因另编号。

- 必交产物：登录状态表；令牌生命周期时序；B14/B15核对及一次性消费的验收条件。
- 动态验证/停止边界：不使用真实账号进行锁定实验；并发如需复核，只能在新建隔离实例用受控交错，禁止通过随机sleep声称已覆盖竞争。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R03：项目聚合写入与可见性

- 归属：B02, B03, B18, B20；前置：R01。
- 主文件：`backend/src/routes/projects.js`；`backend/src/kernel/projectAccess.js`；`backend/src/kernel/constants.js`；`backend/prisma/schema.prisma`；`frontend/src/api/endpoints/projects.ts`。

1. 只按创建、更新tasks/milestones、状态变更、模板应用、列表这几个处理器拆读大文件，并记录实际调用的前端表单位置。
2. 核对普通更新权限如何进入deleteMany/重建；任务ID、关联、墓碑与审核历史的变化，区分实证丢失和推断影响。
3. 逐个对照授权select投影与业务读取字段，核对status/startDate和批处理；列创建聚合中每个提交边界。
4. 列列表、详情、搜索、子资源、sync的软删和成员条件；直接projects.delete仅在证明普通角色可获权限后才扩大结论。

- 必交产物：项目聚合入口/权限/事务表；四条结论及数据不变量；前端字段→后端字段映射。
- 动态验证/停止边界：不重跑已有嵌套删除或失败创建复现。只有影响范围有实质疑问时，用隔离夹具查关联计数/墓碑；不能以业务数据演练删除。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R04：注册项目对项目授权的复用

- 归属：B21；前置：R01。
- 主文件：`backend/src/routes/registrations.js`；`backend/src/kernel/projectAccess.js`；`backend/prisma/seed.js`；`frontend/src/api/endpoints/registrations.ts`。

1. 分别登记列表、统计、详情、更新、stage、profile入口的系统权限、成员约束、项目能力、软删条件。
2. 对比普通projects入口与registration子类型入口，确认B21的默认角色可达路径；不能把全局业务查看权自动解释为跨项目授权。
3. 检查manager替换、阶段变更是否改变成员身份或绕过状态保护，沿真实调用链追到模型约束。
4. 输出注册档案作为项目扩展的授权边界和需要产品裁定的可见性例外。

- 必交产物：注册入口与普通项目入口差异矩阵；B21证据边界；共享授权策略草案。
- 动态验证/停止边界：沿用additional-results.json；新增stage/profile越权须给具体缺口，不能用已证实详情越权自动证明所有入口。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R05：同步拉取、游标与授权变化

- 归属：B04, B07, B08；前置：R03, R04。
- 主文件：`backend/src/routes/sync.js`；`backend/src/kernel/projectAccess.js`；`backend/prisma/schema.prisma`；`frontend/src/offline/engine.ts`；`frontend/src/api/endpoints/sync.ts`。

1. 只审init、实体定义、ACL版本/成员时间字段、applyPull与cursor存储；逐实体列scope、view权限、ownOnly、时间字段、上限和墓碑。
2. 画首次快照、分页截断、同时间戳、读取期间写入、事务提交乱序的检查点时间线；区分已复现3001截断与尚未运行的其他场景。
3. 核对新增成员、离开重入、角色变动、权限撤销时的历史补齐和缓存删除；不能只检查projectIds而漏实体权限。
4. 提出可验证的游标合同：边界、排序、续页、完成条件、权限版本；指出仅用当前时间或max自增序列的漏洞条件。

- 必交产物：逐实体拉取合同矩阵；B04/B07/B08结论；游标/ACL协议设计问题清单。
- 动态验证/停止边界：已有截断和加入成员证据够用；只为无法从代码判明的交错补最小验证。若涉及数据库提交序保证不明确，列待仲裁，不擅自选CDC/日志架构。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R06：同步写入、回执与状态机

- 归属：B05, B06, B09；前置：R05。
- 主文件：`backend/src/routes/sync.js`；`backend/src/platform/idempotency/receipts.js`；`backend/src/platform/idempotency/payloadHash.js`；`backend/src/platform/audit/strictAudit.js`；`backend/src/modules/access/writeGuards.ts`；`backend/src/modules/tasks/taskCommands.ts`；`backend/src/modules/reports/reportCommands.ts`；`backend/prisma/schema.prisma`。

1. 只审push及其直接命令依赖，画authenticate→授权→回执查找→版本检查→业务/审计/回执提交的真实顺序。
2. 比较HTTP回执与SyncMutation对主体、resource、payloadHash、重复键的处理；B05结论保留已知mutationId前提。
3. 列每种entity允许字段、create/update/delete所需权限、状态机、CAS和原子边界；重点项目归档与敏感managerId/成员字段。
4. 区分单mutation原子性与整批原子性，不把“整批必须一个事务”设为未经讨论的需求；给部分成功/重试的协议合同。

- 必交产物：HTTP/sync写路径对照表；B05/B06/B09结论；共享命令与回执合同建议。
- 动态验证/停止边界：仅在新增路径的事务归属不清时故障注入；旧复现验证缺陷，不可直接作为将来修复测试的通过断言。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R07：离线启动、账号切换与本地隔离

- 归属：F01, F03；前置：R00。
- 主文件：`frontend/src/App.tsx`；`frontend/src/auth/AuthProvider.tsx`；`frontend/src/offline/SyncProvider.tsx`；`frontend/src/offline/engine.ts`；`frontend/src/offline/idb.ts`。

1. 画bootstrapping、恢复登录、显式退出、账号切换的事件/await/sessionGen时序；核对resetOnLogout调用与队列所有者。
2. 逐个存储列主键、主体字段、读过滤、清理范围；关注全局records/outbox与按用户kv/deadLetters不对称。
3. 追踪readCachedRecords实际消费者，以真实页面调用链决定F03是否增加UI影响；没有使用链就保留引擎/API层边界。
4. 核对旧会话异步尾部是否能清除新会话数据，并提出不丢草稿的本地schema迁移约束。

- 必交产物：身份/同步时序图；本地存储主体隔离表；F01/F03结论与浏览器待证场景。
- 动态验证/停止边界：不默认启动浏览器。F01现有证据是引擎+调用链；如需升级为真实页面复现，先完成该页最小场景设计并只用测试账号/临时浏览器数据目录。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R08：离线出队、冲突和批量恢复

- 归属：F02, F04；前置：R07。
- 主文件：`frontend/src/offline/engine.ts`；`frontend/src/offline/idb.ts`；`frontend/src/api/endpoints/sync.ts`；`backend/src/routes/sync.js`。

1. 按applied/conflict/rejected三分支列网络响应与每个持久化操作；核对业务内容的最后一个可恢复副本何时被删。
2. 检查冲突/拒绝区写入与出队是否同一IDB事务，以及cursor更新、重启hydrate、session切换之间的关系。
3. 核对501+操作、请求字节上限、任务依赖顺序、部分回包、超时重试、重复回包的处理；已实现保护要如实记录。
4. 输出队列状态转换合同，要求失败后可恢复且原主体归属不变；将设计遗漏与当前可证缺陷分开。

- 必交产物：三类结果持久化顺序表；F02/F04结论；分批/恢复和故障点验证方案。
- 动态验证/停止边界：沿用4条离线结果中的本包证据；不把模拟服务端限额当成完整网络E2E。必要补证只注入指定失败点。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R09：任务与汇报并发、提交快照

- 归属：B10, B16；前置：R06。
- 主文件：`backend/src/routes/tasks.js`；`backend/src/routes/reports.js`；`backend/src/modules/tasks/taskCommands.ts`；`backend/src/modules/reports/reportCommands.ts`；`backend/src/modules/reports/reportRules.ts`；`backend/src/platform/idempotency/receipts.js`；`backend/prisma/schema.prisma`。

1. 列保存、提交、复提、审核、驳回、指派、状态修改的来源状态、修订字段、HTTP DTO与命令参数。
2. 对照route读快照与命令事务边界，画并发保存→提交版本与正文分离的时间线；复提是否允许必须有代码/需求证据。
3. 核对CAS是否真传入及更新条件，不能以底层支持CAS断言路由已经使用；比较sync同操作语义。
4. 列严格审计/非严格审计的路径，只有能证实关键写成功而必要证据失败时才能增加独立发现。

- 必交产物：状态/修订/事务矩阵；B10/B16结论；汇报版本不变量与共享命令边界。
- 动态验证/停止边界：并发结论用受控交错或确定静态调用顺序；未知数据库隔离行为不得用随机并发结果推断必然性。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R10：文件访问、隔离与关联

- 归属：B11, B12；前置：R01。
- 主文件：`backend/src/routes/files.js`；`backend/src/routes/regulatory-documents.js`；`backend/src/modules/files/fileAccessPolicy.ts`；`backend/src/modules/files/fileCommands.ts`；`backend/src/kernel/projectAccess.js`；`backend/prisma/schema.prisma`。

1. 登记元数据、下载、原文件、预览、业务导出实际文件读取入口与调用者；沿文件读取函数的直接引用补齐别名。
2. 对照所有出口的系统权限、关联项目/所有者、扫描状态、elevated规则、软删和审计，寻找统一策略的遗漏入口。
3. 检查绑定/解绑/删除中的业务所有权和事务边界；PG与磁盘之间的失败窗口仅在有可达路径时计问题。
4. 保留B11普通文本标记INFECTED的证明边界，不推断真实扫描引擎已部署；区分超管合法访问与可见性扩大。

- 必交产物：文件读取出口矩阵；B11/B12结论；统一文件读服务和失败补偿合同。
- 动态验证/停止边界：不使用真实恶意文件、不读取用户附件。新增动态夹具只能是自建无害文本。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R11：跨项目关系与软删模型约束

- 归属：B19；前置：R03, R06, R09。
- 主文件：`backend/prisma/schema.prisma`；`backend/prisma/migrations`；`backend/src/routes/tasks.js`；`backend/src/routes/sync.js`；`backend/src/modules/access/writeGuards.ts`；`backend/src/modules/tasks/taskCommands.ts`。

1. 仅查看涉及Task/父任务/phase/依赖/成员/软删的schema和迁移片段，列关系约束及应用层检查所在。
2. 核对parent同项目、phase同项目、循环关系、递归与级联是否带projectId；区分可建立异常边与实际可执行的跨项目删除。
3. 对照B08成员版本、B20可见性，作为相关包结论的模型解释，不重复编号。
4. 对每项建议列数据库约束或应用校验的责任、历史异常数据处理与迁移前置条件；无查询计划不得宣称有性能瓶颈。

- 必交产物：数据不变量→命令检查→数据库约束映射；B19结论；模型迁移前检查清单。
- 动态验证/停止边界：不运行历史业务数据修复或迁移；需要数据分布时仅列只读查询建议并标明尚未执行。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R12：备份快照与恢复结果可信度

- 归属：B13, D01；前置：R00。
- 主文件：`backend/src/kernel/backupRestore.js`；`backend/src/routes/backup.js`；`backend/prisma/schema.prisma`；`deploy/scripts/backup-pg.sh`；`deploy/scripts/drill/backup-drill.py`。

1. 核对preview与restore的唯一键/复合键/FK覆盖、payload内冲突、检查上限与实际写入计数。
2. 追踪cp/rsync/latest链、快照发布与保留清理条件，区分本机实证和目标Linux命令语义；不能宣称已做生产恢复。
3. 设计一组DB+文件同恢复时点的最小演练：两轮新增/修改/删除、旧快照摘要不变、导入数量和关联对账。这里只制定方案。
4. 给B13/D01分别列修复前的保全条件，避免用可能被污染的快照去覆盖现有数据。

- 必交产物：恢复逐表计数合同；快照生命周期图；B13/D01核对；隔离恢复演练方案。
- 动态验证/停止边界：只读审阅不执行restore/backup脚本；如某结论必须补文件系统证据，只在新临时目录运行最小cp/rsync片段并精确清理。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R13：候选发布门禁、配置与回滚

- 归属：D02, D03；前置：R12。
- 主文件：`deploy/scripts/deploy.sh`；`deploy/scripts/preflight.sh`；`deploy/scripts/rdpms-start.sh`；`deploy/scripts/smoke-test.sh`；`deploy/systemd/rdpms-api.service`；`backend/src/bootstrap/createApp.js`；`backend/.env.example`。

1. 列每一步实际目标：current、候选源码/制品、数据库、上传目录；检查门禁发生在何时、验证哪个版本。
2. 对照.env.example、preflight、应用读取和systemd传递的配置名/默认值；重点ALLOWED_ORIGINS/CORS_ORIGINS与导出开关。
3. 列失败点及已改变的持久状态、可回退动作和观察信号；migration先于构建是兼容风险，必须有实际不兼容迁移证据才计为已发生回滚缺陷。
4. 人工回滚符合现有流程，不以缺自动回滚计漏洞；提出构建指纹、readiness、候选门禁及expand/contract的可验收合同。

- 必交产物：发布阶段/对象/失败状态矩阵；D02/D03结论；回滚演练和配置单源方案。
- 动态验证/停止边界：禁止调用sudo/systemctl、生产部署、真实restore。不要读取含真实凭据的.env；只用示例和变量名。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

### R14：汇总、去重与架构决策

- 归属：基础/汇总产物；前置：R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13。
- 主文件：各已完成包的交付物，默认不新增源码阅读。

1. 对28条旧ID逐项对账：历史结论、当前结论、状态、证据、变化理由；新发现按根因与可独立修复性去重。
2. 把调用图合并为当前架构图，将HTTP/sync、角色/项目能力、本地主体分区、DB/文件恢复等边界冲突对应到具体证据。
3. 形成模块单体下的分阶段建议：先权限与数据保全，再命令/事务统一，再同步协议，再模型/文件，再发布恢复；每阶段列依赖、兼容、风险、退出条件。
4. 产出可独立实施的修复任务卡（设计产物），每张含范围、排除项、不变量、验收、回滚约束；不写修复代码。未解决设计分歧明确列待决策，不自行扩大权限或改变业务规则。

- 必交产物：FINAL_REVIEW.md；CURRENT_FINDINGS.json；ARCHITECTURE_ROADMAP.md；REMEDIATION_CARDS.md；handoff.md。
- 动态验证/停止边界：只汇总既有证据，不开启第二轮全仓审计。前置包有pending时可汇总但明确覆盖缺口，不能称为全部结论最终确认。
- 完成门槛：上述每个问题有结论/证据/明确pending；旧ID均有状态，矩阵未覆盖项有理由；满足下方统一产物合同。

## 统一交付物合同

执行目录：`docs/audits/2026-09-30-review-plan/execution/`。本次规划不预填审阅结果。

- 每包 `Rxx/review.md`：目标/范围、基线与差异、入口和调用链、每项问题结论、反例/既有保护、证据、待决策、最小修复建议与兼容约束、验证设计、覆盖缺口。
- 每包 `Rxx/findings.json`：下方结构的数组，历史ID必须保留；无新发现也不得省略历史核对条目。
- 每包 `Rxx/coverage.csv`：`packet,file,symbol_or_route,question,review_status,evidence_ref,unreviewed_reason`。review_status为REVIEWED/PENDING/NOT_APPLICABLE，不以文件曾被打开代表检查完成。
- 需要新动态补证时 `Rxx/evidence/`：环境/命令、输入夹具、预期与实际、退出码和原始日志路径、实例所有权/清理记录；输出禁止包含真实凭据和真实业务正文。
- 总 `state.json`：每包状态、起止HEAD、产物路径、pending/blockers、下一就绪包；总`handoff.md`记录当前进度、不可重复实验、下一步。更新时只写已完成动作。

单条JSON建议结构：

```json
{
  "id": "B01",
  "packet": "R01",
  "origin": "BASELINE",
  "baselineSeverity": "P1",
  "currentSeverity": "P1",
  "disposition": "SUPPORTED",
  "title": "由本轮审阅填写，不能把模板当结果",
  "head": "实际HEAD",
  "workingTreeDigestRefs": [],
  "entrypoint": "method + route / 函数",
  "preconditions": [],
  "source": [{"path": "repo-relative-path", "lineStart": 1, "lineEnd": 2, "symbol": "symbol"}],
  "callPath": [],
  "evidence": [{"level": "H", "ref": "旧结果文件#原ID", "limitation": "历史证据边界"}],
  "counterevidenceChecked": [],
  "observedImpact": "仅已证明影响",
  "potentialImpact": "需条件成立才可能产生的影响，未验证时明确标识",
  "verification": "HISTORICAL_ONLY",
  "recommendation": "建议",
  "acceptanceCriteria": [],
  "pendingQuestions": [],
  "supersedesOrRelated": []
}
```

结束用户回报固定为：本包/状态 → 支持/修订/待定的旧ID → 新发现和证据 → 未验证边界 → 产物链接 → 下一就绪包。避免每轮复述整份旧报告。

## 必须保留的历史边界

1. 直接projects.delete缺少范围检查尚未证明默认普通用户可利用，不独立升级；嵌套删除B02另有实证。
2. F01只在明确启动时序成立时触发，真实浏览器尚未验证；F03仅证明缓存API层，没有证明报告页面显示前账号正文。
3. B05须知道已有mutationId；B19是跨项目parent可建立，未证明可删除他人项目任务。
4. D01来自本机cp/rsync实验；不据此声称生产备份已被破坏。D02/D03是当前脚本配置逻辑问题，线上实际环境未读取。
5. 人工决定回滚是既有流程；迁移先于构建不能直接等同当前schema不可回滚。
6. 已支持的结论允许经反证修订，修订需追加证据与理由；没有测试不等于没有问题，没发现问题也不等于已经覆盖。

## 补充验证的最小规则

默认继承已有结果并做定向源码审阅，禁止一开始全量安装/构建/跑完整复现。仅当源码变化、证据矛盾或不能靠静态分析解决的关键语义影响裁定时补实验，并先在review记录要解决的一个问题及最小场景。

新实验只能使用可验证归属的临时副本/DB/浏览器目录，不读取真实.env连接业务库，不复用旧固定夹具库，不运行生产部署/恢复脚本。记录实例路径和端口、运行退出码、清理；不能证明是本次拥有的资源时停止该实验。环境不可用应写PLANNED_NOT_RUN/PENDING，继续独立静态审阅，不凭空写复现成功。

## 总体验收与后续实施界面

计划执行完成须同时有：28/28旧ID对账（允许有明确pending）；所有指定入口/问题有覆盖记录；新发现去重与可达证据；文件位置对应实际HEAD及工作区；架构图、阶段依赖/退出条件、修复任务卡齐全；未验证项单独列出；没有把审阅完成当成缺陷关闭。

修复任务卡字段：关联发现、具体目标、可改文件/禁止范围、前置依赖、必须保留不变量、设计选择及待决策、验收案例、回滚/数据迁移约束、停止条件、实施结果格式。R14只制定这些卡，不执行。适合先开的小包是账号目标保护、注册项目授权、嵌套删除、离线草稿保全、备份快照，每项均需结合本轮结论确认边界。
