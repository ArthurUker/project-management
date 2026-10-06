# 修复任务卡（设计交付，R14）

以下任务卡供后续实施拆分。它们不授权本轮改代码、迁移或部署；实施前按阶段0补齐产品决策。

## C01 — 账号等级保护与会话撤销合同

- **关联：** B01、B14、N-R02-02、N-R02-01。
- **目标：** 后端强制操作者/目标等级规则；区分临时锁定与人工停用；明确密码改动后 access/refresh session 时限；跨标签页刷新失败不得清除较新 token。
- **范围：** auth/users/rbac/session model 与前端 token coordination。禁止改动未批准的角色矩阵、seed 权限和实际账号。
- **前置/决策：** 受保护账号列表/等级、force-change endpoint allowlist、即时撤销或最大延迟。
- **不变量：** 密码更新、refresh 撤销、审计结果有一致失败语义；只有当前失败 token 可清除当前客户端状态。
- **验收：** ADMIN→SUPER_ADMIN 拒绝无副作用；锁到期策略正确；旧 access/refresh 按合同失效；双 tab 受控响应顺序保留新 token。
- **回滚/停止：** 保留旧 token schema 读取窗口；若不能证明回滚后旧会话不恢复高权限，停止 rollout。
- **交付证据：** actor×target 矩阵、隔离并发日志、DB 状态前后摘要、浏览器双上下文结果。

## C02 — 项目 scope 与子实体差量命令

- **关联：** B02、B03、B18、B20、B21、R06-N01。
- **目标：** project access decision 分离业务快照；注册项目统一 scope；数组全量替换改为按ID差量；manager/status 语义命令化；列表统计复用活跃项目 scope；项目创建聚合单事务。
- **范围：** projects/registrations routes、project access 和相应 commands。禁止在缺少产品裁定时改 registration 全局可见性或直接 projects.delete 授权。
- **前置/决策：** registration 是否全局可见及字段/写范围；managerId⇄ProjectMember；允许的状态边；嵌套数组 API 兼容策略。
- **不变量：** 每个子项 create/update/delete 独立授权；删除产生正式 tombstone；管理者转移行关系与项目字段同事务；授权投影不被当作完整业务实体。
- **验收：** 无 task delete 权限无法由项目 PUT 删除；列表/详情/统计软删一致；失败创建无半项目；HTTP/sync manager/status 行为一致；非成员 registration 符合裁定。
- **迁移/回滚：** API适配旧客户端；迁移前备份和关联合计；禁止自动丢弃旧数组中的未知 ID。

## C03 — 统一 mutation command、revision 与 receipt

- **关联：** B05、B06、B09、B10、B16、R06-N01。
- **目标：** HTTP/sync 调用同一授权与领域命令；单 mutation CAS、业务数据、必要严格审计、作用域/载荷 hash receipt 同事务提交。
- **范围：** task/report/project commands、idempotency receipt、sync per-item adapter。禁止强制整个 sync batch 单事务。
- **前置/决策：** receipt 兼容/过期策略、旧客户端缺 revision 的版本窗口、report resubmit 状态。
- **不变量：** 相同 scope/key/hash 可重放；错主体/资源拒绝；同 key 不同 hash 冲突；事务失败不会留下业务写但无回执。
- **验收：** commit/read interleaving、receipt/audit fault injection、旧 revision 409、提交快照同修订、部分批次结果可恢复。
- **迁移/回滚：** 新旧回执双读窗口；可回滚版本必须理解已提交记录且不重复执行业务命令。

## C04 — Sync pull checkpoint 与 ACL 版本协议

- **关联：** B04、B07、B08。
- **目标：** 每实体和 tombstone 稳定分页、固定 upper bound；实体权限撤销清缓存；新项目授权有 scoped snapshot/backfill。
- **范围：** sync init/pull、ACL version、IndexedDB cursor。禁止未决数据库语义时直接假定 max(updatedAt) 足够。
- **前置/决策：** 一致性边界选择（数据库快照/持久change log）、权限撤销时本地保留合同。
- **不变量：** 游标只在所有流完成边界后前进；排序键稳定；变更必在当前或下一窗口出现。
- **验收：** 3001+ upsert、5001+ tombstone、相同时间戳、并发提交、入组回填、撤权后缓存清理。
- **迁移/回滚：** cursor versioning；旧客户端完成一次快照后再转新游标；允许重发但不允许漏数。

## C05 — 离线持久层主体隔离与可靠队列

- **关联：** F01、F02、F03、F04。
- **目标：** bootstrapping 与 logout 分离；records/outbox 明确 owner；冲突/拒绝原子移动；count/byte 分批并依赖有序。
- **范围：** frontend offline engine/idb/providers/API DTO。禁止未经保全策略清除无法识别 owner 的旧记录。
- **前置/决策：** 旧 IDB row 所有权、过期 dead letter 保存期、父子依赖失败策略。
- **不变量：** 已确认结果才出队；未确认/冲突 payload 至少有一个持久副本；账号 B 不读取或发送 A 的缓存。
- **验收：** 慢 `/me` 初始启动、logout/login交错、IDB事务中断、501/1001项、字节限额、缺失/重复响应和重启恢复。
- **回滚/迁移：** schema 升级幂等且中断可重入；先复制数据再切命名空间；失败时恢复旧 store。

## C06 — 文件读取统一策略与扫描状态

- **关联：** B11、B12。
- **目标：** 下载、原文件、预览、导出通过共享 FileReadService，统一项目/所有者 scope、软删、scanStatus、elevated policy 与审计。
- **范围：** files/regulatory routes 和 file policy。禁止用真实恶意附件测试或弱化扫描拒绝规则。
- **前置/决策：** SUPER_ADMIN elevated 文件访问是否允许及敏感审计等级；FAILED/SKIPPED 扫描策略。
- **不变量：** 任何别名不得绕过感染阻断；普通非成员保持拒绝；磁盘路径必须在安全存储根下。
- **验收：** INFECTED 无害文本 fixture 所有出口拒绝；普通成员/非成员/超管矩阵一致且有审计结果。
- **回滚：** 先让旧别名转调共享服务，保留 URL contract；回滚不能恢复绕过检查的旧 handler。

## C07 — 数据关系、软删与 restore 对账

- **关联：** B13、B19、B20；依赖 C02/C04。
- **目标：** project-scoped parent/phase/dependency 关系约束；软删/revive/tombstone contract；restore 真实计数与唯一/复合键/FK校验。
- **范围：** schema、相关 migrations、任务命令、backupRestore。禁止本任务自动修复生产异常边或运行 restore。
- **前置/决策：** DAG 是否强制、deleted phase/parent 引用政策、历史异常边处理人、恢复 merge/replace 冲突规则。
- **不变量：** 无跨项目关系；不会因修约束级联删除未授权数据；报告计数等于实际 DB effect；备份/恢复数据有可核对文件引用。
- **验收：** 只读扫描清单签收；隔离库异常边分类；复合约束迁移演练/锁评估；所有 unique/FK冲突显式失败或完整对账。
- **回滚：** expand/validate/contract 分步；先备份；数据修复可逆记录；不得用 skipDuplicates 静默成功。

## C08 — 候选发布、配置和配对灾备

- **关联：** D01、D02、D03、B13、R12-N01（先裁定）。
- **目标：** candidate gate 在迁移前针对候选；运行与预检共用配置 schema；DB/files 共同 runId/manifest；人工 rollback 可重复演练。
- **范围：** deploy scripts、runtime config、backup manifest 与隔离 drill。禁止直接生产发布/恢复或读取未授权明文 secret。
- **前置/决策：** Linux目标环境、外部写入冻结机制、RPO/RTO、release保留数、当前运行配置脱敏核对。
- **不变量：** 失败的候选不迁移/切流；数据库迁移保持上一版兼容窗口；旧备份不可被后续写覆盖；恢复只接受匹配 manifest。
- **验收：** candidate-only gate failure、build identity闭环、两轮文件增删改首快照不变、配对 restore 行/文件引用核对、切回上一 release 并 smoke。
- **回滚/停止：** 任何 dump/hash mismatch、未知 migration compatibility、不能确定 current 目标时停止并保持现有服务/备份不变。
