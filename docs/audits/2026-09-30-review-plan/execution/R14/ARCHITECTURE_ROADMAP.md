# 架构优化路线图（R14）

本文件是基于当前基线证据的设计方案，不是实施承诺或系统验收。建议保持模块化单体，以共享命令与明确事务边界收敛 HTTP、sync、文件和后台操作，再评估是否需要拆服务。

## 阶段 0：规则裁定与证据/止损准备

**目标：** 在改权限与数据前确定需要保护的不变量和部署恢复边界。

- 裁定管理员是否可重置同级/更高等级账号、password change/reset 后 access JWT 的失效时限、custom role 是否可绑定用户。
- 裁定 registration 项目是否全局可见、managerId 是否强制对应活跃 MANAGER 成员、任务可否指向已软删 phase/parent、任务依赖是否必须为 DAG。
- 明确报告复提来源状态、项目状态转换表、离线冲突/拒绝保留期与逐条结果查询方式。
- 为备份建立配对恢复点责任人、写入冻结或版本快照机制；先在目标 Linux 隔离目录验证 D01，再评估现存备份。
- 只读盘点异常 parent/dependency/FK/file 引用数据；没有批准前不清理、不覆盖。

**退出条件：** 各规则有负责人批准的明确决策；修复前数据快照/备份可验证；针对每个 P1 定义隔离验收场景、回滚/补偿路径和所有者。

## 阶段 1：权限边界与数据保全止损

**范围：** B01、B02、B04、B09、B11、B21、F01、F02、D01；同时处理经阶段0确认的N-R02-02策略。

- 服务端统一 actor/target rank 检查与受保护账号规则；强制改密账号仅可调用必要认证端点。
- 嵌套项目更新改为按子实体的显式 create/update/delete 差量命令，删除权限和同步墓碑一致。
- 注册项目所有入口共用项目 scope/capability 决策；如需全局例外，分离字段范围与显式审计。
- HTTP 与 sync 共用项目状态转换和负责人成员转移命令；sync pull 按实体权限过滤并对 ACL 变更做缓存失效/回填。
- 所有文件字节读取复用统一策略，涵盖 scanStatus、软删、scope、elevated审计。
- bootstrapping 与显式登出分开；冲突/拒绝移动在 IndexedDB 单事务内完成，确保原 outbox 在持久化前不删除。
- 备份先修复快照不可变发布，并在目标 Linux 两轮变更演练通过后才动历史/生产快照。

**兼容/风险：** 注册页面、嵌套数组 API、旧客户端缓存/outbox、文件别名和管理员运维操作均可能依赖现状。先保留兼容适配层和只读遥测，禁止静默丢弃离线草稿。

**退出条件：** 未授权入口的数据库无副作用；所有业务/文件出口共享策略；历史浏览器 outbox 可迁移；两轮备份首份内容不变且 DB/文件配对核对通过。

## 阶段 2：统一命令、修订、审计和单项事务

**范围：** B03、B06、B10、B16、B18、R06-N01、N-R02-02（若立即撤销策略获批）。

- 建立 typed command 层：HTTP/sync 只做认证、解析和适配；命令接收明确 actor、resource、expectedRevision 与事务 client。
- 将单 mutation 业务写、CAS、必要审计和作用域/载荷绑定 receipt 放入同一 Prisma transaction；保留 sync 每条 mutation 部分成功，不强制整批全有全无。
- 报告 submit 在事务内重读来源状态与 revision，版本快照从同一成功 CAS 修订生成；审查、驳回、复提明确状态边。
- 项目创建聚合校验通过后一次提交主对象及子对象；提交幂等键与失败恢复有稳定契约。
- manager transfer 原子维护 Project.managerId 与 ProjectMember；status/managerId 从通用字段中移除。
- 任务命令把 expectedRevision 用于普通字段、状态、指派和状态 PATCH。
- 认证 session version/revocation 方案只在策略定下后实施，并覆盖密码修改、重置与密钥泄露应急。

**兼容/风险：** 幂等 receipt 作用域/hash 变化要兼容旧 key；事务扩大可能增加锁时长；旧 API 缺 revision 需定版本策略，不能悄悄切换成永远覆盖或全部拒绝。

**退出条件：** 确定性故障注入证明单项数据、审计、receipt 同时提交或同时回滚；并发旧 revision 返回冲突；失败后同一 key 可恢复单项结果。

## 阶段 3：离线同步协议重构

**范围：** B04、B05、B06、B07、B08、F03、F04 及 R06-N01。

- 以稳定复合游标（时间/ID 或持久 change sequence）分页每个实体与 tombstone，固定上界；仅当全部流到达上界后提交 checkpoint。
- 对新授权项目做显式 snapshot/backfill；权限撤销按实体/投影删除本地镜像并绑定 ACL version。
- sync mutation receipt 绑定 actor/device/resource/op/key/canonical payload hash；授权先于 replay，旧无作用域回执设迁移与过期策略。
- 客户端记录每条 outcome；按 count 与 byte 限额分批，只有已确认项才从 outbox 状态转移；定义超时、缺失/重复结果、依赖排序及 dead-letter 恢复。
- IndexedDB records/outbox 使用主体命名空间或必传 owner filter；迁移保留未同步旧记录且中断可重入。

**兼容/风险：** 旧游标语义无法与复合游标直接比较，需要版本化 init/sync 协议和一次受控全量快照；客户端升级期间需保留旧版本兼容或强制升级策略。

**退出条件：** 超限数据完整分页；并发提交不会落到 checkpoint 之后却被跳过；A/B账号缓存隔离；501+条与字节超限可推进；故障恢复不丢 payload。

## 阶段 4：关系模型、软删和文件恢复合同

**范围：** B13、B19、B20、B12、F03（若未在阶段3完整解决）。

- 定义 Project/Phase/Task/Dependency 同项目复合关系和 DAG 策略；先只读扫描异常边，再修复/隔离；之后加入应用命令与数据库约束。
- 明确软删、恢复、关联墓碑、物理 FK cascade 的各自职责；普通列表/搜索/统计/sync 共用 alive scope。
- backup restore 的 schema registry 覆盖唯一键/复合键/FK；禁止静默 skipDuplicates，返回实际 DB 计数与恢复后外键/文件清单对账。
- 文件 metadata 与 binary 使用 manifest/checksum 配对；统一 FileRead/restore policy。

**兼容/风险：** 复合 FK/index migration 需估算锁和历史异常修复；禁止未经业务审批自动重挂父子边或永久删除异常任务。

**退出条件：** 只读扫描结果有人签收；数据修复可重复且有备份/回滚；约束上线前异常计数归零或被显式隔离；restore 报告计数与 DB 实际一致。

## 阶段 5：候选发布与灾备演练固化

**范围：** D02、D03、D01、B13 与 R12-N01（判定后）。

- 拆分 host preflight 与 candidate artifact gate；候选在迁移前校验，门禁、构建、smoke、ready 均记录同一 commit/build ID。
- 应用与 preflight 使用同一类型化 config schema；启动时拒绝不一致或危险默认值；未消费开关删除或接上真实受权行为。
- migration 用 expand/contract，注明最早/最晚兼容版本和不可逆转换补偿；不以 migrate down 代替回滚计划。
- 发布失败保留前后 release、DB revision、备份 manifest 与人工回滚步骤；在隔离目标 Linux 演练软链/服务/代理/日志/数据兼容。
- 对 DB 与文件快照写入共同 runId、边界与 hash；恢复演练验证双轮 add/change/delete 和引用完整性。

**退出条件：** candidate-only 失败在迁移/切流前阻断；build 指纹闭环；目标 Linux 回滚与配对恢复演练通过；真实配置经受控脱敏核对。

## 横向工程约束

- 先模块化单体，不按当前证据引入微服务或更换数据库。
- 每个跨模块命令定义授权输入、数据 revision、事务 client、审计等级、receipt 和失败语义。
- P1 按数据/权限风险优先；P2 可随同根因包处理；修复验收必须反转旧缺陷断言，不把“旧复现成功”当修复通过。
- 迁移、生产数据修复、发布和恢复需独立变更审批及可复核证据，本次审阅不执行这些动作。
