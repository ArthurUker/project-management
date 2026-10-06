# RP08-T01 补验（LR3-02）— 普通 API 合同对照、非空成功、墓碑与增量

- 任务：RP08-T01（VALIDATION_ONLY，**未改任何业务代码**）；复核发现：LR3-02（P2）；关联历史发现：B04
- 执行者：CodeBuddy；日期：2026-10-03（session 2026-10-03b）；run：2026-10-03-codebuddy-lr3-validation
- 门禁：D-S01-05 普通范围 condition=false → NOT_APPLICABLE；T-RP-04 / T-RP-12 未批准，AC-B04-02 与 PAC-RP08-02/03/04 仍属 RP08-T02

## 复核缺项与本轮处置

| 复核指出 | 本轮处置 |
|---|---|
| 没有普通 API 的成对请求/拒绝/字段合同对照 | 新增 `read-contract-matrix.csv/.md`（七实体，逐条给出普通 API 入口/权限/作用域来源/字段来源行号 + sync 映射行号 + own-only + 墓碑 + 增量时间戳），并新增 B1 成对请求：同一真实行、同一 actor，带权限时普通 API 200 且返回该行、同步也投递；去掉该权限后普通 API 403、同步该实体 upserts/tombstones 为空 |
| 只测 VIEWER 造数据 | B1b 实际撤销成员资格（leftAt）：普通 API 404、同步 acl.projectIds 移除该项目的全部实体 |
| "已批准字段清单"无独立来源 | 矩阵以来源为**当前普通 API 实现 + 当前 sync 实现**对照，并显式声明这不是批准来源；字段级授权缺少独立合同来源，按缺口登记 |
| SUPER_ADMIN own-only 用空集合断言 | B2 为 SUPER_ADMIN 创建本人真实报告：同步 reports 恰好非空且只含本人报告；同一时刻普通 API 对该项目仍返回全部作者 → 证明 own-only 是同步的额外限制 |
| 无墓碑成功夹具 | B3 为 tasks/milestones/projectPhases/monthlyProgress/reports 建真实 deletedAt 墓碑、为 projectMembers 建 leftAt 墓碑：带权限时墓碑 ID 被投递；零权限时 upserts 与 tombstones 均为空且响应体不含任何墓碑 ID；非成员时全部实体（含墓碑）不可见；reports 墓碑同样受 own-only 约束 |
| 服务端 pull 增量入口未补验 | B4 使用当前真实入口 `GET /api/sync/init?since=<cursor>&deviceId=<自有设备ID>`：先全量取 cursor 作切点，切点后做真实任务更新与里程碑软删，增量返回该任务新值与该墓碑，且切点前未变更的阶段不再投递 |

## 实际文件变化

- `rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`：新增 5 个用例
  （B1、B1b、B2、B3、B4、B5 共 6 个 test 块）与 helper（`apiGet` / `pullWith` / `collectIds` / `rowIdsOf` / `ORDINARY_PAIRS`）；既有 5 个用例全部保留 → 合计 11。
- 本 run 目录新增 `read-contract-matrix.csv`、`read-contract-matrix.md`。
- 业务代码（sync.js、普通 API 路由、前端）：**零改动**。

## 覆盖边界与限制

- 身份为注入可信 actor（真实 DB 合成用户行），不是完整 JWT 链验收。
- 未运行前端 IndexedDB；未实施也不评估 RP08-T02 的缓存撤权、历史回填与水位政策。
- 字段级授权在当前代码中没有独立批准文档（只有路由级权限与 select 形状），本轮按当前实现对照并登记缺口，
  不发明新字段规则、不要求普通 API 与同步整体 JSON 相等。
