# Remaining scope and ordered next actions

## Current priorities

1. 先独立复核两RP09任务：业务/审计/回执是否确实同事务，绑定与当前授权、并发/响应丢失证据是否匹配最终源码。
2. 旧正式测试协议迁移：四失败组保留FAIL；下轮先登记精确测试allowlist和共享stub范围，再接入reserve→handle→push→query夹具；保留拒绝负例与竞态语义，不能只把期望改426来消除失败。当前授权六源码文件之外不自动修改。
3. 客户端RP11/RP12：明确T-RP-12本地身份/隔离合同与T-RP-11队列升级合同及T-RP-02客户端scope；实现真实IDB预约持久化、到期最后副本与未知回执恢复。服务端通过不代替客户端验收。
4. RP08-T02需T-RP-04 +T-RP-12具体方案；RP10-T01需受支持部署客户端/legacy矩阵与T-RP-03。复用旧本地代码枚举不声称全部已部署客户端被覆盖。
5. 只读数据任务RP15-T01需要数据所有者批准的快照、字段/脱敏/保留/访问边界；任何批准不凭空产生真实快照。

## Remaining30 tasks

- RP01-T02: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[D-S01-01, D-S01-02].
- RP01-T03: OPTIONAL_NOT_ACTIVATED; implementation dependencies=[none]; scoped gates=[D-S01-03].
- RP03-T02: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[D-S01-04, T-RP-09, S03-OI-06].
- RP05-T02: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[D-S01-08, T-RP-07, S03-OI-05].
- RP05-T03: OPTIONAL_NOT_ACTIVATED; implementation dependencies=[RP05-T02]; scoped gates=[D-S01-08].
- RP06-T01: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[D-S01-05].
- RP06-T02: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP06-T01, RP07-T02]; scoped gates=[D-S01-06].
- RP07-T02: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[D-S01-06, S03-OI-07].
- RP08-T02: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[T-RP-04, T-RP-12].
- RP10-T01: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[T-RP-03, S03-OI-05].
- RP11-T01: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[T-RP-09, T-RP-12].
- RP11-T02: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP11-T01]; scoped gates=[T-RP-01].
- RP11-T03: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP11-T01]; scoped gates=[T-RP-12].
- RP12-T01: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP11-T01]; scoped gates=[T-RP-11].
- RP12-T02: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP12-T01, RP11-T03]; scoped gates=[T-RP-02, T-RP-12].
- RP13-T03: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP08-T02, RP11-T02]; scoped gates=[T-RP-04, T-RP-10, D-S01-08].
- RP15-T01: NEEDS_OWNER_READ_ONLY_DATA; implementation dependencies=[none]; scoped gates=[none].
- RP15-T02: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP15-T01]; scoped gates=[D-S01-08, T-RP-11].
- RP15-T03: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP15-T02]; scoped gates=[D-S01-08].
- RP16-T01: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[T-RP-06].
- RP16-T02: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP16-T01]; scoped gates=[T-RP-06].
- RP16-T03: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP16-T02]; scoped gates=[T-RP-10].
- RP17-T02: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[T-RP-11].
- RP17-T03: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP17-T02]; scoped gates=[none].
- RP18-T01: APPLICABLE_SCOPE_DECISION_PENDING; implementation dependencies=[none]; scoped gates=[T-RP-08, T-RP-09].
- RP18-T02: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP18-T01]; scoped gates=[T-RP-13].
- RP18-T03: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP18-T02]; scoped gates=[T-RP-08].
- RP19-T02: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP17-T02, RP18-T01]; scoped gates=[T-RP-10].
- RP19-T03: IMPLEMENTATION_DEPENDENCY_PENDING; implementation dependencies=[RP18-T02, RP17-T03]; scoped gates=[T-RP-13].
- RP19-T04: FINAL_RECONCILIATION_PENDING_PLAN_ACCEPTANCE; implementation dependencies=[none]; scoped gates=[none].

详见remaining-task-readiness.csv及task-readiness.json。只批准两RP09合同不扩大为任意产品/安全政策批准；条件门禁不扩大成全局障碍。未启动DAG/自定义角色绑定，不自动部署。
