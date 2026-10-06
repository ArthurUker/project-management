# 决策与门禁 v2

共21项设计决定（原8业务决定、13技术决定），均无批准人/日期/证据；31项历史开放项仍OPEN。技术提案不是默认产品需求。条件门禁、任务激活和联合验收以机器登记为准。相同D-S01-04/06批准可同时满足对应历史重复项，不要求再次批准。

## D-S01-01 — Administrative account hierarchy

类型 BUSINESS；状态 PENDING。

范围：Reset, enable, disable and delete routes; SUPER_ADMIN recovery and account governance.。

任务：RP01-T02；联合合同：PC02。

选项/提案：

- Forbid reset/disable of equal or higher-ranked accounts; define separate emergency flow.
- Allow only explicitly ranked superior roles, with approval and audit requirements.
- Keep permission-only control as an intentional policy, with explicit scope.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## D-S01-02 — Server-side boundary for forced password change

类型 BUSINESS；状态 PENDING。

范围：First-login session permissions, account takeover containment, bootstrap UX.。

任务：RP01-T02；联合合同：无。

选项/提案：

- Restrict the session server-side to password change, logout and required self-service endpoints.
- Restrict only sensitive operations with an explicit allowlist.
- Intentionally retain current route-local enforcement and document rationale.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## D-S01-03 — Binding custom roles to users

类型 BUSINESS；状态 PENDING。

范围：Role creation and assignment DTOs, permission administration and M-1 role contract.。

任务：RP01-T03；联合合同：无。

选项/提案：

- Custom roles cannot be assigned; constrain creation to its intended use.
- Custom roles can be assigned; define permission grant, lifecycle and management policy.
- Only specified administrative roles can assign custom roles.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## D-S01-04 — Access JWT invalidation after password or privilege changes

类型 BUSINESS；状态 PENDING。

范围：Authentication middleware, session/version/revocation design, password reset exposure window; separately specify disable and role downgrade behavior.。

任务：RP03-T02；联合合同：PC01。

选项/提案：

- Invalidate already-issued access JWTs immediately after password change/reset.
- Allow a bounded grace period with a specified maximum duration.
- Do not actively invalidate; rely on token expiry, with an explicitly approved maximum TTL.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## D-S01-05 — Registration project visibility and write scope

类型 BUSINESS；状态 PENDING。

范围：Registration list/stats/detail/update/stage/profile/export and linked profile, tasks, members and regulatory data; SUPER_ADMIN audit.。

任务：RP06-T01, RP08-T01；联合合同：PC02。

选项/提案：

- Apply the general project membership/capability boundary to all registration routes.
- Allow global read for a defined field/statistics subset; keep writes membership-scoped.
- Allow specified roles broader read/write, enumerating route and field scope.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## D-S01-06 — Project manager and ProjectMember consistency

类型 BUSINESS；状态 PENDING。

范围：Project and registration create/update, HTTP/sync behavior, membership roles, visibility and transfer atomicity.。

任务：RP06-T02, RP07-T02；联合合同：PC02, PC07。

选项/提案：

- managerId must identify an active ProjectMember with MANAGER role.
- A manager may be a non-member; define whether managerId grants any visibility or capability (recommended explicit no implicit grant).
- managerId is display metadata only; authorization derives exclusively from ProjectMember.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## D-S01-07 — Report submit and resubmit source states

类型 BUSINESS；状态 PENDING。

范围：Report submit/version snapshots, resubmission UX, approval workflow and audit evidence.。

任务：RP10-T02, RP10-T03；联合合同：无。

选项/提案：

- Allow submit only from DRAFT and NEEDS_REVISION.
- Allow resubmit from SUBMITTED under a defined version/update rule; distinguish same-key replay from a new-key command.
- Approve another explicit transition table and reviewer concurrency behavior.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## D-S01-08 — Task parent, phase, dependency DAG and soft-delete invariants

类型 BUSINESS；状态 PENDING。

范围：HTTP/sync commands, schema constraints, recursive deletion, restore, existing data migration and offline caches.。

任务：RP05-T02, RP05-T03, RP13-T03, RP15-T02, RP15-T03；联合合同：PC07。

选项/提案：

- Require task parent and phase same-project/live references, enforce an acyclic dependency DAG, and define aggregate tombstone/restore behavior.
- Require same-project references, preserve/label existing cycle and soft-delete anomalies during staged cleanup, and define DAG enforcement scope.
- Approve another explicit relation and tombstone contract, including physical delete and offline sync propagation.

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-01 — 旧IDB行归属/保全

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：无可靠owner行隔离，认领不能从首个登录/内容猜测；导出和保留须获准。

任务：RP11-T02；联合合同：PC04, PC12。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-02 — 作用域回执和保留窗

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：actor/resource/command/key/hash、device/hash版本、unknown/expired、replay查询和最大离线窗。

任务：RP09-T01, RP09-T02, RP12-T02；联合合同：PC03。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-03 — 客户端revision兼容

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：支持版本、missing base/409提示、字段/status/assignee链、升级截止。

任务：RP10-T01；联合合同：无。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-04 — 提交可见水位和bootstrap

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：方案先用barrier证明；source revision/epoch、有序发布/ACL、snapshot边界和保留/RESET合同。

任务：RP08-T02, RP13-T02, RP13-T03；联合合同：PC05。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-05 — 文件扫描和elevated

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：INFECTED阻断固定；FAILED/SKIPPED、metadata/字节以及敏感/拒绝审计合同。

任务：RP14-T02；联合合同：PC02。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-06 — restore目标范围和冲突

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：JSON模块完整unique/FK、merge/replace、count和提交后核查失败状态；与整库/文件DR区分。

任务：RP16-T01, RP16-T02；联合合同：PC06, PC07。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-07 — 删除revision/墓碑

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：stale delete、同key重复、restore/移动scope和保留窗，不能漏sync适配。

任务：RP05-T02, RP09-T01；联合合同：PC03。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-08 — 配置schema和有效行为

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：来源/冲突/弃用、CORS/export真实消费、编译config CLI和运行app一致。

任务：RP18-T01, RP18-T03；联合合同：PC09。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-09 — 认证transport及跨身份响应

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：核对实际Bearer/body refresh；cookie旗标不证明已支持cookie。token generation、两tab成功/失败及原请求actor不越界。

任务：RP00-T04, RP02-T02, RP03-T01, RP03-T02, RP11-T01, RP18-T01；联合合同：PC01, PC04, PC09。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-10 — 恢复epoch与在线离线状态

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：dataset epoch、旧会话/receipt/cursor/family撤销或隔离、草稿保全及重新授权/数据迁移后的日志切点。

任务：RP13-T02, RP13-T03, RP16-T03, RP19-T02；联合合同：PC05, PC06, PC08。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-11 — 事务/容量/文件系统预算

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：DB锁/timeout/死锁重试、DAG递归、IDB quota、publisher lag/热水位、body预算、备份容量和目标FS。

任务：RP00-T05, RP05-T03, RP12-T01, RP15-T02, RP15-T03, RP17-T02；联合合同：PC07, PC08, PC11。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-12 — 用户可恢复流程与保留

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：conflict/dead-letter/unknown/oversize/quarantine的查看、选择、导出和放弃；清理前最后副本不丢，当前授权检查。

任务：RP08-T02, RP11-T01, RP11-T03, RP12-T02；联合合同：PC04, PC12。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## T-RP-13 — 发布观察与停止条件

类型 TECHNICAL_DESIGN；状态 PROPOSED。

范围：trace/log去敏、授权拒绝、回执、队列、publisher、schema锁、完整恢复点、健康阈值、观察窗和rollback目标。

任务：RP00-T05, RP18-T02, RP19-T03；联合合同：PC10, PC11。

选项/提案：采用上列scope作为待批准设计范围，具体选择由命名负责人填写。

批准记录至少含精确范围、获选方案、责任人/日期、证据、兼容窗及接受的残余风险；当前均为空。

## 历史开放项阶段门禁

|开放项|类型|任务|解除条件|
|---|---|---|---|
|S00-OI-01|NON_BLOCKING_ARCHIVE|RP00-T01|有界查找留存日志，仍无值则记录不可恢复；不能推断旧startHead。|
|D-S01-01|IMPLEMENTATION_DECISION|RP01-T02|批准actor-target等级与紧急恢复流程。|
|D-S01-02|IMPLEMENTATION_DECISION|RP01-T02|批准mustChangePassword端点allowlist。|
|D-S01-03|IMPLEMENTATION_DECISION|RP01-T03|批准custom role绑定与授权生命周期。|
|D-S01-04|IMPLEMENTATION_DECISION|RP03-T02|批准按事件区分的access/refresh失效时限。|
|D-S01-05|IMPLEMENTATION_DECISION|RP06-T01, RP08-T01|批准registration全局例外的角色/字段/操作范围。|
|D-S01-06|IMPLEMENTATION_DECISION|RP06-T02, RP07-T02|批准manager与活跃MANAGER成员的一致性/转移合同。|
|D-S01-07|IMPLEMENTATION_DECISION|RP10-T02, RP10-T03|批准submit/resubmit来源状态及同key/newkey区分。|
|D-S01-08|IMPLEMENTATION_DECISION|RP05-T02, RP05-T03, RP13-T03, RP15-T02, RP15-T03|批准DAG/live references、软删恢复与tombstone合同。|
|S02-OPEN-01|PACKAGE_ACCEPTANCE|RP11-T01|临时浏览器慢/me及离线刷新测试证明payload不丢。|
|S02-OPEN-02|PACKAGE_ACCEPTANCE|RP08-T02, RP11-T01|实际Tasks fallback A/B共享项目页面只显示当前授权owner缓存。|
|S02-OPEN-03|PACKAGE_ACCEPTANCE|RP11-T03|真实IDB故障/中止/重开证明最后副本仍可恢复。|
|S02-OPEN-04|ENVIRONMENT_INPUT|RP12-T01|取得应用/代理body有效上限及版本，设置可证明预算。|
|S02-OPEN-05|PACKAGE_ACCEPTANCE|RP03-T01|同origin/storage双tab控制旧失败响应晚到。|
|S02-OPEN-06|PACKAGE_ACCEPTANCE|RP11-T02|v1/旧v2无owner夹具升级后B绝不代发，保留源payload。|
|S02-OPEN-07|PACKAGE_ACCEPTANCE|RP11-T02|upgrade abort/页面关闭后旧库仍可读取与重入。|
|S03-OI-01|ARCHITECTURE_EVIDENCE_GATE|RP13-T02|自有PG屏障测试提交可见次序并批准safe-watermark ADR。|
|S03-OI-02|PACKAGE_ACCEPTANCE|RP09-T02|确定性同key竞争核对业务/receipt/两个响应。|
|S03-OI-03|TARGETED_REVIEW_BEFORE_IMPLEMENTATION|RP00-T02|完成每个500故障点到原key重试/结果查询/持久副本的完整静态合同。|
|S03-OI-04|RELEASE_ENVIRONMENT_GATE|RP09-T02, RP13-T03|取得实际receipt/change保留作业与最长离线窗并批准策略。|
|S03-OI-05|IMPLEMENTATION_DECISION|RP05-T02, RP09-T01, RP10-T01|批准stale delete冲突或delete-wins与重复tombstone结果。|
|S03-OI-06|IMPLEMENTATION_DECISION|RP03-T02|按D-S01-04同一批准失效时限处理。|
|S03-OI-07|IMPLEMENTATION_DECISION|RP07-T02|按D-S01-06同一manager规则处理。|
|S03-OI-08|PACKAGE_ACCEPTANCE|RP10-T03|并发version屏障证明正确性；来源状态复用D-S01-07裁定。|
|S03-OI-09|TARGETED_REVIEW_BEFORE_IMPLEMENTATION|RP00-T03|完成所有受支持客户端字段/status/assignee revision全链矩阵。|
|S04-OI-01|DATA_MIGRATION_GATE|RP15-T01|获准只读副本统计实际异常并签署处置/锁兼容方案。|
|S05-OI-01|PACKAGE_ACCEPTANCE|RP17-T03|目标Linux/文件系统/cp/rsync两轮manifest与failure演练。|
|S05-OI-02|CANDIDATE_ADJUDICATION_GATE|RP19-T01, RP19-T02|查外部写屏障/快照，再做合成DB/files配对恢复；保持候选属性。|
|S05-OI-03|PACKAGE_ACCEPTANCE|RP16-T02|隔离DB真实count/全unique/FK/preview-apply竞争验收。|
|S05-OI-04|RELEASE_ENVIRONMENT_GATE|RP18-T03, RP19-T03|隔离candidate/config/rollback目标环境，保存build/log/schema。|
|S05-OI-05|RELEASE_RUNBOOK_GATE|RP18-T02, RP19-T03|取得/批准非敏感当前§13 runbook与schema兼容步骤。|
