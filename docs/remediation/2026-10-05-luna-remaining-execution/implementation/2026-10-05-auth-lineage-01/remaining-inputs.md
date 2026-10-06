# 剩余实施与解除条件

54任务：22 COMPLETE / 2 IN_PROGRESS / 30 NOT_STARTED。剩余32=30必要项+2可选未激活项。这里记录实际门禁，不因nextReadyTask为空放弃独立工作；重新核对所有54项后，当前没有满足精确scope的READY_STANDARD。

## 推荐下一条关键路径

先对 T-RP-02 形成可审查的具体回执合同：key作用域、payload hash算法/冲突、500与未知提交状态、保留期限、重放仍需当前授权、同事务失败回滚、客户端恢复行为。原窗口C与RP00-T02是来源，当前不是已批准合同。它优先关联RP09-T01/T02与RP04/RP10联合验收；删除适配器范围若改变，另按T-RP-07/S03-OI-05条件门禁判断，不把整包门禁扩大为全局。然后按T-RP-04+T-RP-12准备同步水位/撤权缓存与RP11；D-S01-04的access撤销政策另裁定，不默认随本轮认证刷新批准。

T-RP-09本次批准的精确范围只有RP02-T02/RP03-T01；同决策其它任务不能假定业务政策已批准。其他18条未选定决定保留原状态。真实支持客户端/legacy矩阵（RP10-T01）、数据所有者只读快照（RP15-T01）、候选/目标环境与发布材料仍由实际来源提供，执行者不补造。

## 逐项剩余表

|任务|状态与类型|未满足实施依赖|适用实施门禁/具体解除条件|后续验收/发布边界|
|---|---|---|---|---|
|RP01-T02|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|D-S01-01（always）; D-S01-02（only forced-password-change/business allowlist sub-scope; rank/reset protection uses D-S01-01 independently）|见原任务卡；未部署|
|RP01-T03|NOT_STARTED / OPTIONAL_NOT_ACTIVATED|无|D-S01-03（always）|见原任务卡；未部署|
|RP03-T02|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|D-S01-04（always）; T-RP-09（always）; S03-OI-06（same D-S01-04 approval; no second approval required）|见原任务卡；未部署|
|RP05-T02|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|D-S01-08（always）; T-RP-07（always）; S03-OI-05（only if stale/delete command adapter is changed; no gate on unrelated task fields or report snapshot）|见原任务卡；未部署|
|RP05-T03|NOT_STARTED / OPTIONAL_NOT_ACTIVATED|RP05-T02|D-S01-08（DAG/live policy approved）|T-RP-11/VALIDATION（always）|
|RP06-T01|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|D-S01-05（always）|见原任务卡；未部署|
|RP06-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP06-T01, RP07-T02|D-S01-06（always）|见原任务卡；未部署|
|RP07-T02|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|D-S01-06（always）; S03-OI-07（same D-S01-06 approval; no second approval required）|见原任务卡；未部署|
|RP08-T02|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|T-RP-04（always）; T-RP-12（always）|S02-OPEN-02/VALIDATION（joint authorized cache/page fallback acceptance）|
|RP09-T01|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|T-RP-02（always）; T-RP-07（delete command adapter modified）; S03-OI-05（only if stale/delete command adapter is changed; no gate on unrelated task fields or report snapshot）|见原任务卡；未部署|
|RP09-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP09-T01|T-RP-02（always）|S03-OI-02/VALIDATION（always）; S03-OI-04/RELEASE（always）|
|RP10-T01|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|T-RP-03（always）; S03-OI-05（only if stale/delete command adapter is changed; no gate on unrelated task fields or report snapshot）|见原任务卡；未部署|
|RP11-T01|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|T-RP-09（always）; T-RP-12（always）|S02-OPEN-01/VALIDATION（always）; S02-OPEN-02/VALIDATION（always）|
|RP11-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP11-T01|T-RP-01（always）|S02-OPEN-06/VALIDATION（always）; S02-OPEN-07/VALIDATION（always）|
|RP11-T03|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP11-T01|T-RP-12（always）|S02-OPEN-03/VALIDATION（always）|
|RP12-T01|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP11-T01|T-RP-11（always）|S02-OPEN-04/VALIDATION（always）|
|RP12-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP12-T01, RP09-T01, RP11-T03|T-RP-02（always）; T-RP-12（always）|见原任务卡；未部署|
|RP13-T03|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP09-T01, RP08-T02, RP11-T02|T-RP-04（always）; T-RP-10（always）; D-S01-08（only when approved delete/live-reference/tombstone semantics are changed）|S03-OI-04/RELEASE（always）|
|RP15-T01|IN_PROGRESS / NEEDS_OWNER_READ_ONLY_DATA|无|所有者批准只读数据快照|S04-OI-01/VALIDATION（always）|
|RP15-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP15-T01|D-S01-08（always）; T-RP-11（always）|见原任务卡；未部署|
|RP15-T03|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP15-T02|D-S01-08（always）|T-RP-11/VALIDATION（always）|
|RP16-T01|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|T-RP-06（always）|见原任务卡；未部署|
|RP16-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP16-T01|T-RP-06（always）|S05-OI-03/VALIDATION（always）|
|RP16-T03|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP16-T02|T-RP-10（always）|见原任务卡；未部署|
|RP17-T02|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|T-RP-11（always）|见原任务卡；未部署|
|RP17-T03|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP17-T02|可选扩展未激活|S05-OI-01/VALIDATION（always）|
|RP18-T01|NOT_STARTED / APPLICABLE_SCOPE_DECISION_PENDING|无|T-RP-08（always）; T-RP-09（always）|见原任务卡；未部署|
|RP18-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP18-T01|T-RP-13（always）|S05-OI-05/RELEASE（always）|
|RP18-T03|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP18-T02|T-RP-08（always）|S05-OI-04/VALIDATION（always）|
|RP19-T02|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP17-T02, RP18-T01|T-RP-10（always）|S05-OI-02/VALIDATION（always）|
|RP19-T03|NOT_STARTED / IMPLEMENTATION_DEPENDENCY_PENDING|RP18-T02, RP17-T03|T-RP-13（always）|S05-OI-04/RELEASE（always）; S05-OI-05/RELEASE（always）|
|RP19-T04|IN_PROGRESS / FINAL_RECONCILIATION_PENDING_PLAN_ACCEPTANCE|无|全局验收与结项证据，不能代替实质实现|见原任务卡；未部署|

每条condition按实际申请的子范围判定；验收依赖不阻止独立实现。T-RP-09涉及更宽任务时须覆盖该具体scope；这不撤销已批准的两个任务。
