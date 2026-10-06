# 原汇总窗口：一次限定的封存订正

以下为完整执行prompt。仅由一个汇总窗口执行；A～F保持停写。

```text
你是RDPMS本批次唯一汇总订正执行者。按下面固定步骤完成交付元数据订正、静态读回和落盘，然后停止。不要实施业务修复或扩展设计，不重开六个worker，不反复重新汇总方案。

ROOT=/Users/renkang/VS Code/project-management
P=docs/remediation/2026-10-01-rdpms/
S=P/execution/supplements/parallel-lr7-2026-10-04-p01/
旧J=S/integration/readiness-resume-01/
本次唯一新写入目录K=S/integration/seal-correction-2026-10-05-01/
独立复核R=docs/remediation/2026-10-05-parallel-aggregation-review/

本条授权：K中新建订正交付，并在P/REVISION_HISTORY.json、P/EXECUTION_REVISION_HISTORY.json各追加一个唯一订正条目。除此以外所有既有文件只读，特别是旧J、A～F、两state、两handoff、计划/决定/任务图/验收矩阵/发现映射、旧审计/manifest/v1及记忆文件。已有K则先读取接续，不覆盖旧attempt或已封存文件；已有本次history订正条目则核对接续，不重复追加。

先完整读取：R/REVIEW.md、findings.json、evidence/readback.json、BUSINESS_DECISIONS.md、本文件；原Q/COMMON_RULES.md、BATCH_MANIFEST.json、INTEGRATOR.md；旧INTEGRATOR_RESUME_PROMPT.md及A补正独立复核；旧J全部交付；两history目标原条目；按具体ref读取已冻结worker来源。大hash库存可完整脚本解析并输出摘要。本指令仅替代旧指令的写入位置/根记录范围与再次汇总指针，其余隔离、门禁、历史和禁止项有效。

固定范围与顺序：

1. 启动登记。核对HEAD和git status，按R/currentRootRecordHashes核对当前六根记录。确认277冻结受保护文件、948worker文件、旧J17文件与R记录一致；冻结计划2335摘要一致。保存六根记录真实当前字节到K/evidence/start-snapshots/，登记新authorization和start-baseline，记录唯一写入者/允许路径/停止条件。不把旧283基线中的六根记录已授权追加误判为源码漂移，不自动接受未解释漂移。

2. 修引用合同AG-01。在K建立reference-corrections.json，以原文件ref+JSON pointer+原声明+新targetRef逐条绑定：
   a) REVISION_HISTORY.versions[26]和EXECUTION_REVISION_HISTORY.entries[17]的8个错base引用。
   b) 旧nine-path-evidence-binding的34个缺base引用；新规范化副本明确REPOSITORY和完整仓库相对路径，保留原hash、原执行结果和不同attempt限制。
   c) E外部请求实际路径为S/window-e-revision/evidence/external-client-evidence-request.md。
   所有新targetRef统一{pathBase:REPOSITORY,path:<真实完整仓库相对路径>,sha256:<从磁盘算出的完整摘要>}。新history的seal、reviewRef、evidenceLimitsRef也采用该格式。原错误声明放originalDeclaredPath/originalDeclaredBase等诊断字段，不作为新有效targetRef。不得按prefix猜测或fallback将原错误声明记PASS；明确旧引用失败、新替代映射通过。

3. 完成AG-02规范化。在K/evidence/readiness-normalization.json生成六个完整规范化节点，包含原机器协议要求的batchId/windowId/status/scope/workerManifest/actualResults/notRun/pendingApprovals/independentReview/release/writerStopped，并绑定原sourceReadyRef。A使用其有效新READY.pendingApprovals及原停写确认；B～F逐项从原notApproved映射为pendingApprovals，附sourceField、sourceRef、原值。原字段/缺项如实保留在原件引用或diagnostics，不将B/C/E/F原件字段缺失标为Conforming。D真实manifest哈希采用已经核对的绑定，原PENDING_SELF_EXCLUDED保留NONCONFORMING。未知待批不能填空数组。原READY全部不改，任何批准值不新增。

4. 修AG-04计数。对旧顶层34条清单显式去重形成32个唯一输入，登记两条重复项及原来源。worker标记分别记16历史条目/14唯一文件。构建完整引用图：K静态产物、旧J/旧seal/旧readback、worker manifest/READY和其文件、B额外捕获生成器、复核引用、4个保持当前字节的非history根记录。外部已冻结输入引用即可，不复制全部日志。记录本次实际entryCount、uniqueFileCount与transitive coverage，禁止用旧34作为新固定总数。

5. 方案与回滚边界。K/decision-readiness-addendum.md只记录AG-05：T-RP-02“任意500整体回滚”表述未满足RP00-T02/FP-06、FP-07、FP-08；需负责人确认提交前/提交后/批次已提交项/unknown原key/hash恢复边界。引用原C草案和故障矩阵，不修改C、HTTP状态政策、推荐选项/数值或实施代码。其他决定保持PROPOSED/PENDING及批准签名null。K/rollback.md只能说明追加撤回/替代记录、保留封存字节；禁止删除已引用目录、移除旧history条目或回滚业务数据。

6. 完成K七类交付：authorization.json、change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md；另有REVIEW_ENTRY.md和resume.md。acceptance仅评价新元数据/静态读回。产品动态验收NOT_RUN、完整运行器独立动态验收NOT_EVALUATED、release=NOT_EVALUATED、independentReview=PENDING。原54/306、31开放项、包/旧发现、批准与业务任务实施均不变。

7. 先做封存前预检，不先填PASS：所有JSON可解析、所有新引用路径/实际hash可严格读回、协议字段完整、文件清单无重复、源文件未变、预计新ID在相应registry不存在。保留自身工具的失败日志/attempt；修正只在尚未定稿的新K中，禁止改冻结输入。

8. 封存固定顺序：
   a) 定稿K静态产物与冻结输入清单；两state/两handoff保持当前字节。
   b) K/payload-manifest.json，去重，统一REPOSITORY真实路径。排除自身、final-integrity、两history最终文件、预先声明的post-seal-readback；启动history字节快照是不同静态文件，可封存。旧历史post-readback摘要标明旧封存时点，不伪称追加后仍等于当前history。
   c) K/final-integrity.json绑定定稿manifest，不嵌自身/任何history最终hash或后生成readback。
   d) 两history各追加一个唯一订正entry，原条目不改。
      REVISION_HISTORY使用version=parallel-lr7-2026-10-05-seal-correction-01。
      EXECUTION_REVISION_HISTORY使用id=EXEC-parallel-lr7-2026-10-05-seal-correction-01（不能再用version代替id）。
      correctsRef分别精确绑定versions[26]、entries[17]的原索引、原version、实际规范化SHA256和旧J引用。entries[17]没有id要如实记originalId=null/originalVersion，不伪造原ID。
      新条目所有有效artifact/review/evidence引用统一REPOSITORY+完整仓库相对路径及实际hash，不用手抄摘要。两新条目不得包含自身/对方registry最终hash。不再追加state continuation或handoff，避免重复聚合。
   e) 预先排除的K/post-seal-readback.json：记录两history最终摘要，并做完整严格读回。

9. 最终读回必须覆盖：
   - manifest自身绑定、每个文件及新引用图中每个有效typed ref，不能只查顶层manifest；任何缺base、越界、缺文件或hash不符均FAIL。
   - 两history新entry的ID字段、唯一新ID、correctsRef规范摘要、新entry每条seal/review/evidenceRef。
   - 六规范化节点全部必填字段，pendingApprovals来源及原值逐项一致。
   - 六根记录保持：两state/两handoff字节与启动快照相同；两history只多一个条目，旧数组/其它字段保持，旧entry规范摘要不变；原277冻结文件、948worker与旧J17文件不变。
   - 清单唯一数/历史重复条目数分开；旧错误refs仍失败与新map通过分别记录，不修改旧post-seal PASS。
   - 所有待签材料与批准状态不变，AG-05只是待确认标注；业务任务启动数0。
   全部当前订正范围通过后停止编辑。旧错误的存在不伪装成旧件PASS，overall只表示本次新订正范围，不表示原方案或产品验收。

禁止真实构建/测试/runner/控制/DB/JWT/IDB/browser/生产/真实账号；不访问SSH/dotenv凭据；不安装升级、不用子代理、不切换模型、不stage/commit/push/merge/deploy/reset/clean/stash、不写记忆。只用本地标准库读写K、核对文件/JSON/hash和限定追加两个registry。环境或证据不足时如实BLOCKED/NOT_RUN，不扩大范围补修业务。

最后按顺序报告：AG-01～06逐项处置→实际新增/追加文件→完整读回与限制→产物链接→未批准材料和原36未完成任务。完成后停止，等待独立复核。
```
