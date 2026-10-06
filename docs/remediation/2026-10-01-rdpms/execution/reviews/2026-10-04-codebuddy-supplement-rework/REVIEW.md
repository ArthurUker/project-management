# CodeBuddy SUP 返工独立审阅（2026-10-04）

## 裁定

**SCOPED_PASSES_WITH_REQUIRED_REWORK：两套正常正式测试通过；本轮交付不能整体关闭。**

审阅对象：`execution/supplements/test-contract-rework-2026-10-03-cb1/`。
依据：有界返工 Prompt、其 manifest、LR5 独立复核、当前代码及新运行/控制证据。

本轮没有修改业务源码、正式测试、旧执行记录或原计划状态。仅新增本独立审阅目录、运行自有隔离验证及清理本轮自有资源。未批准阶段政策，未选择其他 STANDARD 任务，未确认新的业务回归。

## 1. 可以接受的交付

| 项目 | 独立结果 | 接受范围 |
|---|---|---|
| 当前报告完整套件 | **22/22 PASS**，零 skip/cancel | 当前正常路径；包含四原语真实调用、恢复后 submit、真实 DB 语义负对照、新收束控制 |
| 当前同步完整套件 | **12/12 PASS**，零 skip/cancel | 七实体同 actor 撤目标权限、具体同 ID 行、精确键值、墓碑/增量等原范围 |
| SUP-02 字段表 | **101/101 行与最终 attempt-03 原始 trace 相符** | 当前实现读投影对照；不代表独立产品/安全字段政策批准 |
| 原用例保留 | report 原19名称全部保留，新增3；sync 原12全部保留 | 局部屏障重构未在检查的 diff 中削弱原业务断言 |
| 工作区保护 | 174 个业务源文件起止相同，含两个 untracked；计划输入、旧证据和其他测试无发现漂移 | 当前可核对的逐文件/目录集；本审阅新增目录单独排除，不混作执行者漂移 |
| 原台账保护 | 两个 state 去掉新 continuation 后相同；handoff 旧前缀、history 旧 entries 相同 | 没有证明旧记录被覆盖；版本号重复问题见下文 |
| SUP-03 主体覆盖 | 详情内嵌/global/list/id/sync、客户端、B20 项目级范围及 UI NOT_RUN 已补齐 | 静态核对；两句项目 scope 总结仍错误，需勘误 |

## 2. 必须补齐的问题

### LR6-01 · P2 · SUP-01 屏障匹配与三个旧草稿失败路径仍不完整

位置：报告正式测试 `matchReportWrite:106`、`draftWriteBarrier:211`，三个既有竞争用例 `:256`、`:294`、`:329`。

事实与影响路径：

1. `matchReportWrite` 的 selector 即使给出完整 projectId/authorId/reportType，也只比较 periodKey 或 where.id。纯函数控制让另一项目/作者/类型共享 period+payload，返回 **true**；完整业务唯一键没有真正约束匹配。
2. `draftWriteBarrier` 列入 upsert，但回调只读 `data.content`；upsert 的 data 为 null，payload 在 create/update。受控方法 stub 下，真实参数形状绕过屏障，`fired=false`、底层调用1次。
3. 三个旧草稿竞争仍在裸 `Promise.race(setTimeout(...))` 后依次 submit/release，没有 `try/finally`，也不 clear timer。中途失败不能保证 release/settle；新控制只证明新用例的 finally，没有补齐这三个旧路径。

已有保护/反证：四原语独立矩阵是真实 DB 调用；当前 updateMany 路径及完整22条确实通过；相关 A02/A03/A03b/A04b/A06b 与新竞争已有 finally。没有以此确认产品写入回归。

建议/验收：只改报告正式测试，让完整业务键/id+payload匹配真正生效；草稿复用兼容 create/update 参数的 matcher；补三条旧竞争的 finally/timer/settle，并保留原断言。验证“不同完整键不命中、指定草稿upsert命中、三个旧失败路径收束”后跑完整报告套件。

证据：`evidence/helper-controls.json`、`evidence/independent-validation.json`。helper 控制为纯逻辑+内存方法 stub，**不是数据库/产品验收**。

### LR6-02 · P2 · runner 会把主执行异常或写盘失败记为成功

位置：执行者新 runner `run-suite.py:146`、`:247`、`:317`。

入口/前提：`subprocess.run` 抛 TimeoutExpired/FileNotFoundError，而后续清理成功；或 `run-results.json` 写盘失败。

影响路径：主执行区没有捕获异常并写 criticalFailures；finally 最后 `sys.exit(0)` 覆盖待传播异常。`write_results()` 返回 False 也被忽略。

对冻结 runner 做全子进程模拟，得到：

| 控制 | 实际 exit | 结果 |
|---|---:|---|
| build TimeoutExpired | **0** | criticalFailures=[]、exitReason=no critical failures |
| suite spawn FileNotFoundError | **0** | 同上；套件未执行也被表现为成功 |
| result-write OSError | **0** | 没有 run-results.json |

这些是**SIMULATED_CONTROL，全部 subprocess 被 stub**，未启动数据库，不能称真实 DB 故障验收。它们直接确认 runner 的错误传播缺陷。

已有保护/反证：执行者最终正常 attempts 和本轮两个真实套件均通过；drop异常仍stop、stop失败保留根、非零build等原控制确实覆盖相应分支；dist 已消失时按文件系统判定的修正没有被本审阅否定。

建议/验收：只复制修正下一新 session runner，捕获主执行异常和未完成命令；清理后返回非零；结果保存失败也必须非零并留独立错误证据。保留原清理隔离及所有权保护；三个新增失败控制必须非零，正常真实库运行仍通过。

证据：`evidence/runner-exception-controls.json` 及同名控制脚本、各控制目录。

### LR6-03 · P2 · final-integrity 历史摘要与版本标识不一致

位置：执行者 `final-integrity.json:199/:205`；计划 `REVISION_HISTORY.json:1684`。

真实读回：

| 文件 | final-integrity 的 postAppendSha256 | 当前文件 SHA256 |
|---|---|---|
| REVISION_HISTORY.json | 710e7aa94f9d353b1dd21d337a3fc86e56dd110d171c0b42c417a73d5aaaeecb | f3385ad3ccc0e3b63a47cb5fda415a3bb71dd2ca26f7a6867e0ef553c47281be |
| EXECUTION_REVISION_HISTORY.json | fc63536efc11276f9d066031fefd0dfba71e7e8ae7f600a553eb4ce36236acd1 | d840c2cf0b872e78c91162f60bad98207451681a95ee510832622642e1a9050c |

两份 history 虽被列入 excludedFromHashing，仍在 recordFiles.details 中留下旧摘要，未标为独立历史阶段快照。history 后来封存 final-integrity，使读者不能把这些摘要视为当前最终值。

新增版本 entry 又沿用了前一独立审阅的 `post-2026-10-03-codebuddy-supplements-independent-review`，版本号出现两次（:1315/:1684），不能只靠该版本号区分执行与审阅。

已有保护/反证：原 entries 没有被改；最新 entries 中当前176 source/test hash 和 sealedArtifactHashes 均实际匹配。`cf2d8ea5...` 本身是真实 final-integrity 文件 hash。问题是嵌套旧摘要/ID与封存表述，不是所有摘要都失效。

建议/验收：冻结本session，在下一份 correction 明确指向旧 entry 的 session/位置/快照并用唯一新ID；只追加订正 entry。final-integrity 排除两份 history 的摘要，或明确只作有时间/阶段的旧快照，不声称最终当前相等。不要反复把两份history自身hash写进它们所封存的文件形成循环。

证据：`evidence/record-integrity-analysis.json`。

### LR6-04 · P3 · SUP-03 两句 scope 总结与表内/源码不一致

位置：`phase-read-contract.md:32`、`scope-assessment.md:20`。

两句称所有阶段读取经过 resolveProjectAccess，项目软删/非成员均404。实际无 projectId 的 `GET /api/phases`（phases.js:42-50）使用 projectVisibilityFilter；该函数（projectAccess.js:97-104）允许 manager 或有效成员，SUPER_ADMIN 返回 null，未检查 project.deletedAt。表中已经写出分支区别，总结仍错误。

建议只交新文档勘误：分别说明单项目资源404与全局列表过滤，不把全局分支说成逐项404。**不实施过滤、不重开B20、不声称新越权回归。** 本轮没有动态验证阶段API或实际UI。

证据：`evidence/phase-contract-check.json`。

## 3. LR5 处置与 SUP 裁定

| 旧项 | 当前独立处置 |
|---|---|
| LR5-01 | 四原语真实矩阵/恢复submit已补；旧草稿匹配与失败释放仍缺 → LR6-01 |
| LR5-02 | **本地补证接受**：同actor、7实体、101字段读回正确；不批准字段政策 |
| LR5-03 | 主体覆盖补齐；两句全局scope表述勘误 → LR6-04 |
| LR5-04 | 映射/起始完整文件集/保留旧证据已补；最终摘要/ID仍缺 → LR6-03 |
| LR5-05 | drop/stop/nonzero-build分支补齐；主执行异常和写盘失败仍假成功 → LR6-02 |

SUP-01：**REWORK_TESTS_REQUIRED**；正常22/22证据保留。
SUP-02：**本地限定补证接受**，四个case PASS；下一轮不需要返工其测试/字段表。
SUP-03：**REWORK_DOCUMENT_ERRATUM_ONLY**；其余静态覆盖和分级保留。
共有runner/封存：未关闭。原业务任务接受和原发现状态均不改变。

## 4. 验证、隔离与限制

两个正式套件分别在本轮全新自有loopback PostgreSQL集群/guard认可唯一测试库中运行。guard check预期2，reset/build/suite/typecheck/lint:undefined/diff/drop/stop均0。合成actor及审计随整库drop；未删除审计行、未关trigger。

独立runner只在本目录复制，增加主执行异常记录及写盘失败退出保护，**没有修复执行者runner或业务**。当前阶段API、UI/IDB、JWT全链、目标/候选/联合/部署未运行。原控制保留根的17份运行记录当前路径均不存在；本轮两个库/集群/临时根/dist也已清理。

## 5. 原计划统计与下一步

54任务：实施18 COMPLETE / 2 IN_PROGRESS / 34 NOT_STARTED，未完成实施 **36**；验证10 PASS / 37 NOT_RUN / 7 ENV_BLOCKED。306行：53 PASS / 228 NOT_RUN / 25 ENV_BLOCKED。发布全部NOT_EVALUATED。

本轮不改六个既有记录文件，仅新增独立裁定。下一轮只需报告测试余项、新runner异常传播、订正封存及两句静态scope勘误；SUP-02不用重做，不进入阶段业务过滤。具体边界见 `NEXT_EXECUTION.md`。
