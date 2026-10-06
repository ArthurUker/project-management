# RP04-T02 input-order rework — 2026-10-02

关联LR-04及旧B18。改动范围仅 `backend/src/routes/projects.js` 和 `rp04-project-create-aggregate.integration.test.mjs`。

在 normalizeTaskInput 之前校验嵌套任务字符串字段、sortOrder/phaseOrder以及dueDate输入类型。对象/数组/数值applicability、applicabilityStatus、status、priority、title等现在以400 VALIDATION_ERROR拒绝，而不会进入 `.toUpperCase()` 或ORM。保留允许的字符串枚举、默认值、任务事务和源状态规则。

新增真实HTTP/DB负例，核对项目、任务、阶段和里程碑行数不增加；原合法聚合、相同key回放及任务/序列/审计/receipt注入故障回滚用例继续通过。无迁移、schema、依赖或PC03合同变更。
