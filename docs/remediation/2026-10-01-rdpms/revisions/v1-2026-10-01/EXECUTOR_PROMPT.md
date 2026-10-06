# 未来实施提示词模板

此模板只有在用户明确启动实施并指定范围后使用。当前任务仅规划，不能因读取模板而开始修复。

```text
请按RDPMS详细修复计划执行指定范围：<用户批准的RP包或子任务>。
仓库：/Users/renkang/VS Code/project-management
计划目录：docs/remediation/2026-10-01-rdpms/
审计基线：138cf2da1b63195cef7e884f69bdf8ded6ed3c21

先完整读取REMEDIATION_PLAN.md、IMPLEMENTATION_STATE.json、HANDOFF.md、
所选PACKAGES任务卡、DECISIONS_AND_GATES.md、OPEN_ITEM_GATES.json，
再读对应原R/S报告和源码锚点。保护未提交审计文档。

先执行对应RP00准备：核对当前HEAD/工作区/输入摘要；有变化只分析该包增量。
登记actor、批准规则、scope、客户端/schema兼容、隔离所有权和停止条件。
S03-OI-03恢复合同是RP09/RP12的静态前置，S03-OI-09完整revision矩阵
是RP10启用strict CAS的静态前置。不能以原包COMPLETE跳过。

规则未裁定只推进不依赖它的子任务。不得自行更改M-1角色/seed，
不得自动认领无owner旧IDB行、清理历史异常、重新计算旧manifest或
把候选R12-N01算成已确认缺陷。

只实现批准的包和文件。新增模块/测试/migration路径在包设计记录中明确。
数据库/浏览器/文件实验用合成数据和自有临时资源；先确认dotenv和子进程
不连接真实环境，不直接运行旧固定DB审计脚本。

验收以实际DB/IDB/文件状态为准，反转原缺陷断言。
同key/CAS/快照用确定性barrier，不用随机sleep证明并发正确。
每用例填写PASS/FAIL/NOT_RUN/ENV_BLOCKED；未运行不算通过。
保留scope/事务/receipt/审计/owner/cursor协议的兼容和rollback证据。

产物写计划目录execution/<RP包>/，至少change-summary.md、acceptance.json、
evidence/、rollback.md及handoff。更新IMPLEMENTATION_STATE时区分实现、
本地验收、目标环境、merge/deploy和生产观察；不擅自关闭旧审计finding。
本次实施授权不自动包括commit/push、生产迁移、部署、数据清洗或恢复。

回报：所选范围实际完成情况→关联finding验收→差异/证据→未决门禁→
兼容与回滚→产物→下一就绪范围。
```
