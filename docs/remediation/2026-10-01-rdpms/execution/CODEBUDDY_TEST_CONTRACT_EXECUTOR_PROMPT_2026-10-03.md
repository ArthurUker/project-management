# CodeBuddy 下一轮：测试补强与阶段合同核对

本文件依据 `execution/reviews/2026-10-03-codebuddy-followup/` 的独立裁定编写。编写本文件不启动执行，不改变54任务状态，不批准业务规则。用户将下列指令交给 CodeBuddy 后，本轮限定授权生效。

```text
你是 RDPMS 本地执行者 CodeBuddy。严格按本文件串行完成 SUP-01 → SUP-02 → SUP-03，逐项验证、落盘，最后停止等待独立审阅。只做既定步骤需要的定向判断，不重新规划架构、不挑选其他任务、不顺手修复发现的问题。

仓库：/Users/renkang/VS Code/project-management
计划目录：docs/remediation/2026-10-01-rdpms/
本指令：execution/CODEBUDDY_TEST_CONTRACT_EXECUTOR_PROMPT_2026-10-03.md
最新独立裁定：execution/reviews/2026-10-03-codebuddy-followup/
原审计HEAD：138cf2da1b63195cef7e884f69bdf8ded6ed3c21

一、唯一授权范围与优先关系

本轮只授权：两个既有正式测试文件的补强、一个阶段软删合同的只读核对、相应自有隔离验证及交付。

SUP-01：TEST_ONLY。父任务 RP10-T02，处理 LR4-03；补强报告并发测试屏障和语义负对照。
SUP-02：TEST_ONLY。父任务 RP08-T01，处理 LR4-02 字段证据部分；固化七实体精确行/字段值对照。
SUP-03：REVIEW_ONLY。关联 RP04-T01/RP08-T01 的阶段读取范围，处理 LR4-02 合同表述部分；核对普通阶段读取、软删写入及调用者，不修复业务。

三个 SUP-ID 是本轮补充交付编号，不是 TASK_GRAPH 的新任务；不得把54任务扩成57，不得重新打开已接受的三个业务实现。
RP10-T02、RP08-T01、RP02-T01 已在当前代码本地范围接受；本轮不返工这些业务实现，RP02正式测试也不在写入范围。

本指令替代旧执行指令中的首轮/返工任务指针、自动选择下一STANDARD任务、连续推进全部可执行任务和逐项等待“继续”的安排。其他隔离、证据、保护规则继续适用。范围冲突以本轮更窄授权为准；最新独立裁定优先于旧执行者自报。
本次本地测试授权不等于产品、安全、数据或技术规则批准。即使本轮期间出现新批准，本轮也不自动启动其他业务任务。

二、精确写入白名单

相对仓库根目录，仅允许修改以下两个已有正式测试文件：
1. rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs
2. rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs

允许新建：docs/remediation/2026-10-01-rdpms/execution/supplements/<唯一sessionId>/ 下的会话记录、三个补充任务目录、运行器、探针、证据与文档。sessionId 必须不存在；已有执行会话应只读核对后接续，不能覆盖日志或结果。新增attempt使用新目录。

允许受控更新以下现有文件，且仅限第三节、九节规定的补充引用/历史追加：
- IMPLEMENTATION_STATE.json
- execution/state.json
- HANDOFF.md
- execution/handoff.md
- REVISION_HISTORY.json
- EXECUTION_REVISION_HISTORY.json
以上均相对计划目录。

所有未列入白名单的仓库文件只读。特别禁止修改：
- backend/src/、frontend/src/、deploy/ 内任何业务/配置文件；包括 reports.js、reportCommands.ts、sync.js、projects.js、phases.js、auth.js、users.js。
- 其余测试、tests/helpers/stubDeps.mjs、共享fixture/helper、package.json、lockfile、tsconfig、DB guard、Prisma schema、迁移、seed。
- TASK_GRAPH、PACKAGES、FINDING_TO_PACKAGE、ACCEPTANCE_MATRIX、all54-task-status、remaining-task-gates、总计划、决定/开放项/跨包合同/发布门禁、输入manifest和PLAN_VALIDATION；这些均只读。
- 旧审计、历史manifest、v1快照、所有旧run/失败日志/审阅目录、既有read-contract-matrix、REVIEW_ENTRY，以及本执行指令和配套manifest。

不得为了反例对照临时修改或回退业务源码，然后再恢复；负对照仅在自有测试DB适配层实现。需要新的正式测试文件或共享helper时，本轮也不自行新增/修改；记录最小扩展请求，暂停相关分支。
构建可短暂生成本轮确认自有的backend/dist；现有依赖只读使用。启动前dist未知归属则记录ENV_BLOCKED，不删除、不覆盖。临时资源只能在确认自有的临时根生成和清理。

禁止子代理、模型切换；stage/commit/push/merge/deploy；reset/clean/stash；生产/共享数据库、真实服务或真实账号操作；安装/升级依赖；新业务迁移；删除审计行或关闭trigger；代签PENDING/PROPOSED决定；扩大权限/状态/CAS/审计保护来让测试通过。

三、必读、基线与启动登记

1. 完整读取本文件，再读取 EXECUTOR_PROMPT.md；完整读取其指定的 README、GAP_REVIEW、REMEDIATION_PLAN、HANDOFF、IMPLEMENTATION_STATE、TASK_GRAPH、DECISION_REGISTER、OPEN_ITEM_GATES、CROSS_PACKAGE_CONTRACTS.json/md、RELEASE_GATES、INPUT_MANIFEST、REVISION_INPUT_MANIFEST、REVISION_HISTORY、PLAN_VALIDATION，以及 EXECUTION_REVISION_HISTORY、execution/state、execution/handoff。旧指令的扩大执行范围不生效。
2. 完整读取最新独立裁定目录的 REVIEW.md、findings.json、validation-summary.json、CONTRACT_ERRATA.md、NEXT_EXECUTION.md、task-readiness.json、handoff.md、authorization.json、evidence/observations.json、evidence/review-probes.mjs、evidence/owned-review-runner.py、evidence/review-artifact-check.json、evidence/version-summary-readback.json，及最终动态attempt-02的run-results.json和integration-suite.log。失败attempt按裁定引用读取，不重跑旧失败脚本。
3. 按当前补充任务读取 PACKAGES.json/md 中 RP10/RP08 条目；SUP-03另读 RP04 条目。读取 FINDING_TO_PACKAGE 中 B10/B04/B20 及 ACCEPTANCE_MATRIX 中相应父任务的全部关联行。按引用读取三个上一轮CodeBuddy run的change-summary、acceptance、task-state、handoff和实际日志，不重读全仓历史：
   - execution/RP10/RP10-T02/runs/2026-10-03-codebuddy-lr3-rework/
   - execution/RP08/RP08-T01/runs/2026-10-03-codebuddy-lr3-validation/
   - execution/RP02/RP02-T01/runs/2026-10-03-codebuddy-lr3-testonly/（只为确认已接受边界，不改其测试）
4. 核对 HEAD、git status、相关源码/测试diff、已有后续交付、当前源文件hash。区分原审计HEAD和当前dirty worktree；保护所有既有未提交文件。不得以“HEAD仍为原值”推断源码未变化。
5. 新会话保存start-baseline.json：HEAD/status，两个正式测试的起始副本/hash，backend/src和frontend/src文件集及hash，schema/guard/配置与只读计划输入hash，旧run/独立审阅/审计/v1的冻结摘要，54任务及306验收的起始统计。哈希登记不是重新审阅所有源码。
6. 相关源码与最新审阅hash不符时，只核对该增量的归属和对本任务的影响；无法解释或存在并发编辑则暂停重叠任务。测试已有后续补强且证据有效时只补未完成项，不覆盖或重复重写。
7. 会话根和每项任务写 authorization.json：用户本指令来源、执行者、SUP-ID/parentTaskIds、kind、精确允许文件、源码只读边界、验证资源所有权、测试命令、停止条件。不得只设executionAuthorized=true而不登记具体scope。
8. 可在两个state文件新增/追加独立的supplementalExecution记录，引用新会话及SUP-ID；不要把SUP-ID塞进原tasks。启动时不改变原任务实现/验证/发布轴、latestReviewRef、旧任务latestRun或nextReadyTask。

四、SUP-01：报告测试补强

固定目标：当前业务修复通过；需要让测试负对照真正命中并发写入和业务不变量，避免写入原语变化后只超时。

步骤：
1. 读取正式报告套件及独立review-probes中的report代理/barrier；盘点 A02/A03/A03b/A06/A06b 的屏障、匹配条件和断言。只调整本文件内局部测试工具、相关用例及新增负对照，不重构整套测试。
2. 屏障按同一目标报告/业务唯一键/命令payload匹配，并能覆盖新建create/upsert、恢复updateMany/update/upsert的实际写入边界。create参数来自data，upsert来自create/update/where；不能假设参数形状相同。只拦指定迟到请求一次，不拦竞争赢家或submit，不吞掉事务options。
3. 代理仍调用真实事务客户端及真实Prisma SQL；不得用内存行/mock替代。原语改变后，屏障应仍到达相同业务窗口；超时只能记BARRIER_NOT_REACHED，不能记缺陷复现。
4. 所有并发用例保证try/finally释放屏障、清理timer并等待pending请求收束；不以sleep决定先后顺序，不延长timeout掩盖屏障未命中。旧套件其他用例保持，新增断言不可削弱旧断言。
5. 当前实现下至少执行两个修复验证：
   a) 初次无行POST暂停 → 竞争POST201 → submit200先提交 → 放行迟到POST：409 DUPLICATE_PERIOD_KEY；Report仍SUBMITTED，正文=ReportVersion快照，currentVersion正确；迟到请求成功receipt=0，无额外create审计。
   b) 合法草稿删除成为墓碑 → 迟到恢复暂停 → 竞争恢复201并submit200 → 放行：409；deletedAt=null，状态/正文/版本保持赢家；迟到成功receipt=0，成功恢复审计仅一次。
6. 固化一个明确标记SEMANTIC_NEGATIVE_CONTROL的真实DB对照，采用最新独立探针的已证明方案：只对匹配的迟到新建create，在测试适配层转成同事务内真实Prisma无条件upsert。业务源码、其他请求和submit保持原样。必须先证实屏障已命中且竞争创建/提交已成功，再核对迟到201、SUBMITTED正文≠版本快照、多出成功receipt和create审计。坏状态只存在于本轮自有库。
7. 该控制可以作为“预期识别到坏结果”的正式测试，或新run/evidence内的独立控制运行器；必须明确模式、调用原语、屏障命中、HTTP/DB/audit/receipt和对应的业务不变量。正常模式的无覆盖断言不得被分支条件放宽。控制运行exit0只能表示已确认预期坏结果，不是修复或发布PASS。
8. 本轮不要求五项控制全部复现，也不临时回退原源码。未做的恢复负对照、原源码回退对照分别NOT_RUN；四项旧timeout不得再次计为四个业务反例。
9. 在真实新自有库跑整个报告正式套件，不只跑新增一条。保留原PUT legacy/modern、POST草稿、sync、replay/CAS和并发版本用例。若实现错误导致失败，留证据，本轮不修业务。

验收编号仅在本补充acceptance中定义：SUP-01-01 原语兼容/屏障命中；SUP-01-02 当前两条修复验证；SUP-01-03 真实DB语义负对照；SUP-01-04 整套回归及无范围外变更。
映射 AC-B10-01、AC-B10-03、PAC-RP10-02、TASK-RP10-T02 只作为补充证据，不覆盖旧原始case裁定。AC-B10-02/INT-PC03-01仍未完成；本轮不改变submit来源状态，D-S01-07条件false是NOT_APPLICABLE，不是PASS。

五、SUP-02：七实体精确字段测试

固定七实体：projects、projectPhases、tasks、milestones、monthlyProgress、reports、projectMembers。不得新增业务实体或修改同步字段投影。

步骤：
1. 在现有B5及本文件局部工具中固化独立探针的相同行对照。使用本轮真实持久fixture的每个目标ID，同一actor、同一权限与成员条件分别请求普通API和GET /api/sync/init。
2. 七个普通入口按实际代码核对：
   projects：/api/projects/:id
   projectPhases：/api/projects/:id/phases
   tasks：/api/projects/:id/tasks
   milestones：/api/projects/:id/milestones
   monthlyProgress：/api/progress?projectId=:id
   reports：/api/projects/:id/reports
   projectMembers：/api/projects/:id/members
   members当前是裸数组；其他可能为list或单对象。按真实形状提取指定ID，明确断言在线200、目标行存在、sync200、同步同ID行存在。解析不符就记录，不默默返回空集合。
3. 每个sync键必须是同一在线行的自有键；标量/数组值逐项deepEqual。manager等较窄嵌套投影逐键比较在线同一对象，不要求完整JSON相等。不得用整段JSON字符串搜键或另一行的字段替代。
4. 保留现有明确禁止字段和关系检查：createdById、updatedById、deletedAt、reviewerId、leftAt、metadata，以及既有不应嵌入的任务关系；按当前实体实现/合同来源记录。不临时扩大禁止清单后修业务来迎合测试。
5. 同一真实actor只移除目标实体读权限，普通API应403，sync对应实体upserts和tombstones为空；记录每实体权限映射。先跑非空成功，再跑拒绝，不用401、空库、错误ID或SUPER_ADMIN绕过普通成员范围证明安全。
6. 保留原11条套件中的VIEWER/非成员/零权限/elevated、本人及他人报告、成员撤销、墓碑和增量用例。新的字段fixture不要污染原用例的周期键或软删状态；本套件独立新库、用例必要时独立fixture。
7. 跑整个同步正式套件，逐实体登记exact-row/keys/values/denial结果。缺一实体就该补充项NOT_RUN/FAIL，不能用every空集合补足。
8. 新run交付field-comparison.csv/md，逐实体列在线入口、权限、目标ID、response形状、字段数、源码行号、禁止字段、成功/拒绝case和证据引用。来源标CURRENT_IMPLEMENTATION_COMPARISON；独立产品/安全政策批准标NOT_EVALUATED。
9. 若记录软删行为，明确普通phase列表是当前例外；不能把“一律过滤deletedAt/leftAt”写回新文档，也不能把该现象修成预期。reports own-only是同步额外限制，普通API更宽合法结果不要求相等。

补充验收：SUP-02-01 七实体非空相同行；SUP-02-02 逐键逐值及禁止字段；SUP-02-03 七实体移除权限对照；SUP-02-04 原套件完整回归及边界。
关联 AC-B04-01、AC-B04-03、PAC-RP08-01、TASK-RP08-T01；不修改原306行。AC-B04-02/PAC-RP08-02/03/04、缓存撤权/回填/IDB保持未完成。D-S01-05普通范围condition=false是NOT_APPLICABLE；不请求或启用注册全局例外。

六、SUP-03：阶段软删合同，只读核对

禁止给projects.js加deletedAt过滤或修改任何业务/前端/正式测试。只交付证据和下一步建议。

读取范围从以下文件开始：backend/src/routes/projects.js、routes/phases.js、routes/sync.js、kernel/projectAccess.js、prisma/schema.prisma、frontend/src/api/endpoints/projects.ts，以及RP04/RP08当前卡片和对应历史B20/软删合同。所有路径相对rdpms-system/。
仅沿phase列表/项目详情中的phases、阶段删除/恢复及前端调用者向外追踪一层。定向rg发现的直接调用者可只读；在coverage.csv登记为何读取。必要授权/查询工具可定向读，禁止扩成全仓或全实体软删审计。

必须交付：
1. phase-read-contract.md：逐入口的方法/路径、权限/项目scope、ORM where/select、deletedAt行为、来源文件行号、客户端是否过滤/依赖该行。
2. trace当前可达阶段软删写入/恢复入口及关系限制；找不到则记NOT_FOUND，不发明接口。区分API可达软删和自有DB直接构造墓碑的fixture。
3. scope-assessment.md：现有B20/RP04-T01原验收究竟覆盖项目list/count/search/stats还是也明确覆盖阶段；引用原定义。区分已批准规则、当前实现、测试期望和建议。没有来源时标CONTRACT_UNRESOLVED，不自行决定默认过滤政策。
4. 必要时在本项新run/evidence内写只读探针，用新自有库构造合成行验证：合法可见项目+权限；普通阶段API当前是否返回软删行；sync是否仅返回墓碑；非成员/无权限是否收不到ID。可复用已存在独立证据；若未重跑明确STATIC_OR_EXISTING_EVIDENCE_ONLY。不要宣称从API删除，若实际是fixture直接设置deletedAt。
5. next-action.md：仅提交KEEP_CURRENT/SCOPED_FIX/CONTRACT_CLARIFICATION中的有证据选项、影响入口、最小候选改动、未来验收和所需批准/授权；候选改动用文字描述，不写业务patch、不做生产方案、不代签、不自动创建实施任务。此结论只能是推荐/待裁定。

补充验收：SUP-03-01 入口与写入链覆盖；SUP-03-02 直接客户端/合同范围；SUP-03-03 证据层次与未覆盖；SUP-03-04 具体建议且业务源码零变化。
本项COMPLETE只表示定向核对交付完成，不表示阶段业务修复或新政策验收。

七、隔离与允许验证

运行前读实际runner/guard/build脚本，检查dotenv、URL、子进程、fixture、自动构建和cleanup。不读取真实凭据或仓库业务dotenv，不复用旧固定审计库，不绕过guard。
只使用本轮新建、确认自有的loopback PostgreSQL集群和guard认可的唯一rdpms_test_*数据库、合成actor和私有0600临时env。每个正式套件、独立控制/探针使用独立新数据库，不同套件不共享污染fixture的库。
可以复制最新独立review-runner到新session，核对其ROOT/父目录层级和日志路径后再运行，不修改旧runner。只按既有schema/迁移初始化自有测试库，不生成新迁移。现有TypeScript经PATH供build，不安装、不用npx自动下载兜底。
受保护接口注入可信actor只能证明认证后路径，不是JWT全链验收。本轮不新增浏览器/IDB/文件访问/候选或目标环境测试。
每次保存精确命令、退出码、去敏日志、原语/屏障命中、HTTP与真实Report/Version/audit/receipt或字段/墓碑状态。负例之前证明合法成功夹具，失败尝试保留。合成审计actor保留到整库drop，不能删除审计或关trigger。
只清理明确自有库/集群/dist/临时根，记录guard drop、cluster stop退出码和最终不存在状态；所有pending请求/事务先收束。未知资源不清理。

本轮必跑：两个修改后的完整集成套件、SUP-01独立语义控制（若已在正式套件内，单独记录该case）、现有后端build/typecheck/lint:undefined和git diff --check。
没有业务/shared helper修改，不默认重跑六套业务回归、全部后端测试、全仓集成或306历史case。出现明确回归证据只追加与本两测试直接相关且隔离安全的验证，先登记原因；不要因此修改其他文件。
测试全局指令不得用来扩大本轮白名单。缺资源记ENV_BLOCKED，未运行记NOT_RUN。fixture/测试错误可在两测试或新session证据内纠正，保持同等或更强断言；产品错误只留证据不修。

八、失败和停止规则

发现确认业务失败、合同冲突、必须修改范围外文件：记录file/line、入口、前提、实际HTTP/持久状态、已有保护、建议、解除条件，相关项标FAIL或NOT_RUN，禁止转成业务修复。
源码漂移/并发写入、隔离所有权不明、真实环境连接、append-only破坏、未知资源清理、无法安全收束事务：停止相关动作，保留现场，不做reset或广泛清理。其他不共享阻碍的SUP项仍可完成。
若SUP-01业务失败不影响SUP-02读取验证，交付失败证据后继续SUP-02；不得为了“全完成”改变验收。所有本轮授权项完成或真正受阻后停止，不选择任何其他STANDARD任务。
上下文/额度不足时先写真实状态、已执行命令、未完成项和精确接续读序；不得把缺项标COMPLETE/PASS。

九、逐项交付、记录边界和收尾

目录：execution/supplements/<sessionId>/{SUP-01,SUP-02,SUP-03}/。
每项交付 authorization.json、change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md；SUP-02另交field-comparison.csv/md；SUP-03交第六节指定文档和coverage.csv。
会话根交付authorization.json、SESSION_SUMMARY.md、REVIEW_ENTRY.md、final-integrity.json、resume.md；REVIEW_ENTRY列出全部实际日志/失败尝试/控制运行与逐项证据，供独立审阅。
rollback只说明本轮测试/文档增量的人工撤销范围，不执行reset，不称生产回滚已验收。

补充task-state记录SUP-ID、parentTaskIds、kind、implementation/delivery、validation、release=NOT_EVALUATED、业务源码修改数=0、精确证据和未覆盖范围。SUPPORTED不是FIX_ACCEPTED；控制坏结果不是修复PASS；静态合同核对不是动态业务验收。

现有state允许更新仅为：新增/追加supplementalExecution会话/结果引用，记录授权、两测试版本摘要和独立审阅待办；不要修改旧原tasks/package轴、counts、授权历史、latestReviewRef、旧任务latestRun/已接受裁定、activeTask/nextReadyTask。本轮activeSupplement/nextSupplement只放supplementalExecution内部。旧值保留。
两级HANDOFF只追加本轮补充章节，引用新session/新测试版本，注明尚待独立审阅；不重写历史，不把下一就绪业务任务改成SUP任务。
两份版本历史只追加新entry，记录本轮两个测试、6个允许记录文件及新session产物摘要；不要把两个版本历史本身纳入其自身hash，不改旧entry。所有文件收尾后再封摘要并读回验证。只引用当前源码hash，不能称原业务验收已自动绑定新测试或新批准。

final-integrity必须核对：
- 相对启动基线，业务backend/src/frontend/src文件集及hash零变化；schema/guard/依赖/其余测试和配置零变化。
- 实际仓库增量只包含两测试、新session和6个限定记录文件；区分启动前dirty变化与本轮增量。未知增量记录并暂停，不归因或删除。
- 旧审计/v1/旧run/旧review/旧矩阵/REVIEW_ENTRY冻结摘要不变；新session失败日志保留。
- TASK_GRAPH/PACKAGES/FINDING_TO_PACKAGE/ACCEPTANCE_MATRIX/all54/remaining/门禁和决定hash不变；原54实现18 COMPLETE/2 IN_PROGRESS/34 NOT_STARTED、验证10 PASS/37 NOT_RUN/7 ENV_BLOCKED/0 FAIL、306结果53 PASS/228 NOT_RUN/25 ENV_BLOCKED/0 FAIL保持。起点实际有已归属后续变化则先登记，不硬编码修改统计。
- 原三个包IN_PROGRESS，B10/B04/B14及31旧开放项未关闭，所有发布NOT_EVALUATED；新业务失败若发现只登记补充证据和待复核，不静默覆盖旧接受或掩盖矛盾。
- 两测试的完整用例/断言保留，新增计数准确；共享helper没有变化。
- 两份新增版本摘要逐文件读回无漂移；cleanup实际完成；有未完成清理就如实标记。

十、最终汇报后停止

按顺序汇报：
1. SUP-01/02/03状态、父任务不变及包未完成；
2. LR4-01/02/03补充处置，哪些只是记录、哪些独立证据已固化，旧发现仍开放；
3. 实际文件清单和业务源码零变化证明；
4. 真实命令、套件/控制结果、DB持久状态、失败尝试、NOT_RUN/ENV_BLOCKED、清理；
5. 新session REVIEW_ENTRY及各任务产物链接；
6. 原54/306统计保持、剩余业务门禁不变、尚待独立审阅；
7. 若发现范围外问题，只列证据和最小授权请求，不执行修复。

请实际完成本轮允许的测试补强、合同核对和交付，不要只回复计划。完成后停止，等待独立审阅；不把旧“继续直到全部完成”用于扩大本轮范围。
```
