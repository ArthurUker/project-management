# 跨包合同 v2

这些是本轮补齐的拟议设计和未来验收要求，不构成新增已确认产品缺陷。联合合同可以阻塞相关验收/发布；任务先后仅按TASK_GRAPH中的implementationDependencies。共享文件由启动时指定的owner协调，禁止并行覆盖。

## PC01 — 认证刷新、身份代际与请求重放

参与包：RP01, RP02, RP03, RP11, RP18。任务：RP00-T04, RP02-T02, RP03-T01, RP03-T02, RP11-T01, RP18-T01。

关联决定/开放项：T-RP-09, D-S01-04。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

先登记真实Bearer/body refresh调用链与配置消费；刷新请求、成功/失败响应、原始待重放请求都绑定发起时actor/session generation。两tab并发不会清除已轮换会话，A的旧成功响应不能覆盖B，A的原请求不能带B凭据执行。服务端CAS/family重放策略与客户端并发/重试窗口共同批准。 明确401/403/网络离线分别处理；权限拒绝不能通过旧缓存回退绕过当前授权。

### 未来验收

屏障控制双tab同family刷新、旧失败、旧成功、退出/切换B及原请求重放；核对双方token generation、DB会话、实际request actor，日志不记录token。

场景：INT-PC01-01

## PC02 — 当前授权与内部业务快照

参与包：RP01, RP06, RP07, RP08, RP09, RP14。任务：RP01-T02, RP06-T01, RP07-T02, RP08-T01, RP09-T01, RP14-T02。

关联决定/开放项：D-S01-01, D-S01-05, D-S01-06, T-RP-05。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

外部授权投影与内部业务快照分离；改变成员/角色后每个入口按当前scope重新授权，命令拒绝不改变业务/receipt。特殊registration/elevated范围只采用已批准角色、字段和操作。

### 未来验收

合法成功夹具后分别撤权/降级，覆盖HTTP、sync、registration、文件别名；比较返回字段及DB副作用，不能用401或不存在夹具证明授权隔离。

场景：INT-PC02-01

## PC03 — 领域事务、回执与500恢复

参与包：RP04, RP05, RP07, RP09, RP10, RP12。任务：RP00-T02, RP04-T02, RP05-T02, RP07-T01, RP09-T01, RP09-T02, RP10-T02, RP12-T02。

关联决定/开放项：T-RP-02, T-RP-07, S03-OI-03, S03-OI-04。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

一项命令的当前授权/CAS、业务变更、审计与作用域receipt处于同一提交边界；结果未知仅查询或原key原hash重试。已发送mutation不可原位改payload，保留窗外unknown/expired不能擅自换key重做。

### 未来验收

业务写后/receipt前/提交后响应丢失等屏障和同key竞争；查DB业务/审计/receipt及客户端最后副本。同key异hash/异actor拒绝且无副作用，提交一次。

场景：INT-PC03-01

## PC04 — IndexedDB升级、多tab与归属

参与包：RP03, RP08, RP11, RP12, RP13。任务：RP11-T01, RP11-T02, RP11-T03, RP12-T01, RP13-T03。

关联决定/开放项：T-RP-01, T-RP-09, T-RP-12, S02-OPEN-06, S02-OPEN-07。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

库/行具可靠owner，未知owner保全隔离；blocked/versionchange时协作关闭旧连接并提示，不强行删除库。IDB原子移动中不夹入可能使事务失活的网络等待；身份切换/页面关闭/升级中断只改变状态不丢唯一副本。 同owner多tab写入/发送选择批准的sender lease或等效协调与服务端幂等合同；lease过期/持有者崩溃不删除未确认payload，恢复时重新验证owner/generation。

### 未来验收

真实浏览器两tab持旧连接、v1/v2夹具升级、abort/关闭重开、quota和事务失活故障；比较owner、条数、内容hash及可恢复副本，不仅fake-indexeddb通过。

场景：INT-PC04-01

## PC05 — 同步水位、资源修订、回填与游标过期

参与包：RP08, RP09, RP11, RP13, RP15。任务：RP08-T02, RP09-T01, RP13-T02, RP13-T03。

关联决定/开放项：T-RP-04, T-RP-10, S03-OI-01, S03-OI-04。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

发布序列提交可见安全与同资源revision有序分别证明；snapshot切点到增量无洞无重复，页间ACL/role变化仍验证当前授权。cursor绑定epoch/scope/version，过期RESET保全outbox。所有HTTP/sync/import/restore/cascade生产者有事件覆盖，未覆盖路径只能按批准策略禁用或epoch重建。

### 未来验收

屏障乱序提交与同资源旧revision迟发布、大分页、snapshot中写入/撤权、TTL到期重建；以权威DB合法集合比较客户端最终state，确认不能倒退revision、越权或丢本地待同步修改。

场景：INT-PC05-01

## PC06 — 恢复后的安全与同步代际

参与包：RP03, RP09, RP11, RP13, RP16, RP19。任务：RP03-T02, RP09-T02, RP11-T03, RP13-T03, RP16-T03, RP19-T02。

关联决定/开放项：T-RP-06, T-RP-10。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

区分JSON模块恢复与整库/文件DR；批准数据epoch与安全状态来自何处，旧session/family/receipt/cursor/outbox必须可判别、重新授权且不自动错放。commit前失败回滚；commit后核查/重建失败登记RESTORE_NEEDS_RECONCILIATION，禁止重复restore或虚称已回滚。

### 未来验收

恢复到旧时点后重放旧JWT/refresh/key/cursor及本地草稿，确认获准撤销/隔离效果；注入commit前和后故障，核对真实数据count/epoch/status，恢复后写屏障解除有明确证据。

场景：INT-PC06-01

## PC07 — 关系与并发迁移

参与包：RP04, RP05, RP07, RP15, RP16。任务：RP05-T01, RP05-T03, RP15-T01, RP15-T02, RP15-T03, RP16-T02。

关联决定/开放项：D-S01-06, D-S01-08, T-RP-06, T-RP-11。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

当前硬删/跨项目关系修复与待批准DAG增强分开；若DAG规则批准，A到B和B到A并发写入须由项目串行化或等效正确方案避免检查-写入竞态。迁移基于实际schema/异常清单，不猜生产FK；预算覆盖递归、长事务、锁等待和恢复导入关系。

### 未来验收

合成异常和相反边屏障、迁移中断/恢复、并发HTTP/sync/restore；核对全unique/FK/live关系与有界锁/查询资源。真实异常统计只能在另行获准只读副本做。

场景：INT-PC07-01

## PC08 — 备份不可变与成对保留

参与包：RP17, RP19。任务：RP17-T01, RP17-T02, RP17-T03, RP19-T02。

关联决定/开放项：T-RP-10, T-RP-11, S05-OI-01, S05-OI-02。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

唯一runId、锁、staging发布、成对manifest和retention属于一份协议。发布后快照内容及硬链共享metadata不得被后续run修改；并发run/失败清理不能删除别人的stage，DB/files完整配对后才可回收上个恢复点。

### 未来验收

目标Linux/同FS跨FS、两并发备份、同时间戳、内容/metadata变化与失败清理；两轮hash/inode/stat/pair manifest和实际恢复完整性核对。R12-N01没有共同恢复点证据前保持候选。

场景：INT-PC08-01

## PC09 — 候选构建、编译配置与真实运行

参与包：RP00, RP18, RP19。任务：RP00-T01, RP18-T01, RP18-T03, RP19-T03。

关联决定/开放项：T-RP-08, T-RP-09, S05-OI-04。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

候选源码先build成可启动artifact，再用候选编译配置CLI做preflight和schema兼容判定，然后允许获准DDL/切流；CLI/import路径与package start一致。认证/CORS/export旗标必须被真实应用消费，枚举弃用和冲突，不能只校验.env字符串。

### 未来验收

只启动临时candidate，证明dist CLI与start实际配置一致；build/config失败不执行DDL/切流；真实auth模式/CORS/export行为用合法夹具验收，保留artifact hash。

场景：INT-PC09-01

## PC10 — 首次安全发布与有范围的回退

参与包：RP18, RP19。任务：RP18-T02, RP19-T03。

关联决定/开放项：T-RP-13, S05-OI-04, S05-OI-05。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

candidate仅阻塞其包含/受影响的任务与共享合同，不等待全部20包。已修权限/数据路径不能通过rollback再次暴露；没有兼容安全旧版本时采用获准停止写入/维护/关闭受影响功能的containment，不默认存在安全fallback。

### 未来验收

批准candidate includedTaskIds、schema/protocol兼容和安全rollback目标；build/迁移/健康/切流失败屏障证明旧或维护状态安全，禁止恢复已知危险旧路径。

场景：INT-PC10-01

## PC11 — 预算、监控与有效验收前提

参与包：RP00, RP02, RP04, RP09, RP10, RP11, RP12, RP13, RP15, RP16, RP17, RP18, RP19。任务：RP00-T01, RP00-T05, RP19-T03。

关联决定/开放项：T-RP-11, T-RP-13。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

设定body bytes/队列quota/锁和tx timeout/递归/发布lag/receipt窗口/备份磁盘预算、观察窗及停止阈值；尚无目标数据时不填拍脑袋数字。日志trace只记录去敏actor/resource/key hash及错误类别。负例前先确认鉴权、存在且成功的夹具和目标版本。

### 未来验收

批准环境预算后受控压力及故障注入，记录baseline/阈值/计时/资源、锁/队列/发布和恢复点指标；缺数据ENV_BLOCKED，无动态运行NOT_RUN，结构检查不冒充产品验收。

场景：INT-PC11-01

## PC12 — 用户冲突与最后副本恢复

参与包：RP03, RP08, RP11, RP12, RP13, RP19。任务：RP11-T03, RP12-T02, RP13-T03, RP19-T03。

关联决定/开放项：T-RP-01, T-RP-12。

状态 PROPOSED，设计owner未指定，验证 NOT_RUN。

### 合同

conflict/dead-letter/unknown/oversize/quarantine可区分显示；当前用户只能按获准归属/ACL恢复、认领或导出。放弃/retention清理前保全最后副本；发送中继续编辑产生新key/revision，不覆盖已发记录，不能自动重复非幂等操作。

### 未来验收

实际用户页面经历A到B、撤权、unknown receipt、oversize/quota、恢复和主动放弃；验证界面状态、持久payload和服务端副作用，审计导出/丢弃决定且不泄露其他owner数据。

场景：INT-PC12-01

## 共享文件协调

JSON登记了22个跨包共享现有路径。实施启动时指定integrationOwner，隔离分支/工作树与串行集成；共享dirty checkout不允许相互覆盖。当前owner均未分配，没有启动并行修复。
