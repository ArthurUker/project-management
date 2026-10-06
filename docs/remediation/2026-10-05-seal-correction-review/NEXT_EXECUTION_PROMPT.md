# 单窗口小型封存 overlay：只执行固定元数据修正

本 prompt 供用户转发后执行。本轮不重新开启六窗口，不实施业务修复。未转发前仅为执行方案。

```text
你是 RDPMS 本批次唯一元数据订正执行者。按固定步骤执行，不自行查找其它修复，不重新设计审计/封存体系。完成后停止，等待独立审阅。

ROOT=/Users/renkang/VS Code/project-management
P=docs/remediation/2026-10-01-rdpms
S=P/execution/supplements/parallel-lr7-2026-10-04-p01
旧K=S/integration/seal-correction-2026-10-05-01
新M=S/integration/seal-overlay-2026-10-05-02
独立复核R=docs/remediation/2026-10-05-seal-correction-review

唯一范围：SC-01～04 的小型订正 overlay，使用 R 已逐项确认的 13 个准确替代目标。不是重新执行 AG-01～06，不是 STANDARD 业务任务，不是再次启动 A～F。

授权与写入边界：仅在 M 新建文件；仅在 P/REVISION_HISTORY.json 和 P/EXECUTION_REVISION_HISTORY.json 各追加一个唯一订正 entry。所有其它既有文件只读，包括旧K、原J、A～F、R、两state、两handoff、原计划/决定/验收/任务图/审计与记忆。已有M或已有新ID时先读取接续，不覆盖旧尝试、封存或重复追加。

首先完整读取：R/REVIEW.md、findings.json、canonical-reference-index.json、evidence/readback.json、本文件；旧K的23文件（大JSON可完整解析输出摘要）；两history最新条目；上一轮R的SEAL_CORRECTION_PROMPT.md及BUSINESS_DECISIONS.md。其原冻结/禁止规则继续生效，但新写入目录和任务范围由本条限定。

按固定步骤串行执行：

1. 启动核对并登记。HEAD核对138cf2da1b63195cef7e884f69bdf8ded6ed3c21，读取git status。将旧K23文件与当前六根文件逐一对照R索引；核对原277冻结文件、948worker、旧J17文件和2335计划清单无漂移。保存当前六根记录真实字节到M/evidence/start-snapshots。写M/authorization.json，明确唯一写入者、允许路径、停止条件。若输入发生无法解释的漂移，记录BLOCKED并停止，禁止“自动接受最新值”。

2. 写M/evidence/reference-overlay.json。完整引用R/canonical-reference-index.json及其实际SHA；针对13个失败位置逐项记录：原sourceFile+sourcePointer、originalDeclaredPath/Base/Hash/result、新有效targetRef。源原件错误继续FAIL。旧K/evidence/seal-scope.json实际SHA为dfb461bc6f63b755260fd1422ea6a7a89ae4faa76daaaaf60b642e84785554b4；原manifest记录ac5ad...，不得假称原19/20成为20/20。新overlay绑定当前真实输入、记录替代，不修改旧K。

3. 写M/evidence/readiness-normalization.json。复制旧K六节点的来源事实，只为sourceReadyRef补明确REPOSITORY；manifest、pendingApprovals来源、原值、writerStopped、PENDING/NOT_EVALUATED保持。sourceReadyRef与pendingApprovals.sourceRef均用标准typed ref，附sourceField与原值；保留原缺字段/原不合规诊断。不得重新签发原READY、增加批准值或声称原READY conforming。

4. 写M/evidence/input-binding.json。绑定旧K全部23个实际文件（显式区分20静态与3 seal/readback文件）、R索引/复核、原来源READY/manifest、四个保持字节的非history根记录。所有有效引用统一{pathBase:REPOSITORY,path:实际完整仓库相对路径,sha256:磁盘计算摘要}。引用实际冻结manifest可以传递绑定其它已核对输入，不复制948文件或重跑控制。不将旧文件中的错误声明当成新有效ref；列为明确historicalDiagnostics，记录原FAIL与新替代MATCH。

5. 计数只从最终枚举集合生成：旧K23/20/3分开；旧历史34/32和16/14仅是历史输入数；新M数量不手填、不假定与旧K相等。在最终读回记录新manifest entryCount/uniqueFileCount/实际静态覆盖，不再生成一份封存后需要回改的手工计数文件。AG-05仍仅待负责人澄清。若引用故障编号，逐字依冻结矩阵事实：FP-06前项持久后续receipt失败，FP-07全部receipt持久后lastPushAt失败，FP-08receipt已提交但响应丢失。不得改变C方案或政策。

6. M最小交付：authorization.json、change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md、REVIEW_ENTRY.md、resume.md。回滚仅追加撤回/替代，保留所有原字节。acceptance分别记录静态前置检查与最终封存读回，不提前给未运行的最终检查PASS。final读回单独产物，不能为了改acceptance而再改已封存字节。产品验收NOT_RUN、完整runner独立动态验收NOT_EVALUATED、independentReview=PENDING、release=NOT_EVALUATED。原54/306/31和包状态不更新。

7. 标准引用构造必须用下列形式；严禁字符串裁剪、手拼缺前缀路径、手抄hash：
   actual=target.resolve(strict=True)
   assert actual.is_file() and actual.is_relative_to(ROOT_PATH.resolve())
   ref={"pathBase":"REPOSITORY","path":actual.relative_to(ROOT_PATH.resolve()).as_posix(),"sha256":sha256(actual.read_bytes()).hexdigest()}
   字段统一path，不混用relativePath；集合统一路径去重。旧诊断声明用originalDeclaredPath等字段保留，不当有效引用解析。每个新有效typed ref须自带pathBase。

8. 定稿全部M静态内容后，先运行标准库严格预检：JSON可解析、每个有效ref目标在ROOT且存在、SHA匹配、pending来源一致、输入未变、新ID未出现。存在任一FAIL不得开始追加history或报PASS。失败日志写新attempt路径保留，只能修尚未封存的新M。

9. 固定封存顺序：
   a. 枚举M最终静态文件，排除payload-manifest/final-integrity/post-seal-readback及两history最终文件；启动history快照是单独静态文件，可封存。
   b. 用同一ref构造器生成M/payload-manifest.json，pathBase=REPOSITORY，去重，覆盖全部当前静态产物。
   c. M/final-integrity.json仅以真实完整ref绑定定稿manifest，不嵌自身/两history最终hash/后生成readback。
   d. 先严格验证新manifest逐项匹配与final到manifest真实路径，再向两history各追加一个唯一entry。REV使用version=parallel-lr7-2026-10-05-seal-overlay-02；EXEC使用id=EXEC-parallel-lr7-2026-10-05-seal-overlay-02。correctsRef精确指向原versions[27]及entries[18]，保存原version/id和实际规范SHA。新seal/review/evidence引用全部使用标准完整ref；不复制原错误map键；不记录任何registry最终hash。
   e. 写预先排除的M/post-seal-readback.json，记录两history最终hash。独立重新从磁盘读取manifest/final/所有新有效typed ref和history新entry，严格按声明基准解析；计数与真实枚举一致；四非history根字节不变；两history仅各多一条且原数组/其它字段未变；原K/worker/J/冻结输入不变。任一缺base/目标不存在/hash不符/越界/未解释漂移必须overall FAIL，不得仅遍历13个替代项或顶层manifest就报告完整PASS。

10. 最终读回完成后停止所有编辑。不要再“更新计数”“补文档”“改引用”而不重新进行合法封存。旧K封存仍FAIL；新M仅在本次严格范围全部满足后记PASS。局部静态MATCH不是产品修复验收、业务批准或发布验收。

禁止任何业务源码/正式测试/依赖/迁移/数据操作；禁止npm/build/test/runner/控制/数据库/JWT/IDB/browser/网络；禁止访问SSH/dotenv/真实凭据；禁止子代理、切换模型、stage/commit/push/merge/deploy/reset/clean/stash；禁止记忆写入；禁止根state/handoff追加。禁止自行进入其它STANDARD任务，禁止重开A～F或重新设计方案。

最终只汇报：SC-01～04和13替代绑定结果→新增/追加文件→真实完整读回/失败与限制→交付入口→原36任务和待批输入仍未改变。完成后停止等待独立审阅。
```
