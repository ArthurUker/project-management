# RP04-T02 返工 — 项目创建顶层原始类型检查

- 任务：RP04-T02（REWORK）；复核发现：LR2-02（P2）；关联历史发现：B18
- 执行者：CodeBuddy；日期：2026-10-03；run：`2026-10-03-codebuddy-b18-rework`
- 源码基线：HEAD `138cf2d` + 本轮开始前工作区未提交改动
- 门禁：无适用实施门禁；不触发/不激活 D-S01-06（不改经理/成员产品策略）；RP09-T01 仅验收依赖

## 缺陷（LR2-02 复述）

已授权 `POST /api/projects` 顶层字段缺原始类型检查：
- `subtype: {…}` → Prisma 校验异常 → **500**（无项目行）；
- `type: ['TESTING']` → `String(['TESTING']) === 'TESTING'` 被静默接受 → **201** 并落库 TESTING；
- `startDate: false` → `new Date(false)` → **201** 并落库 1970-01-01。

## 实际改动（仅 `rdpms-system/backend/src/routes/projects.js`）

新增三个函数并在 `validateProjectCreateCommand` 最前面（normalize/ORM 之前）调用 `assertTopLevelProjectScalars(raw)`：

- `assertTopLevelScalar(value, field)`：顶层字符串字段（`name` / `type` / `subtype` / `positioning` / `managerId` / `templateId`）必须是 `string`，`undefined` / `null` 放行（null 语义由既有必填与枚举校验处理），其余一律 400 `VALIDATION_ERROR`。
- `parseTopLevelDate(value, field)`：顶层 `startDate` / `endDate` 必须是字符串日期（`null` / `''` 仍为"未设置"），boolean / number / object / array 一律 400。复用既有 `parseOptionalDate` 做格式校验，不新增日期业务规则。
- `assertTopLevelProjectScalars(raw)`：上述两项 + `isDraft` 必须为布尔（与既有文案一致）。

未改动：嵌套 `tasks` / `milestones` / `participantIds` 的既有标量检查、枚举与引用检查、`metadata` 的 JSON 合同（不加新约束）、经理/成员/编号/事务/审计/回执逻辑。

## 登记的类型边界（按当前实际调用）

- 日期：前端与 API 契约使用 ISO 字符串（`'2026-10-02'` / `toISOString()`）或 `null` / `''`；**数字 epoch 不在当前契约内**，本轮按非法标量拒绝（避免 `new Date(0)` 静默成 1970-01-01）。若后续确需支持 epoch，需另行批准并更新 DTO 与前端类型。
- `type`：`null` 仍按既有逻辑 400（"项目类型无效"）；中文旧口径（如 `测试`）仍可，`normalizeProjectType` 行为未变。
- `metadata`：仍按 JSON 透传，本轮不校验内部形状。

## API / schema / 兼容影响

- 无字段、无结构、无迁移变化。
- 行为变化仅针对此前会 500 或会静默强制落库的非法输入：现为 400 `VALIDATION_ERROR`（含 `field` 定位）。合法请求（含中文类型、字符串日期、空值）行为不变。
- 失败请求不推进 `CodeSequence`、不产生项目/任务/阶段/里程碑行、不写审计、不留回执（既有事务保证 + 本轮前置校验共同确保）。
