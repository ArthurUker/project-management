# 六窗口汇总独立复核（2026-10-05）

## 裁定与范围

**MATERIAL_PRESERVED_FINAL_SEAL_REQUIRES_CORRECTION**。

本轮材料、worker输入与六根记录追加可以保留；当前整体封存的 PASS 不能接受。需一次限定在交付元数据的新订正，不重开 A～F、不改业务代码或重跑控制。C～F 仍是未签方案，可以进入负责人审查，但不能按当前汇总直接实施。

复核对象 J：`docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/integration/readiness-resume-01/`。

本复核仅做文件/哈希/JSON/路径、历史追加、未签方案的选定一致性检查，没有运行应用、构建、业务测试、控制、数据库、JWT、IDB或浏览器。未修改 J、worker、六根记录、旧证据、业务源码或批准登记。

## 已证明可以保留的结果

- 277 个应冻结的受保护文件零漂移；六根记录的变化是本轮授权追加，不把它们误记为源码漂移。
- 原六窗口 938 文件不变；计入 A 新补正后，当前六窗口 948 文件已登记。A 新 manifest 851 条、B/C/D/E/F 的 19/14/18/15/18 条全部匹配。
- 两 state 去掉新增 continuation 后语义与 B 的原始快照一致；逆向去掉新增条目后的完整字节 SHA256 也与批次旧基线相同。
- 两 handoff 保持旧字节前缀；两 history 逆向去掉新增末条后的完整字节摘要匹配旧基线，原末条规范摘要不变。本次逆向计算用于验证旧字节保持，不冒充执行者在启动时采集的快照。
- J 顶层 manifest 34 条哈希全部匹配，但只有32个唯一文件路径，原A READY/manifest各重复一次。
- 冻结计划2335文件摘要一致；原54任务、306验收、31开放项和批准状态不变。原36任务未完成实施。
- approval-bundle 中5个决定仍 PROPOSED，批准人/日期/批准证据均null。

## 必须订正的交付问题

### AG-01 / P2：引用路径基准仍不完整或错误

1. `REVISION_HISTORY.json:1986`、`:1993`及`EXECUTION_REVISION_HISTORY.json:880`、`:887`的新条目：两份seal文件键以`execution/...`开头，却声明REPOSITORY；review/evidenceLimits以`docs/remediation/...`开头，却声明PLAN。严格依声明解析，**共8个引用不存在**。
2. J/evidence/nine-path-evidence-binding.json中**34个带hash引用没有pathBase**，也无文件级base定义。按复核明确指定的批次S根诊断映射，34目标存在且hash一致；这只证明字节正确，不代表原件有可严格解析的路径合同。
3. J/approval-bundle.json:53 的 E 外部材料请求写成`window-e-revision/external-client-evidence-request.md`，实际位于`window-e-revision/evidence/external-client-evidence-request.md`。

影响：自动接续/严格读回无法定位对应seal、复核和客户端外部材料；原post-seal-readback只查顶层manifest，未证明这些嵌套引用正确。建议在新订正中统一REPOSITORY+真实仓库相对路径，生成明确替代映射，旧件保持不变。

### AG-02 / P2：宣称的审批字段规范化未实际落盘

J/evidence/readiness-normalization.json的purpose声称处理pendingApprovals/notApproved；六个窗口节点实际都没有pendingApprovals，也没有逐来源转换条目，却把B/C/E/F记为Conforming。

影响：机器清单的必填协议仍未被兑现，读者无法知道具体待批内容被如何规范化。建议在新记录中：A来源为有效READY.pendingApprovals；B～F逐项从原READY.notApproved映射，并保留sourceRef、原字段名及原值。不把旧件的字段缺失当作无待批。

### AG-03 / P3：执行history的新条目标识字段不一致

EXECUTION_REVISION_HISTORY.entries[17]用了version，没有id；原17条均使用id。REVISION_HISTORY的version字段是正确的，两registry不能直接复制同一条目结构。

影响：按entry.id查找新EXEC条目的消费者无法命中；当前“新ID唯一”只证明字符串作为version存在。建议只追加具有真实id的新EXEC订正entry，correctsRef精确指向entries[17]的索引、原version和规范摘要，保留原条目。

## 计数、回滚与证据限制

### AG-04 / P3：条目数被表述成唯一文件数

34条=32个唯一路径；16个worker标记条目=14个唯一READY/manifest文件。内容未丢失，但应在新manifest去重并分别报告entryCount/uniqueFileCount。整体读回要覆盖嵌套ref、规范化字段和根记录保持，不能仅以34条哈希一致宣称全范围PASS。

### AG-06 / P3：rollback仍包含删除封存证据与撤销历史追加

J/rollback.md前两项要求删除J与移除六根记录新条目，末尾又要求保留封存证据。本轮未执行删除。J已被history引用，后续撤回必须追加撤回/替代记录，不删除已封存目录或移除既有registry条目。

## 批准前必须澄清的方案问题

### AG-05 / P2（方案一致性，不是新业务代码缺陷）

窗口C/decision-draft.json:80的submitBeforeAfter500写“业务写与回执同事务 → 500时整体回滚无半成品”。既有RP00-T02/failure-point-matrix.json的FP-06明确不承诺整个批次原子性；FP-07说明每项业务/回执已提交后lastPushAt失败仍可产生500；FP-08覆盖提交后响应丢失。

同一事务只保证该提交边界以内的原子性，不能把任意HTTP500或响应丢失推断为全批未提交。批准前需明确：提交前失败的回滚范围；提交后500/未知响应按原key/hash查询或重放；批次中已提交项的结果与最后副本保全。新交付只记录待澄清项，不重写C方案、选择新政策或批准T-RP-02。

其他未签方案未在本轮获得完整架构验收。E的受支持/部署客户端、400/409精确合同，D的single-use/family选择，F的水位/epoch及保留数值仍需具名决定与外部材料。

## 接续

1. 原汇总窗口按SEAL_CORRECTION_PROMPT.md在一个新K目录完成限定订正。仅允许追加两history各一个订正entry；两state与两handoff保持当前字节，不再生成重复continuation。
2. 负责人可同时阅读BUSINESS_DECISIONS.md审查未签方案；不因元数据补正自动批准。
3. 新封存交付后独立复核；随后按实际满足的门禁选择业务任务。未部署release仍NOT_EVALUATED。

详细路径、摘要、重复项、根记录验证、原条目规范摘要见evidence/readback.json；检查脚本见evidence/review-check.py。
