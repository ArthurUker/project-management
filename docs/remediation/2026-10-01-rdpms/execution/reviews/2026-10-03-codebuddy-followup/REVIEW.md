# CodeBuddy 第二轮三任务交付独立复核 — 2026-10-03

## 裁定

RP10-T02、RP08-T01、RP02-T01 的**当前代码、本地任务范围**可以接受。结论结合冻结的执行者日志、本轮独立真实PostgreSQL逆验收和补证；并非直接接受执行者自报。未发现本次修改新引入的业务缺陷。执行者声称的“全部记录同步”和部分证据说明不准确，已追加裁定并修正当前可变账本。

三个任务均 COMPLETE/PASS（本地范围），三个包仍 IN_PROGRESS。B10/B04/B14仍SUPPORTED，不关闭原审计开放项；目标环境NOT_RUN，发布NOT_EVALUATED。字段安全政策的独立批准、客户端缓存撤权、联合合同和发布均未据此验收。

HEAD仍为 `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。对照上一轮独立复核完整源码摘要，仅reports.js和三个任务测试文件变化，符合限定范围。本轮不修改业务源码、正式测试、依赖或迁移；旧run/反例/三轮审阅/审计/v1均冻结。

## 1. RP10-T02：LR3-01 本地范围接受

当前POST无行分支改为真实create，唯一冲突由原映射返回409 DUPLICATE_PERIOD_KEY；墓碑恢复采用updateMany，只有当前deletedAt非空才能恢复；竞争恢复变活跃行后返回409 CONFLICT。原共享saveReportDraft的状态/CAS、PUT/sync和submit快照保持原样。

本轮把屏障放在真实写入之前，实际执行以下序列：

- 新建201正例，真实DRAFT行和一次成功receipt。
- 首次POST无行→暂停→竞争POST201并submit200→恢复：迟到POST409，SUBMITTED正文与版本均winner-source；迟到receipt=0，create审计=1。
- 合法草稿DELETE→暂停恢复→竞争恢复201并submit200→恢复迟到请求：409，正文与版本均winner-restored；迟到receipt=0，恢复审计=1，deletedAt=null。

执行者最终17/17日志和6套各自独立库回归日志存在且命令/清理记录一致；本轮没有冒充重新运行这些套件。AC-B10-01、AC-B10-03、PAC-RP10-02、TASK-RP10-T02保留本地PASS；AC-B10-02及INT-PC03-01保持NOT_RUN。未改变D-S01-07来源状态规则，未实施严格revision或新的删除恢复政策。

### 原反例对照的证据边界

执行者negative-control日志确有5项失败，但A02/A03/A03b/A06b均是`barrier not reached`超时：测试只拦create/updateMany，恢复upsert后不再经过这些屏障。A06失败是恢复审计元数据缺失。这不能证明“五项均实际复现了迟到覆盖”。

本轮另做**语义负对照**：只对一条匹配的、已经暂停的新建请求，在自有测试DB适配层把create换成真实Prisma无条件upsert；业务源码不变，事务/SQL/audit/receipt实际执行。竞争创建+提交后，迟到请求201，SUBMITTED正文control-late、版本winner-source，迟到成功receipt=1、create审计=2。它确实触发了业务不变量破坏，补足核心路径的负对照；不是原始源码回退运行，也不是5项负对照全部通过。

因此不重新打开业务修复；建议正式回归屏障兼容两个写入原语，或在原分支共用边界设置屏障，让未来负对照命中业务断言而非超时。

## 2. RP08-T01：当前普通API对照接受，保留政策边界

执行者11/11日志中七实体正负权限请求、成员退出、SUPER_ADMIN非空本人报告、六种子实体墓碑、增量读取均实际执行。真实入口为GET /api/sync/init?since=，未新增接口。业务代码确实未变。

执行者B5只对projects和tasks做在线字段对照，任务字段采用整段JSON字符串包含键名，不能证明该键属于同一目标行，也未实际逐字段对照剩余五实体。本轮用同一actor和真实相同行，补齐七实体：

1. 普通API200，精确选取该行（含members的裸数组响应）；sync返回相同行。
2. sync每个键必须属于该在线行；每个标量值逐项一致，manager嵌套字段逐项属于在线对象；明确排除createdById/updatedById/deletedAt/reviewerId/leftAt/metadata。
3. 对同一actor只去掉目标读取权限，普通API403，同步对应upserts/tombstones为空。

当前代码下七实体全部符合上述断言。结合执行者其余持久夹具，AC-B04-01、AC-B04-03、PAC-RP08-01、TASK-RP08-T01保留**现有普通API实现对照的本地PASS**。不把“当前在线实现允许”升级成“产品/安全已批准字段政策”；正式独立字段安全规则仍缺少批准来源。此不是当前普通范围的新全局实施门禁，不代签新决定。

AC-B04-02、PAC-RP08-02/03/04和IDB撤权/回填仍NOT_RUN，RP08-T02不激活。建议把本轮七实体相同行/字段值对照固化到正式套件，防止未来两个实现分别漂移。

### LR4-02 — P2：合同矩阵的普通阶段墓碑表述错误

冻结的read-contract-matrix.md第5条声称所有普通API活跃视图均过滤deletedAt/leftAt；acceptance B3也声称普通活跃视图排除墓碑。但projects.js:820的阶段列表查询只有projectId，没有deletedAt过滤。

独立实测：给仍可见项目中的阶段设置deletedAt；有权限普通GET /projects/:id/phases仍200返回该阶段及deletedAt；同步仅返回墓碑ID、没有活跃upsert；非成员同步没有该ID。

这是原代码的实际例外和交付文档错误，未证明同步越权泄漏，也不是本轮业务代码回归。只追加CONTRACT_ERRATA.md，不改旧矩阵、不修阶段API、不把“全部活跃读取软删语义一致”记PASS。是否统一普通阶段视图，需在原活跃查询/软删范围中定向核对合同后另行实施；不据该现象把已验证的项目列表/统计B20修复推翻。

## 3. RP02-T01：永久屏障测试接受

C01的屏障确实位于带lastLoginAt的实际user.updateMany执行前；在此之前已读ACTIVE、bcrypt密码校验成功。正例真实登录成功、refresh与audit存在。停用先提交后，放行登录403 ACCOUNT_DISABLED，用户保持DISABLED，lastLoginAt=null、失败计数0、lockedUntil=null、refresh=0、成功login audit=0，无accessToken。

本轮独立重复同一真实密码正例及竞争场景，结果一致。执行者12/12日志与旧测试保留情况符合要求；OBS-RP02-FENCE可记CLOSED_INTO_PERMANENT_REGRESSION。管理员actor注入、登录真实bcrypt，不能称完整protected API JWT链验收。没有修改认证、用户或会话业务代码。

## 4. LR4-01 — P2：台账仍有镜像和接续漂移

复核开始时：

- TASK_GRAPH中RP10顶层status/validation是COMPLETE/PASS，implementationStatus/validationStatus仍IN_PROGRESS/FAIL；RP08顶层PASS而validationStatus仍NOT_RUN。
- IMPLEMENTATION_STATE的nextReadyTask仍RP10-T02、readyReviewQueue仍旧返工/补验队列，指向已交付任务；会导致再次执行。
- PACKAGES中RP05/RP07子任务验证仍ENV_BLOCKED，与已接受state的PASS冲突（继承旧漂移，本轮不改变这两项产品结论）。
- EXECUTION_REVISION_HISTORY最新条目的HANDOFF hash与文件不符；当前源码短摘要匹配实际源码。

执行者“LR3-03全部同步”的结论不成立。本轮修正当前运行轴/证据/指针、必要包内镜像和两份追加版本摘要；保留修正前账本及所有冻结运行。此是记录修正，不是产品验收。后续不得只更新status/validation而遗漏implementationStatus/validationStatus。

## 5. 独立运行、证据和限制

使用新建自有loopback PG、guard确认的唯一库、私有0600临时env和自有build。两次尝试，最终14项观察/断言符合预期；其中一项确认了语义负对照的坏结果，不能用进程exit0宣布系统全绿。

第一次尝试仅审阅探针提取members响应形状错误（误按list取值，实际是裸数组），没有确认产品失败。原脚本/失败日志保留；修正提取器后新库复跑，断言不削弱。两次guard drop/cluster stop均0，临时根和自有dist删除。

本轮没有重跑全仓、306条历史验收、执行者全部正式套件或目标环境。完整JWT链、IDB、批准字段政策、PC03等联合合同、候选/目标配置、提交/部署/发布均未验收。业务源码/正式测试hash保持复核开始时不变。

## 6. 当前统计与后续

18 COMPLETE / 2 IN_PROGRESS / 34 NOT_STARTED；验证10 PASS / 37 NOT_RUN / 7 ENV_BLOCKED / 0 FAIL；306验收53 PASS / 228 NOT_RUN / 25 ENV_BLOCKED / 0 FAIL。全部release NOT_EVALUATED。

本轮三项业务范围可以结束，停止重复业务返工。正式测试固化的两项建议可独立后续进行；其他标准业务任务按现有implementationDependencies和适用门禁推进。T-RP-02、T-RP-04/T-RP-12、T-RP-09等仍PROPOSED，D-S01-07仍PENDING；RP15需要数据所有者授权的只读快照，RP19最终对账仍待支持任务完成。没有把审批标题当作可代签的批准。

详见NEXT_EXECUTION.md、task-readiness.json及handoff.md。

## 7. 交付完整性核对

最终完整性检查通过：27个源码/正式测试摘要与复核起点一致；8个冻结目录共373个文件无增删或摘要漂移；三项运行轴、全部54任务执行轴、已有包内镜像与CSV一致；306条验收定义及结果未改变；决定及开放项文件匹配各自最新历史检查点。git diff --check为0，自有临时根及dist不存在。详见evidence/review-artifact-check.json和evidence/state-corrections.json。

完整性检查初次错误地把开放项当前文件与所有旧版本摘要比较，保留attempt-01结果，按每文件最新检查点修正；这是检查器错误，不是产品或批准变化。两份版本历史只追加本次复核摘要，不自包含其自身hash。
