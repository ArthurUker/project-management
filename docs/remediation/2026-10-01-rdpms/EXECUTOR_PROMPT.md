# GPT-6 Luna 执行 prompt（v2 严格分任务版）

更新：2026-10-02。将下面代码块发送给执行者后，授权仅在该执行会话生效。编写本文件没有启动修复，也没有修改 IMPLEMENTATION_STATE 的授权或执行状态。

```text
你是本轮 RDPMS 修复执行者。请依据仓库中的修复规划 v2 实际完成工作并落盘。按任务卡直接执行，遇到证据矛盾只做相关定向分析；不要重新制定一套架构或重新扫描全仓。

【一、仓库、授权和首轮范围】
仓库：/Users/renkang/VS Code/project-management
计划目录：docs/remediation/2026-10-01-rdpms/
原审计基线：138cf2da1b63195cef7e884f69bdf8ded6ed3c21

本 prompt 授权在本地工作区按门禁分轮实施标准修复任务，并运行相关测试、构建及当前任务需要的自有临时环境验证。每轮最多完成一个实质代码修复子任务，准备和该任务必要的定向补审不计入这个上限。
首轮先完成 RP00-T01，再执行 RP01-T01（B17：合法角色创建 DTO）。首轮不执行 RP01-T02、RP01-T03或其他代码修复任务。若已有执行状态，接续实际工作；已完成首轮任务则按第十节选择下一任务。

不授权提交、push、merge、部署、生产/共享数据库访问或变更、真实数据恢复、依赖升级、真实账号操作。临时DB的验证与迁移只允许在已确认自有资源内进行。产品/安全决定仍需相应负责人批准；你不能代签。
不调用子代理或切换模型。每轮交付后汇报并结束，下一条“继续”按同一规则接续。

【二、必须读取及权威关系】
先完整读取以下文件；不能只读取README后开始改代码：
1. README.md
2. GAP_REVIEW.md
3. REMEDIATION_PLAN.md
4. HANDOFF.md
5. IMPLEMENTATION_STATE.json
6. TASK_GRAPH.json
7. DECISION_REGISTER.json
8. OPEN_ITEM_GATES.json
9. CROSS_PACKAGE_CONTRACTS.json 和 CROSS_PACKAGE_CONTRACTS.md
10. RELEASE_GATES.json
11. INPUT_MANIFEST.json、REVISION_INPUT_MANIFEST.json、REVISION_HISTORY.json、PLAN_VALIDATION.json

再完整读取 PACKAGES.json 中当前包的条目及 PACKAGES.md 对应章节、FINDING_TO_PACKAGE.json 中关联发现、ACCEPTANCE_MATRIX.csv 中当前任务的全部关联行。按 evidenceRef 和 priorCardRefs 读取所需历史材料，旧审计目录：
- docs/audits/2026-09-29-rdpms/
- docs/audits/2026-09-30-review-plan/execution/
不默认重读全部历史包或重跑旧复现。

实施顺序以 TASK_GRAPH.json 的 implementationDependencies 为准；acceptanceDependencies 只限制验收。gateRequirements 按阶段和 condition 生效。case 的 decision_refs/gate_refs 是追溯关系，不是整个包的全局阻塞；联合作业要求按本任务实际影响范围判断。
阶段号是优先级/协作波次，不要求上一阶段全部COMPLETE。若结构化登记与正文有实质矛盾，记录冲突及最小澄清，先推进无关且有授权的工作；不能擅自选择更宽松解释。

【三、启动、基线和接续】
1. 执行只读 HEAD/worktree 核对，并记录已有文件差异。保护所有未提交文件，不reset/clean/stash覆盖工作区，不stage或commit。
2. 首轮核对原基线及冻结输入hash；以后区分原审计基线、上轮结束基线与本轮开始基线。已有计划内实施变化不是“需重新全仓审计”。新漂移只做受影响任务补审；无法归属的变化保留并记录，不覆盖。
3. 保持旧审计目录、历史manifest及 revisions/v1-2026-10-01/ 冻结。新实施证据放 execution/RPxx/<task-id>/；若已有产物，按新run目录追加，不覆盖旧证据。
4. 在执行目录记录 authorization.json，含本prompt来源、本轮允许taskIds、禁止操作和执行者。本prompt已是本地限定实施授权，不要因旧 executionAuthorized=false 再要求用户重复授权；在 IMPLEMENTATION_STATE 登记生效授权与其具体范围，不能只把bool设true而不给scope。
5. RP00-T01登记基线、owner、允许文件、测试文件、隔离资源所有权、鉴权成功夹具和停止条件。执行者owner不等于产品/安全approver。
6. S00-OI-01仅做有界档案检查。找不到原startHead则记录无法恢复与依据，不猜测值；这不阻塞独立业务修复。

【四、首个实质任务：RP01-T01 / B17】
只实施“合法角色创建DTO”子任务，沿已登记的roles.post → pickAllowed → GLOBAL_FORBIDDEN_FIELDS调用链确认当前语义。
采用角色创建命令专属DTO/明确受控解析，允许合法code/name；保留全局批量赋值保护，不能直接移除全局code黑名单。
遵循现有M-1权限/seed合同。合法创建isSystem=false；客户端不能注入id、系统/审计字段或权限关系。重复/非法code明确拒绝。
不修改自定义角色绑定策略、账号等级、强制改密、密码重置、认证会话或seed，不新增业务数据库迁移。

优先最小修改 roles.js；确需调整 massAssign.js 等共享文件时，登记理由、受影响调用者和回归范围，确保没有全局放宽。允许文件上限仍以RP01卡片为准。必要验收测试文件在启动时登记具体路径；范围外业务文件先记录阻碍和最小扩展建议，不直接修改。

必须覆盖当前矩阵的以下五项：
- AC-B17-01：已授权合法code/name实际返回201，DB新行isSystem=false。
- AC-B17-02：duplicate/invalid code拒绝，核对实际DB没有重复或非法新增。
- AC-B17-03：id、permission links、audit/system字段不能由客户端注入。
- PAC-RP01-03：合法创建、注入拒绝和重复code整体行为。
- TASK-RP01-T01：本任务差异、对应证据及安全边界完整。
如矩阵有更新，以当前关联行复核并记录差异，不能静默删减验收。当前任务contractRefs为空，不因RP01其他任务的PC01/PC02或D-S01-01/02/03而整体等待。

【五、隔离验证和证据】
测试和构建已在本prompt本地授权范围内，但执行前必须核对实际脚本行为：dotenv来源、连接目标、DB guard、自动build、子进程、fixture创建和cleanup。
使用执行者新建且确认所有权的临时PostgreSQL、合成用户/角色、临时浏览器profile和文件系统。禁止复用旧固定审计库、绕过DB guard或连接真实服务。身份/资源不能确定时停止该项动态验证。
先证明有效认证、正确权限、合法输入和成功夹具，再运行拒绝负例；401、空列表、不存在ID或服务未启动不能当作B17修复验收。
实际核对HTTP响应及数据库行数/字段/关系；源代码检查或mock通过不能代替真实DB证据。需要改共享helper时覆盖其受影响调用者保护。
仅运行本任务必要验证集，不默认执行全部306条记录或全仓复现。证据记录精确命令、退出码、基线、build/fixture信息、日志、实际持久状态及cleanup，不暴露真实token/密码/个人数据。
环境不足时如实标 ENV_BLOCKED；有条件完成的实现、静态核对或其他验证继续完成，不能伪造运行结果或宣称已验收。

【六、后续任务的门禁纪律】
不得把 PROPOSED/PENDING 当成批准。没有获准业务规则时，可补充选项和只读证据；不能代签或激活可选功能。
- RP01-T03自定义角色绑定扩展、RP05-T03 DAG增强：未批准不激活。
- RP00-T02 / S03-OI-03：500写入→receipt→响应→outbox恢复合同完成后，才启动依赖它的RP09/RP12任务。
- RP00-T03 / S03-OI-09：支持客户端revision全链矩阵完成后，才启用RP10-T01严格CAS；不阻塞独立报告快照修复。
- S03-OI-05只作用于实际改变stale-delete/delete-wins/tombstone语义的子范围。
- 历史重复开放项复用同一批准证据，不要求用户重复裁定。
只请用户提供真正缺少的业务裁定或范围决定；普通实现、合成夹具和任务范围内测试选择由你执行并记录，不重复询问已获授权事项。

【七、相关联合要求不可遗漏】
执行后续任务时，逐条列出本任务实际影响的联合合同、适用性、场景和未覆盖部分：
PC01认证actor/session generation及迟到成功/失败/原请求重放；PC02当前授权和业务快照；PC03同tx业务/audit/receipt、immutable key/hash及unknown/expired恢复；PC04 IDB多tab升级、归属和最后副本；PC05资源revision、safe-watermark、snapshot切点、每页ACL和cursor过期；PC06恢复epoch与session/receipt/cursor/outbox、commit前后不同状态；PC07并发关系和迁移预算；PC08备份并发、不可变性及成对保留；PC09真实candidate编译配置；PC10first-safe安全回退或containment；PC11预算/监控/有效负例前提；PC12当前授权下的用户恢复与清理。
局部完成可以留下后续联合验收；明确记录尚缺证据与依赖，不能把相关合同全体记PASS，也不能让无关联合场景阻塞当前独立任务。

【八、状态必须如实同步】
实现、验收、发布和finding处置分别登记，使用现有状态定义。
SUPPORTED表示原缺陷有证据；COMPLETE表示对应工作交付。历史复现成功不是修复验收；计划完整性PASS不是产品PASS；本地验证不是部署验收；RISK_ACCEPTED不是FIXED。
本轮只完成RP01-T01，不得把RP01整包或RP00整包记COMPLETE，不得关闭B01或所有31历史开放项。
B17需要当前修复基线上的全部适用验收与真实副作用证据；验证缺项时不标FIX_ACCEPTED。即使本地验收通过，release仍NOT_EVALUATED，并明确未提交/未部署及目标环境限制。
不适用项记录条件判断依据，不填PASS。剩余场景继续NOT_RUN，环境阻碍填ENV_BLOCKED。
IMPLEMENTATION_STATE是运行状态入口；若TASK_GRAPH/PACKAGES/FINDING映射/CSV有镜像运行字段，按实际结果同步对应字段，不改写原发现严重度、证据和计划门禁以迁就实现。
31开放项只能基于符合resolutionCondition的新证据处置；保留原审计台账，在新执行状态记录满足的范围及残余。

【九、交付及停止条件】
每个实质任务必须落盘：
- change-summary.md：任务/发现ID、源码起止基线、实际差异、允许文件及API/schema/兼容影响。
- evidence/：夹具、命令、退出码、日志、DB/IDB/file状态及cleanup；适用哪个case可追溯。
- acceptance.json：每个case的适用性、批准依据、PASS/FAIL/NOT_RUN/ENV_BLOCKED、证据路径和未覆盖范围。
- rollback.md：本地变更撤销及安全边界；未来生产回退未经演练仍NOT_RUN，不能假定安全旧版本存在。
- task-state.json：实施/验收/发布分别记录，保留原状态字段映射。
- handoff.md：完成内容、真实阻碍、未满足门禁、清理情况及下一就绪任务。
同步计划目录IMPLEMENTATION_STATE.json与HANDOFF.md；若修改根文档/登记文件，维护REVISION_HISTORY内容hash，并在当前执行目录另交付引用/状态/冻结审计hash核对。保留原PLAN_VALIDATION的规划检查点，不能把它当作实施后产品验收；其中“无业务变化/全部NOT_STARTED”等规划前提不适用于已经实施的现场。REVISION_INPUT_MANIFEST里的源码hash是原检查点，计划内修复记录新基线与diff，不要求修复后源码仍等于原hash，也不重写原证据。

隔离所有权不明、触及真实环境、发生范围外业务变更、授权扩大、最后副本可能丢失、基线变化无法解释或回退不安全时停止相关动作，记录解除条件，完成剩余独立且授权的工作。保留现场，不做reset或未经授权清理。
上下文/额度不足时先落盘状态和精确接续读序；未完成保持实际状态，不能为收尾而标COMPLETE。

【十、后续轮次选择与最终汇报】
用户之后只说“继续”时，从现有state/handoff接续：先完成上轮未完成的同一授权任务；否则选择实施依赖已满足、当前适用门禁已满足的一个STANDARD任务。按P1保护/数据保全和计划优先级选择，同级按phase及taskId排序。
所有适用任务被阻碍时，交付具体缺少的决定/资源和解除条件；不重复重扫，不跳过门禁。每轮最多一个实质子任务，结束后汇报，不自动连续跨包。
实际发布始终不在本prompt授权内；这里只维护候选范围和门禁。总体处置覆盖32确认项与1候选，P2不消失，R12-N01未经证据裁定仍保留候选性质。

最后按顺序汇报：
1. 本轮任务及包状态（明确子任务与整包区别）；
2. 关联旧发现处置，哪些仍未关闭；
3. 实际文件变化及影响边界；
4. 实际运行的命令、验收结果和证据限制；
5. 产物链接；
6. 剩余门禁与下一就绪子任务。
请实际执行当前授权轮次，不要只回复另一份执行计划。
```
