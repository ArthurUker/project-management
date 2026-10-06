# 封存订正独立复核：材料保留，新的封存尚未通过

日期：2026-10-05。仓库 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。

## 结论

裁定：**MATERIAL_PRESERVED_SEAL_CORRECTION_NOT_ACCEPTED**。

执行者完成了部分实质订正，但当前磁盘证据不支持其“20/20、完整严格读回、overall PASS”的汇报。当前 payload 的 **19/20** 个文件哈希一致；有效的新 typed ref 共检查 126 个出现位置，其中 **13 个失败**。这 13 个位置包含同一目标的重复引用，不是 13 个新增业务缺陷。

本轮确认的问题限于交付完整性、路径合同和计数。没有发现本轮改动业务源码，也没有因此推翻此前已审阅的修复或正式套件证据。原 B04/B10/B14/B20 等发现及历史开放项不在本复核中关闭。

## 本次范围与方法

只读完整解析本次 K、上一轮独立复核清单、原批次基线、两份 history、六个窗口 READY/manifest、原 RP00-T02 故障矩阵及原任务/验收轴。标准库逐文件重算 SHA256，按声明的 pathBase 严格解析路径，不以猜测前缀将失败声明改判 PASS。

- K：`docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/integration/seal-correction-2026-10-05-01/`。
- 110 个 K 新 typed ref 和 16 个新 history 引用位置；启动快照内的旧声明作为历史内容，不按新有效协议重新验收。
- 本复核只向本目录新增文件；未修改 K、worker、旧 J、计划或六个根记录。
- 未运行产品构建、测试、runner、控制、数据库、JWT、IDB、浏览器或网络验证。

工具两次 schema 适配失败及最终退出码 0 已记录在 [reviewer-authoring-attempts.txt](evidence/reviewer-authoring-attempts.txt)。检查工具退出码 0 表示证据采集完成，不表示执行者封存通过。

## 已确认的问题

严重度 P2/P3 表示本次交付证据与机器合同的可靠性，不代表新确认的产品安全漏洞。

### SC-01 · P2：封存哈希不一致，读回却声明全部匹配

位置：K `payload-manifest.json:52`，`post-seal-readback.json:12`，`acceptance.json:12`。

实际入口与触发前提：按清单正确的 REPOSITORY 路径读取 `evidence/seal-scope.json`，重算 SHA256。

```text
清单声明：ac5ad377761c7fd02d69db03a21df2fc04ea6842d31d0f0a38c048c31ec09166
当前实际：dfb461bc6f63b755260fd1422ea6a7a89ae4faa76daaaaf60b642e84785554b4
```

影响路径：payload → seal-scope 的绑定失败 → `manifestEntriesAllMatch=true` 和整体 PASS 不能成立。执行者附件中提到封存后“updating the seal-scope count”；本裁定仅依赖当前已证明的哈希不一致，不假定未知编辑过程。

反证与保护：其余 19 个 payload 文件匹配，20 个路径唯一且覆盖 K 的全部 20 个静态文件；旧冻结输入没有漂移。

建议与验收：保留 K 原字节，在小型替代交付中封存准确的当前输入与订正映射。先完成内容，再算清单和封存；最终读回之后不得修改已封存文件。新清单必须零哈希失配，旧 K 原结果继续明确为失败。

### SC-02 · P2：六个新封存引用仍指向不存在的路径

位置：K `final-integrity.json:7`、`post-seal-readback.json:7`；计划根 `REVISION_HISTORY.json:2019` 的 versions[27]、`EXECUTION_REVISION_HISTORY.json:914` 的 entries[18]。

- final/readback 共 2 处声明 REPOSITORY，但路径是 `n/supplements/.../payload-manifest.json`。仓库中不存在该目标。
- 两份新 history 共 4 处声明 REPOSITORY，但 seal 路径仍为 `execution/supplements/...`，缺少真实的 `docs/remediation/2026-10-01-rdpms/`。

影响路径：严格消费者无法从 final 或新的 history 到达封存文件。对“每条 seal/review/evidenceRef 都按声明基准通过”的汇报构成直接反证。

反证与保护：真实的 K payload/final 存在，哈希与这六处记录的哈希值一致；旧 8 处引用的替代映射确实全部有效。不是文件丢失，也不是必须重跑 worker。

建议与验收：引用统一从已确认存在的 `actualPath.resolve().relative_to(ROOT)` 和磁盘 SHA256 构造。不要复用 PLAN 相对字串或字符串裁剪。保留原失败声明，以追加订正记录发布准确的新引用。六个新有效替代引用须全部存在且哈希匹配。

### SC-03 · P3：六个 sourceReadyRef 仍缺 pathBase

位置：K `evidence/readiness-normalization.json:40`；其它五处在 88、135、182、223、268 行。

六个 sourceReadyRef 有 path 和 sha256，但对象及文件层均没有 pathBase。按本轮执行指令“任何缺 base 均 FAIL”，不能把它们计为严格通过。

反证与保护：把路径作为仓库相对路径进行诊断时，六个实际文件均存在且 SHA256 正确；六节点的 requiredFields 全齐，pendingApprovals 与来源值逐项相同，writerStopped=true。因此所需返工只是新增有效绑定，不涉及重新签发原 READY、批准业务规则或重启窗口。

建议与验收：替代规范化节点的 sourceReadyRef 明确带 REPOSITORY，来源值及原件不变。严禁把缺失基准的原件追溯改判 conforming。

### SC-04 · P3：新静态计数与引用图不一致

位置：K `evidence/seal-scope.json:13`，`referenceGraph.kStaticProducts`。

当前 K 共 23 文件，排除 3 个 seal/readback 后静态文件为 20。scope 却声明 static=22；图列 18 条，漏列自身 scope 和 `decision-readiness-addendum.md`。旧顶层 34/32、worker 16/14 的去重事实正确。

影响路径：新交付的计数、图和清单不能相互证明。payload 确实包含 20 个静态文件，故不推断业务文件漏审；但“完整引用图、准确当前计数”的声明不成立。

建议与验收：当前计数从同一最终清单生成；历史条目数、当前唯一文件数、传递覆盖分别记录。不要先手填计数再于封存后修改 scope。

## AG-01～06 的逐项裁定

| 原项 | 当前可接受部分 | 仍未通过或待办 |
|---|---|---|
| AG-01 | 旧 8 处替代映射、34 处 nine-path 新引用、E 请求实际路径全部匹配；nine-path 原结果和不同 attempt 限制保持 | 新 final/history 的六处错误路径；SC-02 |
| AG-02 | 六节点必填字段、待批来源/原值、真实 manifest 哈希、停写信号正确；D 原不合规声明保留 | 六处 sourceReadyRef 缺基准；SC-03 |
| AG-03 | 新 EXEC 使用唯一 id；REV 使用唯一 version；正确指向原 26/17 条目；旧数组与其它字段不变 | 新条目的 seal 引用另在 AG-01/SC-02 处理；不能把 ID 正确扩大为整条验收通过 |
| AG-04 | 旧 34→32、16→14 计数正确；20 个 payload 路径唯一且静态覆盖完整 | 新计数/图与封存哈希不一致；SC-01/04 |
| AG-05 | 记录了待负责人澄清，未改 C、未批准任何选项或激活业务任务 | 业务合同仍待批准；本补遗的 FP 对应说明应以冻结矩阵为准 |
| AG-06 | 新回滚文档采用追加撤回/替代，不删除旧目录或 history；没有执行撤回 | 仅接受文档范围，不表示任何回滚演练或发布通过 |

AG-05 的准确冻结事实：FP-06 是前序 item 已持久、后序 item 的 receipt 写入失败；FP-07 是 item/receipt 已持久后 lastPushAt 更新失败；FP-08 是 receipt 已提交但响应丢失。K 补遗用 FP-07/08 描述“批次部分可见性”不够准确。“unknown 原 key/hash”是恢复合同须说明的请求身份，不是把 FP-08 改成数据库未提交。审批人应同时阅读原矩阵与上一轮 [BUSINESS_DECISIONS.md](../2026-10-05-parallel-aggregation-review/BUSINESS_DECISIONS.md)，不能只据此补遗批准。

## 冻结与状态核对

- 277 个非根受保护文件：零漂移，包括已登记业务源码和测试/配置。
- 948 个 worker 文件、旧 J 17 文件：零漂移。
- 冻结计划 2335 文件：规范清单摘要一致；旧审计 12 文件和审阅计划 136 文件也一致。
- 六个启动快照：与上一轮记录的原六根文件 SHA256 一致。
- 两 state/两 handoff：当前字节与启动快照一致。
- 两 history：各只多一条，旧数组及其它字段未变，correctsRef 的原条目规范摘要正确，新 ID 各唯一。
- 本轮独立复核期间 K 23 文件及六根文件未发生变化。

| 轴 | 当前统计 |
|---|---|
| 54 任务实施 | COMPLETE 18 / IN_PROGRESS 2 / NOT_STARTED 34，即 **36 未完成** |
| 54 任务验证 | PASS 10 / NOT_RUN 37 / ENV_BLOCKED 7 |
| 306 验收 | PASS 53 / NOT_RUN 228 / ENV_BLOCKED 25 |
| 发布 | 54 项全部 NOT_EVALUATED |

31 历史开放项及原批准状态保留。没有通过元数据追加增加任务完成数。

## 最小接续范围

1. **一个汇总窗口即可**，无需重开 A～F、重跑 9 控制或任何 npm/数据库命令。准确的 13 个替代绑定已列在 [canonical-reference-index.json](canonical-reference-index.json)。该索引只证明当前实际字节与替代目标，不将旧 K 的封存改判 PASS。
2. 若需要机器可用的替代封存，执行 [NEXT_EXECUTION_PROMPT.md](NEXT_EXECUTION_PROMPT.md) 的小型 overlay：保留 K，修正引用/计数与读回方法。不得重新扩展成全套交付重审。
3. 业务负责人可同时审查既有四组待签材料和外部输入，先解决 T-RP-02 的恢复合同。未经相应具名批准，不从文档准备直接进入 RP09/RP08-T02/RP02-T02/RP10-T01。

此处未再次宣称所有 36 项都受同一批准阻塞，也未重新推算全部任务的每一适用门禁。仍以原 TASK_GRAPH 的逐任务 implementationDependencies、acceptanceDependencies 和条件门禁为实施依据。

## 证据入口

- [findings.json](findings.json)：4 类确认问题、准确影响与验收。
- [readback.json](evidence/readback.json)：126 处声明的逐项核对、13 个失败、冻结和状态事实。
- [check-delivery.py](evidence/check-delivery.py)：只读核对代码；已有证据文件时拒绝覆盖。
- [canonical-reference-index.json](canonical-reference-index.json)：当前 K 23 文件、六根文件、13 个准确替代目标。

本裁定只覆盖交付元数据。本地产品验收、目标环境验收、审批与发布继续分别记录。
