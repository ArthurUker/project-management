# SUP-01 变更摘要（TEST_ONLY，业务源码零改动）

- 父任务：RP10-T02（LR4-01 / B10）
- 模式：TEST_ONLY —— 仅修改白名单测试文件 `tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
- 执行日期：2026-10-03，本地隔离（自有 loopback PostgreSQL + 唯一 guard 认可测试库）

## 改动内容（全部为测试增量，未触碰业务源码）

1. 新增通用屏障 `gateOnReportMethods(base, methods, matches, { emulateUpsert })`（行 762-816）
   - 支持同时拦截 `create / upsert / updateMany / update` 多种写入原语，按业务唯一键 + payload 匹配；
   - 只拦匹配的一次，不拦竞争赢家或 submit，保留事务 options 透传；
   - `emulateUpsert=true` 时，对匹配的迟到 `create` 在**测试 DB 适配层**转成真实 Prisma 无条件 upsert
     （`where = projectId_authorId_reportType_periodKey`），业务源码、其他请求与 submit 完全不变。

2. 新增 `test('RP10 LR4-03 SUP-01-01 ...')`（行 818-865）
   - 用多原语屏障拦截 POST 新建的 `create`；屏障命中后竞争者先创建并提交；迟到请求被既有唯一键
     控制为 `409 DUPLICATE_PERIOD_KEY`，已 SUBMITTED 正文不被覆盖，无成功回执、无第二条 create 审计。
   - 证明屏障到达真实 ORM 写入窗口且与原语替换无关（覆盖 create/upsert/updateMany/update）。

3. 新增 `test('RP10 LR4-03 SUP-01-03 SEMANTIC_NEGATIVE_CONTROL ...')`（行 867-930）
   - 语义负对照：仅把匹配的迟到新建在测试适配层转成真实无条件 upsert；竞争者先创建并提交；
   - 断言确认坏结果：迟到请求 `201`、已 SUBMITTED 行正文被迟到写入覆盖（≠ ReportVersion 版本快照）、
     多出 1 条成功回执、多出 1 条 create 审计。
   - 该控制证明测试能识别坏结果；exit 0 仅表示"已确认预期坏结果"，不是修复或发布 PASS。

## 保留项
- 原有 A01–A06b 全部保留且断言不变；整个报告正式套件一并运行。
- 不要求五项旧控制全部复现，不临时回退业务源码。

## 验证
- 运行器：`run-suite.py`（本 session 新建）；自有 cluster + guard check/reset + build + node --test + cleanup。
- 结果：`19/19` 通过（原 17 + 新增 2）。详见 `evidence/run-reference.md`。
