# CodeBuddy 下一轮：三个 SUP 有界返工

依据：`execution/reviews/2026-10-03-codebuddy-supplements/` 的独立复核及 `NEXT_EXECUTION.md`。

本文只是执行交接文件。编写本文不启动实施、不授予业务规则批准、不改变原54任务/306验收状态。用户把下面完整指令交给 CodeBuddy 后，本轮限定授权生效。配套 manifest 登记的是编写时工作区，不代替执行者的新起始登记。

```text
你是 RDPMS 本地执行者 CodeBuddy。请按下面固定清单完成三个 SUP 的返工及共有的 runner/交付记录修正，实际修改允许的测试、运行验证并落盘，随后停止等待独立审阅。

只做清单要求的定向判断，不重新设计架构，不自行选择 STANDARD 任务，不顺手修业务代码。测试通过数量不能代替下面的覆盖要求。

仓库：/Users/renkang/VS Code/project-management
计划目录：docs/remediation/2026-10-01-rdpms/
本指令：execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md
配套：execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_MANIFEST_2026-10-03.json
最新补交独立复核：execution/reviews/2026-10-03-codebuddy-supplements/
原审计 HEAD：138cf2da1b63195cef7e884f69bdf8ded6ed3c21

一、唯一授权范围与优先顺序

固定执行顺序：准备/新 runner → SUP-01 → SUP-02 → SUP-03 → 交付封存。

SUP-01：TEST_ONLY，父任务 RP10-T02；处理 LR5-01、相关 LR5-04/05。正确原映射 LR4-03，关联 B10。
SUP-02：TEST_ONLY，父任务 RP08-T01；处理 LR5-02、相关 LR5-04/05。正确原映射 LR4-02，关联 B04。
SUP-03：REVIEW_ONLY，关联 RP04-T01/RP08-T01；处理 LR5-03、相关 LR5-04。正确原映射 LR4-02；B20只用于核对原项目级范围。
LR5-04/05 的记录/runner修正是三项交付的共有工作，不是新增业务任务。

这三个 SUP 不加入 TASK_GRAPH，不把54改成57，不增加原306验收行。RP10-T02、RP08-T01、RP02-T01的原本地业务接受不因本轮自动撤销或升级，整包未完成，发布仍 NOT_EVALUATED。
最新复核已独立确认报告19/19、同步12/12通过；同时确认补交覆盖和交付不完整。不得用执行者之前“全部完成”覆盖独立返工裁定。

本指令替代旧提示词中扩大执行范围、自动选择下一任务、继续全部STANDARD任务和旧首轮指针。旧安全/隔离/冻结规则继续适用，冲突以本轮更窄范围为准。
本轮即使得到新的业务批准，也不能自动实施其他任务。任何范围外修复都只能交证据和最小授权请求，不实施。

二、精确写入白名单

相对仓库根，仅允许修改两个现有正式测试：
- rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs
- rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs

仅允许在新目录创建 runner、控制探针、记录和证据：
docs/remediation/2026-10-01-rdpms/execution/supplements/<唯一新sessionId>/
建议 sessionId 为 test-contract-rework-2026-10-03-<唯一后缀>，必须先确认不存在。所有 attempt 追加新目录，不覆盖失败日志。
若同一授权已有可确认归属的后续结果，先只读核对，再创建接续 run，只补未完成项；不得覆盖旧 session。

以下六个现有记录文件仅可按第九节受控追加，路径相对计划目录：
IMPLEMENTATION_STATE.json
execution/state.json
HANDOFF.md
execution/handoff.md
REVISION_HISTORY.json
EXECUTION_REVISION_HISTORY.json

所有其余仓库文件只读。尤其禁止修改：
- backend/src、frontend/src、deploy及任何业务/配置代码。
- 其他正式测试、新正式测试文件、tests/helpers/stubDeps.mjs及共享fixture/helper。
- package/lock/tsconfig、DB guard、schema、迁移、seed。
- 总计划、TASK_GRAPH、PACKAGES、FINDING_TO_PACKAGE、ACCEPTANCE_MATRIX、all54/remaining表、决定/开放项/跨包合同/发布门禁、输入manifest、PLAN_VALIDATION。
- 原审计/manifest/v1、所有旧run/旧review、旧session test-contract-2026-10-03、旧runner、本指令及其manifest、计划根REVIEW_ENTRY。

禁止临时改业务源码再恢复来做负对照。测试内局部真实DB适配允许；共享helper或其他文件需要改动时，记录最小扩展请求，暂停该分支。
构建只可生成本轮确认自有的 backend/dist，启动时若已存在且归属不明，记 ENV_BLOCKED，不覆盖、不删除。
禁止子代理、模型切换、依赖安装/升级、npx自动下载、stage/commit/push/merge/deploy、reset/clean/stash、生产/共享数据库、真实账号、真实数据恢复、新业务迁移、删审计行/关trigger、代签任何决定。

三、必读与起始登记

完整读取本文件及配套manifest；再完整读取旧 CODEBUDDY_TEST_CONTRACT_EXECUTOR_PROMPT_2026-10-03.md、其manifest、原 EXECUTOR_PROMPT.md 及规定的全部 v2 必读文件。旧扩大范围不生效。
完整读取最新补交复核中的 REVIEW.md、findings.json、validation-summary.json、DELIVERY_ERRATA.md、NEXT_EXECUTION.md、task-readiness.json、handoff.md、authorization.json。
按最新复核引用读取 evidence/requirement-to-code-trace.json、record-integrity-analysis.json、executor-run-inspection.json、runner-cleanup-control.json、start-baseline.json、frozen-inputs.json、independent-validation.json、final-integrity-check.json、version-summary-readback.json、owned-review-runner.py，以及两个 independent-rp10/independent-rp08 的 attempt-01/run-results.json 和日志。
读取旧session每个SUP的七类交付、SUP-02字段表、SUP-03合同/覆盖/建议及旧run-suite.py；只读，不重跑旧失败脚本。
按原补交指令读取 RP10/RP08/RP04任务卡、B10/B04/B20映射、相应全部关联验收行和所引历史证据；用原定义约束结论，不重扫全仓历史。

核对 HEAD、git status、当前diff、两个测试和相关源码hash，区分原HEAD与dirty worktree。不能因为HEAD相同就推断工作区相同。
本manifest中的当前hash或最新独立复核hash不符时，先确认增量归属及后续证据。不能解释或有并发编辑，暂停重叠动作；不得覆盖、恢复或删除未知变化。

修改/运行前，在新session保存 authorization.json 和 evidence/start-baseline.json，登记本轮用户指令、执行者、SUP-ID/父任务、白名单、临时资源所有权、命令和停止条件。
保存两个测试原始副本及sha256；逐文件登记 backend/src、frontend/src 的完整文件集和sha256，必须包含untracked，不能只用git跟踪文件聚合。特别包括 modules/files/fileReadService.ts、modules/projects/projectCommands.ts。
登记schema/guard/依赖/配置、其余测试、冻结计划输入、六个受控记录文件的起始摘要；保存旧审计/v1/旧run/旧review/旧session的目录文件清单和摘要。哈希登记不等于重审所有源码。
记录真实54任务和306验收统计。旧session缺失起始manifest/清理记录的事实只能在新errata中说明 HISTORICAL_EVIDENCE_UNAVAILABLE，不能补写旧目录、倒填时间或声称重建了当时起点。

四、新 runner：先解决 LR5-05，才能正式验证

只在新session复制/修正 runner，旧runner冻结。只使用已安装工具。
创建集群之前校验仓库ROOT、backend目录、正式测试路径、guard/build脚本及现有编译器路径。读取实际脚本的dotenv、子进程、自动build和cleanup行为，不读取真实环境凭据。
每个完整套件使用各自全新的自有loopback PostgreSQL集群/唯一rdpms_test_*库、所有权marker、合成actor、私有0600临时env。不得复用旧审计库、不同套件共享库或绕过guard。
仅用既有schema/迁移初始化自有库，不生成迁移。先确认dist不存在；在build开始前登记输出归属/清理责任，build失败生成的自有输出也须检查清理。

必须逐项落实：
1. guard-drop、cluster-stop、dist清理、临时根处理、结果写盘各自隔离异常；前一步抛异常也要继续尝试cluster-stop和写结果。
2. 无论build/suite/cleanup成败都写run-results.json，保存精确命令、退出码、错误、日志和所有权。init/start失败也不能只留两个日志而没有结果/清理说明。
3. 必需检查或cleanup失败影响总退出码，不能suite exit0就整次PASS。guard check在reset前预期exit2是按实际guard合同登记的成功前提，不误判成业务失败。
4. cluster-stop失败时保留自有目录并记录解除条件，不能删除仍运行集群的根。禁止泛化kill/pgrep清理、未知资源删除或修改guard。
5. 用新session内的安全控制流模拟验证“drop异常仍stop/写结果”“失败build仍检查输出”“cleanup失败总退出非0”。模拟必须标 SIMULATED_CONTROL，不冒充真实数据库故障；正常两套件仍必须是真实自有数据库。
6. 清理日志/结果必须先写到持久session目录再删除自有临时根。退出前核对本轮PID/端口/所有权marker和路径，不凭全局没有postgres推断所有权。

runner控制只验证运行器，不是产品验收，不启动其他测试包。

五、SUP-01：只修改报告正式测试

目标：补齐 LR5-01；保留当前19条测试的业务断言，迁移相关局部屏障并添加缺失覆盖。允许因同等/更强断言做局部重构，不允许删除、skip或放宽断言来通过。

固定清单：
1. 盘点所有报告并发用例及 gatedClient/gateOnReportMethod/gateOnReportMethods 的使用。相关旧单原语屏障统一到本文件局部受控工具，包括A02/A03/A03b/A04b/A06b及相关草稿保存竞争；非并发用例不重构。
2. 匹配指定迟到请求的报告id，或projectId+authorId+reportType+periodKey，以及唯一payload标记。create取data，upsert取where/create/update，update/updateMany取where/data；恢复写入没有data.periodKey也必须能命中。不能只登记methods数组或依赖periodKey单字段。
3. 仅拦目标迟到请求一次，不拦赢家/submit；事务options透传，代理继续执行真实Prisma/SQL。
4. 给create/upsert/updateMany/update四种原语建立明确兼容性矩阵；在本正式测试文件内，用自有库的独立合成报告实际调用四种参数形状并记录method/目标/命中/释放/持久结果。各自必须真实命中，不能把create命中后内部调用upsert算作upsert屏障验证。此矩阵是测试工具兼容性，不是四项HTTP业务修复/反例验收。
5. 当前正常HTTP模式保留“无行迟到POST暂停→赢家POST201→submit200→放行迟到409 DUPLICATE_PERIOD_KEY”；补齐“墓碑迟到恢复暂停→赢家恢复201→submit200→放行迟到409”的正式用例。证明恢复前真实deletedAt、成功鉴权/权限/输入、赢家和submit均提交成功。
6. 两条正常竞争都核对Report/ReportVersion状态、正文、currentVersion及deletedAt，晚请求成功receipt为0，audit数量/目标与赢家一致；恢复成功审计仅一次。不得因夹具为空、请求401、缺资源而算成功。
7. 保留一个 SEMANTIC_NEGATIVE_CONTROL：只把匹配迟到create在测试适配层转为同事务真实无条件upsert；其他请求与业务源码原样。确认屏障命中、赢家创建/提交成功、迟到201、SUBMITTED正文与快照分离、多出成功receipt/create审计。控制exit0只表示预期坏状态被识别，不表示修复PASS。无需扩成五项源码回退控制。
8. 全部本文件相关并发屏障用try/finally保证release、clear timer、await pending请求/事务收束；即使中途断言失败，也不留下请求挂起。用确定性barrier安排先后，不增加sleep或拉长timeout掩盖不命中。兼容性和异常释放控制保存实际轨迹。
9. BARRIER_NOT_REACHED、控制没有产生坏状态、正常业务失败分别登记；不能把超时或干净409记为缺陷复现。发现业务失败只记录，不修src。
10. 跑整个报告正式套件，保存原19条及新增条目的名称/结果和逐项覆盖表。保留PUT legacy/modern、POST草稿、sync、replay/CAS及版本并发断言。

沿用补充case原含义：
SUP-01-01：原语兼容/实际屏障命中。
SUP-01-02：当前两条正常修复竞争验证（新建+恢复后submit）。
SUP-01-03：真实DB语义负对照。
SUP-01-04：完整正式回归、释放/收束和无范围外改动。
映射原AC-B10-01/03、PAC-RP10-02、TASK-RP10-T02仅补证，不修改旧矩阵或旧裁定；AC-B10-02/INT-PC03-01未完成，不采用新submit政策。

六、SUP-02：只修改同步正式测试和新字段表

目标：补齐 LR5-02；保留当前12条及七实体精确行/字段值正例，不改业务投影。

固定清单：
1. 七实体为projects、projectPhases、tasks、milestones、monthlyProgress、reports、projectMembers。先普通API200且具体目标ID非空，再sync200且同ID行非空；裸数组/list/单对象按实际入口解析，不静默退空集合。
2. 保留逐键逐值deepEqual及manager等窄嵌套投影比较，不用整段JSON搜键代替。用活跃目标ID，避免误取旧墓碑；报告目标必须属于该同一actor。
3. 每实体做同一actor成对请求：正例与拒绝例的userId、角色、成员资格、报告作者归属完全一致，只移除该实体目标读权限，其他权限原样。断言两次actor身份相同及权限差集仅目标项。不得member成功/zero用户拒绝混成“同账号撤权”。
4. 拒绝：普通API403、sync对应upserts和tombstones为空；不把401、错ID、无成员或空库当权限对照。保留原不同角色/非成员/零权限/elevated/own-only/撤成员/墓碑/增量用例。
5. 新field-comparison.csv与md按实际目标行/源码/运行结果产生，逐实体包含在线入口/响应形状、权限、目标ID、字段名/字段数、精确键值比较、正确禁止字段、source file/line、case及日志引用。合成值可以保存，不能暴露凭据。
6. 纠正旧表误列：code/templateId/completedAt/submittedById及部分review字段在当前相应投影中允许时，不能写成禁止。区分“读取投影字段”和“客户端禁止写入字段”；逐实体核对，不从全局批量赋值黑名单推断所有读字段禁止。
7. 来源标CURRENT_IMPLEMENTATION_COMPARISON，独立产品/安全字段政策批准为NOT_EVALUATED。普通phase软删例外、报告own-only同步额外限制如实记录；不改sync字段/普通API去迎合错误表。
8. 在新的独立自有库跑整个同步正式套件，保留原12条及新增结果。逐实体对照表任一缺项如实FAIL/NOT_RUN。

沿用case：SUP-02-01七实体非空同ID；SUP-02-02逐键逐值/正确禁止字段；SUP-02-03同actor仅移除目标权限；SUP-02-04完整回归/范围。
只补原AC-B04-01/03、PAC-RP08-01、TASK-RP08-T01证据；不执行RP08-T02缓存撤权/历史回填/IndexedDB，不请求注册项目全局例外。condition=false的门禁是NOT_APPLICABLE及理由，不是PASS或批准。

七、SUP-03：只读阶段合同返工

不修改阶段/项目/sync/前端/正式测试。只补文档和覆盖矩阵，处理 LR5-03。
读取从 projects.js、phases.js、sync.js、kernel/projectAccess.js、prisma/schema.prisma、frontend/src/api/endpoints/projects.ts 开始，只追踪指定phase读写链和直接客户端一层。ProjectDetail.tsx、PhaseProgressBar.tsx可定向只读，coverage.csv登记原因；禁止全仓软删审计。

固定清单：
1. 入口表至少含GET /api/projects/:id内嵌phases、GET /api/projects/:id/phases、GET /api/phases?projectId=、GET /api/phases（无projectId）、GET /api/phases/:id、sync live/tombstone读取。逐项列权限/project scope、where/select、deletedAt行为和真实行号。
2. Trace sync可达阶段软删和upsert/恢复相关行为；区分phase资源DELETE/restore与DELETE /:id/transitions/:toPhaseId边删除。找不到阶段资源入口记lookupResult=NOT_FOUND，不能泛称所有DELETE不存在。
3. 查api wrapper的直接调用者；wrapper存在不证明实际调用/UI显示。核对ProjectDetail拿project detail、PhaseProgressBar读取template.content.phases还是ProjectPhase实例。找不到直接调用者写NOT_FOUND及查询范围；未看实际UI写NOT_RUN，不能声称前端已展示软删实例。
4. 引用B20、AC-B20-01/02/03、PAC-RP04-03原定义：原项目list/count/search/stats/detail/显式回收范围，与阶段实例读取是否同范围分开说明。不能自动重开B20或把B20改成阶段规则。
5. 没有具名批准来源就标CONTRACT_UNRESOLVED；区分当前实现、批准来源、测试期望、建议。合法权限下普通阶段列表返回软删行的既有行为，不能称未经授权泄露或本轮新回归。
6. 可引用已有独立自有库证据，但注明来源/旧源码hash/层次；本轮不新增阶段端点动态探针、浏览器、UI或数据调查。静态核对项可PASS，动态/API/UI项未运行保持NOT_RUN，不能静态代动态。
7. 新交付phase-read-contract.md、scope-assessment.md、coverage.csv、next-action.md及七类基本文件。建议只在KEEP_CURRENT/SCOPED_FIX/CONTRACT_CLARIFICATION内给有证据选项、最小未来路径/验收/所需批准，不写业务patch，不创建/激活实施任务。

沿用case：SUP-03-01入口/写入链；SUP-03-02直接客户端/B20合同范围；SUP-03-03证据层次/未覆盖；SUP-03-04具体建议/源码零变化。
本项COMPLETE仅表示这次只读核对交付完整，不是阶段政策批准、业务修复或UI验收。

八、真实验证及限制

本轮必跑：修改后的两个完整正式集成套件（分别新自有库）、SUP-01真实语义控制和四原语兼容轨迹、runner安全模拟、backend npm run build、npm run typecheck、npm run lint:undefined、git diff --check。
构建/检查用实际package scripts及现有TypeScript PATH，不安装。可以由每套件runner执行build/检查；记录实际次数，不补写没执行的命令。
每条精确命令保存退出码/日志，真实DB行/关系/audit/receipt及清理保存到session。先合法成功后拒绝；注入可信actor仅认证后路径，JWT全链NOT_RUN。
不默认重跑其他业务回归、全后端、全仓历史或306行。前端IDB/浏览器/候选/目标环境/联合/部署不在本轮，保持真实NOT_RUN/NOT_EVALUATED。
缺环境ENV_BLOCKED，未运行NOT_RUN；测试/fixture问题仅在白名单内修且保留失败尝试。业务问题只留证据，不放宽校验/权限/事务来过测。
合成审计actor留到整库drop，不删除审计行，不关闭trigger。仅清理本轮明确自有资源，不能用未知资源作兜底。

九、逐项交付与记录修正（LR5-04）

每SUP目录必须含authorization.json、change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md；另外保留第五至七节要求的矩阵/字段CSV/md/合同/覆盖/建议。
session根含authorization.json、SESSION_SUMMARY.md、REVIEW_ENTRY.md、final-integrity.json、resume.md、新runner、evidence/start-baseline.json、delivery-errata.md及全部attempt日志。
acceptance使用PASS/FAIL/NOT_RUN/ENV_BLOCKED；case定义不换名换义。control的PASS标kind=SEMANTIC_NEGATIVE_CONTROL或SIMULATED_CONTROL，静态项标STATIC_REVIEW，绝不冒充产品/真实故障验证。
task-state分开delivery/implementation、validation、independentReview=PENDING、release=NOT_EVALUATED、parentTask状态不变、srcChanges=0和未覆盖项。SUPPORTED不等于FIX_ACCEPTED，局部套件PASS不等于SUP所有要求COMPLETE。
新errata纠正原映射SUP01→LR4-03、SUP02/03→LR4-02，LR4-04并未定义；列旧历史起点/命令/清理证据缺口，不改旧错误记录。当前不完整实施36项，不能写“其他51STANDARD任务”。

两个state的旧supplemental对象及其independentReview保留，不改旧字段/裁定；只在根state的supplementalExecutions.continuations[]和execution/state的supplementalExecution.continuations[]追加本新session记录。
新record可含activeSupplement/nextSupplement、授权、真实结果、正确映射、证据/新测试hash和独立审阅待办；不能触碰原tasks/packages轴、counts、decisions、authorization历史、latestReviewRef、latestRun、activeTask、nextReadyTask或原已接受裁定。
两级HANDOFF仅追加本session章节，注明待独立审阅。两份版本历史仅追加entry，不改/删/重排旧entry；两份history均不放进任一新entry的sha256 map，避免自包含或交叉循环。

封存顺序：完成测试/文档/日志 → 追加state及handoff → final-integrity → 生成两份历史新entry → 读回核对。
所有hash为真正逐文件SHA256，路径基准明确REPOSITORY_ROOT或PLAN_DIRECTORY，不能使用APPENDED_*、SESSION_DIR、仅通用聚合。currentSourceHashes含当前完整业务文件集和两个正式测试；最后逐文件读回与实际一致。
final-integrity避免循环hash：它不自包含、不hash随后还要追加的两份history；history可hash已封存final-integrity及其他交付。history最终自身hash/读回报告在最后回复列明，不写回导致循环。若任何封存后文件又变，重算受影响entry/封存后再读回，保留失败记录。

final-integrity必须证明：
- 含untracked的业务src文件集/sha256启动结束相同；schema/guard/依赖/配置/其他正式测试相同。
- 本轮增量只有两个测试、新session和六个受控记录文件；启动前dirty变化保留。未知漂移暂停相关动作，不能删除或自行归因。
- 冻结原审计/v1/旧run/旧review/旧session/旧prompt/旧矩阵与计划输入不变；失败attempt完整。
- state去掉本次continuations新增后与启动内容语义一致，旧独立裁定保留；handoff旧前缀不变，history旧entries不变。
- 54任务/306验收及批准/门禁未改，所有发布NOT_EVALUATED，旧发现/31开放项未关闭。
- 两个完整正式套件与新增case数量准确，原测试业务断言保留，cleanup各步真实记录；清理未成功不得总PASS。

rollback只说明本轮两个测试/新文档增量的人工撤销范围，不执行回退，不称生产回滚已验收。

十、阻碍、收尾和强制停止

业务失败、必须范围外变更、矛盾合同：留入口/前提/file/line/HTTP/持久状态/已有保护/建议/最小解除条件，标真实FAIL/NOT_RUN，禁止自行修复。
无法确认隔离所有权、真实连接、源码并发编辑、append-only破坏、无法安全收束时，停止相关动作并保留现场。可以继续不共享阻碍的SUP，不把失败改成COMPLETE。
上下文/额度不足先落盘真实状态及精确接续读序；不以“收尾”关闭缺项。

最终一次汇报：
1. SUP01/02/03每项状态及case完成表，共有runner/记录修正状态；
2. LR5-01至05的证据处置、正确LR4映射和仍未覆盖项；
3. 精确文件增量及业务源码零变化证明；
4. 两套真实DB结果、四原语轨迹/语义控制/模拟的区别、真实命令日志、失败attempt和清理；
5. 新session REVIEW_ENTRY及所有交付链接、真实最终history哈希读回；
6. 原54/306统计、旧发现/门禁不变、发布NOT_EVALUATED；
7. 任何范围外问题仅证据和最小授权请求。

完成三个SUP和共有交付，或全部可独立部分已完成而剩余明确受阻后，必须停止等待独立审阅。禁止选择/激活任何其他STANDARD任务，禁止继续业务修复。请开始执行，不要只回复计划。
```
