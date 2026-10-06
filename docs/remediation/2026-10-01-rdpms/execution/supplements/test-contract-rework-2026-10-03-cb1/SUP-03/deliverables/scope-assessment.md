# 阶段范围 vs 原 B20 项目级范围（SUP-03 / LR5-03，只读）

## 1. 原定义引用（逐字）

| 编号 | 类型 | 原文 |
|---|---|---|
| `B20` | 发现（FINDING_TO_PACKAGE.json） | 「软删除项目仍进入普通项目列表和统计过滤范围」；`primaryPackage: RP04`；`sourceAnchors`：`projects.js:107-161`（project list where）、`projects.js:633-652`（project statistics where）、`projectAccess.js:21-28`（detail access rejects deleted project） |
| `AC-B20-01` | FIX_ACCEPTANCE | “Soft-deleted projects are absent from list, total count, search and ordinary statistics.” |
| `AC-B20-02` | FIX_ACCEPTANCE | “Detail continues returning not found for deleted projects.” |
| `AC-B20-03` | FIX_ACCEPTANCE | “Dedicated recycle-bin query, if present, remains explicit.” |
| `PAC-RP04-03` | PACKAGE_COMPLETION | 「软删项目在普通 list/count/search/stats 均不出现，详情与专用回收策略一致。」 |

## 2. 范围判断

| 判断 | 结论 | 依据 |
|---|---|---|
| 原 B20 / AC-B20-01~03 / PAC-RP04-03 是否覆盖“阶段实例过滤” | **否**。全部措辞限定为 **项目（project）** 的 list / count / search / stats / detail / 回收站 | 上表原文 |
| 能否自动把 B20 扩大为「全部阶段实体过滤」 | **不能**。这属于范围扩大，需要新的具名批准 | 本轮为 REVIEW_ONLY，无批准授权 |
| 能否因“普通阶段读取返回软删行”重新打开 B20 | **不能**。B20 的项目级条件（list/count/search/stats/detail）与阶段实例读取不是同一范围；当前未发现项目级条件被破坏 | 同上；本轮未运行项目级验收 |
| 项目 scope 对阶段是否仍生效 | **是**。所有阶段读取入口都经过 `resolveProjectAccess`，项目软删或非成员 → 404 | `projectAccess.js:21-28`；`phases.js:36/96`；`projects.js:817` |
| 阶段过滤政策 | `CONTRACT_UNRESOLVED`：没有具名批准来源规定普通阶段读取必须过滤 `deletedAt` | 本轮定向读取未发现批准来源 |

## 3. 已批准 / 当前实现 / 测试期望 / 建议（分开登记）

| 维度 | 内容 |
|---|---|
| 已批准合同（有来源） | 项目级软删：`AC-B20-01/02/03`、`PAC-RP04-03`（原文见上）。同步侧墓碑语义由 `sync.js` 实现支撑（属当前实现，不是独立政策批准） |
| 当前实现 | 普通阶段列表/详情不过滤 `deletedAt`（`projects.js:341/820-823`、`phases.js:39/45-49/94`）；同步侧活跃行与墓碑分离（`sync.js:428-469`） |
| 测试期望 | `rp08` B3 用例期望：带权限时墓碑 id 出现在 `tombstones`；无权限时不得泄漏；普通活跃视图不含软删 task/member（该用例未对阶段普通视图做过滤断言） |
| 建议 | 见 `next-action.md`；只给有证据的选项，不写业务 patch，不创建/激活实施任务 |

## 4. 本轮未做（如实登记）

- 未运行项目级 B20 验收（list/count/search/stats/detail）→ `NOT_RUN`。
- 未运行任何阶段 API 动态探针或浏览器/UI 验收 → `NOT_RUN`。
- 未重开 B20、未把 B20 改成阶段规则、未修改 `projects.js` 的过滤行为。
- 未引用旧 session 的动态证据替代本轮结论；本项全部为静态核对 + 原计划定义引用。
