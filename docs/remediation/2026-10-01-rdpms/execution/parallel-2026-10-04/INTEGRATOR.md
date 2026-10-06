# 汇总窗口：全部工作窗口冻结后单独启动

先读COMMON_RULES、BATCH_MANIFEST及六窗口任务卡。模式默认SIX_WINDOWS；只有用户明确只运行A/B时使用TWO_FIX_ONLY，并将C～F明确NOT_STARTED，而非完成。

## 启动门禁与所有权

本窗口唯一新可写：`S/integration/`。另外只有本窗口可按下面范围追加六个根记录；工作窗口A～F均无此权限。
要求选定模式的各窗口已有READY.json，writerStopped=true，WORKER_MANIFEST逐文件读回一致。READY可真实BLOCKED/FAIL，汇总如实记录；缺READY/仍写入时记录WAITING_FOR_WORKERS后结束，不抢写根台账、不无限轮询。
不得修改或重跑任何窗口的runner/脚本/文件；它们hash漂移或结果FAIL则记录返工范围，不替其它窗口修。

## 固定汇总

1. 核对共同冻结源码/正式测试/配置/历史、各窗口ownership、manifest、退出证据/异常和状态，区别材料交付与业务批准/验收。
2. A的九模拟路径及B的strict path结果只做原证据/readback核对，不再运行真实DB/build/业务套件。保留报告25/25、同步12/12、101/101复用声明。
3. 汇总C～F待签材料到DECISION_PACKET_INDEX.md和approval-bundle.json：保留PROPOSED及null签名，精确链接原决定、推荐选项、外部输入与待批准范围。
4. 生成CROSS_WINDOW_CONFLICTS.md：actor/key/generation、receipt/水位/epoch/保留窗、missing-base/客户端范围、ACL/最后副本等接口若存在矛盾，记录冲突与负责角色，不自行选生产政策或改各窗口文档。无冲突也说明核对范围，不能自动APPROVED。
5. 只在S/integration写总change-summary、evidence、acceptance、rollback、task-state、handoff、REVIEW_ENTRY、resume。各窗口结果不同可部分通过，不能把A/B失败掩盖在材料完成里。

## 六记录唯一追加

根IMPLEMENTATION_STATE只追加supplementalExecutions.continuations[]；execution/state只追加supplementalExecution.continuations[]；两级handoff追加末节；两份history各追加唯一新订正entry。
先保存六记录真实起始字节，核对BATCH_MANIFEST基线；其它字段/旧continuation/entry/前缀保持，不改root activeTask/latestReviewRef/nextReadyTask/授权聚合、原54/306轴/包/决定/开放项。
订正entry准确引用旧lr6-closeout会话、两个registry条目位置/ID/规范化SHA，唯一新ID不得重复。准备窗口的完成不是原任务COMPLETE，也不新增31开放项关闭或批准。

## 固定封存顺序

a. 冻结全部worker输入；定稿integration交付、两个state及两级handoff追加。
b. 生成integration/payload-manifest.json：pathBase及relativePath一致，封存workerManifest/READY、integration静态产物和四个非history最终根记录；旧519文件引用B的严格订正映射，历史snapshot与当前根记录分开。
c. 生成final-integrity.json，排除自身、两history、post-seal-readback，不嵌入history最终hash或正在变化的文件。
d. 两份history各追加唯一订正entry，引用定稿manifest/final-integrity及worker结果；无自身/交叉history最终hash。
e. 生成预先排除的post-seal-readback，严格依声明base校验每路径/hash、旧六记录保持、新ID唯一、全部worker未漂移，记录最终history真实hash。失败不得overallPASS；只修本窗口未完成新交付，禁止改任何冻结worker/旧entry。
f. 读回后停止编辑，交付独立审阅，independentReview=PENDING、release=NOT_EVALUATED。

不需要重复独立审阅或修改代码。最后统一报告A/B处置、C～F材料状态、跨包冲突/缺输入、真实证据层次、冻结清理、原36未完成任务及最小批准清单，然后停止。
