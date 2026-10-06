# 业务修复接续所需的最小决定与材料

此页用于负责人审查，不是批准，也不是实施授权。元数据订正可由原汇总窗口推进，负责人可同时审查以下材料；两者不写同一文件。所有方案PROPOSED、具名批准字段空，已部署/受支持范围不明的内容保留OPEN_INPUT。

## 优先审查T-RP-02：回执合同

来源：窗口C的decision-draft/approval-request；既有RP00-T02故障矩阵；本复核AG-05。

需要明确总体选项、唯一键精确作用域、payloadHash/命令版本、保留期和最大离线窗、兼容截止、清理责任人/频率，并明确：

- 事务提交前失败：同一命令的业务/必要审计/回执原子回滚范围。
- 提交后500/响应未知：不得推定未提交，按原actor/device/key/hash查询或原命令重放。
- 批次中断：已提交项保留，不承诺全批回滚；逐key结果、partial retry与最后副本保全。
- 当前授权和跨actor/device查无语义，以及delete条件范围的独立门禁。

推荐值24h、一个发版周期和OPT-A仍是建议。需后端/产品/运维具名决定及日期/证据。可能推进RP09相关任务，实际实施与验收依赖仍逐项核对TASK_GRAPH；不宣称一个批准解锁全部。

## T-RP-09：认证与会话

现有Bearer/body事实与将来single-use/family、跨tab协调、失败清理、generation fence及旧请求归属分别决定。需安全/认证/前端具名选择、受支持客户端/兼容窗及残余风险。D-S01-04的access JWT撤销仍是独立PENDING，不因本决定获批。相关RP02-T02/RP03-T01/RP11任务还需核对各自依赖；真实JWT链验收未做。

## T-RP-03 / S03-OI-09：客户端revision

需实际部署版本、产品声明支持版本、旧客户端基线能力和升级截止资料。源码矩阵不能代替外部清单。missing-base的具体状态码/错误码、legacy期限、field/status/assignee/bulk/offline整链范围需确定。E外部请求真实文件在window-e-revision/evidence/external-client-evidence-request.md。未满足材料和T-RP-03门禁前不能启动RP10-T01。

## T-RP-04 / T-RP-12：水位与用户可恢复流程

需数据库/架构负责人选择提交可见水位方案、覆盖全部producer、兼容schema/client与epoch/reset边界；需产品/数据/前端确定撤权、冲突、unknown、dead-letter、oversize/quarantine、最后副本保全、保留期限和多tabowner规则。已有本地barrier证据可以引用，不代表生产safe-watermark验收。T-RP-10/T-RP-11及相关RP11验收依赖仍单独判断；不激活未批准的RP13-T03。

## 外部材料

- S03-OI-09：部署/产品支持/升级截止证据。
- S04-OI-01/RP15-T01：数据所有者授权的只读快照；当前不访问真实数据。
- 候选/目标环境、JWT、前端IDB、多tab/UI与部署验收：后续按任务授权和隔离条件执行，当前未运行。

原统计：54任务18 COMPLETE/2 IN_PROGRESS/34 NOT_STARTED，36未完成实施；验证10 PASS/37 NOT_RUN/7 ENV_BLOCKED；306验收53 PASS/228 NOT_RUN/25 ENV_BLOCKED；发布全部NOT_EVALUATED。此页不更新原状态。
