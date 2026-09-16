# 第四轮测试结果（2026-09-16）

所有命令均在仓库内执行；数据库一律为**专用隔离测试库 `rdpms_test`**（未写入 rdpms_drill 与生产库）。

| 命令 | 结果 |
|---|---|
| `cd rdpms-system/backend && node scripts/check-undefined.mjs` | `no undefined identifiers in 52 file(s)` |
| `npm test`（= test:unit + test:contract） | **68 通过 / 0 失败**（62 单元 + 6 契约） |
| `npm run test:integration`（真实 PostgreSQL：rdpms_test） | **31 通过 / 0 失败 / 0 跳过** |
| `cd rdpms-system/frontend && npm test` | **25 通过 / 0 失败**（含 5 条真实 IndexedDB 用例） |
| `npx tsc -b`（前端类型检查） | 0 错误 |
| sync E2E `RDPMS_E2E_DB=rdpms_test BASE=http://127.0.0.1:3214 python3 deploy/scripts/drill/sync-e2e.py` | **21/21 PASS** |

## 本轮新增/关键用例

- 后端单元：`rf04-entry-matrix`（9 条）—— v2 缺基线 400、已审阅/实验数据无基线 409、
  兼容路径审计留痕、删除权限独立（milestones/projects）、状态与指派权限分别校验。
- 后端集成：RF04-I7 相同基线两路并发写（仅一个 applied，另一个 conflict，后写者未覆盖）、
  RF04-I8 汇报基线冲突、RF04-I9 缺实体权限不落库。
- 前端真实 IndexedDB：F10-I1..I5 —— 同一事务迁移、刷新恢复、重复拒绝不丢内容、
  跨账户隔离、退出登录后重新登录恢复。
- 幂等 payloadHash：`rf02-idempotency.test.mjs:110` 与 `rf02-idempotency.integration.test.mjs:165`
  持续保留「同 key 不同 payload → 409 IDEMPOTENCY_PAYLOAD_MISMATCH」。

## 未通过/未运行（如实记录）

- RF03 浏览器交互验收：**未运行**（缺浏览器驱动环境），RF03 各项仍为「代码与服务测试通过、交互待验收」。
- 生产/演练环境部署、压测、恢复演练：**未运行**（本轮授权不含生产）。
