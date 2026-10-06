# 立即交给 GPT6-Luna：四包准备，避开CodeBuddy封存

用户完整转发下列prompt后，只授权此处固定准备范围。原连续实施授权不扩张本prompt的准备模式。全部四包交付后停止，不自动切到业务实现。

```text
你是RDPMS的Luna接续执行者。本轮按既定规划直接完成LP-00与LP-01～04，实际落盘。不重新制定架构，不重新扫描全仓，不重复已接受任务。遇到缺口只做本包定向读取，不调用子代理、不切换模型。

ROOT=/Users/renkang/VS Code/project-management
P=docs/remediation/2026-10-01-rdpms
N=docs/remediation/2026-10-05-luna-remaining-plan
唯一运行写入根X=docs/remediation/2026-10-05-luna-remaining-execution/preparation

CodeBuddy正在处理seal-overlay-2026-10-05-02及两history。本轮仅在X中新建自有唯一run目录写交付；其它既有目录/文件全部只读。不得写N、原P、CodeBuddy/worker/review/审计/记忆、任何源码/正式测试/依赖/schema/migration，以及六根状态/history/handoff。不得因CodeBuddy中途完成就自动解除本准备模式。

一、先完整读取
N/README.md、PLAN.md、INITIAL_STATE.json、INPUT_MANIFEST.json、COORDINATION.json、WORK_ITEMS.json、DECISION_PACKETS.json、VALIDATION_BACKLOG.json、CASE_REMAINDER.json、REMAINING_TASKS.csv、ACCEPTANCE_BINDINGS.csv、ACCEPTANCE_DISPOSITION.csv、本prompt。
再完整读取P/EXECUTOR_PROMPT.md、REMEDIATION_PLAN.md、TASK_GRAPH.json、DECISION_REGISTER.json、OPEN_ITEM_GATES.json、CROSS_PACKAGE_CONTRACTS.json/.md、RELEASE_GATES.json、IMPLEMENTATION_STATE.json、两级handoff；P/PACKAGES.json和ACCEPTANCE_MATRIX.csv完整解析，按本包涉及任务读取对应卡和关联case。
读最新独立复核docs/remediation/2026-10-05-seal-correction-review/REVIEW.md，以及上轮BUSINESS_DECISIONS.md。按DECISION_PACKETS的真实source refs读取C/D/E/F；它们冻结、PROPOSED，不重复覆盖。
大JSON可完整解析并输出摘要，但不能只看README开始写。

二、LP-00启动登记
核对HEAD、git status及N稳定输入hash。保护全部dirty文件，不reset/clean/stash/stage/commit。CodeBuddy两history的合法追加和它新run文件属于并发变化，不误报源码漂移；不轮询或抢占它的记录。
在X创建实际唯一run；已有run先读取接续，不覆盖结果。写authorization.json、start-baseline.json，登记执行者、唯一写入prefix、允许工作ID=LP-00/01/02/03/04、只读输入、禁止项和停止条件。本地准备授权已由用户转发给出，不要重复询问授权。executionAuthorized=false是规划检查点；不得因此写原state布尔或转为业务修复。

三、按PLAN第3节固定顺序完成四包
LP-01：T-RP-02/T-RP-07差分合同。完成原500故障矩阵逐项前提/持久状态/响应/原key/hash查询或重放/最后副本/未来断言；准确区分FP-06/07/08，不承诺全批回滚；作用域唯一键/兼容/保留期/回退安全/删除适配有明确待签字段。保留C原件，只在本run写补遗。
LP-02：T-RP-09/T-RP-01/T-RP-12/D-S01-04差分批准与验收。完成旧成功/旧失败/原请求重放、两tab、A→B、慢/me/离线/撤权、可靠和未知owner、IDB升级/abort/quota、最后副本/恢复矩阵。Bearer/body事实和独立access失效门禁保持。列现有方案中尚未选择的字段，不另设计新协议。
LP-03：其余D-S01-01/02/03/05/06/07/08和T-RP-05/06。每项一份具体可填批准记录，优先显示RP14-T02/RP10-T03/RP01-T02/RP06-T01/RP07-T02/RP16-T01的开工条件。自定义角色/DAG未激活；阶段读取软删和字段级授权只列独立范围请求，不生成或实施额外业务任务。
LP-04：T-RP-03/04/08/10/11/13。复用已有版本矩阵、ADR/barrier证据；列外部版本、预算、目标FS/candidate/数据owner聚合报告及恢复点输入。完成8项补验规格、13条CASE_REMAINDER证据/范围对账以及全部306记录的归属核对和最小环境清单；先看已有实际run，不重复测试。13条候选路由仅提建议，不直接改原CSV、范围或PASS。仅可用git、标准库文件/JSON/hash读取和安全的工具定位/版本查询；不执行仓库脚本或任何应用命令，不打开真实dotenv/SSH凭据，不启动PG/browser/Docker/服务，不进行网络查询、安装、build或测试。

四、交付规格固定
每LP目录包含change-summary.md、evidence/来源绑定、acceptance-spec.json、task-state.json、handoff.md，以及DECISION_PACKETS.preparationPackages规定的专项产物。
所有spec明确SPECIFICATION_ONLY、dynamicStatus=NOT_RUN；它们不是产品PASS。LP状态仅表示准备交付，原task实施/验证/finding/release不更新。
总run交付APPROVAL_REQUESTS.json（21决定全部覆盖）、EXTERNAL_INPUTS.json、TASK_ALLOWLIST_DRAFTS.json（36任务逐项目的/必要具体候选路径/拟测试路径/越界禁止项）、NEXT_READY_CONDITIONS.json、SESSION_SUMMARY.md、handoff.md、READY_FOR_REVIEW.json、输入核对摘要。
TASK_ALLOWLIST_DRAFTS只能从原包路径上限和任务目的收窄；拟新增模块必须已在v2提出，拟新增测试登记确切路径；migration占位符不是授权。未经批准的设计留条件分支，不猜生产schema/客户端/时间预算。若本任务不需要包内某文件，将其排除，避免包级全文件授权。

五、批准和证据规则
APPROVAL_REQUESTS每项有decisionId、来源、负责人角色、选项/明确待填字段、scope、兼容/保留/预算、affectedTaskIds、相关contract、审批证据要求。approvedBy/approvedAt/evidenceRef全为null，status为原PENDING/PROPOSED。已有真实完整批准证据可单独登记externalEvidenceReceived，不改原registry、不自行签署；不存在证据时不把推荐/用户本地授权当批准。当前有的选项直接引用，只有矛盾或空字段写差分。
不把21决定全体作为任一任务全局门禁。依赖、before和condition按原图；RP02-T02的RP03-T01、RP08-T02的RP11-T01仅限制验收。S03-OI-06/07复用已有同一批准。可选未激活保持OPTIONAL_INACTIVE，不让它们阻止其它准备。
源代码/源码矩阵不是已部署/支持版本资料；合成数据不是实际存量；actor注入不是JWT链；模型/stub不是真实PG/IDB/FS/目标环境。无动态命令就NOT_RUN，环境能力缺失如实记INPUT_REQUIRED/ENV_BLOCKED说明，不能编造运行。

六、范围与停止
不改源码/测试/依赖/schema/migration，不连接真实或临时DB，不操作账号/浏览器/真实数据，不stage/commit/push/merge/deploy，不写原台账/histories，不子代理/切换模型/写记忆。某LP缺资料则记录待输入并继续其它独立包。交付后停止全部编辑，writerStopped=true；不自动读取实施prompt后开工。
本轮无需复杂payload/final/history封存，不再为元数据收尾创建多轮新窗口。新run保存准确来源hash、真实准备状态、接续即可。额度不足先落盘真实状态/读序，不把缺项补成COMPLETE。

最终汇报顺序：四LP准备状态→具体补齐的合同/材料→36实施+8补验+13case及306记录覆盖与未覆盖→实际文件/来源核对及动态命令0→产物链接→负责人最小批准/外部输入→CodeBuddy停写后可考虑的STANDARD任务。请实际完成全部独立准备工作，然后停止等待审阅。
```
