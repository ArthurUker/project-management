# RDPMS 详细修复计划 v1

计划日期：2026-10-01。审计基线及规划时 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本轮仅分析和制定计划；实施状态全部 `NOT_STARTED`，验收全部 `NOT_RUN`。

## 1. 是否可以结束审阅并进入修复

**可以结束常规全面代码审阅，冻结当前审计基线，进入修复规划和后续分包实施。** R00–R14 有 15/15 包终态，S00–S06 有 7/7 包交付；现有证据已经能够为确认问题定义触发路径、目标行为、责任范围及验收。继续全仓扫描不作为修复的统一前置条件。

仍须保留有边界的定向审阅和验收。31 项开放事项不能一律归成“缺环境”，也不能一律视为所有修复的阻碍。尤其 S03-OI-03（500 后队列恢复合同）和 S03-OI-09（完整客户端 revision 链）是尚未完成的静态问题，实施对应包前必须完成。其余事项分别作为业务裁定、局部技术设计、数据迁移或目标环境验收门禁。原审计状态继续为 `COMPLETE_WITH_PENDING`，本计划不将开放项改成已关闭。

当前有 33 条不重复发现/候选：32 条 `SUPPORTED`（16 P1、16 P2）及 1 条 `PENDING` 候选 R12-N01。SUPPORTED 表示证据支持该命题，不表示生产已经遭受相同影响，也不表示修复通过。N-S02-01 是源码支持的旧离线行归属/发送路径，浏览器时序和服务端接受尚未证明；B19 的跨项目级联影响扩展是历史 B02/B19 两个前提与当前 FK 语义的连接，组合运行和部署约束漂移尚未检查。

S00-OI-01 的 R09 原始 startHead 缺记录属于溯源缺口。继续有界查找，缺证仍标 UNKNOWN_NOT_RECORDED；当前基线与工作区可核对，因此它不阻塞已确认缺陷的设计和修复。R12-N01 保持候选，先裁定实际备份窗口及外部写屏障，不计入确认缺陷整改完成率。

## 2. 证据入口与规划产物

- 审计结论：`../../audits/2026-09-30-review-plan/execution/supplemental/S06/FINAL_ACCEPTANCE.md`。
- 逐条裁定：同目录 `FINDINGS_RECONCILIATION.json`；开放事项：`OPEN_ITEMS.json`。
- 设计来源：原 R14 的 `REMEDIATION_CARDS.md`、`ARCHITECTURE_ROADMAP.md`，本计划将 C01–C08 拆成 RP00–RP19。
- `PACKAGES.md` / `PACKAGES.json`：20 个任务卡，含范围、实施步骤、验收、依赖、回滚、停止及必交证据。
- `FINDING_TO_PACKAGE.json`：33 条记录各有一个主包，辅助包不重复计数。
- `OPEN_ITEM_GATES.json`：31 项原开放项逐条保留，登记阻塞层次和解除条件。
- `DECISIONS_AND_GATES.md`：业务和技术设计提案。推荐项不是已批准要求。
- `ACCEPTANCE_MATRIX.csv`：97 条继承验收场景，全部 NOT_RUN；它们还需要与批准规则和实际实现对齐。
- `IMPLEMENTATION_STATE.json`：待实施状态，`executionAuthorized=false`；`HANDOFF.md` 和 `EXECUTOR_PROMPT.md` 为以后接续入口。
- `INPUT_MANIFEST.json`：规划输入的摘要、HEAD 和工作区边界。

旧历史目录、原 R/S 台账和 manifest 冻结。本轮新产物只在本目录，规划不修改旧审计的 finding 裁定或实施记录。

## 3. 原则与优先次序

保持模块化单体。当前证据支持的是跨入口授权/命令不一致、事务缺口、离线数据保全和发布恢复问题；没有性能或容量证据支撑拆成微服务、更换数据库或先引入消息平台。

以权限和数据风险安排先后。越权重置、无授权物理删除、同步读/归档绕过、感染文件别名、离线草稿丢失和历史备份可变路径优先。P2 与同一根因一起处理；B19 已扩展影响应随 B02 一起防护，但保持原 P2，不为规划自行升级严重度。功能性 P1（状态投影/半项目/锁定/恢复虚报）也纳入前两波。

现有已批准权限/状态规则能直接指导的纠错，与需要新增业务选择的行为分成子任务。每包只等待自身相关决定。自定义角色绑定未决不阻塞合法 role-create DTO；历史关系异常盘点未完成不阻塞拒绝新的跨项目 parent；manager 规则未决不阻塞使用既有状态表修复 sync archive 绕过。

## 4. 分阶段与工作包

|阶段|工作包|阶段目标|退出条件|
|---|---|---|---|
|0 进入实施准备|RP00|基线、两项静态门禁、决定登记与隔离资源|对应包拥有明确规则、scope、数据/环境所有权和验收方案；按包解除，不要求全部决定一次完成|
|1 优先保护与明确纠错|RP01、RP02、RP04、RP05、RP06、RP07、RP08、RP11、RP14、RP17|阻断越权和不可恢复数据损失；恢复锁定/创建/状态/软删功能|未授权操作无业务副作用；未确认 payload 保全；感染字节拒绝；安全快照验收范围如实记录|
|2 原子命令与发布基础|RP03、RP09、RP10、RP18|会话、单项事务/receipt、CAS/同修订 snapshot、候选/配置门禁|确定性并发及故障证据吻合实际 row/receipt/version；候选错误在迁移前阻断|
|3 同步协议|RP12、RP13|count/byte 分批、稳定分页、授权回填、提交可见水位|超量和迟提交不永久漏数；请求/存储失败不丢 payload；协议升级可恢复|
|4 数据和恢复模型|RP15、RP16|经批准的异常处置/关系约束与 restore 对账|异常归零或显式隔离；约束和锁兼容可证明；响应计数与 DB effect 相等|
|5 目标环境验收|RP19|配对恢复点裁定、灾备与发布/回滚演练|候选风险有证据裁定；目标 Linux 与兼容 release 演练达到批准验收；所有关键 NOT_RUN/ENV_BLOCKED 有清晰结论|

阶段是风险顺序，包依赖以 `PACKAGES.json.dependsOn` 为准。RP18 的候选门禁与配置准备可提前并行，不必等所有业务修复；真实切流仍要经过阶段5。RP16 可提前在隔离环境设计/实现 registry，真实 restore 必须另满足可验证备份和恢复门禁。

### 建议实施波次和文件协调

1. 完成 RP00 中各自需要的准备后，可选择 RP02（auth）、RP04（projects）、RP11（offline）、RP14（files）、RP17（backup）、RP18（deploy/config）中范围不冲突的包并行。
2. RP01 与 RP02/RP03 的认证公共文件串行集成；RP05/RP06/RP07 共享 project scope/command，按 RP04→各适配入口推进。RP07 和 RP08 都写 sync.js，由同一 owner 依次集成。
3. RP09 确立 per-mutation/receipt 合同后接 RP10；task/reports 共享命令按统一基线合并。RP03 的 tokenStore/http 与 offline 生命周期集成须与 RP11 共审。
4. RP12、RP13 都改 engine.ts/sync DTO，分别建协议变更再串行合入。RP08、RP11、RP13 的 ACL/owner/cursor必须联合验收。
5. RP15 数据迁移和 RP16 restore 回灌合同共用目标 schema；schema/migrations 只有一个集成 owner。最后 RP19 统一目标环境验收。

一个包建议拆成“合同/适配”“核心实现”“隔离验收/迁移”小提交，避免把身份、同步、迁移和发布混入一次不可回滚变更。并行执行时使用隔离 checkout/worktree，保护未提交审计文档；共享文件变更不得由多个执行者直接覆盖。并行数量按可用执行资源决定，本计划不启动执行者。

### 分批发布计划

未来每次candidate按实际包含的包计算验收、schema与恢复门禁，避免把20包捆成一次发布。RP19完整依赖用于整轮整改项目最终验收；小批次发布选择其相关子验收、可验证备份、当前schema兼容和已批准runbook。是否投产由届时具体变更范围决定，本计划不执行发布。

|建议批次|内容|必须具备的条件|
|---|---|---|
|保护性小批次|已完成规则裁定的账号保护、感染出口统一、项目无授权硬删除防护等|涉及入口隔离验收、candidate gate、现schema下安全代码回退、可信备份/运行runbook；记录尚未覆盖的已知风险|
|事务/会话批次|receipt/CAS/汇报snapshot、refresh/session及项目聚合|app×schema expand兼容、并发/故障验收和不会复活会话或重复命令的rollback|
|离线协议批次|owner迁移、分批、ACL/snapshot/pull cursor|真实浏览器升级/中止/重开、old/new client协议窗口、草稿保全、完整日志/墓碑保留|
|数据/恢复批次|历史异常处置、复合约束、restore、配对灾备|获准数据处置、目标DB锁/兼容、目标Linux和paired restore/rollback演练|

整轮16个P1全部通过是整改项目总体验收条件；每次小批次应核验其影响范围，不能把未包含但尚存的P1描述为已关闭。跨包依赖不足、candidate中混入未验收schema或恢复能力不清时暂停该candidate。

## 5. 目标架构和事务边界

### 5.1 授权上下文与业务数据

共享授权决策明确 actor、系统 permission、项目 role/capability、owner 条件、elevated 和有效数据范围。它不能代替业务 snapshot。status/startDate/revision 等每条命令需要的字段应显式读取，并在事务有效快照中校验。registration、sync、file别名都复用相同授权语义。

HTTP 和 sync 仅负责认证、DTO 和返回适配。领域 command 接收 actor/resource、批准动作、客户端 revision、payload、transaction client 和 idempotency context；同一资源操作的状态、成员关系、删除和副作用只在一处定义。新模块候选路径见任务卡，现有 JS/TS 构建与运行 import 需在包启动时核对。

### 5.2 单条业务事务和回执

对每个 mutation，在一个数据库事务内完成资源授权/CAS、业务变化、必需严格审计和 scoped/hash receipt。同步 batch 可部分成功，每项各有确定 outcome。不能因修 B06 将整个队列锁进一个大事务。

receipt 的作用域和 canonical hash 明确，授权优先于 replay。相同主体/资源/命令/key/hash重放同一结果，换 payload冲突，换主体不借旧key读结果。同 key并发、receipt fault、提交后响应丢失都用屏障/故障注入验证；失败者不得覆盖胜者成功回执。旧无作用域回执的兼容不允许伪造历史hash。

### 5.3 离线数据与 pull 协议

身份启动恢复与显式登出分开。records/outbox/cursor/ACL/conflict/dead-letter 都有明确 owner；无owner旧数据保持隔离副本，禁止归给首个登录者。数据搬移与删除在同一IDB事务内，migration中止可重入。只对已确认的本项 outcome出队。

上行同时限制条数和真实序列化字节，依赖排序和响应完整性显式校验。下行每个upsert/tombstone流稳定分页，在固定窗口内全部应用完成后提交checkpoint；初次授权有scoped snapshot，撤权先按当前owner清理镜像且不毁未确认payload。

迟提交问题的最终方案须经 ADR和屏障证明。推荐评估“业务事务持久outbox+单体内提交后发布器”：发布器仅读取已提交outbox，在一个持锁事务中分配并提交published sequence和水位；未提交/晚提交业务change只能获后续发布号，不被max序号越过。事件记录必须是该成功revision的投影/墓碑，不能发布时任意重读被后来修改的业务行。该设计尚未批准/实现；若选别的方案同样必须证明没有未提交缺口。先修截断分页不等于已解决此语义。

### 5.4 数据约束与恢复

先用应用guard阻断新的跨项目边，再盘点/批准处理历史异常，最后新增并validate数据库约束。复合FK不能代替DAG/live-reference规则，soft-delete不等同物理cascade。历史migration不得改写。

JSON模块restore与整库dump+files灾备有不同覆盖合同。JSON registry涵盖其支持表全部unique/FK，回报实际effect，不静默skipDuplicates。DB/file共同runId和hash只是配对标识；一致恢复点还须有可证明的写屏障或版本快照。

## 6. 验收、关闭发现与发布标准

`ACCEPTANCE_MATRIX.csv` 的97条场景是未来验收需求，全部NOT_RUN。本轮只核对计划数据结构和覆盖映射，没有执行缺陷重现或产品验收。涉及未批准的业务目标（如复提来源、DAG和失效时限），执行前先按决定登记批准/更新预期，不用未批准测试决定业务规则。

每个包至少提交实际差异、合成夹具/命令/退出码/日志、实际DB/IDB/文件状态、清理记录、兼容和回滚结果。验收必须反转原缺陷断言：旧探针显示越权/丢数成功是缺陷证据；修复场景须显示禁止越权/保持数据，而不能把旧探针退出0算成修复通过。

只有目标规则获批、必要入口均覆盖、实际代码变更、与风险相符的隔离运行验收通过、无未解释副作用后，才可登记该finding修复验收完成。B19主包RP05的guard关闭应用漏洞前，要覆盖所有已知写入口与组合删除路径；RP15的数据库加固/历史异常仍单列，不用辅助包重复计算关闭。

状态分别登记：包实现NOT_STARTED/IN_PROGRESS/IMPLEMENTED，验收NOT_RUN/FAIL/ENV_BLOCKED/PASS，发布NOT_RELEASED/READY_FOR_RELEASE/RELEASED/POST_RELEASE_ACCEPTED。代码完成、地方隔离验收、目标环境验收、merge/deploy和生产观察不能合并一个“100%”。有关键环境用例NOT_RUN时，不宣称目标环境或生产通过。

对P1优先要求授权拒绝无副作用、未确认payload至少一份持久副本、业务/audit/receipt一致提交及可信恢复能力。候选R12-N01先做证据裁定；若被反证则保留反证，若作为可靠性增强实施则另记增强，不能虚增确认缺陷数量。

## 7. 迁移、兼容和回滚

- 认证/schema：expand字段→旧新读写兼容→批准时限后收缩；回滚不能复活已撤销令牌。
- API/revision：受支持版本、缺基线处置和升级提示先登记；不能为兼容继续无条件覆盖，也不能未经版本说明突然拒绝所有旧客户端。
- IDB：先保全/复制→校验→切分区；无owner隔离，不clear整个库作恢复。回滚版本须理解新owner布局。
- cursor/receipt：协议带版本，旧新水位不能直接比较；保留原mutationId和payload；不能回滚到跨主体replay或截断游标。
- DB关系：先应用guard，后数据处置，再约束validate；为受控处置留原值/依据/补偿，不触发无授权级联。
- 文件/备份：保持旧URL委托安全policy；历史快照先保全，staging失败不发布，不用疑似受污染备份覆盖业务。
- 发布：candidate contract gate在迁移前；old/new app×schema兼容表与非敏感runbook齐备，未知兼容或manifest不匹配立即停止。具体生产切流和恢复不在本次授权范围。

## 8. 本轮完成边界和下一步

修复计划已经完成，实施没有开始。最先接续入口为RP00，然后按解除的门禁启动独立包。当前无需开展第二轮全面审阅；需要的补充分析已列到对应门禁。实施顺序建议从风险高且相关规则已明确的包开始，未决policy的子任务继续保持待批准。

用户以后明确启动实施时，执行者先读本文件、`IMPLEMENTATION_STATE.json`、`OPEN_ITEM_GATES.json`及所选包卡；重新核对基线，完成对应RP00门禁，只推进获准包。详细接续说明见`HANDOFF.md`和`EXECUTOR_PROMPT.md`。
