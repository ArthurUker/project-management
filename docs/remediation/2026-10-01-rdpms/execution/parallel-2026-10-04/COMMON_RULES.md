# 六窗口共同执行规则

用户将某个窗口的启动prompt交给执行者后，该窗口获得本文件及其任务卡限定的本地授权。编写本文件没有执行任何任务。多窗口授权不代替产品、安全、数据或技术决定批准。

## 1. 固定上下文与读序

- 仓库ROOT：`/Users/renkang/VS Code/project-management`。
- 计划P：`docs/remediation/2026-10-01-rdpms/`。
- 指令Q：`P/execution/parallel-2026-10-04/`。
- 运行根S：`P/execution/supplements/parallel-lr7-2026-10-04-p01/`。
- 最新独立复核R：`P/execution/reviews/2026-10-04-codebuddy-lr6-closeout/`。
- 冻结执行会话O：`P/execution/supplements/lr6-closeout-2026-10-04-cb1/`。

先完整读取COMMON_RULES、自己的窗口指令、BATCH_MANIFEST，再读取R/REVIEW.md、findings.json、validation-summary.json、NEXT_EXECUTION.md、CONTRACT_ERRATA.md。
完整解析当前IMPLEMENTATION_STATE、TASK_GRAPH、DECISION_REGISTER、OPEN_ITEM_GATES、CROSS_PACKAGE_CONTRACTS；读取本窗口关联任务卡、合同、全部关联验收行与原状态证据。按本窗口引用追溯，不重扫全仓/全部旧审计。
清单可由脚本完整解析和逐文件校验，输出摘要即可，不逐行打印全部hash或旧日志。v2安全/批准/历史边界有效；旧prompt的首轮、自动STANDARD选择、根台账更新或全量重跑指针不适用于工作窗口。

## 2. 并行所有权

每个工作窗口唯一可写前缀由BATCH_MANIFEST规定。A～F都禁止写：

- 任何现有业务源码、正式测试、共享helper、schema、guard、seed、依赖、部署脚本或配置；
- 两份state、两级handoff、两份history，以及TASK_GRAPH/PACKAGES/FINDING/ACCEPTANCE等全部根台账；
- 旧审计、manifest、v1、旧run/session/review及本执行指令目录Q；
- S根的共享index/状态文件、integration/目录或其它窗口目录。

不创建worktree/分支，不stage/commit/push/merge/deploy/reset/clean/stash；不用共享锁文件、共享数据库或backend/dist作为协作信号。
不调用子代理或切换模型，不安装升级依赖，不访问真实账号/生产/共享DB，不读取真实dotenv、SSH配置或凭据，不实施迁移/恢复/业务修复。
本轮没有现有代码写入白名单；只有A/B允许自己的新工具代码及合成控制。所有窗口禁止真实构建、真实数据库、实际JWT/IDB/browser/UI验证。

## 3. 启动与漂移判定

先核对HEAD、git status和BATCH_MANIFEST冻结摘要；写自己的authorization.json与start-baseline.json，然后才开始本窗口改动。
authorization记录窗口ID、任务、限定允许前缀、禁止项、执行者、资源和停止条件；不把旧executionAuthorized=false当重复授权要求。
S内其它已知窗口的新文件是预期并行产物，不能因为git status增加这些路径就误判业务漂移；逐文件核对受保护文件及原业务文件清单，无法解释的新源码/台账变化则停止受影响工作。
禁止对整个execution/或S根做“启动=结束”冻结hash断言：其它窗口本来会新增文件。只比较清单指定的冻结历史、代码/配置/根记录和自己的目录。
已有自己的目录时读取状态接续，不覆盖旧attempt或已READY的交付；别人的目录始终只读。

## 4. 实际证据与状态

报告25/25、同步12/12、字段101/101按R及绑定hash复用，明确REUSED_VERIFIED_EVIDENCE；不伪称本轮重跑。
A/B的模拟必须标SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED或LOCAL_SYNTHETIC_FILE_CONTROL，不能当真实DB/JWT/产品验收。C～F只读源码、旧证据、方案准备，不实施各父任务。
源码事实必须有当前文件行号和SHA256，历史运行明确日期/来源；推荐方案标PROPOSED，approvedBy/approvedAt/evidenceRef保留null。
不能把源码client/package版本当已部署/受支持客户端；不能从seq递增或局部barrier推定safe-watermark；不能从cookie旗标推定现有cookie transport。
原54/306、父任务/包、31开放项、批准与release不变。independentReview=PENDING、release=NOT_EVALUATED。
需要外部材料但未提供时明确NOT_RUN/ENV_BLOCKED/OPEN_INPUT；交付可完成，不把门禁写PASS。

## 5. 固定交付协议

每窗口自己的目录交付authorization.json、change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md和REVIEW_ENTRY.md。准备窗口的acceptance只评价材料交付/来源一致性，业务验收另标NOT_RUN。
保留每次失败attempt，记录精确命令、退出码、异常、去敏日志及仅自有临时资源清理；不能覆盖旧失败日志或用全局进程清理。
建议直接使用pathBase=REPOSITORY与真实仓库相对路径；其他base必须明确映射且路径相对该base。禁止猜测prefix/fallback解析，必须防止目录越界。
全部文件定稿后生成WORKER_MANIFEST.json：逐文件SHA256及明确pathBase；排除自身和READY.json，记录排除原因。它只封存本窗口，不封存正在变化的其它窗口，也不包含根history最终摘要。
最后写READY.json，字段必须包含：batchId、windowId、status（READY_FOR_AGGREGATION/BLOCKED/FAIL）、scope、workerManifest路径+SHA256、实际结果、未运行/未批准、independentReview=PENDING、release=NOT_EVALUATED、writerStopped=true。
READY写完后停止修改本窗口产物；READY不是独立审阅通过。若需返工由新attempt/新会话登记，不能悄悄改变已冻结字节。

## 6. 停止与输出

自己的范围完成或存在真实阻碍时落盘并停止，不选其他STANDARD任务、不帮其它窗口改文件、不轮询它们的未完成目录。
额度/上下文不足时写准确resume，未完成不写READY_FOR_AGGREGATION；BLOCKED须列缺少的批准/材料和解除条件。
最终报告本窗口范围、实际差异、验证层次、产物、自己的READY摘要及交付状态，不能报告其它窗口完成。
