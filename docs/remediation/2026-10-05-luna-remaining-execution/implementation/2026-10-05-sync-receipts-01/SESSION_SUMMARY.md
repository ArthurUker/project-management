# RP09 scoped local execution — final delivery

## Approval and scope

郭仁康 / 研发副总监批准 T-RP-02-SCOPED-RESERVATION-V1（RP09-T01/T02）及 T-RP-07-SYNC-DELETE-WINS-V1（RP09-T01 sync delete only）。来源见 approval.json；两份具体合同并未批准其它业务决定。仅串行执行两个子任务，保护启动时全部未提交差异。

## Delivered implementation

- RP09-T01：不可变 actor/device/resource/key/hash/version 预约；当前授权、共享命令/CAS、严格审计和 applied receipt 在调用者单项事务内完成；禁止外层 catch SQL 后继续提交。
- RP09-T02：原回执查询/过期/未知处理；同键并发、异载荷隔离、可序列化有限重试、真实提交后响应丢失恢复；绝不自动重预约或生成新键。
- Receipt 有效窗固定24小时，不因重试更新。权限撤销后不回放旧成功正文；软删项目的当前可见性丧失时查询 unknown。
- SyncMutation 只加四个 nullable 字段，保留旧记录/旧唯一键，无旧行自动回填。迁移仅在自有临时库执行。
- 六个允许文件详见 evidence/final-source-hashes.json；既有256源码/测试/配置的额外漂移为0，冻结2733文件漂移为0。

## Validation and limits

- 新协议正式套件30/30 +22/22；T01在最终当前源码重新30/30。真实自有PostgreSQL；实际登录/Bearer及HTTP断连证据在T02。不以mock/401/空库替代。
- 旧选定回归：单元/契约83/93，八套集成59/68，总142/161、19失败，4组仍旧wire。CI=FAIL。未修改旧正式测试；新v1等效用例不能使旧CI自动通过。
- 事务外root DB写入语义负对照：3条预期断言失败、27跳过，揭示部分持久化，非产品PASS。
- 每次owned run的build/typecheck/undefined/diff检查退出0，全部20次owned run的guard drop/cluster stop退出0；临时根与dist不存在。失败原始attempt全保留。
- 早期attempt未逐次保存当时源码字节；存在原始日志、持久状态、启动副本和最终hash。不得声称早期每一attempt的源码hash均可独立复算。
- 旧前端尚未接入预约协议：旧push明确426 UPGRADE_REQUIRED；RDPMS_SYNC_WRITE_DISABLED=true时reserve/push503、合法query可读。该控制已本地验证，未在目标环境设置。
- 前端IDB/UI、客户端联合验收、目标迁移/回滚/恢复/保留策略与部署未运行；independentReview=PENDING，release=NOT_EVALUATED。

## Current programme state

54任务：24 COMPLETE /2 IN_PROGRESS /28 NOT_STARTED；本地验证16 PASS /31 NOT_RUN /7 ENV_BLOCKED。306验收：100 PASS /181 NOT_RUN /25 ENV_BLOCKED。剩余30实施项（28必需+2未激活可选），不计为全部结束。

RP09包仍IN_PROGRESS；B05/B06仍SUPPORTED，跨客户端及目标范围未关闭。PAC-RP09-05整体NOT_RUN（后端过期证据不替代客户端最后副本验证）。其它PC联合验收未扩大。

11项适用具体决定尚待确定、15项实施依赖未完成、1项需数据所有者只读快照、1项最终对账、2项可选未激活。task-readiness.json以implementationDependencies和精确scope判断；验收依赖不作为实施依赖。

## Entry and next steps

先读REVIEW_ENTRY.md和handoff.md，再查两任务acceptance及validation-addendum、regression-classification、最终源码hash、正式run结果。不得因本地PASS直接部署。封存payload覆盖本session及两个任务run，不把仍会变化的原计划台账纳为不可变payload；封存时台账hash独立绑定。
