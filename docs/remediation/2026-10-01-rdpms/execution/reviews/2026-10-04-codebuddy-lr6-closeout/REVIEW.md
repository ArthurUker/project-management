# CodeBuddy LR6 四项收尾：独立审阅

日期：2026-10-04。对象：`execution/supplements/lr6-closeout-2026-10-04-cb1/`。

## 裁定

**SCOPED_ACCEPTANCE_WITH_TWO_REQUIRED_CORRECTIONS**。

报告测试的本轮指定补正可以接受；保留执行者真实自有库的 25/25 原始日志证据，以及上次已接受的同步 12/12、字段 101/101 证据。没有确认新的业务源码回归，也没有发现范围外业务代码改动。

仍有两项必须订正：运行器在命令日志写入异常时会报告成功；封存条目的路径与声明基准不一致。二者属于验证/交付工具问题，不要求重新修改报告测试、同步测试或业务源码。

本次审阅进行了源码、原始日志、实际文件摘要、台账结构和安全模拟反例核对。**未独立重跑正式报告/同步套件、build 或目标环境**。不能将执行者 25/25 标记成“本次审阅重新运行25/25”。

## 四项处置

| 项目 | 独立裁定 | 支持与剩余范围 |
|---|---|---|
| CLOSE-01 / LR6-01 | LOCAL_SCOPED_ACCEPTED | 原22条名称及顺序保留，增加3条；完整身份/marker、draft upsert、三种草稿finally符合本轮范围；原始trace与交付一致 |
| CLOSE-02 / LR6-02 | SCOPED_CONTROLS_ACCEPTED_WITH_REMAINING_FAILURE | 原六项控制均有非零/cleanup证据；新增两项独立安全模拟仍观察到退出0，见LR7-01 |
| CLOSE-03 / LR6-03 | STRUCTURE_AND_BYTES_ACCEPTED_METADATA_CORRECTION_REQUIRED | 六记录追加范围、唯一ID、旧条目、无history摘要循环通过；519条SESSION路径声明错误，见LR7-02 |
| CLOSE-04 / LR6-04 | LOCAL_SCOPED_ACCEPTED_WITH_REVIEW_CLARIFICATION | 单项目/全局列表主区别已正确；非成员404须限定为非SUPER_ADMIN，见CONTRACT_ERRATA.md；无需另开阶段业务修复 |

## LR7-01：命令日志失败仍导致运行器假成功

- 严重度：**P2**。性质：验证运行器错误，不是业务缺陷。
- 位置：旧执行会话 `run-suite.py:150` 的 `run()`、`:192` 的正常命令日志写入、`:280` 的外层 finally、`:349` 的 finally 内 `sys.exit`；超时分支日志写入先于失败记录。
- 实际路径：主流程启动集群后，命令完成但 `integration-suite.log` 写入抛 OSError → 主流程退出到 finally → drop/stop/清理成功 → `criticalFailures` 为空 → finally `sys.exit(0)` 吞掉原异常。
- 另一条已验证路径：build 抛 TimeoutExpired → 超时日志写入再抛 OSError → `primaryExceptions`/`criticalFailures` 尚未登记 → 同样退出0。
- 前提：故障针对单个命令日志，cleanup/result文件仍可写。没有模拟全磁盘不可用，也没有访问真实数据库。
- 独立结果：两条控制都观察到 `exitCode=0`、`criticalFailures=[]`、`primaryExceptions=[]`；所有自有临时根均清理。
- 已有保护：原六项控制中正常可写日志的超时/spawn故障返回1；run-results写盘失败也返回1。正常报告25/25日志仍有效，不因该异常分支被宣布无效。
- 影响：记录命令结果的工具遇到日志故障时仍可产生成功运行摘要；超时的失败原因还能丢失。本轮“主异常cleanup后仍非零”尚未全面成立。
- 建议：只在下一唯一新会话修复制的runner。主异常记录不依赖日志成功，日志失败本身计入critical并使用独立fallback/stderr；外层捕获并记录异常，退出码在finally清理结束后决定，不在finally成功退出覆盖异常。
- 验收：保留六项原控制；增加本次两项日志失败控制，均非零且保留主原因/命令/清理信息；增加无故障安全模拟正常路径应返回0。均标SIMULATED_CONTROL，不要求重跑未改变的业务套件。
- 证据：`evidence/runner-log-failure-controls.py`、`.json`及`evidence/runner-log-controls/`原始记录。被测runner字节副本与执行者runner SHA256完全相同。

## LR7-02：封存路径不能按声明的pathBase解析

- 严重度：**P2**。性质：交付元数据/封存消费者合同错误，不是文件内容漂移。
- 位置：旧执行会话 `evidence/payload-manifest.json:25` 的sessionFiles以及`:2616`的pathBases；`final-integrity.json` 的sealedPayloadManifest；两registry新增entry的sealedArtifactHashes/sha256；`make-post-seal-readback.py:29-32`。
- 示例：键为 `execution/supplements/lr6-closeout-2026-10-04-cb1/CLOSE-01/acceptance.json`，声明 `pathBase=SESSION`；SESSION实际映射到会话根。直接拼接会得到重复的 `.../lr6-closeout.../execution/supplements/lr6-closeout.../`。
- 影响路径：遵守manifest.pathBases的消费者无法找到519条sessionFiles；runner/control/seal及history中的同类引用也不一致。执行者读回脚本直接按PLAN解析这些键并忽略pathBase，因此“读回PASS”没有证明声明合同正确。
- 独立结果：sessionFiles **519/519按声明基准无法解析**；显式按PLAN解析后 **519/519实际SHA256匹配**，其他4个受控记录及4个repository引用也匹配。没有确认篡改、hash不一致或历史覆盖。
- 已有保护：唯一新ID各出现1次，correctsRef准确；旧history全部内容保持；history没有自身/交叉最终摘要循环；四个非history记录追加符合白名单。
- 建议：冻结当前会话和registry旧entry，新订正交付采用一致的 `pathBase + relativePath`。保留现有长键时标PLAN；标SESSION则去掉会话前缀。引用冻结旧会话产物可以用PLAN，不要复制519个文件。读回必须使用同一个严格解析器，不做猜测性fallback。
- 验收：每个声明引用直接解析到现存文件且SHA256一致；实际路径/目录与pathBase映射一致；旧entry/旧会话保持；唯一新订正entry无摘要循环。不需要改代码或重跑业务测试。
- 证据：`evidence/seal-readback.json`，含严格解析失败路径及明确诊断性规范化结果。

## 接受的证据与边界

1. 当前正式报告测试SHA256为 `23e4cff4da62cb2714bfc564ebc582e4c6245a7d3b535797273150ef314ad9e8`。重建的编辑前副本匹配冻结基线 `95b70b11...`，证明旧字节内容；它不是修改前实时采集的时间证据。本次不要求再次重建历史。
2. 原始最终attempt-02显示tests25/pass25/fail0，全部25个名称在日志中；SUP0105/06/07三段trace与交付完全一致。命令build/typecheck/undefined/diff/drop/stop均0，guard-before-reset按合同2。数据库/上传/env均为自有合成资源；本次读取日志，没有访问旧数据库。
3. 业务源174文件、其他测试/配置71文件、追加保护13文件、17规划输入均与冻结清单一致；同步测试未改。12个旧冻结根加上一轮独立review共13个根保持。
4. 六记录的原值/前缀及旧continuation/entry均保持；只有指定的追加内容。history之前的原状态通过移除唯一末entry并与冻结原字节SHA校验，不宣称存在未采集的历史副本。
5. 两次正式attempt的自有临时根现在均不存在，backend/dist不存在。独立控制只创建确认自有临时文件、stub全部subprocess，未启动DB/构建/服务；控制结束无自有根遗留。
6. CLOSE-03共享证据引用存在，允许复用同一会话文件，不因未复制一份evidence目录增加返工。全部会话JSON合法。

## 原计划及下一步

原54任务：实施18 COMPLETE / 2 IN_PROGRESS / 34 NOT_STARTED；验证10 PASS / 37 NOT_RUN / 7 ENV_BLOCKED；发布54 NOT_EVALUATED。

原306验收：53 PASS / 228 NOT_RUN / 25 ENV_BLOCKED。仍有36项实施未完成。B04/B10/B14/B20和31历史开放项未关闭，没有新增批准或业务就绪项。

下一轮只需新runner修正及新元数据订正。**报告测试、同步测试、业务源码全部冻结**；正常报告25/25及同步12/12、101/101证据继续复用，注明层次与未重跑。读回和异常控制通过后再独立核对这两项，不再扩大到其它测试或阶段政策。

业务推进所需最小输入仍见执行会话next-business-inputs.md及原门禁：T-RP-02、T-RP-04+T-RP-12、T-RP-09、客户端矩阵+T-RP-03、数据所有者只读快照。它们不是本次review批准。

本审阅只写新review目录；未修改执行者会话、代码/测试、六个记录文件或原验收矩阵。
