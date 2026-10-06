# RP04-T02 返工 handoff — 2026-10-03

## 完成内容

- `projects.js` 顶层标量在 normalize/ORM 之前受控检查：`name/type/subtype/positioning/managerId/templateId` 必须是字符串；`startDate/endDate` 必须是字符串日期（`null`/`''` 仍为未设置）；`isDraft` 必须是布尔。
- 新增 2 个用例：合法顶层输入（含中文类型、字符串 subtype/positioning、ISO 日期）201 且真实落库；12 种非法顶层输入（subtype 对象/数组、type 数组/对象、name 数组、positioning 对象、managerId 对象、isDraft 字符串、startDate/endDate 布尔、startDate 对象、startDate 数字 epoch）全部 400，且 CodeSequence、project、task、phase、milestone、audit、receipt 计数不变。
- 套件 5/5 通过；反例对照：禁用顶层检查后 `subtype` 对象回到 500（与 LR2-02 复核反例一致）。
- 定向回归（各自独立库）：rp04-project-snapshot-active、rp07-project-status-shared、rp05-parent-delete-guard、b17-role-create 全通过；typecheck 与 `node --check` 通过。

## 限制

- 注入可信 actor，不是完整 JWT 链；仅本地自有 PostgreSQL；未做目标/候选环境或部署验收。
- release NOT_EVALUATED；未提交、未部署。
- 嵌套 task/milestone 既有标量检查未改；`metadata` JSON 合同未加约束。

## 遗留

- INT-PC03-01（PC03 联合回执/审计）NOT_RUN，依赖 RP09-T01。
- 数字 epoch 日期已按"非当前契约"拒绝并登记；若产品需要支持，须批准并同步 DTO/前端类型。

## 下一就绪任务

RP02-T01 补验（LR2-04 / B14），随后 RP08-T01 补验（LR2-04 / B04）。
