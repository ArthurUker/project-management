# CodeBuddy 下一轮执行指令：LR6 四项有界收尾

编写日期：2026-10-04。配套清单：`CODEBUDDY_FINAL_SUP_REWORK_MANIFEST_2026-10-04.json`。

本文件是待用户转交执行者的指令。编写本文件没有启动实施、测试、构建或批准业务规则。用户将本文件的执行要求发给 CodeBuddy 后，本地限定执行授权才在该执行会话生效。

本轮目标：一次完成最新独立复核列出的 LR6-01～04；复用已接受的同步证据，关闭重复返工的入口。这里的“收尾”只指四项补充交付，不表示原 54 项任务或产品修复全部完成。

```text
你是本轮 RDPMS 本地执行者。按下面固定步骤实际修改白名单测试、验证并交付。只分析当前步骤直接需要的代码和证据；不要重新设计架构、重扫全仓或自行选择其他修复任务。

【0. 仓库、权威及固定范围】
仓库：/Users/renkang/VS Code/project-management
计划目录 P：docs/remediation/2026-10-01-rdpms/
原审计基线：138cf2da1b63195cef7e884f69bdf8ded6ed3c21
本轮详细指令：P/execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md
配套清单：P/execution/CODEBUDDY_FINAL_SUP_REWORK_MANIFEST_2026-10-04.json
独立裁定目录 R：P/execution/reviews/2026-10-04-codebuddy-supplement-rework/
冻结旧会话 O：P/execution/supplements/test-contract-rework-2026-10-03-cb1/

本轮仅有四项：
- CLOSE-01 / LR6-01 / SUP-01 / 父任务 RP10-T02：报告正式测试定向补正。
- CLOSE-02 / LR6-02：新会话运行器主异常及结果写盘失败处理。
- CLOSE-03 / LR6-03：新订正交付、唯一版本 ID 和无循环封存。
- CLOSE-04 / LR6-04 / SUP-03：两句静态合同摘要勘误。
SUP-02 本地范围已经独立接受，不是本轮返工任务。
四项连续完成后统一汇报并停止等待独立审阅，不逐项等待“继续”。

本轮专门指令替代旧 prompt 的首轮指针、STANDARD 自动选择及要求重做 SUP-02 的旧指针；v2 的隔离、证据、未批准门禁和历史保护要求继续有效。
四项补充工作不加入原 54 项任务图或 306 行验收矩阵，不扩大任何父任务/整包的完成范围。

【1. 授权和禁止事项】
用户转交本指令，授权这四项范围内的本地测试修改、新会话运行器/文档交付、相关构建及自有临时 PostgreSQL 验证。清单 executionStarted=false 是编写检查点，不要求用户重复批准上述范围。
不授权业务源码修复、部署、提交、stage、push、merge、reset、clean、stash、依赖安装/升级、业务迁移、真实账号操作、生产/共享数据库或真实数据访问恢复。
不调用子代理，不切换模型，不代签 PENDING/PROPOSED 决定，不关闭 B04/B10/B14/B20 或 31 个历史开放项。
不得因“加快进度”启用阶段 deletedAt 过滤、严格 revision、重提交新政策、自定义角色绑定、DAG 扩展或其他 STANDARD 任务。

【2. 必读与证据复用】
先完整读本文件及配套清单，再按以下顺序读取；可批量读取独立材料，禁止边未读完边改代码：
A. R/REVIEW.md、findings.json、validation-summary.json、NEXT_EXECUTION.md、task-readiness.json、handoff.md、final-integrity-check.json。
B. P/EXECUTOR_PROMPT.md 及其 v2 必读文件：README、GAP_REVIEW、REMEDIATION_PLAN、HANDOFF、IMPLEMENTATION_STATE、TASK_GRAPH、DECISION_REGISTER、OPEN_ITEM_GATES、CROSS_PACKAGE_CONTRACTS.json/.md、RELEASE_GATES、INPUT_MANIFEST、REVISION_INPUT_MANIFEST、REVISION_HISTORY、PLAN_VALIDATION；另读 execution/state.json、execution/handoff.md、EXECUTION_REVISION_HISTORY.json。
C. PACKAGES.json/.md 的 RP10 条目、FINDING_TO_PACKAGE.json 的 B10/B20 条目、ACCEPTANCE_MATRIX.csv 中 RP10-T02 的全部关联行；查看当前 remaining-task-gates.csv。只追溯本轮确有需要的历史证据，不重读全部历史包。
D. R/evidence/helper-controls.json、runner-exception-controls.json/.py、record-integrity-analysis.json、phase-contract-check.json、start-baseline.json、frozen-inputs.json；按当前工作项读取所引用原始日志。可参考 R/evidence/owned-review-runner.py。
E. O/REVIEW_ENTRY.md、SESSION_SUMMARY.md、delivery-errata.md、final-integrity.json、run-suite.py、SUP-01/02/03 的交付及最新正式 attempt 的 run-results；按需要读取两份正式测试及阶段读取源码。

复用原则：R 已确认当前报告 22/22、同步 12/12、四原语真实命中、恢复→submit 竞争、SUP-02 的 101/101 字段表、源码零变化。先核对绑定 hash，再引用已接受的证据，不重新制作 SUP-02 字段表或权限矩阵。
复用必须标 evidenceMode=REUSED_INDEPENDENTLY_VERIFIED_EVIDENCE、原运行/复核路径、hash 和覆盖范围；本轮未执行的命令不能写成“本轮 PASS”。
原例外与联合验收仍保持实际 NOT_RUN/ENV_BLOCKED；特别是 AC-B10-02、INT-PC03-01、RP08-T02、目标环境/JWT 全链/IDB/UI/部署。

【3. 启动登记与文件白名单】
先记录 HEAD、git status、已有工作区差异、执行者、允许文件、测试/资源所有权、禁止事项及停止条件。比对配套清单与 R 的当前基线，不要求计划内源码等于原审计 hash。
新建唯一会话 S：P/execution/supplements/lr6-closeout-2026-10-04-<唯一后缀>/。已有同名目录时先接续状态；不能覆盖旧结果。每次动态尝试另建 attempt-NN。
S/authorization.json 登记 CLOSE-01～04、父任务、授权来源、范围和独立审阅状态；不要把授权提升成产品/安全批准。

允许修改的现有代码只有一个文件：
rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs
允许新建：S 下本轮 runner、控制脚本、文档和证据；不得把新脚本写进共享测试 helper 或业务目录。
允许追加的既有记录只有六个：
1) P/IMPLEMENTATION_STATE.json：只追加 supplementalExecutions.continuations[]。
2) P/execution/state.json：只追加 supplementalExecution.continuations[]。
3) P/HANDOFF.md：只在末尾追加本轮节。
4) P/execution/handoff.md：只在末尾追加本轮节。
5) P/REVISION_HISTORY.json：只追加本轮唯一 versions entry。
6) P/EXECUTION_REVISION_HISTORY.json：只追加本轮唯一 entries entry。
不能重写旧 supplemental 字段/continuation、旧 history entry、旧 handoff 前缀、root updatedAt/activeTask/latestReviewRef/授权聚合/业务轴以迁就本轮。
JSON 文件可重新序列化，但所有原字段和原数组元素的结构值必须保持一致；旧 entry 的规范化 hash 必须保持。Markdown 原字节前缀必须保持。

只读保护：backend/src、frontend/src、deploy、同步正式测试、其他测试/共享 helper、seed/schema/guard/package/依赖/配置、全部原规划/审计/manifest/v1、所有旧 run/session/review。
backend/dist 只允许本轮构建在启动时确认不存在后生成和清理；已有且归属不明时禁止覆盖/删除。
记录逐文件 SHA256，包含未跟踪业务模块；只有报告测试及六个受控追加记录可以与启动内容不同。

【4. 固定执行顺序】
依次完成：启动登记 → CLOSE-02 安全故障控制 → CLOSE-01 定向测试修改 → CLOSE-04 新文档勘误 → 最终报告套件/检查 → CLOSE-03 封存与读回。
每项范围和结果独立可追溯。某项受阻时保留 FAIL/ENV_BLOCKED 及解除条件，继续可独立完成的项；禁止以账本或文档 PASS 替代未通过测试。

【5. CLOSE-02：新 runner，禁止修冻结旧 runner】
复制 O/run-suite.py 或参考 R 的独立 runner，在 S 下修正；明确仓库绝对路径并检查 ROOT/test/compiler，避免依赖新目录层数推导错误。
必须实现：
a. subprocess 主流程 TimeoutExpired、FileNotFoundError/其他启动异常都记录失败命令、异常类型、退出语义及可用输出；日志去敏。
b. 主异常加入 criticalFailures；cleanup 完成后仍返回非零。禁止 finally 内成功 sys.exit 覆盖原异常。
c. run-results 写盘失败必须返回非零；写失败原因至少保存到不同目标的 fallback 日志，若仍失败则 stderr 原样保留。不能用“未写结果但返回0”当成功。
d. drop、stop、dist/temp 清理分别 try/except；drop 异常仍尝试 stop，stop 失败保留确认自有的集群根及精确释放条件。
e. 保留基于文件系统检查 dist 已不存在的判定；构建前登记所有权，失败构建的自有部分输出也应清理。

固定六项控制：非零 build、drop 抛异常、stop 非零、build TimeoutExpired、suite spawn FileNotFoundError、run-results 写盘 OSError。每项独立目录，均预期 runner 非零。
六项故障控制允许全部 subprocess 安全模拟，禁止为了模拟再创建真实数据库集群；明确标 SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED，不冒充真实 DB 故障测试。
检查预期执行次序、cleanup 尝试、criticalFailures/命令异常记录和 fallback；stop 控制不得删掉模拟“仍在运行”的自有根，控制结束后确认它没有真实进程再清理。
控制中的 dist/临时资源只能是确认自有的测试根，不触碰未知真实资源。
控制未通过时不得用此 runner 声称正式动态验证 PASS；保留全部失败日志。修正后六项均通过才进入真实报告套件。

【6. CLOSE-01：只修报告测试精度，不修业务】
定位当前 matchReportWrite（约106行）、draftWriteBarrier（约211行）及 legacy/modern/sync 三个草稿竞争用例（约256/294/329行）。行号只用于定位，以当前符号为准。
局部修改：
a. 匹配 identity 必须是目标 reportId 或完整 projectId+authorId+reportType+periodKey；再匹配迟到请求唯一 content.revision 标记。不能只按 periodKey，也不能 marker 缺省后放宽。
b. 逐原语解析真实参数：create.data；upsert.where/create/update；update/updateMany.where/data。标识和标记必须来自同一个目标写入的参数，不能把不同候选拼成错误命中。
c. 更新本文件相关 selector 调用者传齐身份和标记；完整键中任一字段缺失/错误、标记错误均不得触发。恢复没有 data.periodKey 时可按 where.id+payload 命中。
d. draftWriteBarrier 复用该匹配器，确实支持 where.id + upsert create/update payload；不能仅把 upsert 加入 methods 数组却仍只检查 data.content。
e. 三个既有 legacy PUT、modern CAS PUT、sync push 草稿竞争都使用 try/finally release、clearTimeout 和 pending settle；复用 reachBarrier/settleGate 或等价局部工具，不留下未清 timer、悬挂请求/事务或未处理 rejection。
f. 保留原22条正式用例名称、业务断言、真实DB持久状态检查、四原语矩阵、恢复→submit竞争及语义负对照。禁止降低断言、跳过测试、延长超时或引入 sleep 掩盖不命中。

必需精准补证：
- 完整业务键正例；分别错 projectId/authorId/reportType/periodKey/marker 及缺失必需字段负例；id+marker 正负例。可以纯 helper 控制，但明确层次，不当业务 DB 验收。
- 指定 draftWriteBarrier 对真实 Prisma upsert(where.id, create/update) 确实命中并放行，核对 firedMethod 和真实持久状态；在本正式测试文件补兼容用例。不能仅用 mock 或通用四原语矩阵代替 draft helper 证明。
- 三种草稿竞争中间异常都释放、清 timer、await 挂起请求；可采用同文件局部参数化异常控制，分别覆盖 legacy/modern/sync，并写出命中/异常/释放/收束证据。控制的预期异常不能误报业务修复 PASS。
新增名称唯一，不改原名；新增数量按实际报告，不能预填固定总数。定稿测试后再运行完整正式套件。
现有项目/账号/同步/角色测试、共享 stubDeps、应用 factory、路由和命令源码全部只读。

【7. CLOSE-04：只写新 errata】
在 S/CLOSE-04/scope-errata.md 中引用 O/SUP-03/deliverables/phase-read-contract.md:32 和 scope-assessment.md:20 的原结论，作两句明确订正：
- 带 projectId 的阶段列表先 resolveProjectAccess/assertRead；描述其单项目拒绝行为。
- 不带 projectId 的全局列表采用 projectVisibilityFilter；普通 actor 可见 manager/活跃 member 范围，SUPER_ADMIN 可返回无该过滤的列表。该全局查询/过滤器没有 project.deletedAt 条件，不能概括成全部入口 resolveProjectAccess 或统一404。
引用当前 phases.js 和 projectAccess.js 的实际行号；已有入口/客户端/B20范围材料按原证据引用，无需重做全表。
这是 STATIC_REVIEW/文档勘误；动态阶段 API、UI、真实客户端运行保持 NOT_RUN，阶段软删政策保持 CONTRACT_UNRESOLVED。
禁止给 projects.js/phases.js 增加过滤、改恢复/权限逻辑或重开 B20；发现额外现象只记录，不修。

【8. 定向验证与提速规则】
执行前检查 dotenv 读取、实际连接目标、DB guard、自动 build、子进程、fixture、cleanup；禁止读取真实环境凭据或使用固定旧审计库。
新建唯一 loopback 自有 PostgreSQL 集群和 rdpms_test_* 数据库，登记所有权；只在自有库内执行计划已有测试初始化流程，不绕过 guard，不新增业务迁移。合成审计 actor 随整库 drop，不删除审计行或关闭 trigger。
确认既有前端 TypeScript 5.9.3 后可经 PATH 给后端 build 使用，不安装依赖。实际运行：
1) 最终定稿报告完整正式套件；真实DB、真实状态检查及既有语义负对照完整保留。
2) 相关 backend build、npm run typecheck、当前 lint:undefined/check-undefined 脚本（以实际 package.json 名称为准）、git diff --check；记录精确命令/退出码。
3) 资源清理：guard drop、cluster stop、dist/temp 不存在、仅自有进程核对；非零/例外真实记录。
最终 attempt 的源码/测试 hash 必须与最终交付相同；运行后再改测试内容或名称，须在新 attempt 重跑相关完整正式套件，保留旧日志。

不默认重跑 rp08、其他后端集成/单元套件、全仓历史复现或306条验收。此次唯一测试文件独立变化，其他代码/helper/config/同步测试与已接受基线一致时，SUP-02引用R的12/12及101/101证据即可。
如果原保护文件有无法归属的新变化，停止受影响动作并记录最小解除条件，不能自动扩大修复白名单或通过重跑全仓掩盖漂移。
若出现业务失败，仅保存响应/DB/审计/receipt证据及失败状态，不修改业务源码；继续完成独立的 runner/文档工作。
注入可信 actor 不是完整 JWT 链；mock/模拟 runner 控制不是真实 DB 验收；目标配置、前端IDB/UI、部署都保持实际未运行状态。

【9. CLOSE-03：固定封存顺序，避免再返工】
旧 O 和 R 全部冻结。旧重复版本ID/错误摘要通过新entry订正，不改旧文件或旧entry“让它通过”。
当前需订正引用：REVISION_HISTORY.json versions[24]（0基，下同）重复 versions[23] 的 version；EXECUTION_REVISION_HISTORY.json entries[15] 为旧执行会话 entry。启动时核对定位与旧entry规范化SHA，写明确 correctsRef，不能只靠重复ID定位。
两个 registry 分别构造本轮唯一 version/revision ID，并写 sessionId；追加前检测该ID出现次数为0，追加后为1。禁止复制最后entry却漏改ID。

严格按顺序：
a. 定稿所有测试、命令、日志、四项交付及两级 handoff/state 追加节；先校验旧结构/前缀保留和新scope正确。
b. 生成 S/payload-manifest.json，逐文件记录 required deliverables/runner/controls/logs/current test/四个非history记录的 SHA256 与明确 pathBase（REPOSITORY、PLAN、SESSION）。每个map都必须真实可读回。
c. 生成 S/final-integrity.json，封存 payload-manifest hash、保护文件一致性、允许差异、cleanup和旧记录保持情况。排除自身、两份history、post-seal-readback；不得在内部再放这两份history的“最终postAppendSHA”。启动history摘要只能在 start-baseline 标明 HISTORICAL_START_SNAPSHOT。
d. 追加两份唯一history entry，引用订正位置、最新复核、最终payload-manifest/final-integrity/current test/hash。entry中的各路径明确pathBase；不包含自身或另一history的最终hash，不产生自引用/交叉循环。
e. 生成 S/post-seal-readback.json，作为预先声明的 POST_SEAL_READBACK 附件，不纳入已经封存的 payload/final-integrity，不要求history再封存它。记录两份最终history的真实hash、唯一ID、旧entry保持、逐文件摘要读回、JSON合法性及四项结果。
f. 所有required payload和已封存摘要必须逐文件读回一致，placeholder/短hash/APPENDED_*/SESSION_DIR 不得替代实际SHA256。读回失败标FAIL，保留日志；只重生成本轮未交付完成的新封存及本轮新增entry，不动任何旧entry。
g. 通过后停止编辑，不再追加总结使已封存文档漂移。post-seal-readback在其末次核对前定稿；该文件及排除原因在预先的payload策略中明确列出，不能靠临时扩大排除列表隐藏变化。

允许四项交付共用会话级完整性/资源证据，以精确引用复用；不复制上百份相同日志。

【10. 交付、状态与接续】
每项在 S/CLOSE-01|02|03|04/ 下交付七类：authorization.json、change-summary.md、evidence/（可引用共享会话证据）、acceptance.json、rollback.md、task-state.json、handoff.md。
会话交付：authorization.json、REVIEW_ENTRY.md、SESSION_SUMMARY.md、resume.md、payload-manifest.json、final-integrity.json、post-seal-readback.json、新 runner 和所有控制/正式运行日志。
每项 acceptance 至少写 caseId、LR映射、层次、适用性、status、evidenceRef、最终hash、未覆盖；允许 PASS/FAIL/NOT_RUN/ENV_BLOCKED。实现和验证分别记录，不把故障被识别误写成产品修复通过。
六个受控记录仅追加本轮continuation/末节/订正entry，reference R 的真实裁定，新的 independentReview=PENDING、release=NOT_EVALUATED；不得替独立审阅者写 ACCEPTED。
原54任务的实现/验证/发布、原306行、包状态、activeTask/nextReadyTask、原业务latestReviewRef、31开放项、门禁/批准不变。不要重画全54台账或更新其他镜像。
rollback只说明本轮局部测试/新会话交付的撤回边界，不自动还原整个dirty文件、删除旧证据或运行git回退。未知旧差异不得覆盖。

追加 S/next-business-inputs.md：仅从当前 remaining-task-gates/决定登记摘出最小批准/材料清单及对应解锁任务，区分实施依赖和验收依赖；不得自行批准或启动。重点列T-RP-02→RP09-T01、T-RP-04+T-RP-12→RP08-T02、T-RP-09→RP02-T02、支持客户端矩阵+T-RP-03→RP10-T01、数据所有者只读快照→RP15-T01；用当前登记核对条件，不能承诺一个批准解锁全部任务。
遇到额度/上下文不足先写真实进度、尚未通过case、最后attempt和精确接续读序，未完成不标COMPLETE。

【11. 最后统一回报并停止】
按顺序报告：
1) CLOSE-01～04实际实施/验证状态，父任务及整包未扩大；
2) LR6-01～04逐项证据，哪些只是执行者已补正、独立复核仍PENDING；
3) 唯一测试文件差异、六记录追加范围、业务源码零变化和冻结核对；
4) 六项模拟故障控制、最终真实报告套件、build/typecheck/undefined/diff及cleanup，区分SUP-02复用证据与本轮命令；
5) 新会话审阅入口、四项交付、最终seal及读回路径；
6) 原54/306统计保持情况、最小下一业务输入清单、未运行和未批准范围。
四项完成或真正受阻并落盘后结束，不再选择其他修复，不要求用户逐项确认，不声称剩余36项或整个修复计划已经完成。
请实际执行并交付，不只回复执行计划。
```
