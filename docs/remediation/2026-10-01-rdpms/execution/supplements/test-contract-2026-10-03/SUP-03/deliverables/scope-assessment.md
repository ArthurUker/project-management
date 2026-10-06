# 范围评估（SUP-03）

## 已覆盖（定向）
- 阶段读取入口：projects.js:814-825、phases.js:31-51/92-99（含权限、项目 scope、ORM where、deletedAt 行为）。
- 阶段软删写入入口：phases.js（无 DELETE 路由）、sync.js:596-609（op:'delete' → deletedAt，需 project_phases.delete）。
- 同步读取：sync.js:428-469（aliveFilter / tombstones）。
- 恢复路径：sync.js:617+（upsert 不清除 deletedAt）→ 不可达。
- 前端消费：projects.ts:39。
- 合同分类：已批准（同步软删）/ 当前实现（普通 API 泄漏、前端消费）/ CONTRACT_UNRESOLVED（读取过滤缺失、恢复不可达）。

## 未覆盖（明确排除）
- 其他实体的软删读取/写入/恢复（任务、里程碑、进度、汇报、成员、项目）—— 仅阶段。
- 全仓或全实体软删审计 —— 未扩大。
- 权限矩阵完整性与角色继承 —— 仅确认 project_phases.view / .delete 在相关入口被校验。
- 历史审计、v1、旧 run、旧 review、旧合同矩阵 —— 保持冻结，仅引用不重做。
- 真实数据库 fixture 构造阶段软删行（如 B3 模式）属于测试侧，不在本只读核对范围外展开。

## 风险/残留
- 普通 API 阶段列表返回软删行，可能被前端展示（CURRENT_IMPLEMENTATION）。
- 恢复不可达：一旦经同步 push 软删，普通 API 与同步均无恢复路径（需产品决策）。
- 上述均非本轮可改（REVIEW_ONLY），已移交独立审阅与产品决策。
