# Resume — test-contract-2026-10-03

## 已完成（待独立审阅）
- SUP-01（RP10-T02 TEST_ONLY）：报告并发屏障加固 + 语义负对照；rp10 套件 19/19。
- SUP-02（RP08-T01 TEST_ONLY）：七实体精确行/字段键-值对照；rp08 套件 12/12。
- SUP-03（RP04/RP08 REVIEW_ONLY）：阶段软删合同只读核对，无代码改动。

## 未决事项（需独立审阅 / 具名批准）
1. 阶段读取是否过滤 deletedAt（projects.js:820、phases.js:39 当前未过滤）—— 需产品/安全决策。
2. 阶段软删恢复是否应 API 可达 —— 当前无恢复路径（phases.js 无恢复端点，同步 upsert 不清除 deletedAt）。
3. 前端对软删阶段的去重（projects.ts:39 直接消费泄漏列表）。
4. 发布保持 NOT_EVALUATED；原包/发现未关闭。

## 最小授权请求（范围外，需显式批准）
- 若需修复阶段读取泄漏或恢复能力：需产品/安全/数据门禁具名批准，并新增/调整迁移、权限、前端与合同矩阵；不属于本轮 TEST_ONLY / REVIEW_ONLY 授权。

## 继续原则
- 本轮不扩大为其他 STANDARD 任务；三项补充完成后停止等待独立审阅。
- 既有 51 项任务各自需精确审批/材料/资源条件，未在本轮执行。

## 复跑指引
- 运行器：`execution/supplements/test-contract-2026-10-03/run-suite.py`
- rp10：`python3 run-suite.py SUP-01/runs/rp10-suite tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
- rp08：`python3 run-suite.py SUP-02/runs/rp08-suite tests/integration/rp08-sync-read-authorization.integration.test.mjs`
- 前置：本机 `/opt/homebrew/bin/{initdb,pg_ctl,psql}` 可用；frontend 已装 typescript（build 由 PATH 复用）。
