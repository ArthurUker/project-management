# CodeBuddy 三项补充交付独立审阅 — 2026-10-03

## 裁定

**不接受“三项全部完成并验证通过”的整体交付结论。三项补充工作均需要有界补交。** 已完成的真实数据库测试和有效断言保留；本次不是业务修复失败裁定，不重新打开此前接受的RP10-T02/RP08-T01/RP02-T01业务实现。

本轮独立使用两个全新自有PostgreSQL库重跑当前正式套件：报告19/19、同步12/12；build、typecheck、lint:undefined、git diff --check均0。真实SQL语义负对照确实检测到坏结果；七实体精确行/键/值对照确实执行。局部PASS不能证明未执行的屏障原语、同账号撤权、阶段调用者和交付完整性要求。

补充状态：SUP-01/SUP-02/SUP-03均IN_PROGRESS，完整validation为NOT_RUN（要求尚缺），release均NOT_EVALUATED；局部已运行PASS范围见validation-summary.json。原54任务及306验收结果不改，原三个业务任务的本地COMPLETE/PASS不改。

## 1. LR5-01 / P2：SUP-01屏障与失败收束未完成

原正式测试的前746行与执行prompt基线逐字节相同。A02/A03/A03b仍调用只拦create的gateOnReportMethod；A06b仍只拦updateMany。新增gateOnReportMethods只被新增create场景使用，控制内的upsert是create屏障触发后直接调用真实model.upsert，不能证明upsert/updateMany/update分别触发了该屏障。

原A06b的赢家只完成恢复，没有submit后再释放迟到恢复；不等于本轮规定的“恢复并提交先完成”场景。新增两项也没有try/finally释放和等待pending请求；若屏障后断言/竞争请求失败，未保证收束。相关位置：报告测试379、477、522、557、722、818、867。

已有保护：当前无行create竞争409、正文/版本一致、迟到receipt=0；真实语义控制201、正文≠版本、多receipt和create审计，均独立重跑通过。不得把这些缺口改写成已证明的业务回归。

补交：仅在原报告测试内迁移相关旧屏障到同一受控匹配边界，明确旧/新参数形状，补恢复→submit→迟到恢复和异常finally收束；保留原断言与一个语义负对照。不修改业务源码或回退源码。

## 2. LR5-02 / P2：SUP-02同账号撤权未固化，字段表错误

新增用例的成功身份为member；负例改成fixtures.users.zero。这是另一个真实账号，项目角色和报告作者身份也变化；能够证明零权限账号拒绝，不能证明同一合法账号仅失去目标读取权限时拒绝。

相同行七实体键和值比较是真实且通过的。问题在拒绝对照和交付表：field-comparison.md把projects.code/templateId、milestones.completedAt、monthlyProgress.submittedById、reports审阅字段列成禁止字段，但当前套件的允许字段和成功同步响应含这些字段。“示意”不能使矛盾清单成为有效证据。读投影字段与客户端禁止写入字段必须区分。缺少要求的CSV、目标ID、字段数、来源行号和精确case/log映射。

补交：保持成功actor的userId/systemRole/成员资格/报告归属不变，仅移除目标权限；精确表格按实际读投影和实际观测生成。不得为了匹配错误表格去修sync、权限或普通API。

## 3. LR5-03 / P2：SUP-03阶段合同与直接调用者核对不足

遗漏本轮指定范围中的两条读取路径：

- projects.js:341，GET /api/projects/:id中的phases聚合未过滤deletedAt。
- phases.js:45，无projectId的全局阶段列表。

frontend/src/api/endpoints/projects.ts:39只定义请求封装；定向搜索未找到该phases访问器的直接调用，不能据此证明页面显示软删阶段。实际ProjectDetail.tsx:51调用projectAPI.get；页面传template/tasks给PhaseProgressBar（约198行），组件40行读取template.content.phases。实例ProjectPhase列表、模板阶段和实际UI结果不能混为同一来源；没有浏览器验收。

scope-assessment没有引用原B20定义作范围判断。当前AC-B20-01/02/03和PAC-RP04-03针对软删项目列表、统计、详情等，不能自动扩大为全部阶段过滤，也不能据普通阶段视图例外重新打开B20。phases.js无“阶段资源DELETE”成立，但文件194行有“阶段流转边DELETE”，不能笼统说文件无DELETE路由。同步墓碑实现可从源码核对，独立政策“已批准”需有来源，不能用当前模式代替。

补交只读入口/直接客户端/原合同表和证据分级，保留CONTRACT_UNRESOLVED与UI NOT_RUN。当前只确认有权限阶段普通读取返回软删行；没有证明越权、实际页面显示或本轮新业务回归。不得实施阶段过滤、恢复功能、前端、schema或迁移。

## 4. LR5-04 / P2：交付摘要、编号与验证证据不完整

- SUP-01应映射LR4-03，交付错写LR4-01；SUP-03应映射LR4-02，LR4-04在原findings中不存在。LR4-01是此前台账漂移。
- 新历史sha256包含APPENDED_*、SESSION_DIR，占位内容不是hash；还包含历史文件自身项。currentSourceHashes不是逐文件映射。final-integrity称“readback一致”没有提供真正逐摘要比对。
- 没有保存规定的executor start-baseline/完整文件集/冻结快照及起始测试副本。来源文字称起点和终点一致不能补造当时证据。
- 7564dcf2…可通过“排序git hash-object SHA1行后SHA256”复现，但只涵盖跟踪源码，排除了两个既有未跟踪业务模块fileReadService.ts/projectCommands.ts。它不是整个业务文件集的历史起止证明。
- 执行者日志只记录build和两个套件，未见typecheck/lint:undefined/diff-check命令日志。本轮独立补跑均0，不能称执行者原先已运行。
- REVIEW_ENTRY的“其他51项STANDARD任务”不符合计划：原54任务中36项实施未完成，且不能按三个SUP从54相减。

已有保护与独立核对：17个prompt冻结计划输入hash保持；两state移除新增supplement后完整序列化hash等于此前封存版本；两handoff旧前缀及旧历史条目保持。两个正式测试仅追加，前746/608行逐字节保留。此前审阅的其他25个源码/测试摘要均不变，包括两未跟踪业务模块。未发现源码越界修改。

补交仅追加新run的真实摘要与纠正说明，不修改冻结旧记录；缺失的历史起始证据如实记录不可回补，不能倒填“启动已登记”。新运行先保存完整起始文件集/逐hash/冻结证据，再封终点并逐项读回。

## 5. LR5-05 / P2：新运行器失败清理仍可能中断

run-suite.py:85先drop再stop，drop执行抛异常就退出finally，stop和结果写入不执行；drop/stop退出码不影响最终只由suite结果决定的退出状态。79-80行成功build后才设built，失败build输出不保证清理。SUP-01 attempt-01只有initdb和server-started日志，无run-results/清理记录；附件中自报人工清理曾遗留集群，不能当作已记录失败清理链。

本轮只对finally控制流注入模拟drop调用异常，证实cluster-stop未被调用；没有注入真实数据库drop失败，不把模拟控制当真实DB验收。正常最终CodeBuddy运行与本轮独立运行的drop/stop均0。

补交：只复制并修正下一新run自己的runner；先校验路径再建集群、提前登记build所有权、隔离每个cleanup错误、保存所有结果、清理失败反映总体退出，不在stop失败时删除目录。冻结旧runner不改，不清理未知资源。

## 6. 实际范围、运行与冻结核对

本轮未修改业务、正式测试、依赖、schema、门禁或旧交付；新增独立审阅证据和运行器，向当前补充镜像追加独立裁定及handoff/history引用。

两个独立库每库guard check2→reset0→build0→suite0→typecheck0→undefined0→diff0→drop0→stop0，自有临时根和dist删除。当前174个业务源码文件（包含两未跟踪模块）起止完全相同；本轮冻结10个目录/506个文件无漂移。原CodeBuddy最终19/19、12/12日志核对一致；其失败attempt保留。

不覆盖完整JWT、前端IDB、阶段实际UI、候选/目标配置、批准政策、联合合同或部署。阶段新路径仅静态核对，无新阶段API动态验收。原业务发现和31历史开放项不关闭，全部release NOT_EVALUATED。

## 7. 接续

只完成缺失测试、文档与新run清理/摘要交付。继续使用两正式测试文件+新supplement目录+受控追加记录的窄白名单；不启动剩余36项业务任务、不增加批准。详见NEXT_EXECUTION.md、validation-summary.json和handoff.md。
