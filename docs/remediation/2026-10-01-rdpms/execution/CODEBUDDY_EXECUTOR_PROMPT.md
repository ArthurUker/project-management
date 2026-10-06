# CodeBuddy 执行 prompt — 最新独立复核后

此文件只提供交接指令。编写它未启动实现、未改变任务状态、未批准待定决定。用户发送以下内容给执行者后，按本次四任务范围执行。

```text
你是 RDPMS 本地修复执行者 CodeBuddy。请依据修复规划 v2 和最新独立复核，实际完成本次两个返工、两个补验任务，串行实现、验证并落盘。完成本次范围后交付并停止，供独立审阅。

仓库：/Users/renkang/VS Code/project-management
计划目录：docs/remediation/2026-10-01-rdpms/
原审计基线：138cf2da1b63195cef7e884f69bdf8ded6ed3c21
最新复核目录：execution/reviews/2026-10-02-post-continuous/

一、必读与接续

首先完整读取 execution/CODEBUDDY_EXECUTOR_PROMPT.md。
然后完整读取 EXECUTOR_PROMPT.md 规定的全部 v2 文件，以及 execution/LUNA_CONTINUOUS_EXECUTOR_PROMPT.md。
必须读取最新复核目录的 REVIEW.md、findings.json、PLAN_ADJUSTMENTS.md、task-readiness.json、validation-summary.json、NEXT_EXECUTION.md、handoff.md 和所引用反例证据。
再按任务读取 PACKAGES.json/PACKAGES.md 对应卡片、FINDING_TO_PACKAGE.json、ACCEPTANCE_MATRIX.csv 全部关联行、当前状态/授权/交接、原运行和历史证据。
以当前 TASK_GRAPH、IMPLEMENTATION_STATE 和最新复核为准，旧“没有就绪任务”、旧首轮指针及原 PASS 不是当前结论。已经存在后续实现时，先验证新源码和证据再接续，不重复覆盖。

二、本次范围与授权

用户发送本 prompt 即授权本地串行完成以下四项，并运行必要构建、测试及自有临时资源验证：
1. RP10-T02返工：LR2-01、LR2-03，关联B10。
2. RP04-T02返工：LR2-02，关联B18。
3. RP02-T01补验：LR2-04，关联B14。
4. RP08-T01补验：LR2-04，关联B04。
同步处理LR2-05的当前记录一致性。
本次不执行其他实质任务，不因旧prompt的每轮一任务规则而提前结束。每项完整落盘后再进入下一项；四项结束后停止，等独立审阅。
不调用子代理或自行切换模型。不stage/commit/push/merge/deploy，不安装或升级依赖，不访问生产/共享DB、真实账号或真实恢复数据，不签署PENDING/PROPOSED决定，不新增业务数据库迁移。
本地授权不替代产品、安全、数据、技术合同批准。普通任务内实现、测试和夹具选择已有授权，不重复请求用户确认。

三、启动和文件范围

先核对HEAD、git status、实际差异、source hash及已有证据，保护未提交文件，不reset/clean/stash。
新建本次authorization.json，列出上述四个taskIds、允许文件、执行者CodeBuddy、资源所有权、测试路径、禁止操作和停止条件；根据实际进入的任务更新scope，不扩大业务范围。
RP10-T02允许最小修改：backend/src/modules/reports/reportCommands.ts、backend/src/routes/reports.js及必要的backend/src/routes/sync.js保存适配。核对全部saveReportDraft调用者。其他共享guard/类型文件仅在任务卡范围内且确有必要时修改并登记调用者影响。
RP04-T02主要修改backend/src/routes/projects.js及本任务测试。
RP02/RP08优先只补相关测试。若真实失败证明当前任务实现仍有错，先保存反例，再仅按既有合同做最小修复；需要新政策、迁移或范围外改动时停止该分支并交付建议。
以上路径相对rdpms-system/。测试具体路径须登记；不为适配错误fixture放宽权限、批量赋值、状态或审计保护。
旧审计、manifest、v1快照、旧run和两轮复核证据保持冻结。新run采用唯一目录，不覆盖任何既有日志。

四、RP10-T02返工与验收

先核对最新反例：PUT先以DRAFT通过校验，submit先提交，迟到save仍200并使SUBMITTED正文与ReportVersion不同。
将保存的真实可编辑状态与写入原子绑定，可采用一致行锁后读取/检查，或原子状态+revision条件UPDATE；覆盖HTTP和sync共享命令。不能只加强submit路径。
保留现代updatedAt CAS、legacy既有可编辑状态合同、合法原key回放、并发版本唯一性和当前submit/resubmit来源状态。不得启用未批准D-S01-07政策。
必须执行确定性屏障，不能只靠sleep猜测顺序：
- save先完成，submit后完成：快照等于此次成功提交所对应的正文revision。
- save已通过早期校验，但submit先完成：迟到保存拒绝，真实SUBMITTED正文/版本不被覆盖，失败保存不留成功receipt、审计或业务变化。
- HTTP legacy、modern/CAS及sync共享调用者分别覆盖；旧基线409无覆盖。
- 五个不同key并发提交，版本唯一递增，currentVersion和真实版本一致。
- 同key合法回放不因提交后的状态变化而误拒；失败路径和新key不能冒充回放。
按原定义映射case：AC-B10-01用于快照/并发基线；AC-B10-02为待批准重提来源状态规则，保持NOT_RUN，不能拿版本测试填PASS；AC-B10-03用于并发版本。补齐PAC-RP10-02和TASK-RP10-T02。
D-S01-07在来源状态未变时condition=false；RP09-T01是联合验收依赖，不能阻止独立修复。未执行的PC03联合场景如实NOT_RUN。

五、RP04-T02返工与验收

在normalize和ORM前检查顶层name/type/subtype/positioning/引用/isDraft/date的原始标量类型；metadata保持原JSON合同。
依据已有DTO、实际客户端及schema记录空值和日期边界；保留合法中文/string兼容，不发明经理、成员或日期业务政策。
先证明合法聚合201，再验证至少：subtype对象、type数组、boolean日期明确400；覆盖其他允许标量字段的对象/数组非法形状、无效枚举和无效日期。
失败前后核对真实project/member/phase/task/milestone、sequence、audit、receipt，不留非法新增或编号推进。保持嵌套task/milestone类型保护。
复验原聚合故障注入、同key重试和回放；原B18事务保护不能回退。TASK-RP04-T02补齐；PC03/RP09联合结果单独记录，不因局部通过关闭RP04整包。

六、RP02-T01和RP08-T01补验

RP02：先真实认证成功，再补disable/login双方向确定性屏障，并明确操作线性化点；不能把已先完成的合法登录一概要求失败。核对HTTP响应、真实用户状态、refreshToken和audit。覆盖ACTIVE/PENDING_ACTIVATION/LOCKED/DISABLED、阈值、锁内正确/错误密码、到期恢复；锁内错误密码不得继续累加或延长当前锁期。保留激活/禁用/手工锁语义，不顺带修改refresh/family、等级或强制改密政策。带审计关联的合成actor保留到整库drop。
RP08：实际执行成员/非成员、VIEWER、SUPER_ADMIN/elevated、零权限夹具；逐个同步实体核对系统读权限、项目范围、reports own-only及字段允许/拒绝清单，对照当前普通API合同。不得只创建VIEWER数据却不执行其请求。先有真实行和合法成功，再判断拒绝；不能以空库或401替代。明确真实JWT与注入actor各自覆盖范围。D-S01-05普通同步范围NOT_APPLICABLE，condition=false；缓存撤权清理、历史回填和IDB合同仍属于RP08-T02，不能凭服务端测试关闭。
无证据支持业务变更时只补测试。必需环境缺失记ENV_BLOCKED；未运行记NOT_RUN，继续其他独立任务。

七、隔离与验证纪律

运行前检查dotenv加载、连接目标、DB guard、自动build、子进程、fixture和cleanup。只用唯一新建且确认自有的本机临时PG、合成账号及自有文件/browser资源，不复用旧固定审计库，不绕过guard，不读取真实凭据。
可用当前已有前端TypeScript 5.9.3经PATH供后端构建；不得安装依赖。缺fake-indexeddb时记录前端运行ENV_BLOCKED。
每项先合法认证/权限/成功夹具，再负例和并发；真实DB/IDB/file要求不得用mock替代。注入actor不算完整JWT验收；只在隔离DB或测试注入层设置屏障，不给生产代码增加测试绕过入口。
保留精确命令、退出码、去敏日志、源码hash/diff、实际持久状态和清理证据。新失败保留旧日志，修原因，不能削弱断言凑PASS。
逐任务运行定向回归；结束运行受本次变更影响的现有测试和构建/类型检查。共享报告路径变化须覆盖既有回放/CAS/状态相关测试；无新变化或失败依据不反复重跑全部历史306条场景。
仅清理明确自有资源，保留未知dist/进程/数据库。身份或所有权不明停止该项动态操作。

八、交付、状态与停止

每任务新run目录建议：execution/RPxx/<taskId>/runs/<唯一codebuddy-run-id>/。
每项交付authorization.json、change-summary.md、evidence/、acceptance.json、rollback.md、task-state.json、handoff.md。
同步IMPLEMENTATION_STATE、TASK_GRAPH、PACKAGES、FINDING_TO_PACKAGE、ACCEPTANCE_MATRIX、两级handoff及54任务汇总中必要运行字段；维护两份revision history及文件摘要。
保留306原case ID/定义/门禁，不把相似测试映射错ID。PASS/FAIL/NOT_RUN/ENV_BLOCKED按完整适用场景记录；局部通过另列已覆盖/未覆盖，不写PARTIAL或把静态交付当产品PASS。不适用说明condition=false及精确范围。
SUPPORTED不等于FIX_ACCEPTED，反例成功不等于修复验收；task通过不等于整包完成。缺必需验收不能恢复整体PASS；未经目标验收release仍NOT_EVALUATED。
本次只更新四项及必要记录；保留其他任务门禁，不关闭全部33历史记录/31开放项，不代签决策。
有任务受阻时保存具体原因及解除条件，继续四项中无依赖冲突的任务。上下文/额度不足先落盘精确接续读序和真实状态，不编造COMPLETE。
四项完成或各自有明确阻碍后，重新统计全54任务，仅给出后续就绪建议，停止本次实现，供独立审阅。
最后按顺序汇报：各任务及整包状态；LR2-01至05和旧发现处置；实际文件变化；实际验证及限制/清理；新run及handoff链接；54任务统计与剩余门禁。
请实际执行，不要只回复计划。
```
