# CodeBuddy 下一轮执行指令 — 2026-10-03 独立复核后

本文件提供交接指令。编写它没有启动业务修复、测试或部署，没有更新任何任务执行状态，也没有批准待定决定。用户把下列代码块交给执行者时，本轮限定授权生效。上一轮交付和独立复核保持冻结。

```text
你是 RDPMS 本地修复执行者 CodeBuddy。按下面既定步骤实际实现、验证和交付。无需重新论证架构或制定新计划；只做完成当前步骤需要的定向判断。先读证据再改代码，结果不符合预期时查明直接原因，不省略校验、权限、事务或持久状态核对。

仓库：/Users/renkang/VS Code/project-management
计划目录：docs/remediation/2026-10-01-rdpms/
原审计基线：138cf2da1b63195cef7e884f69bdf8ded6ed3c21
最新独立复核：execution/reviews/2026-10-03-codebuddy/
本执行指令：execution/CODEBUDDY_NEXT_EXECUTOR_PROMPT_2026-10-03.md

一、范围、授权及优先关系

本轮用户授权：在本地串行完成 A→B→C，运行其必要测试/构建和新自有临时环境验证，逐任务交付并同步记录。完成本范围后停止，交给独立审阅，不继续其他标准任务。
A. RP10-T02 REWORK：修复 LR3-01 的 POST 无行/恢复分支旁路，关联 B10。
B. RP08-T01 VALIDATION_ONLY：补齐 LR3-02 普通API合同对照与非空成功/增量夹具，关联 B04。
C. RP02-T01 TEST_ONLY：将独立复核已有条件更新前停用屏障固化为正式回归，关联 B14。
必要账本核对延续 LR3-03，不是新的产品修复任务。
RP04-T02本地范围已接受，本轮不返工其业务实现。

本指令替代旧 EXECUTOR_PROMPT、LUNA_CONTINUOUS_EXECUTOR_PROMPT 和上一轮 CODEBUDDY_EXECUTOR_PROMPT 中的“旧首轮任务”“每轮最多一任务”“每包结束等待继续”“执行全部可就绪标准任务”及旧四任务范围。保留其余保护、隔离、依赖、条件门禁、证据和交付要求。不要因旧 nextReadyTask=null 或旧交付 PASS 提前结束，也不要扩大为剩余37项实施任务。
新复核对当前结果的裁定优先于旧执行者自报。implementationDependencies 限制实施；acceptanceDependencies 只限制对应验收。门禁按 before/condition/精确scope判断；冲突只暂停相关分支，不能自行选择更宽松业务规则。

禁止：子代理、模型切换；stage/commit/push/merge/deploy；reset/clean/stash覆盖工作区；生产或共享数据库/服务访问；真实账号操作或真实数据恢复；安装/升级依赖；新增业务迁移；改写旧审计、manifest、v1快照、任何旧run/失败日志或三轮复核证据；代签 PENDING/PROPOSED 决定；放宽权限、全局批量赋值、报告状态、CAS或append-only审计来让测试通过。
本授权不等于任何产品、安全、数据、技术政策批准。不要重复询问普通本地实现/测试授权。

二、必读和启动登记（不得省略）

先完整读取本文件和 EXECUTOR_PROMPT.md。
再完整读取原执行指令列出的 v2 必读文件：README、GAP_REVIEW、REMEDIATION_PLAN、HANDOFF、IMPLEMENTATION_STATE、TASK_GRAPH、DECISION_REGISTER、OPEN_ITEM_GATES、CROSS_PACKAGE_CONTRACTS.json/md、RELEASE_GATES、INPUT_MANIFEST、REVISION_INPUT_MANIFEST、REVISION_HISTORY、EXECUTION_REVISION_HISTORY、PLAN_VALIDATION；并读取 execution/state.json、execution/handoff.md。
完整读取最新复核目录的 REVIEW.md、findings.json、validation-summary.json、task-readiness.json、PLAN_ADJUSTMENTS.md、NEXT_EXECUTION.md、handoff.md；以及 evidence/observations.json、evidence/review-probes.mjs、evidence/dynamic-probes/attempt-02/run-results.json 和 integration-suite.log。
按 A/B/C 读取 PACKAGES.json/md 对应任务卡、FINDING_TO_PACKAGE 对应发现、ACCEPTANCE_MATRIX 全部关联行、原run及引用的历史证据。只读本任务相关历史材料，不重扫全仓或重跑全部历史复现。

核对 HEAD、git status、实际差异、当前源码hash和已有后续产物。原基线与修复后的dirty worktree分开登记；不得要求源码hash等于原审计hash。
若有本指令之后的执行结果，核对当前源码和验收再接续未完成项；不覆盖、不重复做已被证据接受的工作。无法归属的新工作区变化保留，暂停重叠写入，继续不重叠授权任务。
新建 execution/authorization-<唯一会话ID>.json：执行者、用户本指令来源、taskIds=[RP10-T02,RP08-T01,RP02-T01]、每项kind、允许文件、验证路径、资源所有权、禁止操作、停止条件。登记授权，不修改审批状态。每项新run也交付其authorization.json。

三、允许文件和实现上限

以下源码/测试路径相对 rdpms-system/：
A业务代码：backend/src/routes/reports.js、backend/src/modules/reports/reportCommands.ts。测试：backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs；确需额外报告测试时，仅新建backend/tests/integration/rp10-*.integration.test.mjs并先登记。
B只允许改/新增本任务测试 backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs 或 rp08-*.integration.test.mjs，以及本轮合同映射/证据文件；不修改sync.js、普通API或前端业务代码。
C只允许改 backend/tests/integration/rp02-login-lock-ttl.integration.test.mjs；不修改auth.js、users.js、RBAC或session/refresh策略。
允许新建自有运行器和探针于本轮run/evidence下；允许更新计划目录当前运行镜像、两级handoff和两份版本历史。保留原case定义、依赖、门禁、严重度、冻结输入和规划检查点。
共享测试helper默认不改；确有夹具错误时只在本任务测试内解决。若必须范围外修改，记录路径/原因/最小扩展建议，暂停该分支，不自行扩大允许文件。

四、A：RP10-T02返工（先完成交付，再进入B）

已确认事实：reports.js validate按业务唯一键读到null → 第一请求暂停在真实upsert前 → 第二不同key POST创建201并submit200 → 第一请求恢复，upsert.update无条件覆盖已提交行且仍201；真实SUBMITTED正文与ReportVersion不一致，生成成功receipt及错误create审计。
先用当前代码确认这条精确反例，或读取已有后续逆验收确定已修复；保留本轮基线日志。不得重新把已修好的late PUT当成全部根因。

执行顺序：
1. 清点所有写入报告正文的入口/分支，不只检索 saveReportDraft 调用。记录POST新建、既有活跃草稿、墓碑恢复、PUT legacy/modern、sync报告写入及submit快照调用链。
2. 最小修复“初次无行→执行时出现活跃行”的无条件覆盖。优先复用已有唯一约束和冲突错误映射：无行分支做真正create；竞争唯一冲突回409并完整回滚。若不能同时保持现有恢复合同，采用任务卡允许的事务内受控恢复/重读方案；只解释直接必要原因，不重新设计架构。
3. 墓碑恢复单独按现有合同处理，不能把任意当前活跃行当墓碑恢复，不擅自重置status/currentVersion或删除版本，不批准新的delete-wins/恢复政策。墓碑在请求过程中变成活跃行时必须受控冲突/授权/状态检查，不允许无条件覆盖。
4. 保留共享saveReportDraft现有原子可编辑状态+CAS谓词、reports.update/作者/项目能力、modern基线与legacy兼容、合法同key回放、业务/audit/receipt同事务，以及当前submit/resubmit来源状态和并发版本分配。
5. 将本轮独立反例反转为正式回归，不把“成功复现缺陷”当验收PASS。

必须实际执行并核对真实持久状态：
A01 合法POST新建201；作者/项目/周期/正文/status=DRAFT正确，audit/receipt各一次。
A02 初次无行→竞争POST创建→submit先提交→第一POST恢复：确定性屏障在真实create/upsert写入前；第一请求明确409而非500/201；正文、status、currentVersion、ReportVersion不受迟到写影响；失败请求没有成功receipt或业务audit。
A03 两个不同key同业务唯一键的新建竞争：不无条件最后写覆盖，不出现500，不留重复报告/部分receipt/audit；按保留合同记录哪个成功、哪个冲突。另测只有reports.create而无reports.update的actor，不能靠“查询时无行”覆盖竞争出现的活跃草稿。
A04 POST既有可编辑草稿合法成功；权限不足拒绝；过期基线409，无业务/audit/成功receipt残留；submit先完成的迟到POST拒绝。
A05 合法原key replay包括提交后的重试仍返回原成功结果，不重复审计/写入；不同key不得冒充回放。
A06 墓碑恢复合法正例及墓碑→活跃并发负例，按实际已有合同验证status/version/deletedAt和审计；规则确实不明确时如实NOT_RUN并指出具体合同缺项，不能代签或把该子场景藏起来。
A07 原PUT legacy、modern/CAS、sync迟到保存保护；成功保存先完成时submit快照等于同一revision；旧基线拒绝；五个不同key并发提交版本唯一递增、currentVersion一致。保存/提交竞争使用ORM/SQL边界屏障，不以sleep代替确定顺序。
所有负例前证明合法认证、权限、输入、资源与成功路径。记录HTTP/code、真实Report/ReportVersion、audit、receipt；只断言HTTP不够。

按原定义分别记录 AC-B10-01、AC-B10-03、PAC-RP10-02、TASK-RP10-T02；本次细分A01-A07另列子场景，不改306原case ID/定义。AC-B10-02仍NOT_RUN待D-S01-07；INT-PC03-01未运行仍NOT_RUN。
本范围不改变submit来源状态，D-S01-07 condition=false记NOT_APPLICABLE，不能记PASS；RP09-T01是联合验收依赖，不阻止本修复。不得实施RP10-T01/T03。

五、B：RP08-T01只补验（完成A交付后进行）

执行顺序：
1. 在新run交付 read-contract-matrix.csv/md。七实体 projects/projectPhases/tasks/milestones/monthlyProgress/reports/projectMembers 分别列普通API真实入口/方法、权限、项目scope、字段来源文件行号、sync映射、own-only、tombstone规则、实际case及证据。来源是当前普通API和已有合同；不能把SYNC_ENTITIES或测试里的清单自行称为“已批准”。
2. 对相同真实行和同一actor做普通API与同步成对请求：先带权限合法成功，再移除该实体权限或项目成员资格，证明普通API拒绝/过滤而sync不返回被拒实体/字段。保留成员/VIEWER/非成员/零权限/SUPER_ADMIN/elevated矩阵。区分实体直接入口与聚合响应，不把普通API返回更多合法字段误认为sync必须返回全部字段。
3. 字段按现有合同验证合法子集、具体禁止字段和嵌套对象；sync可比在线更窄，reports own-only是明确额外限制。不要求整个JSON相等，不为了相等改业务接口/权限/投影。缺少必要字段合同来源时登记精确NOT_RUN范围，不代签。
4. 创建SUPER_ADMIN本人的真实报告和其他作者报告（项目范围合法）；先证明本人报告非空可见，再证明他人报告不可见。不能使用空集合every()或只创建actor证明成功。
5. 在仍对actor可见的项目内，为适用子实体创建真实deletedAt/leftAt墓碑，先证明有读权限时能返回目标ID，再在无权限时不泄漏该ID；同时验证reports墓碑own-only及非成员拒绝。项目自身删除会改变projectIds，应按现有作用域记录；不能为造正例绕过scope，也不能借此实施RP08-T02历史回填/撤权清理。
6. 验证全量与增量拉取。当前实际pull入口是 GET /api/sync/init?since=<ISO>&deviceId=<自有ID>（以及现有pageToken），不是独立/api/sync/pull；不要新增虚构入口。先读取当前代码/前端客户端确认参数；用确定时间切点和切点后真实更新/墓碑构造非空增量。不能用初次全量代替增量。无需本轮重做safe-watermark/分页生产方案。
7. 原5条测试保留并复验；新增所有缺项的可重复断言，实际跑真实自有PostgreSQL。普通API触发elevated审计时，合成actor保留至整库drop，不删除审计或绕trigger。

分别登记 AC-B04-01、AC-B04-03、PAC-RP08-01、TASK-RP08-T01 的完整/已覆盖/未覆盖范围。任一必需子场景未跑，不恢复整个TASK PASS；无新业务失败但缺项记NOT_RUN，真实业务失败记FAIL，环境缺失记ENV_BLOCKED。
D-S01-05普通范围condition=false记NOT_APPLICABLE；不启用注册项目全局例外。AC-B04-02、PAC-RP08-02/03/04仍属于RP08-T02，未运行保持NOT_RUN；T-RP-04/T-RP-12不阻止本轮普通API/增量补验。
发现新业务失败：保存反例、路径、持久状态及建议，标FAIL；本轮B只补验，不自行修sync/普通API/前端。完成仍可独立验证部分后进入C。

六、C：RP02-T01仅固化已有屏障测试

只改正式测试。复用最新复核探针的真实bcrypt登录和user.updateMany屏障：
1. 同类合成ACTIVE账号先真实登录成功，核对token/用户/refresh/audit，证明夹具有效。
2. 新目标账号登录已经读到ACTIVE且真实密码正确；暂停在带lastLoginAt重置的实际user.updateMany执行前（不是findFirst执行前）。
3. 真实持久管理员actor通过PATCH /api/users/:id/status先提交DISABLED，要求200，核对行和状态审计。
4. 恢复登录，要求403 ACCOUNT_DISABLED，无accessToken、无refreshToken、无成功login audit；真实行DISABLED，lastLoginAt/失败计数/lockedUntil不被拒绝登录改变。
5. 保留原入口读前停用、合法登录先完成、锁内正确/错误密码及其它状态/期限/TTL测试；不能把已经先完成的合法登录改为失败。必要时屏障finally释放，等待请求收束，避免孤儿进程/挂起事务。
复验本任务原11条加新增测试，记录TASK-RP02-T01及关联验收的局部证据。原实现无需返工；不修改auth/users/RBAC，不实施refresh家族、禁用后追溯会话撤销、激活、等级或强制改密政策。
新测试若失败：保留日志和证据，区分fixture与业务失败；本轮C不擅自业务修复。

七、隔离、构建和回归规则

运行前读取实际runner/脚本行为，检查dotenv、目标URL、DB guard、自动build、子进程、fixture和cleanup。只用本轮唯一新建且确认自有的本机loopback PG/临时根/合成账号。私有环境文件0600，不读取仓库dotenv或真实凭据，不复用旧固定审计库，不绕guard。
可参考最新独立复核owned-review-runner和上轮CodeBuddy runner，复制到新会话修正root/日志目录后使用；不要修改旧runner。每个集成套件一个新自有数据库，避免共享库相互干扰；支持guard认可的唯一随机库名，不为旧固定库名断言修改guard或连接旧库。
使用已有前端TypeScript 5.9.3经PATH供后端build；不安装依赖。运行前确认dist不存在或明确自有；不删除未知dist。失败build留下的本轮自有输出也登记并清理。清理仅自有资源：guard drop→cluster stop→owned dist/temp root；每步退出码和实际不存在状态留证。append-only审计actor留到整库drop。
真实DB/IDB/file要求不能用mock替代。注入actor只证明已认证后的授权路径，不能标完整JWT链PASS；登录真实bcrypt也不等于所有protected API完整JWT验收。前端IDB未运行如实NOT_RUN；必要依赖缺失如实ENV_BLOCKED。
每项运行对应定向套件；A共享报告路径变化补跑既有rf02-idempotency、rf02-post-concurrency、rf02-sync-rejection-retry、rf03-report-period、rf04-versions-access、rf04-write-authorization。新增场景和原回放/CAS测试不能只取其中一条。
收尾运行受影响后端单元、现有build、typecheck、check-undefined、git diff --check，记录精确命令/退出码和实际测试数。无新变更/失败依据不重跑全部历史306项或全仓集成。已知RF01固定库名限制另列，不通过削弱断言掩盖新失败。
负例之前建立合法成功前提。保存失败尝试日志；修复后重跑相同断言，不换弱断言凑PASS。拒绝路径核对真实副作用，mock/源码检查/空库/401/不存在资源不能代替验收。

八、逐任务交付和状态对账

每项使用唯一新run：execution/RPxx/<taskId>/runs/<日期-codebuddy-唯一ID>/，交付：
authorization.json；change-summary.md；evidence/；acceptance.json；rollback.md；task-state.json；handoff.md。
change-summary记录起止HEAD、dirty-worktree差异/文件hash、实际文件变化及影响边界；evidence记录精确命令、退出码、去敏日志、夹具/屏障、真实行/版本/audit/receipt或字段/墓碑、清理。B另交read-contract-matrix；C交正式测试与独立探针对照。
验收每个原case单独映射子场景和证据。日志“tests全通过”只说明这些测试；反例脚本exit0只说明成功确认反例。缺必需场景不得整体PASS；SUPPORTED不等于FIX_ACCEPTED，本地任务PASS不等于包COMPLETE或目标/发布验收。
逐任务交付后同步 IMPLEMENTATION_STATE、execution/state、TASK_GRAPH和PACKAGES运行镜像、FINDING_TO_PACKAGE、ACCEPTANCE_MATRIX、all54-task-status、remaining-task-gates、两级HANDOFF。保留原306case ID/定义/门禁，原规划检查点不重写。
两份REVISION_HISTORY/EXECUTION_REVISION_HISTORY追加当前变更文件摘要；新验收必须指向当前源码hash，不能继续绑定2026-10-02旧源码摘要。摘要不自引用；旧输入manifest、run和审阅记录不覆盖。
对账时检查四类一致性：任务实现/验证/发布轴；图与state/CSV/包内子任务镜像；新case证据与当前源码基线；冻结输入hash保持。只更新本轮三任务及确需镜像，不改变其它任务/审批的事实状态。
所有release保持NOT_EVALUATED，目标验收未跑保持NOT_RUN。不关闭B04/B10/B14或全部冻结开放项，不把RP02/RP08/RP10包标COMPLETE。RP04不重新打开，无新证据不变更已接受状态。
开始时预计54任务17 COMPLETE/3 IN_PROGRESS/34 NOT_STARTED；验证8 PASS/1 FAIL/38 NOT_RUN/7 ENV_BLOCKED。只作为核对参考，结束按实际账本重新计算，不为了达到预计数字修改状态。

九、执行节奏、阻碍与停止

串行A→B→C，每项完成实现/验证/交付/对账后再下一项。正常任务内实现和fixture选择直接执行，不反复询问，不输出长篇重新规划；工作中简短汇报当前步骤、结果和阻碍。
真正触及范围外代码、新政策、未批准门禁、共享路径并发编辑、未知资源或真实环境时暂停对应动作，写明已完成部分、具体证据、解除条件和最小所需批准/材料，继续其余独立授权项。不得用A失败结果作为后续依赖已满足的证明；B/C与A独立时仍可推进。
上下文或额度不足时，先写真实task-state和精确接续读序；未完成如实保留。不得为收尾把FAIL/NOT_RUN/ENV_BLOCKED改为COMPLETE/PASS。
A/B/C均交付或分别有明确阻碍后停止，不继续其它包、审批、提交或部署。准备供独立审阅的入口文件 REVIEW_ENTRY.md：本次run链接、起止源码hash/diff、验收/残留问题、资源清理、严格读序；执行者不能在此代替独立审阅声明最终验收。

最后一次性按顺序汇报：
1. A/B/C实际状态与包级状态；
2. LR3-01/02/03、B10/B04/B14处置及未关闭范围；
3. 实际文件变化和允许范围；
4. 实际运行的命令、测试数、HTTP/持久状态、证据限制与清理；
5. 三个新run、合同矩阵、两级handoff和REVIEW_ENTRY链接；
6. 全54实施/验证统计及306case统计，发布单列；
7. 剩余具体阻碍、解除条件及下一就绪建议。
请实际执行并落盘，不要只回复执行计划。
```
