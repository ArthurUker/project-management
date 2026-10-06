# 仅差分补齐准备材料

下列指令须用户转发后执行。不是本审阅自动启动的任务。

```text
你是RDPMS准备补遗执行者。只处理最新独立复核RV-LP-01～05，不修业务代码，不重新制定架构，不重新扫描全仓。按固定步骤完成并落盘。

ROOT=/Users/renkang/VS Code/project-management
P=docs/remediation/2026-10-01-rdpms
N=docs/remediation/2026-10-05-luna-remaining-plan
L=docs/remediation/2026-10-05-luna-remaining-execution/preparation/2026-10-05T110512Z-luna-preparation-01
R=docs/remediation/2026-10-05-codebuddy-luna-independent-review
唯一写入：docs/remediation/2026-10-05-luna-remaining-execution/preparation/下新建自有唯一rework run。旧L、R、N、P、所有审计、CodeBuddy、源码、测试、依赖、schema、migration、两history/两state/两handoff全部只读。新run已有时读取接续，不覆盖旧产物。

先读R/REVIEW.md、findings.json、case-reconciliation.csv、task-readiness.json及evidence/readback.json；完整读取原LUNA_PREPARATION_PROMPT.md和L四包专项矩阵/规格/36任务草案/21批准请求。按原N固定来源与真实ref读当前涉及的既有run，不以mtime或最大attempt号猜测。用户已确认CodeBuddy与Luna停写，这不等于业务批准。

固定只交付五项差分：
1. RV-LP-01：修正RP13-T02的49个错误exists观察，基准为P/execution；完整读取2026-10-02-continuous-rework的acceptance、task-state、attempt-02/barrier-summary、commands和明确证据，以及RP13-T01 followup run。保存每artifact路径/hash、旧历史状态、较新run局部结果、当前汇总及范围。不能把旧根快照自动当当前status冲突；候选SQL模型不等于应用safe-watermark。保留未签ADR、应用/producer/IDB/崩溃/retention缺项。
2. RV-LP-02：8个原补验任务各写可复用证据、具体缺口、最小下一验证步骤、成功fixture、命名故障边界、响应/真实持久断言、批准/依赖/资源/清理、NOT_RUN。13case以R表为候选逐条核对真实已登记run/断言，给MATCH/PARTIAL/NO_EVIDENCE/CONTRACT_PENDING等准备判定和剩余范围；不改原矩阵result/task_refs，不把原局部PASS扩大。306记录仅保留原归属，不重造case或测试总数。
3. RV-LP-03：差分补LP02，分别列旧成功、旧失败、原请求重放；慢/me、A→B、logout、offline、401/403、撤权、两tab确定性时序。每行记录原actor/generation、合法前提、事件顺序、请求次数/凭据、响应和token/IDB键值断言。最后副本矩阵对可靠与未知owner、upgrade blocked/versionchange、abort/quota/页面关闭逐场景写源与目标、故障边界、reopen可恢复字节、当前授权下查看/导出/放弃条件。未知owner不可从内容或首次登录猜测；不能要求未知owner直接归当前账号。未选项显式OPEN_INPUT，引用D/F/RP00-T04既有设计，不造新协议。
4. RV-LP-04：对36任务现有草案只做逐路径必要性/条件/排除补齐。默认从RP16-T01排除dataEpoch及业务schema修改；确需时先在草案列证据及独立scope/gate，不启用T-RP-10规则。所有拟模块需v2来源；拟测试给确切路径和真实证据层，RP03-T02后端JWT/DB验收不可仅拟frontend unit。原实施依赖、验收依赖、before/condition与可选未激活状态保持，不把21决定当全局阻碍；不新增业务任务或migration授权。
5. RV-LP-05：九个空sourceRefs补原DECISION_REGISTER/DECISIONS_AND_GATES/TASK_GRAPH准确pointer+文件hash；21决定的已存在字段仅差分补齐，approvedBy/approvedAt/evidenceRef继续null。不代签，不从本地授权推断批准。

新run最小交付：authorization.json、change-summary.md、updated-validation-plan.json、case-evidence-reconciliation.csv、identity-response-addendum.csv、last-copy-addendum.csv、task-allowlist-addendum.json、approval-source-addendum.json、source-bindings.json、task-state.json、SESSION_SUMMARY.md、handoff.md、READY_FOR_REVIEW.json。源哈希及改前记录必须准确；所有规格SPECIFICATION_ONLY/dynamicStatus=NOT_RUN。旧准备deliverable状态不覆盖，本run仅标自己真实差分交付状态。

只允许git元数据和标准库文件/JSON/CSV/hash读取。禁止仓库脚本、build/test/DB/browser/Docker/service/network/安装、dotenv/SSH/真实凭据、真实数据、子代理/模型切换、stage/commit/push/merge/deploy/reset/clean/stash、记忆写入。缺外部材料写具体待填字段，继续其它独立内容。

最后用标准库核对新文件结构、所有源ref真实路径/hash、21空签名、36依赖/范围、8规格和13case的差分覆盖；这是准备检查，不是产品PASS。无需payload/history/final封存，不为元数据再开多窗口。完成SESSION_SUMMARY/handoff/READY后停止所有编辑，writerStopped=true，等待独立审阅。即使规则随后获批也不得自行进入业务实现。
```
