# RP08-T01 补验 — 同步读权限逐实体/字段/own-only 矩阵

- 任务：RP08-T01（VALIDATION_ONLY，未改业务代码）；复核发现：LR2-04（P2 证据）；关联历史发现：B04
- 执行者：CodeBuddy；日期：2026-10-03；run：`2026-10-03-codebuddy-b04-validation`
- 源码基线：HEAD `138cf2d` + 本轮开始前工作区未提交改动（本任务**未修改任何业务源文件**）
- 门禁：D-S01-05 `condition=false`（未请求注册类项目全局例外）→ NOT_APPLICABLE；T-RP-04 / T-RP-12 未批准，RP08-T02 不在本任务内

## 复核要求与处置

| 复核指出 | 本次处置 |
|---|---|
| 仅一个 ADMIN member 与 outsider 实际调用，other VIEWER 只造数据 | 新增真实夹具：OWNER 成员、VIEWER 成员、非成员、零权限成员、SUPER_ADMIN（非成员）全部实际调用 `/api/sync/init` |
| 无 elevated 调用 | 新增 SUPER_ADMIN(elevated) 用例：可见非成员项目与其子实体 |
| 无正式零权限矩阵 | 零权限成员：项目在 `acl.projectIds` 内，但 7 个实体 upserts/tombstones 全部为空，`acl.permissions=[]` |
| 无逐实体普通 API 字段对照 | 7 个实体的字段键集合与禁止字段（`metadata`/`createdById`/`deletedAt`/`reviewerId`/`leftAt` 等）逐项断言 |
| own-only 需成矩阵 | 成员/VIEWER/零权限/SUPER_ADMIN 四种身份均断言"只返回本人撰写的汇报" |
| 需明确真实 JWT 与注入 actor 覆盖边界 | 已在测试文件头与本文件声明：注入可信 actor + 真实合成用户行，**非**完整 JWT 链 |

## 实际变更（仅测试文件）

`rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`：保留既有 1 个用例，新增
`SYNC_READ_MATRIX`（实体 → readPermission / 期望 readFields / 禁止字段）、`buildMatrixFixtures`、`actorFor`，以及 4 个用例：

1. 逐权限门禁：逐一授予 6 个 readPermission，断言只有对应实体有行、其余实体 upserts 与 tombstones 全空；
2. 字段投影：7 个实体的返回键集合与已批准 `readFields` 完全一致，禁止字段一律不存在；
3. 角色范围矩阵：member / viewer / outsider / zero / superAdmin 的 `acl.projectIds`、`acl.permissions`、`aclVersion` 与逐实体可见性；
4. elevated：SUPER_ADMIN 可见非成员项目与子实体，但 reports 仍 own-only。

## 边界与归属

- 同步读路径不写 elevated 审计（elevated 审计属在线读端点），本任务只断言可观察可见性，已在交付物与测试注释登记。
- 实体权限缓存清理与历史回填仍属 RP08-T02（T-RP-04 / T-RP-12），本任务未覆盖、未激活。
- D-S01-05 condition=false（未请求注册类项目全局例外），不写 PASS。
- 注入 actor ≠ 完整 JWT 链；前端 IndexedDB 与目标环境未运行。
