# 业务裁定与技术设计门禁

所有推荐均为PROPOSED；截至规划时未获得新增批准。签署M-1变更沿用其批准路径，本计划不替负责人裁定。

## 八项业务裁定

### D-S01-01 · Administrative account hierarchy

关联：B01。责任角色：Product owner、Security owner、System governance approver。状态：PENDING。

建议禁止普通ADMIN重置/停用同级或更高保护等级账号，紧急超管恢复单独审计；具体等级与同级规则由负责人批准。

原登记可选方案：

- Forbid reset/disable of equal or higher-ranked accounts; define separate emergency flow.
- Allow only explicitly ranked superior roles, with approval and audit requirements.
- Keep permission-only control as an intentional policy, with explicit scope.

影响：Reset, enable, disable and delete routes; SUPER_ADMIN recovery and account governance.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

### D-S01-02 · Server-side boundary for forced password change

关联：B01。责任角色：Security owner、Product owner。状态：PENDING。

建议强制改密会话只允许必要认证/自助端点，后端执行；refresh也只能延续受限会话，不能解锁全业务。

原登记可选方案：

- Restrict the session server-side to password change, logout and required self-service endpoints.
- Restrict only sensitive operations with an explicit allowlist.
- Intentionally retain current route-local enforcement and document rationale.

影响：First-login session permissions, account takeover containment, bootstrap UX.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

### D-S01-03 · Binding custom roles to users

关联：B17。责任角色：IAM/security owner、Product owner。状态：PENDING。

先恢复合法角色创建；自定义角色绑定单独批准授予者、可授权限和生命周期，不放宽全局mass-assignment。

原登记可选方案：

- Custom roles cannot be assigned; constrain creation to its intended use.
- Custom roles can be assigned; define permission grant, lifecycle and management policy.
- Only specified administrative roles can assign custom roles.

影响：Role creation and assignment DTOs, permission administration and M-1 role contract.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

### D-S01-04 · Access JWT invalidation after password or privilege changes

关联：N-R02-02、B01。责任角色：Security owner、IAM owner、Product owner。状态：PENDING。

建议安全敏感改密/reset/停用/降权即时撤销；若允许有界延迟，应批准按事件定义的最大时限与TTL。

原登记可选方案：

- Invalidate already-issued access JWTs immediately after password change/reset.
- Allow a bounded grace period with a specified maximum duration.
- Do not actively invalidate; rely on token expiry, with an explicitly approved maximum TTL.

影响：Authentication middleware, session/version/revocation design, password reset exposure window; separately specify disable and role downgrade behavior.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

### D-S01-05 · Registration project visibility and write scope

关联：B21。责任角色：Product owner、Data/privacy owner、M-1 governance approver。状态：PENDING。

建议默认遵循项目成员边界；若确需全局注册视图，只批准最小字段/统计投影，写入另授权。

原登记可选方案：

- Apply the general project membership/capability boundary to all registration routes.
- Allow global read for a defined field/statistics subset; keep writes membership-scoped.
- Allow specified roles broader read/write, enumerating route and field scope.

影响：Registration list/stats/detail/update/stage/profile/export and linked profile, tasks, members and regulatory data; SUPER_ADMIN audit.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

### D-S01-06 · Project manager and ProjectMember consistency

关联：R06-N01、B21。责任角色：Project governance owner、Product owner、Technical owner。状态：PENDING。

建议明确managerId与有效MANAGER成员的合同并以共享命令维护；若仅展示字段则不能隐式授予权限。

原登记可选方案：

- managerId must identify an active ProjectMember with MANAGER role.
- A manager may be a non-member; define whether managerId grants any visibility or capability (recommended explicit no implicit grant).
- managerId is display metadata only; authorization derives exclusively from ProjectMember.

影响：Project and registration create/update, HTTP/sync behavior, membership roles, visibility and transfer atomicity.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

### D-S01-07 · Report submit and resubmit source states

关联：B10。责任角色：Report workflow product owner、Audit/compliance owner。状态：PENDING。

建议明确DRAFT/NEEDS_REVISION等允许来源，same-key replay与new-key resubmit分开；是否允许SUBMITTED新版本须产品裁定。

原登记可选方案：

- Allow submit only from DRAFT and NEEDS_REVISION.
- Allow resubmit from SUBMITTED under a defined version/update rule; distinguish same-key replay from a new-key command.
- Approve another explicit transition table and reviewer concurrency behavior.

影响：Report submit/version snapshots, resubmission UX, approval workflow and audit evidence.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

### D-S01-08 · Task parent, phase, dependency DAG and soft-delete invariants

关联：B19、B20、B07、B08。责任角色：Project governance owner、Data architecture owner、Technical owner。状态：PENDING。

建议同项目关系为必需；DAG、live-parent/phase、soft-delete/restore及物理级联另列完整不变量，历史异常不能自动删除。

原登记可选方案：

- Require task parent and phase same-project/live references, enforce an acyclic dependency DAG, and define aggregate tombstone/restore behavior.
- Require same-project references, preserve/label existing cycle and soft-delete anomalies during staged cleanup, and define DAG enforcement scope.
- Approve another explicit relation and tombstone contract, including physical delete and offline sync propagation.

影响：HTTP/sync commands, schema constraints, recursive deletion, restore, existing data migration and offline caches.

批准记录至少包含decision ID、目标行为/边界、生效客户端/版本、批准者角色、日期及对签署规则的变更引用；未批准部分不得计入修复验收通过。

## 需要在实施设计阶段定稿的技术选择

以下不是新增审计发现；它们是执行现有修复所需的合同。可以分包定稿，不能把提案当已实现能力。

|设计ID|提案与必须回答的问题|关联包|批准/确认角色|
|---|---|---|---|
|T-RP-01|旧IDB无owner行保全隔离，禁止自动归属；认领依据、导出最小化、保留/放弃流程明确。无法可靠认领时保留隔离而不代发。|RP11|产品/数据所有者/前端负责人|
|T-RP-02|receipt actor/resource/command/key/hash作用域，device是否属于scope、canonical hash版本、replay容忍和保留窗；保留期覆盖最大支持离线重试及故障窗，不任意写固定天数。|RP09/RP12/RP13|后端/产品/运维负责人|
|T-RP-03|受支持客户端和modern revision必需策略；旧客户端升级/适配截止、缺基线冲突响应；不能默许永久last-write-wins。|RP10|产品/前后端负责人|
|T-RP-04|提交可见watermark：先完成屏障语义证据，再决定snapshot/log方案。建议事务outbox+持锁提交的发布水位，需证明并发、晚提交、发布失败和保留窗。|RP13|数据库/架构负责人|
|T-RP-05|INFECTED所有字节出口阻断；FAILED/SKIPPED处置、SUPER_ADMIN elevated权限与敏感审计明确。元数据允许不等于字节读取允许。|RP14|安全/文件负责人|
|T-RP-06|JSON restore merge/partial-replace、unique/FK冲突、实际count和不支持模块合同；推荐意外冲突整批rollback，不静默skip。|RP16|数据库/备份产品负责人|
|T-RP-07|stale delete是否冲突、repeated tombstone返回、墓碑保留与离线最长窗口；建议使用revision冲突并对same-key replay稳定返回。|RP05/RP09/RP10/RP13|产品/同步负责人|
|T-RP-08|CORS旧新变量冲突/弃用和export旗标的实际受权行为；配置schema由应用与preflight共用，批准兼容窗口。|RP18|安全/发布负责人|

## 31 项开放事项的局部门禁

原ID全部保留，S03-OI-06复用D-S01-04，S03-OI-07复用D-S01-06，S03-OI-08仅状态部分复用D-S01-07，不重复计成新finding。

|原ID|门禁类型|受影响包|阻塞范围/解除条件|
|---|---|---|---|
|S00-OI-01|NON_BLOCKING_ARCHIVE|RP00|不阻塞任何业务修复；有界查找留存日志，仍无值则记录不可恢复；不能推断旧startHead。|
|D-S01-01|IMPLEMENTATION_DECISION|RP01|账号管理保护合同；批准actor-target等级与紧急恢复流程。|
|D-S01-02|IMPLEMENTATION_DECISION|RP01|服务端强制改密限制；批准mustChangePassword端点allowlist。|
|D-S01-03|IMPLEMENTATION_DECISION|RP01|只阻塞绑定扩展，不阻塞B17创建DTO纠错；批准custom role绑定与授权生命周期。|
|D-S01-04|IMPLEMENTATION_DECISION|RP03|会话撤销设计；批准按事件区分的access/refresh失效时限。|
|D-S01-05|IMPLEMENTATION_DECISION|RP06 / RP08|注册scope与相关同步投影；批准registration全局例外的角色/字段/操作范围。|
|D-S01-06|IMPLEMENTATION_DECISION|RP07 / RP06|manager子任务；不阻塞已有状态权限修复；批准manager与活跃MANAGER成员的一致性/转移合同。|
|D-S01-07|IMPLEMENTATION_DECISION|RP10|新复提状态行为；同修订snapshot仍可设计；批准submit/resubmit来源状态及同key/newkey区分。|
|D-S01-08|IMPLEMENTATION_DECISION|RP05 / RP15 / RP13|完整删除/关系迁移，跨项目拒绝防护可先设计；批准DAG/live references、软删恢复与tombstone合同。|
|S02-OPEN-01|PACKAGE_ACCEPTANCE|RP11|F01 browser验收；临时浏览器慢/me及离线刷新测试证明payload不丢。|
|S02-OPEN-02|PACKAGE_ACCEPTANCE|RP11 / RP08|F03真实消费者验收；实际Tasks fallback A/B共享项目页面只显示当前授权owner缓存。|
|S02-OPEN-03|PACKAGE_ACCEPTANCE|RP11|F02存储验收；真实IDB故障/中止/重开证明最后副本仍可恢复。|
|S02-OPEN-04|ENVIRONMENT_INPUT|RP12|batch字节预算与release验收；取得应用/代理body有效上限及版本，设置可证明预算。|
|S02-OPEN-05|PACKAGE_ACCEPTANCE|RP03|跨tab真实浏览器验收；同origin/storage双tab控制旧失败响应晚到。|
|S02-OPEN-06|PACKAGE_ACCEPTANCE|RP11|N-S02-01生命周期验收；v1/旧v2无owner夹具升级后B绝不代发，保留源payload。|
|S02-OPEN-07|PACKAGE_ACCEPTANCE|RP11|迁移可恢复性；upgrade abort/页面关闭后旧库仍可读取与重入。|
|S03-OI-01|ARCHITECTURE_EVIDENCE_GATE|RP13|最终cursor方案；不阻塞已证分页修复设计；自有PG屏障测试提交可见次序并批准safe-watermark ADR。|
|S03-OI-02|PACKAGE_ACCEPTANCE|RP09|新回执/事务验收；确定性同key竞争核对业务/receipt/两个响应。|
|S03-OI-03|TARGETED_REVIEW_BEFORE_IMPLEMENTATION|RP00 / RP09 / RP12|RP09/RP12不能跳过该项；完成每个500故障点到原key重试/结果查询/持久副本的完整静态合同。|
|S03-OI-04|RELEASE_ENVIRONMENT_GATE|RP09 / RP13|上线replay/日志保留合同；取得实际receipt/change保留作业与最长离线窗并批准策略。|
|S03-OI-05|IMPLEMENTATION_DECISION|RP05 / RP10|删除CAS行为；批准stale delete冲突或delete-wins与重复tombstone结果。|
|S03-OI-06|IMPLEMENTATION_DECISION|RP03|不重复召开独立policy决策；按D-S01-04同一批准失效时限处理。|
|S03-OI-07|IMPLEMENTATION_DECISION|RP07|不重复设计manager invariant；按D-S01-06同一manager规则处理。|
|S03-OI-08|PACKAGE_ACCEPTANCE|RP10|版本并发验收+resubmit规则；并发version屏障证明正确性；来源状态复用D-S01-07裁定。|
|S03-OI-09|TARGETED_REVIEW_BEFORE_IMPLEMENTATION|RP00 / RP10|启用strict CAS前置；完成所有受支持客户端字段/status/assignee revision全链矩阵。|
|S04-OI-01|DATA_MIGRATION_GATE|RP15|只阻塞存量清理与DBconstraint上线，不阻塞RP05应用防护；获准只读副本统计实际异常并签署处置/锁兼容方案。|
|S05-OI-01|PACKAGE_ACCEPTANCE|RP17|D01平台验收；目标Linux/文件系统/cp/rsync两轮manifest与failure演练。|
|S05-OI-02|CANDIDATE_ADJUDICATION_GATE|RP19|R12-N01不得自动当确认缺陷；查外部写屏障/快照，再做合成DB/files配对恢复；保持候选属性。|
|S05-OI-03|PACKAGE_ACCEPTANCE|RP16|B13修复验收，不要求先重跑整套历史审计；隔离DB真实count/全unique/FK/preview-apply竞争验收。|
|S05-OI-04|RELEASE_ENVIRONMENT_GATE|RP18 / RP19|生产发布验收；隔离candidate/config/rollback目标环境，保存build/log/schema。|
|S05-OI-05|RELEASE_RUNBOOK_GATE|RP18 / RP19|生产切流/rollback准备；取得/批准非敏感当前§13 runbook与schema兼容步骤。|

## 判定与不阻塞关系

- 两项 TARGETED_REVIEW_BEFORE_IMPLEMENTATION 是实际未完成静态问题，必须先在RP00形成对应合同/矩阵。不能以缺环境无限延后。
- PACKAGE_ACCEPTANCE/目标环境项允许先设计和编码，但对应风险的验收、发布不能越过未运行状态。
- DATA_MIGRATION_GATE只限制历史数据处置和constraint上线；新增写入口guard可以独立前进。
- NON_BLOCKING_ARCHIVE不影响当前可核对基线上的修复，但原审计元数据继续UNKNOWN，不修改为已恢复。
- CANDIDATE_ADJUDICATION_GATE保持R12-N01候选属性；可靠性设计不自动证明原风险发生。

