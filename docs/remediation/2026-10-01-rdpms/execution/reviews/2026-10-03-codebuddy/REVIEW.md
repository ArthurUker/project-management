# CodeBuddy 四任务交付独立复核 — 2026-10-03

## 结论和范围

不能按“四项全部 COMPLETE/PASS”验收。RP04-T02 本地任务范围接受；RP02-T01 结合本轮独立补证接受；RP10-T02 仍有真实 P1 保存竞态，退回 IN_PROGRESS/FAIL；RP08-T01 实现保持 COMPLETE，但必要普通 API 对照尚未执行，任务整体验证恢复 NOT_RUN。所有发布均 NOT_EVALUATED，各包仍 IN_PROGRESS。

HEAD 为 `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`，工作区包含此前多轮未提交修复。本轮只审阅和定向补证，未修改业务源码、正式测试、依赖、迁移或部署文件；只追加审阅文档和更新当前运行账本。原审计、历史 run、CodeBuddy 本轮 run 及两轮复核证据保持冻结。

## LR3-01 — P1：POST 新建分支仍能迟到覆盖已提交正文

- 关联：RP10-T02 / B10 / LR2-01。
- 位置：`rdpms-system/backend/src/routes/reports.js:177` 初次按业务唯一键读取；`:242` 新建/恢复分支；`:245` 无条件 upsert 更新正文；`:265` 基于旧 current 选择审计 action。
- 入口及调用链：合法作者 `POST /api/reports` → 项目 write 和 reports.create → 持久幂等 validate 读到 null → execute 新建分支 → `tx.report.upsert(update: {content, ...})`。另一不同 key 的请求在此期间创建相同项目/作者/类型/周期的报告并 submit。原请求恢复时 upsert 变成更新已提交报告，未走 `saveReportDraft`，没有真实状态/CAS谓词。
- 已有保护/反证：共享 saveReportDraft 的状态+CAS原子 UPDATE 有效；原 late PUT 现为409 INVALID_STATE、正文/版本一致、失败保存receipt为0。POST 既有活跃草稿分支已共享保护；同key回放、submit行锁和唯一键都不能防住两个不同key在“原本无行”窗口的本反例。
- 实际触发：本轮独立屏障暂停真实 upsert **之前**；确保初次查询无行；竞争POST 201、submit200后再放行原POST。
- 已证明影响：迟到POST仍201，真实Report.status=SUBMITTED/currentVersion=1，正文 `late-new-POST`，ReportVersion正文 `winner-created`；两个 POST 成功receipt，审计出现 create/submit/create。并非推测，也未宣称涉及真实用户数据。本反例使用合法有权限作者；未把推测的 update 权限绕过扩大为已证明影响。
- 建议：消除“查询时无行→无条件 upsert 更新新出现活跃行”的旁路。新建可使用事务内 create+唯一冲突拒绝，或对唯一业务键采用一致串行化并重读、授权和状态/CAS检查。墓碑恢复必须按现有合同受控，不能顺带批准新恢复政策；并发出现活跃行不得无条件更新。
- 验收：将本轮反例反转为受控拒绝，无迟到正文/audit/成功receipt；覆盖 POST 新建竞争、既有草稿、墓碑恢复边界、legacy/modern、同key合法回放；保留 PUT/sync 原子保护和版本唯一性。D-S01-07 在 submit 来源状态不变时 condition=false，不需要等待新重提政策；RP09只约束联合验收。
- 裁定：RP10-T02 IN_PROGRESS/FAIL；AC-B10-01、PAC-RP10-02、TASK-RP10-T02 FAIL。AC-B10-03 的局部并发版本证据保持 PASS；AC-B10-02 NOT_RUN。**不是 CodeBuddy 新引入的回归，是原修复未覆盖的既有路径。**

证据：`evidence/observations.json`、`evidence/dynamic-probes/attempt-01/integration-suite.log`、`run-results.json`。探针进程 exit0 表示成功确认了反例和其他断言，**不表示产品验收 PASS**。

## LR3-02 — P2：RP08 普通 API 合同对照和成功前提缺项

- 位置：`rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs:49` 请求只使用 sync/init；`:113` 开始的字段常量；`:181` 报告只给 member/viewer/zero；`:226` 检验当前同步字段键；`:293` elevated own-only 对空报告集合断言。
- 交付5/5日志真实，成员/VIEWER/非成员/零权限/SUPER_ADMIN请求真实执行，逐实体权限和非空字段断言是有效局部证据。本轮不认定新业务泄漏。
- 缺项：没有对应普通API的请求/拒绝/字段合同对照；“已批准字段清单”未给出独立批准或合同来源，仅与现有SYNC_ENTITIES投影一致。SUPER_ADMIN未创建本人报告，own-only成功集合为空；删除墓碑也无非空成功夹具，空tombstones断言不能证明其授权投影；服务端pull增量入口没有补验。
- 已证明影响：AC-B04-01与PAC-RP08-01要求“等价在线拒绝的实体/字段不得同步返回”，当前日志只证明内部表驱动投影，不能支持完整原定义或TASK-RP08-T01 PASS。
- 建议/验收：增加七实体与当前普通API的来源映射及成对成功/拒绝请求，明确同步字段是普通API合法投影的子集和own-only额外限制；不能因为API返回更多字段就发明新批准规则。给SUPER_ADMIN本人和他人各建报告并验证非空成功+拒绝；给适用实体建自有墓碑，先证明带权限可见再撤该权限验证init/pull不泄漏。若当前普通合同没有明确字段规则，登记精确缺口，不能执行者代签。不要触及RP08-T02缓存清理/历史回填/IDB政策。
- 裁定：实现COMPLETE；整体验证NOT_RUN（不是FAIL或ENV_BLOCKED，现无业务失败证据）。AC-B04-01、PAC-RP08-01、TASK-RP08-T01 NOT_RUN，保留已运行子场景证据；AC-B04-03原有member/viewer本人报告证据保留局部PASS，不扩大为完整elevated成功链。D-S01-05普通范围condition=false。

## LR3-03 — P2：运行状态和源码证据镜像仍不一致

- 位置：`TASK_GRAPH.json` 四任务运行字段、`PACKAGES.json` executionTaskStatus/validationStatus、`EXECUTION_REVISION_HISTORY.json`、`ACCEPTANCE_MATRIX.csv` target_baseline列。
- CodeBuddy IMPLEMENTATION_STATE/54任务表为18 COMPLETE、10 PASS，但图仍保留RP04/RP10 IN_PROGRESS/FAIL、RP02/RP08 NOT_RUN；包内子任务还有更旧的ENV_BLOCKED。第二份执行版本历史没有2026-10-03交付条目；B10验收baseline仍指2026-10-02的source-hash，相关reportCommands/reports已变化。故LR2-05不能认为全部同步完成。
- 影响：不同接续入口给出相反任务状态；旧源码摘要不能绑定新修复运行。旧摘要无需改写，应追加当前摘要和镜像。
- 本轮处理：保留CodeBuddy和上一轮所有冻结记录，快照本轮开始的当前账本；同步当前可变运行镜像、两级handoff、任务优先级和两份版本历史；验收baseline引用本轮start-baseline/delivery-check中的当前源码hash。此修正只是记录一致性，不是产品通过。

## RP02 补验观察：弱屏障已由本轮定向证据补足

CodeBuddy第一方向停在 user.findFirst **执行之前**（测试:273），能证明停用后入口拒绝，但不经过“读到ACTIVE、密码正确、reset前停用”的旧值竞争。第二方向停用写入暂停、登录全部先完成，证明合法先完成登录语义。二者不应称为覆盖了全部条件更新竞争。

本轮在登录真实 bcrypt 校验之后、user.updateMany(lastLoginAt)实际执行之前暂停；真实管理员PATCH停用200；放行登录返回403 ACCOUNT_DISABLED，真实行DISABLED/lastLoginAt=null，refresh=0，login成功审计=0，无accessToken。当前条件更新实现正确。与既有11/11账号状态/期限/TTL证据合并，RP02-T01局部任务PASS；建议下一次仅把此探针迁入正式回归测试，无需业务修复或扩大session政策。

## RP04 和历史裁定

顶层检查位于normalize/ORM前；前端 `src/types/project.ts` 日期输入为string，ISO/string/null现有合法路径保持。CodeBuddy5/5含聚合/sequence/audit/receipt故障回滚、同key回放和12种非法输入；本轮授权项目201，subtype对象/type数组/boolean日期均400，sequence/projects/audit/receipt完全不变。RP04-T02本地任务PASS；PC03联合NOT_RUN，整包IN_PROGRESS。

LR2-01：原PUT/sync漏洞已局部修好，B10整体被LR3-01阻止；LR2-02局部接受；LR2-03编号更正接受；LR2-04 RP02由独立补证补足、RP08仍缺项；LR2-05运行镜像缺项由本轮记录修正。B04/B10/B14/B18均仍SUPPORTED；目标环境、发布及冻结开放项不关闭。

## 验证和限制

- 检查了四套最终通过日志和命令退出码：8/8、5/5、11/11、5/5及drop/stop清理0；未把这些旧日志说成本轮重跑。
- 本轮运行两次，每次一个新自有唯一PostgreSQL数据库，私有0600临时环境，guard check预期2→reset0→当前源码build0→最终9项独立探针断言exit0→drop0/stop0；临时根和自有dist删除。没有读取仓库dotenv或真实凭据。
- 最终九项：合法ISO日期项目、三个历史非法类型逆验收、非法枚举和非法日期字符串、late PUT逆验收、late POST反例、stale ACTIVE登录条件更新。Protected routes注入可信actor；登录用真实bcrypt；未验证完整JWT链、IDB、候选/目标配置、联合PC03或部署。
- 窄复核未重跑全仓、历史306条或全部后端回归。单元87/87与11套回归以执行者保留日志为证据，不冒充本轮独立全量运行。

## 下一步

先做RP10-T02唯一键新建/恢复旁路返工，再做RP08-T01普通API/增量/非空成功夹具补验；RP04不重复业务返工，RP02只固化已有独立屏障测试。当前两项无需新增具名业务批准，保留其他34项原门禁。详见NEXT_EXECUTION.md和task-readiness.json。

最终复跑使用另一个新自有库（attempt-02），9项断言全部符合预期；同一P1 POST反例再次确认。增加合法ISO日期、无效枚举/日期400无残留。attempt-01七项日志保留，脚本两个版本和差异来源见evidence/probe-versions/。
