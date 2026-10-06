# Luna 连续执行 prompt — 2026-10-02

此文件供用户复制给执行者。编写文件不等于启动修复或批准待定决定。本次连续执行范围以用户发送下列 prompt 为准。

```text
你是 RDPMS 本地修复执行者。请依据修复规划 v2 和独立复核结果，实际连续完成本次可执行的修复、验证、交付。不要只回复计划，也不要每完成一个子任务就结束等待“继续”。

仓库：/Users/renkang/VS Code/project-management
计划目录：docs/remediation/2026-10-01-rdpms/
原审计基线：138cf2da1b63195cef7e884f69bdf8ded6ed3c21
复核目录：execution/reviews/2026-10-02-luna/

【1. 本次授权与旧规则的关系】
本条授权连续执行多个标准本地修复子任务。它明确替代 EXECUTOR_PROMPT.md 和 NEXT_EXECUTION.md 中“每轮最多一个实质任务、交付后停止等待继续”的限制，也替代它们的旧首轮任务指针。
仍须串行逐任务实施：每个任务登记scope、实现、验证、落盘和更新状态后再进入下一任务。不能把多个任务混成一次不可追溯的修改。
其余必读、依赖、条件门禁、隔离、证据、工作区保护和状态规则继续适用。
不调用子代理、不切换模型。不stage/commit/push/merge/deploy，不访问生产或共享数据库、不操作真实账号、不恢复真实数据、不安装或升级依赖。
本授权不批准任何PENDING/PROPOSED产品、安全、数据或技术决定，不自动激活自定义角色绑定或DAG扩展。

【2. 必读与接续】
先完整读取 EXECUTOR_PROMPT.md，并完整读取其规定的v2总计划、任务图、决策登记、开放项、跨包合同、发布门禁、实施状态、handoff、输入摘要和版本记录。
再完整读取复核目录的 REVIEW.md、findings.json、validation-summary.json、task-readiness.json、NEXT_EXECUTION.md、handoff.md，以及需要的原始日志。
开始每个任务前，读取当前任务卡、发现映射、ACCEPTANCE_MATRIX全部关联行、已有授权/状态/验收/交付，以及所引用的历史证据。
不要重新扫描全仓或默认重跑全部历史复现。复核就绪表是检查点，选任务仍须核对当前TASK_GRAPH、源码和新证据。

先核对HEAD和git status，保护全部未提交文件。不得reset/clean/stash覆盖工作区。冻结旧审计、历史manifest、v1快照、原运行及复核证据。新证据按新run目录追加。
如果任务已被后续执行实际完成，核对新基线及证据后跳过，不重复覆盖。

【3. 先做准备记录】
登记本次 authorization.json，写明连续执行授权来源、已选taskIds、允许文件、执行者、禁止操作和停止条件；新任务选择时追加范围。
按逐任务真实证据修正LR-08：汇总授权清单、包状态、activeTask、nextReadyTask等应一致。记录前后差异，不把账本修正当作产品验收。
同步实施状态及必要镜像运行字段，维护变更文件的版本记录和摘要；保留原规划检查点和冻结证据。不得为让计划变绿而改严重度、验收条件或门禁。

【4. 按顺序连续执行】
A1：返工 RP02-T01，处理 LR-01、LR-02、LR-05，关联旧B14。
- 修复PENDING_ACTIVATION账号错误密码达到阈值后未锁定的回归。
- 保留待激活、禁用和手工锁语义；不得自动激活账号。若保留PENDING状态，lockedUntil仍必须实际约束登录。
- 锁定到期正确密码登录后，响应状态应与真实数据库一致。
- 修测试清理：带审计关联的合成账号保留至自有整库drop；禁止关闭审计trigger或删审计行来使测试通过。
- 验证ACTIVE/PENDING_ACTIVATION/LOCKED/DISABLED，阈值、期限内正确和错误密码、到期、并发计数、并发禁用及实际审计/响应/数据库状态。
- 不顺带实施refresh、账号等级、强制改密或新会话政策。

A2：返工 RP01-T01，处理 LR-03，关联旧B17。
- 显式验证code/name/description类型和现有合法边界，先于正则和ORM；非法数组/对象/标量类型应明确400。
- 保留全局code黑名单、角色创建专属白名单、isSystem=false及权限/审计/系统字段保护。
- 覆盖原五项B17验收，再加类型负例；真实数据库无非法新增或关系注入。
- 不改角色绑定、seed或新增业务迁移。

A3：返工 RP04-T02，处理 LR-04，关联旧B18。
- 原始嵌套任务标量先检查类型再规范化，避免applicability对象在toUpperCase处500。
- 合法聚合实际成功；非法类型/枚举/日期明确400，真实聚合表无部分残留。
- RP09/PC03联合验收仍独立记录，不因本地suite通过关闭整包。

A4：补齐 RP05-T01，处理 LR-06。
- 修正只含tasks:[]而被NO_VALID_FIELDS提前拒绝的fixture，使用合法可达请求。
- 分别验证无tasks.delete拒绝、跨项目子任务拒绝及真实父子行保留；原套件应全绿。
- 不放宽批量赋值保护，不改业务行为来适配错误测试；无证据支持时只改测试。

B1：实施 RP08-T01 普通同步读权限。
- 按任务卡做实体、字段、own-only和当前授权投影，不请求或启用注册项目全局例外。
- D-S01-05在这个范围记NOT_APPLICABLE，并记录condition=false的理由，不写PASS。
- 建立成员/非成员、不同角色、reports own-only、零权限和elevated夹具；验证成功响应及具体行/字段的可见与不可见，不以401或空库代替。

B2：实施 RP10-T02 报告快照/版本原子性。
- 保持现有submit/resubmit来源状态，不采用未批准的D-S01-07新政策。
- 核对同一事务revision的快照、version分配、变更一致性；实施任务卡要求的事务保护并运行自有DB并发验证。
- RP09-T01是验收依赖，不是实施依赖。尚无法执行的回执重放/联合合同记NOT_RUN，不能伪造通过。

B3：继续 RP13-T02 的未签署ADR与本地barrier证据。
- 在自有临时PostgreSQL证明序列分配、提交可见性、分页切点及相关失败反例，按任务卡交付可审查选项。
- T-RP-04/T-RP-10是本任务VALIDATION门禁，不能阻止取本地证据；未经批准不选定生产方案、不做其业务迁移、不激活RP13-T03。
- ADR和本地证据交付不等于决策批准或safe-watermark验收。

以上顺序中的任务若出现真实阻碍，记录FAIL/ENV_BLOCKED及解除条件，继续仍可独立推进的任务。依赖已失败任务或共享变化风险未解决的任务不能强行继续。

【5. 完成上述任务后再计算下一任务】
逐项核对全54任务：implementationDependencies、acceptanceDependencies、gateRequirements.before、condition和精确scope。
- implementation依赖限制实施；acceptance依赖只限制验收。
- 未批准的决定只阻塞实际适用范围，不把整个包全部阻塞。
- S03-OI-05只约束改变stale-delete/delete-wins/tombstone的范围。
- RP10-T01严格revision仍需支持已部署客户端/legacy矩阵，不能由当前源码矩阵代替。
- 新的STANDARD任务只有实施依赖和适用门禁满足才可进入本地实施；使用真实具名批准证据，不能自行把PROPOSED改APPROVED。
- 对剩余阻塞任务，交付具体待批准合同/选项、所需负责人和解除条件。只更新已有草案的必要缺项，不重新制定整个架构。
- RP19-T04做本次结束对账，不宣称整体关闭；自定义角色绑定和DAG未批准仍不激活。
所有独立、已授权且可实施的工作完成后才结束。不能只因nextReadyTask旧指针指向阻塞任务就提前停止，也不能承诺没有必要批准就完成所有54项。

【6. 验证和证据】
运行前核对dotenv、连接目标、DB guard、自动build、子进程、fixture及cleanup。每任务用自有唯一临时数据库和合成账号，文件/browser资源同样确认所有权。
可先确认当前已存在的前端TypeScript 5.9.3，再通过PATH供后端npm run build使用；不安装/升级依赖。该本地构建不能替代candidate/目标配置验收。
先证明有效认证、权限和合法成功夹具，再跑负例。需要真实DB/IDB/文件证据的case不能用mock或源码检查替代；注入鉴权上下文的测试不得标为完整JWT链验收。
保留精确命令、退出码、去敏日志、source hash/diff、真实持久状态及清理证据。缺fake-indexeddb则前端运行项如实ENV_BLOCKED，不伪造运行。
只清理明确自有的临时资源，不删除共享工作区/未知进程/旧审计库。测试失败应修原因，不削弱断言、审计保护、授权或输入保护来凑PASS。
每完成影响共享路径的任务后运行相应定向回归；本次结束补跑已受影响的后端8套测试、必要的新测试、构建/类型检查。无需默认跑306条或整个历史审计。

【7. 每任务交付和最终停止条件】
每任务新run目录交付 change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md；逐case区分PASS/FAIL/NOT_RUN/ENV_BLOCKED和不适用理由。
实现、验收、发布、旧finding处置和LR处置分别登记。SUPPORTED不是FIX_ACCEPTED；缺陷复现成功不是修复通过；局部PASS不是整包COMPLETE；本地通过不是部署验收。未部署release保持NOT_EVALUATED。
同步IMPLEMENTATION_STATE.json、两级handoff和必要镜像状态，记录新源码摘要；禁止覆盖原审计证据或要求修复源码hash等于原基线。
隔离所有权不明、触及真实环境、无法解释的源码漂移、需要范围外政策或最后副本可能丢失时，停止相关动作并保留现场，继续无关授权工作。
额度/上下文不足时先落盘精确接续读序、已选范围和真实状态，不能把未完成标COMPLETE。

最终一次性汇报：
1. 本次实际执行的子任务及整包状态；
2. LR-01～08及关联旧发现的裁定，未关闭项；
3. 实际文件变化和边界；
4. 验证命令、通过/失败、真实持久状态、限制和清理；
5. 产物链接；
6. 全54任务的最新实现/验证统计、剩余任务，以及每项具体阻碍/解除条件；
7. 下一批所需批准或外部材料，按最小受影响范围分组。
请从A1开始实际执行，持续完成所有当前可执行范围后再交付最终报告。
```
