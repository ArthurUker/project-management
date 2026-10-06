# CodeBuddy 封存 overlay 与 Luna 剩余工作准备包独立复核

复核日期：2026-10-05。HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。用户已明确确认两个执行者停写。本轮实际检查本地文件、原任务定义、固定来源哈希及明确登记的既有运行；只在本审阅目录写产物，没有运行应用、构建、测试、数据库、浏览器、Docker或网络命令。

裁定：**材料与冻结输入保全；CodeBuddy 的13个替代目标可复用，严格封存整体PASS不成立；Luna准备包部分接受，LP02、LP04及实施路径草案仍需定向补齐。** 未发现本轮新增已证业务缺陷，未关闭旧发现，未实施修复或批准业务规则。

## 1. 接受哪些结果

| 交付 | 独立结论 | 已确认内容 |
|---|---|---|
| CodeBuddy M overlay | MATERIAL_ACCEPTED / STRICT_SEAL_NOT_ACCEPTED | 13/13替代目标真实匹配；18/18 payload哈希匹配；真实21文件=18静态+3；两history各加一条、旧数组/其它字段不变；六READY来源writerStopped与pending值一致 |
| Luna LP00 | ACCEPTED_PREPARATION | HEAD、dirty工作区、唯一写入prefix、授权/禁止范围登记；精确起始时间未记且已明示 |
| Luna LP01 | ACCEPTED_PREPARATION_PENDING_APPROVAL | 原10故障点、FP06/07/08区别、按命令持久、原key/hash恢复、危险旧upsert回退与delete适用范围 |
| Luna LP02 | REWORK_REQUIRED | Bearer/body、401/403/offline、generation/owner和独立access失效门禁边界正确；具体组合与故障步骤不足 |
| Luna LP03 | ACCEPTED_PREPARATION_WITH_PROVENANCE_GAP | 九项具名待填批准字段和有界顺序；custom role/DAG未激活；九单项sourceRefs缺来源pointer |
| Luna LP04 | REWORK_REQUIRED | 环境/外部输入/预算缺项、306记录保留、8/13数量完整；较新run选取、逐项补验与13case实际证据对账未完成 |
| 全局36项路径草案 | DRAFT_REQUIRES_SCOPE_REFINEMENT | 36/36原图依赖及门禁复制一致，路径未越原包上限；仍不能直接作为子任务白名单 |

固定保护核对：277文件、948worker输入、旧J17文件、旧K23文件无漂移；冻结计划2335文件数量与规范摘要匹配；N稳定来源36/36匹配；六根记录审阅期间不变。Luna的27个JSON均解析，16个自身产物绑定全部匹配，21个批准记录签署字段全空。详细逐项结果在`evidence/readback.json`。

## 2. CodeBuddy的具体差距

**RV-CB-01 / P2：订正条目摘要错用。** 新REV `versions[28].correctsRef` 指向旧`versions[27]`；新EXEC `entries[19].correctsRef`指向旧`entries[18]`。两个index及旧记录保全正确，但声明的条目摘要均为`252db966…`。按原批次规范的UTF-8 JSON、sorted keys、compact separators重算，实际分别为`c3176c1d…`与`cad4e8f6…`。manifest匹配不能替代条目归属校验。

**RV-CB-02 / P2：四处历史来源与live路径混用。** `reference-overlay.entries[9..12].sourceFile`使用当前history路径，却带追加前hash，当前读取4处失配。追加前字节在`evidence/start-snapshots`完整存在，这不是未授权篡改；若要引用历史来源，须明确指该snapshot，而不是把旧hash声明成live MATCH。`post-seal-readback`的全部有效引用匹配声明因此不能整体接受。

**RV-CB-03 / P3：固定字段、计数和状态不一致。** 20处新引用仍用`relativePath`，违反本次指定的`path`字段；post的manifest ref未自带pathBase。真实枚举为21/18，旧文字仍20/17，input-binding列17静态，task-state仍IN_PROGRESS_PRECHECK。payload 18/18真实匹配应保留；严格格式不合规也应保留，不能互相代替。

本审阅交付`evidence/canonical-provenance.json`，准确绑定历史snapshot、对应条目及当前history，仅作为独立来源补遗，不改写旧overlay/history或把其整体标PASS。**这些元数据瑕疵不应再次触发六窗口，也不成为所有业务任务的全局门禁。** 若未来确需history勘误，另给具体追加授权；当前不追加任何根记录。

## 3. Luna的具体差距

**RV-LP-01 / P2：LP04采用旧根artifact而遗漏较新run。** 49个以`RP13/RP13-T02/…`记录的文件实际在`P/execution/`存在，准备包解析到错误基准而记false；后来只补了四个存在路径，未替换这49个错误观察。旧根acceptance为IN_PROGRESS/NOT_RUN；已登记的`2026-10-02-continuous-rework`则交付候选SQL真实PG barrier、TASK局部PASS、ENV_BLOCKED和SIGNOFF_PENDING。二者应分别作为历史与后续局部结果，不能只据旧根文件把当前汇总当作新矛盾。

RP13-T01的`2026-10-02-followup-validation`已有真实DB/API的3001活跃行、5001墓碑及keyset局部PASS。新补验应复用这些明确证据，保留前端IDB、RP11-T01联合依赖和safe-watermark缺项。候选SQL模型即使使用真实PG，也不等于应用生产者、恢复epoch、publisher crash或生产safe-watermark通过。

**RV-LP-02 / P2：8项补验和13case仍缺实质规格。** 8项主要复制状态/case/依赖/引用，没有逐任务写最小场景、fixture、具体故障边界、剩余断言、资源/批准与清理。13case的nextAction全部是同一句“以后读取已接受run”，没有完成本轮要求的证据对账。RP05-T01既有run已经明确记录跨项目parent与子任务保留等局部PASS；准备阶段应先分析这些证据。`case-reconciliation.csv`给出13项独立候选对账和真实缺口，没有改原306矩阵或补PASS。

**RV-LP-03 / P2：LP02矩阵不能直接执行组合验证。** 身份表主要是late refresh成功/失败8行加3条概括，没有原请求重放、慢/me、离线返回、logout/撤权和两tab确定性步骤/凭据/网络/持久状态断言。新增IDB场景全部采用通用文字；未知owner也写“证明当前已认证owner”，没有明确无法证明时的隔离、显示/导出限制及原副本去向。需要从既有D/F/RP00-T04方案差分补齐，未知规则仍待填，不能新设计协议。

**RV-LP-04 / P2：包上限尚未充分收窄为子任务范围。** 具体例子为RP16-T01 unique/FK registry任务纳入`schema.prisma`和`dataEpoch.ts`，只列T-RP-06门禁，未说明epoch和T-RP-10独立合同的关系。这些拟模块在v2出现不意味着每个RP16子任务都应纳入。默认排除不必要epoch/业务schema修改；确需时再定向证明必要性和实际条件门禁，不增加一个全包全局门禁。RP03-T02后端会话撤销仅拟frontend unit测试，也不足以落实真实JWT/DB验收路径。36项需逐路径目的、条件和排除项，保留真实依赖/验收依赖区别。

**RV-LP-05 / P3：九批准项sourceRefs为空。** LP03九项可在原registry核对，但单项批准请求没有文件SHA及pointer。补来源即可，不需要重做九项方案；现有21项均未批准的事实保持。

## 4. 最小下一工作与业务入口

用户已经确认停写，写入协调等待可结束。下一业务实现仍由具体任务适用批准、外部资料、新基线和新的实施授权决定；旧metadata封存PASS不加为全局条件。此次“请审阅”只授权审阅。

建议两个独立进度渠道：

1. Luna做一次有界文档补齐：LP02组合规格、LP04较新run/8补验/13case、36路径必要性和九批准项source pointer。只写新准备补遗目录，旧交付/原计划/台账/源码全部只读，动态命令0。具体prompt在`LUNA_BOUNDED_REWORK_PROMPT.md`，待用户转发后执行。
2. 负责人选择并签署一个具体标准任务的规则，例如T-RP-05→RP14-T02，或D-S01-07→RP10-T03。两者已有实施前置，改动范围可明确且不要求先批完21项；批准后给单任务明确源码/测试白名单再实施。也可签D-S01-06→RP07-T02、D-S01-05→RP06-T01，或T-RP-02→RP09-T01的精确非delete/共享helper范围。

T-RP-05需逐scan状态/metadata或字节/delete/elevated/拒绝审计给口径；D-S01-07需来源状态表、same-key replay与new-key resubmit、并发review/version规则。执行者不能代选或代签。T-RP-09/T-RP-04/T-RP-12、支持客户端矩阵与只读数据所有者资料仍是相关链条的独立输入，不被这两个小任务的批准代替。

## 5. 剩余数量与验证限制

原54任务实施：18 COMPLETE、2 IN_PROGRESS、34 NOT_STARTED，未完成36（34必需、2可选未激活）。原任务验证10 PASS、37 NOT_RUN、7 ENV_BLOCKED。原306验收53 PASS、228 NOT_RUN、25 ENV_BLOCKED。8项“已实施未验收”是任务子集，13case是已有任务的额外记录，不能与36简单相加成新的任务总数。

没有运行新的JWT全链、前端真实IDB/浏览器、目标FS/candidate、负载或部署验收；发布54项保持NOT_EVALUATED。没有将旧run局部PASS改为本轮动态PASS。原31开放项及21待批决定没有关闭。两执行目录及六根记录在本审阅期间字节未改。完整发现含位置、影响、建议和验收条件见`findings.json`。
