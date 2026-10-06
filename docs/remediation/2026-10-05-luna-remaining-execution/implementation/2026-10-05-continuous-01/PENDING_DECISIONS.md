# 尚待负责人填写的决定

本地连续执行已获授权；以下字段是产品/安全/数据/技术规则，不由执行者代签。只需先解除一个具体任务，不要求先批完21项。

## D-S01-01

状态：PENDING；负责人职责：Product owner / Security owner / System governance approver。

范围：Reset, enable, disable and delete routes; SUPER_ADMIN recovery and account governance.

受影响任务：RP01-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. Forbid reset/disable of equal or higher-ranked accounts; define separate emergency flow.
2. Allow only explicitly ranked superior roles, with approval and audit requirements.
3. Keep permission-only control as an intentional policy, with explicit scope.

## D-S01-02

状态：PENDING；负责人职责：Security owner / Product owner。

范围：First-login session permissions, account takeover containment, bootstrap UX.

受影响任务：RP01-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. Restrict the session server-side to password change, logout and required self-service endpoints.
2. Restrict only sensitive operations with an explicit allowlist.
3. Intentionally retain current route-local enforcement and document rationale.

## D-S01-03

状态：PENDING；负责人职责：IAM/security owner / Product owner。

范围：Role creation and assignment DTOs, permission administration and M-1 role contract.

受影响任务：RP01-T03。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. Custom roles cannot be assigned; constrain creation to its intended use.
2. Custom roles can be assigned; define permission grant, lifecycle and management policy.
3. Only specified administrative roles can assign custom roles.

## D-S01-04

状态：PENDING；负责人职责：Security owner / IAM owner / Product owner。

范围：Authentication middleware, session/version/revocation design, password reset exposure window; separately specify disable and role downgrade behavior.

受影响任务：RP03-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. Invalidate already-issued access JWTs immediately after password change/reset.
2. Allow a bounded grace period with a specified maximum duration.
3. Do not actively invalidate; rely on token expiry, with an explicitly approved maximum TTL.

## D-S01-05

状态：PENDING；负责人职责：Product owner / Data/privacy owner / M-1 governance approver。

范围：Registration list/stats/detail/update/stage/profile/export and linked profile, tasks, members and regulatory data; SUPER_ADMIN audit.

受影响任务：RP06-T01、RP08-T01。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. Apply the general project membership/capability boundary to all registration routes.
2. Allow global read for a defined field/statistics subset; keep writes membership-scoped.
3. Allow specified roles broader read/write, enumerating route and field scope.

## D-S01-06

状态：PENDING；负责人职责：Project governance owner / Product owner / Technical owner。

范围：Project and registration create/update, HTTP/sync behavior, membership roles, visibility and transfer atomicity.

受影响任务：RP06-T02、RP07-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. managerId must identify an active ProjectMember with MANAGER role.
2. A manager may be a non-member; define whether managerId grants any visibility or capability (recommended explicit no implicit grant).
3. managerId is display metadata only; authorization derives exclusively from ProjectMember.

## D-S01-07

状态：PENDING；负责人职责：Report workflow product owner / Audit/compliance owner。

范围：Report submit/version snapshots, resubmission UX, approval workflow and audit evidence.

受影响任务：RP10-T02、RP10-T03。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. Allow submit only from DRAFT and NEEDS_REVISION.
2. Allow resubmit from SUBMITTED under a defined version/update rule; distinguish same-key replay from a new-key command.
3. Approve another explicit transition table and reviewer concurrency behavior.

需写来源状态表、same-key已提交结果重放与new-key复提区别、review并发/版本/审计规则。仅DRAFT/NEEDS_REVISION来源是已提交待确认的候选，不能自动启用。

## D-S01-08

状态：PENDING；负责人职责：Project governance owner / Data architecture owner / Technical owner。

范围：HTTP/sync commands, schema constraints, recursive deletion, restore, existing data migration and offline caches.

受影响任务：RP05-T02、RP05-T03、RP13-T03、RP15-T02、RP15-T03。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

原选项：
1. Require task parent and phase same-project/live references, enforce an acyclic dependency DAG, and define aggregate tombstone/restore behavior.
2. Require same-project references, preserve/label existing cycle and soft-delete anomalies during staged cleanup, and define DAG enforcement scope.
3. Approve another explicit relation and tombstone contract, including physical delete and offline sync propagation.

## T-RP-01

状态：PROPOSED；负责人职责：产品/数据负责人 / 前端负责人。

范围：无可靠owner行隔离，认领不能从首个登录/内容猜测；导出和保留须获准。

受影响任务：RP11-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-02

状态：PROPOSED；负责人职责：后端/产品/运维负责人。

范围：actor/resource/command/key/hash、device/hash版本、unknown/expired、replay查询和最大离线窗。

受影响任务：RP09-T01、RP09-T02、RP12-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-03

状态：PROPOSED；负责人职责：产品/前后端负责人。

范围：支持版本、missing base/409提示、字段/status/assignee链、升级截止。

受影响任务：RP10-T01。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-04

状态：PROPOSED；负责人职责：数据库/架构负责人。

范围：方案先用barrier证明；source revision/epoch、有序发布/ACL、snapshot边界和保留/RESET合同。

受影响任务：RP08-T02、RP13-T02、RP13-T03。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-05

状态：PROPOSED；负责人职责：安全/文件负责人。

范围：INFECTED阻断固定；FAILED/SKIPPED、metadata/字节以及敏感/拒绝审计合同。

受影响任务：RP14-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

需逐状态填写 CLEAN/INFECTED/FAILED/SKIPPED/PENDING/未知或legacy空值的metadata、字节读取、delete规则；elevated是否绕过（INFECTED固定阻断）、拒绝审计和失败语义。尚未批准。

## T-RP-06

状态：PROPOSED；负责人职责：数据库/备份负责人。

范围：JSON模块完整unique/FK、merge/replace、count和提交后核查失败状态；与整库/文件DR区分。

受影响任务：RP16-T01、RP16-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-07

状态：PROPOSED；负责人职责：产品/同步负责人。

范围：stale delete、同key重复、restore/移动scope和保留窗，不能漏sync适配。

受影响任务：RP05-T02、RP09-T01。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-08

状态：PROPOSED；负责人职责：安全/发布负责人。

范围：来源/冲突/弃用、CORS/export真实消费、编译config CLI和运行app一致。

受影响任务：RP18-T01、RP18-T03。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-09

状态：PROPOSED；负责人职责：安全/认证/前端负责人。

范围：核对实际Bearer/body refresh；cookie旗标不证明已支持cookie。token generation、两tab成功/失败及原请求actor不越界。

受影响任务：RP00-T04、RP02-T02、RP03-T01、RP03-T02、RP11-T01、RP18-T01。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-10

状态：PROPOSED；负责人职责：数据/安全/同步负责人。

范围：dataset epoch、旧会话/receipt/cursor/family撤销或隔离、草稿保全及重新授权/数据迁移后的日志切点。

受影响任务：RP13-T02、RP13-T03、RP16-T03、RP19-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-11

状态：PROPOSED；负责人职责：数据库/前端/运维负责人。

范围：DB锁/timeout/死锁重试、DAG递归、IDB quota、publisher lag/热水位、body预算、备份容量和目标FS。

受影响任务：RP00-T05、RP05-T03、RP12-T01、RP15-T02、RP15-T03、RP17-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-12

状态：PROPOSED；负责人职责：产品/数据/前端负责人。

范围：conflict/dead-letter/unknown/oversize/quarantine的查看、选择、导出和放弃；清理前最后副本不丢，当前授权检查。

受影响任务：RP08-T02、RP11-T01、RP11-T03、RP12-T02。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

## T-RP-13

状态：PROPOSED；负责人职责：技术/安全/发布负责人。

范围：trace/log去敏、授权拒绝、回执、队列、publisher、schema锁、完整恢复点、健康阈值、观察窗和rollback目标。

受影响任务：RP00-T05、RP18-T02、RP19-T03。

待填：选定口径、具名批准人/职责、日期、批准证据、兼容窗口/保留或预算（实际适用者）。

